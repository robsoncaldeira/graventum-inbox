import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { parseWebhook } from '@/lib/gupshup'
import { canonicalPhone, phoneVariants } from '@/lib/wa'

// Recebe callbacks do Gupshup (inbound + status). Configurar no painel Gupshup como:
//   https://graventum-inbox.vercel.app/api/webhook/gupshup?token=<GUPSHUP_WEBHOOK_TOKEN>
export const dynamic = 'force-dynamic'

const OPT_OUT_KEYWORDS = ['sair', 'parar', 'pare', 'stop', 'cancelar', 'descadastrar', 'nao quero', 'remover']

function isOptOut(text: string): boolean {
  const t = text.trim().toLowerCase()
  return OPT_OUT_KEYWORDS.some((k) => t === k || t.startsWith(k + ' ') || t === k + '.')
}

/** Busca lead_id pelo telefone, tentando variacoes com/sem o 9 (BR). */
async function findLeadIdByPhone(db: ReturnType<typeof getSupabase>, phone: string): Promise<number | null> {
  const phones = phoneVariants(phone)
  const { data, error } = await db
    .from('graventum_commercial_leads')
    .select('id')
    .in('whatsapp', phones)
    .limit(1)
  if (error) {
    console.error('[findLeadIdByPhone]', error)
    return null
  }
  return data?.[0] ? Number(data[0].id) : null
}

export async function POST(req: NextRequest) {
  // 1. Valida token do callback (query string — o Gupshup nao envia header custom).
  const expected = process.env.GUPSHUP_WEBHOOK_TOKEN
  if (expected && req.nextUrl.searchParams.get('token') !== expected) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ ok: true }) // ignora corpo invalido, sem retry
  }

  const evt = parseWebhook(body)
  const db = getSupabase()

  try {
    if (evt.kind === 'status') {
      // Atualiza status do outbound correspondente (queued -> sent -> delivered -> read / failed).
      if (evt.messageId && evt.status) {
        await db
          .from('wa_messages')
          .update({ status: evt.status })
          .eq('wa_message_id', evt.messageId)
      }
      return NextResponse.json({ ok: true })
    }

    if (evt.kind === 'message') {
      const phone = canonicalPhone(evt.phone)
      if (!phone) return NextResponse.json({ ok: true })

      const iso = new Date(evt.timestampMs).toISOString()

      // 2. Persiste na thread canonica (dedup por wa_message_id via indice unico).
      await db
        .from('wa_messages')
        .upsert(
          {
            contact_phone: phone,
            direction: 'inbound',
            body: evt.text,
            media_url: evt.mediaUrl,
            media_type: evt.mediaType,
            wa_message_id: evt.messageId,
            status: 'delivered',
            provider: 'gupshup',
            wa_timestamp: iso,
            raw: body,
          },
          { onConflict: 'wa_message_id', ignoreDuplicates: true },
        )

      // 3. Espelha em comercial_outreach_events (analytics/reply tracking do AMI).
      const leadId = await findLeadIdByPhone(db, phone)
      const outreachEvent: Record<string, unknown> = {
        contact_phone: phone,
        channel: 'whatsapp',
        direction: 'inbound',
        event_type: 'message_received',
        event_text: evt.text,
        metadata: { provider: 'gupshup', media_type: evt.mediaType },
      }
      if (leadId) outreachEvent.lead_id = leadId
      const { error: eventError } = await db.from('comercial_outreach_events').insert(outreachEvent)
      if (eventError) console.error('[webhook/gupshup] outreach event error:', eventError)

      // 4. Atualiza contato (nome + timestamp da ultima entrada).
      await db
        .from('inbox_contacts')
        .upsert(
          {
            phone,
            contact_name: evt.name || undefined,
            last_inbound_at: iso,
            updated_at: iso,
          },
          { onConflict: 'phone' },
        )

      // 5. Opt-out (LGPD) — marca e nao envia mais (o gate de envio deve checar isso).
      if (isOptOut(evt.text)) {
        await db
          .from('inbox_contacts')
          .update({ opted_out: true, opted_out_at: iso })
          .eq('phone', phone)
      }

      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    // Nunca retornar erro ao Gupshup (evita retempestade de retries); loga e segue.
    console.error('[webhook/gupshup] erro:', err)
    return NextResponse.json({ ok: true })
  }
}

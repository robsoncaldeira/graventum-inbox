import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { sendWhatsAppMessage } from '@/lib/evolution'
import { sendSessionText } from '@/lib/gupshup'
import { WA_PROVIDER, canonicalPhone, phoneVariants, isAllowedDestination, isWindowOpen, WA_BLOCK_MESSAGE } from '@/lib/wa'
import { isAuthenticatedFromRequest } from '@/lib/auth'

export const dynamic = 'force-dynamic'

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
  if (!isAuthenticatedFromRequest(req)) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const { phone, message } = await req.json()

  if (!phone || !message?.trim()) {
    return NextResponse.json({ error: 'phone e message são obrigatórios' }, { status: 400 })
  }

  const text = message.trim()
  const db = getSupabase()

  if (WA_PROVIDER === 'gupshup') {
    const dest = canonicalPhone(phone)

    // Gate de seguranca (regra global Graventum)
    if (!isAllowedDestination(dest)) {
      return NextResponse.json({ error: WA_BLOCK_MESSAGE }, { status: 403 })
    }

    // Opt-out (LGPD) + janela de 24h — texto livre so dentro da janela.
    const { data: contact } = await db
      .from('inbox_contacts')
      .select('opted_out, last_inbound_at')
      .eq('phone', dest)
      .maybeSingle()

    if (contact?.opted_out) {
      return NextResponse.json({ error: 'Contato optou por nao receber (opt-out).' }, { status: 403 })
    }
    if (!isWindowOpen(contact?.last_inbound_at)) {
      return NextResponse.json(
        {
          error: 'Janela de 24h fechada. Use um template (/api/send-template) para reabrir a conversa.',
          needsTemplate: true,
        },
        { status: 409 },
      )
    }

    let messageId: string | null = null
    try {
      const res = await sendSessionText(dest, text)
      messageId = res.messageId ?? null
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      return NextResponse.json({ error: msg }, { status: 502 })
    }

    // Persiste outbound na thread (status inicial 'sent'; webhook atualiza p/ delivered/read).
    await db.from('wa_messages').insert({
      contact_phone: dest,
      direction: 'outbound',
      body: text,
      wa_message_id: messageId,
      status: 'sent',
      provider: 'gupshup',
      wa_timestamp: new Date().toISOString(),
    })

    // Espelha em comercial_outreach_events (analytics do AMI).
    const leadId = await findLeadIdByPhone(db, dest)
    const outreachEvent: Record<string, unknown> = {
      contact_phone: dest,
      channel: 'whatsapp',
      direction: 'outbound',
      event_type: 'message_sent',
      event_text: text,
      metadata: { sent_by: 'team_inbox', provider: 'gupshup', wa_message_id: messageId },
    }
    if (leadId) outreachEvent.lead_id = leadId
    const { error: eventError } = await db.from('comercial_outreach_events').insert(outreachEvent)
    if (eventError) console.error('[send] outreach event error:', eventError)

    return NextResponse.json({ ok: true, messageId })
  }

  // ─── Provider legado: Evolution ───
  try {
    await sendWhatsAppMessage(phone, text)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 502 })
  }

  const { error } = await db.from('comercial_outreach_events').insert({
    contact_phone: phone,
    channel: 'whatsapp',
    direction: 'outbound',
    event_type: 'message_sent',
    event_text: text,
    metadata: { sent_by: 'team_inbox' },
  })

  if (error) console.error('Supabase insert error:', error)

  return NextResponse.json({ ok: true })
}

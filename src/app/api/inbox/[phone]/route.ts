import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { isAuthenticatedFromRequest } from '@/lib/auth'

export const dynamic = 'force-dynamic'

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL!
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY!
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE!

function extractText(message: Record<string, unknown>): string {
  return (
    (message.conversation as string) ||
    ((message.extendedTextMessage as Record<string, string>)?.text) ||
    ((message.imageMessage as Record<string, string>)?.caption) ||
    ((message.videoMessage as Record<string, string>)?.caption) ||
    ((message.audioMessage as Record<string, string>)?.url ? '[áudio]' : '') ||
    ((message.documentMessage as Record<string, string>)?.fileName ? '[documento]' : '') ||
    ((message.stickerMessage as Record<string, unknown>) ? '[figurinha]' : '') ||
    '[mídia]'
  )
}

function jidToPhone(jid: string, altJid?: string | null): string {
  if (jid.includes('@lid') && altJid) {
    return altJid.replace('@s.whatsapp.net', '')
  }
  return jid.replace('@s.whatsapp.net', '').replace('@lid', '').replace('@c.us', '')
}

async function fetchRecords(jid: string): Promise<Array<Record<string, unknown>>> {
  const res = await fetch(
    `${EVOLUTION_API_URL}/chat/findMessages/${EVOLUTION_INSTANCE}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: EVOLUTION_API_KEY },
      body: JSON.stringify({ where: { key: { remoteJid: jid } }, limit: 200 }),
    }
  )
  if (!res.ok) return []
  const data = await res.json()
  return (data?.messages?.records ?? data?.records ?? []) as Array<Record<string, unknown>>
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ phone: string }> }
) {
  if (!isAuthenticatedFromRequest(req)) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const { phone: phoneParam } = await params
  const remoteJid = decodeURIComponent(phoneParam)
  const phoneHint = req.nextUrl.searchParams.get('phone') ?? null

  try {
    // 1. Buscar mensagens do JID principal
    const primaryRecords = await fetchRecords(remoteJid)

    // 2. Extrair telefone real (remoteJidAlt para @lid)
    const altJid = primaryRecords
      .map((m) => (m.key as Record<string, string>)?.remoteJidAlt)
      .find((v) => !!v) ?? null
    let phone = jidToPhone(remoteJid, altJid)

    // 2b. Se phone parece ser um LID (>13 digitos ou nao comeca com codigo de pais valido),
    //     tentar resolver via inbox_contacts (remote_jid → phone) ou phoneHint da query string
    const isLikelyLid = phone.length > 13 || !/^[1-9]\d{0,2}/.test(phone)
    if (isLikelyLid) {
      // Buscar por remote_jid no inbox_contacts
      const { data: lidLookup } = await getSupabase()
        .from('inbox_contacts')
        .select('phone')
        .eq('remote_jid', remoteJid)
        .maybeSingle()
      if (lidLookup?.phone && lidLookup.phone.length <= 13) {
        phone = lidLookup.phone
      } else if (phoneHint && phoneHint.length <= 13 && /^\d+$/.test(phoneHint)) {
        phone = phoneHint
      }
    }

    // 3. Buscar JID alternativo no Supabase (remote_jid salvo pelo ContactPanel)
    const { data: crmRecord } = await getSupabase()
      .from('inbox_contacts')
      .select('remote_jid')
      .eq('phone', phone)
      .maybeSingle()

    // 4. Determinar JIDs alternativos para buscar:
    //    - Se remoteJid é @lid e temos o telefone real → buscar {phone}@s.whatsapp.net
    //    - Se remoteJid é @s.whatsapp.net → buscar remote_jid salvo (@lid se existir)
    const altJids: string[] = []
    if (remoteJid.includes('@lid') && phone) {
      altJids.push(`${phone}@s.whatsapp.net`)
    } else if (!remoteJid.includes('@lid') && crmRecord?.remote_jid) {
      altJids.push(crmRecord.remote_jid)
    }

    // 5. Buscar mensagens dos JIDs alternativos em paralelo
    const altRecordsArrays = await Promise.all(altJids.map(fetchRecords))
    const allRecords = [...primaryRecords, ...altRecordsArrays.flat()]

    // 6. Deduplicar por ID de mensagem
    const seen = new Set<string>()
    const dedupedRecords = allRecords.filter((m) => {
      const id = (m.key as Record<string, unknown>)?.id as string
      if (!id || seen.has(id)) return false
      seen.add(id)
      return true
    })

    // 7. Transformar e ordenar
    const messages = dedupedRecords
      .map((m) => {
        const key = m.key as Record<string, unknown>
        const msgContent = (m.message ?? {}) as Record<string, unknown>
        const ts = m.messageTimestamp as number | null
        return {
          id: (key.id as string) ?? String(ts),
          direction: key.fromMe ? 'outbound' : ('inbound' as 'outbound' | 'inbound'),
          event_text: extractText(msgContent),
          ocorrido_em: ts
            ? new Date(ts * 1000).toISOString()
            : (m.updatedAt as string),
          event_type: m.messageType as string,
          metadata: key.fromMe ? { sent_by: 'whatsapp' } : undefined,
        }
      })
      .sort((a, b) => new Date(a.ocorrido_em).getTime() - new Date(b.ocorrido_em).getTime())

    // 8. Registrar last_read_at (fire-and-forget)
    getSupabase()
      .from('inbox_contacts')
      .upsert({ phone, last_read_at: new Date().toISOString() }, { onConflict: 'phone' })
      .then(() => {})

    // 9. Buscar dados do lead no Supabase
    const { data: leadData } = await getSupabase()
      .from('graventum_commercial_leads')
      .select('company_name, status_lead, segmento, score_fit_graventum, cidade, estado')
      .eq('whatsapp', phone)
      .maybeSingle()

    return NextResponse.json({ messages, lead: leadData, phone })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

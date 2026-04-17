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

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ phone: string }> }
) {
  if (!isAuthenticatedFromRequest(req)) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const { phone: phoneParam } = await params
  // phone param pode ser um JID encodado (ex: 5541...@s.whatsapp.net) ou número puro
  const remoteJid = decodeURIComponent(phoneParam)

  try {
    // 1. Buscar mensagens da Evolution API
    const msgsRes = await fetch(
      `${EVOLUTION_API_URL}/chat/findMessages/${EVOLUTION_INSTANCE}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: EVOLUTION_API_KEY },
        body: JSON.stringify({
          where: { key: { remoteJid } },
          limit: 200,
        }),
      }
    )

    if (!msgsRes.ok) throw new Error(`Evolution API ${msgsRes.status}`)

    const msgsData = await msgsRes.json()
    const records = (msgsData?.messages?.records ?? msgsData?.records ?? []) as Array<
      Record<string, unknown>
    >

    // 2. Extrair número de telefone real para lookup do lead
    // Para contatos @lid, remoteJidAlt pode não estar no primeiro registro — varrer todos
    const altJid =
      (records
        .map((m) => (m.key as Record<string, string>)?.remoteJidAlt)
        .find((v) => !!v) ?? null)
    const phone = jidToPhone(remoteJid, altJid)

    // 3. Transformar mensagens
    const messages = records
      .map((m) => {
        const key = m.key as Record<string, unknown>
        const msgContent = (m.message ?? {}) as Record<string, unknown>
        const ts = m.messageTimestamp as number | null
        return {
          id: m.id as string,
          direction: key.fromMe ? 'outbound' : ('inbound' as 'outbound' | 'inbound'),
          event_text: extractText(msgContent),
          ocorrido_em: ts
            ? new Date(ts * 1000).toISOString()
            : (m.updatedAt as string),
          event_type: m.messageType as string,
          metadata: key.fromMe ? { sent_by: 'whatsapp' } : undefined,
        }
      })
      .sort(
        (a, b) =>
          new Date(a.ocorrido_em).getTime() - new Date(b.ocorrido_em).getTime()
      )

    // 4. Buscar dados do lead no Supabase
    const { data: leadData } = await getSupabase()
      .from('graventum_commercial_leads')
      .select(
        'company_name, status_lead, segmento, score_fit_graventum, cidade, estado'
      )
      .eq('whatsapp', phone)
      .maybeSingle()

    return NextResponse.json({
      messages,
      lead: leadData,
      phone,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { isAuthenticatedFromRequest } from '@/lib/auth'

export const dynamic = 'force-dynamic'

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL!
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY!
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE!

function jidToPhone(jid: string, altJid?: string | null): string {
  if (jid.includes('@lid') && altJid) {
    return altJid.replace('@s.whatsapp.net', '')
  }
  return jid.replace('@s.whatsapp.net', '').replace('@lid', '').replace('@c.us', '')
}

function extractPreview(lastMsg: Record<string, unknown> | null): string {
  if (!lastMsg) return ''
  const m = (lastMsg.message ?? {}) as Record<string, unknown>
  return (
    (m.conversation as string) ||
    ((m.extendedTextMessage as Record<string, string>)?.text) ||
    ((m.imageMessage as Record<string, string>)?.caption) ||
    '[mídia]'
  )
}

export async function GET(req: NextRequest) {
  if (!isAuthenticatedFromRequest(req)) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  try {
    // 1. Buscar todos os chats da Evolution API
    const chatsRes = await fetch(
      `${EVOLUTION_API_URL}/chat/findChats/${EVOLUTION_INSTANCE}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: EVOLUTION_API_KEY },
        body: JSON.stringify({}),
      }
    )

    if (!chatsRes.ok) throw new Error(`Evolution API ${chatsRes.status}`)

    const chats = (await chatsRes.json()) as Array<Record<string, unknown>>

    // 2. Filtrar grupos e transformar
    const conversations = chats
      .filter((c) => {
        const jid = c.remoteJid as string
        return jid && !jid.includes('@g.us') && !jid.includes('@broadcast') && !jid.includes('@newsletter')
      })
      .map((c) => {
        const jid = c.remoteJid as string
        const lastMsg = c.lastMessage as Record<string, unknown> | null
        const altJid = (lastMsg?.key as Record<string, string>)?.remoteJidAlt ?? null
        const phone = jidToPhone(jid, altJid)
        const fromMe = (lastMsg?.key as Record<string, boolean>)?.fromMe ?? false
        return {
          remoteJid: jid,
          contact_phone: phone,
          pushName: (c.pushName as string) || null,
          ultima_mensagem: (c.updatedAt as string) || new Date().toISOString(),
          preview: extractPreview(lastMsg),
          unreadCount: (c.unreadCount as number) || 0,
          fromMe,
        }
      })
      .filter((c) => c.contact_phone.length >= 8)
      .sort(
        (a, b) =>
          new Date(b.ultima_mensagem).getTime() - new Date(a.ultima_mensagem).getTime()
      )

    // 3. Enriquecer com dados de lead do Supabase
    const phones = conversations.map((c) => c.contact_phone)
    const { data: leads } = await getSupabase()
      .from('graventum_commercial_leads')
      .select('whatsapp, company_name, status_lead, segmento')
      .in('whatsapp', phones)

    const leadsMap = new Map((leads ?? []).map((l) => [l.whatsapp, l]))

    const result = conversations.map((c) => ({
      ...c,
      ...(leadsMap.get(c.contact_phone) ?? {}),
    }))

    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

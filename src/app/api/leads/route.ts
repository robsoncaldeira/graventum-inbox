import { NextRequest, NextResponse } from 'next/server'
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

    const contacts = chats
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
        const unreadCount = (c.unreadCount as number) || 0
        const updatedAt = (c.updatedAt as string) || new Date().toISOString()

        // funil: respondeu = última mensagem é deles (fromMe=false) ou têm não lidas
        // sem_resposta = última mensagem foi nossa (fromMe=true)
        const funil = (!fromMe || unreadCount > 0) ? 'respondeu' : 'sem_resposta'

        return {
          remoteJid: jid,
          phone,
          pushName: (c.pushName as string) || null,
          preview: extractPreview(lastMsg),
          unreadCount,
          fromMe,
          ultima_mensagem: updatedAt,
          funil,
        }
      })
      .filter((c) => c.phone.length >= 8)
      .sort((a, b) => new Date(b.ultima_mensagem).getTime() - new Date(a.ultima_mensagem).getTime())

    return NextResponse.json(contacts)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

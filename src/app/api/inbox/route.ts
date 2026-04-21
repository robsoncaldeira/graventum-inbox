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
    const raw = chats
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

    // Resolver LIDs: buscar telefone real no inbox_contacts pelo remote_jid
    const lids = raw.filter((c) => c.contact_phone.length > 13 || !/^[1-9]\d{0,2}/.test(c.contact_phone))
    if (lids.length > 0) {
      const lidJids = lids.map((c) => c.remoteJid)
      const { data: lidLookups } = await getSupabase()
        .from('inbox_contacts')
        .select('phone, remote_jid')
        .in('remote_jid', lidJids)
      const lidMap = new Map((lidLookups ?? []).map((r) => [r.remote_jid, r.phone]))
      for (const c of raw) {
        if (c.contact_phone.length > 13 || !/^[1-9]\d{0,2}/.test(c.contact_phone)) {
          const realPhone = lidMap.get(c.remoteJid)
          if (realPhone && realPhone.length <= 13) {
            c.contact_phone = realPhone
          }
        }
      }
    }

    // Deduplicar por phone — mesmo número pode aparecer como @s.whatsapp.net e @lid
    const deduped = new Map<string, typeof raw[0]>()
    for (const c of raw) {
      const existing = deduped.get(c.contact_phone)
      if (!existing) {
        deduped.set(c.contact_phone, c)
      } else {
        const existingTs = new Date(existing.ultima_mensagem).getTime()
        const newTs = new Date(c.ultima_mensagem).getTime()
        const preferNew = c.remoteJid.includes('@lid') || newTs > existingTs
        if (preferNew) deduped.set(c.contact_phone, c)
      }
    }

    const conversations = Array.from(deduped.values())
      .sort(
        (a, b) =>
          new Date(b.ultima_mensagem).getTime() - new Date(a.ultima_mensagem).getTime()
      )

    // 3. Enriquecer com dados de lead do Supabase + inbox_contacts
    const phones = conversations.map((c) => c.contact_phone)
    const remoteJids = conversations.map((c) => c.remoteJid)

    const [{ data: leads }, { data: contactsByPhone }, { data: contactsByJid }] = await Promise.all([
      getSupabase()
        .from('graventum_commercial_leads')
        .select('whatsapp, company_name, status_lead, segmento')
        .in('whatsapp', phones),
      getSupabase()
        .from('inbox_contacts')
        .select('phone, company_name, contact_name')
        .in('phone', phones),
      getSupabase()
        .from('inbox_contacts')
        .select('phone, remote_jid, company_name, contact_name')
        .in('remote_jid', remoteJids),
    ])

    const leadsMap = new Map((leads ?? []).map((l) => [l.whatsapp, l]))
    const contactsByPhoneMap = new Map((contactsByPhone ?? []).map((c) => [c.phone, c]))
    const contactsByJidMap = new Map((contactsByJid ?? []).map((c) => [c.remote_jid, c]))

    const result = conversations.map((c) => {
      const lead = leadsMap.get(c.contact_phone)
      const contact = contactsByPhoneMap.get(c.contact_phone) ?? contactsByJidMap.get(c.remoteJid)
      return {
        ...c,
        company_name: lead?.company_name ?? contact?.company_name ?? null,
        status_lead: lead?.status_lead ?? null,
        segmento: lead?.segmento ?? null,
        contact_name: contact?.contact_name ?? null,
      }
    })

    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

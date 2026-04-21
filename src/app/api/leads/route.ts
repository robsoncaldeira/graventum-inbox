import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { isAuthenticatedFromRequest } from '@/lib/auth'

export const dynamic = 'force-dynamic'

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL!
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY!
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE!

function jidToPhone(jid: string, altJid?: string | null): string {
  if (jid.includes('@lid') && altJid) return altJid.replace('@s.whatsapp.net', '')
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
    // 1. Buscar chats da Evolution API
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
        const unreadCount = (c.unreadCount as number) || 0
        return {
          remoteJid: jid,
          phone,
          pushName: (c.pushName as string) || null,
          preview: extractPreview(lastMsg),
          unreadCount,
          fromMe,
          ultima_mensagem: (c.updatedAt as string) || new Date().toISOString(),
          _defaultEstagio: (!fromMe || unreadCount > 0) ? 'em_conversa' : 'novo',
        }
      })
      .filter((c) => c.phone.length >= 8)

    // Resolver LIDs: buscar telefone real no inbox_contacts pelo remote_jid
    const lids = raw.filter((c) => c.phone.length > 13 || !/^[1-9]\d{0,2}/.test(c.phone))
    if (lids.length > 0) {
      const lidJids = lids.map((c) => c.remoteJid)
      const { data: lidLookups } = await getSupabase()
        .from('inbox_contacts')
        .select('phone, remote_jid')
        .in('remote_jid', lidJids)
      const lidMap = new Map((lidLookups ?? []).map((r) => [r.remote_jid, r.phone]))
      for (const c of raw) {
        if (c.phone.length > 13 || !/^[1-9]\d{0,2}/.test(c.phone)) {
          const realPhone = lidMap.get(c.remoteJid)
          if (realPhone && realPhone.length <= 13) {
            c.phone = realPhone
          }
        }
      }
    }

    // Deduplicar por phone real — mesmo número pode aparecer como @s.whatsapp.net e @lid
    // Manter a entrada mais recente; preferir @lid (tem remoteJidAlt = telefone real)
    const deduped = new Map<string, typeof raw[0]>()
    for (const c of raw) {
      const existing = deduped.get(c.phone)
      if (!existing) {
        deduped.set(c.phone, c)
      } else {
        const existingTs = new Date(existing.ultima_mensagem).getTime()
        const newTs = new Date(c.ultima_mensagem).getTime()
        const preferNew = c.remoteJid.includes('@lid') || newTs > existingTs
        if (preferNew) deduped.set(c.phone, c)
      }
    }

    const contacts = Array.from(deduped.values())
      .sort((a, b) => new Date(b.ultima_mensagem).getTime() - new Date(a.ultima_mensagem).getTime())

    // 2. Enriquecer com dados CRM do Supabase
    const phones = contacts.map((c) => c.phone)
    const { data: crmRecords } = await getSupabase()
      .from('inbox_contacts')
      .select('phone, remote_jid, push_name, company_name, contact_name, estagio, icp_fit, proximo_followup, sentimento, notas, is_bot, last_read_at')
      .in('phone', phones)

    // Mapa primário por phone (real) + secundário por remote_jid stripped (para @lid)
    const crmByPhone = new Map((crmRecords ?? []).map((r) => [r.phone, r]))
    const crmByJid = new Map(
      (crmRecords ?? [])
        .filter((r) => r.remote_jid)
        .map((r) => [
          (r.remote_jid as string)
            .replace('@s.whatsapp.net', '')
            .replace('@lid', '')
            .replace('@c.us', ''),
          r,
        ])
    )

    const result = contacts.map((c) => {
      const crm = crmByPhone.get(c.phone) ?? crmByJid.get(c.phone)
      // Se a conversa foi aberta depois da última mensagem, considera lida
      const isRead = crm?.last_read_at
        ? new Date(crm.last_read_at) >= new Date(c.ultima_mensagem)
        : false
      return {
        ...c,
        unreadCount: isRead ? 0 : c.unreadCount,
        company_name: crm?.company_name ?? null,
        contact_name: crm?.contact_name ?? null,
        estagio: crm?.estagio ?? c._defaultEstagio,
        icp_fit: crm?.icp_fit ?? null,
        proximo_followup: crm?.proximo_followup ?? null,
        sentimento: crm?.sentimento ?? null,
        is_bot: crm?.is_bot ?? false,
        has_crm: !!crm,
      }
    })

    return NextResponse.json(result)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

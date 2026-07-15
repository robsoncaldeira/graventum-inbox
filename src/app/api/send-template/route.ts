import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { sendTemplate } from '@/lib/gupshup'
import { WA_PROVIDER, canonicalPhone, phoneVariants, isAllowedDestination, WA_BLOCK_MESSAGE } from '@/lib/wa'
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

// Disparo de template HSM (Gupshup) — usado no primeiro contato / janela de 24h fechada.
// Body: { phone, templateId, params?: string[], preview?: string }
export async function POST(req: NextRequest) {
  if (!isAuthenticatedFromRequest(req)) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }
  if (WA_PROVIDER !== 'gupshup') {
    return NextResponse.json({ error: 'Templates so estao disponiveis no provider gupshup.' }, { status: 400 })
  }

  const { phone, templateId, params, preview } = await req.json()
  if (!phone || !templateId) {
    return NextResponse.json({ error: 'phone e templateId são obrigatórios' }, { status: 400 })
  }

  const dest = canonicalPhone(phone)
  if (!isAllowedDestination(dest)) {
    return NextResponse.json({ error: WA_BLOCK_MESSAGE }, { status: 403 })
  }

  const db = getSupabase()

  // Opt-out (LGPD)
  const { data: contact } = await db
    .from('inbox_contacts')
    .select('opted_out')
    .eq('phone', dest)
    .maybeSingle()
  if (contact?.opted_out) {
    return NextResponse.json({ error: 'Contato optou por nao receber (opt-out).' }, { status: 403 })
  }

  const templateParams: string[] = Array.isArray(params) ? params.map(String) : []

  let messageId: string | null = null
  try {
    const res = await sendTemplate(dest, String(templateId), templateParams)
    messageId = res.messageId ?? null
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 502 })
  }

  const body = (preview as string) || `[template ${templateId}]`

  await db.from('wa_messages').insert({
    contact_phone: dest,
    direction: 'outbound',
    body,
    wa_message_id: messageId,
    status: 'sent',
    provider: 'gupshup',
    wa_timestamp: new Date().toISOString(),
    raw: { template_id: templateId, params: templateParams },
  })

  const leadId = await findLeadIdByPhone(db, dest)
  const outreachEvent: Record<string, unknown> = {
    contact_phone: dest,
    channel: 'whatsapp',
    direction: 'outbound',
    event_type: 'message_sent',
    event_text: body,
    metadata: { sent_by: 'team_inbox', provider: 'gupshup', template_id: templateId, wa_message_id: messageId },
  }
  if (leadId) outreachEvent.lead_id = leadId
  const { error: eventError } = await db.from('comercial_outreach_events').insert(outreachEvent)
  if (eventError) console.error('[send-template] outreach event error:', eventError)

  return NextResponse.json({ ok: true, messageId })
}

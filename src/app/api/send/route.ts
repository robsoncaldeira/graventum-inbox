import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { sendWhatsAppMessage } from '@/lib/evolution'
import { isAuthenticatedFromRequest } from '@/lib/auth'

export async function POST(req: NextRequest) {
  if (!isAuthenticatedFromRequest(req)) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const { phone, message } = await req.json()

  if (!phone || !message?.trim()) {
    return NextResponse.json({ error: 'phone e message são obrigatórios' }, { status: 400 })
  }

  try {
    await sendWhatsAppMessage(phone, message.trim())
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 502 })
  }

  const { error } = await supabase.from('comercial_outreach_events').insert({
    contact_phone: phone,
    channel: 'whatsapp',
    direction: 'outbound',
    event_type: 'message_sent',
    event_text: message.trim(),
    metadata: { sent_by: 'team_inbox' },
  })

  if (error) console.error('Supabase insert error:', error)

  return NextResponse.json({ ok: true })
}

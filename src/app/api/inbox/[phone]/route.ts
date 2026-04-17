import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { isAuthenticatedFromRequest } from '@/lib/auth'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ phone: string }> }
) {
  if (!isAuthenticatedFromRequest(req)) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const { phone } = await params

  const [eventsRes, leadRes] = await Promise.all([
    supabase
      .from('comercial_outreach_events')
      .select('id, direction, event_text, ocorrido_em, event_type, metadata')
      .eq('contact_phone', phone)
      .eq('channel', 'whatsapp')
      .order('ocorrido_em', { ascending: true }),
    supabase
      .from('graventum_commercial_leads')
      .select('nome_empresa, nome_contato, status_lead, segmento, score_fit_graventum, cidade, estado')
      .eq('whatsapp', phone)
      .maybeSingle(),
  ])

  if (eventsRes.error) {
    return NextResponse.json({ error: eventsRes.error.message }, { status: 500 })
  }

  return NextResponse.json({
    messages: eventsRes.data,
    lead: leadRes.data,
  })
}

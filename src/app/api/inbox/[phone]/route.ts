import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { isAuthenticatedFromRequest } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ phone: string }> }
) {
  if (!isAuthenticatedFromRequest(req)) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const { phone } = await params

  const db = getSupabase()
  const [eventsRes, leadRes] = await Promise.all([
    db
      .from('comercial_outreach_events')
      .select('id, direction, event_text, ocorrido_em, event_type, metadata')
      .eq('contact_phone', phone)
      .eq('channel', 'whatsapp')
      .order('ocorrido_em', { ascending: true }),
    db
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

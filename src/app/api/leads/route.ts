import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { isAuthenticatedFromRequest } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!isAuthenticatedFromRequest(req)) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const db = getSupabase()

  // Leads com WhatsApp
  const { data: leads, error } = await db
    .from('graventum_commercial_leads')
    .select('id, whatsapp, nome_empresa, nome_contato, status_lead, segmento, score_fit_graventum, cidade, estado')
    .not('whatsapp', 'is', null)
    .order('score_fit_graventum', { ascending: false })

  if (error) {
    console.error('[leads] Supabase error:', JSON.stringify(error))
    return NextResponse.json({ error: error.message, details: error }, { status: 500 })
  }

  // Eventos inbound por phone
  const { data: inboundEvents } = await db
    .from('comercial_outreach_events')
    .select('contact_phone, ocorrido_em')
    .eq('channel', 'whatsapp')
    .eq('direction', 'inbound')

  const inboundMap = new Map<string, string>()
  for (const e of inboundEvents ?? []) {
    const existing = inboundMap.get(e.contact_phone)
    if (!existing || new Date(e.ocorrido_em) > new Date(existing)) {
      inboundMap.set(e.contact_phone, e.ocorrido_em)
    }
  }

  // Eventos outbound por phone
  const { data: outboundEvents } = await db
    .from('comercial_outreach_events')
    .select('contact_phone')
    .eq('channel', 'whatsapp')
    .eq('direction', 'outbound')

  const outboundSet = new Set((outboundEvents ?? []).map((e) => e.contact_phone))

  const result = (leads ?? []).map((l) => {
    const respondeu = inboundMap.has(l.whatsapp)
    const enviado = outboundSet.has(l.whatsapp)
    return {
      ...l,
      respondeu,
      ultima_resposta: inboundMap.get(l.whatsapp) ?? null,
      contato_iniciado: enviado,
      funil: respondeu
        ? 'respondeu'
        : enviado
        ? 'sem_resposta'
        : 'nao_contatado',
    }
  })

  return NextResponse.json(result)
}

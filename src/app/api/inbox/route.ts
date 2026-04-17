import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { isAuthenticatedFromRequest } from '@/lib/auth'

export async function GET(req: NextRequest) {
  if (!isAuthenticatedFromRequest(req)) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const { data, error } = await supabase.rpc('inbox_conversations')

  if (error) {
    // Fallback: query manual se a função não existir
    const { data: raw, error: rawErr } = await supabase
      .from('comercial_outreach_events')
      .select(`
        contact_phone,
        direction,
        event_text,
        ocorrido_em
      `)
      .eq('channel', 'whatsapp')
      .order('ocorrido_em', { ascending: false })

    if (rawErr) return NextResponse.json({ error: rawErr.message }, { status: 500 })

    // Agrupar por phone manualmente
    const map = new Map<string, {
      contact_phone: string
      ultima_mensagem: string
      preview: string
      recebidas: number
    }>()

    for (const row of raw ?? []) {
      if (!map.has(row.contact_phone)) {
        map.set(row.contact_phone, {
          contact_phone: row.contact_phone,
          ultima_mensagem: row.ocorrido_em,
          preview: row.event_text ?? '',
          recebidas: 0,
        })
      }
      if (row.direction === 'inbound') {
        map.get(row.contact_phone)!.recebidas++
      }
    }

    // Buscar dados dos leads
    const phones = Array.from(map.keys())
    const { data: leads } = await supabase
      .from('graventum_commercial_leads')
      .select('whatsapp, nome_empresa, nome_contato, status_lead, segmento')
      .in('whatsapp', phones)

    const leadsMap = new Map((leads ?? []).map((l) => [l.whatsapp, l]))

    const conversations = Array.from(map.values())
      .sort((a, b) => new Date(b.ultima_mensagem).getTime() - new Date(a.ultima_mensagem).getTime())
      .map((c) => ({
        ...c,
        ...(leadsMap.get(c.contact_phone) ?? {}),
      }))

    return NextResponse.json(conversations)
  }

  return NextResponse.json(data)
}

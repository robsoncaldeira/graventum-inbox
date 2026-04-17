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
  const { data } = await db
    .from('inbox_contacts')
    .select('*')
    .eq('phone', decodeURIComponent(phone))
    .maybeSingle()
  return NextResponse.json(data ?? null)
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ phone: string }> }
) {
  if (!isAuthenticatedFromRequest(req)) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }
  const { phone } = await params
  const decodedPhone = decodeURIComponent(phone)
  const body = await req.json()

  const db = getSupabase()
  const { data, error } = await db
    .from('inbox_contacts')
    .upsert({ phone: decodedPhone, ...body }, { onConflict: 'phone' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

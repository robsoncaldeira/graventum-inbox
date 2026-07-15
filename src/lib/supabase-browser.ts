'use client'

import { createClient, SupabaseClient } from '@supabase/supabase-js'

// Cliente Supabase para o browser (Realtime). Usa a anon key publica.
// Se NEXT_PUBLIC_SUPABASE_ANON_KEY nao estiver setada, retorna null e o
// componente cai no polling SWR. Realtime so entrega linhas de wa_messages
// se a policy de RLS para 'anon' estiver habilitada (ver sql/001_wa_messages.sql).
let _client: SupabaseClient | null = null

export function getBrowserSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  if (!_client) {
    _client = createClient(url, key, {
      auth: { persistSession: false },
      realtime: { params: { eventsPerSecond: 5 } },
    })
  }
  return _client
}

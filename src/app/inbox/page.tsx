'use client'

import useSWR from 'swr'
import Link from 'next/link'
import Sidebar from '@/components/Sidebar'
import { MessageCircle, Building2, Clock } from 'lucide-react'

type Conversation = {
  remoteJid: string
  contact_phone: string
  ultima_mensagem: string
  preview: string
  unreadCount: number
  pushName?: string
  company_name?: string
  status_lead?: string
  segmento?: string
  fromMe?: boolean
}

const fetcher = async (url: string) => {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}min`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  return `${Math.floor(hrs / 24)}d`
}

const STATUS_COLORS: Record<string, string> = {
  qualificado: 'bg-green-500/20 text-green-400',
  em_contato: 'bg-blue-500/20 text-blue-400',
  novo: 'bg-zinc-700 text-zinc-300',
  aguardando_contato: 'bg-yellow-500/20 text-yellow-400',
}

export default function InboxPage() {
  const { data, isLoading, error } = useSWR<Conversation[]>('/api/inbox', fetcher, {
    refreshInterval: 30000,
  })

  if (error) return (
    <div className="flex min-h-screen bg-zinc-950">
      <Sidebar />
      <main className="flex-1 flex items-center justify-center">
        <p className="text-red-400 text-sm">Erro ao carregar conversas: {error.message}</p>
      </main>
    </div>
  )

  return (
    <div className="flex min-h-screen bg-zinc-950">
      <Sidebar />
      <main className="flex-1 p-6">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-white text-lg font-semibold">Conversas</h1>
              <p className="text-zinc-500 text-sm">
                {data ? `${data.length} conversas` : 'Carregando...'}
              </p>
            </div>
            <span className="text-xs text-zinc-600">Atualiza a cada 30s</span>
          </div>

          {isLoading && (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 bg-zinc-900 rounded-xl animate-pulse" />
              ))}
            </div>
          )}

          {data && data.length === 0 && (
            <div className="text-center py-20 text-zinc-600">
              <MessageCircle className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>Nenhuma conversa ainda</p>
            </div>
          )}

          <div className="space-y-2">
            {(data ?? []).map((conv) => (
              <Link
                key={conv.remoteJid}
                href={`/inbox/${encodeURIComponent(conv.remoteJid)}?phone=${encodeURIComponent(conv.contact_phone)}`}
                className="block bg-zinc-900 border border-zinc-800 rounded-xl p-4 hover:border-zinc-700 hover:bg-zinc-800/50 transition-all"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-white font-medium text-sm truncate">
                        {conv.company_name ?? conv.pushName ?? conv.contact_phone}
                      </span>
                      {conv.status_lead && (
                        <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${STATUS_COLORS[conv.status_lead] ?? 'bg-zinc-700 text-zinc-300'}`}>
                          {conv.status_lead.replace('_', ' ')}
                        </span>
                      )}
                    </div>
                    <p className="text-zinc-400 text-sm truncate">{conv.preview}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="flex items-center gap-1 text-zinc-600 text-xs mb-1">
                      <Clock className="w-3 h-3" />
                      {timeAgo(conv.ultima_mensagem)}
                    </div>
                    {conv.unreadCount > 0 && (
                      <span className="bg-violet-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center ml-auto">
                        {conv.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}

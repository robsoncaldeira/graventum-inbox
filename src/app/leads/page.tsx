'use client'

import { useState } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import Sidebar from '@/components/Sidebar'
import { MessageCircle, Users, CheckCircle, Clock, MapPin } from 'lucide-react'

type Contact = {
  remoteJid: string
  phone: string
  pushName?: string | null
  preview: string
  unreadCount: number
  fromMe: boolean
  ultima_mensagem: string
  funil: 'respondeu' | 'sem_resposta'
}

const fetcher = async (url: string) => {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
}

const FUNIL_TABS = [
  { key: 'respondeu', label: 'Responderam', icon: CheckCircle, color: 'text-green-400' },
  { key: 'sem_resposta', label: 'Sem resposta', icon: Clock, color: 'text-yellow-400' },
]

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const hrs = Math.floor(diff / 3600000)
  if (hrs < 24) return `${hrs}h atrás`
  return `${Math.floor(hrs / 24)}d atrás`
}

export default function LeadsPage() {
  const [activeTab, setActiveTab] = useState<string>('respondeu')
  const { data, isLoading, error } = useSWR<Contact[]>('/api/leads', fetcher, {
    refreshInterval: 60000,
  })

  if (error) return (
    <div className="flex min-h-screen bg-zinc-950">
      <Sidebar />
      <main className="flex-1 flex items-center justify-center">
        <p className="text-red-400 text-sm">Erro ao carregar: {error.message}</p>
      </main>
    </div>
  )

  const filtered = (data ?? []).filter((c) => c.funil === activeTab)
  const counts = {
    respondeu: (data ?? []).filter((c) => c.funil === 'respondeu').length,
    sem_resposta: (data ?? []).filter((c) => c.funil === 'sem_resposta').length,
  }

  return (
    <div className="flex min-h-screen bg-zinc-950">
      <Sidebar />
      <main className="flex-1 p-6">
        <div className="max-w-4xl mx-auto">
          <div className="mb-6">
            <h1 className="text-white text-lg font-semibold">Funil de Contatos</h1>
            <p className="text-zinc-500 text-sm">
              {data ? `${data.length} contatos no WhatsApp Business` : 'Carregando...'}
            </p>
          </div>

          {/* Tabs */}
          <div className="flex gap-2 mb-6">
            {FUNIL_TABS.map(({ key, label, icon: Icon, color }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors ${
                  activeTab === key
                    ? 'bg-zinc-800 text-white'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                <Icon className={`w-4 h-4 ${color}`} />
                {label}
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${activeTab === key ? 'bg-zinc-700 text-zinc-300' : 'bg-zinc-900 text-zinc-600'}`}>
                  {counts[key as keyof typeof counts]}
                </span>
              </button>
            ))}
          </div>

          {/* Lista */}
          {isLoading && (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <div key={i} className="h-16 bg-zinc-900 rounded-xl animate-pulse" />)}
            </div>
          )}

          {!isLoading && filtered.length === 0 && (
            <div className="text-center py-16 text-zinc-600">
              <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>Nenhum contato nesta categoria</p>
            </div>
          )}

          <div className="space-y-2">
            {filtered.map((contact) => (
              <div
                key={contact.remoteJid}
                className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center gap-4 hover:border-zinc-700 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-white font-medium text-sm truncate">
                      {contact.pushName ?? contact.phone}
                    </span>
                    {contact.unreadCount > 0 && (
                      <span className="bg-violet-600 text-white text-xs rounded-full px-1.5 py-0.5 shrink-0">
                        {contact.unreadCount} nova{contact.unreadCount > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-zinc-500">
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      {contact.phone}
                    </span>
                    <span>{timeAgo(contact.ultima_mensagem)}</span>
                    {contact.preview && (
                      <span className="truncate max-w-[200px] text-zinc-600">{contact.preview}</span>
                    )}
                  </div>
                </div>
                <Link
                  href={`/inbox/${encodeURIComponent(contact.remoteJid)}?phone=${encodeURIComponent(contact.phone)}`}
                  className="shrink-0 flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs px-3 py-2 rounded-lg transition-colors"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  Ver conversa
                </Link>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}

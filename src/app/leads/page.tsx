'use client'

import { useState } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import Sidebar from '@/components/Sidebar'
import { MessageCircle, Users, TrendingUp, Calendar, Trophy, XCircle, Ghost, Sprout } from 'lucide-react'

type Contact = {
  remoteJid: string
  phone: string
  pushName?: string | null
  company_name?: string | null
  contact_name?: string | null
  preview: string
  unreadCount: number
  fromMe: boolean
  ultima_mensagem: string
  estagio: string
  icp_fit?: 'alto' | 'medio' | 'baixo' | null
  proximo_followup?: string | null
  sentimento?: 'positivo' | 'objecao' | 'neutro' | null
  has_crm: boolean
}

const ESTAGIOS: Record<string, { label: string; color: string; bg: string }> = {
  novo:            { label: 'Novo',           color: 'text-zinc-400',   bg: 'bg-zinc-700' },
  em_conversa:     { label: 'Em conversa',    color: 'text-blue-400',   bg: 'bg-blue-500/20' },
  qualificado:     { label: 'Qualificado',    color: 'text-green-400',  bg: 'bg-green-500/20' },
  nutricao:        { label: 'Nutrição',       color: 'text-orange-400', bg: 'bg-orange-500/20' },
  reuniao_marcada: { label: 'Reunião',        color: 'text-violet-400', bg: 'bg-violet-500/20' },
  ghosting:        { label: 'Ghosting',       color: 'text-zinc-500',   bg: 'bg-zinc-800' },
  ganho:           { label: 'Ganho',          color: 'text-emerald-400',bg: 'bg-emerald-500/20' },
  perdido:         { label: 'Perdido',        color: 'text-red-400',    bg: 'bg-red-500/20' },
}

const ICP_FIT: Record<string, string> = {
  alto:  '🟢',
  medio: '🟡',
  baixo: '🔴',
}

const SENTIMENTO_BADGE: Record<string, { label: string; color: string }> = {
  positivo: { label: '↑ positivo', color: 'text-green-400' },
  objecao:  { label: '↓ objeção',  color: 'text-red-400' },
  neutro:   { label: '→ neutro',   color: 'text-zinc-500' },
}

const TABS = [
  { key: 'all',            label: 'Todos',       icon: Users },
  { key: 'em_conversa',    label: 'Em conversa', icon: MessageCircle },
  { key: 'qualificado',    label: 'Qualificados',icon: TrendingUp },
  { key: 'nutricao',       label: 'Nutrição',    icon: Sprout },
  { key: 'reuniao_marcada',label: 'Reunião',     icon: Calendar },
  { key: 'ghosting',       label: 'Ghosting',    icon: Ghost },
  { key: 'ganho',          label: 'Ganhos',      icon: Trophy },
  { key: 'perdido',        label: 'Perdidos',    icon: XCircle },
]

const fetcher = async (url: string) => {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const hrs = Math.floor(diff / 3600000)
  if (hrs < 24) return `${hrs}h`
  return `${Math.floor(hrs / 24)}d`
}

function formatFollowup(dateStr: string) {
  const d = new Date(dateStr)
  const today = new Date()
  const diff = Math.ceil((d.getTime() - today.setHours(0,0,0,0)) / 86400000)
  if (diff < 0) return { label: 'atrasado', color: 'text-red-400' }
  if (diff === 0) return { label: 'hoje', color: 'text-yellow-400' }
  if (diff === 1) return { label: 'amanhã', color: 'text-blue-400' }
  return { label: d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }), color: 'text-zinc-400' }
}

export default function LeadsPage() {
  const [activeTab, setActiveTab] = useState('all')
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

  const all = data ?? []
  const filtered = activeTab === 'all' ? all : all.filter((c) => c.estagio === activeTab)

  const totalResponded = all.filter((c) => !c.fromMe || c.unreadCount > 0).length
  const responseRate = all.length > 0 ? Math.round((totalResponded / all.length) * 100) : 0
  const meetings = all.filter((c) => c.estagio === 'reuniao_marcada').length
  const wins = all.filter((c) => c.estagio === 'ganho').length
  const qualified = all.filter((c) => c.estagio === 'qualificado').length

  const countFor = (key: string) =>
    key === 'all' ? all.length : all.filter((c) => c.estagio === key).length

  return (
    <div className="flex min-h-screen bg-zinc-950">
      <Sidebar />
      <main className="flex-1 p-6">
        <div className="max-w-4xl mx-auto">

          {/* Header com métricas */}
          <div className="mb-6">
            <h1 className="text-white text-lg font-semibold mb-4">Funil de Contatos</h1>
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: 'Total',           value: all.length,     sub: 'contatos WA' },
                { label: 'Taxa de resposta',value: `${responseRate}%`, sub: `${totalResponded} responderam` },
                { label: 'Qualificados',    value: qualified,      sub: 'com fit confirmado' },
                { label: 'Reuniões',        value: meetings,       sub: `${wins} ganhos` },
              ].map(({ label, value, sub }) => (
                <div key={label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-500 text-xs mb-1">{label}</p>
                  <p className="text-white text-xl font-semibold">{value}</p>
                  <p className="text-zinc-600 text-xs mt-0.5">{sub}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mb-5 flex-wrap">
            {TABS.map(({ key, label, icon: Icon }) => {
              const count = countFor(key)
              return (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors ${
                    activeTab === key
                      ? 'bg-zinc-800 text-white'
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                  <span className={`px-1.5 py-0.5 rounded-full ${activeTab === key ? 'bg-zinc-700 text-zinc-300' : 'bg-zinc-900 text-zinc-600'}`}>
                    {count}
                  </span>
                </button>
              )
            })}
          </div>

          {isLoading && (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <div key={i} className="h-20 bg-zinc-900 rounded-xl animate-pulse" />)}
            </div>
          )}

          {!isLoading && filtered.length === 0 && (
            <div className="text-center py-16 text-zinc-600">
              <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>Nenhum contato nesta etapa</p>
            </div>
          )}

          <div className="space-y-2">
            {filtered.map((contact) => {
              const estagio = ESTAGIOS[contact.estagio] ?? ESTAGIOS.em_conversa
              const followup = contact.proximo_followup ? formatFollowup(contact.proximo_followup) : null

              return (
                <div
                  key={contact.remoteJid}
                  className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center gap-4 hover:border-zinc-700 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    {/* Linha 1: nome + badges */}
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <span className="text-white font-medium text-sm truncate">
                        {contact.company_name ?? contact.pushName ?? contact.phone}
                      </span>
                      {contact.contact_name && (
                        <span className="text-zinc-500 text-xs">{contact.contact_name}</span>
                      )}
                      {/* Estágio badge */}
                      <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${estagio.bg} ${estagio.color}`}>
                        {estagio.label}
                      </span>
                      {/* ICP fit */}
                      {contact.icp_fit && (
                        <span className="text-xs shrink-0" title={`ICP: ${contact.icp_fit}`}>
                          {ICP_FIT[contact.icp_fit]}
                        </span>
                      )}
                      {/* Mensagens não lidas */}
                      {contact.unreadCount > 0 && (
                        <span className="bg-violet-600 text-white text-xs rounded-full px-1.5 py-0.5 shrink-0">
                          {contact.unreadCount}
                        </span>
                      )}
                    </div>
                    {/* Linha 2: preview + meta */}
                    <div className="flex items-center gap-3 text-xs text-zinc-600">
                      <span>{contact.phone}</span>
                      <span>{timeAgo(contact.ultima_mensagem)}</span>
                      {contact.sentimento && (
                        <span className={SENTIMENTO_BADGE[contact.sentimento]?.color}>
                          {SENTIMENTO_BADGE[contact.sentimento]?.label}
                        </span>
                      )}
                      {followup && (
                        <span className={`flex items-center gap-1 ${followup.color}`}>
                          <Calendar className="w-3 h-3" />
                          follow-up {followup.label}
                        </span>
                      )}
                      {contact.preview && (
                        <span className="truncate max-w-[180px]">{contact.preview}</span>
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
              )
            })}
          </div>
        </div>
      </main>
    </div>
  )
}

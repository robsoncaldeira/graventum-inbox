'use client'

import { useState, useLayoutEffect } from 'react'
import useSWR, { mutate as globalMutate } from 'swr'
import Link from 'next/link'
import Sidebar from '@/components/Sidebar'
import { MessageCircle, Users, TrendingUp, Calendar, Trophy, XCircle, Ghost, Sprout, Bot, Search, X } from 'lucide-react'

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
  is_bot: boolean
  has_crm: boolean
}

const ESTAGIOS: Record<string, { label: string; color: string; bg: string }> = {
  novo:            { label: 'Novo',           color: 'text-zinc-400',    bg: 'bg-zinc-700' },
  em_conversa:     { label: 'Em conversa',    color: 'text-blue-400',    bg: 'bg-blue-500/20' },
  qualificado:     { label: 'Qualificado',    color: 'text-green-400',   bg: 'bg-green-500/20' },
  nutricao:        { label: 'Nutrição',       color: 'text-orange-400',  bg: 'bg-orange-500/20' },
  reuniao_marcada: { label: 'Reunião',        color: 'text-violet-400',  bg: 'bg-violet-500/20' },
  ghosting:        { label: 'Ghosting',       color: 'text-zinc-500',    bg: 'bg-zinc-800' },
  ganho:           { label: 'Ganho',          color: 'text-emerald-400', bg: 'bg-emerald-500/20' },
  perdido:         { label: 'Perdido',        color: 'text-red-400',     bg: 'bg-red-500/20' },
}

const ICP_FIT: Record<string, string> = { alto: '🟢', medio: '🟡', baixo: '🔴' }

const SENTIMENTO_BADGE: Record<string, { label: string; color: string }> = {
  positivo: { label: '↑ positivo', color: 'text-green-400' },
  objecao:  { label: '↓ objeção',  color: 'text-red-400' },
  neutro:   { label: '→ neutro',   color: 'text-zinc-500' },
}

const TABS = [
  { key: 'all',            label: 'Todos',       icon: Users,          botFilter: false },
  { key: 'em_conversa',    label: 'Responderam', icon: MessageCircle,  botFilter: false },
  { key: 'followup',       label: 'Follow-up',   icon: Calendar,       botFilter: false },
  { key: 'qualificado',    label: 'Qualificados',icon: TrendingUp,     botFilter: false },
  { key: 'nutricao',       label: 'Nutrição',    icon: Sprout,         botFilter: false },
  { key: 'reuniao_marcada',label: 'Reunião',     icon: Calendar,       botFilter: false },
  { key: 'ghosting',       label: 'Ghosting',    icon: Ghost,          botFilter: false },
  { key: 'ganho',          label: 'Ganhos',      icon: Trophy,         botFilter: false },
  { key: 'perdido',        label: 'Perdidos',    icon: XCircle,        botFilter: false },
  { key: 'bot',            label: 'Bots',        icon: Bot,            botFilter: true  },
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

async function toggleBot(phone: string, isBot: boolean) {
  await fetch(`/api/contacts/${encodeURIComponent(phone)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ is_bot: isBot }),
  })
  globalMutate('/api/leads')
}

export default function LeadsPage() {
  const [activeTab, setActiveTab] = useState('all')
  const [search, setSearch] = useState('')

  // useLayoutEffect: roda antes do paint, sem flash de "Todos"
  useLayoutEffect(() => {
    const saved = sessionStorage.getItem('leads_tab')
    if (saved) setActiveTab(saved)
  }, [])

  const handleSetTab = (tab: string) => {
    setActiveTab(tab)
    sessionStorage.setItem('leads_tab', tab)
  }

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
  const humans = all.filter((c) => !c.is_bot)
  const bots   = all.filter((c) => c.is_bot)

  // Métricas
  const totalProspected = all.length
  const humanResponded  = humans.filter((c) => !c.fromMe || c.unreadCount > 0).length  // humanos com atividade WA atual
  // Responderam confirmados = bots classificados (responderam e foram identificados) + humanos com atividade atual
  const totalResponded  = bots.length + humanResponded
  const humanRate       = totalProspected > 0 ? Math.round((humanResponded / totalProspected) * 100) : 0
  const meetings        = humans.filter((c) => c.estagio === 'reuniao_marcada').length
  const wins            = humans.filter((c) => c.estagio === 'ganho').length
  const qualified       = humans.filter((c) => c.estagio === 'qualificado').length

  // "Em conversa" = atividade WA real (respondeu, independente do estágio CRM)
  const hasWaActivity = (c: Contact) => !c.fromMe || c.unreadCount > 0

  const hasFollowup = (c: Contact) => !!c.proximo_followup

  const countFor = (key: string) => {
    if (key === 'all')         return humans.length
    if (key === 'bot')         return bots.length
    if (key === 'em_conversa') return humans.filter(hasWaActivity).length
    if (key === 'followup')    return humans.filter(hasFollowup).length
    return humans.filter((c) => c.estagio === key).length
  }

  const byTab = (() => {
    if (activeTab === 'all')         return humans
    if (activeTab === 'bot')         return bots
    if (activeTab === 'em_conversa') return humans.filter(hasWaActivity)
    if (activeTab === 'followup')    return humans.filter(hasFollowup).sort((a, b) =>
      new Date(a.proximo_followup!).getTime() - new Date(b.proximo_followup!).getTime()
    )
    return humans.filter((c) => c.estagio === activeTab)
  })()

  const filtered = search.trim()
    ? byTab.filter((c) => {
        const q = search.toLowerCase()
        return (
          c.phone.includes(q) ||
          (c.company_name ?? '').toLowerCase().includes(q) ||
          (c.contact_name ?? '').toLowerCase().includes(q) ||
          (c.pushName ?? '').toLowerCase().includes(q)
        )
      })
    : byTab

  return (
    <div className="flex min-h-screen bg-zinc-950">
      <Sidebar />
      <main className="flex-1 p-6">
        <div className="max-w-4xl mx-auto">

          {/* Header com métricas */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <h1 className="text-white text-lg font-semibold">Funil de Contatos</h1>
              {bots.length > 0 && (
                <span className="text-xs text-zinc-500 flex items-center gap-1.5">
                  <Bot className="w-3.5 h-3.5" />
                  {bots.length} bot{bots.length > 1 ? 's' : ''} filtrado{bots.length > 1 ? 's' : ''}
                </span>
              )}
            </div>
            <div className="grid grid-cols-4 gap-3">
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <p className="text-zinc-500 text-xs mb-1">Total prospectados</p>
                <p className="text-white text-xl font-semibold">{totalProspected}</p>
                <p className="text-zinc-600 text-xs mt-0.5">{totalResponded} responderam · {bots.length} bots</p>
              </div>
              <div className="bg-zinc-900 border border-violet-800/60 rounded-xl p-4">
                <p className="text-zinc-500 text-xs mb-1">Humanos reais</p>
                <p className="text-violet-400 text-xl font-semibold">{humanResponded}</p>
                <p className="text-zinc-600 text-xs mt-0.5">{humanRate}% do total prospectado</p>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <p className="text-zinc-500 text-xs mb-1">Qualificados</p>
                <p className="text-white text-xl font-semibold">{qualified}</p>
                <p className="text-zinc-600 text-xs mt-0.5">com fit confirmado</p>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <p className="text-zinc-500 text-xs mb-1">Reuniões</p>
                <p className="text-white text-xl font-semibold">{meetings}</p>
                <p className="text-zinc-600 text-xs mt-0.5">{wins} ganhos</p>
              </div>
            </div>
          </div>

          {/* Busca + filtro follow-up */}
          <div className="flex gap-2 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nome, empresa ou telefone..."
                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-9 pr-8 py-2 text-white text-xs placeholder-zinc-600 focus:outline-none focus:border-violet-500"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mb-5 flex-wrap">
            {TABS.map(({ key, label, icon: Icon }) => {
              const count = countFor(key)
              const isBot = key === 'bot'
              return (
                <button
                  key={key}
                  onClick={() => handleSetTab(key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors ${
                    activeTab === key
                      ? isBot ? 'bg-zinc-800 text-orange-400' : 'bg-zinc-800 text-white'
                      : isBot ? 'text-orange-500/60 hover:text-orange-400' : 'text-zinc-500 hover:text-zinc-300'
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
                  className={`bg-zinc-900 border rounded-xl p-4 flex items-center gap-4 hover:border-zinc-700 transition-colors ${
                    contact.is_bot ? 'border-orange-900/40 opacity-70' : 'border-zinc-800'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <span className="text-white font-medium text-sm truncate">
                        {contact.company_name ?? contact.pushName ?? contact.phone}
                      </span>
                      {contact.contact_name && (
                        <span className="text-zinc-500 text-xs">{contact.contact_name}</span>
                      )}
                      {contact.is_bot ? (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-400 flex items-center gap-1">
                          <Bot className="w-2.5 h-2.5" /> bot
                        </span>
                      ) : (
                        <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${estagio.bg} ${estagio.color}`}>
                          {estagio.label}
                        </span>
                      )}
                      {contact.icp_fit && !contact.is_bot && (
                        <span className="text-xs shrink-0">{ICP_FIT[contact.icp_fit]}</span>
                      )}
                      {contact.unreadCount > 0 && (
                        <span className="bg-violet-600 text-white text-xs rounded-full px-1.5 py-0.5 shrink-0">
                          {contact.unreadCount}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-zinc-600">
                      <span>{contact.phone}</span>
                      <span>{timeAgo(contact.ultima_mensagem)}</span>
                      {contact.sentimento && !contact.is_bot && (
                        <span className={SENTIMENTO_BADGE[contact.sentimento]?.color}>
                          {SENTIMENTO_BADGE[contact.sentimento]?.label}
                        </span>
                      )}
                      {contact.preview && (
                        <span className="truncate max-w-[180px]">{contact.preview}</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {/* Follow-up badge */}
                    {!contact.is_bot && (
                      <Link
                        href={`/inbox/${encodeURIComponent(contact.remoteJid)}?phone=${encodeURIComponent(contact.phone)}`}
                        title={followup ? `Follow-up: ${followup.label}` : 'Definir follow-up'}
                        className={`flex items-center gap-1.5 text-xs px-2.5 py-2 rounded-lg transition-colors ${
                          followup
                            ? `border ${
                                followup.color === 'text-red-400'
                                  ? 'border-red-800/60 bg-red-500/10 text-red-400'
                                  : followup.color === 'text-yellow-400'
                                  ? 'border-yellow-800/60 bg-yellow-500/10 text-yellow-400'
                                  : followup.color === 'text-blue-400'
                                  ? 'border-blue-800/60 bg-blue-500/10 text-blue-400'
                                  : 'border-zinc-700 bg-zinc-800 text-zinc-400'
                              }`
                            : 'text-zinc-600 hover:text-zinc-400 hover:bg-zinc-800'
                        }`}
                      >
                        <Calendar className="w-3.5 h-3.5 shrink-0" />
                        {followup ? followup.label : <span className="text-zinc-700">—</span>}
                      </Link>
                    )}

                    {/* Botão marcar/desmarcar bot */}
                    <button
                      onClick={() => toggleBot(contact.phone, !contact.is_bot)}
                      title={contact.is_bot ? 'Desmarcar como bot' : 'Marcar como bot'}
                      className={`p-1.5 rounded-lg transition-colors ${
                        contact.is_bot
                          ? 'bg-orange-500/20 text-orange-400 hover:bg-orange-500/30'
                          : 'text-zinc-600 hover:text-orange-400 hover:bg-zinc-800'
                      }`}
                    >
                      <Bot className="w-3.5 h-3.5" />
                    </button>

                    <Link
                      href={`/inbox/${encodeURIComponent(contact.remoteJid)}?phone=${encodeURIComponent(contact.phone)}`}
                      className="flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs px-3 py-2 rounded-lg transition-colors"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      Ver conversa
                    </Link>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </main>
    </div>
  )
}

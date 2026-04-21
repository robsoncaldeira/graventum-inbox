'use client'

import { useState } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import { MessageCircle, Clock, Plus, X, Loader2 } from 'lucide-react'

type Conversation = {
  remoteJid: string
  contact_phone: string
  ultima_mensagem: string
  preview: string
  unreadCount: number
  pushName?: string
  company_name?: string
  contact_name?: string
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

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  // Se comeca com 0, remove (ex: 041... -> 41...)
  const noLeadingZero = digits.replace(/^0+/, '')
  // Se nao comeca com 55, adiciona
  if (!noLeadingZero.startsWith('55')) return `55${noLeadingZero}`
  return noLeadingZero
}

export default function InboxPage() {
  const router = useRouter()
  const [showNewChat, setShowNewChat] = useState(false)
  const [newPhone, setNewPhone] = useState('')
  const [newName, setNewName] = useState('')
  const [newMessage, setNewMessage] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  const { data, isLoading, error, mutate } = useSWR<Conversation[]>('/api/inbox', fetcher, {
    refreshInterval: 30000,
    revalidateOnFocus: false,
  })

  function markAsRead(remoteJid: string) {
    mutate(
      (prev) => prev?.map((c) => c.remoteJid === remoteJid ? { ...c, unreadCount: 0 } : c),
      { revalidate: false }
    )
  }

  async function handleNewChat(e: React.FormEvent) {
    e.preventDefault()
    const phone = normalizePhone(newPhone)
    if (phone.length < 12) {
      setCreateError('Numero invalido — use DDD + numero (ex: 41999998888)')
      return
    }
    setCreating(true)
    setCreateError('')

    try {
      // 1. Criar/atualizar contato no inbox_contacts
      const contactBody: Record<string, string> = { phone }
      if (newName.trim()) contactBody.contact_name = newName.trim()
      // estagio padrao para novo contato
      contactBody.estagio = 'novo'

      await fetch(`/api/contacts/${encodeURIComponent(phone)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(contactBody),
      })

      // 2. Se tem mensagem, envia
      if (newMessage.trim()) {
        const sendRes = await fetch('/api/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone, message: newMessage.trim() }),
        })
        if (!sendRes.ok) {
          const err = await sendRes.json()
          setCreateError(err.error ?? 'Erro ao enviar mensagem')
          setCreating(false)
          return
        }
      }

      // 3. Navegar para a conversa
      const remoteJid = `${phone}@s.whatsapp.net`
      setShowNewChat(false)
      setNewPhone('')
      setNewName('')
      setNewMessage('')
      router.push(`/inbox/${encodeURIComponent(remoteJid)}?phone=${encodeURIComponent(phone)}`)
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Erro inesperado')
    } finally {
      setCreating(false)
    }
  }

  if (error) return (
    <div className="flex min-h-screen bg-zinc-950">
      <Sidebar />
      <main className="flex-1 flex items-center justify-center">
        <p className="text-red-400 text-sm">Erro ao carregar conversas: {error.message}</p>
      </main>
    </div>
  )

  return (
    <div className="flex h-screen bg-zinc-950 overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-white text-lg font-semibold">Conversas</h1>
              <p className="text-zinc-500 text-sm">
                {data ? `${data.length} conversas` : 'Carregando...'}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowNewChat(true)}
                className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white text-xs px-3 py-2 rounded-lg transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Nova conversa
              </button>
              <span className="text-xs text-zinc-600">Atualiza a cada 30s</span>
            </div>
          </div>

          {/* Modal nova conversa */}
          {showNewChat && (
            <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowNewChat(false)}>
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-5">
                  <h2 className="text-white font-semibold">Nova conversa</h2>
                  <button onClick={() => setShowNewChat(false)} className="text-zinc-500 hover:text-white transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                {createError && <p className="text-red-400 text-xs mb-3">{createError}</p>}
                <form onSubmit={handleNewChat} className="space-y-4">
                  <div>
                    <label className="text-zinc-400 text-xs block mb-1.5">Telefone *</label>
                    <input
                      type="tel"
                      value={newPhone}
                      onChange={(e) => setNewPhone(e.target.value)}
                      placeholder="41 99999-8888"
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white placeholder-zinc-600 text-sm focus:outline-none focus:border-violet-500"
                      required
                      autoFocus
                    />
                    <p className="text-zinc-600 text-xs mt-1">DDD + numero. O 55 e adicionado automaticamente.</p>
                  </div>
                  <div>
                    <label className="text-zinc-400 text-xs block mb-1.5">Nome do contato</label>
                    <input
                      type="text"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="Ex: Joao da Contabilidade XYZ"
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white placeholder-zinc-600 text-sm focus:outline-none focus:border-violet-500"
                    />
                  </div>
                  <div>
                    <label className="text-zinc-400 text-xs block mb-1.5">Primeira mensagem</label>
                    <textarea
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      placeholder="Escreva a mensagem inicial (opcional)..."
                      rows={3}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white placeholder-zinc-600 text-sm focus:outline-none focus:border-violet-500 resize-none"
                    />
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setShowNewChat(false)}
                      className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm py-2.5 rounded-xl transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={creating || !newPhone.replace(/\D/g, '')}
                      className="flex-1 bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white text-sm py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2"
                    >
                      {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageCircle className="w-4 h-4" />}
                      {newMessage.trim() ? 'Enviar' : 'Abrir conversa'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

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
                onClick={() => markAsRead(conv.remoteJid)}
                className="block bg-zinc-900 border border-zinc-800 rounded-xl p-4 hover:border-zinc-700 hover:bg-zinc-800/50 transition-all"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-white font-medium text-sm truncate">
                        {conv.company_name ?? conv.contact_name ?? conv.pushName ?? conv.contact_phone}
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

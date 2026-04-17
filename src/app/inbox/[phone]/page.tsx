'use client'

import { use, useState, useRef, useEffect } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import { ArrowLeft, Send, Loader2, Paperclip, MapPin, Star } from 'lucide-react'

type Message = {
  id: number
  direction: 'inbound' | 'outbound'
  event_text: string
  ocorrido_em: string
  event_type: string
  metadata?: Record<string, unknown>
}

type Lead = {
  nome_empresa?: string
  nome_contato?: string
  status_lead?: string
  segmento?: string
  score_fit_graventum?: number
  cidade?: string
  estado?: string
}

type ConversationData = {
  messages: Message[]
  lead: Lead | null
  phone: string
}

const fetcher = async (url: string) => {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
}

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function ConversationPage({
  params,
}: {
  params: Promise<{ phone: string }>
}) {
  const { phone } = use(params)
  const decodedPhone = decodeURIComponent(phone)
  const searchParams = useSearchParams()
  const phoneFromQuery = searchParams.get('phone')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const { data, mutate, isLoading } = useSWR<ConversationData>(
    `/api/inbox/${encodeURIComponent(decodedPhone)}`,
    fetcher,
    { refreshInterval: 30000 }
  )

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [data?.messages])

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if ((!message.trim() && !file) || sending) return
    setSending(true)
    setSendError('')

    try {
      if (file) {
        // Enviar arquivo
        const fd = new FormData()
        fd.append('phone', actualPhone)
        fd.append('file', file)
        if (message.trim()) fd.append('caption', message.trim())
        const res = await fetch('/api/send-media', { method: 'POST', body: fd })
        if (!res.ok) {
          const err = await res.json()
          setSendError(err.error ?? 'Erro ao enviar arquivo')
          setSending(false)
          return
        }
        setFile(null)
        setMessage('')
      } else {
        // Enviar texto
        const res = await fetch('/api/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: actualPhone, message }),
        })
        if (!res.ok) {
          const err = await res.json()
          setSendError(err.error ?? 'Erro ao enviar')
          setSending(false)
          return
        }
        setMessage('')
      }
      mutate()
    } finally {
      setSending(false)
    }
  }

  // Prioridade: API response (extraído dos registros de mensagem — mais confiável para @lid)
  // > query param (chat list, pode ser LID) > fallback do JID
  const actualPhone = data?.phone ?? phoneFromQuery ?? decodedPhone.replace('@s.whatsapp.net', '').replace('@lid', '')
  const lead = data?.lead
  const messages = data?.messages ?? []

  return (
    <div className="flex min-h-screen bg-zinc-950">
      <Sidebar />
      <main className="flex-1 flex flex-col">
        {/* Header */}
        <div className="border-b border-zinc-800 px-6 py-4 bg-zinc-900 flex items-center gap-4">
          <Link href="/inbox" className="text-zinc-400 hover:text-white transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex-1">
            <h1 className="text-white font-medium">
              {lead?.nome_empresa ?? decodedPhone}
            </h1>
            <p className="text-zinc-500 text-sm">{actualPhone}</p>
          </div>
          {/* Info do lead */}
          {lead && (
            <div className="flex items-center gap-3 text-xs text-zinc-500">
              {lead.score_fit_graventum && (
                <span className="flex items-center gap-1">
                  <Star className="w-3 h-3" />
                  {lead.score_fit_graventum}
                </span>
              )}
              {lead.cidade && (
                <span className="flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  {lead.cidade}/{lead.estado}
                </span>
              )}
              {lead.segmento && (
                <span className="bg-zinc-800 px-2 py-1 rounded-full">{lead.segmento}</span>
              )}
            </div>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {isLoading && (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 animate-spin text-zinc-600" />
            </div>
          )}
          {messages.length === 0 && !isLoading && (
            <p className="text-center text-zinc-600 py-10">Nenhuma mensagem ainda</p>
          )}
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[70%] rounded-2xl px-4 py-2.5 ${
                  msg.direction === 'outbound'
                    ? 'bg-violet-700 text-white rounded-br-sm'
                    : 'bg-zinc-800 text-zinc-100 rounded-bl-sm'
                }`}
              >
                <p className="text-sm whitespace-pre-wrap break-words">{msg.event_text}</p>
                <p className={`text-xs mt-1 ${msg.direction === 'outbound' ? 'text-violet-300' : 'text-zinc-500'}`}>
                  {formatTime(msg.ocorrido_em)}
                  {msg.metadata && (msg.metadata as Record<string, string>).sent_by === 'team_inbox' && (
                    <span className="ml-1 opacity-70">· time</span>
                  )}
                </p>
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="border-t border-zinc-800 bg-zinc-900 px-6 py-4">
          {sendError && (
            <p className="text-red-400 text-xs mb-2">{sendError}</p>
          )}
          {file && (
            <div className="flex items-center gap-2 mb-2 bg-zinc-800 rounded-lg px-3 py-2">
              <Paperclip className="w-3.5 h-3.5 text-violet-400 shrink-0" />
              <span className="text-zinc-300 text-xs truncate flex-1">{file.name}</span>
              <button
                type="button"
                onClick={() => setFile(null)}
                className="text-zinc-500 hover:text-white text-xs ml-2 shrink-0"
              >
                ✕
              </button>
            </div>
          )}
          <form onSubmit={handleSend} className="flex gap-2">
            {/* Botão de anexo */}
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white rounded-xl px-3 py-2.5 transition-colors shrink-0"
              title="Anexar arquivo"
            >
              <Paperclip className="w-4 h-4" />
            </button>
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={file ? 'Legenda (opcional)...' : 'Digite sua mensagem...'}
              className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white placeholder-zinc-500 text-sm focus:outline-none focus:border-violet-500"
              disabled={sending}
            />
            <button
              type="submit"
              disabled={(!message.trim() && !file) || sending || isLoading}
              className="bg-violet-600 hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl px-4 py-2.5 transition-colors flex items-center gap-2 text-sm shrink-0"
            >
              {sending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </form>
        </div>
      </main>
    </div>
  )
}

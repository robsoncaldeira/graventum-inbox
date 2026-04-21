'use client'

import { useState, useRef, useEffect } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import ContactPanel from '@/components/ContactPanel'
import { ArrowLeft, Send, Loader2, Paperclip, SlidersHorizontal, Bot, Mic, Trash2 } from 'lucide-react'

type Message = {
  id: number
  direction: 'inbound' | 'outbound'
  event_text: string
  ocorrido_em: string
  event_type: string
  metadata?: Record<string, unknown>
}

type Lead = {
  company_name?: string
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

type ContactData = {
  phone: string
  push_name?: string | null
  company_name?: string | null
  contact_name?: string | null
  cargo?: string | null
  origem?: string | null
  estagio?: string
  icp_fit?: 'alto' | 'medio' | 'baixo' | null
  dor_identificada?: string | null
  objecao?: string | null
  notas?: string | null
  proximo_followup?: string | null
  motivo_perda?: string | null
  sentimento?: 'positivo' | 'objecao' | 'neutro' | null
  is_bot?: boolean
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

const ESTAGIO_COLORS: Record<string, string> = {
  em_conversa:     'text-blue-400',
  qualificado:     'text-green-400',
  nutricao:        'text-orange-400',
  reuniao_marcada: 'text-violet-400',
  ghosting:        'text-zinc-500',
  ganho:           'text-emerald-400',
  perdido:         'text-red-400',
}

const ESTAGIO_LABELS: Record<string, string> = {
  em_conversa:     'Em conversa',
  qualificado:     'Qualificado',
  nutricao:        'Nutrição',
  reuniao_marcada: 'Reunião marcada',
  ghosting:        'Ghosting',
  ganho:           'Ganho',
  perdido:         'Perdido',
}

const ICP_FIT: Record<string, string> = { alto: '🟢', medio: '🟡', baixo: '🔴' }

export default function ConversationView({
  remoteJid,
  phoneHint,
  backHref,
}: {
  remoteJid: string
  phoneHint: string | null
  backHref: string
}) {
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const [pendingMessages, setPendingMessages] = useState<Message[]>([])
  const [recording, setRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  function stopRecordingCleanup() {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current)
      recordingTimerRef.current = null
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    mediaRecorderRef.current = null
    audioChunksRef.current = []
    setRecording(false)
    setRecordingTime(0)
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = MediaRecorder.isTypeSupported('audio/ogg; codecs=opus')
        ? 'audio/ogg; codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm; codecs=opus')
        ? 'audio/webm; codecs=opus'
        : 'audio/webm'
      const recorder = new MediaRecorder(stream, { mimeType })
      audioChunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }

      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
      }

      recorder.start()
      mediaRecorderRef.current = recorder
      setRecording(true)
      setRecordingTime(0)
      recordingTimerRef.current = setInterval(() => {
        setRecordingTime((t) => t + 1)
      }, 1000)
    } catch {
      setSendError('Permissao de microfone negada')
    }
  }

  function cancelRecording() {
    stopRecordingCleanup()
  }

  async function sendRecording() {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') return

    const recorder = mediaRecorderRef.current
    return new Promise<void>((resolve) => {
      const originalOnStop = recorder.onstop
      recorder.onstop = async (ev) => {
        if (originalOnStop) (originalOnStop as (ev: Event) => void)(ev)
        if (recordingTimerRef.current) {
          clearInterval(recordingTimerRef.current)
          recordingTimerRef.current = null
        }

        const ext = recorder.mimeType.includes('ogg') ? 'ogg' : 'webm'
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType })
        const audioFile = new File([blob], `audio.${ext}`, { type: recorder.mimeType })

        setRecording(false)
        setRecordingTime(0)
        mediaRecorderRef.current = null
        audioChunksRef.current = []

        setSending(true)
        setSendError('')
        const pendingId = Date.now()
        const optimisticMsg: Message = {
          id: pendingId,
          direction: 'outbound',
          event_text: `[audio ${formatRecTime(recordingTime)}]`,
          ocorrido_em: new Date().toISOString(),
          event_type: 'media',
          metadata: { sent_by: 'team_inbox' },
        }
        setPendingMessages((prev) => [...prev, optimisticMsg])

        try {
          const fd = new FormData()
          fd.append('phone', actualPhone)
          fd.append('file', audioFile)
          const res = await fetch('/api/send-media', { method: 'POST', body: fd })
          if (!res.ok) {
            const errText = await res.text()
            let errMsg: string
            try { errMsg = JSON.parse(errText).error ?? errText } catch { errMsg = errText }
            setSendError(`Erro ${res.status}: ${errMsg}`)
            setPendingMessages((prev) => prev.filter((m) => m.id !== pendingId))
          } else {
            setTimeout(() => mutate(), 4000)
          }
        } finally {
          setSending(false)
        }
        resolve()
      }
      recorder.stop()
    })
  }

  function formatRecTime(secs: number) {
    const m = Math.floor(secs / 60)
    const s = secs % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  const { data, mutate, isLoading } = useSWR<ConversationData>(
    `/api/inbox/${encodeURIComponent(remoteJid)}${phoneHint ? `?phone=${encodeURIComponent(phoneHint)}` : ''}`,
    fetcher,
    { refreshInterval: 30000 }
  )

  const actualPhone = data?.phone ?? phoneHint ?? remoteJid.replace('@s.whatsapp.net', '').replace('@lid', '')
  const { data: contactData, mutate: mutateContact } = useSWR<ContactData | null>(
    actualPhone ? `/api/contacts/${encodeURIComponent(actualPhone)}` : null,
    fetcher
  )

  useEffect(() => {
    if (!data?.messages || pendingMessages.length === 0) return
    const serverTexts = new Set(
      data.messages
        .filter((m) => m.direction === 'outbound')
        .map((m) => m.event_text)
    )
    setPendingMessages((prev) =>
      prev.filter((m) => !serverTexts.has(m.event_text))
    )
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.messages])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [data?.messages, pendingMessages])

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if ((!message.trim() && !file) || sending) return
    setSending(true)
    setSendError('')

    const optimisticText = file
      ? (message.trim() ? `[arquivo] ${message.trim()}` : '[arquivo]')
      : message.trim()

    const pendingId = Date.now()
    const optimisticMsg: Message = {
      id: pendingId,
      direction: 'outbound',
      event_text: optimisticText,
      ocorrido_em: new Date().toISOString(),
      event_type: file ? 'media' : 'text',
      metadata: { sent_by: 'team_inbox' },
    }

    setPendingMessages((prev) => [...prev, optimisticMsg])

    try {
      if (file) {
        const fd = new FormData()
        fd.append('phone', actualPhone)
        fd.append('file', file)
        if (message.trim()) fd.append('caption', message.trim())
        const res = await fetch('/api/send-media', { method: 'POST', body: fd })
        if (!res.ok) {
          const err = await res.json()
          setSendError(err.error ?? 'Erro ao enviar arquivo')
          setPendingMessages((prev) => prev.filter((m) => m.id !== pendingId))
          return
        }
        setFile(null)
        setMessage('')
      } else {
        const res = await fetch('/api/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: actualPhone, message }),
        })
        if (!res.ok) {
          const err = await res.json()
          setSendError(err.error ?? 'Erro ao enviar')
          setPendingMessages((prev) => prev.filter((m) => m.id !== pendingId))
          return
        }
        setMessage('')
      }
      setTimeout(() => mutate(), 4000)
    } finally {
      setSending(false)
    }
  }

  const lead = data?.lead
  const messages = [...(data?.messages ?? []), ...pendingMessages]
  const displayName = contactData?.company_name ?? lead?.company_name ?? contactData?.contact_name ?? remoteJid

  return (
    <>
      {/* Area principal da conversa */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="border-b border-zinc-800 px-6 py-4 bg-zinc-900 flex items-center gap-4">
          <Link href={backHref} className="text-zinc-400 hover:text-white transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-white font-medium truncate">{displayName}</h1>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-zinc-500">{actualPhone}</span>
              {contactData?.estagio && (
                <span className={`${ESTAGIO_COLORS[contactData.estagio] ?? 'text-zinc-400'}`}>
                  · {ESTAGIO_LABELS[contactData.estagio] ?? contactData.estagio}
                </span>
              )}
              {contactData?.icp_fit && (
                <span>{ICP_FIT[contactData.icp_fit]}</span>
              )}
            </div>
          </div>
          <button
            onClick={async () => {
              const newVal = !(contactData?.is_bot ?? false)
              mutateContact((prev) => prev ? { ...prev, is_bot: newVal } : { phone: actualPhone, is_bot: newVal }, { revalidate: false })
              await fetch(`/api/contacts/${encodeURIComponent(actualPhone)}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ is_bot: newVal, remote_jid: remoteJid }),
              })
              mutateContact()
            }}
            title={contactData?.is_bot ? 'Desmarcar bot' : 'Marcar como bot'}
            className={`p-2 rounded-lg transition-colors ${
              contactData?.is_bot
                ? 'bg-orange-500/20 text-orange-400 hover:bg-orange-500/30'
                : 'bg-zinc-800 text-zinc-600 hover:text-orange-400'
            }`}
          >
            <Bot className="w-4 h-4" />
          </button>
          <button
            onClick={() => setPanelOpen((v) => !v)}
            className={`p-2 rounded-lg transition-colors ${panelOpen ? 'bg-violet-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-white'}`}
            title="Painel do contato"
          >
            <SlidersHorizontal className="w-4 h-4" />
          </button>
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
                } ${pendingMessages.some((p) => p.id === msg.id) ? 'opacity-70' : ''}`}
              >
                <p className="text-sm whitespace-pre-wrap break-words">{msg.event_text}</p>
                <p className={`text-xs mt-1 ${msg.direction === 'outbound' ? 'text-violet-300' : 'text-zinc-500'}`}>
                  {formatTime(msg.ocorrido_em)}
                  {(msg.metadata as Record<string, string>)?.sent_by === 'team_inbox' && (
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
          {sendError && <p className="text-red-400 text-xs mb-2">{sendError}</p>}
          {file && !recording && (
            <div className="flex items-center gap-2 mb-2 bg-zinc-800 rounded-lg px-3 py-2">
              <Paperclip className="w-3.5 h-3.5 text-violet-400 shrink-0" />
              <span className="text-zinc-300 text-xs truncate flex-1">{file.name}</span>
              <button type="button" onClick={() => setFile(null)} className="text-zinc-500 hover:text-white text-xs ml-2 shrink-0">x</button>
            </div>
          )}

          {recording ? (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={cancelRecording}
                className="bg-zinc-800 hover:bg-zinc-700 text-red-400 hover:text-red-300 rounded-xl px-3 py-2.5 transition-colors shrink-0"
                title="Cancelar gravacao"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <div className="flex-1 flex items-center gap-3 bg-zinc-800 border border-red-500/40 rounded-xl px-4 py-2.5">
                <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse shrink-0" />
                <span className="text-red-400 text-sm font-mono">{formatRecTime(recordingTime)}</span>
                <span className="text-zinc-500 text-xs">Gravando audio...</span>
              </div>
              <button
                type="button"
                onClick={sendRecording}
                disabled={sending}
                className="bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white rounded-xl px-4 py-2.5 transition-colors flex items-center gap-2 text-sm shrink-0"
                title="Enviar audio"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
          ) : (
            <form onSubmit={handleSend} className="flex gap-2">
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
              {message.trim() || file ? (
                <button
                  type="submit"
                  disabled={(!message.trim() && !file) || sending || isLoading}
                  className="bg-violet-600 hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl px-4 py-2.5 transition-colors flex items-center gap-2 text-sm shrink-0"
                >
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={startRecording}
                  disabled={sending || isLoading}
                  className="bg-zinc-800 hover:bg-violet-600 disabled:opacity-40 text-zinc-400 hover:text-white rounded-xl px-4 py-2.5 transition-colors flex items-center gap-2 text-sm shrink-0"
                  title="Gravar audio"
                >
                  <Mic className="w-4 h-4" />
                </button>
              )}
            </form>
          )}
        </div>
      </div>

      {/* Painel CRM lateral */}
      {panelOpen && (
        <ContactPanel
          phone={actualPhone}
          remoteJid={remoteJid}
          initialData={contactData ?? null}
          onClose={() => setPanelOpen(false)}
        />
      )}
    </>
  )
}

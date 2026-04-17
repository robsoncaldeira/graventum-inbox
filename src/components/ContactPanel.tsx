'use client'

import { useState } from 'react'
import { ChevronDown, Save, Calendar, X } from 'lucide-react'

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
}

const ESTAGIOS = [
  { value: 'em_conversa',     label: 'Em conversa' },
  { value: 'qualificado',     label: 'Qualificado' },
  { value: 'nutricao',        label: 'Nutrição' },
  { value: 'reuniao_marcada', label: 'Reunião marcada' },
  { value: 'ghosting',        label: 'Ghosting' },
  { value: 'ganho',           label: 'Ganho' },
  { value: 'perdido',         label: 'Perdido' },
]

const ESTAGIO_COLORS: Record<string, string> = {
  em_conversa:     'text-blue-400',
  qualificado:     'text-green-400',
  nutricao:        'text-orange-400',
  reuniao_marcada: 'text-violet-400',
  ghosting:        'text-zinc-500',
  ganho:           'text-emerald-400',
  perdido:         'text-red-400',
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-zinc-500 text-xs mb-1">{label}</p>
      {children}
    </div>
  )
}

function TextInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-white text-xs placeholder-zinc-600 focus:outline-none focus:border-violet-500"
    />
  )
}

function TextArea({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={3}
      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-white text-xs placeholder-zinc-600 focus:outline-none focus:border-violet-500 resize-none"
    />
  )
}

function Select({ value, onChange, options }: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-white text-xs focus:outline-none focus:border-violet-500 pr-7"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 pointer-events-none" />
    </div>
  )
}

export default function ContactPanel({
  phone,
  initialData,
  onClose,
}: {
  phone: string
  initialData: ContactData | null
  onClose: () => void
}) {
  const [form, setForm] = useState<ContactData>({
    phone,
    push_name: initialData?.push_name ?? null,
    company_name: initialData?.company_name ?? '',
    contact_name: initialData?.contact_name ?? '',
    cargo: initialData?.cargo ?? '',
    origem: initialData?.origem ?? '',
    estagio: initialData?.estagio ?? 'em_conversa',
    icp_fit: initialData?.icp_fit ?? null,
    dor_identificada: initialData?.dor_identificada ?? '',
    objecao: initialData?.objecao ?? '',
    notas: initialData?.notas ?? '',
    proximo_followup: initialData?.proximo_followup
      ? new Date(initialData.proximo_followup).toISOString().slice(0, 16)
      : '',
    motivo_perda: initialData?.motivo_perda ?? '',
    sentimento: initialData?.sentimento ?? null,
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const set = (key: keyof ContactData) => (value: string) =>
    setForm((f) => ({ ...f, [key]: value || null }))

  async function handleSave() {
    setSaving(true)
    const payload: Record<string, unknown> = { ...form }
    if (payload.proximo_followup === '') payload.proximo_followup = null
    if (payload.company_name === '') payload.company_name = null
    if (payload.contact_name === '') payload.contact_name = null
    if (payload.cargo === '') payload.cargo = null
    if (payload.origem === '') payload.origem = null
    if (payload.dor_identificada === '') payload.dor_identificada = null
    if (payload.objecao === '') payload.objecao = null
    if (payload.notas === '') payload.notas = null
    if (payload.motivo_perda === '') payload.motivo_perda = null

    await fetch(`/api/contacts/${encodeURIComponent(phone)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const currentEstagio = ESTAGIOS.find((e) => e.value === form.estagio)

  return (
    <div className="w-72 shrink-0 border-l border-zinc-800 bg-zinc-900 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div>
          <p className="text-white text-sm font-medium">{form.company_name || form.push_name || phone}</p>
          <p className={`text-xs ${ESTAGIO_COLORS[form.estagio ?? ''] ?? 'text-zinc-400'}`}>
            {currentEstagio?.label ?? 'Em conversa'}
          </p>
        </div>
        <button onClick={onClose} className="text-zinc-500 hover:text-white">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Campos */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        <Field label="Etapa">
          <Select
            value={form.estagio ?? 'em_conversa'}
            onChange={set('estagio')}
            options={ESTAGIOS}
          />
        </Field>

        <Field label="ICP Fit">
          <Select
            value={form.icp_fit ?? ''}
            onChange={set('icp_fit')}
            options={[
              { value: '', label: '— não definido —' },
              { value: 'alto',  label: '🟢 Alto' },
              { value: 'medio', label: '🟡 Médio' },
              { value: 'baixo', label: '🔴 Baixo' },
            ]}
          />
        </Field>

        <Field label="Sentimento da última resposta">
          <Select
            value={form.sentimento ?? ''}
            onChange={set('sentimento')}
            options={[
              { value: '',         label: '— não definido —' },
              { value: 'positivo', label: '↑ Positivo' },
              { value: 'objecao',  label: '↓ Objeção' },
              { value: 'neutro',   label: '→ Neutro' },
            ]}
          />
        </Field>

        <div className="border-t border-zinc-800 pt-4">
          <p className="text-zinc-500 text-xs font-medium uppercase tracking-wider mb-3">Dados do contato</p>
          <div className="space-y-3">
            <Field label="Empresa">
              <TextInput value={form.company_name ?? ''} onChange={set('company_name')} placeholder="Nome da empresa" />
            </Field>
            <Field label="Nome do contato">
              <TextInput value={form.contact_name ?? ''} onChange={set('contact_name')} placeholder="Nome" />
            </Field>
            <Field label="Cargo">
              <TextInput value={form.cargo ?? ''} onChange={set('cargo')} placeholder="Ex: Gerente, Sócio..." />
            </Field>
            <Field label="Origem">
              <TextInput value={form.origem ?? ''} onChange={set('origem')} placeholder="Ex: LinkedIn, SDR..." />
            </Field>
          </div>
        </div>

        <div className="border-t border-zinc-800 pt-4">
          <p className="text-zinc-500 text-xs font-medium uppercase tracking-wider mb-3">Qualificação</p>
          <div className="space-y-3">
            <Field label="Dor identificada">
              <TextArea value={form.dor_identificada ?? ''} onChange={set('dor_identificada')} placeholder="Qual problema eles têm?" />
            </Field>
            <Field label="Objeção">
              <TextArea value={form.objecao ?? ''} onChange={set('objecao')} placeholder="O que está travando?" />
            </Field>
            {form.estagio === 'perdido' && (
              <Field label="Motivo da perda">
                <TextArea value={form.motivo_perda ?? ''} onChange={set('motivo_perda')} placeholder="Por que perdemos?" />
              </Field>
            )}
          </div>
        </div>

        <div className="border-t border-zinc-800 pt-4 space-y-3">
          <Field label="Próximo follow-up">
            <div className="relative">
              <input
                type="datetime-local"
                value={form.proximo_followup ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, proximo_followup: e.target.value || null }))}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-white text-xs focus:outline-none focus:border-violet-500"
              />
              <Calendar className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 pointer-events-none" />
            </div>
          </Field>

          <Field label="Notas livres">
            <TextArea value={form.notas ?? ''} onChange={set('notas')} placeholder="Observações, contexto..." />
          </Field>
        </div>
      </div>

      {/* Footer salvar */}
      <div className="px-4 py-3 border-t border-zinc-800">
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-sm py-2 rounded-lg transition-colors"
        >
          <Save className="w-3.5 h-3.5" />
          {saved ? 'Salvo!' : saving ? 'Salvando...' : 'Salvar'}
        </button>
      </div>
    </div>
  )
}

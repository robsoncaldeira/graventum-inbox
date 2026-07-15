// Cliente da API oficial Gupshup (WhatsApp Business API).
// Docs: https://docs.gupshup.io/reference/msg  |  https://docs.gupshup.io/reference/template
//
// Envio (form-urlencoded, header apikey):
//   - sessao (texto livre, dentro da janela 24h):  POST /wa/api/v1/msg
//   - template (business-initiated / janela fechada): POST /wa/api/v1/template/msg
// Inbound e status chegam por webhook (ver parseWebhook).

const API_BASE = 'https://api.gupshup.io/wa/api/v1'

function apiKey(): string {
  const k = process.env.GUPSHUP_API_KEY
  if (!k) throw new Error('GUPSHUP_API_KEY nao configurada')
  return k
}
function source(): string {
  const s = process.env.GUPSHUP_SOURCE
  if (!s) throw new Error('GUPSHUP_SOURCE (numero WA) nao configurado')
  return s
}
function appName(): string {
  const a = process.env.GUPSHUP_APP_NAME
  if (!a) throw new Error('GUPSHUP_APP_NAME nao configurado')
  return a
}

export interface GupshupSendResult {
  status?: string
  messageId?: string
  raw: unknown
}

async function postForm(path: string, form: Record<string, string>): Promise<GupshupSendResult> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      apikey: apiKey(),
      accept: 'application/json',
    },
    body: new URLSearchParams(form).toString(),
  })
  const text = await res.text()
  let json: Record<string, unknown>
  try {
    json = JSON.parse(text) as Record<string, unknown>
  } catch {
    json = { raw: text }
  }
  if (!res.ok) {
    throw new Error(`Gupshup ${res.status}: ${text}`)
  }
  return {
    status: (json.status as string) || undefined,
    messageId: (json.messageId as string) || undefined,
    raw: json,
  }
}

/** Mensagem de sessao (texto livre). So valida dentro da janela de 24h. */
export function sendSessionText(destination: string, text: string): Promise<GupshupSendResult> {
  return postForm('/msg', {
    channel: 'whatsapp',
    source: source(),
    'src.name': appName(),
    destination,
    message: JSON.stringify({ type: 'text', text }),
  })
}

/** Mensagem de template (HSM aprovado). Usada no primeiro contato / janela fechada. */
export function sendTemplate(
  destination: string,
  templateId: string,
  params: string[] = [],
): Promise<GupshupSendResult> {
  return postForm('/template/msg', {
    channel: 'whatsapp',
    source: source(),
    'src.name': appName(),
    destination,
    template: JSON.stringify({ id: templateId, params }),
  })
}

// ─── Webhook ───────────────────────────────────────────────────────────────

export type ParsedWebhook =
  | {
      kind: 'message'
      phone: string
      name: string | null
      text: string
      mediaUrl: string | null
      mediaType: string | null
      messageId: string | null
      timestampMs: number
    }
  | {
      kind: 'status'
      messageId: string | null
      status: string // enqueued | sent | delivered | read | failed
      timestampMs: number
    }
  | { kind: 'ignore' }

function tsMs(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : Date.now()
}

/** Normaliza o payload do Gupshup para uma forma unica consumivel pelo webhook route. */
export function parseWebhook(body: Record<string, unknown>): ParsedWebhook {
  const type = String(body.type || '')
  const timestampMs = tsMs(body.timestamp)

  if (type === 'message') {
    const p = (body.payload || {}) as Record<string, unknown>
    const sender = (p.sender || {}) as Record<string, unknown>
    const inner = (p.payload || {}) as Record<string, unknown>
    const msgType = String(p.type || 'text')

    let text = ''
    let mediaUrl: string | null = null
    let mediaType: string | null = null

    if (msgType === 'text' || msgType === 'button_reply' || msgType === 'list_reply') {
      text = String(inner.text || inner.title || '')
    } else if (['image', 'video', 'audio', 'file', 'sticker'].includes(msgType)) {
      mediaUrl = (inner.url as string) || null
      mediaType = msgType
      text = (inner.caption as string) || `[${msgType}]`
    } else if (msgType === 'location') {
      text = '[localizacao]'
    } else if (msgType === 'contact') {
      text = '[contato]'
    } else {
      text = `[${msgType}]`
    }

    const phone =
      (sender.phone as string) ||
      (p.source as string) ||
      ''

    return {
      kind: 'message',
      phone,
      name: (sender.name as string) || null,
      text,
      mediaUrl,
      mediaType,
      messageId: (p.id as string) || null,
      timestampMs,
    }
  }

  if (type === 'message-event') {
    const p = (body.payload || {}) as Record<string, unknown>
    return {
      kind: 'status',
      messageId: (p.id as string) || (p.gsId as string) || null,
      status: String(p.type || ''),
      timestampMs,
    }
  }

  return { kind: 'ignore' }
}

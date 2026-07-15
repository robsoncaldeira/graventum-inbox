// Provider WhatsApp e utilitarios compartilhados (envio manual pelo Inbox).
// WA_PROVIDER seleciona o backend: 'gupshup' (API oficial Meta) ou 'evolution' (legado).

export type WaProvider = 'gupshup' | 'evolution'

export const WA_PROVIDER: WaProvider =
  (process.env.WA_PROVIDER || 'evolution').toLowerCase() === 'gupshup' ? 'gupshup' : 'evolution'

const TEST_NUMBERS = (process.env.WA_TEST_NUMBERS || '')
  .split(',')
  .map((s) => s.replace(/\D/g, ''))
  .filter(Boolean)

/** Normaliza numero brasileiro para E.164 sem '+' (ex: 5541985216023). */
export function normalizePhone(phone: string): string {
  const digits = String(phone || '').replace(/\D/g, '')
  if (digits.startsWith('55') && digits.length >= 12) return digits
  if (digits.length === 10 || digits.length === 11) return '55' + digits
  return digits
}

/**
 * Retorna o numero canonico para brasileiros: celulares sem 9 recebem o 9.
 * Ex: 554185216023 -> 5541985216023.
 * Fixos e numeros ja com 9 permanecem inalterados.
 */
export function canonicalPhone(phone: string): string {
  const digits = normalizePhone(phone)
  if (!digits.startsWith('55') || digits.length < 12) return digits

  // BR celular sem 9: 55 + DDD(2) + 8 digitos comecando com 8/9
  if (digits.length === 12) {
    const afterDdd = digits.slice(4)
    if (afterDdd.length === 8 && /^[89]/.test(afterDdd)) {
      return digits.slice(0, 4) + '9' + afterDdd
    }
  }
  return digits
}

/** Gera variantes de um numero BR para busca (com e sem 9). */
export function phoneVariants(phone: string): string[] {
  const variants = new Set<string>([phone])
  if (phone.startsWith('55') && phone.length === 13) {
    variants.add(phone.slice(0, 4) + phone.slice(5))
  }
  if (phone.startsWith('55') && phone.length === 12) {
    variants.add(phone.slice(0, 4) + '9' + phone.slice(4))
  }
  return Array.from(variants)
}

/**
 * Gate de seguranca (regra global Graventum): enquanto WA_ALLOW_ALL !== 'true',
 * so numeros em WA_TEST_NUMBERS podem receber envio. Sem lista => bloqueia tudo.
 */
export function isAllowedDestination(phone: string): boolean {
  if (process.env.WA_ALLOW_ALL === 'true') return true
  if (TEST_NUMBERS.length === 0) return false
  return TEST_NUMBERS.includes(normalizePhone(phone))
}

export const WA_BLOCK_MESSAGE =
  'Numero nao autorizado para envio. Libere em WA_TEST_NUMBERS ou WA_ALLOW_ALL=true (com autorizacao).'

/** Janela de 24h da API oficial: texto livre so e permitido apos inbound recente. */
export const SESSION_WINDOW_MS = 24 * 60 * 60 * 1000

export function isWindowOpen(lastInboundAtIso: string | null | undefined): boolean {
  if (!lastInboundAtIso) return false
  return Date.now() - new Date(lastInboundAtIso).getTime() < SESSION_WINDOW_MS
}

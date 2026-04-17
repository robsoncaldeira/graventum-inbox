const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL!
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY!
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE!

export async function sendWhatsAppMessage(phone: string, text: string) {
  const res = await fetch(
    `${EVOLUTION_API_URL}/message/sendText/${EVOLUTION_INSTANCE}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: EVOLUTION_API_KEY,
      },
      body: JSON.stringify({ number: phone, text }),
    }
  )
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Evolution API error: ${res.status} — ${err}`)
  }
  return res.json()
}

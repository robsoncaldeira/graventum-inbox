import { NextRequest, NextResponse } from 'next/server'
import { isAuthenticatedFromRequest } from '@/lib/auth'

export const dynamic = 'force-dynamic'

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL!
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY!
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE!

// Mapeia extensão para mediaType da Evolution API
function getMediaType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return 'image'
  if (['mp4', 'mov', 'avi', 'webm'].includes(ext)) return 'video'
  if (['mp3', 'ogg', 'aac', 'm4a', 'opus'].includes(ext)) return 'audio'
  return 'document'
}

export async function POST(req: NextRequest) {
  if (!isAuthenticatedFromRequest(req)) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const formData = await req.formData()
  const phone = formData.get('phone') as string
  const file = formData.get('file') as File | null
  const caption = (formData.get('caption') as string) ?? ''

  if (!phone || !file) {
    return NextResponse.json({ error: 'phone e file são obrigatórios' }, { status: 400 })
  }

  try {
    // Converter arquivo para base64
    const bytes = await file.arrayBuffer()
    const base64 = Buffer.from(bytes).toString('base64')
    const mediaType = getMediaType(file.name)
    const mimetype = file.type || 'application/octet-stream'

    const res = await fetch(
      `${EVOLUTION_API_URL}/message/sendMedia/${EVOLUTION_INSTANCE}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: EVOLUTION_API_KEY },
        body: JSON.stringify({
          number: phone,
          mediatype: mediaType,
          mimetype,
          caption,
          media: base64,
          fileName: file.name,
        }),
      }
    )

    if (!res.ok) {
      const err = await res.json()
      return NextResponse.json({ error: JSON.stringify(err) }, { status: 502 })
    }

    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

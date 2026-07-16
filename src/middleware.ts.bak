import { NextRequest, NextResponse } from 'next/server'

// /api/webhook/* e publico (validado por token proprio) — o Gupshup posta sem cookie.
const PUBLIC_PATHS = ['/api/webhook']
// Sem login proprio: acesso e sempre via portal AMI (iframe com embed_key).
const PORTAL_URL = 'https://ami.graventum.com'
const EMBED_KEY = process.env.INBOX_EMBED_KEY || ''

export function middleware(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p))
  const session = req.cookies.get('inbox_session')?.value

  // Allow embed access via query param (for cross-origin iframe)
  const embedKey = searchParams.get('embed_key')
  const isEmbedAuth = EMBED_KEY && embedKey === EMBED_KEY

  if (!isPublic && session !== 'ok' && !isEmbedAuth) {
    return NextResponse.redirect(PORTAL_URL)
  }

  // If embed auth, set cookie so subsequent navigations within iframe work
  if (isEmbedAuth && session !== 'ok') {
    const res = NextResponse.next()
    res.cookies.set('inbox_session', 'ok', {
      httpOnly: true,
      secure: true,
      sameSite: 'none', // Required for cross-origin iframe
      maxAge: 60 * 60 * 8,
      path: '/',
    })
    return res
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}

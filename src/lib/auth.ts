import { cookies } from 'next/headers'
import { NextRequest } from 'next/server'

export async function isAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies()
  return cookieStore.get('inbox_session')?.value === 'ok'
}

export function isAuthenticatedFromRequest(req: NextRequest): boolean {
  const cookieSession = req.cookies.get('inbox_session')?.value === 'ok'
  if (cookieSession) return true

  // Support embed token fallback for environments where cookies are blocked
  const EMBED_KEY = process.env.INBOX_EMBED_KEY || ''
  const embedKey = req.headers.get('x-embed-key') || 
                    req.nextUrl.searchParams.get('embed_key') || 
                    req.headers.get('Authorization')?.replace('Bearer ', '')
  
  return !!(EMBED_KEY && embedKey === EMBED_KEY)
}

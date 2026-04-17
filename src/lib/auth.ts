import { cookies } from 'next/headers'
import { NextRequest } from 'next/server'

export async function isAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies()
  return cookieStore.get('inbox_session')?.value === 'ok'
}

export function isAuthenticatedFromRequest(req: NextRequest): boolean {
  return req.cookies.get('inbox_session')?.value === 'ok'
}

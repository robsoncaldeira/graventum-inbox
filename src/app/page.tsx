import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'

export default async function Home() {
  const cookieStore = await cookies()
  const session = cookieStore.get('inbox_session')
  if (session?.value === 'ok') {
    redirect('/inbox')
  }
  redirect('/login')
}

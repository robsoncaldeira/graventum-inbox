import { redirect } from 'next/navigation'

export default function Home() {
  // Middleware ja garante sessao (via embed_key do portal AMI)
  redirect('/inbox')
}

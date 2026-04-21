'use client'

import { use } from 'react'
import { useSearchParams } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import ConversationView from '@/components/ConversationView'

export default function LeadsConversationPage({
  params,
}: {
  params: Promise<{ phone: string }>
}) {
  const { phone } = use(params)
  const decodedPhone = decodeURIComponent(phone)
  const searchParams = useSearchParams()
  const phoneFromQuery = searchParams.get('phone')

  return (
    <div className="flex h-screen bg-zinc-950 overflow-hidden">
      <Sidebar />
      <main className="flex-1 flex overflow-hidden">
        <ConversationView
          remoteJid={decodedPhone}
          phoneHint={phoneFromQuery}
          backHref="/leads"
        />
      </main>
    </div>
  )
}

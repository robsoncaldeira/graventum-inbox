'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { MessageCircle, Users, LogOut } from 'lucide-react'
import { clsx } from 'clsx'

const NAV = [
  { href: '/inbox', label: 'Conversas', icon: MessageCircle },
  { href: '/leads', label: 'Leads', icon: Users },
]

function clsxSimple(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(' ')
}

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()

  async function handleLogout() {
    await fetch('/api/logout', { method: 'POST' })
    router.push('/login')
  }

  return (
    <aside className="w-56 bg-zinc-900 border-r border-zinc-800 flex flex-col min-h-screen">
      <div className="px-4 py-5 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-violet-600 rounded-lg flex items-center justify-center">
            <MessageCircle className="w-4 h-4 text-white" />
          </div>
          <span className="text-white font-semibold text-sm">Graventum</span>
        </div>
        <p className="text-zinc-500 text-xs mt-1">Inbox WhatsApp</p>
      </div>

      <nav className="flex-1 py-4 px-2 space-y-1">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={clsxSimple(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                active
                  ? 'bg-violet-600/20 text-violet-300'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
              )}
            >
              <Icon className="w-4 h-4" />
              {label}
            </Link>
          )
        })}
      </nav>

      <div className="p-2 border-t border-zinc-800">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors w-full"
        >
          <LogOut className="w-4 h-4" />
          Sair
        </button>
      </div>
    </aside>
  )
}

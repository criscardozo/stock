'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { AuthProvider, useAuth } from '@/lib/firebase/auth'
import { HouseholdProvider, useHousehold } from '@/lib/firebase/household'
import { Avatar, Icon } from './ui/primitives'
import { Onboarding } from './Onboarding'
import { LoginScreen } from './LoginScreen'
import { AppMark } from './AppMark'

const TABS = [
  { href: '/stock', label: 'Stock', icon: 'inventory_2' },
  { href: '/falta-comprar', label: 'Falta comprar', icon: 'shopping_cart', badge: true },
  { href: '/plan', label: 'Plan', icon: 'calendar_month' },
  { href: '/recetas', label: 'Recetas', icon: 'menu_book' },
  { href: '/ajustes', label: 'Ajustes', icon: 'settings' },
]

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <HouseholdProvider>
        <Gate>{children}</Gate>
      </HouseholdProvider>
    </AuthProvider>
  )
}

function Gate({ children }: { children: React.ReactNode }) {
  const { user, ready } = useAuth()
  const { household, householdId } = useHousehold()

  // Waiting for onAuthStateChanged. Rendering the login here is the classic
  // flash of "signed out" on every single reload.
  if (!ready) {
    return (
      <div className="grid min-h-dvh place-items-center bg-ground">
        <span className="animate-pulse">
          <AppMark size={64} radius={20} />
        </span>
      </div>
    )
  }

  if (!user) return <LoginScreen />
  if (!householdId || !household) return <Onboarding />

  return (
    <div className="safe-x flex min-h-dvh">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col px-4 pt-5 pb-24 lg:px-7 lg:pt-6 lg:pb-0">
        {children}
      </div>
      <TabBar />
    </div>
  )
}

function Sidebar() {
  const pathname = usePathname()
  const { household, list, suggestions } = useHousehold()
  const pending = list.filter((entry) => !entry.checked).length + suggestions.length
  const members = household?.memberIds ?? []

  return (
    <aside className="hidden w-[232px] shrink-0 flex-col gap-[5px] border-r border-line p-4 pt-[22px] lg:flex">
      <div className="mb-[22px] flex items-center gap-2.5 px-2">
        <AppMark size={34} />
        <div className="flex flex-col leading-tight">
          <span className="text-[15.5px] font-bold">Stock</span>
          <span className="text-[11px] text-ink-3">{household?.name}</span>
        </div>
      </div>

      {TABS.map((tab) => {
        const active = pathname === tab.href
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={`flex items-center gap-2.5 rounded-nav px-3 py-2.5 ${
              active ? 'bg-primary-soft' : ''
            }`}
          >
            <Icon name={tab.icon} className={active ? 'text-primary-deep' : 'text-ink-2'} />
            <span
              className={`flex-1 text-sm ${
                active ? 'font-bold text-primary-deep' : 'font-semibold text-ink-2'
              }`}
            >
              {tab.label}
            </span>
            {tab.badge && pending > 0 && (
              <span className="grid h-5 min-w-5 place-items-center rounded-full bg-danger px-1.5 text-[11px] font-bold text-on-danger">
                {pending}
              </span>
            )}
          </Link>
        )
      })}

      <div className="mt-auto flex flex-col gap-2">
        <div className="flex items-center gap-2 rounded-panel border border-line bg-surface px-3 py-2.5">
          <div className="flex">
            {members.map((uid, index) => (
              <span
                key={uid}
                className="rounded-full border-2 border-surface"
                style={{ marginLeft: index === 0 ? 0 : -8 }}
              >
                <Avatar
                  name={household?.members[uid]?.displayName}
                  colour={index === 1 ? 'bg-member-b' : 'bg-member-a'}
                  size={28}
                />
              </span>
            ))}
          </div>
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-xs font-bold">
              {members.map((uid) => household?.members[uid]?.displayName ?? '—').join(' y ')}
            </span>
            <span className="text-[11px] text-ink-3">
              {members.length === 2 ? 'Hogar compartido' : 'Sin compañía todavía'}
            </span>
          </div>
        </div>
        <SyncState />
      </div>
    </aside>
  )
}

/** Honest about connectivity and nothing more: no invented pending counters. */
function SyncState() {
  const [online, setOnline] = useState(true)

  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    update()
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

  return (
    <span
      className={`flex items-center gap-1.5 px-3 text-[11px] font-semibold ${
        online ? 'text-ink-3' : 'text-primary-deep'
      }`}
    >
      <Icon name={online ? 'cloud_done' : 'cloud_off'} size={15} />
      {online ? 'Sincronizado' : 'Sin conexión — se guarda igual'}
    </span>
  )
}

/** Below lg the sidebar becomes a tab bar: this is the PWA on the phone. */
function TabBar() {
  const pathname = usePathname()
  const { list, suggestions } = useHousehold()
  const pending = list.filter((entry) => !entry.checked).length + suggestions.length

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex justify-around border-t border-line bg-surface px-2.5 pt-2 pb-[max(env(safe-area-inset-bottom),0.75rem)] shadow-[0_-8px_24px_rgba(27,33,25,.05)] lg:hidden">
      {TABS.map((tab) => {
        const active = pathname === tab.href
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className="relative flex min-w-0 flex-1 flex-col items-center gap-0.5"
          >
            <Icon name={tab.icon} size={23} className={active ? 'text-primary' : 'text-ink-3'} />
            <span
              className={`max-w-full truncate text-[10.5px] ${
                active ? 'font-bold text-primary-deep' : 'font-semibold text-ink-3'
              }`}
            >
              {tab.label === 'Falta comprar' ? 'Comprar' : tab.label}
            </span>
            {tab.badge && pending > 0 && (
              <span className="absolute -top-1 right-2 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-danger px-1.5 text-[10px] font-bold text-on-danger">
                {pending}
              </span>
            )}
          </Link>
        )
      })}
    </nav>
  )
}

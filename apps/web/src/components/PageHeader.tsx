'use client'

import type { ReactNode } from 'react'

/** Title, one line of arithmetic about what you're looking at, and the actions. */
export function PageHeader({
  title,
  summary,
  actions,
}: {
  title: ReactNode
  summary?: ReactNode
  actions?: ReactNode
}) {
  return (
    <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <h1 className="text-[23px] font-bold tracking-[-0.02em]">{title}</h1>
        {summary && <p className="text-[13px] text-ink-2">{summary}</p>}
      </div>
      {actions && <div className="flex items-center gap-2.5">{actions}</div>}
    </header>
  )
}

export function FooterNote({ left, right }: { left: ReactNode; right?: ReactNode }) {
  return (
    <footer className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-line py-3.5 text-xs text-ink-3">
      <span>{left}</span>
      {right && <span className="flex items-center gap-1.5">{right}</span>}
    </footer>
  )
}

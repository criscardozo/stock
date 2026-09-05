'use client'

import { useEffect, useState } from 'react'
import { recentMoves } from '@/lib/firebase/mutations'
import { LEVEL_NAMES, formatQuantity } from '@/lib/domain/quantities'
import { formatDayMonth } from '@/lib/domain/format'
import type { Item, Level, Move, MoveType } from '@/lib/domain/types'
import { Icon } from '../ui/primitives'

/**
 * What happened to this item, most recent first.
 *
 * `moves` is written on every purchase, every meal cooked and every manual
 * adjustment, by both clients — and until now nothing read it. The collection
 * grows forever, so this is a `getDocs` with a hard limit and never a listener:
 * the CLAUDE.md rule, and the reason `recentMoves` was already shaped this way.
 *
 * Loaded when the sheet opens rather than with the item list, because a person
 * opening one item should not pay for the history of all of them.
 */
const LABELS: Record<MoveType, { text: string; icon: string }> = {
  purchase: { text: 'Compra', icon: 'shopping_cart' },
  cook: { text: 'Cocina', icon: 'local_dining' },
  adjust: { text: 'Ajuste', icon: 'tune' },
  waste: { text: 'Se tiró', icon: 'delete' },
}

/** What the move did, in the item's own terms. */
function describe(move: Move, item: Item): string {
  if (move.levelTo !== undefined) {
    const to = LEVEL_NAMES[move.levelTo as Level]
    if (move.levelFrom === undefined) return `a ${to}`
    return `${LEVEL_NAMES[move.levelFrom as Level]} → ${to}`
  }
  if (move.delta === undefined || move.delta === 0) return '—'
  // The sign is the whole message, so it is never dropped: "+6 u" and "−2 u"
  // read as opposite events where a bare "6 u" reads as a level.
  const sign = move.delta > 0 ? '+' : '−'
  return `${sign}${formatQuantity(Math.abs(move.delta), item.unit ?? 'unit')}`
}

export function MoveHistory({
  householdId,
  item,
  members,
}: {
  householdId: string
  item: Item
  members: Record<string, { displayName: string }>
}) {
  const [moves, setMoves] = useState<Move[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let live = true
    recentMoves(householdId, item.id)
      .then((rows) => live && setMoves(rows))
      // A history that cannot be read is not a broken item sheet. It says so
      // and the rest of the sheet keeps working.
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [householdId, item.id])

  if (failed) {
    return <p className="text-xs text-ink-3">No pude leer el historial.</p>
  }
  if (moves === null) {
    return <p className="text-xs text-ink-3">Buscando…</p>
  }
  if (moves.length === 0) {
    return <p className="text-xs text-ink-3">Todavía no se movió desde que está en la casa.</p>
  }

  return (
    <ul className="flex flex-col">
      {moves.map((move, index) => {
        const label = LABELS[move.type] ?? LABELS.adjust
        return (
          <li
            key={move.id}
            className={`flex items-center gap-3 py-2.5 ${
              index === moves.length - 1 ? '' : 'border-b border-line-soft'
            }`}
          >
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-ground text-ink-2">
              <Icon name={label.icon} size={15} />
            </span>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-[13px] font-semibold">{label.text}</span>
              <span className="block truncate text-[11.5px] text-ink-3">
                {/* `at` is a server timestamp, so it is briefly absent on a row
                    this device just wrote — the write is not awaited. */}
                {move.at ? formatDayMonth(isoOf(move.at)) : 'recién'}
                {' · '}
                {members[move.by]?.displayName ?? 'alguien'}
              </span>
            </span>
            <span className="shrink-0 text-[13px] font-bold tabular-nums">
              {describe(move, item)}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

/**
 * The calendar day a move's instant falls on.
 *
 * `toLocaleDateString('en-CA')` gives YYYY-MM-DD, and the device's zone is the
 * right one HERE and nowhere else in this app: a move's timestamp is a real
 * instant, not one of the household's calendar dates, so it is read where the
 * person reading it is standing.
 */
function isoOf(at: Date): string {
  return at.toLocaleDateString('en-CA')
}

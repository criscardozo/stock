'use client'

import { expiryStatus, stockStatus } from '@/lib/domain/items'
import { daysBetween, type IsoDate } from '@/lib/domain/dates'
import { formatDayMonth } from '@/lib/domain/format'
import { formatQuantity, LEVEL_NAMES, stepFor } from '@/lib/domain/quantities'
import type { Category, Item, Level, Location } from '@/lib/domain/types'
import { Chip, HueBadge, LevelDial, Stepper } from '../ui/primitives'

/**
 * One item, one row — the catalogue and the stock are the same document, so the
 * row that tells you what you have is also the row you change it in.
 */
export function ItemRow({
  item,
  category,
  location,
  today,
  wantedByPlan,
  onQuantity,
  onLevel,
  onOpen,
  last,
}: {
  item: Item
  category?: Category
  location?: Location
  today: IsoDate
  wantedByPlan: boolean
  onQuantity: (next: number) => void
  onLevel: (next: Level) => void
  onOpen: () => void
  last: boolean
}) {
  const stock = stockStatus(item)
  const expiry = expiryStatus(item, today)
  const subtitle = [item.brand, item.packSize, location?.name].filter(Boolean).join(' · ')

  return (
    <div
      className={`flex items-center gap-3 py-[11px] ${last ? '' : 'border-b border-line-soft'}`}
    >
      <HueBadge icon={category?.icon ?? 'inventory_2'} hue={category?.hue} />

      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 flex-col items-start leading-tight"
      >
        <span className="truncate text-[14.5px] font-semibold">{item.name}</span>
        {subtitle && <span className="truncate text-xs text-ink-3">{subtitle}</span>}
      </button>

      {item.tracking === 'quantity' ? (
        <Stepper
          value={item.quantity ?? 0}
          step={stepFor(item.unit ?? 'unit')}
          label={formatQuantity(item.quantity ?? 0, item.unit ?? 'unit')}
          onChange={onQuantity}
        />
      ) : (
        <LevelDial level={(item.level ?? 0) as Level} onChange={onLevel} />
      )}

      <span className="hidden w-[66px] text-right text-xs text-ink-3 sm:block">
        {item.tracking === 'quantity'
          ? `mín ${formatQuantity(item.minQuantity ?? 0, item.unit ?? 'unit')}`
          : `mín ${LEVEL_NAMES[(item.minLevel ?? 1) as Level]}`}
      </span>

      <span
        className={`hidden w-[74px] text-right text-xs sm:block ${
          expiry === 'expired'
            ? 'font-bold text-danger-deep'
            : expiry === 'expiring'
              ? 'font-semibold text-ink'
              : 'text-ink-4'
        }`}
      >
        {item.expiresAt ? formatDayMonth(item.expiresAt) : '—'}
      </span>

      <span className="flex w-[132px] justify-end">
        <StatusChip stock={stock} expiry={expiry} item={item} today={today} plan={wantedByPlan} />
      </span>
    </div>
  )
}

/**
 * One chip, most urgent first: out > expired > expiring > low > wanted.
 * Expiring outranks low on purpose — something that goes off tomorrow needs
 * cooking tonight, while "poco" only means the next shop should include it.
 */
function StatusChip({
  stock,
  expiry,
  item,
  today,
  plan,
}: {
  stock: ReturnType<typeof stockStatus>
  expiry: ReturnType<typeof expiryStatus>
  item: Item
  today: IsoDate
  plan: boolean
}) {
  if (stock === 'out')
    return (
      <Chip icon="error" tone="danger">
        Falta
      </Chip>
    )
  if (expiry === 'expired')
    return (
      <Chip icon="dangerous" tone="danger-deep">
        Vencido
      </Chip>
    )
  if (expiry === 'expiring' && item.expiresAt) {
    const days = daysBetween(today, item.expiresAt)
    return <Chip icon="schedule">{days === 0 ? 'Vence hoy' : `Vence en ${days} d`}</Chip>
  }
  if (stock === 'low')
    return (
      <Chip icon="arrow_downward" tone="primary">
        Poco
      </Chip>
    )
  if (plan) return <Chip icon="local_dining">Lo pide el plan</Chip>
  return null
}

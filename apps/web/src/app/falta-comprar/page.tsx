'use client'

import { useMemo, useState } from 'react'
import { useAuth } from '@/lib/firebase/auth'
import { useHousehold } from '@/lib/firebase/household'
import {
  addManyToList,
  addToList,
  closeShopping,
  removeFromList,
  setChecked,
  snoozeItem,
  type NewEntry,
} from '@/lib/firebase/mutations'
import { addDays } from '@/lib/domain/dates'
import { formatDayShort, plural } from '@/lib/domain/format'
import { formatQuantity } from '@/lib/domain/quantities'
import { reasonFor, type Suggestion } from '@/lib/domain/suggestions'
import type { Category, ShoppingEntry } from '@/lib/domain/types'
import { PageHeader, FooterNote } from '@/components/PageHeader'
import {
  Avatar,
  Card,
  Chip,
  HueBadge,
  Icon,
  PillButton,
  SectionLabel,
} from '@/components/ui/primitives'
import { CloseShoppingSheet } from '@/components/shopping/CloseShoppingSheet'

const SNOOZE_DAYS = 7

export default function ShoppingPage() {
  const { user } = useAuth()
  const { household, householdId, list, suggestions, items, itemsById, recipes, today } =
    useHousehold()
  const [closing, setClosing] = useState(false)
  const [manual, setManual] = useState('')

  const checked = useMemo(() => list.filter((entry) => entry.checked), [list])

  const bySource = useMemo(() => {
    const counts = { min: 0, plan: 0, manual: 0 }
    for (const entry of list) counts[entry.source] += 1
    return counts
  }, [list])

  const snoozed = useMemo(
    () => items.filter((item) => !!item.snoozedUntil && item.snoozedUntil >= today),
    [items, today],
  )

  /** Rows grouped by the category of the item behind them; manual rows last. */
  const grouped = useMemo(() => {
    const categories = Object.entries(household?.categories ?? {}).sort(
      (a, b) => a[1].sortOrder - b[1].sortOrder,
    )
    const buckets = new Map<string, ShoppingEntry[]>()
    for (const entry of list) {
      const item = entry.itemId ? itemsById.get(entry.itemId) : undefined
      const key = item?.categoryId ?? '__manual'
      buckets.set(key, [...(buckets.get(key) ?? []), entry])
    }
    const sections = categories
      .filter(([id]) => buckets.has(id))
      .map(([id, category]) => ({ id, name: category.name, rows: buckets.get(id)! }))
    if (buckets.has('__manual')) {
      sections.push({ id: '__manual', name: 'Agregado a mano', rows: buckets.get('__manual')! })
    }
    return sections
  }, [list, household, itemsById])

  /**
   * The engine returns suggestions sorted by itemId — deterministic, for the
   * shared vectors. On screen they follow the same order as everything else:
   * category, then name.
   */
  const orderedSuggestions = useMemo(() => {
    const order = (id: string) =>
      household?.categories[itemsById.get(id)?.categoryId ?? '']?.sortOrder ?? 999
    return [...suggestions].sort((a, b) => {
      const byCategory = order(a.itemId) - order(b.itemId)
      if (byCategory !== 0) return byCategory
      const nameA = itemsById.get(a.itemId)?.name ?? ''
      const nameB = itemsById.get(b.itemId)?.name ?? ''
      return nameA.localeCompare(nameB, 'es')
    })
  }, [suggestions, household, itemsById])

  if (!household || !householdId || !user) return null

  const entryFor = (suggestion: Suggestion): NewEntry | null => {
    const item = itemsById.get(suggestion.itemId)
    if (!item) return null
    return {
      label: item.name,
      itemId: item.id,
      ...(suggestion.quantity !== undefined ? { quantity: suggestion.quantity } : {}),
      ...(item.unit ? { unit: item.unit } : {}),
      source: suggestion.source,
      reason: reasonFor(suggestion, item, recipes, formatDayShort),
    }
  }

  return (
    <>
      <PageHeader
        title="Falta comprar"
        summary={
          list.length === 0 ? (
            'La lista está vacía'
          ) : (
            <>
              {plural(list.length, 'cosa', 'cosas')} · {bySource.min} por mínimo · {bySource.plan}{' '}
              por el plan · {bySource.manual} a mano
            </>
          )
        }
        actions={
          checked.length > 0 ? (
            <PillButton icon="shopping_basket" variant="primary" onClick={() => setClosing(true)}>
              Cerrar compra ({checked.length})
            </PillButton>
          ) : null
        }
      />

      {list.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3.5 rounded-panel border border-line bg-surface px-[18px] py-3.5">
          <div className="flex min-w-[200px] flex-1 flex-col gap-1.5">
            <div className="flex items-baseline justify-between">
              <span className="text-[13px] font-semibold text-ink-2">En el changuito</span>
              <span className="tnum text-[13px] text-ink-3">
                {checked.length} de {list.length}
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-neutral-soft">
              <div
                className="h-full rounded-full bg-primary transition-[width]"
                style={{ width: `${Math.round((checked.length / list.length) * 100)}%` }}
              />
            </div>
          </div>
          {snoozed.length > 0 && (
            <>
              <span className="hidden h-[38px] w-px bg-line sm:block" />
              <span className="flex items-center gap-2 text-xs font-semibold text-ink-2">
                <Icon name="notifications_off" size={17} />
                {plural(snoozed.length, 'postergado', 'postergados')}
              </span>
            </>
          )}
        </div>
      )}

      <div className="flex flex-col gap-3.5">
        {grouped.map((section) => (
          <section key={section.id} className="flex flex-col gap-2">
            <SectionLabel>{section.name}</SectionLabel>
            <Card>
              {section.rows.map((entry, index) => (
                <ShoppingRow
                  key={entry.id}
                  entry={entry}
                  category={
                    entry.itemId
                      ? household.categories[itemsById.get(entry.itemId)?.categoryId ?? '']
                      : undefined
                  }
                  memberColour={
                    household.memberIds.indexOf(entry.addedBy) === 1 ? 'bg-member-b' : 'bg-member-a'
                  }
                  memberName={household.members[entry.addedBy]?.displayName}
                  last={index === section.rows.length - 1}
                  onToggle={() => setChecked(householdId, user.uid, entry.id, !entry.checked)}
                  onRemove={() => removeFromList(householdId, entry.id)}
                />
              ))}
            </Card>
          </section>
        ))}

        <form
          className="flex items-center gap-3.5 rounded-card border border-dashed border-line-strong px-[18px] py-3"
          onSubmit={(event) => {
            event.preventDefault()
            const label = manual.trim()
            if (!label) return
            addToList(householdId, user.uid, { label, source: 'manual' })
            setManual('')
          }}
        >
          <Icon name="add_circle" size={20} className="text-ink-3" />
          <input
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder="Agregar algo que no está en el catálogo…"
            className="flex-1 bg-transparent text-sm outline-none"
          />
          {manual.trim() && (
            <button className="text-[13px] font-bold text-primary-deep">Agregar</button>
          )}
        </form>

        {suggestions.length > 0 && (
          <section className="mt-2 flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <SectionLabel>Sugerencias ({orderedSuggestions.length})</SectionLabel>
              <span className="flex-1" />
              <button
                onClick={() =>
                  addManyToList(
                    householdId,
                    user.uid,
                    suggestions.map(entryFor).filter((entry): entry is NewEntry => !!entry),
                  )
                }
                className="rounded-full border border-line bg-surface px-3.5 py-1.5 text-xs font-semibold text-ink-2"
              >
                Agregar todo
              </button>
            </div>
            <Card>
              {orderedSuggestions.map((suggestion, index) => {
                const item = itemsById.get(suggestion.itemId)
                if (!item) return null
                const entry = entryFor(suggestion)
                return (
                  <div
                    key={suggestion.itemId}
                    className={`flex items-center gap-3.5 py-3 ${
                      index === orderedSuggestions.length - 1 ? '' : 'border-b border-line-soft'
                    }`}
                  >
                    <HueBadge
                      icon={household.categories[item.categoryId]?.icon ?? 'inventory_2'}
                      hue={household.categories[item.categoryId]?.hue}
                    />
                    <div className="flex min-w-0 flex-1 flex-col leading-tight">
                      <span className="truncate text-[15px] font-semibold">{item.name}</span>
                      <span className="truncate text-xs text-ink-2">{entry?.reason}</span>
                    </div>
                    {/*
                      No amount is a real answer for a level item, and for a
                      counted one sitting exactly on its minimum. Saying "sin
                      cantidad" out loud reads like a bug; the reason line
                      already explains the row.
                    */}
                    {suggestion.quantity !== undefined && (
                      <span className="hidden text-[13.5px] text-ink-2 sm:block">
                        sugerido{' '}
                        <strong className="tnum font-bold text-ink">
                          {formatQuantity(suggestion.quantity, item.unit ?? 'unit')}
                        </strong>
                      </span>
                    )}
                    <button
                      onClick={() => entry && addToList(householdId, user.uid, entry)}
                      className="rounded-full bg-primary-soft px-3 py-1.5 text-xs font-bold text-primary-deep"
                    >
                      Agregar
                    </button>
                    <button
                      title="Esta vuelta no"
                      aria-label="Esta vuelta no"
                      onClick={() =>
                        snoozeItem(householdId, user.uid, item.id, addDays(today, SNOOZE_DAYS))
                      }
                      className="text-ink-4"
                    >
                      <Icon name="notifications_off" size={19} />
                    </button>
                  </div>
                )
              })}
            </Card>
          </section>
        )}

        {list.length === 0 && suggestions.length === 0 && (
          <div className="flex flex-col items-center gap-3 rounded-card border border-line bg-surface px-6 py-14 text-center">
            <Chip icon="check_circle" tone="primary">
              No falta nada
            </Chip>
            <p className="max-w-[380px] text-sm text-ink-2">
              Todo por encima del mínimo y el plan de la quincena cubierto.
              {snoozed.length > 0 &&
                ` Hay ${plural(snoozed.length, 'ítem postergado', 'ítems postergados')}.`}
            </p>
          </div>
        )}
      </div>

      <FooterNote
        left="Tildar solo tacha la fila: el stock se carga al cerrar la compra."
        right={
          <>
            <Icon name="bolt" size={15} />
            Cerrar la compra es un writeBatch — la UI no espera al servidor.
          </>
        }
      />

      {closing && (
        <CloseShoppingSheet
          entries={checked}
          itemsById={itemsById}
          onClose={() => setClosing(false)}
          onConfirm={(purchases) => {
            closeShopping(householdId, user.uid, purchases)
            setClosing(false)
          }}
        />
      )}
    </>
  )
}

function ShoppingRow({
  entry,
  category,
  memberColour,
  memberName,
  last,
  onToggle,
  onRemove,
}: {
  entry: ShoppingEntry
  category?: Category
  memberColour: string
  memberName?: string
  last: boolean
  onToggle: () => void
  onRemove: () => void
}) {
  return (
    <div
      className={`flex items-center gap-3.5 py-3 ${last ? '' : 'border-b border-line-soft'} ${
        entry.checked ? 'opacity-50' : ''
      }`}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={entry.checked}
        aria-label={entry.checked ? `Destildar ${entry.label}` : `Tildar ${entry.label}`}
        onClick={onToggle}
        className={`grid h-6 w-6 shrink-0 place-items-center rounded-lg ${
          entry.checked ? 'bg-primary' : 'border-2 border-line-strong'
        }`}
      >
        {entry.checked && <Icon name="check" size={17} className="text-white" />}
      </button>

      <HueBadge icon={category?.icon ?? 'shopping_basket'} hue={category?.hue} />

      <div className="flex min-w-0 flex-1 flex-col leading-tight">
        <span
          className={`truncate text-[15px] font-semibold ${entry.checked ? 'line-through' : ''}`}
        >
          {entry.label}
        </span>
        <span className="truncate text-xs text-ink-2">
          {entry.reason ?? (entry.source === 'manual' ? `lo agregó ${memberName ?? 'alguien'}` : '')}
        </span>
      </div>

      {entry.quantity !== undefined && (
        <span className="tnum hidden text-[13.5px] font-bold sm:block">
          {formatQuantity(entry.quantity, entry.unit ?? 'unit')}
        </span>
      )}

      {entry.source === 'manual' && <Avatar name={memberName} colour={memberColour} />}

      <button aria-label={`Sacar ${entry.label}`} onClick={onRemove} className="text-ink-4">
        <Icon name="delete" size={19} />
      </button>
    </div>
  )
}

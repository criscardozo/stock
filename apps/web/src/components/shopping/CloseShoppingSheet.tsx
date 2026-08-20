'use client'

import { useState } from 'react'
import type { Item, Level, ShoppingEntry } from '@/lib/domain/types'
import { formatQuantity, stepFor, LEVEL_NAMES } from '@/lib/domain/quantities'
import type { Purchase } from '@/lib/firebase/mutations'
import { Icon, LevelDial, PrimaryAction, Sheet, Stepper } from '../ui/primitives'

/**
 * The one place shopping changes stock. Ticking a row in the aisle is just a
 * tick; this is where what actually came in gets confirmed — in one batch that
 * also deletes those rows and leaves the unticked ones for next week.
 */
export function CloseShoppingSheet({
  entries,
  itemsById,
  onClose,
  onConfirm,
}: {
  entries: ShoppingEntry[]
  itemsById: Map<string, Item>
  onClose: () => void
  onConfirm: (purchases: Purchase[]) => void
}) {
  const [amounts, setAmounts] = useState<Record<string, number>>(() =>
    Object.fromEntries(
      entries.map((entry) => {
        const item = entry.itemId ? itemsById.get(entry.itemId) : undefined
        // The row's amount is only meaningful in the ITEM's unit. A row written
        // in a different one (an old row, or one whose item was re-measured
        // since) must not be added blind — "2" of a millilitre item is not two
        // tins. Start at zero and make the human say it.
        const sameUnit = !entry.unit || !item?.unit || entry.unit === item.unit
        return [entry.id, sameUnit ? (entry.quantity ?? 0) : 0]
      }),
    ),
  )
  const [levels, setLevels] = useState<Record<string, Level>>(() =>
    Object.fromEntries(entries.map((entry) => [entry.id, 3 as Level])),
  )

  const confirm = () => {
    onConfirm(
      entries.map((entry) => {
        const item = entry.itemId ? itemsById.get(entry.itemId) : undefined
        return {
          entry,
          item,
          quantity: amounts[entry.id] ?? 0,
          level: levels[entry.id] ?? (3 as Level),
        }
      }),
    )
  }

  return (
    <Sheet
      title="Cerrar compra"
      subtitle={`${entries.length} ${entries.length === 1 ? 'cosa tildada' : 'cosas tildadas'} · ajustá lo que entró`}
      icon="shopping_basket"
      onClose={onClose}
      footer={
        <div className="flex flex-col gap-3">
          <PrimaryAction icon="check" onClick={confirm}>
            Guardar y cerrar
          </PrimaryAction>
          <p className="text-center text-[11.5px] leading-relaxed text-ink-3">
            Lo tildado entra al stock y sale de la lista. Lo que no conseguiste queda para la
            próxima.
          </p>
        </div>
      }
    >
      <div className="rounded-panel bg-ground px-4">
        {entries.map((entry, index) => {
          const item = entry.itemId ? itemsById.get(entry.itemId) : undefined
          return (
            <div
              key={entry.id}
              className={`flex items-center gap-3 py-3 ${
                index === entries.length - 1 ? '' : 'border-b border-line-soft'
              }`}
            >
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                {entry.label}
              </span>

              {!item ? (
                <span className="flex items-center gap-1.5 text-xs text-ink-3">
                  <Icon name="remove_shopping_cart" size={15} />
                  suelto, no entra al stock
                </span>
              ) : item.minSpare !== undefined ? (
                // Sealed containers, so the question is "how many did you
                // bring", not "how much is left in the open one".
                <span className="flex items-center gap-2">
                  <span className="text-xs text-ink-3">sin abrir</span>
                  <Stepper
                    name={entry.label}
                    value={amounts[entry.id] ?? 0}
                    step={1}
                    label={`+${amounts[entry.id] ?? 0}`}
                    onChange={(next) => setAmounts((prev) => ({ ...prev, [entry.id]: next }))}
                  />
                </span>
              ) : item.tracking === 'quantity' ? (
                <Stepper
                  name={entry.label}
                  value={amounts[entry.id] ?? 0}
                  step={stepFor(item.unit ?? 'unit')}
                  label={formatQuantity(amounts[entry.id] ?? 0, item.unit ?? 'unit')}
                  onChange={(next) => setAmounts((prev) => ({ ...prev, [entry.id]: next }))}
                />
              ) : (
                <span className="flex items-center gap-2">
                  <span className="text-xs text-ink-3">queda</span>
                  <LevelDial
                    level={levels[entry.id] ?? (3 as Level)}
                    onChange={(next) => setLevels((prev) => ({ ...prev, [entry.id]: next }))}
                  />
                </span>
              )}
            </div>
          )
        })}
      </div>

      <p className="text-[11.5px] leading-relaxed text-ink-3">
        Los ítems por nivel vuelven a <strong className="font-semibold">{LEVEL_NAMES[3]}</strong> salvo
        que muevas el dial.
      </p>
    </Sheet>
  )
}

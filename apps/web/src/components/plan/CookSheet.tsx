'use client'

import { useState } from 'react'
import type { Item, Level, Recipe } from '@/lib/domain/types'
import { formatQuantity, stepFor } from '@/lib/domain/quantities'
import type { Consumption } from '@/lib/firebase/mutations'
import { Icon, LevelDial, PrimaryAction, Sheet, Stepper } from '../ui/primitives'

/**
 * "Cocinada" proposes what the recipe says and lets the human fix it before it
 * lands — because nobody cooks exactly the recipe, and a stock that quietly
 * drifts is worse than one that asks.
 */
export function CookSheet({
  recipe,
  itemsById,
  onClose,
  onConfirm,
  onJustMark,
}: {
  recipe: Recipe | null
  itemsById: Map<string, Item>
  onClose: () => void
  onConfirm: (consumption: Consumption[]) => void
  onJustMark: () => void
}) {
  const linked = (recipe?.ingredients ?? []).filter(
    (ingredient) => ingredient.itemId && itemsById.has(ingredient.itemId),
  )

  const [enabled, setEnabled] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(linked.map((i) => [i.itemId!, true])),
  )
  const [amounts, setAmounts] = useState<Record<string, number>>(() =>
    Object.fromEntries(linked.map((i) => [i.itemId!, i.quantity ?? 0])),
  )
  const [levels, setLevels] = useState<Record<string, Level>>(() =>
    Object.fromEntries(
      linked.map((i) => {
        const item = itemsById.get(i.itemId!)!
        // Default: one notch down from where it is. Cooking used *some*.
        return [i.itemId!, Math.max(0, ((item.level ?? 0) as number) - 1) as Level]
      }),
    ),
  )

  const confirm = () => {
    onConfirm(
      linked
        .filter((ingredient) => enabled[ingredient.itemId!])
        .map((ingredient) => {
          const item = itemsById.get(ingredient.itemId!)!
          return item.tracking === 'quantity'
            ? { item, quantity: amounts[item.id] ?? 0 }
            : { item, level: levels[item.id] ?? ((item.level ?? 0) as Level) }
        }),
    )
  }

  return (
    <Sheet
      title={recipe ? `Cocinaste ${recipe.title}` : 'Marcar como cocinada'}
      subtitle="Destildá lo que no gastaste."
      icon="local_dining"
      hue="green"
      onClose={onClose}
      footer={
        <div className="flex flex-col gap-3">
          <PrimaryAction icon="check" onClick={confirm}>
            Descontar y marcar
          </PrimaryAction>
          <button
            onClick={onJustMark}
            className="text-center text-[13.5px] font-semibold text-ink-2"
          >
            Solo marcar cocinada
          </button>
        </div>
      }
    >
      {linked.length === 0 ? (
        <p className="rounded-panel bg-ground px-4 py-5 text-sm text-ink-2">
          Esta receta no tiene ingredientes linkeados al catálogo, así que no hay nada que
          descontar. Linkeálos desde la receta si querés que el stock baje solo.
        </p>
      ) : (
        <div className="rounded-panel bg-ground px-4">
          {linked.map((ingredient, index) => {
            const item = itemsById.get(ingredient.itemId!)!
            const on = enabled[item.id]
            return (
              <div
                key={item.id}
                className={`flex items-center gap-3 py-3 ${
                  index === linked.length - 1 ? '' : 'border-b border-line-soft'
                } ${on ? '' : 'opacity-50'}`}
              >
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  aria-label={on ? `No descontar ${item.name}` : `Descontar ${item.name}`}
                  onClick={() => setEnabled((prev) => ({ ...prev, [item.id]: !prev[item.id] }))}
                  className={`grid h-[22px] w-[22px] shrink-0 place-items-center rounded-[7px] ${
                    on ? 'bg-primary' : 'border-2 border-line-strong'
                  }`}
                >
                  {on && <Icon name="check" size={16} className="text-white" />}
                </button>

                <span className="min-w-0 flex-1 truncate text-[14.5px] font-semibold">
                  {item.name}
                </span>

                {!on ? (
                  <span className="text-xs text-ink-2">no descontar</span>
                ) : item.tracking === 'quantity' ? (
                  <Stepper
                    value={amounts[item.id] ?? 0}
                    step={stepFor(item.unit ?? 'unit')}
                    label={formatQuantity(amounts[item.id] ?? 0, item.unit ?? 'unit')}
                    onChange={(next) => setAmounts((prev) => ({ ...prev, [item.id]: next }))}
                  />
                ) : (
                  <span className="flex items-center gap-2">
                    <LevelDial level={(item.level ?? 0) as Level} showName={false} />
                    <Icon name="arrow_forward" size={16} className="text-ink-3" />
                    <LevelDial
                      level={levels[item.id] ?? 0}
                      onChange={(next) => setLevels((prev) => ({ ...prev, [item.id]: next }))}
                      showName={false}
                    />
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}
    </Sheet>
  )
}

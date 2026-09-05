'use client'

import { useState } from 'react'
import { HUES } from '@/lib/design/palette'
import type { Category, Location } from '@/lib/domain/types'
import { plural } from '@/lib/domain/format'
import { FieldInput, HueBadge, Icon, PrimaryAction, Sheet } from '../ui/primitives'

/**
 * Editing the household's categories or locations.
 *
 * Phase 4 promised "gestión de categorías y ubicaciones" and the screen only
 * ever listed them: there was no mutation for either map anywhere in the repo,
 * so they were whatever `shared/*.json` seeded at household creation and could
 * never change.
 *
 * One sheet for both, because they are the same shape with one field of
 * difference — a category is food or not, which is what decides whether recipes
 * may use it. Splitting them would have duplicated the reordering, the cap and
 * the in-use check, which are the parts with any thought in them.
 *
 * The whole map is written at once, on Guardar. Editing entry by entry would be
 * a write per keystroke on the ONE document every listener on both clients
 * holds open.
 */
export type Entry = { id: string; name: string; hue: string; icon: string; kind?: string }

/**
 * The rows as they will be stored.
 *
 * Pure, and exported, because `sortOrder` cannot be checked from the browser:
 * a map field round-trips through Firestore's JS SDK in the order it was
 * written, so a stable sort on equal keys is a no-op and the screen looks
 * identical with every sortOrder set to zero. Measured — flattening it fails
 * no end-to-end assertion at all.
 *
 * It is the PHONE that needs the field: iOS decodes these into a Swift
 * `Dictionary`, which has no order, so sortOrder is the only thing that says
 * what comes first. Hence a unit test here rather than a promise.
 */
export function taxonomyFrom(
  rows: Entry[],
  isCategories: boolean,
): Record<string, Category | Location> {
  const next: Record<string, Category | Location> = {}
  rows.forEach((row, index) => {
    const name = row.name.trim()
    if (!name) return // a row emptied out is a row removed
    next[row.id] = {
      name,
      icon: row.icon,
      hue: row.hue,
      // From the position, so the order on screen IS the order stored, and the
      // seed's gaps of ten do not have to be preserved.
      sortOrder: index * 10,
      ...(isCategories ? { kind: row.kind ?? 'food' } : {}),
    } as Category | Location
  })
  return next
}

/** The caps the rules enforce. Mirrored here so the reason can be read. */
export const LIMITS = { categories: 30, locations: 20 }

const HUE_NAMES = Object.keys(HUES)

function slugOf(name: string, taken: Set<string>): string {
  const base =
    name
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'sin-nombre'
  // Ids are map KEYS and every item points at one, so a collision would fold
  // two categories into each other silently. Suffix until it is free.
  let id = base
  let n = 2
  while (taken.has(id)) id = `${base}-${n++}`
  return id
}

export function TaxonomySheet({
  kind,
  entries,
  counts,
  onClose,
  onSave,
}: {
  kind: 'categories' | 'locations'
  entries: [string, Category | Location][]
  /** How many items point at each id — what makes a deletion safe or not. */
  counts: Map<string, number>
  onClose: () => void
  onSave: (next: Record<string, Category | Location>) => void
}) {
  const isCategories = kind === 'categories'
  const limit = LIMITS[kind]

  const [rows, setRows] = useState<Entry[]>(() =>
    entries.map(([id, value]) => ({
      id,
      name: value.name,
      hue: value.hue,
      icon: value.icon,
      ...(isCategories ? { kind: (value as Category).kind } : {}),
    })),
  )
  const [draft, setDraft] = useState('')

  const move = (index: number, by: number) => {
    const target = index + by
    if (target < 0 || target >= rows.length) return
    const next = [...rows]
    ;[next[index], next[target]] = [next[target], next[index]]
    setRows(next)
  }

  const add = () => {
    const name = draft.trim()
    if (!name || rows.length >= limit) return
    setRows([
      ...rows,
      {
        id: slugOf(name, new Set(rows.map((r) => r.id))),
        name,
        // The decoder's own defaults, so a row added here and a row that
        // arrived with those fields missing look the same rather than nearly.
        hue: 'violet',
        icon: 'inventory_2',
        ...(isCategories ? { kind: 'food' } : {}),
      },
    ])
    setDraft('')
  }

  const save = () => onSave(taxonomyFrom(rows, isCategories))

  return (
    <Sheet
      title={isCategories ? 'Categorías' : 'Ubicaciones'}
      subtitle={`${rows.length} de ${limit}`}
      onClose={onClose}
      footer={<PrimaryAction onClick={save}>Guardar</PrimaryAction>}
    >
      <ul className="flex flex-col">
        {rows.map((row, index) => {
          const used = counts.get(row.id) ?? 0
          return (
            <li
              key={row.id}
              className={`flex items-center gap-2 py-2 ${
                index === rows.length - 1 ? '' : 'border-b border-line-soft'
              }`}
            >
              <button
                type="button"
                aria-label={`Color de ${row.name}`}
                onClick={() =>
                  setRows(
                    rows.map((r, i) =>
                      i === index
                        ? { ...r, hue: HUE_NAMES[(HUE_NAMES.indexOf(r.hue) + 1) % HUE_NAMES.length] }
                        : r,
                    ),
                  )
                }
              >
                <HueBadge icon={row.icon} hue={row.hue} size={30} />
              </button>

              <FieldInput
                aria-label={`Nombre de ${row.name}`}
                value={row.name}
                onChange={(e) =>
                  setRows(rows.map((r, i) => (i === index ? { ...r, name: e.target.value } : r)))
                }
              />

              <span className="flex shrink-0 items-center">
                <button
                  type="button"
                  aria-label={`Subir ${row.name}`}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                  className="grid size-8 place-items-center text-ink-2 disabled:opacity-30"
                >
                  <Icon name="keyboard_arrow_up" size={20} />
                </button>
                <button
                  type="button"
                  aria-label={`Bajar ${row.name}`}
                  disabled={index === rows.length - 1}
                  onClick={() => move(index, 1)}
                  className="grid size-8 place-items-center text-ink-2 disabled:opacity-30"
                >
                  <Icon name="keyboard_arrow_down" size={20} />
                </button>
                <button
                  type="button"
                  // The count IS the reason, so it goes in the name: a disabled
                  // control that will not say why is the same as no control.
                  aria-label={
                    used > 0
                      ? `No se puede borrar ${row.name}: ${plural(used, 'ítem', 'ítems')}`
                      : `Borrar ${row.name}`
                  }
                  disabled={used > 0}
                  onClick={() => setRows(rows.filter((_, i) => i !== index))}
                  className="grid size-8 place-items-center text-danger-deep disabled:text-ink-3 disabled:opacity-30"
                >
                  <Icon name="delete" size={19} />
                </button>
              </span>
            </li>
          )
        })}
      </ul>

      <div className="flex items-center gap-2 pt-3">
        <FieldInput
          aria-label={isCategories ? 'Categoría nueva' : 'Ubicación nueva'}
          placeholder={isCategories ? 'Categoría nueva' : 'Ubicación nueva'}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <button
          type="button"
          onClick={add}
          disabled={!draft.trim() || rows.length >= limit}
          className="shrink-0 rounded-full bg-primary-soft px-4 py-2.5 text-[13px] font-bold text-primary-deep disabled:opacity-40"
        >
          Agregar
        </button>
      </div>

      <p className="text-[11.5px] leading-relaxed text-ink-3">
        {rows.length >= limit
          ? `Llegaste al tope de ${limit}. Lo fuerzan las reglas de Firestore, no la pantalla: el hogar es el documento que todas las pantallas escuchan.`
          : 'Lo que está en uso no se puede borrar — primero movés esos ítems. El orden de acá es el orden en que se ven en Stock.'}
      </p>
    </Sheet>
  )
}

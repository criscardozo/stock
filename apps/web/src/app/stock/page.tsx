'use client'

import { useMemo, useState } from 'react'
import { useAuth } from '@/lib/firebase/auth'
import { useHousehold } from '@/lib/firebase/household'
import { adjustStock, createItem, deleteItem, updateItem } from '@/lib/firebase/mutations'
import { expiryStatus, stockStatus } from '@/lib/domain/items'
import { plural } from '@/lib/domain/format'
import type { Item } from '@/lib/domain/types'
import { PageHeader, FooterNote } from '@/components/PageHeader'
import { Card, Chip, Icon, PillButton, SectionLabel } from '@/components/ui/primitives'
import { ItemRow } from '@/components/stock/ItemRow'
import { ItemSheet, type ItemDraft } from '@/components/stock/ItemSheet'

type Filter = 'all' | 'out' | 'low' | 'expiring'

export default function StockPage() {
  const { user } = useAuth()
  const { household, householdId, items, today, suggestions } = useHousehold()
  const [search, setSearch] = useState('')
  const [locationId, setLocationId] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [editing, setEditing] = useState<Item | null>(null)
  const [creating, setCreating] = useState(false)

  const categories = useMemo(
    () =>
      Object.entries(household?.categories ?? {}).sort(
        (a, b) => a[1].sortOrder - b[1].sortOrder,
      ),
    [household],
  )
  const locations = useMemo(
    () =>
      Object.entries(household?.locations ?? {}).sort((a, b) => a[1].sortOrder - b[1].sortOrder),
    [household],
  )

  const counts = useMemo(() => {
    let out = 0
    let low = 0
    let expiring = 0
    for (const item of items) {
      const stock = stockStatus(item)
      if (stock === 'out') out += 1
      else if (stock === 'low') low += 1
      const expiry = expiryStatus(item, today)
      if (expiry === 'expiring' || expiry === 'expired') expiring += 1
    }
    return { out, low, expiring }
  }, [items, today])

  /** Which items a planned meal is waiting on — drives the "Lo pide el plan" chip. */
  const wantedByPlan = useMemo(
    () => new Set(suggestions.filter((s) => s.planRefs.length > 0).map((s) => s.itemId)),
    [suggestions],
  )

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return items
      .filter((item) => (locationId ? item.locationId === locationId : true))
      .filter((item) =>
        needle
          ? `${item.name} ${item.brand ?? ''}`.toLowerCase().includes(needle)
          : true,
      )
      .filter((item) => {
        if (filter === 'all') return true
        if (filter === 'expiring') return ['expiring', 'expired'].includes(expiryStatus(item, today))
        return stockStatus(item) === filter
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'es'))
  }, [items, search, locationId, filter, today])

  const grouped = useMemo(() => {
    const byCategory = new Map<string, Item[]>()
    for (const item of visible) {
      const rows = byCategory.get(item.categoryId) ?? []
      rows.push(item)
      byCategory.set(item.categoryId, rows)
    }
    return categories
      .filter(([id]) => byCategory.has(id))
      .map(([id, category]) => ({ id, category, rows: byCategory.get(id)! }))
      .concat(
        // Items whose category was deleted still have to be reachable.
        [...byCategory.entries()]
          .filter(([id]) => !household?.categories[id])
          .map(([id, rows]) => ({
            id,
            category: { name: 'Sin categoría', icon: 'inventory_2', hue: 'violet', kind: 'household' as const, sortOrder: 999 },
            rows,
          })),
      )
  }, [visible, categories, household])

  if (!household || !householdId || !user) return null

  const save = (draft: ItemDraft) => {
    if (editing) updateItem(householdId, user.uid, editing.id, draft)
    else createItem(householdId, user.uid, draft)
    setEditing(null)
    setCreating(false)
  }

  return (
    <>
      <PageHeader
        title="Stock"
        summary={
          <>
            {plural(items.length, 'ítem', 'ítems')} · {counts.out} faltan · {counts.low} poco ·{' '}
            {counts.expiring} por vencer
          </>
        }
        actions={
          <PillButton icon="add" variant="primary" onClick={() => setCreating(true)}>
            Nuevo ítem
          </PillButton>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <label className="flex w-[250px] items-center gap-2 rounded-full border border-line bg-surface px-4 py-2.5">
          <Icon name="search" size={18} className="text-ink-3" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre o marca"
            className="w-full bg-transparent text-[13.5px] outline-none"
          />
        </label>

        <div className="flex flex-wrap gap-1.5">
          <FilterPill active={!locationId} onClick={() => setLocationId('')}>
            Todas
          </FilterPill>
          {locations.map(([id, location]) => (
            <FilterPill
              key={id}
              active={locationId === id}
              onClick={() => setLocationId(locationId === id ? '' : id)}
            >
              {location.name}
            </FilterPill>
          ))}
        </div>

        <span className="hidden h-[22px] w-px bg-line-strong sm:block" />

        <StatusFilter
          filter={filter}
          setFilter={setFilter}
          value="out"
          icon="error"
          label="Falta"
          count={counts.out}
        />
        <StatusFilter
          filter={filter}
          setFilter={setFilter}
          value="low"
          icon="arrow_downward"
          label="Poco"
          count={counts.low}
        />
        <StatusFilter
          filter={filter}
          setFilter={setFilter}
          value="expiring"
          icon="schedule"
          label="Vence pronto"
          count={counts.expiring}
        />
      </div>

      <div className="flex flex-1 flex-col gap-3.5">
        {grouped.map(({ id, category, rows }) => (
          <section key={id} className="flex flex-col gap-2">
            <SectionLabel>{category.name}</SectionLabel>
            <Card>
              {rows.map((item, index) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  category={category}
                  location={household.locations[item.locationId]}
                  today={today}
                  wantedByPlan={wantedByPlan.has(item.id)}
                  last={index === rows.length - 1}
                  onOpen={() => setEditing(item)}
                  onQuantity={(next) => adjustStock(householdId, user.uid, item, { quantity: next })}
                  onLevel={(next) => adjustStock(householdId, user.uid, item, { level: next })}
                />
              ))}
            </Card>
          </section>
        ))}

        {visible.length === 0 && <EmptyState hasItems={items.length > 0} onNew={() => setCreating(true)} />}
      </div>

      <FooterNote
        left={
          visible.length === items.length
            ? `${plural(items.length, 'ítem', 'ítems')} en el catálogo`
            : `Mostrando ${visible.length} de ${items.length} ítems`
        }
      />

      {(creating || editing) && (
        <ItemSheet
          item={editing ?? undefined}
          categories={categories}
          locations={locations}
          onClose={() => {
            setCreating(false)
            setEditing(null)
          }}
          onSave={save}
          onDelete={
            editing
              ? () => {
                  deleteItem(householdId, editing.id)
                  setEditing(null)
                }
              : undefined
          }
        />
      )}
    </>
  )
}

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3.5 py-[7px] text-xs ${
        active
          ? 'bg-ink font-bold text-ground'
          : 'border border-line bg-surface font-semibold text-ink-2'
      }`}
    >
      {children}
    </button>
  )
}

function StatusFilter({
  filter,
  setFilter,
  value,
  icon,
  label,
  count,
}: {
  filter: Filter
  setFilter: (next: Filter) => void
  value: Filter
  icon: string
  label: string
  count: number
}) {
  const active = filter === value
  const loud = value === 'out' && count > 0
  return (
    <button type="button" onClick={() => setFilter(active ? 'all' : value)}>
      <span
        className={`flex items-center gap-1.5 rounded-full px-3 py-[7px] text-xs ${
          active
            ? 'bg-ink font-bold text-ground'
            : loud
              ? 'bg-danger-soft font-bold text-danger-deep'
              : 'border border-line bg-surface font-semibold text-ink-2'
        }`}
      >
        <Icon name={icon} size={15} />
        {label}
        <span className="opacity-60">{count}</span>
      </span>
    </button>
  )
}

function EmptyState({ hasItems, onNew }: { hasItems: boolean; onNew: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-card border border-line bg-surface px-6 py-14 text-center">
      <Chip icon={hasItems ? 'filter_alt_off' : 'inventory_2'}>
        {hasItems ? 'Nada con esos filtros' : 'Catálogo vacío'}
      </Chip>
      <p className="max-w-[360px] text-sm text-ink-2">
        {hasItems
          ? 'Probá sacando algún filtro o buscando otra cosa.'
          : 'Empezá por la heladera: diez ítems alcanzan para que la lista del súper sirva.'}
      </p>
      {!hasItems && (
        <PillButton icon="add" variant="primary" onClick={onNew}>
          Cargar el primero
        </PillButton>
      )}
    </div>
  )
}

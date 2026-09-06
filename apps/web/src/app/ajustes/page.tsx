'use client'

import { useEffect, useMemo, useState } from 'react'
import { FIELD_LIMITS } from '@/lib/domain/limits'
import { useStoredValue, writeStoredValue } from '@/lib/useStoredValue'
import { applyTheme, asThemePref, THEME_STORAGE_KEY, type ThemePref } from '@/lib/theme'
import { useAuth } from '@/lib/firebase/auth'
import { useHousehold } from '@/lib/firebase/household'
import { applyReceipt, createInvite, updateHousehold } from '@/lib/firebase/mutations'
import { TaxonomySheet } from '@/components/settings/TaxonomySheet'
import type { PlanLength } from '@/lib/domain/dates'
import { plural } from '@/lib/domain/format'
import { PageHeader } from '@/components/PageHeader'
import { ImportSheet } from '@/components/receipts/ImportSheet'
import { VersionCard } from '@/components/VersionCard'
import { Avatar, Card, HueBadge, Icon, SectionLabel } from '@/components/ui/primitives'

const WEEKDAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']

export default function SettingsPage() {
  const { user, signOut } = useAuth()
  const { household, householdId, items, reportWrite} = useHousehold()
  const [copied, setCopied] = useState(false)
  const [importing, setImporting] = useState(false)
  const [editingTaxonomy, setEditingTaxonomy] = useState<'categories' | 'locations' | null>(
    null,
  )

  // The blocking script in layout.tsx already applied the stored theme; this
  // only reflects it in the control. Read through the same external-store hook
  // as the invite code, so no effect sets state synchronously.
  const theme = asThemePref(useStoredValue(THEME_STORAGE_KEY))

  /**
   * A generated invite lives until someone uses it, but the state holding it
   * died on every reload — and reading a code out to someone in the next room
   * is exactly when you reload by accident. Kept per household, and dropped
   * once the household is full: a code the rules now refuse is worse than none.
   */
  const codeKey = householdId ? `stock:invite:${householdId}` : null
  const householdFull = (household?.memberIds.length ?? 0) >= 2
  const stored = useStoredValue(codeKey)
  const code = householdFull ? null : stored

  useEffect(() => {
    if (codeKey && householdFull && stored !== null) writeStoredValue(codeKey, null)
  }, [codeKey, householdFull, stored])

  const perLocation = useMemo(() => {
    const counts = new Map<string, number>()
    for (const item of items) counts.set(item.locationId, (counts.get(item.locationId) ?? 0) + 1)
    return counts
  }, [items])

  // The same count for categories, which until now nothing needed: it is what
  // decides whether an entry can be deleted without orphaning items.
  const perCategory = useMemo(() => {
    const counts = new Map<string, number>()
    for (const item of items) counts.set(item.categoryId, (counts.get(item.categoryId) ?? 0) + 1)
    return counts
  }, [items])

  if (!household || !householdId || !user) return null

  const locations = Object.entries(household.locations).sort(
    (a, b) => a[1].sortOrder - b[1].sortOrder,
  )
  const categories = Object.entries(household.categories).sort(
    (a, b) => a[1].sortOrder - b[1].sortOrder,
  )
  const full = householdFull

  /** Empty is refused, not saved: the rules want 1..60 characters. */
  const renameHousehold = (value: string, input: HTMLInputElement) => {
    const name = value.trim().slice(0, 60)
    if (name === '' || name === household.name) {
      input.value = household.name
      return
    }
    reportWrite(updateHousehold(householdId, { name }))
  }

  return (
    <>
      <PageHeader title="Ajustes" summary="El plan, el catálogo y el hogar." />

      <div className="flex flex-col gap-6 pb-8">
        {/* Configuration first, the way Gastos Diarios orders it: what you came
            to change is above what you came to look at. */}
        <section className="flex flex-col gap-2">
          <SectionLabel>Plan de comidas</SectionLabel>
          <Card className="flex flex-col gap-4 py-4">
            {/* aria-pressed on all three segmented controls below. Which
                option is chosen was expressed by colour alone, so the state
                was unreadable to a screen reader — and untestable, which is
                how the omission stayed. */}
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex-1 text-sm font-semibold">Largo</span>
              <div className="flex rounded-full bg-ground p-[3px]">
                {(['weekly', 'fortnightly'] as PlanLength[]).map((value) => (
                  <button
                    key={value}
                    aria-pressed={household.planConfig.length === value}
                    onClick={() => reportWrite(updateHousehold(householdId, { 'planConfig.length': value }))}
                    className={`rounded-full px-5 py-2 text-[13px] ${
                      household.planConfig.length === value
                        ? 'bg-primary font-bold text-on-primary'
                        : 'font-semibold text-ink-2'
                    }`}
                  >
                    {value === 'weekly' ? 'Semanal' : 'Quincenal'}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex-1 text-sm font-semibold">Arranca el día</span>
              <div className="flex gap-1.5">
                {WEEKDAYS.map((label, index) => (
                  <button
                    key={label}
                    aria-pressed={household.planConfig.startWeekday === index}
                    onClick={() =>
                      reportWrite(updateHousehold(householdId, { 'planConfig.startWeekday': index }))
                    }
                    className={`h-9 w-11 rounded-full text-[12.5px] ${
                      household.planConfig.startWeekday === index
                        ? 'bg-ink font-bold text-ground'
                        : 'border border-line bg-surface font-semibold text-ink-2'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-[11.5px] leading-relaxed text-ink-3">
              Se planifica el viernes y se compra el fin de semana. Solo afecta períodos futuros:
              los ya armados conservan sus límites.
            </p>
          </Card>
        </section>

        <section className="flex flex-col gap-2">
          <SectionLabel>Preferencias</SectionLabel>
          <Card className="flex flex-wrap items-center gap-3 py-3.5">
            <span className="flex-1 text-sm font-semibold">Apariencia</span>
            <div className="flex rounded-full bg-ground p-[3px]">
              {(
                [
                  ['system', 'Sistema'],
                  ['light', 'Claro'],
                  ['dark', 'Oscuro'],
                ] as [ThemePref, string][]
              ).map(([value, label]) => (
                <button
                  key={value}
                  aria-pressed={theme === value}
                  onClick={() => {
                    writeStoredValue(THEME_STORAGE_KEY, value === 'system' ? null : value)
                    applyTheme(value)
                  }}
                  className={`rounded-full px-4 py-2 text-[13px] ${
                    theme === value
                      ? 'bg-primary font-bold text-on-primary'
                      : 'font-semibold text-ink-2'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </Card>
        </section>

        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <SectionLabel>Ubicaciones</SectionLabel>
            <button
              onClick={() => setEditingTaxonomy('locations')}
              className="text-[13px] font-bold text-primary-deep"
            >
              Editar
            </button>
          </div>
          <Card>
            {locations.map(([id, location], index) => (
              <div
                key={id}
                className={`flex items-center gap-3 py-2.5 ${
                  index === locations.length - 1 ? '' : 'border-b border-line-soft'
                }`}
              >
                <HueBadge icon={location.icon} hue={location.hue} size={32} />
                <span className="flex-1 text-sm font-semibold">{location.name}</span>
                <span className="text-[12.5px] text-ink-3">
                  {plural(perLocation.get(id) ?? 0, 'ítem', 'ítems')}
                </span>
              </div>
            ))}
          </Card>
        </section>

        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <SectionLabel>Categorías</SectionLabel>
            <button
              onClick={() => setEditingTaxonomy('categories')}
              className="text-[13px] font-bold text-primary-deep"
            >
              Editar
            </button>
          </div>
          <Card>
            <div className="flex flex-wrap gap-2 py-4">
              {categories.map(([id, category]) => (
                <span
                  key={id}
                  className="flex items-center gap-2 rounded-full border border-line px-3 py-1.5"
                >
                  <HueBadge icon={category.icon} hue={category.hue} size={22} />
                  <span className="text-[13px] font-semibold">{category.name}</span>
                </span>
              ))}
            </div>
            <p className="border-t border-line-soft py-3 text-[11.5px] text-ink-3">
              Solo las categorías de comida participan de las recetas.
            </p>
          </Card>
        </section>

        <section className="flex flex-col gap-2">
          <SectionLabel>Compras</SectionLabel>
          <Card className="flex flex-col gap-3 py-4">
            <button
              onClick={() => setImporting(true)}
              className="flex items-center gap-2 self-start rounded-full border border-line bg-surface px-4 py-2.5 text-[13px] font-bold text-ink"
            >
              <Icon name="receipt_long" size={18} />
              Importar un PDF de Coles
            </button>
            <p className="text-[11.5px] leading-relaxed text-ink-3">
              Actualiza el precio de referencia de lo que ya tenés y te deja dar de alta lo que
              falte. No toca las cantidades: para la compra del día está «Cerrar compra».
            </p>
          </Card>
        </section>

        {/* Household and its invite in one card, as in Gastos Diarios: who is
            here and how someone else gets in is one thought, not two.
            No timezone row — it is chosen once when the household is created
            and every date still resolves against it. */}
        <section className="flex flex-col gap-2">
          <SectionLabel>Hogar</SectionLabel>
          <Card className="divide-y divide-line-soft">
            <label className="flex items-center gap-3 py-3.5">
              <span className="flex-1 text-sm font-semibold">Nombre</span>
              <input
                defaultValue={household.name}
                maxLength={FIELD_LIMITS.householdName}
                onBlur={(e) => renameHousehold(e.target.value, e.target)}
                onKeyDown={(event) => {
                  const input = event.currentTarget
                  if (event.key === 'Enter') input.blur()
                  if (event.key === 'Escape') {
                    input.value = household.name
                    input.blur()
                  }
                }}
                className="min-w-0 flex-1 bg-transparent text-right text-sm font-semibold outline-none"
              />
            </label>
            {household.memberIds.map((uid, index) => (
              <div key={uid} className="flex items-center gap-3 py-3">
                <Avatar
                  name={household.members[uid]?.displayName}
                  colour={index === 1 ? 'bg-member-b' : 'bg-member-a'}
                  size={30}
                />
                <span className="flex-1 text-sm font-semibold">
                  {household.members[uid]?.displayName ?? uid}
                </span>
                {uid === user.uid && (
                  <span className="rounded-full bg-neutral-soft px-2.5 py-1 text-[12.5px] font-semibold text-ink-2">
                    vos
                  </span>
                )}
              </div>
            ))}
            <div className="flex flex-col gap-3 py-4">
              {full ? (
                <p className="text-[13px] text-ink-2">
                  El hogar está completo — 2 de 2. El tope lo fuerzan las reglas de Firestore, no la
                  pantalla.
                </p>
              ) : code ? (
                <>
                  <div className="flex items-center gap-3 rounded-field bg-ground px-4 py-3">
                    <code className="tnum flex-1 text-[15px] font-bold tracking-wider">{code}</code>
                    <button
                      onClick={async () => {
                        await navigator.clipboard.writeText(code)
                        setCopied(true)
                      }}
                      className="flex items-center gap-1.5 text-[13px] font-semibold text-primary-deep"
                    >
                      <Icon name={copied ? 'check' : 'content_copy'} size={16} />
                      {copied ? 'Copiado' : 'Copiar'}
                    </button>
                  </div>
                  <p className="text-[11.5px] leading-relaxed text-ink-3">
                    Conocer el código <em>es</em> el permiso: se puede leer, pero no listar. Borralo
                    desde la consola cuando lo hayan usado.
                  </p>
                </>
              ) : (
                <button
                  onClick={async () => {
                    const next = await createInvite(householdId, user.uid)
                    if (codeKey) writeStoredValue(codeKey, next)
                  }}
                  className="flex items-center gap-2 self-start rounded-full border border-line bg-surface px-4 py-2.5 text-[13px] font-bold text-ink"
                >
                  <Icon name="person_add" size={18} />
                  Generar código
                </button>
              )}
            </div>
          </Card>
        </section>

        <VersionCard />

        {/* A card rather than a bare link, like Gastos Diarios: the last thing
            on the page should look like the others, and read as the exit. */}
        <button
          onClick={() => void signOut()}
          className="flex items-center gap-2.5 rounded-panel border border-line bg-surface px-[18px] py-3.5 text-left"
        >
          <Icon name="logout" size={18} className="text-danger-deep" />
          <span className="text-sm font-semibold text-danger-deep">Cerrar sesión</span>
        </button>
      </div>

      {importing && (
        <ImportSheet
          items={items}
          categories={categories}
          locations={locations}
          onClose={() => setImporting(false)}
          onApply={(actions, deleteItemIds) => {
            reportWrite(applyReceipt(householdId, user.uid, actions, deleteItemIds))
            setImporting(false)
          }}
        />
      )}

      {editingTaxonomy && (
        <TaxonomySheet
          kind={editingTaxonomy}
          entries={editingTaxonomy === 'categories' ? categories : locations}
          counts={editingTaxonomy === 'categories' ? perCategory : perLocation}
          onClose={() => setEditingTaxonomy(null)}
          onSave={(next) => {
            reportWrite(updateHousehold(householdId, { [editingTaxonomy]: next }))
            setEditingTaxonomy(null)
          }}
        />
      )}
    </>
  )
}

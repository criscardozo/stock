'use client'

import { useEffect, useMemo, useState } from 'react'
import { useStoredValue, writeStoredValue } from '@/lib/useStoredValue'
import { useAuth } from '@/lib/firebase/auth'
import { useHousehold } from '@/lib/firebase/household'
import { createInvite, updateHousehold } from '@/lib/firebase/mutations'
import type { PlanLength } from '@/lib/domain/dates'
import { plural } from '@/lib/domain/format'
import { PageHeader } from '@/components/PageHeader'
import { VersionCard } from '@/components/VersionCard'
import { Avatar, Card, HueBadge, Icon, SectionLabel } from '@/components/ui/primitives'

const WEEKDAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']

export default function SettingsPage() {
  const { user, signOut } = useAuth()
  const { household, householdId, items } = useHousehold()
  const [copied, setCopied] = useState(false)

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
    updateHousehold(householdId, { name })
  }

  return (
    <>
      <PageHeader title="Ajustes" summary="Hogar, invitación, ubicaciones y el período del plan." />

      <div className="flex flex-col gap-6 pb-8">
        <section className="flex flex-col gap-2">
          <SectionLabel>Hogar</SectionLabel>
          <Card className="divide-y divide-line-soft">
            <label className="flex items-center gap-3 py-3.5">
              <span className="w-32 text-sm text-ink-2">Nombre</span>
              <input
                defaultValue={household.name}
                maxLength={60}
                onBlur={(e) => renameHousehold(e.target.value, e.target)}
                onKeyDown={(event) => {
                  const input = event.currentTarget
                  if (event.key === 'Enter') input.blur()
                  if (event.key === 'Escape') {
                    input.value = household.name
                    input.blur()
                  }
                }}
                className="flex-1 bg-transparent text-[14.5px] font-semibold outline-none"
              />
            </label>
            <div className="flex items-center gap-3 py-3.5">
              <span className="w-32 text-sm text-ink-2">Zona horaria</span>
              <span className="flex-1 text-[14.5px] font-semibold">{household.timezone}</span>
              <span className="text-xs text-ink-3">las fechas se calculan acá</span>
            </div>
            {household.memberIds.map((uid, index) => (
              <div key={uid} className="flex items-center gap-3 py-3">
                <Avatar
                  name={household.members[uid]?.displayName}
                  colour={index === 1 ? 'bg-member-b' : 'bg-member-a'}
                  size={30}
                />
                <span className="flex-1 text-[14.5px] font-semibold">
                  {household.members[uid]?.displayName ?? uid}
                </span>
                {uid === user.uid && (
                  <span className="rounded-full bg-neutral-soft px-2.5 py-1 text-xs font-semibold text-ink-2">
                    vos
                  </span>
                )}
              </div>
            ))}
          </Card>
        </section>

        <section className="flex flex-col gap-2">
          <SectionLabel>Invitación</SectionLabel>
          <Card className="flex flex-col gap-3 py-4">
            {full ? (
              <p className="text-sm text-ink-2">
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
                className="flex items-center gap-2 self-start rounded-full border border-line bg-surface px-4 py-2.5 text-sm font-semibold text-ink-2"
              >
                <Icon name="person_add" size={18} />
                Generar código
              </button>
            )}
          </Card>
        </section>

        <section className="flex flex-col gap-2">
          <SectionLabel>Plan de comidas</SectionLabel>
          <Card className="flex flex-col gap-4 py-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="w-32 text-sm text-ink-2">Largo</span>
              <div className="flex rounded-full bg-ground p-[3px]">
                {(['weekly', 'fortnightly'] as PlanLength[]).map((value) => (
                  <button
                    key={value}
                    onClick={() => updateHousehold(householdId, { 'planConfig.length': value })}
                    className={`rounded-full px-5 py-2 text-[13.5px] ${
                      household.planConfig.length === value
                        ? 'bg-primary font-bold text-white'
                        : 'font-semibold text-ink-2'
                    }`}
                  >
                    {value === 'weekly' ? 'Semanal' : 'Quincenal'}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="w-32 text-sm text-ink-2">Arranca el día</span>
              <div className="flex gap-1.5">
                {WEEKDAYS.map((label, index) => (
                  <button
                    key={label}
                    onClick={() =>
                      updateHousehold(householdId, { 'planConfig.startWeekday': index })
                    }
                    className={`h-9 w-11 rounded-full text-xs ${
                      household.planConfig.startWeekday === index
                        ? 'bg-ink font-bold text-white'
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
          <SectionLabel>Ubicaciones</SectionLabel>
          <Card>
            {locations.map(([id, location], index) => (
              <div
                key={id}
                className={`flex items-center gap-3 py-2.5 ${
                  index === locations.length - 1 ? '' : 'border-b border-line-soft'
                }`}
              >
                <HueBadge icon={location.icon} hue={location.hue} size={32} />
                <span className="flex-1 text-[14.5px] font-semibold">{location.name}</span>
                <span className="text-xs text-ink-3">
                  {plural(perLocation.get(id) ?? 0, 'ítem', 'ítems')}
                </span>
              </div>
            ))}
          </Card>
        </section>

        <section className="flex flex-col gap-2">
          <SectionLabel>Categorías</SectionLabel>
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

        <VersionCard />

        <button
          onClick={() => void signOut()}
          className="flex items-center gap-2 self-start text-sm font-semibold text-ink-2"
        >
          <Icon name="logout" size={18} />
          Cerrar sesión
        </button>
      </div>
    </>
  )
}

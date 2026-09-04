'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { doc, getDoc } from 'firebase/firestore'
import { useAuth } from '@/lib/firebase/auth'
import { db } from '@/lib/firebase/client'
import { useHousehold } from '@/lib/firebase/household'
import { ensurePlan, markCooked, setPlanDay, type Consumption } from '@/lib/firebase/mutations'
import { addDays, daysOf, lengthInDays, type IsoDate } from '@/lib/domain/dates'
import { dayParts, formatDayMonth, missingText, plural } from '@/lib/domain/format'
import { availabilityOf } from '@/lib/domain/recipes'
import type { MealPlan, PlanDay, Recipe } from '@/lib/domain/types'
import { PageHeader, FooterNote } from '@/components/PageHeader'
import { CalendarImportSheet } from '@/components/plan/CalendarImportSheet'
import { googleOAuthClientId } from '@/lib/firebase/config'
import { Chip, Icon, PillButton, SectionLabel, Sheet } from '@/components/ui/primitives'
import { CookSheet } from '@/components/plan/CookSheet'

export default function PlanPage() {
  const { user } = useAuth()
  const { household, householdId, plan, planStart, recipes, itemsById, today, reportWrite} = useHousehold()
  const [offset, setOffset] = useState(0)
  const [importing, setImporting] = useState(false)
  const [fetched, setFetched] = useState<{ start: IsoDate | null; plan: MealPlan | null }>({
    start: null,
    plan: null,
  })
  const [cooking, setCooking] = useState<{ date: IsoDate; recipe: Recipe | null } | null>(null)
  const [picking, setPicking] = useState<IsoDate | null>(null)

  const length = household?.planConfig.length ?? 'fortnightly'
  const visibleStart = planStart ? addDays(planStart, offset * lengthInDays(length)) : null

  // Lazy materialisation of the CURRENT period only — a past period nobody
  // opened never needed a document, and creating one while browsing history
  // would write documents for weeks that never happened.
  useEffect(() => {
    if (!householdId || !planStart || plan || offset !== 0) return
    void ensurePlan(householdId, planStart, length)
  }, [householdId, planStart, plan, length, offset])

  // Past/future periods are read once, not listened to: you visit them, you
  // don't live in them. The result carries the period it belongs to, so
  // switching periods shows nothing rather than last period's meals.
  useEffect(() => {
    if (!householdId || !visibleStart || offset === 0) return
    let live = true
    void getDoc(doc(db(), 'households', householdId, 'mealPlans', visibleStart)).then((snap) => {
      if (!live) return
      setFetched({
        start: visibleStart,
        plan: snap.exists() ? ({ id: snap.id, ...snap.data() } as MealPlan) : null,
      })
    })
    return () => {
      live = false
    }
  }, [householdId, visibleStart, offset])

  const visible = offset === 0 ? plan : fetched.start === visibleStart ? fetched.plan : null
  const days = useMemo(
    () => (visibleStart ? daysOf(visibleStart, visible?.length ?? length) : []),
    [visibleStart, visible, length],
  )

  const stats = useMemo(() => {
    let planned = 0
    let missing = 0
    for (const date of days) {
      const day = visible?.days?.[date]
      if (!day || (!day.recipeId && !day.label)) continue
      planned += 1
      if (day.status === 'planned' && day.recipeId) {
        const recipe = recipes.find((r) => r.id === day.recipeId)
        if (recipe) missing += availabilityOf(recipe, itemsById).missing
      }
    }
    return { planned, free: days.length - planned, missing }
  }, [days, visible, recipes, itemsById])

  if (!household || !householdId || !user || !visibleStart) return null

  const weeks = length === 'fortnightly' ? [days.slice(0, 7), days.slice(7)] : [days]

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3.5">
            Plan
            <span className="flex items-center gap-0.5 rounded-full border border-line bg-surface px-2 py-1.5 text-[13.5px] font-semibold">
              <button onClick={() => setOffset(offset - 1)} aria-label="Período anterior">
                <Icon name="chevron_left" size={18} className="text-ink-2" />
              </button>
              <span className="px-1.5">
                {formatDayMonth(visibleStart)} – {formatDayMonth(days.at(-1) ?? visibleStart)}
              </span>
              <button onClick={() => setOffset(offset + 1)} aria-label="Período siguiente">
                <Icon name="chevron_right" size={18} className="text-ink-2" />
              </button>
            </span>
            {offset !== 0 && (
              <button
                onClick={() => setOffset(0)}
                className="rounded-full bg-neutral-soft px-3 py-1.5 text-xs font-semibold text-ink-2"
              >
                Volver a hoy
              </button>
            )}
            {/* Hidden rather than broken when the OAuth client id is unset:
                the rest of the app does not need it, and a button that always
                errors is worse than no button. */}
            {googleOAuthClientId !== null && visible && (
              <button
                onClick={() => setImporting(true)}
                className="flex items-center gap-1.5 rounded-full bg-neutral-soft px-3 py-1.5 text-xs font-semibold text-ink-2"
              >
                <Icon name="calendar_month" size={16} />
                Traer del calendario
              </button>
            )}
          </span>
        }
        summary={
          <>
            {stats.planned} planeados · {stats.free} libres
            {stats.missing > 0 && ` · ${missingText(stats.missing)}`}
          </>
        }
        actions={
          <Link href="/falta-comprar">
            <PillButton icon="shopping_cart" variant="primary">
              Ver qué falta
            </PillButton>
          </Link>
        }
      />

      {!visible && offset !== 0 && (
        <p className="rounded-card border border-dashed border-line-strong px-6 py-10 text-center text-sm text-ink-2">
          Ese período no se planificó.
        </p>
      )}

      <div className="grid flex-1 grid-cols-1 gap-x-6 gap-y-4 lg:grid-cols-2">
        {weeks.map((week, index) => (
          <div key={index} className="flex flex-col gap-[7px]">
            {weeks.length > 1 && <SectionLabel>Semana {index + 1}</SectionLabel>}
            {week.map((date) => (
              <DayRow
                key={date}
                date={date}
                day={visible?.days?.[date]}
                today={today}
                recipe={recipes.find((r) => r.id === visible?.days?.[date]?.recipeId) ?? null}
                itemsById={itemsById}
                onPick={() => setPicking(date)}
                onCook={(recipe) => setCooking({ date, recipe })}
              />
            ))}
          </div>
        ))}
      </div>

      <FooterNote
        left="Cambiar el largo del período afecta los futuros; los ya armados conservan sus límites."
        right={
          <>
            <Icon name="bolt" size={15} />
            El doc del plan se crea perezosamente, con ID determinístico.
          </>
        }
      />

      {picking && visible && (
        <PickMealSheet
          date={picking}
          recipes={recipes}
          itemsById={itemsById}
          current={visible.days?.[picking]}
          onClose={() => setPicking(null)}
          onPick={(day) => {
            reportWrite(setPlanDay(householdId, visible.id, picking, day))
            setPicking(null)
          }}
        />
      )}

      {cooking && visible && (
        <CookSheet
          recipe={cooking.recipe}
          itemsById={itemsById}
          onClose={() => setCooking(null)}
          onJustMark={() => {
            reportWrite(markCooked(householdId, user.uid, visible.id, cooking.date, cooking.recipe, []))
            setCooking(null)
          }}
          onConfirm={(consumption: Consumption[]) => {
            reportWrite(markCooked(householdId, user.uid, visible.id, cooking.date, cooking.recipe, consumption))
            setCooking(null)
          }}
        />
      )}
      {importing && googleOAuthClientId !== null && visible && (
        <CalendarImportSheet
          clientId={googleOAuthClientId}
          recipes={recipes}
          startDate={visibleStart}
          endDate={days.at(-1) ?? visibleStart}
          onClose={() => setImporting(false)}
          onApply={(rows) => {
            // One write per day rather than one batch: they are independent, a
            // day that fails does not invalidate the others, and setPlanDay is
            // already the operation the rest of this screen uses.
            for (const row of rows) {
              reportWrite(setPlanDay(householdId, visible.id, row.date, {
                ...(row.recipeId ? { recipeId: row.recipeId } : {}),
                ...(row.label ? { label: row.label } : {}),
              }))
            }
            setImporting(false)
          }}
        />
      )}

    </>
  )
}

function DayRow({
  date,
  day,
  today,
  recipe,
  itemsById,
  onPick,
  onCook,
}: {
  date: IsoDate
  day?: PlanDay
  today: IsoDate
  recipe: Recipe | null
  itemsById: Map<string, import('@/lib/domain/types').Item>
  onPick: () => void
  onCook: (recipe: Recipe | null) => void
}) {
  const { weekday, day: dayNumber } = dayParts(date)
  const isToday = date === today
  const cooked = day?.status === 'cooked'
  const empty = !day || (!day.recipeId && !day.label)
  const availability = recipe ? availabilityOf(recipe, itemsById) : null

  if (empty) {
    return (
      <button
        onClick={onPick}
        className="flex items-center gap-3.5 rounded-panel border-[1.5px] border-dashed border-line-strong px-4 py-3.5 text-left"
      >
        <DayStamp weekday={weekday} day={dayNumber} muted today={isToday} />
        <span className="flex-1 text-sm text-ink-3">Sin plan</span>
        <span className="flex items-center gap-1.5 text-[13px] font-bold text-primary-deep">
          <Icon name="add" size={16} />
          Elegir
        </span>
      </button>
    )
  }

  return (
    <div
      className={`flex items-center gap-3.5 rounded-panel bg-surface px-4 py-3.5 ${
        isToday && !cooked
          ? 'border-[1.5px] border-primary shadow-(--shadow-lift)'
          : 'border border-line'
      } ${cooked ? 'opacity-60' : ''}`}
    >
      <DayStamp weekday={weekday} day={dayNumber} today={isToday} />

      {/* The day is in DayStamp, which sits OUTSIDE both buttons — so six planned
          days give six controls called "Cocinada" and two called "Milanesas 4
          porciones", with nothing to tell them apart. Naming them by their day
          is what makes the row operable without seeing it, and what lets a test
          address one day rather than the first match. */}
      <button
        aria-label={`${weekday} ${dayNumber}: ${recipe?.title ?? day?.label ?? 'Sin plan'}`}
        onClick={onPick}
        className="flex min-w-0 flex-1 flex-col items-start leading-tight"
      >
        <span
          className={`truncate text-[15px] ${
            recipe ? 'font-semibold' : 'font-medium text-ink-2 italic'
          } ${cooked ? 'line-through' : ''}`}
        >
          {recipe?.title ?? day?.label}
        </span>
        {recipe && (
          <span className="text-xs text-ink-2">
            {plural(recipe.servings, 'porción', 'porciones')}
            {availability && availability.missing > 0 && ` · ${missingText(availability.missing)}`}
          </span>
        )}
      </button>

      {cooked ? (
        <Chip icon="check_circle">Cocinada</Chip>
      ) : (
        <>
          {availability && !availability.unknown && (
            availability.missing > 0 ? (
              <Chip tone="danger-quiet">
                {availability.missing === 1 ? 'Falta 1' : `Faltan ${availability.missing}`}
              </Chip>
            ) : (
              <Chip icon="check_circle" tone="primary">
                Todo
              </Chip>
            )
          )}
          {day?.recipeId ? (
            <button
              aria-label={`Cocinada ${weekday} ${dayNumber}`}
              onClick={() => onCook(recipe)}
              className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-bold ${
                isToday
                  ? 'bg-primary text-on-primary shadow-(--shadow-primary)'
                  : 'bg-primary-soft text-primary-deep'
              }`}
            >
              <Icon name="local_dining" size={16} />
              Cocinada
            </button>
          ) : null}
        </>
      )}
    </div>
  )
}

function DayStamp({
  weekday,
  day,
  today,
  muted,
}: {
  weekday: string
  day: string
  today?: boolean
  muted?: boolean
}) {
  return (
    <div className="flex w-[52px] shrink-0 flex-col leading-none">
      <span
        className={`text-[11px] font-bold tracking-[0.05em] uppercase ${
          today ? 'text-primary-deep' : muted ? 'text-ink-4' : 'text-ink-3'
        }`}
      >
        {weekday}
        {today && ' · hoy'}
      </span>
      <span className={`text-lg font-bold ${muted ? 'text-ink-3' : ''}`}>{day}</span>
    </div>
  )
}

/** Pick a recipe, write a free label ("Afuera"), or clear the day. */
function PickMealSheet({
  date,
  recipes,
  itemsById,
  current,
  onClose,
  onPick,
}: {
  date: IsoDate
  recipes: Recipe[]
  itemsById: Map<string, import('@/lib/domain/types').Item>
  current?: PlanDay
  onClose: () => void
  onPick: (day: { recipeId?: string; label?: string } | null) => void
}) {
  const [label, setLabel] = useState(current?.label ?? '')
  const { weekday, day } = dayParts(date)

  return (
    <Sheet
      title={`${weekday} ${day}`}
      subtitle="Qué se cocina"
      icon="calendar_month"
      hue="green"
      onClose={onClose}
      footer={
        <button
          onClick={() => onPick(null)}
          className="text-center text-[13.5px] font-semibold text-ink-2"
        >
          Dejarlo sin plan
        </button>
      }
    >
      <div className="flex flex-wrap gap-2">
        {['Afuera', 'Sobras', 'Cada uno lo suyo'].map((preset) => (
          <button
            key={preset}
            onClick={() => onPick({ label: preset })}
            className="rounded-full border border-line bg-ground px-3.5 py-2 text-[13px] font-semibold text-ink-2"
          >
            {preset}
          </button>
        ))}
      </div>

      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          if (label.trim()) onPick({ label: label.trim() })
        }}
      >
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="…o escribí otra cosa"
          className="flex-1 rounded-field bg-ground px-3.5 py-[11px] text-sm outline-none"
        />
      </form>

      <div className="flex max-h-[40dvh] flex-col overflow-auto rounded-panel bg-ground px-4">
        {recipes.map((recipe, index) => {
          const availability = availabilityOf(recipe, itemsById)
          return (
            <button
              key={recipe.id}
              onClick={() => onPick({ recipeId: recipe.id })}
              className={`flex items-center gap-3 py-3 text-left ${
                index === recipes.length - 1 ? '' : 'border-b border-line-soft'
              }`}
            >
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                {recipe.title}
              </span>
              {!availability.unknown &&
                (availability.missing > 0 ? (
                  <Chip tone="danger-quiet">
                    {availability.missing === 1 ? 'Falta 1' : `Faltan ${availability.missing}`}
                  </Chip>
                ) : (
                  <Chip icon="check_circle" tone="primary">
                    Todo
                  </Chip>
                ))}
            </button>
          )
        })}
        {recipes.length === 0 && (
          <p className="py-6 text-center text-sm text-ink-2">
            Todavía no hay recetas cargadas.
          </p>
        )}
      </div>
    </Sheet>
  )
}

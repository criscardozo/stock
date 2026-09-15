'use client'

import { useState } from 'react'
import type { Recipe } from '@/lib/domain/types'
import { formatDayMonth } from '@/lib/domain/format'
import { CALENDAR_SCOPE, fetchEvents, MEALS_CALENDAR_ID, requestAccessToken } from '@/lib/calendar/client'
import { matchEvents, type Match } from '@/lib/calendar/match'
import { Icon, PrimaryAction, Sheet } from '../ui/primitives'

/**
 * Bringing a week of the meals calendar into the plan.
 *
 * It PROPOSES. Nothing is written until the button at the bottom is pressed,
 * and every row can be turned off first. That is not caution for its own sake:
 * matching is exact but not certain, and a plan that quietly says Thursday is
 * the aubergine milanesas when it is the chicken ones is worse than a Thursday
 * left blank, because nobody re-reads a plan that looks right.
 *
 * An event that matched nothing still becomes a day, with its own title as the
 * label — the plan has always supported a day with no recipe, and "asado en lo
 * de mi vieja" is a real Thursday.
 */
export function CalendarImportSheet({
  clientId,
  recipes,
  startDate,
  endDate,
  onClose,
  onApply,
}: {
  clientId: string
  recipes: Recipe[]
  startDate: string
  endDate: string
  onClose: () => void
  onApply: (rows: { date: string; recipeId?: string; label?: string }[]) => void
}) {
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [matches, setMatches] = useState<Match[]>([])
  const [skipped, setSkipped] = useState<Set<number>>(new Set())

  const load = async () => {
    setState('loading')
    setError(null)
    try {
      const token = await requestAccessToken(clientId)
      const events = await fetchEvents(token, MEALS_CALENDAR_ID, startDate, endDate)
      setMatches(matchEvents(events, recipes))
      setSkipped(new Set())
      setState('ready')
    } catch (cause) {
      // Said, not swallowed. The token can be refused, the network can be down,
      // and the calendar can be the wrong one — all of which look identical as
      // an empty list.
      setError(cause instanceof Error ? cause.message : 'No pude leer el calendario')
      setState('error')
    }
  }

  const toggle = (index: number) =>
    setSkipped((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })

  const chosen = matches.filter((_, i) => !skipped.has(i))

  return (
    <Sheet
      title="Traer del calendario"
      subtitle={`${formatDayMonth(startDate)} – ${formatDayMonth(endDate)}`}
      icon="calendar_month"
      onClose={onClose}
      footer={
        state === 'ready' ? (
          <div className="flex flex-col gap-3">
            <PrimaryAction
              icon="check"
              disabled={chosen.length === 0}
              onClick={() =>
                onApply(
                  chosen.map((m) => ({
                    date: m.event.date,
                    ...(m.recipeId ? { recipeId: m.recipeId } : { label: m.event.summary }),
                  })),
                )
              }
            >
              Poner {chosen.length} {chosen.length === 1 ? 'día' : 'días'} en el plan
            </PrimaryAction>
            <p className="text-center text-[11.5px] leading-relaxed text-ink-3">
              Pisa lo que ya haya en esos días. Los que no marcaste quedan como están.
            </p>
          </div>
        ) : (
          <PrimaryAction icon="calendar_month" onClick={() => void load()}>
            {state === 'loading' ? 'Leyendo…' : 'Leer el calendario'}
          </PrimaryAction>
        )
      }
    >
      {state === 'idle' && (
        <p className="text-[13px] leading-relaxed text-ink-2">
          Voy a leer los eventos de esta quincena del calendario de comidas y buscarles la receta.
          Google te va a pedir permiso de <strong className="font-semibold">solo lectura</strong> la
          primera vez ({CALENDAR_SCOPE.split('/').pop()}). Nada se guarda hasta que confirmes.
        </p>
      )}

      {state === 'error' && (
        <p className="flex items-start gap-2 text-[13px] font-semibold text-danger-deep">
          <Icon name="error" size={18} />
          {error}
        </p>
      )}

      {state === 'ready' && matches.length === 0 && (
        <p className="text-[13px] leading-relaxed text-ink-2">
          No hay eventos en esos días. Eso es una respuesta, no un error: el calendario está vacío
          para esta quincena.
        </p>
      )}

      {state === 'ready' && matches.length > 0 && (
        <div className="rounded-panel bg-ground px-4">
          {matches.map((match, index) => {
            const recipe = recipes.find((r) => r.id === match.recipeId)
            const off = skipped.has(index)
            return (
              <div
                key={`${match.event.date}-${index}`}
                className={`flex items-center gap-3 py-3 ${
                  index === matches.length - 1 ? '' : 'border-b border-line-soft'
                }`}
              >
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={!off}
                  aria-label={`${off ? 'Incluir' : 'Saltear'} ${match.event.summary}`}
                  onClick={() => toggle(index)}
                  className={`grid size-5 shrink-0 place-items-center rounded-checkbox ${
                    off ? 'border border-line-strong' : 'bg-primary text-on-primary'
                  }`}
                >
                  {!off && <Icon name="check" size={15} />}
                </button>

                <span className="w-14 shrink-0 text-xs font-semibold text-ink-3">
                  {formatDayMonth(match.event.date)}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">
                    {match.event.summary}
                  </span>
                  <span className="block truncate text-xs text-ink-3">
                    {recipe ? (
                      <>
                        {recipe.title}
                        {match.source === 'description' && ' · lo dijo la descripción'}
                      </>
                    ) : match.ambiguous && match.ambiguous.length > 1 ? (
                      `${match.ambiguous.length} recetas se llaman así — elegila a mano`
                    ) : (
                      'sin receta · entra como texto'
                    )}
                  </span>
                </span>

                <Icon
                  name={recipe ? 'restaurant' : 'help'}
                  size={17}
                  className={recipe ? 'text-primary-deep' : 'text-ink-4'}
                />
              </div>
            )
          })}
        </div>
      )}
    </Sheet>
  )
}

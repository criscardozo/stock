import { addDays, periodStartFor, todayIn, type IsoDate } from '../src/lib/domain/dates'
import { dayParts, formatDayMonth } from '../src/lib/domain/format'

/**
 * The seeded plan, computed rather than written down.
 *
 * `tools/seed-emulator.mjs` builds its period from TODAY in the household's
 * timezone, so every day in it moves with the calendar. Specs that named a day
 * — "Cocinada dom 30" — passed on the day they were written and failed the
 * next morning, which is a test that reports the date rather than the code.
 *
 * Offsets mirror the seed's `days` map; keep them in step with it.
 */
export const TIMEZONE = 'Australia/Sydney'
export const START_WEEKDAY = 6 // Saturday: planning happens on Friday.

export const planStart: IsoDate = periodStartFor(todayIn(TIMEZONE), START_WEEKDAY)

/** Day of the seeded period, by its offset from the start. */
export const day = (offset: number): IsoDate => addDays(planStart, offset)

/** How the plan screen names a day: "sáb 5". */
export function dayLabel(offset: number): string {
  const { weekday, day: number } = dayParts(day(offset))
  return `${weekday} ${number}`
}

/** How the period header renders a range: "5 sept – 18 sept". */
export function rangeLabel(startOffset: number, days: number): string {
  return `${formatDayMonth(day(startOffset))} – ${formatDayMonth(day(startOffset + days - 1))}`
}

/** Offsets the seed fills. */
export const COOKED = 0 // milanesas, already cooked
export const LEVEL_RECIPE = 1 // pastel de papa — three level-tracked ingredients
export const SALMON = 10 // salmón al horno — counted, 2 filetes
export const EMPTY = 8 // no other spec touches it

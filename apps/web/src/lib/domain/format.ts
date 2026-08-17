/** Presentation-only date formatting. The arithmetic lives in dates.ts. */
import type { IsoDate } from './dates'

// UTC as the display zone is correct here BECAUSE the input is already a
// calendar date in the household's zone — re-interpreting it locally is exactly
// the bug that makes Wednesday render as Tuesday.
const dayShort = new Intl.DateTimeFormat('es-AR', {
  timeZone: 'UTC',
  weekday: 'short',
  day: 'numeric',
})

const dayLong = new Intl.DateTimeFormat('es-AR', {
  timeZone: 'UTC',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
})

function asUtcDate(date: IsoDate): Date {
  return new Date(`${date}T12:00:00Z`)
}

/** `"2026-08-19"` → `"mié 19"` */
export function formatDayShort(date: IsoDate): string {
  return dayShort.format(asUtcDate(date)).replace('.', '')
}

/** `"2026-08-19"` → `"miércoles 19 de agosto"` */
export function formatDayLong(date: IsoDate): string {
  return dayLong.format(asUtcDate(date))
}

const dayMonth = new Intl.DateTimeFormat('es-AR', {
  timeZone: 'UTC',
  day: 'numeric',
  month: 'short',
})

/** `"2026-08-19"` → `"19 ago"` */
export function formatDayMonth(date: IsoDate): string {
  return dayMonth.format(asUtcDate(date)).replace('.', '')
}

/** `"sáb"` / `"18"`, for the plan's day column. */
export function dayParts(date: IsoDate): { weekday: string; day: string } {
  const value = asUtcDate(date)
  return {
    weekday: new Intl.DateTimeFormat('es-AR', { timeZone: 'UTC', weekday: 'short' })
      .format(value)
      .replace('.', ''),
    day: String(value.getUTCDate()),
  }
}

/** Plural without the "1 días" tell. */
export function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}

/** `1` → `"falta 1 ingrediente"`, `2` → `"faltan 2 ingredientes"`. */
export function missingText(count: number): string {
  return count === 1 ? 'falta 1 ingrediente' : `faltan ${count} ingredientes`
}

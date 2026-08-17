/**
 * Calendar arithmetic for the app. Implemented twice (here and in Swift) and
 * validated by `shared/plan-period-vectors.json` — change the vectors first.
 *
 * Two rules make everything else fall out:
 *   1. A date is a "YYYY-MM-DD" string in the HOUSEHOLD's timezone, so an
 *      expense-free 23:30 in Sydney is still today, and a member travelling
 *      doesn't shift the plan.
 *   2. Arithmetic happens in UTC, which has no DST, so adding a day across the
 *      end of daylight saving is still exactly one day. `+ 86400000` is not.
 */

export type IsoDate = string

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export function isIsoDate(value: unknown): value is IsoDate {
  return typeof value === 'string' && ISO_DATE.test(value)
}

function pad(n: number, width = 2): string {
  return String(n).padStart(width, '0')
}

function parts(date: IsoDate): [number, number, number] {
  const [y, m, d] = date.split('-').map(Number)
  return [y, m, d]
}

function toUtc(date: IsoDate): Date {
  const [y, m, d] = parts(date)
  return new Date(Date.UTC(y, m - 1, d))
}

function fromUtc(value: Date): IsoDate {
  return `${pad(value.getUTCFullYear(), 4)}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`
}

/** The calendar date it is right now in `timezone`. */
export function todayIn(timezone: string, now: Date = new Date()): IsoDate {
  // formatToParts rather than an en-CA string: the locale's date order is not
  // ours to assume, but the part names are.
  const found = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)

  const get = (type: string) => found.find((p) => p.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

/** 0 = Sunday, matching JS `getDay()` and `planConfig.startWeekday`. */
export function weekdayOf(date: IsoDate): number {
  return toUtc(date).getUTCDay()
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const [y, m, d] = parts(date)
  return fromUtc(new Date(Date.UTC(y, m - 1, d + days)))
}

export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((toUtc(to).getTime() - toUtc(from).getTime()) / 86_400_000)
}

export type PlanLength = 'weekly' | 'fortnightly'

export function lengthInDays(length: PlanLength): number {
  return length === 'weekly' ? 7 : 14
}

/** The start of the period `date` falls in, given the configured start weekday. */
export function periodStartFor(date: IsoDate, startWeekday: number): IsoDate {
  const back = (weekdayOf(date) - startWeekday + 7) % 7
  return addDays(date, -back)
}

/** Inclusive end: a weekly period starting Saturday ends the following Friday. */
export function periodEndFor(startDate: IsoDate, length: PlanLength): IsoDate {
  return addDays(startDate, lengthInDays(length) - 1)
}

export function daysOf(startDate: IsoDate, length: PlanLength): IsoDate[] {
  return Array.from({ length: lengthInDays(length) }, (_, i) => addDays(startDate, i))
}

export function isWithin(date: IsoDate, startDate: IsoDate, endDate: IsoDate): boolean {
  return date >= startDate && date <= endDate
}

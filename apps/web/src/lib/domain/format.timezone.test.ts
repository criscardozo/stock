import { afterAll, describe, expect, it, vi } from 'vitest'

/**
 * The formatters, run from somewhere that is not here.
 *
 * A separate file because the zone has to be set BEFORE the module loads: the
 * `Intl.DateTimeFormat`s in format.ts are module-level constants and resolve
 * their zone once, at construction.
 *
 * This exists because the plain format tests could not fail. An `IsoDate` is a
 * calendar date already resolved in the household's zone, and every way of
 * mishandling that renders a plausible Spanish date for the WRONG day — but
 * only on a machine far enough from UTC. This one is `Australia/Sydney` (+10),
 * and at +10 none of the mistakes show: dropping `timeZone: 'UTC'` still
 * printed the right day, so the tests asserting it passed while pinning
 * nothing. Measured, not assumed:
 *
 *   zone                actual   without timeZone   without the noon anchor
 *   Pacific/Kiritimati  19 ago   20 ago             19 ago
 *   Pacific/Honolulu    19 ago   19 ago             18 ago
 *   Australia/Sydney    19 ago   19 ago             19 ago
 *
 * So it takes both ends of the date line to corner it, and the noon anchor is
 * deliberately the redundant layer — with `timeZone: 'UTC'` in place the anchor
 * cannot move the day, which is why no test can fail on removing it alone.
 * That is what a second layer is.
 */
const REAL_TZ = process.env.TZ

async function formatIn(zone: string) {
  process.env.TZ = zone
  vi.resetModules()
  return await import('./format')
}

afterAll(() => {
  process.env.TZ = REAL_TZ
})

describe('from +14, a day ahead of UTC', () => {
  it('still renders the day the date names', async () => {
    const { formatDayShort, formatDayMonth, dayParts } = await formatIn('Pacific/Kiritimati')
    expect(formatDayShort('2026-08-19')).toBe('mié 19')
    expect(formatDayMonth('2026-08-19')).toBe('19 ago')
    expect(dayParts('2026-08-19')).toEqual({ weekday: 'mié', day: '19' })
    expect(formatDayMonth('2026-12-31')).toBe('31 dic')
  })
})

describe('from -10, a day behind UTC', () => {
  it('still renders the day the date names', async () => {
    const { formatDayShort, formatDayMonth, formatDayLong } = await formatIn('Pacific/Honolulu')
    expect(formatDayShort('2026-08-19')).toBe('mié 19')
    expect(formatDayMonth('2026-08-19')).toBe('19 ago')
    expect(formatDayLong('2026-01-01')).toBe('jueves, 1 de enero')
  })
})

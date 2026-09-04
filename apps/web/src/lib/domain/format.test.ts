import { describe, expect, it } from 'vitest'
import { dayParts, formatDayLong, formatDayMonth, formatDayShort, missingText, plural } from './format'

/**
 * Display only — the arithmetic is in dates.ts and tested there.
 *
 * What these pin is the thing a refactor breaks silently: an `IsoDate` is a
 * calendar date in the HOUSEHOLD's zone, already resolved. Re-interpreting it
 * in the device's zone renders Wednesday as Tuesday, and every one of these
 * would still return a plausible-looking Spanish date while doing it. The
 * anchor is noon UTC precisely so no zone can move the day.
 */
const WED = '2026-08-19'

describe('the day formatters', () => {
  it('read the date as the calendar day it names', () => {
    expect(formatDayShort(WED)).toBe('mié 19')
    expect(formatDayLong(WED)).toBe('miércoles, 19 de agosto')
    expect(formatDayMonth(WED)).toBe('19 ago')
    expect(dayParts('2026-08-22')).toEqual({ weekday: 'sáb', day: '22' })
  })

  it('does not shift the day at either end of the date', () => {
    // The noon anchor's whole job. A midnight anchor plus any zone west of UTC
    // renders the 1st as the last day of the previous month.
    expect(formatDayMonth('2026-01-01')).toBe('1 ene')
    expect(formatDayMonth('2026-12-31')).toBe('31 dic')
    expect(dayParts('2026-03-01').day).toBe('1')
  })

  it('leaves no abbreviating full stop for the UI to align around', () => {
    // es-AR emits "mié." in some ICU versions and "mié" in others. The strip is
    // there so the plan column is the same width whichever one is running.
    for (const out of [formatDayShort(WED), formatDayMonth(WED), dayParts(WED).weekday]) {
      expect(out).not.toContain('.')
    }
  })

  it('crosses a month end without borrowing a day', () => {
    expect(formatDayLong('2026-02-28')).toBe('sábado, 28 de febrero')
    expect(formatDayLong('2028-02-29')).toBe('martes, 29 de febrero')
  })
})

describe('plural and missingText', () => {
  it('turns only on exactly one', () => {
    expect(plural(1, 'día', 'días')).toBe('1 día')
    expect(plural(0, 'día', 'días')).toBe('0 días')
    expect(plural(2, 'día', 'días')).toBe('2 días')
  })

  it('agrees the verb too, which is why it is not just plural()', () => {
    expect(missingText(1)).toBe('falta 1 ingrediente')
    expect(missingText(2)).toBe('faltan 2 ingredientes')
    expect(missingText(0)).toBe('faltan 0 ingredientes')
  })
})

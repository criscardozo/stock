import { describe, expect, it } from 'vitest'
import vectors from '../../../../../shared/plan-period-vectors.json'
import { addDays, daysOf, periodEndFor, periodStartFor, todayIn, weekdayOf } from './dates'
import type { PlanLength } from './dates'

// The vectors are the contract between this file and its Swift twin. A case
// added here MUST be added there — that is the whole point of the file living
// in shared/.

describe('todayIn', () => {
  for (const c of vectors.todayIn) {
    it(c.name, () => {
      expect(todayIn(c.timezone, new Date(c.instant))).toBe(c.expected)
    })
  }
})

describe('weekdayOf', () => {
  for (const c of vectors.weekdayOf) {
    it(`${c.date} -> ${c.expected}`, () => {
      expect(weekdayOf(c.date)).toBe(c.expected)
    })
  }
})

describe('addDays', () => {
  for (const c of vectors.addDays) {
    it(c.name ?? `${c.date} + ${c.days}`, () => {
      expect(addDays(c.date, c.days)).toBe(c.expected)
    })
  }
})

describe('periodStartFor', () => {
  for (const c of vectors.periodStartFor) {
    it(c.name, () => {
      expect(periodStartFor(c.date, c.startWeekday)).toBe(c.expected)
    })
  }
})

describe('periodEndFor', () => {
  for (const c of vectors.periodEndFor) {
    it(c.name ?? `${c.startDate} ${c.length}`, () => {
      expect(periodEndFor(c.startDate, c.length as PlanLength)).toBe(c.expected)
    })
  }
})

describe('daysOf', () => {
  for (const c of vectors.daysOf) {
    it(c.name ?? `${c.startDate} ${c.length}`, () => {
      expect(daysOf(c.startDate, c.length as PlanLength)).toEqual(c.expected)
    })
  }
})

describe('beyond the vectors', () => {
  it('a period always covers its own start and end', () => {
    const start = periodStartFor('2026-08-17', 6)
    const end = periodEndFor(start, 'fortnightly')
    const days = daysOf(start, 'fortnightly')
    expect(days[0]).toBe(start)
    expect(days.at(-1)).toBe(end)
    expect(days).toHaveLength(14)
  })

  it('periods chain: the next one starts the day after this one ends', () => {
    const start = periodStartFor('2026-04-01', 6)
    const end = periodEndFor(start, 'weekly')
    expect(periodStartFor(addDays(end, 1), 6)).toBe(addDays(end, 1))
  })
})

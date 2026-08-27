import { describe, expect, it } from 'vitest'
import { fetchEvents } from './client'

/** A fetch that records what it was asked and answers with a fixed body. */
function stubFetch(body: unknown, status = 200) {
  const calls: URL[] = []
  const impl = (input: string | URL) => {
    calls.push(new URL(input.toString()))
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(body),
    } as Response)
  }
  return { calls, impl }
}

describe('fetchEvents', () => {
  it('asks for the whole range, expanding repeats', async () => {
    const { calls, impl } = stubFetch({ items: [] })
    globalThis.fetch = impl as typeof fetch
    await fetchEvents('tok', 'cal@group.calendar.google.com', '2026-08-22', '2026-08-28')

    const q = calls[0].searchParams
    expect(q.get('timeMin')).toBe('2026-08-22T00:00:00Z')
    // Exclusive upper bound, so the LAST day of the week is still included —
    // an off-by-one here loses every Friday dinner and nothing says so.
    expect(q.get('timeMax')).toBe('2026-08-29T00:00:00Z')
    // Without this a weekly "Pizza" arrives once, on the day it was created.
    expect(q.get('singleEvents')).toBe('true')
    expect(calls[0].pathname).toContain(encodeURIComponent('cal@group.calendar.google.com'))
  })

  it('reads the date the calendar states, for all-day and timed events alike', async () => {
    const { impl } = stubFetch({
      items: [
        { summary: 'Milanesas', start: { date: '2026-08-24' } },
        { summary: 'Bolo', description: '#bolo', start: { dateTime: '2026-08-25T20:30:00+10:00' } },
      ],
    })
    globalThis.fetch = impl as typeof fetch
    const events = await fetchEvents('tok', 'c', '2026-08-22', '2026-08-28')

    // The date is sliced from what the calendar said, never re-derived through
    // a timezone — the same rule as every other date in this app.
    expect(events).toEqual([
      { date: '2026-08-24', summary: 'Milanesas' },
      { date: '2026-08-25', summary: 'Bolo', description: '#bolo' },
    ])
  })

  it('drops events with nothing to match on, and keeps the rest', async () => {
    const { impl } = stubFetch({
      items: [
        { start: { date: '2026-08-24' } }, // no summary
        { summary: '   ', start: { date: '2026-08-25' } }, // blank summary
        { summary: 'Sin fecha' }, // no start
        { summary: 'Buena', start: { date: '2026-08-26' } },
      ],
    })
    globalThis.fetch = impl as typeof fetch
    expect(await fetchEvents('tok', 'c', '2026-08-22', '2026-08-28')).toEqual([
      { date: '2026-08-26', summary: 'Buena' },
    ])
  })

  it('says which failure it was, because the answers differ', async () => {
    for (const [status, text] of [
      [403, /permiso/i],
      [404, /calendario/i],
      [500, /500/],
    ] as const) {
      globalThis.fetch = stubFetch({}, status).impl as typeof fetch
      await expect(fetchEvents('tok', 'c', '2026-08-22', '2026-08-28')).rejects.toThrow(text)
    }
  })
})

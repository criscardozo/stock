// Reading the household's meals calendar.
//
// The calendar is PRIVATE (its public .ics 404s), so this needs an OAuth token
// for the `calendar.readonly` scope. That token is obtained in the browser and
// used from the browser: Google's Calendar REST API sends CORS headers, so
// there is no proxy, no Cloud Function and no server of ours in the path —
// which keeps the project's "$0 and no custom backend" rule intact.
//
// What it is NOT: a background sync. Firebase Auth hands out an access token
// with no refresh token, so this is a button someone presses while planning,
// not a job. `requestAccessToken` goes to Google Identity Services for a fresh
// one, which after the first consent is usually silent.

import type { CalendarEvent } from './match'

/** The meals calendar. Its id, not its URL — the `cid=` in a Google Calendar
 * link is this string in base64. */
export const MEALS_CALENDAR_ID = 'jrhkd1heqm82d41vhmkjcrtj90@group.calendar.google.com'

export const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly'

interface TokenClient {
  requestAccessToken: (overrides?: { prompt?: string }) => void
  callback: (response: { access_token?: string; error?: string }) => void
}

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: {
          initTokenClient: (config: {
            client_id: string
            scope: string
            callback: (response: { access_token?: string; error?: string }) => void
          }) => TokenClient
        }
      }
    }
  }
}

/** Loads Google Identity Services once. Resolves when `window.google` is usable. */
function loadGis(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-gis]')
    if (existing) {
      existing.addEventListener('load', () => resolve())
      existing.addEventListener('error', () => reject(new Error('No pude cargar Google')))
      return
    }
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.dataset.gis = ''
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('No pude cargar Google'))
    document.head.appendChild(script)
  })
}

/**
 * An access token for the calendar scope, asked for at the moment it is needed.
 *
 * Separate from signing in on purpose: the app works without ever granting
 * this, and someone who never opens the calendar feature is never asked for
 * their calendar. The first call shows Google's consent; later ones are usually
 * silent because the grant is remembered.
 */
export async function requestAccessToken(clientId: string): Promise<string> {
  await loadGis()
  const oauth2 = window.google?.accounts?.oauth2
  if (!oauth2) throw new Error('No pude cargar Google')

  return new Promise((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: clientId,
      scope: CALENDAR_SCOPE,
      callback: (response) => {
        if (response.access_token) resolve(response.access_token)
        else reject(new Error(response.error ?? 'No diste permiso al calendario'))
      },
    })
    client.requestAccessToken()
  })
}

/**
 * Events between two calendar dates, inclusive, as the matcher wants them.
 *
 * `singleEvents` expands a repeating event into its occurrences, which is what
 * "what are we eating on Thursday" means — without it a weekly "Pizza" would
 * arrive once, on the day it was first created.
 *
 * All-day events carry `start.date`; timed ones carry `start.dateTime`. Only
 * the first ten characters of either are read, so the date is whatever the
 * calendar itself says rather than something re-derived through a timezone —
 * the same reasoning as every other date in this app.
 */
export async function fetchEvents(
  token: string,
  calendarId: string,
  startDate: string,
  endDate: string,
): Promise<CalendarEvent[]> {
  const url = new URL(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
  )
  url.searchParams.set('timeMin', `${startDate}T00:00:00Z`)
  // Exclusive upper bound, so the end date itself is included.
  url.searchParams.set('timeMax', `${nextDay(endDate)}T00:00:00Z`)
  url.searchParams.set('singleEvents', 'true')
  url.searchParams.set('orderBy', 'startTime')
  url.searchParams.set('maxResults', '50')

  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!response.ok) {
    // Said plainly, because the two likely causes need different answers from
    // the person reading it.
    if (response.status === 401 || response.status === 403) {
      throw new Error('Google no me dejó leer el calendario. ¿Diste el permiso?')
    }
    if (response.status === 404) throw new Error('No encontré ese calendario')
    throw new Error(`Google respondió ${response.status}`)
  }

  const body: unknown = await response.json()
  const items = (body as { items?: unknown[] }).items ?? []
  return items
    .map((item) => {
      const raw = item as {
        summary?: string
        description?: string
        start?: { date?: string; dateTime?: string }
      }
      const start = raw.start?.date ?? raw.start?.dateTime
      if (!start || !raw.summary?.trim()) return null
      return {
        date: start.slice(0, 10),
        summary: raw.summary.trim(),
        ...(raw.description?.trim() ? { description: raw.description.trim() } : {}),
      }
    })
    .filter((event): event is CalendarEvent => event !== null)
}

/** Calendar-date arithmetic, kept here so this file needs no timezone at all. */
function nextDay(date: string): string {
  const ms = Date.UTC(
    Number(date.slice(0, 4)),
    Number(date.slice(5, 7)) - 1,
    Number(date.slice(8, 10)),
  )
  return new Date(ms + 86_400_000).toISOString().slice(0, 10)
}

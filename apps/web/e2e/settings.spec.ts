import { expect, test, type Page } from '@playwright/test'
import { rangeLabel } from './seeded-plan'

/**
 * The period length, which is the one setting with a visible consequence.
 *
 * It is also the setting whose documented behaviour is the easiest to get
 * wrong: changing it must NOT reshape a period that already exists. A plan doc
 * is materialized lazily with the period's start date as its ID, so a period
 * already written keeps the bounds it was written with, and only the next one
 * is computed fresh. Reading the CURRENT period would therefore pass whether
 * the setting worked or not.
 *
 * Restores the household to fortnightly at the end: the specs share one seeded
 * household and later ones read the plan.
 *
 * Ranges are computed from the seeded period's start, not written down. The
 * seed builds that period from today, so a spec naming "12 sept – 25 sept"
 * reports the date it was written on.
 */
async function signIn(page: Page, path = '/ajustes') {
  await page.goto(path)
  await page.getByRole('button', { name: 'Entrar como cristian' }).click()
  await expect(page.getByRole('button', { name: 'Entrar como cristian' })).toBeHidden()
}

const FIRESTORE_PORT = process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_PORT ?? '8280'
const HOUSEHOLD_URL =
  `http://127.0.0.1:${FIRESTORE_PORT}/v1/projects/demo-stock/databases/` +
  '(default)/documents/households/casa-cardozo'

/** The length the SERVER holds, which is what the next spec's context will read. */
async function lengthOnServer(): Promise<string | undefined> {
  const response = await fetch(HOUSEHOLD_URL, { headers: { Authorization: 'Bearer owner' } })
  const body = (await response.json()) as {
    fields?: { planConfig?: { mapValue?: { fields?: { length?: { stringValue?: string } } } } }
  }
  return body.fields?.planConfig?.mapValue?.fields?.length?.stringValue
}

async function setLength(page: Page, length: 'Semanal' | 'Quincenal') {
  await page.goto('/ajustes')
  const option = page.getByRole('button', { name: length, exact: true })
  await option.click()
  // Wait for the control to report itself chosen, not for a duration. The write
  // is deliberately never awaited — Firestore only resolves it on server
  // confirmation — so navigating straight after the click races it, and the
  // plan renders from the household as it was.
  await expect(option).toHaveAttribute('aria-pressed', 'true')
}

/** The range shown for the period after the current one. */
async function nextPeriod(page: Page) {
  await page.goto('/plan')
  await page.getByRole('button', { name: 'Período siguiente' }).click()
  return page.getByRole('heading', { level: 1 })
}

test('the period length reshapes the next period and leaves the current one alone', async ({
  page,
}) => {
  await signIn(page)

  // Seeded fortnightly, starting Saturday, and already written to Firestore.
  // The period after it is the next fortnight.
  await expect(await nextPeriod(page)).toContainText(rangeLabel(14, 14))

  await setLength(page, 'Semanal')

  // The one that exists is untouched...
  await page.goto('/plan')
  await expect(page.getByRole('heading', { level: 1 })).toContainText(rangeLabel(0, 14))

  // ...and the next one is seven days. Weekly periods are computed from the
  // same Saturday start, so "next" is the week beginning one week in, not the
  // fortnight's second half.
  await expect(await nextPeriod(page)).toContainText(rangeLabel(7, 7))

  await setLength(page, 'Quincenal')
  await expect(await nextPeriod(page)).toContainText(rangeLabel(14, 14))

  // Restored on the SERVER, not just on this screen. The screen reads the local
  // cache, which echoes the write the instant it is queued — so asserting the
  // range here says nothing about what the next spec's fresh context will read.
  // It read `weekly`, and tablet.spec spent ninety seconds waiting for a
  // "Semana 1" label that only exists when a period has two weeks. Same shape
  // as the recipe that appeared saved and was not; found in CI, which is slower
  // than this machine and therefore loses the race more often.
  await expect.poll(lengthOnServer, { timeout: 15_000 }).toBe('fortnightly')
})

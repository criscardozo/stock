import { expect, test, type Page } from '@playwright/test'

const FIRESTORE_PORT = process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_PORT ?? '8280'
const HOUSEHOLD_URL =
  `http://127.0.0.1:${FIRESTORE_PORT}/v1/projects/demo-stock/databases/` +
  '(default)/documents/households/casa-cardozo'

/** Locations as the SERVER holds them, in the order sortOrder puts them. */
async function locationsOnServer(): Promise<{ name: string; sortOrder: number }[]> {
  const response = await fetch(HOUSEHOLD_URL, { headers: { Authorization: 'Bearer owner' } })
  const body = (await response.json()) as {
    fields?: { locations?: { mapValue?: { fields?: Record<string, { mapValue?: { fields?: Record<string, { stringValue?: string; integerValue?: string }> } }> } } }
  }
  const entries = body.fields?.locations?.mapValue?.fields ?? {}
  return Object.values(entries)
    .map((entry) => ({
      name: entry.mapValue?.fields?.name?.stringValue ?? '',
      sortOrder: Number(entry.mapValue?.fields?.sortOrder?.integerValue ?? 0),
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder)
}

/**
 * Editing the household's categories and locations.
 *
 * Phase 4 promised this and the screen only listed them — there was no mutation
 * for either map anywhere in the repo, so they were frozen at whatever the seed
 * wrote when the household was created.
 *
 * The interesting parts are the two refusals, not the happy path: an entry
 * something points at cannot be deleted, and the cap the rules enforce has to
 * stop the screen before the server does. Both are the kind of guard that
 * quietly stops working, because when they work nothing happens.
 */
async function openEditor(page: Page, which: 'Categorías' | 'Ubicaciones') {
  await page.goto('/ajustes')
  await page.getByRole('button', { name: 'Entrar como cristian' }).click()
  await expect(page.getByRole('button', { name: 'Entrar como cristian' })).toBeHidden()
  // Named directly. This used to filter sections by their heading text and take
  // the first match, because both buttons were called "Editar" — the shape that
  // says a control has no name of its own.
  await page.getByRole('button', { name: `Editar ${which.toLowerCase()}` }).click()
  return page.getByRole('dialog')
}

test('an entry in use cannot be deleted, and says how many are in the way', async ({ page }) => {
  const sheet = await openEditor(page, 'Ubicaciones')

  // Heladera holds 8 of the seeded items. The count is IN the control's name:
  // a disabled button that will not say why is the same as no button.
  const blocked = sheet.getByRole('button', { name: /No se puede borrar Heladera: 8 ítems/ })
  await expect(blocked).toBeVisible()
  await expect(blocked).toBeDisabled()

  // Baño is seeded empty, so it can go.
  await expect(sheet.getByRole('button', { name: 'Borrar Baño' })).toBeEnabled()
})

test('a location can be added, renamed and reordered, and it sticks', async ({ page }) => {
  const sheet = await openEditor(page, 'Ubicaciones')

  await sheet.getByRole('textbox', { name: 'Ubicación nueva' }).fill('Despensa chica')
  await sheet.getByRole('button', { name: 'Agregar' }).click()

  // All the way to the top. It has to pass Alacena specifically: a map field
  // comes back from Firestore keyed in lexicographic order, so "despensa-chica"
  // ahead of "otro" would hold whether sortOrder were written or not — this
  // assertion only passes if the order was really stored.
  const up = sheet.getByRole('button', { name: 'Subir Despensa chica' })
  while (await up.isEnabled()) await up.click()

  await sheet.getByRole('textbox', { name: 'Nombre de Heladera' }).fill('Heladera grande')
  await sheet.getByRole('button', { name: 'Guardar' }).click()
  await expect(sheet).toBeHidden()

  // Read back from the household, which is what the stock screen groups by.
  await expect(page.getByText('Heladera grande')).toBeVisible()
  await expect(page.getByText('Despensa chica')).toBeVisible()

  const names = await page.locator('section').filter({ hasText: 'Ubicaciones' }).innerText()
  expect(names.indexOf('Despensa chica')).toBeLessThan(names.indexOf('Alacena'))

  // The names and the order as the SERVER holds them, which the screen above
  // does not prove — it renders the same from a write still sitting in the
  // local cache.
  //
  // What this does NOT pin is `sortOrder` itself: measured, flattening every
  // value to zero fails nothing here, because the map round-trips in the order
  // it was written and a stable sort on equal keys is a no-op. The field is
  // pinned in TaxonomySheet.test.ts, and it matters on the phone, where the
  // map decodes into a Swift Dictionary and has no order of its own.
  await expect
    .poll(async () => (await locationsOnServer()).map((l) => l.name))
    .toEqual(['Despensa chica', 'Heladera grande', 'Freezer', 'Alacena', 'Lavadero', 'Baño', 'Otro'])
})

test('the sheet stops at the cap the rules enforce', async ({ page }) => {
  const sheet = await openEditor(page, 'Ubicaciones')
  const draft = sheet.getByRole('textbox', { name: 'Ubicación nueva' })
  const add = sheet.getByRole('button', { name: 'Agregar' })

  // Seeded with 6 and one more from the test above; fill to 20 and stop.
  for (let n = 0; n < 20; n += 1) {
    const count = await sheet.getByRole('button', { name: /^Borrar |^No se puede borrar / }).count()
    if (count >= 20) break
    await draft.fill(`Lugar ${n}`)
    await add.click()
  }

  await expect(sheet.getByText(/Llegaste al tope de 20/)).toBeVisible()
  await draft.fill('Uno más')
  await expect(add).toBeDisabled()
})

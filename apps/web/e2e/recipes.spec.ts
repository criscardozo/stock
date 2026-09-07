import { expect, test, type Page } from '@playwright/test'

/**
 * Creating a recipe, and the one rule the server cannot enforce.
 *
 * A short name is what the meal plan matches free text against, so two recipes
 * sharing one make the calendar ambiguous. Firestore rules cannot compare a
 * document against its siblings, so this uniqueness check lives only in the
 * editor — which makes it exactly the kind of validation that quietly stops
 * working and is never noticed.
 *
 * The comparison is folded, so it must also catch a clash that differs only by
 * case or accent. Nothing in the seed has a short name, so this spec creates
 * the recipe it then collides with.
 *
 * That creation is confirmed AGAINST THE SERVER, not against the screen. The
 * app never awaits its writes — Firestore only resolves them on server
 * confirmation — so the new row appears from the local cache the instant it is
 * queued. Asserting it on screen therefore passes whether the write left the
 * browser or not, which is exactly what happened: the row was visible here and
 * gone in the next test's context, because Playwright gives each test a fresh
 * IndexedDB and the pending write died with the old one.
 */
const FIRESTORE_PORT = process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_PORT ?? '8280'
const RECIPES_URL =
  `http://127.0.0.1:${FIRESTORE_PORT}/v1/projects/demo-stock/databases/` +
  '(default)/documents/households/casa-cardozo/recipes'

/** Short names the emulator actually holds. Reads go through rules, hence the owner token. */
async function shortNamesOnServer(): Promise<string[]> {
  const response = await fetch(RECIPES_URL, { headers: { Authorization: 'Bearer owner' } })
  const body = (await response.json()) as {
    documents?: { fields?: { shortName?: { stringValue?: string } } }[]
  }
  return (body.documents ?? [])
    .map((d) => d.fields?.shortName?.stringValue)
    .filter((name): name is string => name !== undefined)
}
async function signIn(page: Page) {
  await page.goto('/recetas')
  await page.getByRole('button', { name: 'Entrar como cristian' }).click()
  await expect(page.getByRole('button', { name: 'Entrar como cristian' })).toBeHidden()
}

test('a new recipe is created with a short name', async ({ page }) => {
  await signIn(page)

  await page.getByRole('button', { name: 'Nueva receta' }).click()
  const editor = page.getByRole('dialog', { name: 'Nueva receta' })
  await expect(editor.getByRole('button', { name: 'Crear receta' })).toBeDisabled()

  await editor.getByRole('textbox', { name: 'Título' }).fill('Guiso de lentejas')
  await editor.getByRole('textbox', { name: 'Nombre corto (opcional)' }).fill('guisó')
  await editor.getByRole('button', { name: 'Crear receta' }).click()

  await expect(editor).toBeHidden()
  await expect(page.getByRole('button', { name: /Guiso de lentejas/ })).toBeVisible()

  // And it is on the server, which the row above does not prove.
  await expect.poll(shortNamesOnServer, { timeout: 15_000 }).toContain('guisó')
})

test('a second recipe cannot take the same short name', async ({ page }) => {
  await signIn(page)

  // Wait for the recipe the test above created to reach THIS context before
  // opening the editor. The clash is computed against the recipes the listener
  // has delivered so far, so typing before they arrive finds nothing to clash
  // with and the check reads as broken rather than as a race.
  await expect(page.getByRole('button', { name: /Guiso de lentejas/ })).toBeVisible()

  await page.getByRole('button', { name: 'Nueva receta' }).click()
  const editor = page.getByRole('dialog', { name: 'Nueva receta' })
  await editor.getByRole('textbox', { name: 'Título' }).fill('Guiso de porotos')

  // With a title and no short name there is nothing to clash with, so the
  // button is live — which is what makes the next step evidence.
  await expect(editor.getByRole('button', { name: 'Crear receta' })).toBeEnabled()

  // Different case, no accent: the check folds both before comparing, so this
  // is the same name as the one created above.
  await editor.getByRole('textbox', { name: 'Nombre corto (opcional)' }).fill('GUISO')

  // It names the recipe in the way, because "already taken" without saying by
  // what leaves you guessing which of your own recipes it means.
  await expect(editor.getByText(/ya lo usa «Guiso de lentejas»/)).toBeVisible()
  await expect(editor.getByRole('button', { name: 'Crear receta' })).toBeDisabled()

  // And it lets go: the block is on the value, not on having typed at all.
  await editor.getByRole('textbox', { name: 'Nombre corto (opcional)' }).fill('porotos')
  await expect(editor.getByText(/ya lo usa/)).toBeHidden()
  await expect(editor.getByRole('button', { name: 'Crear receta' })).toBeEnabled()
})

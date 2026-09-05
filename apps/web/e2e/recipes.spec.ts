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
 */
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
})

test('a second recipe cannot take the same short name', async ({ page }) => {
  await signIn(page)

  // Wait for the recipe the test above created to be ON SCREEN before opening
  // the editor. The clash is computed against the household's recipes as the
  // listener has them so far, so typing before they arrive finds nothing to
  // clash with and the check looks broken. Locally the snapshot beats the
  // typing and this passed; CI is slower and it did not.
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

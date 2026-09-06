import { expect, test, type Page } from '@playwright/test'

/**
 * Typing past a size the rules refuse.
 *
 * The behaviour chosen over silent truncation: you may type it, the form says
 * by how much you are over, and it will not let you save. `maxLength` was the
 * alternative and it drops the tail of a pasted recipe without saying so.
 *
 * What makes this worth an e2e rather than a unit test is the failure it
 * replaces. Firestore applies a write to the local cache before the server sees
 * it, so without this the recipe appears in the list, saved, and the error
 * dialog arrives afterwards — for one character too many.
 */
async function signIn(page: Page, path: string) {
  await page.goto(path)
  // Clicked unconditionally, the way every other spec here does it. A first
  // version guarded on `count()` so it could tolerate being already signed in —
  // and `count()` does not wait, so on a fresh context it returned 0 before the
  // page had painted, the click was skipped, and `toBeHidden()` passed on a
  // button that had never existed. The test then drove a logged-out screen.
  await page.getByRole('button', { name: 'Entrar como cristian' }).click()
  await expect(page.getByRole('button', { name: 'Entrar como cristian' })).toBeHidden()
}

test('a recipe over the steps limit says so and cannot be saved', async ({ page }) => {
  await signIn(page, '/recetas')
  await page.getByRole('button', { name: 'Nueva receta' }).click()
  const editor = page.getByRole('dialog', { name: 'Nueva receta' })

  await editor.getByRole('textbox', { name: 'Título' }).fill('Guiso larguísimo')
  await expect(editor.getByRole('button', { name: 'Crear receta' })).toBeEnabled()

  // 5001: one past the cap in firestore.rules, which is the whole point — the
  // boundary, not a number comfortably beyond it.
  await editor.getByRole('textbox', { name: 'Preparación' }).fill('x'.repeat(5001))
  await expect(editor.getByRole('alert')).toHaveText(/Te pasaste por 1 carácter\. El máximo es 5000\./)
  await expect(editor.getByRole('button', { name: 'Crear receta' })).toBeDisabled()

  // And it lets go: exactly at the cap is fine.
  await editor.getByRole('textbox', { name: 'Preparación' }).fill('x'.repeat(5000))
  await expect(editor.getByRole('alert')).toBeHidden()
  await expect(editor.getByRole('button', { name: 'Crear receta' })).toBeEnabled()
})

test('the shopping list hides its add button rather than greying it', async ({ page }) => {
  await signIn(page, '/falta-comprar')
  const field = page.getByPlaceholder('Agregar algo que no está en el catálogo…')

  await field.fill('Servilletas de papel')
  await expect(page.getByRole('button', { name: 'Agregar a la lista' })).toBeVisible()

  // The row has no room for an explanation beside a greyed-out control, so the
  // button leaves and the note takes its place.
  await field.fill('x'.repeat(81))
  await expect(page.getByText(/Te pasaste por 1 carácter\. El máximo es 80\./)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Agregar a la lista' })).toBeHidden()
})

import { expect, test, type Page } from '@playwright/test'

/**
 * `Cerrar compra` end to end.
 *
 * This is the operation with the most consequences in the app and the one least
 * verifiable by reading: one batch that folds ticked rows into stock, writes a
 * move for each, deletes those rows and leaves the unticked ones for next week.
 * Every piece of it is covered by a unit test in isolation; what nothing else
 * checks is that the whole thing still happens when a person taps the button.
 *
 * Runs against the emulators and the seeded household — see playwright.config.ts
 * for what has to be running first.
 *
 * Selectors go through roles and aria-labels rather than text: the row's label
 * and its reason render as one text run ("Huevos quedan 3, mínimo 6 · …"), so
 * matching the name of its own tick control is both stabler and closer to how
 * the row is actually operated. The tick is a `role="checkbox"`, not a button.
 */

async function signIn(page: Page) {
  await page.goto('/falta-comprar')
  // Emulator-only buttons; the real flow is signInWithPopup, which cannot be
  // driven headlessly.
  await page.getByRole('button', { name: 'Entrar como cristian' }).click()
  await expect(page.getByRole('button', { name: 'Entrar como cristian' })).toBeHidden()
}

test('the seeded list arrives, ticked and unticked', async ({ page }) => {
  await signIn(page)

  // e1 unticked, e2 ticked, e3 unticked — see tools/seed-emulator.mjs. A tick
  // is shared state, so the row that carries one offers to undo it.
  await expect(page.getByRole('checkbox', { name: 'Tildar Huevos' })).toBeVisible()
  await expect(page.getByRole('checkbox', { name: 'Destildar Leche de coco' })).toBeVisible()
  await expect(page.getByRole('checkbox', { name: 'Tildar Servilletas' })).toBeVisible()

  // A read that failed would render the band instead of the rows, and an empty
  // list would look identical to an unread one. Assert it is absent, so a
  // regression there fails here rather than passing quietly.
  await expect(page.getByText('No pude leer los datos')).toBeHidden()
})

test('closing the shop consumes the ticked rows and keeps the rest', async ({ page }) => {
  await signIn(page)

  // Tick one more, so the close has two rows to fold in and one to leave.
  await page.getByRole('checkbox', { name: 'Tildar Huevos' }).click()
  await expect(page.getByRole('checkbox', { name: 'Destildar Huevos' })).toBeVisible()

  await page.getByRole('button', { name: /Cerrar compra \(2\)/ }).click()
  await page.getByRole('button', { name: /Guardar y cerrar/ }).click()

  // The ticked rows leave the stored list...
  await expect(page.getByRole('checkbox', { name: /Leche de coco/ })).toBeHidden()
  await expect(page.getByRole('checkbox', { name: /Huevos/ })).toBeHidden()
  // ...and the untouched one stays for next week. That half is what makes the
  // list survive instead of being rebuilt from scratch every time.
  await expect(page.getByRole('checkbox', { name: 'Tildar Servilletas' })).toBeVisible()

  // And the batch really committed. This assertion reads the NUMBER, not the
  // absence of a row: the seed has 3 eggs and the list asked for 9, so the
  // stock has to say 12. An earlier version of this test checked that a
  // "quedan 3, mínimo 6" string was gone — but that string is the shopping
  // row's reason, which the stock screen never renders, so it passed happily
  // with the stock write removed. Verified by mutation this time.
  await page.goto('/stock')
  await expect(page.getByLabel('Huevos: 12 u')).toBeVisible()
})

test('a reserve item shows what is sealed, not just what is open', async ({ page }) => {
  await signIn(page)
  await page.goto('/stock')

  // The seed puts detergent at half a bottle with 1 of 2 spares — the case the
  // reserve exists for. The row has to say so where it can be read standing in
  // front of the cupboard.
  await expect(page.getByText('Detergente', { exact: true })).toBeVisible()
  await expect(page.getByText(/1 de 2 sin abrir/)).toBeVisible()
})

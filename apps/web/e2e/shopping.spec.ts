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

const FIRESTORE_PORT = process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_PORT ?? '8280'
const DOCS =
  `http://127.0.0.1:${FIRESTORE_PORT}/v1/projects/demo-stock/databases/` +
  '(default)/documents/households/casa-cardozo'

/** A collection as the SERVER holds it. Reads go through rules, hence the token. */
async function onServer(path: string): Promise<Record<string, unknown>[]> {
  const response = await fetch(`${DOCS}/${path}`, { headers: { Authorization: 'Bearer owner' } })
  const body = (await response.json()) as { documents?: { fields?: Record<string, unknown> }[] }
  return (body.documents ?? []).map((d) => d.fields ?? {})
}

/** A counted item's quantity, on the server. */
async function quantityOnServer(itemId: string): Promise<number | undefined> {
  const response = await fetch(`${DOCS}/items/${itemId}`, {
    headers: { Authorization: 'Bearer owner' },
  })
  const body = (await response.json()) as {
    fields?: { quantity?: { integerValue?: string } }
  }
  const raw = body.fields?.quantity?.integerValue
  return raw === undefined ? undefined : Number(raw)
}

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

  // This assertion reads the NUMBER, not the absence of a row: the seed has 3
  // eggs and the list asked for 9, so the stock has to say 12. An earlier
  // version checked that a "quedan 3, mínimo 6" string was gone — but that
  // string is the shopping row's reason, which the stock screen never renders,
  // so it passed happily with the stock write removed.
  await page.goto('/stock')
  await expect(page.getByLabel('Huevos: 12 u')).toBeVisible()

  await page.getByRole('button', { name: /^Huevos/ }).click()
  const history = page.getByRole('listitem').filter({ hasText: 'Compra' }).first()
  await expect(history).toContainText('+9 u')

  // ── And now against the server.
  //
  // Written first with the claim that the screen could not catch a refusal at
  // all, which measurement disproved twice. Refusing the `moves` write in the
  // rules, and then refusing ONLY the row deletions, both fail the `12 u`
  // assertion above — because `closeShopping` is genuinely one batch, so any
  // refusal rolls back all of it, and the `page.goto` forces a re-read that
  // sees the rollback. The atomicity this project went to some trouble to
  // guarantee is what makes the cheap check sufficient.
  //
  // What these polls add, then, is narrower than "the screen is blind" and
  // still worth having:
  //
  //  - Two of the three halves are things no screen renders. A `moves`
  //    document and a deleted row are invisible; only the quantity shows.
  //  - No dependence on the navigation being slow enough for the rollback to
  //    land first. The screen check passes because of a race it happens to
  //    win.
  //  - The regression they actually catch, and this one is measured rather than
  //    argued. `inBatches` was split in two on purpose — deletes moved to a
  //    second commit, the way it worked before 9730adf — with the rules
  //    refusing deletes. EVERY screen assertion above passed: the quantity
  //    said 12, the history said +9, the rows were hidden. The failure landed
  //    on the `shoppingList` poll, at 3 rows instead of 1. That is the shape
  //    that would ship green while the other phone still had all three rows on
  //    its list. Gastos Diarios ran the same experiment on their own batch and
  //    suggested it here.
  //
  // Gastos Diarios' sharper question is what sent me here: not only "where else
  // does this apply" but "did I already solve this in this same file".
  await expect.poll(() => quantityOnServer('huevos'), { timeout: 15_000 }).toBe(12)

  // All three halves of the batch, not just the one the screen happened to
  // show. A refused `moves` write or a refused delete leaves no trace here.
  await expect
    .poll(async () => (await onServer('shoppingList')).length, { timeout: 15_000 })
    .toBe(1)
  await expect
    .poll(async () => {
      const moves = await onServer('moves')
      return moves.filter((m) => {
        const item = (m.itemId as { stringValue?: string } | undefined)?.stringValue
        const delta = (m.delta as { integerValue?: string } | undefined)?.integerValue
        return item === 'huevos' && delta === '9'
      }).length
    }, { timeout: 15_000 })
    .toBe(1)
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

test('a catalogue-only item stays in stock and off the list', async ({ page }) => {
  await signIn(page)
  await page.goto('/stock')

  // Seeded empty with autoSuggest false — the thing bought once in a while.
  // It keeps its details and its place in the catalogue...
  await expect(page.getByText('Pasta de curry verde', { exact: true })).toBeVisible()
  // ...and says so instead of raising an alarm nobody can act on.
  await expect(page.getByText('Sin stock')).toBeVisible()

  // The other empty items DO say "Falta", so this is the flag talking and not
  // the chip having gone missing everywhere.
  await expect(page.getByText('Falta').first()).toBeVisible()

  // And it never reaches Falta comprar on its own: the suggestions there are
  // driven by minimums, which is exactly what the flag silences.
  //
  // The control is Servilletas and not Huevos, because these specs share one
  // seeded household and run in order: the spec above buys the eggs, so by now
  // they are neither on the list nor short. Servilletas is the row that spec
  // deliberately leaves alone, which makes it true before and after it.
  await page.goto('/falta-comprar')
  await expect(page.getByText('Servilletas').first()).toBeVisible()
  await expect(page.getByText('Pasta de curry verde')).toBeHidden()
})

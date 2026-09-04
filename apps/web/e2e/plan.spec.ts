import { expect, test, type Page } from '@playwright/test'

/**
 * The plan screen: assigning a day, and cooking one.
 *
 * `markCooked` is the second batch in this app — it deducts each ingredient,
 * writes a move per item, stamps the day cooked and raises the recipe's count,
 * all at once. Like `Cerrar compra` it is covered piecewise by unit tests and
 * by nothing end to end, which is where a batch that half-applies would hide.
 *
 * These read the ingredient's NUMBER after cooking rather than the absence of
 * something: a deduction that silently did nothing leaves a screen that looks
 * exactly like a correct one.
 *
 * Runs against the seeded household, in file order, sharing state with the
 * other specs — see shopping.spec.ts. The day used for cooking (mar 8) is one
 * no other spec asserts on.
 */
async function signIn(page: Page, path = '/plan') {
  await page.goto(path)
  await page.getByRole('button', { name: 'Entrar como cristian' }).click()
  await expect(page.getByRole('button', { name: 'Entrar como cristian' })).toBeHidden()
}

/** The stock row publishes its count as a live region, named by the item. */
function count(page: Page, item: string) {
  return page.getByRole('status', { name: new RegExp(`^${item}:`) })
}

test('the level dial names every step it can reach', async ({ page }) => {
  await signIn(page)

  // The cooking sheet is the one place a level ingredient is adjusted, and its
  // dial used to offer four segments for a scale of four VALUES (0-3): the
  // fourth could never fill, so 'lleno' left the dial visibly short, and its
  // label read "Poner en undefined". Both platforms had it.
  await page.getByRole('button', { name: 'Cocinada dom 30' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()

  // Named by ingredient, which is the other half of the same defect: Pastel de
  // papa has three level-tracked ingredients, so this sheet used to show three
  // dials whose every segment was called "Poner en poco".
  for (const level of ['poco', 'medio', 'lleno']) {
    await expect(page.getByRole('button', { name: `Poner Papas en ${level}` })).toBeVisible()
  }
  await expect(page.getByRole('button', { name: /Poner .* en undefined/ })).toBeHidden()

  // Closed without confirming: this test changes nothing.
  await page.getByRole('button', { name: 'Cerrar' }).click()
  await expect(page.getByRole('dialog')).toBeHidden()
})

test('an empty day takes a recipe and gives it back', async ({ page }) => {
  await signIn(page)

  // dom 6 is seeded with no plan, and no other spec touches it.
  await page.getByRole('button', { name: /dom 6 Sin plan/ }).click()
  await page.getByRole('button', { name: 'Salmón al horno Todo' }).click()
  await expect(page.getByRole('button', { name: 'dom 6: Salmón al horno' })).toBeVisible()

  // Clearing it is a write too, not just closing the sheet.
  await page.getByRole('button', { name: 'dom 6: Salmón al horno' }).click()
  await page.getByRole('button', { name: 'Dejarlo sin plan' }).click()
  await expect(page.getByRole('button', { name: /dom 6 Sin plan/ })).toBeVisible()
})

test('cooking deducts the ingredient and counts the recipe', async ({ page }) => {
  await signIn(page, '/stock')

  // Seeded at 2 filetes. Asserted before as well as after, so a change to the
  // seed fails here saying so, instead of making the deduction look wrong.
  await expect(count(page, 'Salmón')).toHaveText('2 u')

  await page.goto('/plan')
  await page.getByRole('button', { name: 'Cocinada mar 8' }).click()
  await expect(page.getByRole('dialog', { name: /Cocinaste Salmón al horno/ })).toBeVisible()
  await page.getByRole('button', { name: 'Descontar y marcar' }).click()

  // The recipe asks for 2 of them, so the freezer is empty. The number, not the
  // absence of an alarm: `markCooked` writing nothing at all would leave the
  // row reading "2 u", which is also a perfectly normal-looking screen.
  await page.goto('/stock')
  await expect(count(page, 'Salmón')).toHaveText('0 u')

  // Same batch: the recipe's tally and the date it was last made. Seeded at 3.
  await page.goto('/recetas')
  await expect(page.getByRole('button', { name: /Salmón al horno.*4 veces/ })).toBeVisible()

  // And the day itself is struck through rather than still offering to cook.
  await page.goto('/plan')
  await expect(page.getByRole('button', { name: 'Cocinada mar 8' })).toBeHidden()
})

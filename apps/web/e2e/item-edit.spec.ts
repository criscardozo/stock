import { expect, test, type Page } from '@playwright/test'

/**
 * Editing an item that already exists — the half of the item form that no spec
 * drove, and where two things were refused or silently kept.
 *
 * Both come from the same fact: an edit is an `updateDoc`, which MERGES, so a
 * field the form stops sending is not removed — it stays. Switching how an
 * item is measured left the old mode's fields behind, and the rules refuse a
 * document with both pairs. Emptying an optional field sent nothing for it, so
 * the old value stayed: an expiry date, once set, could not be taken off.
 *
 * Checked on the SERVER, not on the screen. The local cache shows an edit at
 * once and a refusal only later, so the screen answers "did it save" with yes
 * in both worlds for a moment.
 */
const FIRESTORE_PORT = process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_PORT ?? '8280'
const ITEMS =
  `http://127.0.0.1:${FIRESTORE_PORT}/v1/projects/demo-stock/databases/(default)/documents/` +
  'households/casa-cardozo/items'
const OWNER = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }

type Fields = Record<string, unknown>

async function onServer(itemId: string): Promise<Fields> {
  const response = await fetch(`${ITEMS}/${itemId}`, { headers: OWNER })
  return ((await response.json()) as { fields: Fields }).fields
}

const before: Record<string, Fields> = {}

test.beforeAll(async () => {
  for (const id of ['kiwis', 'frutillas']) before[id] = await onServer(id)
})

// Restored whatever happened, so a failure here cannot leak into later specs.
test.afterAll(async () => {
  for (const [id, fields] of Object.entries(before)) {
    await fetch(`${ITEMS}/${id}`, { method: 'PATCH', headers: OWNER, body: JSON.stringify({ fields }) })
  }
})

async function openItem(page: Page, name: string) {
  await page.goto('/stock')
  await page.getByRole('button', { name: 'Entrar como cristian' }).click()
  await page.getByRole('button', { name: new RegExp(`^${name}`) }).click()
}

test('a counted item can become a levelled one', async ({ page }) => {
  await openItem(page, 'Kiwis')
  await page.getByRole('button', { name: 'Por nivel' }).click()
  await page.getByRole('button', { name: 'Guardar' }).click()

  await expect.poll(async () => (await onServer('kiwis')).tracking).toEqual({ stringValue: 'level' })
  const saved = await onServer('kiwis')
  expect(Object.keys(saved).filter((key) => ['unit', 'quantity', 'minQuantity'].includes(key))).toEqual([])
  await expect(page.getByRole('alertdialog')).toBeHidden()
})

test('an expiry date can be taken off', async ({ page }) => {
  await openItem(page, 'Frutillas')
  await page.getByLabel('Vence (opcional)').fill('')
  await page.getByRole('button', { name: 'Guardar' }).click()

  await expect.poll(async () => 'expiresAt' in (await onServer('frutillas'))).toBe(false)
  await expect(page.getByRole('alertdialog')).toBeHidden()
})

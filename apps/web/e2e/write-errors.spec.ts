import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'

/**
 * A refused write has to interrupt.
 *
 * Both directions, because only one of them is a test: with rules that reject,
 * the dialog appears; with the real rules, it does NOT. Without the second
 * assertion this would pass on a build that always shows the dialog.
 *
 * The rules are swapped through the emulator's own REST endpoint rather than by
 * editing firestore.rules, so the repo is never touched and a failed run cannot
 * leave the file mutated.
 */
// Same override the app and the seeder honour. It was hardcoded until the day
// Stock's emulators had to run beside Gastos Diarios' — this was the one place
// in the repo that could not follow the ports.
const FIRESTORE_PORT = process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_PORT ?? '8280'
const RULES_URL = `http://127.0.0.1:${FIRESTORE_PORT}/emulator/v1/projects/demo-stock:securityRules`

const DENY_WRITES = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read: if true;
      allow write: if false;
    }
  }
}
`

async function loadRules(content: string) {
  const response = await fetch(RULES_URL, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rules: { files: [{ name: 'firestore.rules', content }] } }),
  })
  if (!response.ok) throw new Error(`no pude cargar las reglas: ${response.status}`)
}

const DOCS =
  `http://127.0.0.1:${FIRESTORE_PORT}/v1/projects/demo-stock/databases/` +
  '(default)/documents/households/casa-cardozo'

/**
 * Whether a row is ticked ON THE SERVER. The screen cannot answer this: a tick
 * applies to the local cache at once and a rejection only arrives later, so
 * "the checkbox says unticked" is true in both worlds for a moment. The server
 * is the one place where a refused write never shows up.
 */
async function checkedOnServer(entryId: string): Promise<boolean | undefined> {
  const response = await fetch(`${DOCS}/shoppingList/${entryId}`, {
    headers: { Authorization: 'Bearer owner' },
  })
  const body = (await response.json()) as { fields?: { checked?: { booleanValue?: boolean } } }
  return body.fields?.checked?.booleanValue
}

/** Servilletas, in tools/seed-emulator.mjs. */
const SERVILLETAS = 'e3'

async function signIn(page: Page) {
  await page.goto('/falta-comprar')
  await page.getByRole('button', { name: 'Entrar como cristian' }).click()
  await expect(page.getByRole('button', { name: 'Entrar como cristian' })).toBeHidden()
}

test.describe('a refused write says so', () => {
  let realRules: string

  test.beforeAll(() => {
    realRules = readFileSync(join(__dirname, '../../../firebase/firestore.rules'), 'utf8')
  })

  test.afterEach(async () => {
    await loadRules(realRules)
  })

  test('the dialog appears when the server refuses', async ({ page }) => {
    await signIn(page)
    await loadRules(DENY_WRITES)

    // Ticking a row is the smallest write there is, and it is the one made
    // standing in a shop — the place where losing it silently costs most.
    await page.getByRole('checkbox', { name: 'Tildar Servilletas' }).click()

    await expect(page.getByRole('alertdialog')).toBeVisible()
    await expect(page.getByText('No se pudo guardar')).toBeVisible()

    // Dismissable, and it stays dismissed.
    await page.getByRole('button', { name: 'Entendido' }).click()
    await expect(page.getByRole('alertdialog')).toBeHidden()
  })

  test('and stays away when the server accepts', async ({ page }) => {
    // The half that makes the other half a test rather than a screenshot.
    await loadRules(realRules)
    await signIn(page)

    await page.getByRole('checkbox', { name: 'Tildar Servilletas' }).click()
    await expect.poll(() => checkedOnServer(SERVILLETAS)).toBe(true)
    await expect(page.getByRole('alertdialog')).toBeHidden()

    // And back. This used to be a bare "put it back for the specs that follow"
    // with nothing asserted after it — which is exactly how unticking on the web
    // shipped rejected by the rules for six weeks: the dialog appeared after the
    // test's last line, and the next spec never looked at Servilletas. Unticking
    // is a write like any other and is held to the same two questions.
    await page.getByRole('checkbox', { name: 'Destildar Servilletas' }).click()
    await expect.poll(() => checkedOnServer(SERVILLETAS)).toBe(false)
    await expect(page.getByRole('checkbox', { name: 'Tildar Servilletas' })).toBeVisible()
    await expect(page.getByRole('alertdialog')).toBeHidden()
  })
})

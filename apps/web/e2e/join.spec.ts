import { expect, test, type Page } from '@playwright/test'

/**
 * Joining a household with an invite code, through the real screen and the
 * real `joinHousehold`.
 *
 * This had no test of any kind and was broken on both platforms from the first
 * build: the clients read the household before adding themselves, and a
 * non-member cannot read a household. The rules tests have their own copy of
 * the sequence; this is the one that runs the client's code.
 *
 * The seed puts both users in the household already, so the setup takes Meli
 * OUT of it through the emulator's admin access — making her a person with no
 * household, which is who sees the join form — and the join puts her back. The
 * documents touched are snapshotted first and restored after, whatever
 * happened, so a failure here cannot leak into the specs that follow.
 */
const FIRESTORE_PORT = process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_PORT ?? '8280'
const DOCS = `http://127.0.0.1:${FIRESTORE_PORT}/v1/projects/demo-stock/databases/(default)/documents`
const HOUSEHOLD = `${DOCS}/households/casa-cardozo`
const CODE = 'e2ejoin0001code'
const OWNER = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }

type Fields = Record<string, unknown>

async function read(url: string): Promise<Fields> {
  const response = await fetch(url, { headers: OWNER })
  if (!response.ok) throw new Error(`GET ${url}: ${response.status}`)
  return ((await response.json()) as { fields: Fields }).fields
}

/** Without a mask the document is REPLACED, which is what a restore wants. */
async function write(url: string, fields: Fields, mask?: string[]) {
  const query = mask ? `?${mask.map((f) => `updateMask.fieldPaths=${f}`).join('&')}` : ''
  const response = await fetch(`${url}${query}`, {
    method: 'PATCH',
    headers: OWNER,
    body: JSON.stringify({ fields }),
  })
  if (!response.ok) throw new Error(`PATCH ${url}: ${response.status} ${await response.text()}`)
}

const str = (value: string) => ({ stringValue: value })
const uids = (fields: Fields) =>
  ((fields.memberIds as { arrayValue: { values?: { stringValue: string }[] } }).arrayValue.values ?? []).map(
    (v) => v.stringValue,
  )

let householdBefore: Fields
let meliBefore: Fields
let cristian: string
let meli: string

test.beforeAll(async () => {
  householdBefore = await read(HOUSEHOLD)
  const members = (householdBefore.members as { mapValue: { fields: Record<string, { mapValue: { fields: Fields } }> } })
    .mapValue.fields
  const byName = (name: string) =>
    Object.keys(members).find((uid) => (members[uid].mapValue.fields.displayName as { stringValue: string }).stringValue === name)
  cristian = byName('Cristian') ?? ''
  meli = byName('Meli') ?? ''
  expect(cristian && meli, 'the seed should have Cristian and Meli in casa-cardozo').toBeTruthy()
  meliBefore = await read(`${DOCS}/users/${meli}`)

  await write(`${DOCS}/invites/${CODE}`, {
    householdId: str('casa-cardozo'),
    createdBy: str(cristian),
    createdAt: { timestampValue: new Date().toISOString() },
  })
  // Meli, with no household: the only person who sees the join form.
  await write(`${DOCS}/users/${meli}`, {}, ['householdId'])
})

test.afterAll(async () => {
  await write(HOUSEHOLD, householdBefore)
  await write(`${DOCS}/users/${meli}`, meliBefore)
  await fetch(`${DOCS}/invites/${CODE}`, { method: 'DELETE', headers: OWNER })
})

/** Leaves the household with the given members and no one else. */
async function setMembers(ids: string[]) {
  const members = (householdBefore.members as { mapValue: { fields: Fields } }).mapValue.fields
  await write(
    HOUSEHOLD,
    {
      memberIds: { arrayValue: { values: ids.map(str) } },
      members: {
        mapValue: {
          fields: Object.fromEntries(
            ids.map((id) => [id, members[id] ?? { mapValue: { fields: { displayName: str('Otra') } } }]),
          ),
        },
      },
    },
    ['memberIds', 'members'],
  )
}

async function joinAsMeli(page: Page) {
  await page.goto('/stock')
  await page.getByRole('button', { name: 'Entrar como meli' }).click()
  await expect(page.getByText('Unirme con un código')).toBeVisible()
  await page.getByLabel('Código de invitación').fill(CODE)
  await page.getByRole('button', { name: 'Unirme' }).click()
}

test('a full household says so instead of failing silently', async ({ page }) => {
  // Two members and neither is Meli: the rules refuse a third.
  await setMembers([cristian, 'somebody-else'])
  await joinAsMeli(page)
  await expect(page.getByText('Ese hogar ya está completo')).toBeVisible()
  expect(uids(await read(HOUSEHOLD))).not.toContain(meli)
})

test('a household with room takes her in, on the server', async ({ page }) => {
  await setMembers([cristian])
  await joinAsMeli(page)

  await expect.poll(async () => uids(await read(HOUSEHOLD))).toEqual([cristian, meli])
  await expect
    .poll(async () => ((await read(`${DOCS}/users/${meli}`)).householdId as { stringValue?: string })?.stringValue)
    .toBe('casa-cardozo')
  // And the app left the join screen for the household.
  await expect(page.getByText('Unirme con un código')).toBeHidden()
})

import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Firestore,
} from 'firebase/firestore'
import {
  ALICE,
  BOB,
  CAROL,
  HID,
  countedItem,
  levelItem,
  makeTestEnv,
  seedDoc,
  seedHousehold,
} from './helpers'

let env: RulesTestEnvironment

const db = (uid: string) => env.authenticatedContext(uid).firestore() as unknown as Firestore
const items = (uid: string) => collection(db(uid), `households/${HID}/items`)
const item = (uid: string, id: string) => doc(db(uid), `households/${HID}/items/${id}`)

beforeAll(async () => {
  env = await makeTestEnv()
})
afterAll(async () => env?.cleanup())
beforeEach(async () => {
  await env.clearFirestore()
  await seedHousehold(env, [ALICE, BOB])
})

describe('items: access', () => {
  it('either member reads and writes any item — attribution, not ownership', async () => {
    await assertSucceeds(setDoc(item(ALICE, 'huevos'), countedItem(ALICE)))
    await assertSucceeds(getDocs(items(BOB)))
    await assertSucceeds(
      updateDoc(item(BOB, 'huevos'), {
        quantity: 4,
        updatedAt: serverTimestamp(),
        updatedBy: BOB,
      }),
    )
    await assertSucceeds(deleteDoc(item(BOB, 'huevos')))
  })

  it('a stranger sees nothing', async () => {
    await seedDoc(env, `households/${HID}/items/huevos`, {
      ...countedItem(ALICE),
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    await assertFails(getDocs(items(CAROL)))
    await assertFails(deleteDoc(item(CAROL, 'huevos')))
  })
})

describe('items: a household that is not there', () => {
  it('denies cleanly, without an evaluation error, without an evaluation error', async () => {
    // A listener left pointing at a deleted household makes the membership
    // get() return null. Reaching into it raises "Null value error" instead of
    // denying, which reaches the client as a cryptic permission failure.
    const ghost = doc(db(ALICE), 'households/does-not-exist/items/x')
    await assertFails(setDoc(ghost, countedItem(ALICE)))
    await assertFails(getDocs(collection(db(ALICE), 'households/does-not-exist/items')))
  })
})

describe('items: the hybrid measurement is enforced', () => {
  it('accepts a counted item and a level item', async () => {
    await assertSucceeds(setDoc(item(ALICE, 'huevos'), countedItem(ALICE)))
    await assertSucceeds(setDoc(item(ALICE, 'aceite'), levelItem(ALICE)))
  })

  it('rejects a counted item carrying level fields, and vice versa', async () => {
    await assertFails(
      setDoc(item(ALICE, 'mixed'), countedItem(ALICE, { level: 2, minLevel: 1 })),
    )
    await assertFails(
      setDoc(item(ALICE, 'mixed'), levelItem(ALICE, { unit: 'g', quantity: 100, minQuantity: 0 })),
    )
  })

  it('rejects a counted item missing its unit or quantity', async () => {
    const { unit, ...noUnit } = countedItem(ALICE)
    await assertFails(setDoc(item(ALICE, 'x'), noUnit))
    const { quantity, ...noQuantity } = countedItem(ALICE)
    await assertFails(setDoc(item(ALICE, 'x'), noQuantity))
  })

  it('rejects an unknown unit and an unknown tracking mode', async () => {
    await assertFails(setDoc(item(ALICE, 'x'), countedItem(ALICE, { unit: 'kg' })))
    await assertFails(setDoc(item(ALICE, 'x'), countedItem(ALICE, { tracking: 'weight' })))
  })

  it('rejects fractional or negative quantities — quantities are non-negative integers', async () => {
    await assertFails(setDoc(item(ALICE, 'x'), countedItem(ALICE, { quantity: 1.5 })))
    await assertFails(setDoc(item(ALICE, 'x'), countedItem(ALICE, { quantity: -1 })))
    await assertFails(setDoc(item(ALICE, 'x'), countedItem(ALICE, { minQuantity: -1 })))
  })

  it('rejects a level outside 0–3', async () => {
    await assertFails(setDoc(item(ALICE, 'x'), levelItem(ALICE, { level: 4 })))
    await assertFails(setDoc(item(ALICE, 'x'), levelItem(ALICE, { level: -1 })))
    await assertFails(setDoc(item(ALICE, 'x'), levelItem(ALICE, { minLevel: 7 })))
  })
})

describe('items: field validation', () => {
  it('rejects an empty name and unknown fields', async () => {
    await assertFails(setDoc(item(ALICE, 'x'), countedItem(ALICE, { name: '' })))
    await assertFails(setDoc(item(ALICE, 'x'), countedItem(ALICE, { totalCents: 100 })))
  })

  it('dates must be YYYY-MM-DD strings, not timestamps or garbage', async () => {
    await assertSucceeds(setDoc(item(ALICE, 'ok'), countedItem(ALICE, { expiresAt: '2026-08-24' })))
    await assertFails(setDoc(item(ALICE, 'x'), countedItem(ALICE, { expiresAt: new Date() })))
    await assertFails(setDoc(item(ALICE, 'x'), countedItem(ALICE, { expiresAt: '24/08/2026' })))
    await assertFails(setDoc(item(ALICE, 'x'), countedItem(ALICE, { snoozedUntil: 'soon' })))
  })

  it('the reference price is integer cents', async () => {
    await assertSucceeds(setDoc(item(ALICE, 'ok'), countedItem(ALICE, { lastPriceCents: 499 })))
    await assertFails(setDoc(item(ALICE, 'x'), countedItem(ALICE, { lastPriceCents: 4.99 })))
  })

  it('receipt names are a bounded list, like barcodes', async () => {
    await assertSucceeds(
      setDoc(
        item(ALICE, 'ok'),
        countedItem(ALICE, { receiptNames: ['COLES DRINK SOY:REGU 1LITRE'] }),
      ),
    )
    // One product really does have several names — online and in-store print
    // it differently — but not unbounded, for the same reason barcodes are capped.
    await assertFails(
      setDoc(
        item(ALICE, 'x'),
        countedItem(ALICE, { receiptNames: Array.from({ length: 21 }, (_, i) => `n${i}`) }),
      ),
    )
    await assertFails(setDoc(item(ALICE, 'x'), countedItem(ALICE, { receiptNames: 'COLES' })))
  })

  it('catalogue-only is a flag, not a threshold', async () => {
    await assertSucceeds(
      setDoc(item(ALICE, 'ok'), countedItem(ALICE, { autoSuggest: false })),
    )
    // A number here would read as "suggest above 0", which is the opposite.
    await assertFails(setDoc(item(ALICE, 'x'), countedItem(ALICE, { autoSuggest: 0 })))
    await assertFails(setDoc(item(ALICE, 'x'), countedItem(ALICE, { autoSuggest: 'no' })))
  })

  it('the reserve is whole containers, never a fraction', async () => {
    await assertSucceeds(setDoc(item(ALICE, 'ok'), levelItem(ALICE, { spare: 2, minSpare: 2 })))
    // Half a sealed bottle is not a thing you can have.
    await assertFails(setDoc(item(ALICE, 'x'), levelItem(ALICE, { spare: 1.5 })))
    await assertFails(setDoc(item(ALICE, 'x'), levelItem(ALICE, { minSpare: -1 })))
  })

  it('the Spanish subtitle is an optional short string', async () => {
    await assertSucceeds(setDoc(item(ALICE, 'ok'), countedItem(ALICE, { nameEs: 'Leche de soja' })))
    await assertFails(setDoc(item(ALICE, 'x'), countedItem(ALICE, { nameEs: 'x'.repeat(81) })))
    await assertFails(setDoc(item(ALICE, 'x'), countedItem(ALICE, { nameEs: 42 })))
  })
})

describe('items: audit fields cannot lie', () => {
  it('rejects a client-side createdAt', async () => {
    await assertFails(setDoc(item(ALICE, 'x'), countedItem(ALICE, { createdAt: new Date() })))
  })

  it('rejects attributing a write to the other member', async () => {
    await assertFails(setDoc(item(ALICE, 'x'), countedItem(BOB)))
  })

  it('rejects rewriting createdAt on update', async () => {
    await assertSucceeds(setDoc(item(ALICE, 'huevos'), countedItem(ALICE)))
    await assertFails(
      updateDoc(item(ALICE, 'huevos'), {
        quantity: 3,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        updatedBy: ALICE,
      }),
    )
  })

  it('rejects an update that does not touch updatedAt', async () => {
    await assertSucceeds(setDoc(item(ALICE, 'huevos'), countedItem(ALICE)))
    await assertFails(updateDoc(item(ALICE, 'huevos'), { quantity: 3 }))
  })
})

describe('moves: append-only', () => {
  const move = (uid: string, id: string) => doc(db(uid), `households/${HID}/moves/${id}`)

  it('a member appends a move', async () => {
    await assertSucceeds(
      setDoc(move(ALICE, 'm1'), {
        itemId: 'huevos',
        type: 'purchase',
        delta: 6,
        at: serverTimestamp(),
        by: ALICE,
      }),
    )
  })

  it('rejects an unknown type, a forged author, and a client-side time', async () => {
    const base = { itemId: 'huevos', type: 'purchase', delta: 6, at: serverTimestamp(), by: ALICE }
    await assertFails(setDoc(move(ALICE, 'x'), { ...base, type: 'stocktake' }))
    await assertFails(setDoc(move(ALICE, 'x'), { ...base, by: BOB }))
    await assertFails(setDoc(move(ALICE, 'x'), { ...base, at: new Date() }))
  })

  it('history is never rewritten or erased', async () => {
    await seedDoc(env, `households/${HID}/moves/m1`, {
      itemId: 'huevos',
      type: 'purchase',
      delta: 6,
      at: new Date(),
      by: ALICE,
    })
    await assertFails(updateDoc(move(ALICE, 'm1'), { delta: 999 }))
    await assertFails(deleteDoc(move(ALICE, 'm1')))
  })
})

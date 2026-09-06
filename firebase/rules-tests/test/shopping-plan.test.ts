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
import { ALICE, BOB, CAROL, HID, makeTestEnv, seedDoc, seedHousehold } from './helpers'

let env: RulesTestEnvironment

const db = (uid: string) => env.authenticatedContext(uid).firestore() as unknown as Firestore
const entry = (uid: string, id: string) => doc(db(uid), `households/${HID}/shoppingList/${id}`)
const plan = (uid: string, id: string) => doc(db(uid), `households/${HID}/mealPlans/${id}`)
const recipe = (uid: string, id: string) => doc(db(uid), `households/${HID}/recipes/${id}`)

const row = (uid: string, overrides: Record<string, unknown> = {}) => ({
  label: 'Huevos',
  itemId: 'huevos',
  quantity: 4,
  unit: 'unit',
  source: 'min',
  reason: 'quedan 2, mínimo 6',
  checked: false,
  addedAt: serverTimestamp(),
  addedBy: uid,
  ...overrides,
})

const planDoc = (startDate: string, overrides: Record<string, unknown> = {}) => ({
  startDate,
  endDate: '2026-08-21',
  length: 'weekly',
  days: { '2026-08-17': { recipeId: 'bolo', status: 'planned' } },
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
  ...overrides,
})

const recipeDoc = (overrides: Record<string, unknown> = {}) => ({
  title: 'Fideos boloñesa',
  servings: 2,
  steps: 'Hervir, saltear, mezclar.',
  tags: ['rápido'],
  ingredients: [{ label: 'Fideos', itemId: 'fideos', quantity: 500, unit: 'g', optional: false }],
  timesCooked: 0,
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
  ...overrides,
})

beforeAll(async () => {
  env = await makeTestEnv()
})
afterAll(async () => env?.cleanup())
beforeEach(async () => {
  await env.clearFirestore()
  await seedHousehold(env, [ALICE, BOB])
})

describe('shopping list: shared state, either member', () => {
  it('one member adds a row and the other ticks it', async () => {
    await assertSucceeds(setDoc(entry(ALICE, 'e1'), row(ALICE)))
    await assertSucceeds(getDocs(collection(db(BOB), `households/${HID}/shoppingList`)))
    await assertSucceeds(
      updateDoc(entry(BOB, 'e1'), {
        checked: true,
        checkedAt: serverTimestamp(),
        checkedBy: BOB,
      }),
    )
  })

  it('either member deletes a row — closing the shop deletes the ticked ones', async () => {
    await assertSucceeds(setDoc(entry(ALICE, 'e1'), row(ALICE)))
    await assertSucceeds(deleteDoc(entry(BOB, 'e1')))
  })

  it('a stranger cannot see or touch the list', async () => {
    await seedDoc(env, `households/${HID}/shoppingList/e1`, { ...row(ALICE), addedAt: new Date() })
    await assertFails(getDocs(collection(db(CAROL), `households/${HID}/shoppingList`)))
    await assertFails(updateDoc(entry(CAROL, 'e1'), { checked: true }))
  })

  it('a manual row needs no item', async () => {
    await assertSucceeds(
      setDoc(entry(ALICE, 'e2'), {
        label: 'Cerveza',
        source: 'manual',
        checked: false,
        addedAt: serverTimestamp(),
        addedBy: ALICE,
      }),
    )
  })

  it('rejects an unknown source, a non-bool tick and a forged author', async () => {
    await assertFails(setDoc(entry(ALICE, 'x'), row(ALICE, { source: 'magic' })))
    await assertFails(setDoc(entry(ALICE, 'x'), row(ALICE, { checked: 'yes' })))
    await assertFails(setDoc(entry(ALICE, 'x'), row(ALICE, { addedBy: BOB })))
    await assertFails(setDoc(entry(ALICE, 'x'), row(ALICE, { addedAt: new Date() })))
  })

  it('who added a row cannot be rewritten later', async () => {
    await assertSucceeds(setDoc(entry(ALICE, 'e1'), row(ALICE)))
    await assertFails(updateDoc(entry(BOB, 'e1'), { addedBy: BOB }))
  })

  it('quantities on the list are integers too', async () => {
    await assertFails(setDoc(entry(ALICE, 'x'), row(ALICE, { quantity: 1.5 })))
    await assertFails(setDoc(entry(ALICE, 'x'), row(ALICE, { unit: 'kg' })))
  })
})

describe('shopping list: the label is capped', () => {
  it('stops at 80 characters', async () => {
    // The one free-text field on the list, and the row it produces is read by
    // both clients on every render of the screen.
    await assertSucceeds(setDoc(entry(ALICE, 'ok'), row(ALICE, { label: 'x'.repeat(80) })))
    await assertFails(setDoc(entry(ALICE, 'x'), row(ALICE, { label: 'x'.repeat(81) })))
  })
})

describe('meal plans', () => {
  it('a member materialises the period, and the id must be its start date', async () => {
    await assertSucceeds(setDoc(plan(ALICE, '2026-08-15'), planDoc('2026-08-15')))
    await assertFails(setDoc(plan(ALICE, '2026-08-15'), planDoc('2026-08-16')))
  })

  it('a period cannot hold more days than a fortnight has', async () => {
    // 14 is the longest period the app offers. The cap is on the MAP, not on
    // the date range, so it is what stops a document growing without bound if
    // a client ever wrote days outside its own period.
    const days = (count: number) => {
      const out: Record<string, unknown> = {}
      for (let i = 0; i < count; i += 1) {
        out[`2026-08-${String(i + 1).padStart(2, '0')}`] = { label: 'Afuera', status: 'planned' }
      }
      return out
    }
    await assertSucceeds(setDoc(plan(ALICE, '2026-08-15'), planDoc('2026-08-15', { days: days(14) })))
    await assertFails(setDoc(plan(ALICE, '2026-08-15'), planDoc('2026-08-15', { days: days(15) })))
  })

  it('rejects a plan whose range runs backwards or whose length is invented', async () => {
    await assertFails(
      setDoc(plan(ALICE, '2026-08-15'), planDoc('2026-08-15', { endDate: '2026-08-01' })),
    )
    await assertFails(
      setDoc(plan(ALICE, '2026-08-15'), planDoc('2026-08-15', { length: 'monthly' })),
    )
  })

  it('rejects dates that are not YYYY-MM-DD', async () => {
    await assertFails(
      setDoc(plan(ALICE, '15-08-2026'), planDoc('15-08-2026', { endDate: '21-08-2026' })),
    )
  })

  it('the other member edits the plan and marks a meal cooked', async () => {
    await assertSucceeds(setDoc(plan(ALICE, '2026-08-15'), planDoc('2026-08-15')))
    await assertSucceeds(
      updateDoc(plan(BOB, '2026-08-15'), {
        'days.2026-08-17.status': 'cooked',
        updatedAt: serverTimestamp(),
      }),
    )
  })

  it('a stranger cannot read the plan', async () => {
    await seedDoc(env, `households/${HID}/mealPlans/2026-08-15`, {
      ...planDoc('2026-08-15'),
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    await assertFails(getDocs(collection(db(CAROL), `households/${HID}/mealPlans`)))
  })
})

describe('recipes', () => {
  it('the title and the ingredient list are capped', async () => {
    // Untested until now, like every string cap that no form could reach.
    // A recipe's title is rendered in a row on both clients and its ingredient
    // list is walked on every suggestion pass, so an unbounded one is not just
    // storage — it is work done on every screen that reads the plan.
    await assertSucceeds(
      setDoc(recipe(ALICE, 'ok'), recipeDoc({ title: 'x'.repeat(120) })),
    )
    await assertFails(setDoc(recipe(ALICE, 'x'), recipeDoc({ title: 'x'.repeat(121) })))

    const ingredient = { label: 'x', itemId: 'i', quantity: 1, unit: 'unit', optional: false }
    await assertSucceeds(
      setDoc(recipe(ALICE, 'ok2'), recipeDoc({ ingredients: Array(60).fill(ingredient) })),
    )
    await assertFails(
      setDoc(recipe(ALICE, 'x2'), recipeDoc({ ingredients: Array(61).fill(ingredient) })),
    )
  })

  it('tags and steps are capped', async () => {
    await assertSucceeds(
      setDoc(recipe(ALICE, 'ok'), recipeDoc({ tags: Array(20).fill('t'), steps: 'x'.repeat(5000) })),
    )
    await assertFails(setDoc(recipe(ALICE, 'x'), recipeDoc({ tags: Array(21).fill('t') })))
    await assertFails(setDoc(recipe(ALICE, 'x'), recipeDoc({ steps: 'x'.repeat(5001) })))
  })

  it('the short name is a short string, or absent', async () => {
    await assertSucceeds(
      setDoc(recipe(ALICE, 'ok'), recipeDoc({ shortName: 'milanesas' })),
    )
    // Empty is not "no short name" — absent is. An empty one would match an
    // empty calendar title and silently claim every blank event.
    await assertFails(setDoc(recipe(ALICE, 'x'), recipeDoc({ shortName: '' })))
    await assertFails(setDoc(recipe(ALICE, 'x'), recipeDoc({ shortName: 'a'.repeat(41) })))
    await assertFails(setDoc(recipe(ALICE, 'x'), recipeDoc({ shortName: 7 })))
  })

  it('a member creates, edits and deletes a recipe', async () => {
    await assertSucceeds(setDoc(recipe(ALICE, 'bolo'), recipeDoc()))
    await assertSucceeds(
      updateDoc(recipe(BOB, 'bolo'), { timesCooked: 1, updatedAt: serverTimestamp() }),
    )
    await assertSucceeds(deleteDoc(recipe(BOB, 'bolo')))
  })

  it('rejects an empty title, zero servings and a bad lastCookedAt', async () => {
    await assertFails(setDoc(recipe(ALICE, 'x'), recipeDoc({ title: '' })))
    await assertFails(setDoc(recipe(ALICE, 'x'), recipeDoc({ servings: 0 })))
    await assertFails(setDoc(recipe(ALICE, 'x'), recipeDoc({ lastCookedAt: 'ayer' })))
  })

  it('a stranger cannot read recipes', async () => {
    await assertFails(getDocs(collection(db(CAROL), `households/${HID}/recipes`)))
  })
})

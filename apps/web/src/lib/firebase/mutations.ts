'use client'

/**
 * Every write in the app.
 *
 * Two rules run through all of it:
 *  - Anything that touches more than one document is a `writeBatch`, so cooking
 *    a meal or closing a shop either happens or doesn't.
 *  - The caller does NOT await these to move the UI. Firestore only resolves a
 *    write when the server confirms it, so awaiting freezes the form while the
 *    data is already saved locally.
 */
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  arrayUnion,
  type Firestore,
} from 'firebase/firestore'
import { db } from './client'
import categoriesSeed from '../../../../../shared/categories.json'
import locationsSeed from '../../../../../shared/locations.json'
import { periodEndFor, type IsoDate, type PlanLength } from '@/lib/domain/dates'
import type {
  Item,
  Level,
  MealPlan,
  Move,
  Recipe,
  ShoppingEntry,
  ShoppingSource,
  Unit,
} from '@/lib/domain/types'

const HOUSEHOLDS = 'households'

function seedMap<T extends { id: string }>(rows: T[]) {
  const out: Record<string, Omit<T, 'id'>> = {}
  for (const { id, ...rest } of rows) out[id] = rest
  return out
}

// ── household ──────────────────────────────────────────────────────────────

export async function createHousehold(
  uid: string,
  displayName: string,
  photoURL: string | null,
  name = 'Casa',
  timezone = 'Australia/Sydney',
) {
  const database = db()
  const householdId = doc(collection(database, HOUSEHOLDS)).id
  const batch = writeBatch(database)

  batch.set(doc(database, HOUSEHOLDS, householdId), {
    name,
    timezone,
    currency: 'AUD',
    memberIds: [uid],
    members: { [uid]: { displayName, ...(photoURL ? { photoURL } : {}) } },
    locations: seedMap(locationsSeed.locations),
    categories: seedMap(categoriesSeed.categories),
    // Saturday, because the plan is written on Friday and shopped on the weekend.
    planConfig: { length: 'fortnightly', startWeekday: 6 },
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  batch.set(
    doc(database, 'users', uid),
    {
      displayName,
      ...(photoURL ? { photoURL } : {}),
      householdId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: false },
  )

  await batch.commit()
  return householdId
}

/**
 * Joining is a self-add update, not a query: rules cannot see the values in a
 * `where` clause, so the invite code is the document id instead.
 */
export async function joinHousehold(
  uid: string,
  displayName: string,
  photoURL: string | null,
  code: string,
) {
  const database = db()
  const invite = await getDoc(doc(database, 'invites', code.trim()))
  if (!invite.exists()) throw new Error('Ese código no existe')

  const householdId = invite.data().householdId as string
  const household = await getDoc(doc(database, HOUSEHOLDS, householdId))
  const memberIds: string[] = household.exists() ? (household.data().memberIds ?? []) : []

  if (memberIds.includes(uid)) {
    await setUserHousehold(uid, displayName, photoURL, householdId)
    return householdId
  }
  if (memberIds.length >= 2) throw new Error('Ese hogar ya está completo')

  await updateDoc(doc(database, HOUSEHOLDS, householdId), {
    memberIds: [...memberIds, uid],
    [`members.${uid}`]: { displayName, ...(photoURL ? { photoURL } : {}) },
    updatedAt: serverTimestamp(),
  })
  await setUserHousehold(uid, displayName, photoURL, householdId)
  return householdId
}

async function setUserHousehold(
  uid: string,
  displayName: string,
  photoURL: string | null,
  householdId: string,
) {
  await setDoc(
    doc(db(), 'users', uid),
    {
      displayName,
      ...(photoURL ? { photoURL } : {}),
      householdId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: false },
  )
}

/** 16 chars of crypto randomness: the code IS the capability, so it has to be one. */
export function newInviteCode(): string {
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')
}

export async function createInvite(householdId: string, uid: string) {
  const code = newInviteCode()
  await setDoc(doc(db(), 'invites', code), {
    householdId,
    createdBy: uid,
    createdAt: serverTimestamp(),
  })
  return code
}

export function updateHousehold(householdId: string, patch: Record<string, unknown>) {
  return updateDoc(doc(db(), HOUSEHOLDS, householdId), { ...patch, updatedAt: serverTimestamp() })
}

// ── items ──────────────────────────────────────────────────────────────────

export type NewItem = Omit<Item, 'id'>

export function createItem(householdId: string, uid: string, item: NewItem) {
  const ref = doc(collection(db(), HOUSEHOLDS, householdId, 'items'))
  return setDoc(ref, {
    ...stripUndefined(item),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    updatedBy: uid,
  })
}

export function updateItem(
  householdId: string,
  uid: string,
  itemId: string,
  patch: Record<string, unknown>,
) {
  return updateDoc(doc(db(), HOUSEHOLDS, householdId, 'items', itemId), {
    ...patch,
    updatedAt: serverTimestamp(),
    updatedBy: uid,
  })
}

export function deleteItem(householdId: string, itemId: string) {
  return deleteDoc(doc(db(), HOUSEHOLDS, householdId, 'items', itemId))
}

/** A manual bump from the stock screen: the item changes and the log records it. */
export function adjustStock(
  householdId: string,
  uid: string,
  item: Item,
  next: { quantity?: number; level?: Level },
  type: Move['type'] = 'adjust',
) {
  const database = db()
  const batch = writeBatch(database)
  const itemRef = doc(database, HOUSEHOLDS, householdId, 'items', item.id)
  const moveRef = doc(collection(database, HOUSEHOLDS, householdId, 'moves'))

  if (item.tracking === 'quantity') {
    const quantity = Math.max(0, next.quantity ?? 0)
    batch.update(itemRef, { quantity, updatedAt: serverTimestamp(), updatedBy: uid })
    batch.set(moveRef, {
      itemId: item.id,
      type,
      delta: quantity - (item.quantity ?? 0),
      at: serverTimestamp(),
      by: uid,
    })
  } else {
    const level = (next.level ?? 0) as Level
    batch.update(itemRef, { level, updatedAt: serverTimestamp(), updatedBy: uid })
    batch.set(moveRef, {
      itemId: item.id,
      type,
      levelFrom: (item.level ?? 0) as Level,
      levelTo: level,
      at: serverTimestamp(),
      by: uid,
    })
  }
  return batch.commit()
}

export function snoozeItem(householdId: string, uid: string, itemId: string, until: IsoDate) {
  return updateItem(householdId, uid, itemId, { snoozedUntil: until })
}

/** Grows forever, so: read-once, newest first, hard limit. Never a listener. */
export async function recentMoves(householdId: string, itemId: string, max = 20) {
  const snap = await getDocs(
    query(
      collection(db(), HOUSEHOLDS, householdId, 'moves'),
      where('itemId', '==', itemId),
      orderBy('at', 'desc'),
      limit(max),
    ),
  )
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Move)
}

// ── shopping list ──────────────────────────────────────────────────────────

export interface NewEntry {
  label: string
  itemId?: string
  quantity?: number
  unit?: Unit
  source: ShoppingSource
  reason?: string
}

export function addToList(householdId: string, uid: string, entry: NewEntry) {
  const ref = doc(collection(db(), HOUSEHOLDS, householdId, 'shoppingList'))
  return setDoc(ref, {
    ...stripUndefined(entry),
    checked: false,
    addedAt: serverTimestamp(),
    addedBy: uid,
  })
}

export function addManyToList(householdId: string, uid: string, entries: NewEntry[]) {
  return inBatches(entries, (batch, entry) => {
    const ref = doc(collection(db(), HOUSEHOLDS, householdId, 'shoppingList'))
    batch.set(ref, {
      ...stripUndefined(entry),
      checked: false,
      addedAt: serverTimestamp(),
      addedBy: uid,
    })
  })
}

/** A tick is just a tick: it strikes the row through and touches no stock. */
export function setChecked(householdId: string, uid: string, entryId: string, checked: boolean) {
  return updateDoc(doc(db(), HOUSEHOLDS, householdId, 'shoppingList', entryId), {
    checked,
    ...(checked
      ? { checkedAt: serverTimestamp(), checkedBy: uid }
      : { checkedAt: null, checkedBy: null }),
  })
}

export function removeFromList(householdId: string, entryId: string) {
  return deleteDoc(doc(db(), HOUSEHOLDS, householdId, 'shoppingList', entryId))
}

export interface Purchase {
  entry: ShoppingEntry
  item?: Item
  /** How much actually came in — pre-filled from the row, edited by the human. */
  quantity?: number
  level?: Level
  expiresAt?: IsoDate
  priceCents?: number
}

/**
 * Closing the shop: ticked rows fold into stock, write their moves and are
 * deleted. Unticked rows are left alone — that is what makes the list survive
 * into next week instead of being rebuilt from scratch.
 */
export function closeShopping(householdId: string, uid: string, purchases: Purchase[]) {
  return inBatches(purchases, (batch, purchase) => {
    const { entry, item } = purchase
    const database = db()

    if (item) {
      const itemRef = doc(database, HOUSEHOLDS, householdId, 'items', item.id)
      const moveRef = doc(collection(database, HOUSEHOLDS, householdId, 'moves'))

      if (item.tracking === 'quantity') {
        const delta = Math.max(0, purchase.quantity ?? 0)
        batch.update(itemRef, {
          quantity: (item.quantity ?? 0) + delta,
          ...(purchase.expiresAt ? { expiresAt: purchase.expiresAt } : {}),
          ...(purchase.priceCents !== undefined ? { lastPriceCents: purchase.priceCents } : {}),
          updatedAt: serverTimestamp(),
          updatedBy: uid,
        })
        batch.set(moveRef, {
          itemId: item.id,
          type: 'purchase',
          delta,
          at: serverTimestamp(),
          by: uid,
        })
      } else {
        const level = (purchase.level ?? 3) as Level
        batch.update(itemRef, {
          level,
          ...(purchase.expiresAt ? { expiresAt: purchase.expiresAt } : {}),
          ...(purchase.priceCents !== undefined ? { lastPriceCents: purchase.priceCents } : {}),
          updatedAt: serverTimestamp(),
          updatedBy: uid,
        })
        batch.set(moveRef, {
          itemId: item.id,
          type: 'purchase',
          levelFrom: (item.level ?? 0) as Level,
          levelTo: level,
          at: serverTimestamp(),
          by: uid,
        })
      }
    }

    batch.delete(doc(database, HOUSEHOLDS, householdId, 'shoppingList', entry.id))
  })
}

// ── meal plan ──────────────────────────────────────────────────────────────

/**
 * Materialised lazily, with the start date as the document id — so if both
 * clients open the app at the same moment they write the same document with the
 * same values, and there is no race to lose.
 */
export async function ensurePlan(householdId: string, startDate: IsoDate, length: PlanLength) {
  const ref = doc(db(), HOUSEHOLDS, householdId, 'mealPlans', startDate)
  const existing = await getDoc(ref)
  if (existing.exists()) return { id: existing.id, ...existing.data() } as MealPlan

  const plan = {
    startDate,
    endDate: periodEndFor(startDate, length),
    length,
    days: {},
  }
  await setDoc(ref, { ...plan, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
  return { id: startDate, ...plan } as MealPlan
}

export function setPlanDay(
  householdId: string,
  planId: IsoDate,
  date: IsoDate,
  day: { recipeId?: string; label?: string } | null,
) {
  const ref = doc(db(), HOUSEHOLDS, householdId, 'mealPlans', planId)
  if (!day) {
    return updateDoc(ref, { [`days.${date}`]: null, updatedAt: serverTimestamp() })
  }
  return updateDoc(ref, {
    [`days.${date}`]: { ...stripUndefined(day), status: 'planned' },
    updatedAt: serverTimestamp(),
  })
}

export interface Consumption {
  item: Item
  /** For counted items: how much was used. For level items: the level it's at now. */
  quantity?: number
  level?: Level
}

/**
 * Marking a meal cooked: the proposed amounts come from the recipe, the human
 * confirms or edits them, and one batch subtracts the stock, logs the moves and
 * closes the day.
 */
export function markCooked(
  householdId: string,
  uid: string,
  planId: IsoDate,
  date: IsoDate,
  recipe: Recipe | null,
  consumption: Consumption[],
) {
  const database = db()
  const batch = writeBatch(database)

  for (const use of consumption) {
    const itemRef = doc(database, HOUSEHOLDS, householdId, 'items', use.item.id)
    const moveRef = doc(collection(database, HOUSEHOLDS, householdId, 'moves'))

    if (use.item.tracking === 'quantity') {
      const used = Math.max(0, use.quantity ?? 0)
      if (used === 0) continue
      batch.update(itemRef, {
        quantity: Math.max(0, (use.item.quantity ?? 0) - used),
        updatedAt: serverTimestamp(),
        updatedBy: uid,
      })
      batch.set(moveRef, {
        itemId: use.item.id,
        type: 'cook',
        delta: -used,
        ...(recipe ? { recipeId: recipe.id } : {}),
        planDate: date,
        at: serverTimestamp(),
        by: uid,
      })
    } else {
      const level = (use.level ?? use.item.level ?? 0) as Level
      if (level === use.item.level) continue
      batch.update(itemRef, { level, updatedAt: serverTimestamp(), updatedBy: uid })
      batch.set(moveRef, {
        itemId: use.item.id,
        type: 'cook',
        levelFrom: (use.item.level ?? 0) as Level,
        levelTo: level,
        ...(recipe ? { recipeId: recipe.id } : {}),
        planDate: date,
        at: serverTimestamp(),
        by: uid,
      })
    }
  }

  batch.update(doc(database, HOUSEHOLDS, householdId, 'mealPlans', planId), {
    [`days.${date}.status`]: 'cooked',
    [`days.${date}.cookedAt`]: date,
    updatedAt: serverTimestamp(),
  })

  if (recipe) {
    batch.update(doc(database, HOUSEHOLDS, householdId, 'recipes', recipe.id), {
      timesCooked: recipe.timesCooked + 1,
      lastCookedAt: date,
      updatedAt: serverTimestamp(),
    })
  }

  return batch.commit()
}

// ── recipes ────────────────────────────────────────────────────────────────

export function createRecipe(householdId: string, recipe: Omit<Recipe, 'id' | 'timesCooked'>) {
  const ref = doc(collection(db(), HOUSEHOLDS, householdId, 'recipes'))
  return setDoc(ref, {
    ...stripUndefined(recipe),
    timesCooked: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
}

export function updateRecipe(householdId: string, recipeId: string, patch: Record<string, unknown>) {
  return updateDoc(doc(db(), HOUSEHOLDS, householdId, 'recipes', recipeId), {
    ...patch,
    updatedAt: serverTimestamp(),
  })
}

export function deleteRecipe(householdId: string, recipeId: string) {
  return deleteDoc(doc(db(), HOUSEHOLDS, householdId, 'recipes', recipeId))
}

// ── plumbing ───────────────────────────────────────────────────────────────

/** Firestore rejects `undefined`; absent and null are the same thing here. */
function stripUndefined<T extends object>(value: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined))
}

/** A batch caps at 500 operations. A shop is ~90, but the cap is not negotiable. */
async function inBatches<T>(
  rows: T[],
  write: (batch: ReturnType<typeof writeBatch>, row: T) => void,
  perBatch = 100,
) {
  const database: Firestore = db()
  for (let i = 0; i < rows.length; i += perBatch) {
    const batch = writeBatch(database)
    for (const row of rows.slice(i, i + perBatch)) write(batch, row)
    await batch.commit()
  }
}

/** What the receipt review screen decided for one line. */
export type ReceiptAction =
  | { kind: 'skip' }
  /** Remember this receipt name on an existing item, and refresh its price. */
  | { kind: 'link'; itemId: string; priceCents: number | null; receiptName: string }
  /** Create the item, already carrying the receipt name that produced it. */
  | { kind: 'create'; item: NewItem; priceCents: number | null; receiptName: string }

/**
 * Applies a whole reviewed receipt in one batch.
 *
 * One batch because a half-applied import is the worst outcome: some prices
 * updated, some items created, and no way to tell which without reading every
 * row. A receipt is tens of lines, far under Firestore's 500-write cap — and
 * that headroom is what lets an optional wipe ride along in the same batch.
 *
 * Quantities are deliberately untouched. These are PAST shops — that food was
 * eaten weeks ago, and adding it to today's stock would invent food that is not
 * in the house. Buying today goes through `closeShopping`, which does move stock.
 */
export function applyReceipt(
  householdId: string,
  uid: string,
  actions: ReceiptAction[],
  /**
   * Item ids to delete first — "start the catalogue from this receipt".
   * In the same batch as the writes on purpose: a catalogue that got emptied
   * and then failed to refill is the one outcome worth ruling out.
   */
  deleteItemIds: string[] = [],
) {
  const database = db()
  const batch = writeBatch(database)

  for (const id of deleteItemIds) {
    batch.delete(doc(database, HOUSEHOLDS, householdId, 'items', id))
  }

  for (const action of actions) {
    if (action.kind === 'skip') continue

    if (action.kind === 'create') {
      const ref = doc(collection(database, HOUSEHOLDS, householdId, 'items'))
      batch.set(ref, {
        ...stripUndefined(action.item),
        receiptNames: [action.receiptName],
        ...(action.priceCents !== null ? { lastPriceCents: action.priceCents } : {}),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        updatedBy: uid,
      })
      continue
    }

    // arrayUnion rather than a rewritten array: the other phone may have taught
    // this item a different receipt name while the import screen was open.
    batch.update(doc(database, HOUSEHOLDS, householdId, 'items', action.itemId), {
      receiptNames: arrayUnion(action.receiptName),
      ...(action.priceCents !== null ? { lastPriceCents: action.priceCents } : {}),
      updatedAt: serverTimestamp(),
      updatedBy: uid,
    })
  }

  return batch.commit()
}

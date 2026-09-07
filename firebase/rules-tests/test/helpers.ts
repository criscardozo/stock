import { readFileSync } from 'node:fs'
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { doc, setDoc, serverTimestamp, type Firestore } from 'firebase/firestore'

export { serverTimestamp }

export const HID = 'household-1'
export const ALICE = 'alice'
export const BOB = 'bob'
export const CAROL = 'carol'

export async function makeTestEnv(): Promise<RulesTestEnvironment> {
  return initializeTestEnvironment({
    projectId: 'demo-stock',
    firestore: {
      rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8'),
      host: '127.0.0.1',
      // 8280 by default, and pinned to firebase.json by
      // apps/web/src/lib/domain/ports.test.ts — this file cannot read it.
      port: Number(process.env.FIRESTORE_EMULATOR_PORT ?? 8280),
    },
  })
}

/** A household document that satisfies validHousehold(). */
export function householdDoc(memberIds: string[]) {
  const members: Record<string, { displayName: string }> = {}
  for (const uid of memberIds) members[uid] = { displayName: uid }
  return {
    name: 'Casa',
    timezone: 'Australia/Sydney',
    currency: 'AUD',
    memberIds,
    members,
    locations: { heladera: { name: 'Heladera', icon: '🧊', sortOrder: 10 } },
    categories: {
      almacen: { name: 'Almacén', icon: '🥫', color: '#B08968', kind: 'food', sortOrder: 50 },
    },
    planConfig: { length: 'weekly', startWeekday: 6 },
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}

/** Writes straight past the rules, for tests that start mid-story. */
export async function seedDoc(env: RulesTestEnvironment, path: string, data: object) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore() as unknown as Firestore
    await setDoc(doc(db, path), data)
  })
}

export async function seedHousehold(env: RulesTestEnvironment, memberIds: string[] = [ALICE]) {
  await seedDoc(env, `households/${HID}`, householdDoc(memberIds))
}

/**
 * The rules demand `createdAt == request.time`, which only a server timestamp
 * can satisfy — a client-side Date is exactly what they are there to reject.
 */
export function countedItem(updatedBy: string, overrides: Record<string, unknown> = {}) {
  return {
    name: 'Huevos',
    categoryId: 'almacen',
    locationId: 'heladera',
    tracking: 'quantity',
    unit: 'unit',
    quantity: 6,
    minQuantity: 6,
    barcodes: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    updatedBy,
    ...overrides,
  }
}

export function levelItem(updatedBy: string, overrides: Record<string, unknown> = {}) {
  return {
    name: 'Aceite',
    categoryId: 'almacen',
    locationId: 'heladera',
    tracking: 'level',
    level: 2,
    minLevel: 1,
    barcodes: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    updatedBy,
    ...overrides,
  }
}

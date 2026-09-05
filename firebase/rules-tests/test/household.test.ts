import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Firestore,
} from 'firebase/firestore'
import { ALICE, BOB, CAROL, HID, householdDoc, makeTestEnv, seedDoc, seedHousehold } from './helpers'

let env: RulesTestEnvironment

const db = (uid: string | null) =>
  (uid === null
    ? env.unauthenticatedContext().firestore()
    : env.authenticatedContext(uid).firestore()) as unknown as Firestore

beforeAll(async () => {
  env = await makeTestEnv()
})
afterAll(async () => env?.cleanup())
beforeEach(async () => env.clearFirestore())

describe('households: creation', () => {
  it('a signed-in user creates a household with themselves as the only member', async () => {
    await assertSucceeds(
      setDoc(doc(db(ALICE), 'households', HID), {
        ...householdDoc([ALICE]),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    )
  })

  it('the name is capped, and cannot be empty', async () => {
    // Untested until now, which is how a cap in the rules quietly stops being
    // one: nothing in the app can type 61 characters, so nothing would have
    // noticed it going away. The rules are the only boundary — an unbounded
    // string on the ONE document every listener on both clients holds open is
    // the whole reason the cap is there.
    const named = (name: string) => ({
      ...householdDoc([ALICE]),
      name,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })

    await assertSucceeds(setDoc(doc(db(ALICE), 'households', HID), named('x'.repeat(60))))
    await assertFails(setDoc(doc(db(ALICE), 'households', 'h2'), named('x'.repeat(61))))
    await assertFails(setDoc(doc(db(ALICE), 'households', 'h3'), named('')))
  })

  it('cannot create a household you are not in', async () => {
    await assertFails(
      setDoc(doc(db(ALICE), 'households', HID), {
        ...householdDoc([BOB]),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    )
  })

  it('cannot pre-load a household with two members to dodge the join flow', async () => {
    await assertFails(
      setDoc(doc(db(ALICE), 'households', HID), {
        ...householdDoc([ALICE, BOB]),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    )
  })

  it('caps the maps every listener holds open', async () => {
    // The household doc is the one document BOTH clients keep a live listener
    // on, so an unbounded map here degrades every screen rather than one.
    //
    // Only the passing side is asserted, and that is deliberate. Above roughly
    // this size the rules ENGINE refuses the write with an evaluation error
    // rather than the rule returning false — measured: with the cap raised to
    // 31 a 31-entry map still fails, reporting "evaluation error at L138". So a
    // test asserting that 31 is rejected would pass for a reason that has
    // nothing to do with this cap, which is worse than not testing it. The cap
    // stays as the documented, intentional limit; the engine happens to agree.
    const many = (n: number) =>
      Object.fromEntries(
        Array.from({ length: n }, (_, i) => [
          `c${i}`,
          { name: `C${i}`, icon: '🥫', color: '#B08968', kind: 'food', sortOrder: i },
        ]),
      )
    await assertSucceeds(
      setDoc(doc(db(ALICE), 'households', HID), {
        ...householdDoc([ALICE]),
        categories: many(30),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    )
  })

  it('rejects a bogus plan config', async () => {
    await assertFails(
      setDoc(doc(db(ALICE), 'households', HID), {
        ...householdDoc([ALICE]),
        planConfig: { length: 'monthly', startWeekday: 6 },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    )
    await assertFails(
      setDoc(doc(db(ALICE), 'households', HID), {
        ...householdDoc([ALICE]),
        planConfig: { length: 'weekly', startWeekday: 9 },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    )
  })

  it('signed-out users cannot create anything', async () => {
    await assertFails(
      setDoc(doc(db(null), 'households', HID), {
        ...householdDoc([ALICE]),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    )
  })
})

describe('households: reading', () => {
  beforeEach(() => seedHousehold(env, [ALICE]))

  it('a member reads their household', async () => {
    await assertSucceeds(getDoc(doc(db(ALICE), 'households', HID)))
  })

  it('a stranger cannot', async () => {
    await assertFails(getDoc(doc(db(CAROL), 'households', HID)))
  })

  it('nobody can enumerate households', async () => {
    await assertFails(getDocs(collection(db(ALICE), 'households')))
  })
})

describe('households: editing', () => {
  beforeEach(() => seedHousehold(env, [ALICE, BOB]))

  it('a member edits the config', async () => {
    await assertSucceeds(
      updateDoc(doc(db(BOB), 'households', HID), {
        name: 'Casa nueva',
        'planConfig.length': 'fortnightly',
        updatedAt: serverTimestamp(),
      }),
    )
  })

  it('a member cannot remove the other member', async () => {
    await assertFails(
      updateDoc(doc(db(ALICE), 'households', HID), {
        memberIds: [ALICE],
        updatedAt: serverTimestamp(),
      }),
    )
  })

  it('a member cannot backdate updatedAt', async () => {
    await assertFails(
      updateDoc(doc(db(ALICE), 'households', HID), { name: 'X', updatedAt: new Date(0) }),
    )
  })

  it('a stranger cannot edit', async () => {
    await assertFails(
      updateDoc(doc(db(CAROL), 'households', HID), { name: 'X', updatedAt: serverTimestamp() }),
    )
  })

  it('nobody deletes a household from a client', async () => {
    const { deleteDoc } = await import('firebase/firestore')
    await assertFails(deleteDoc(doc(db(ALICE), 'households', HID)))
  })
})

// The one piece of novel security design in the project: a `where inviteCode ==`
// query cannot be secured, so the code is the document id and joining is a
// self-add update fenced by its own rule.
describe('invite flow, end to end', () => {
  const CODE = 'abcdef1234'

  beforeEach(async () => {
    await seedHousehold(env, [ALICE])
  })

  it('a member creates an invite, a stranger reads it, joins, and the household is then full', async () => {
    // 1. Alice creates the invite.
    await assertSucceeds(
      setDoc(doc(db(ALICE), 'invites', CODE), {
        householdId: HID,
        createdBy: ALICE,
        createdAt: serverTimestamp(),
      }),
    )

    // 2. Bob, not a member yet, may READ it — knowing the code is the capability.
    const snap = await assertSucceeds(getDoc(doc(db(BOB), 'invites', CODE)))
    expect(snap.data()?.householdId).toBe(HID)

    // 3. Bob adds himself, touching only membership.
    await assertSucceeds(
      updateDoc(doc(db(BOB), 'households', HID), {
        memberIds: [ALICE, BOB],
        [`members.${BOB}`]: { displayName: 'Bob' },
        updatedAt: serverTimestamp(),
      }),
    )

    // 4. He can now read the household like any member.
    await assertSucceeds(getDoc(doc(db(BOB), 'households', HID)))

    // 5. And the cap holds: Carol cannot become a third member.
    await assertFails(
      updateDoc(doc(db(CAROL), 'households', HID), {
        memberIds: [ALICE, BOB, CAROL],
        [`members.${CAROL}`]: { displayName: 'Carol' },
        updatedAt: serverTimestamp(),
      }),
    )
  })

  it('invite codes cannot be enumerated', async () => {
    await seedDoc(env, `invites/${CODE}`, { householdId: HID, createdBy: ALICE, createdAt: new Date() })
    await assertFails(getDocs(collection(db(BOB), 'invites')))
  })

  it('a stranger cannot mint an invite for a household they are not in', async () => {
    await assertFails(
      setDoc(doc(db(CAROL), 'invites', CODE), {
        householdId: HID,
        createdBy: CAROL,
        createdAt: serverTimestamp(),
      }),
    )
  })

  it('invite codes must be long enough to not be guessable', async () => {
    await assertFails(
      setDoc(doc(db(ALICE), 'invites', 'short'), {
        householdId: HID,
        createdBy: ALICE,
        createdAt: serverTimestamp(),
      }),
    )
  })

  it('a member revokes an invite', async () => {
    const { deleteDoc } = await import('firebase/firestore')
    await seedDoc(env, `invites/${CODE}`, { householdId: HID, createdBy: ALICE, createdAt: new Date() })
    await assertFails(deleteDoc(doc(db(CAROL), 'invites', CODE)))
    await assertSucceeds(deleteDoc(doc(db(ALICE), 'invites', CODE)))
  })

  it('joining cannot smuggle in other changes', async () => {
    await assertFails(
      updateDoc(doc(db(BOB), 'households', HID), {
        memberIds: [ALICE, BOB],
        [`members.${BOB}`]: { displayName: 'Bob' },
        name: 'Casa de Bob',
        updatedAt: serverTimestamp(),
      }),
    )
  })

  it('joining cannot add somebody else', async () => {
    await assertFails(
      updateDoc(doc(db(BOB), 'households', HID), {
        memberIds: [ALICE, CAROL],
        [`members.${CAROL}`]: { displayName: 'Carol' },
        updatedAt: serverTimestamp(),
      }),
    )
  })

  it('joining cannot evict the existing member', async () => {
    await assertFails(
      updateDoc(doc(db(BOB), 'households', HID), {
        memberIds: [BOB],
        [`members.${BOB}`]: { displayName: 'Bob' },
        updatedAt: serverTimestamp(),
      }),
    )
  })

  it('a full household rejects a third joiner even with a valid code', async () => {
    await seedHousehold(env, [ALICE, BOB])
    await seedDoc(env, `invites/${CODE}`, { householdId: HID, createdBy: ALICE, createdAt: new Date() })
    await assertFails(
      updateDoc(doc(db(CAROL), 'households', HID), {
        memberIds: [ALICE, BOB, CAROL],
        [`members.${CAROL}`]: { displayName: 'Carol' },
        updatedAt: serverTimestamp(),
      }),
    )
  })
})

describe('users', () => {
  it('a user writes and reads their own profile', async () => {
    await assertSucceeds(
      setDoc(doc(db(ALICE), 'users', ALICE), {
        displayName: 'Alice',
        householdId: HID,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    )
    await assertSucceeds(getDoc(doc(db(ALICE), 'users', ALICE)))
  })

  it('nobody reads or writes somebody else’s profile', async () => {
    await seedDoc(env, `users/${ALICE}`, { displayName: 'Alice', createdAt: new Date(), updatedAt: new Date() })
    await assertFails(getDoc(doc(db(BOB), 'users', ALICE)))
    await assertFails(
      setDoc(doc(db(BOB), 'users', ALICE), {
        displayName: 'hijacked',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    )
  })
})

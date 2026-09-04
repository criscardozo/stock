'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { collection, doc, onSnapshot, query } from 'firebase/firestore'
import { db } from './client'
import { useAuth } from './auth'
import { todayIn, periodStartFor, type IsoDate } from '@/lib/domain/dates'
import { suggestions, type Suggestion } from '@/lib/domain/suggestions'
import type { Household, Item, MealPlan, Recipe, ShoppingEntry } from '@/lib/domain/types'

interface HouseholdState {
  ready: boolean
  householdId: string | null
  household: Household | null
  items: Item[]
  itemsById: Map<string, Item>
  recipes: Recipe[]
  list: ShoppingEntry[]
  plan: MealPlan | null
  planStart: IsoDate | null
  today: IsoDate
  suggestions: Suggestion[]
  /**
   * A READ that failed, in the user's words. Null when everything is being
   * heard from. Worth surfacing because an empty collection and an unread one
   * render identically: with this null and no items, the screen truthfully says
   * the house is empty; with it set, it must not.
   */
  loadError: string | null
  /**
   * A WRITE the server REFUSED, in the user's words. Never set by being
   * offline — Firestore queues those and sends them later — so anything here
   * means the change the user just made is saved nowhere while the screen shows
   * it as applied. Cleared by dismissing it.
   */
  writeError: string | null
  /** Dismisses the write error. */
  clearWriteError: () => void
  /**
   * Hands a mutation's promise somewhere it can be heard.
   *
   * The UI must NOT await these: Firestore only resolves a write once the
   * server acknowledges it, so awaiting freezes the screen while the data is
   * already saved locally, and the second tap that follows is how you end up
   * with two of everything. Not awaiting and not catching are different things
   * — this catches without waiting.
   */
  reportWrite: (promise: Promise<unknown>) => void
}

const Ctx = createContext<HouseholdState | null>(null)

const DEFAULT_TZ = 'Australia/Sydney'

type Subscribe<T> = (
  scope: string,
  set: (value: T) => void,
  fail: (error: Error) => void,
) => () => void

/**
 * A listener whose data belongs to a scope (a household, a period). Holding the
 * scope alongside the value means switching scope shows `empty` immediately,
 * without an effect that resets state — which would be a cascading render, and
 * would briefly show one household's data under another's id.
 */
function useScoped<T>(
  scope: string | null,
  subscribe: Subscribe<T>,
  empty: T,
  fail: (error: Error) => void,
): T {
  const [state, setState] = useState<{ scope: string | null; value: T }>({
    scope: null,
    value: empty,
  })

  useEffect(() => {
    if (!scope) return
    // Returning the unsubscribe is not optional: StrictMode's double mount
    // duplicating onSnapshot is the classic way to burn the free tier. Passing
    // `fail` is the other half of the same job: a listener that dies without
    // saying so leaves this hook holding `empty` forever, which every screen
    // then renders as "there is nothing here".
    return subscribe(scope, (value) => setState({ scope, value }), fail)
  }, [scope, subscribe, fail])

  return state.scope === scope ? state.value : empty
}

const NO_ITEMS: Item[] = []
const NO_RECIPES: Recipe[] = []
const NO_LIST: ShoppingEntry[] = []

// Module-level so their identity is stable across renders.
const subscribeUserHousehold: Subscribe<string | null> = (uid, set, fail) =>
  onSnapshot(
    doc(db(), 'users', uid),
    (snap) => set((snap.data()?.householdId as string) ?? null),
    fail,
  )

const subscribeHousehold: Subscribe<Household | null> = (hid, set, fail) =>
  onSnapshot(
    doc(db(), 'households', hid),
    (snap) => set(snap.exists() ? ({ id: snap.id, ...snap.data() } as Household) : null),
    fail,
  )

const subscribeItems: Subscribe<Item[]> = (hid, set, fail) =>
  onSnapshot(
    query(collection(db(), 'households', hid, 'items')),
    (snap) => set(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Item)),
    fail,
  )

const subscribeRecipes: Subscribe<Recipe[]> = (hid, set, fail) =>
  onSnapshot(
    query(collection(db(), 'households', hid, 'recipes')),
    (snap) => set(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Recipe)),
    fail,
  )

/**
 * The one listener that asks for metadata changes: a tick made without signal
 * has to be able to say so. Metadata events are local — they cost callbacks,
 * not reads.
 */
const subscribeList: Subscribe<ShoppingEntry[]> = (hid, set, fail) =>
  onSnapshot(
    query(collection(db(), 'households', hid, 'shoppingList')),
    { includeMetadataChanges: true },
    (snap) =>
      set(
        snap.docs.map(
          (d) =>
            ({
              id: d.id,
              ...d.data(),
              pending: d.metadata.hasPendingWrites,
            }) as ShoppingEntry,
        ),
      ),
    fail,
  )

/** Scope is `householdId|startDate`, so changing either resubscribes. */
const subscribePlan: Subscribe<MealPlan | null> = (scope, set, fail) => {
  const [hid, startDate] = scope.split('|')
  return onSnapshot(
    doc(db(), 'households', hid, 'mealPlans', startDate),
    (snap) => set(snap.exists() ? ({ id: snap.id, ...snap.data() } as MealPlan) : null),
    fail,
  )
}

/**
 * One provider holding every live listener in the app. All of them are bounded
 * collections — the catalogue (~150 docs), the list (~30), the recipes, and a
 * single plan document. `moves` is deliberately absent: it grows forever, so it
 * is only ever read with getDocs + limit().
 */
export function HouseholdProvider({ children }: { children: ReactNode }) {
  const { user, ready: authReady } = useAuth()

  // One error for all six listeners, the same shape the iOS Store uses: which
  // one failed matters far less than the fact that what you are looking at is
  // incomplete. Stable identity because it goes into the subscribe effects.
  const [loadError, setLoadError] = useState<string | null>(null)
  const fail = useCallback((error: Error) => setLoadError(error.message), [])

  const [writeError, setWriteError] = useState<string | null>(null)
  const clearWriteError = useCallback(() => setWriteError(null), [])
  const reportWrite = useCallback((promise: Promise<unknown>) => {
    void promise.catch((error: unknown) =>
      setWriteError(error instanceof Error ? error.message : 'No se pudo guardar'),
    )
  }, [])

  // `households.memberIds` is the authorisation source of truth; this field is
  // just how a client finds which household to open.
  const householdId = useScoped<string | null>(
    user?.uid ?? null,
    subscribeUserHousehold,
    null,
    fail,
  )
  const household = useScoped<Household | null>(householdId, subscribeHousehold, null, fail)
  const items = useScoped<Item[]>(householdId, subscribeItems, NO_ITEMS, fail)
  const recipes = useScoped<Recipe[]>(householdId, subscribeRecipes, NO_RECIPES, fail)
  const list = useScoped<ShoppingEntry[]>(householdId, subscribeList, NO_LIST, fail)

  // Midnight in the HOUSEHOLD's timezone should roll the plan over without a
  // reload; a minute of lag beats a day of drift.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])

  const timezone = household?.timezone ?? DEFAULT_TZ
  const today = useMemo(() => todayIn(timezone, new Date(now)), [timezone, now])

  const planStart = useMemo(
    () => (household ? periodStartFor(today, household.planConfig.startWeekday) : null),
    [household, today],
  )

  const plan = useScoped<MealPlan | null>(
    householdId && planStart ? `${householdId}|${planStart}` : null,
    subscribePlan,
    null,
    fail,
  )

  const value = useMemo<HouseholdState>(
    () => ({
      // `user && !householdId` is a real state (not yet in a household), so
      // readiness cannot wait for the household to exist.
      ready: authReady,
      householdId,
      household,
      items,
      itemsById: new Map(items.map((i) => [i.id, i])),
      recipes,
      list,
      plan,
      planStart,
      today,
      loadError,
      writeError,
      clearWriteError,
      reportWrite,
      suggestions: suggestions({
        today,
        items,
        plan,
        recipes,
        listItemIds: list.map((e) => e.itemId).filter((id): id is string => !!id),
      }),
    }),
    [
      authReady,
      householdId,
      household,
      items,
      recipes,
      list,
      plan,
      planStart,
      today,
      loadError,
      writeError,
      clearWriteError,
      reportWrite,
    ],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useHousehold(): HouseholdState {
  const value = useContext(Ctx)
  if (!value) throw new Error('useHousehold outside HouseholdProvider')
  return value
}

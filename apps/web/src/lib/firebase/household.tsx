'use client'

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
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
}

const Ctx = createContext<HouseholdState | null>(null)

const DEFAULT_TZ = 'Australia/Sydney'

type Subscribe<T> = (scope: string, set: (value: T) => void) => () => void

/**
 * A listener whose data belongs to a scope (a household, a period). Holding the
 * scope alongside the value means switching scope shows `empty` immediately,
 * without an effect that resets state — which would be a cascading render, and
 * would briefly show one household's data under another's id.
 */
function useScoped<T>(scope: string | null, subscribe: Subscribe<T>, empty: T): T {
  const [state, setState] = useState<{ scope: string | null; value: T }>({
    scope: null,
    value: empty,
  })

  useEffect(() => {
    if (!scope) return
    // Returning the unsubscribe is not optional: StrictMode's double mount
    // duplicating onSnapshot is the classic way to burn the free tier.
    return subscribe(scope, (value) => setState({ scope, value }))
  }, [scope, subscribe])

  return state.scope === scope ? state.value : empty
}

const NO_ITEMS: Item[] = []
const NO_RECIPES: Recipe[] = []
const NO_LIST: ShoppingEntry[] = []

// Module-level so their identity is stable across renders.
const subscribeUserHousehold: Subscribe<string | null> = (uid, set) =>
  onSnapshot(doc(db(), 'users', uid), (snap) => set((snap.data()?.householdId as string) ?? null))

const subscribeHousehold: Subscribe<Household | null> = (hid, set) =>
  onSnapshot(doc(db(), 'households', hid), (snap) =>
    set(snap.exists() ? ({ id: snap.id, ...snap.data() } as Household) : null),
  )

const subscribeItems: Subscribe<Item[]> = (hid, set) =>
  onSnapshot(query(collection(db(), 'households', hid, 'items')), (snap) =>
    set(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Item)),
  )

const subscribeRecipes: Subscribe<Recipe[]> = (hid, set) =>
  onSnapshot(query(collection(db(), 'households', hid, 'recipes')), (snap) =>
    set(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Recipe)),
  )

const subscribeList: Subscribe<ShoppingEntry[]> = (hid, set) =>
  onSnapshot(query(collection(db(), 'households', hid, 'shoppingList')), (snap) =>
    set(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ShoppingEntry)),
  )

/** Scope is `householdId|startDate`, so changing either resubscribes. */
const subscribePlan: Subscribe<MealPlan | null> = (scope, set) => {
  const [hid, startDate] = scope.split('|')
  return onSnapshot(doc(db(), 'households', hid, 'mealPlans', startDate), (snap) =>
    set(snap.exists() ? ({ id: snap.id, ...snap.data() } as MealPlan) : null),
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

  // `households.memberIds` is the authorisation source of truth; this field is
  // just how a client finds which household to open.
  const householdId = useScoped<string | null>(user?.uid ?? null, subscribeUserHousehold, null)
  const household = useScoped<Household | null>(householdId, subscribeHousehold, null)
  const items = useScoped<Item[]>(householdId, subscribeItems, NO_ITEMS)
  const recipes = useScoped<Recipe[]>(householdId, subscribeRecipes, NO_RECIPES)
  const list = useScoped<ShoppingEntry[]>(householdId, subscribeList, NO_LIST)

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
      suggestions: suggestions({
        today,
        items,
        plan,
        recipes,
        listItemIds: list.map((e) => e.itemId).filter((id): id is string => !!id),
      }),
    }),
    [authReady, householdId, household, items, recipes, list, plan, planStart, today],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useHousehold(): HouseholdState {
  const value = useContext(Ctx)
  if (!value) throw new Error('useHousehold outside HouseholdProvider')
  return value
}

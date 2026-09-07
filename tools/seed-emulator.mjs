/**
 * Fills the local emulators with a household that looks like a real one, so
 * screens can be driven and LOOKED AT rather than reasoned about.
 *
 *   pnpm emulators           # in one terminal
 *   pnpm seed                # in another
 *   NEXT_PUBLIC_USE_EMULATORS=1 pnpm dev
 *
 * Then sign in with the "Emulador" buttons on the login screen (they only exist
 * when the app is pointed at the emulators).
 *
 * Firestore is written through the rules-testing harness with rules DISABLED —
 * seeding is not a client, and making it satisfy every rule would only test the
 * seed script.
 */
import { readFileSync } from 'node:fs'
import { initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, setDoc } from 'firebase/firestore'

const PROJECT = 'demo-stock'
// Ports are overridable, and the defaults are not the stock ones — see
// firebase/firebase.json for why.
const AUTH_PORT = process.env.AUTH_EMULATOR_PORT ?? '9280'
const FIRESTORE_PORT = Number(process.env.FIRESTORE_EMULATOR_PORT ?? 8280)
const AUTH = `http://127.0.0.1:${AUTH_PORT}/identitytoolkit.googleapis.com/v1`
const PASSWORD = 'emulator-only'

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'))
const categories = read('../shared/categories.json').categories
const locations = read('../shared/locations.json').locations

const PEOPLE = [
  { email: 'cristian@example.com', displayName: 'Cristian' },
  { email: 'meli@example.com', displayName: 'Meli' },
]

/** The emulator accepts any password and returns a stable uid per email. */
async function ensureAccount({ email, displayName }) {
  const body = { email, password: PASSWORD, displayName, returnSecureToken: true }
  for (const action of ['accounts:signUp', 'accounts:signInWithPassword']) {
    let response
    try {
      response = await fetch(`${AUTH}/${action}?key=fake-api-key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    } catch {
      // A bare "fetch failed" here is always the same thing, and saying so
      // beats making the next person read this file to find out.
      throw new Error(`No hay nadie en 127.0.0.1:${AUTH_PORT} — arrancá \`pnpm emulators\` primero.`)
    }
    if (response.ok) return (await response.json()).localId
  }
  throw new Error(`No pude crear ni entrar como ${email} — ¿el emulador de Auth está sano?`)
}

function keyById(rows) {
  return Object.fromEntries(rows.map(({ id, ...rest }) => [id, rest]))
}

// Dates are calendar strings in the household's zone, exactly like the app.
const todayIn = (timeZone) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const get = (type) => parts.find((p) => p.type === type).value
  return `${get('year')}-${get('month')}-${get('day')}`
}

const addDays = (date, days) => {
  const [y, m, d] = date.split('-').map(Number)
  const next = new Date(Date.UTC(y, m - 1, d + days))
  return next.toISOString().slice(0, 10)
}

const weekdayOf = (date) => {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

const TZ = 'Australia/Sydney'
const today = todayIn(TZ)
const planStart = addDays(today, -((weekdayOf(today) - 6 + 7) % 7))

const item = (id, name, categoryId, locationId, rest) => ({
  id,
  data: {
    name,
    categoryId,
    locationId,
    barcodes: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    updatedBy: 'seed',
    ...rest,
  },
})

const counted = (unit, quantity, minQuantity, extra = {}) => ({
  tracking: 'quantity',
  unit,
  quantity,
  minQuantity,
  ...extra,
})
const levelled = (level, minLevel = 1) => ({ tracking: 'level', level, minLevel })

const ITEMS = [
  item('espinacas', 'Bolsa de espinacas', 'frutas-verduras', 'heladera', counted('unit', 0, 1, { brand: 'Baby', packSize: '200 g' })),
  item('frutillas', 'Frutillas', 'frutas-verduras', 'heladera', counted('unit', 1, 1, { packSize: 'Caja 250 g', expiresAt: addDays(today, 1) })),
  item('kiwis', 'Kiwis', 'frutas-verduras', 'heladera', counted('unit', 4, 4)),
  item('papas', 'Papas', 'frutas-verduras', 'alacena', { ...levelled(2), packSize: 'Granel' }),
  item('cebolla', 'Cebolla', 'frutas-verduras', 'alacena', counted('unit', 3, 2)),
  item('carne-picada', 'Carne picada', 'carniceria', 'freezer', counted('g', 1500, 500, { brand: 'Especial' })),
  item('pollo', 'Patas de pollo', 'carniceria', 'freezer', counted('unit', 0, 4, { packSize: 'Bandeja' })),
  item('milanesas', 'Milanesas', 'carniceria', 'freezer', counted('unit', 6, 4, { brand: 'De carne' })),
  item('salmon', 'Salmón', 'pescaderia', 'freezer', counted('unit', 2, 0, { packSize: 'Filete · 2×180 g', expiresAt: addDays(today, 44) })),
  item('huevos', 'Huevos', 'lacteos-huevos', 'heladera', counted('unit', 3, 6, { packSize: 'Maple × 12' })),
  item('queso-crema', 'Queso crema', 'lacteos-huevos', 'heladera', counted('unit', 1, 1, { packSize: 'Pote 290 g', expiresAt: addDays(today, -1) })),
  item('queso-rallado', 'Queso rallado', 'lacteos-huevos', 'heladera', { ...levelled(1), packSize: 'Granel' }),
  item('manteca', 'Manteca', 'lacteos-huevos', 'heladera', counted('g', 200, 100)),
  item('leche-soja', 'Leche de soja', 'lacteos-huevos', 'heladera', counted('unit', 1, 2)),
  item('arroz', 'Arroz largo fino', 'almacen', 'alacena', counted('g', 2000, 1000)),
  item('fideos', 'Fideos spaghetti', 'almacen', 'alacena', counted('unit', 3, 2, { packSize: '500 g' })),
  item('aceite', 'Aceite de oliva', 'almacen', 'alacena', levelled(2)),
  item('sal', 'Sal fina', 'condimentos', 'alacena', levelled(3)),
  item('ajo-polvo', 'Ajo en polvo', 'condimentos', 'alacena', levelled(3)),
  // Catalogue only, and empty: the case the flag exists for. It has to stay
  // visible in stock and stay OFF the shopping list.
  item('curry-verde', 'Pasta de curry verde', 'condimentos', 'alacena', {
    ...counted('unit', 0, 0),
    autoSuggest: false,
    nameEs: 'Curry verde',
    packSize: 'Pote 114 g',
  }),
  item('salsa-tacos', 'Salsa de tacos', 'almacen', 'alacena', counted('unit', 0, 1)),
  item('leche-coco', 'Leche de coco', 'almacen', 'alacena', counted('unit', 1, 1, { packSize: 'Lata 400 ml' })),
  item('yerba', 'Yerba', 'desayuno', 'alacena', counted('g', 500, 250, { snoozedUntil: addDays(today, 6) })),
  // The reserve case, as it actually is under the sink: half a bottle in use
  // and one sealed left of the two we keep — so it is already on the list.
  item('detergente', 'Detergente', 'limpieza', 'lavadero', {
    ...levelled(2),
    spare: 1,
    minSpare: 2,
  }),
  item('papel-higienico', 'Papel higiénico', 'papel', 'lavadero', counted('unit', 8, 4)),
]

const RECIPES = [
  {
    id: 'pastel-de-papa',
    data: {
      title: 'Pastel de papa',
      servings: 4,
      tags: ['horno', 'carne'],
      steps: 'Hervir las papas en agua con sal, 20 min. Pisar con la manteca.\nRehogar la cebolla, sumar la carne picada y el ajo en polvo.\nArmar en fuente: carne abajo, puré arriba, queso rallado.\nHorno fuerte 25 min hasta que gratine.',
      ingredients: [
        { label: 'Carne picada', itemId: 'carne-picada', quantity: 2000, unit: 'g', optional: false },
        { label: 'Papas', itemId: 'papas', optional: false },
        { label: 'Manteca', itemId: 'manteca', quantity: 100, unit: 'g', optional: false },
        { label: 'Queso rallado', itemId: 'queso-rallado', optional: false },
        { label: 'Ajo en polvo', itemId: 'ajo-polvo', optional: false },
        { label: 'Cebolla, sal y pimienta', optional: false },
      ],
      timesCooked: 12,
      lastCookedAt: addDays(today, -14),
    },
  },
  {
    id: 'milanesas',
    data: {
      title: 'Milanesas',
      servings: 4,
      tags: ['rápida'],
      steps: 'Pasar por huevo y pan rallado. Horno 20 min por lado.',
      ingredients: [
        { label: 'Milanesas de carne', itemId: 'milanesas', quantity: 4, unit: 'unit', optional: false },
        { label: 'Huevos', itemId: 'huevos', quantity: 6, unit: 'unit', optional: false },
        { label: 'Queso rallado', itemId: 'queso-rallado', optional: true },
      ],
      timesCooked: 21,
      lastCookedAt: addDays(today, -6),
    },
  },
  {
    id: 'arroz-con-pollo',
    data: {
      title: 'Arroz con pollo',
      servings: 4,
      tags: ['una olla'],
      steps: 'Dorar el pollo, sumar el arroz y el caldo. 18 min tapado.',
      ingredients: [
        { label: 'Patas de pollo', itemId: 'pollo', quantity: 4, unit: 'unit', optional: false },
        { label: 'Arroz', itemId: 'arroz', quantity: 400, unit: 'g', optional: false },
        { label: 'Cebolla', itemId: 'cebolla', quantity: 1, unit: 'unit', optional: false },
      ],
      timesCooked: 7,
    },
  },
  {
    id: 'comida-thai',
    data: {
      title: 'Comida thai',
      servings: 2,
      tags: ['wok', 'picante'],
      steps: 'Wok a fuego fuerte: pollo, curry, leche de coco. Espinacas al final.',
      ingredients: [
        { label: 'Leche de coco', itemId: 'leche-coco', quantity: 2, unit: 'unit', optional: false },
        { label: 'Bolsa de espinacas', itemId: 'espinacas', quantity: 1, unit: 'unit', optional: false },
        { label: 'Pasta de curry rojo', optional: false },
      ],
      timesCooked: 4,
    },
  },
  {
    id: 'salmon-al-horno',
    data: {
      title: 'Salmón al horno',
      servings: 2,
      tags: ['rápida'],
      steps: 'Papel manteca, limón, 12 min a 200°.',
      ingredients: [
        { label: 'Salmón', itemId: 'salmon', quantity: 2, unit: 'unit', optional: false },
        { label: 'Papas', itemId: 'papas', optional: false },
      ],
      timesCooked: 3,
    },
  },
]

const plan = {
  startDate: planStart,
  endDate: addDays(planStart, 13),
  length: 'fortnightly',
  days: {
    [planStart]: { recipeId: 'milanesas', status: 'cooked', cookedAt: planStart },
    [addDays(planStart, 1)]: { recipeId: 'pastel-de-papa', status: 'planned' },
    [addDays(planStart, 2)]: { label: 'Sobras', status: 'planned' },
    [addDays(planStart, 3)]: { recipeId: 'arroz-con-pollo', status: 'planned' },
    [addDays(planStart, 4)]: { recipeId: 'comida-thai', status: 'planned' },
    [addDays(planStart, 5)]: { recipeId: 'milanesas', status: 'planned' },
    [addDays(planStart, 7)]: { label: 'Afuera', status: 'planned' },
    [addDays(planStart, 10)]: { recipeId: 'salmon-al-horno', status: 'planned' },
  },
  createdAt: new Date(),
  updatedAt: new Date(),
}

const HOUSEHOLD_ID = 'casa-cardozo'

async function main() {
  const uids = []
  for (const person of PEOPLE) uids.push(await ensureAccount(person))

  const env = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: { host: '127.0.0.1', port: FIRESTORE_PORT },
  })
  await env.clearFirestore()

  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    const write = (path, data) => setDoc(doc(db, path), data)

    await write(`households/${HOUSEHOLD_ID}`, {
      name: 'Casa Cardozo',
      timezone: TZ,
      currency: 'AUD',
      memberIds: uids,
      members: Object.fromEntries(
        uids.map((uid, index) => [uid, { displayName: PEOPLE[index].displayName }]),
      ),
      locations: keyById(locations),
      categories: keyById(categories),
      planConfig: { length: 'fortnightly', startWeekday: 6 },
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    for (const [index, uid] of uids.entries()) {
      await write(`users/${uid}`, {
        displayName: PEOPLE[index].displayName,
        householdId: HOUSEHOLD_ID,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    }

    for (const row of ITEMS) await write(`households/${HOUSEHOLD_ID}/items/${row.id}`, row.data)
    for (const row of RECIPES) {
      await write(`households/${HOUSEHOLD_ID}/recipes/${row.id}`, {
        ...row.data,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    }
    await write(`households/${HOUSEHOLD_ID}/mealPlans/${planStart}`, plan)

    // A list mid-shop: one row already ticked, one added by hand.
    await write(`households/${HOUSEHOLD_ID}/shoppingList/e1`, {
      label: 'Huevos',
      itemId: 'huevos',
      quantity: 9,
      unit: 'unit',
      source: 'min',
      reason: 'quedan 3, mínimo 6 · para Milanesas (jue)',
      checked: false,
      addedAt: new Date(),
      addedBy: uids[0],
    })
    await write(`households/${HOUSEHOLD_ID}/shoppingList/e2`, {
      label: 'Leche de coco',
      itemId: 'leche-coco',
      quantity: 2,
      unit: 'unit',
      source: 'plan',
      reason: 'para Comida thai (mié)',
      checked: true,
      checkedAt: new Date(),
      checkedBy: uids[1],
      addedAt: new Date(),
      addedBy: uids[0],
    })
    await write(`households/${HOUSEHOLD_ID}/shoppingList/e3`, {
      label: 'Servilletas',
      source: 'manual',
      checked: false,
      addedAt: new Date(),
      addedBy: uids[1],
    })
  })

  await env.cleanup()
  console.log(`Listo. Hogar ${HOUSEHOLD_ID} · ${ITEMS.length} ítems · plan desde ${planStart}`)
  console.log(`Usuarios: ${PEOPLE.map((p, i) => `${p.email} (${uids[i]})`).join(', ')}`)
}

main().catch((error) => {
  console.error(error.message ?? error)
  process.exit(1)
})

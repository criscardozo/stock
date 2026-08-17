# Plan: Stock — Inventario de la casa + plan de comidas

## Contexto

Proyecto personal greenfield (presupuesto de infra: **$0**) para saber **qué hay en casa,
cuánto queda y qué hay que comprar**, y para **planificar las comidas** de la semana o la
quincena — que es lo que después decide la lista del súper.

Hogar de **2 personas (Cristian + esposa)**, ambos ven y editan todo. Dos clientes: una app
**iOS (SwiftUI)** para los chequeos parados frente a la heladera y para el súper, y una **web
(Next.js)** para lo que se hace sentado (cargar recetas, armar el plan del viernes), hosteada
en **Vercel Hobby** bajo `stock.cardozo.dev`. Los datos viven en **Firebase (plan Spark
gratuito)**, proyecto propio. Login con **Firebase Auth (Google)**. Código y comentarios en
**inglés**; la UI **solo en español**. Licencia **MIT**.

Decisiones del usuario ya confirmadas:

- **Alcance del stock**: toda la casa — comida, limpieza e higiene. Solo los ítems de comida
  participan de las recetas.
- **Medición híbrida por ítem**: los que se cuentan bien van con cantidad + unidad y mínimo;
  los graneles que nadie pesa van con nivel (`vacío/poco/medio/lleno`).
- **Plan de comidas**: un slot por día (la cena), semanal o quincenal, definido los viernes.
- **Cocinar descuenta el stock con confirmación** — la app propone, el humano ajusta.
- **Lista de compras auto + manual, y repone stock**: marcar comprado pregunta cuánto entró.
- **Reposición determinística**: algo entra a la lista por estar bajo su mínimo o porque lo
  pide el plan. Nada de estimaciones de consumo por ahora.
- **Vencimientos** con notificación **local** de iOS (no hay push de servidor sin Blaze).
- **Escaneo de código de barras** en iOS, con Open Food Facts para autocompletar.
- **Ubicaciones** físicas (heladera / freezer / alacena / …), editables.
- **Precio de referencia opcional** por ítem — informativo, sin totales ni presupuesto: la
  plata la lleva Gastos Diarios.
- **Distribución iOS**: sideload gratuito (firma que expira a los 7 días) + la web como PWA
  instalable, que es la que queda para siempre. La cuenta paga de Apple sigue sin decidirse.
- **Proyecto Firebase propio** (`qcris-stock`), separado de Gastos Diarios.

---

## Decisiones de arquitectura clave

### 1. ¿Hace falta backend? — No.

Ambos clientes hablan **directamente con Firebase** (Auth + Firestore) vía los SDKs oficiales.

- **Las security rules de Firestore son la única frontera de seguridad**, basadas en la
  membresía del hogar.
- El volumen (2 usuarios, ~150 ítems, decenas de escrituras por día) entra holgado en el free
  tier de Spark (50k lecturas / 20k escrituras por día).
- **Cloud Functions requieren plan Blaze → se evitan por completo.**
- Vercel solo hostea la web. No hay rutas serverless en el MVP; queda como vía de escape
  gratuita si alguna vez hace falta un fetch con CORS de por medio (importar recetas por URL,
  que hoy está fuera de alcance).

### 2. Estructura del monorepo

```
/
├── apps/
│   ├── ios/                  # Proyecto Xcode generado con XcodeGen (SwiftUI, SPM)
│   └── web/                  # Next.js App Router + TS + Tailwind (además, PWA)
├── firebase/
│   ├── firestore.rules
│   ├── firestore.indexes.json
│   ├── firebase.json         # incluye configuración del emulador
│   └── rules-tests/          # vitest + @firebase/rules-unit-testing (contra el emulador)
├── shared/
│   ├── schema.md                    # contrato de Firestore — fuente de verdad
│   ├── categories.json              # categorías semilla (key, ícono, color, kind)
│   ├── locations.json               # ubicaciones semilla
│   ├── units.json                   # unidades permitidas y su formateo
│   ├── plan-period-vectors.json     # aritmética del período de planificación
│   └── shopping-vectors.json        # derivación de la lista de compras
├── docs/                     # PLAN.md, reglas.md, setup.md, design/
├── LICENSE                   # MIT
├── README.md
├── package.json              # raíz del workspace pnpm
└── pnpm-workspace.yaml
```

- **Workspaces de pnpm** para el lado JS (web + rules-tests). Sin Turborepo: hay una sola app
  JS.
- Swift y TS no comparten código; el contrato compartido son `schema.md`, los JSON semilla y
  los **vectores de prueba** — la lógica que se implementa dos veces, compartida como datos.
- **Sin librería de gráficos.** Las barras son divs; las líneas, SVG a mano.
- La config de cliente de Firebase es pública por diseño (las rules son la frontera).

### 3. Modelo de datos (Firestore, solo la base `(default)` — el free tier aplica solo a ella)

```
users/{uid}
  displayName, householdId          // conveniencia desnormalizada;
                                    // memberIds del hogar es la fuente de verdad de autorización

households/{householdId}
  name, timezone: "Australia/Sydney", currency: "AUD"
  memberIds: [uid, uid]             // tope duro de 2, forzado en las rules
  locations:  { [id]: { name, icon, sortOrder } }              // heladera, freezer, alacena…
  categories: { [id]: { name, icon, color, kind, sortOrder } } // kind: "food" | "household"
  planConfig: { length: "weekly"|"fortnightly", startWeekday: 6 }  // 6 = sábado (se planifica el viernes)

households/{hid}/items/{itemId}     // el catálogo Y el stock, en un mismo documento
  name, brand?, categoryId, locationId
  tracking: "quantity" | "level"
  unit: "unit" | "g" | "ml"         // solo si tracking == "quantity"
  quantity: int                     // cantidad actual, entera, en `unit`
  minQuantity: int                  // umbral de reposición
  level: 0|1|2|3                    // vacío | poco | medio | lleno   (solo si tracking == "level")
  minLevel: 0|1|2|3                 // default 1 (entra a la lista en "poco")
  packSize?: string                 // "500 g", informativo, viene de Open Food Facts
  barcodes: [string]                // EANs conocidos de este ítem
  expiresAt?: "YYYY-MM-DD"          // el vencimiento que importa (uno solo, ver §5)
  snoozedUntil?: "YYYY-MM-DD"       // "esta vuelta no lo compro"
  lastPriceCents?: int              // precio de referencia, AUD, centavos enteros
  notes?
  updatedAt, updatedBy

households/{hid}/recipes/{recipeId}
  title, servings: int, steps: string, tags: [string]
  ingredients: [ { itemId?, label, quantity?, unit?, optional: bool } ]
  timesCooked: int, lastCookedAt?: "YYYY-MM-DD"
  createdAt, updatedAt

households/{hid}/mealPlans/{startDate}   // ID = "YYYY-MM-DD" del primer día del período
  startDate, endDate: "YYYY-MM-DD"       // rango inclusivo; endDate = startDate + (7|14) - 1
  length: "weekly" | "fortnightly"
  days: { "YYYY-MM-DD": { recipeId?, label?, status: "planned"|"cooked"|"skipped", cookedAt? } }
  createdAt, updatedAt

households/{hid}/shoppingExtras/{id}     // SOLO lo agregado a mano (ver §6)
  label, itemId?, quantity?, unit?, done: bool
  addedBy, addedAt

households/{hid}/moves/{moveId}          // log append-only de movimientos de stock
  itemId, delta: int | levelFrom/levelTo, type: "purchase"|"cook"|"adjust"|"waste"
  recipeId?, planDate?                   // contexto cuando type == "cook"
  at: server timestamp, by: uid

invites/{code}                           // el código ES el ID del documento (crypto-random, 10+ chars)
  householdId, createdBy, createdAt
```

Decisiones incorporadas:

- **Cantidades enteras, siempre.** `quantity` es un entero en la unidad del ítem (`unit`, `g`,
  `ml`). Mismo razonamiento que los centavos: nada de floats que arrastren `0.30000000000004`
  al restar tres veces. "1,2 kg" es formateo de presentación sobre `1200 g`. Para lo que no se
  cuenta en enteros (media sandía) existe el modo `level` — no un decimal.
- **Un ítem, una fila.** El catálogo y el stock son el **mismo documento**: no hay un "producto"
  y aparte una "existencia". Para un hogar de dos, la indirección solo agrega escrituras.
- **Ubicación y categoría van embebidas en el hogar** (maps indexados por id, no arrays: los
  arrays de maps son incómodos de actualizar en Firestore). Un solo listener trae hogar +
  categorías + ubicaciones + miembros en una lectura.
- **Editar/borrar sin dueño**: cualquiera de los dos miembros edita cualquier cosa. `updatedBy`
  es atribución, no propiedad.
- **Los ingredientes linkean al ítem por `itemId`**, y ese link es lo único que permite calcular
  faltantes. Un ingrediente sin `itemId` (sal, condimentos, "un chorrito de vinagre") es texto
  libre: se muestra en la receta y no participa de ningún cálculo. A propósito.
- Índices: consultas por `name` (orden), `categoryId` y `locationId` — índices de campo único,
  automáticos. `moves` necesita `itemId ASC, at DESC` para el historial por ítem.

### 4. Unión por código de invitación — solo con rules, patrón "capability como ID de documento"

Idéntico a Gastos Diarios, y por la misma razón: una query `where inviteCode ==` **no se puede
asegurar** (las rules no ven los valores de las cláusulas `where`).

- El código es el **ID del documento** `invites/{code}`. `get` permitido a cualquier usuario
  autenticado (conocer el código *es* la capability); `list` denegado, para que no se puedan
  enumerar. `create`/`delete` solo para miembros del hogar.
- Unirse = un update de auto-alta en el hogar, con una rule que permite a un no-miembro
  agregarse **solo a sí mismo**, tocando únicamente `memberIds`, y solo mientras
  `memberIds.size() < 2`:

  ```
  allow update: if request.auth != null
    && !(request.auth.uid in resource.data.memberIds)
    && resource.data.memberIds.size() < 2
    && request.resource.data.diff(resource.data).affectedKeys() == ['memberIds'].toSet()
    && request.resource.data.memberIds.toSet()
         == resource.data.memberIds.toSet().union([request.auth.uid].toSet());
  ```

- Acceso al resto: `request.auth.uid in get(.../households/$(hid)).data.memberIds` (el `get()`
  se cachea por request; despreciable a este volumen).

### 5. Estado de un ítem — derivado, nunca guardado

El estado se calcula en el cliente en cada render. Guardarlo obligaría a reescribir documentos
para mantener sincronizado algo que ya es función de los datos.

| Estado | Condición |
|---|---|
| `out` | `quantity == 0` / `level == 0` |
| `low` | `quantity <= minQuantity` / `level <= minLevel` |
| `expired` | `expiresAt < hoy` (en la tz del hogar) |
| `expiring` | `expiresAt <= hoy + 3 días` |
| `ok` | todo lo demás |

**Vencimiento: una sola fecha por ítem.** El modelo correcto sería un libro de lotes (cada
compra con su cantidad y su fecha, consumo FIFO). Para dos personas eso significa tipear una
fecha en cada compra y arrastrar lotes fantasma para siempre. La fecha del ítem representa "el
vencimiento que importa" — el más próximo — y se actualiza cuando reponés. Es una simplificación
consciente, no un olvido.

**Notificaciones de vencimiento**: sin Blaze no hay push programado del servidor. iOS programa
**notificaciones locales** cada vez que la app corre, para los ítems que vencen dentro de los
próximos días; la web solo lo muestra cuando la abrís. Se documenta la limitación en vez de
fingir que hay alertas garantizadas.

### 6. La lista de compras no se guarda — se deriva

Es la decisión de diseño más importante del proyecto después del modelo de ítems.

```
lista = (ítems en `out` o `low`)
      ∪ (faltantes de las comidas planificadas todavía no cocinadas)
      ∪ (shoppingExtras con done == false)
      − (ítems con snoozedUntil >= hoy)
```

Los dos primeros conjuntos salen de datos que el cliente **ya tiene en cache** (el catálogo y el
plan del período). Materializarlos costaría una escritura por ítem cada vez que alguien abre la
pantalla, para reconstruir algo que ya es deducible. Entonces:

- **Solo se escriben los extras manuales** (`shoppingExtras`).
- El estado "ya lo compré" **no existe como campo** para los derivados: marcar comprado abre la
  hoja de reposición, suma la cantidad al ítem y el ítem deja de estar bajo el mínimo — sale de
  la lista por consecuencia, no por un flag.
- "No lo compro esta vuelta" es `snoozedUntil` en el ítem: una sola escritura, con vencimiento
  automático, en lugar de una lista paralela de exclusiones.
- Cada fila muestra **su motivo** (`quedan 2, mínimo 6` · `para Fideos boloñesa, miércoles`).
  Una lista que no explica por qué está pidiendo algo termina ignorada.

**Faltante del plan**: por cada día `planned` con receta, se suman los ingredientes con `itemId`.
Si lo requerido supera lo que hay, el faltante es la diferencia. Los ingredientes de ítems
`level` nunca generan un número: si el ítem está en `poco` o `vacío` y una receta del plan lo
pide, entra a la lista con la comida como motivo. Inventar "250 g de aceite" sería peor que no
decir nada.

**Sin escalado de porciones en el MVP**: la receta se cocina como está. `servings` se guarda
igual para cuando haga falta, pero escalar mete redondeos de unidades enteras que no valen la
complejidad hoy.

### 7. Períodos de planificación

- El período tiene `length` (7 o 14 días) y arranca el `startWeekday` configurado — default
  **sábado**, porque el plan se define el viernes y se compra el fin de semana.
- El doc del plan se crea perezosamente cuando alguien abre la pantalla dentro del rango, con ID
  determinístico (`startDate`), lo que hace la creación idempotente: si ambos clientes la
  disparan a la vez, escriben el mismo doc.
- "Hoy" se calcula **en la timezone del hogar**, no la del dispositivo. Un plan para el miércoles
  es el miércoles en Sídney aunque alguien esté viajando.
- La aritmética (hoy en una tz, inicio del período que contiene una fecha, cadena de días del
  rango, transiciones de DST de Sídney) se implementa dos veces (Swift + TS) y ambas corren
  `shared/plan-period-vectors.json`.
- Cambiar `length` o `startWeekday` afecta **los períodos futuros**; los ya materializados
  conservan sus límites, así el historial no se reescribe.

### 8. Cocinar y comprar son escrituras en batch

Las dos acciones que tocan varios documentos a la vez se hacen con `writeBatch` (atómico, ≤500
operaciones — acá son unidades):

- **Cocinada**: hoja de confirmación con los ingredientes y las cantidades propuestas, cada uno
  editable o desmarcable → batch que actualiza los `items`, escribe un `move` por ítem
  (`type: "cook"`, con `recipeId` y `planDate`), marca el día como `cooked` y suma `timesCooked`
  en la receta.
- **Comprado**: hoja de reposición precargada con la cantidad sugerida, más fecha de
  vencimiento y precio opcionales → batch que suma al ítem, escribe el `move` (`type:
  "purchase"`) y marca el extra como hecho si vino de uno.

Y **no se espera la promesa de la escritura para mover la UI**: Firestore solo la resuelve
cuando confirma el servidor, así que un `await` congela el formulario aunque el dato ya esté
guardado localmente.

### 9. Auth — un proveedor por persona

**Trampa crítica**: entrar con Apple en iOS y con Google en la web crea **dos UIDs distintos**
para la misma persona; con tope de 2 miembros, el segundo UID ni siquiera podría entrar al
hogar.

- **Google Sign-In en ambas plataformas**, para las dos personas. Funciona en una app iOS
  sideloaded y no requiere cuenta paga de Apple.
- **Sign in with Apple** solo si algún día hay distribución por App Store (la guía 4.8 lo
  obliga cuando hay Google sign-in).
- Web: **los dos flujos, según dónde corra**. Se sirve el handler de Firebase **same-origin**
  (rewrite de `/__/auth/*` en `next.config.ts`, con `authDomain` = el host que sirve), y con eso
  funcionan popup en una pestaña y `signInWithRedirect` en la PWA instalada, donde el handshake
  de un popup hacia una ventana standalone no es confiable. Cada dominio nuevo exige
  whitelistear `https://<dominio>/__/auth/handler` — ver `setup.md`.

### 10. Higiene del free tier de Firestore

- **El catálogo se escucha entero, y está bien**: son ~150 documentos acotados por naturaleza
  (lo que una casa tiene). En frío son ~150 lecturas; después los snapshots facturan solo los
  docs que cambian, y con persistencia offline las recargas salen del cache.
- **`moves` crece para siempre** ⇒ nunca un listener: se lee con `getDocs` + `limit(20)` en el
  historial del ítem.
- Persistencia offline en ambos clientes (`persistentLocalCache` con multi-tab en web; default en
  iOS). El súper es exactamente donde no hay señal.
- En React, **siempre devolver el unsubscribe desde el `useEffect`** — el doble montaje de
  StrictMode duplicando `onSnapshot` es la forma clásica de quemar el free tier.

### 11. Escaneo de códigos de barras

- iOS: `DataScannerViewController` (VisionKit) para EAN-13/EAN-8. Sin dependencias externas.
- El código se busca **primero en el catálogo del hogar** (`barcodes` array-contains): la segunda
  vez que escaneás la leche, es tu ítem, con tu nombre y tu mínimo.
- Si no está, se consulta **Open Food Facts** (`world.openfoodfacts.org/api/v2/product/{ean}.json`,
  gratis, sin API key, con User-Agent propio) para precargar nombre, marca y tamaño del alta.
- Si tampoco está ahí, se crea el ítem a mano y **el código se guarda igual** — a partir de ahí
  lo reconoce el catálogo propio. La API externa es una comodidad, nunca un requisito: la app
  funciona entera sin ella.
- Es **solo iOS**: escanear desde la web implicaría cámara en el navegador y CORS, para un caso
  de uso (parado frente a la alacena) que es del teléfono.

---

## Resumen del stack

| Pieza | Elección |
|---|---|
| iOS | SwiftUI, iOS 17+, MVVM con `@Observable`, Firebase iOS SDK vía SPM, persistencia offline, VisionKit (escaneo), UserNotifications locales (vencimientos), WidgetKit |
| Web | Next.js (App Router) + TypeScript, Tailwind CSS, Firebase JS SDK (solo cliente, `onSnapshot`), **PWA** instalable con service worker propio. Sin librería de gráficos |
| Datos | Firebase Auth (Google) + Cloud Firestore plan Spark, proyecto `qcris-stock`; rules e índices versionados en `firebase/` |
| Datos de producto | Open Food Facts (gratis, sin API key), solo para precargar altas por código de barras |
| Hosting | Vercel Hobby (`stock.cardozo.dev`), config de Firebase en variables de entorno |
| Testing | `@firebase/rules-unit-testing` + emulador (vitest); vectores compartidos corridos por vitest y XCTest; Playwright E2E contra emuladores; CI en GitHub Actions solo Ubuntu |

**Nota de arquitectura web**: totalmente renderizada en el cliente detrás de un shell estático.
Todos los datos son del hogar, en tiempo real y detrás de auth — SSR no aporta nada y el estado
de Firebase Auth vive en el navegador. El gating de rutas en el cliente es cosmético; **las rules
son la frontera**. Inicializar Firebase solo en componentes cliente y esperar la resolución de
`onAuthStateChanged` para evitar el flash de "deslogueado".

---

## Fases de implementación

### Fase 0 — Fundaciones (quemar el riesgo primero)

Scaffold del repo con la estructura de arriba, `LICENSE` (MIT), `.gitignore` (Xcode + Node),
este plan, `shared/schema.md` y los JSON semilla (categorías, ubicaciones, unidades), y los
vectores de `plan-period` y `shopping`. **`firestore.rules` completas + tests de rules en el
emulador cubriendo el flujo de invitación de punta a punta** (crear hogar → crear invitación →
segundo usuario se auto-agrega → tercero denegado → acceso de no-miembros denegado) y la
validación de forma de `items` (tracking coherente con los campos presentes).

*Salida: tests de rules en verde — el único riesgo de diseño novedoso retirado antes de que
exista UI.*

### Fase 1 — MVP Web: stock y lista

Auth con Google, alta/unión de hogar, CRUD de ítems con los dos modos de medición, ubicaciones
y categorías, pantalla **Stock** con búsqueda y filtros, pantalla **Falta comprar** derivada (por
ahora solo mínimos + extras manuales), hoja de reposición, `moves`, deploy en Vercel + dominio.

*Salida: la casa se puede inventariar de verdad y la lista del súper ya sirve.* Web primero
porque valida modelo y rules sin la fricción de firma de Xcode — aunque el uso principal después
sea el teléfono.

### Fase 2 — Recetas y plan de comidas

CRUD de recetas con ingredientes linkeados a ítems, semáforo de disponibilidad, pantalla **Plan**
(un slot por día, semanal/quincenal), marcar cocinada con la hoja de descuento, y la lista de
compras completa (mínimos **+ faltantes del plan**), con su motivo por fila. Lógica de períodos
en TS contra los vectores compartidos.

*Salida: el ciclo completo del viernes — planeo, veo qué falta, compro, cocino, el stock baja.*

### Fase 3 — App iOS

App SwiftUI, Google Sign-In, **Stock** con ajuste rápido, **Falta comprar** en modo supermercado,
**Hoy**, recetas en modo lectura, persistencia offline, lógica de períodos y de lista en Swift
contra los mismos vectores, escaneo de códigos de barras con Open Food Facts, notificaciones
locales de vencimiento. Sideload a ambos teléfonos.

### Fase 4 — Pulido

PWA instalable (service worker, manifest, safe areas), widget de "qué se cocina hoy",
estados vacíos y de error, historial de movimientos por ítem, snooze, gestión de categorías y
ubicaciones, base de layout adaptativo para iPad.

### Fase 5 — Distribución (punto de decisión)

O Apple Developer Program pago → TestFlight (agrega Sign in with Apple y privacy manifest), o
workflow de sideload semanal documentado. Se difiere hasta que la app se pruebe a sí misma.

---

## Verificación

- **Rules**: tests unitarios en el emulador — aislamiento por membresía, camino feliz de
  invitación, denegación del tercer usuario, chequeo del diff de auto-alta, validación de forma
  de `items` y `mealPlans`.
- **Lógica duplicada**: vitest (TS) + XCTest (Swift) contra los vectores compartidos —
  `plan-period-vectors.json` (hoy en una tz, DST de Sídney, semanal ↔ quincenal, día de inicio
  configurable) y `shopping-vectors.json` (mínimos, faltantes del plan, ítems de nivel, snooze,
  extras).
- **Web**: `pnpm typecheck && pnpm lint && pnpm build`; E2E con Playwright contra el emulator
  suite; preview deploy en Vercel.
- **iOS**: build + `xcodebuild test` en simulador, local (no hay CI de iOS: los runners de macOS
  facturan 10×).
- **De punta a punta**: crear hogar en la web → unirse desde iOS con el código → planear la
  semana en la web → ver el faltante en el teléfono → tildar en el súper sin señal → reconectar
  → el stock aparece actualizado en la web → cocinar y ver bajar las cantidades.

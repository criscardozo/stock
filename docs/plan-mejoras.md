# Plan de mejoras — septiembre 2026

Análisis del proyecto entero hecho el 04/09/2026, **midiendo cada afirmación**
en vez de recordarla. Cada tarea trae la evidencia que la justifica, los archivos
que toca y **cómo verificar que quedó bien** — que en este repo significa: exit
codes y no líneas de texto, mutación para probar que un test muerde, y mirar el
servidor antes que la pantalla. Leé `docs/reglas.md` antes de empezar; las
trampas de esta semana están ahí y todas aplican.

Convenciones que este plan asume y no repite en cada tarea:

- **Vectores primero.** Lógica de dominio implementada dos veces (TS + Swift)
  cambia primero en `shared/*.json`, se ve fallar en las dos, y después se
  implementa.
- **Nunca `Co-Authored-By` ni trailer de Claude** en los commits. Mensajes en
  inglés australiano.
- **$0.** Nada que cueste plata. CI sólo Ubuntu (macOS factura 10x). Sin Cloud
  Functions, sin Blaze.
- **Código y comentarios en inglés, UI en español.**
- **`xcodebuild ... | grep` devuelve el exit code de grep.** Capturá el estado
  antes de cualquier pipe. Usá el esquema `StockTests` para el loop de tests.
- **Instalar en el teléfono es `tools/install-ios.sh`**, nunca a mano.
- Para verificar un arreglo negativo, **la prueba tiene que fallar donde creés**
  — mirá el punto exacto, no sólo el exit distinto de cero.

Prioridad: P0 son bugs con consecuencia para el usuario. P1 es robustez y
cobertura. P2 accesibilidad. P3 producto prometido y no hecho. P4 higiene.

---

## Estado

Ejecutado el 04/09/2026 en esta rama. Lo hecho lleva su commit; lo que queda
sigue con la evidencia y la verificación tal como se escribieron.

| Tarea | Estado |
| --- | --- |
| 0.1 canal de error de escritura (web) | hecho |
| 0.2 tope de notificaciones (iOS) | hecho |
| 0.3 atomicidad de `closeShopping` | hecho |
| 1.1 backup | hecho |
| 1.2 Dependabot | hecho, sin bloque `swift` — ver la tarea |
| 1.3 E2E de `/plan`, `/recetas`, `/ajustes` | pendiente |
| 1.4 tests de módulos que cargan peso | hecho |
| 1.5 topes de tamaño en reglas | hecho, con una salvedad medida — ver la tarea |
| 2.1 Dynamic Type y etiquetas (iOS) | pendiente |
| 2.2 movimiento y foco (web) | pendiente |
| 3.1 / 3.2 / 3.3 producto | pendiente, cada una necesita decidirse antes |
| 4.1 audit | hecho |
| 4.2 CI | hecho |
| 4.3 `error.tsx` | pendiente |
| 4.4 cabeceras de seguridad | pendiente |
| 4.5 código muerto en iOS | pendiente |
| 4.6 tamaño del bundle | pendiente |

Dos cosas que salieron de ejecutarlo y valen más que las tareas mismas:

- **`format.test.ts` no podía fallar.** Las aserciones sobre zona horaria
  pasaban en esta máquina (`Australia/Sydney`, +10) hicieras lo que hicieras con
  el código. Hace falta `Pacific/Kiritimati` (+14) y `Pacific/Honolulu` (−10)
  para acorralarlo; está medido en la cabecera de `format.timezone.test.ts`.
- **Un detector de fallos mal escrito reportó los 11 tests como caídos en las
  seis mutaciones**, porque matcheaba las líneas de ejecución y no las de error.
  Antes de creerle a una sonda, corrésela contra el árbol limpio y exigí que
  diga cero.

---

## P0 — Bugs reales

### 0.1 · Web: una escritura rechazada no se lo dice a nadie

**Evidencia.** 17 llamadas a mutaciones descartan la promesa y hay **cero**
canal de error para escrituras en la web:

```
app/plan/page.tsx:184,196,200,217   setPlanDay / markCooked
app/recetas/page.tsx:141,165,176    addToList / updateRecipe / deleteRecipe
app/stock/page.tsx:110,115,239      updateItem / createItem / deleteItem
app/falta-comprar/page.tsx:190,213,268,311   addToList / addManyToList / snoozeItem / closeShopping
app/ajustes/page.tsx:67,105,316     updateHousehold ×2 / applyReceipt
```

`closeShopping` y `applyReceipt` están en la lista: las dos operaciones con más
consecuencias de la app. Si una regla las rechaza, la caché local muestra la
compra cerrada y el servidor no tiene nada. **Es el mismo bug que se arregló en
iOS esta semana (`969d486`) y que se le reportó a Gastos Diarios; nadie miró la
web de Stock.** La lectura sí está cubierta (`loadError` + banda en `AppShell`);
la escritura no.

**No es** hacer `await`: el comentario de `nuevo/page.tsx` de Gastos explica por
qué esperar congela el form offline. No esperar y no capturar son cosas
distintas.

**Cómo.**
1. En `apps/web/src/lib/firebase/household.tsx`, agregar `writeError: string |
   null` al `HouseholdState` y un `reportWrite(promise)` que haga
   `promise.catch((e) => setWriteError(e.message))` y devuelva la promesa.
2. Reemplazar cada llamada descartada por `reportWrite(mutation(...))`. Las 17.
3. Mostrar `writeError` en `AppShell` como **alert/dialog**, no banda: la
   pantalla está mostrando algo que no existe en el servidor. Un botón
   "Entendido" que lo limpia. Distinto de `loadError`, que es banda, y el
   comentario tiene que decir por qué (ver `RootView.swift` de iOS, que ya lo
   dice).
4. Offline NO debe disparar: Firestore encola. Sólo llega acá un rechazo real.

**Verificar.** Con el emulador arriba, cargar por REST reglas que nieguen
escritura (`PUT /emulator/v1/projects/demo-stock:securityRules`, ver cómo se hizo
en la sesión para `items`), tildar una fila en `/falta-comprar`, y un e2e que
asevere que aparece el alert. Restaurar las reglas reales y aseverar que **no**
aparece. Las dos direcciones. Sin la segunda, no está verificado.

### 0.2 · iOS: las notificaciones de vencimiento no respetan el tope de 64

**Evidencia.** `apps/ios/Stock/Data/ExpiryNotifications.swift` borra las
pendientes con su prefijo y programa **una por ítem con vencimiento**, sin
límite. iOS acepta como máximo 64 notificaciones pendientes por app y descarta
el resto **en silencio**. Con un catálogo de ~150 ítems donde muchos tienen
fecha, las que se pierden son arbitrarias — y podrían ser las que vencen mañana.

**Cómo.** Ordenar por `expiresAt` ascendente y `prefix(60)` (dejar margen).
Mover la selección a `Stock/Domain/` (función pura: `[Item] → [Item]`) para que
`StockTests` la compile — hoy `ExpiryNotifications.swift` está en `Data/` y no
entra al target de tests. El `try? await center.add(...)` de la línea 61 pasa a
loguear con el `Logger` que ya existe en `Mutations.swift`: una notificación que
no se pudo programar es información.

**Verificar.** Test con 80 ítems: salen 60, los 60 de vencimiento más cercano,
y el orden es estable. Mutar `prefix(60)` → `prefix(64)` debe fallar.

### 0.3 · `closeShopping` se documenta como atómico y no lo es

**Evidencia.** `CLAUDE.md`: *"Cooking and buying are `writeBatch` operations
(items + moves + plan/recipe in one atomic write)"*. Pero
`mutations.ts:529 inBatches` corta en `perBatch = 100` y hace `await
batch.commit()` **en secuencia**: con más de 100 compras, si el segundo batch
falla el primero ya está commiteado. Una lista de compras real no llega a 100
filas, así que hoy no muerde — pero la afirmación es falsa y alguien va a
apoyarse en ella.

**Cómo.** Firestore permite 500 operaciones por batch. Cada compra escribe
hasta 3 (item, move, delete de fila) → 166 compras caben en un batch. Elegir
una: (a) **un solo batch**, con `perBatch` en 166 y un error explícito si hay
más ("La lista es demasiado larga para cerrarla de una vez"), o (b) documentar
en `CLAUDE.md` y `schema.md` que la atomicidad vale hasta 100. Recomiendo (a):
es lo que el diseño prometió.

**Verificar.** Test unitario sobre `inBatches` con 170 filas → falla antes de
escribir nada. Con 166 → un solo commit (contar llamadas con un spy).

---

## P1 — Robustez y cobertura

### 1.1 · No hay backup

**Evidencia.** `grep backup package.json` → nada. `.github/workflows/` tiene
sólo `ci.yml`. **Todo el catálogo, las recetas y el plan del hogar viven en un
solo proyecto Firebase sin ninguna copia.** Gastos Diarios tiene `pnpm backup`
corriendo los jueves en Actions (Ubuntu, gratis) y guardando el dump como
artifact de 90 días, porque el export gestionado de Firestore necesita Blaze.

**Cómo.** Portar `scripts/backup.mjs` y `.github/workflows/backup.yml` de
`/Users/cristian/dev/personal/gastos-diarios` (mismo stack, misma restricción).
Necesita una service account con rol lector de Firestore como secret
`FIREBASE_SERVICE_ACCOUNT` en GitHub. Documentar en `docs/setup.md §8` (ya
existe el encabezado, está vacío de contenido real). `backups/` ya está en
`.gitignore`.

**Verificar.** Correr el script contra producción una vez a mano y contar
documentos en el dump contra `households/casa-cardozo` — tienen que coincidir.
Después `gh workflow run backup.yml` y comprobar que el artifact existe. No dar
por hecho que corre porque el YAML es válido.

### 1.2 · No hay Dependabot

**Evidencia.** `.github/dependabot.yml` no existe. Gastos lo tiene y es lo que
le trajo `firebase 12.18.0` limpio dos días después, sin la entrada de bypass de
cuarentena que Stock sí se comió (`e0f1f22`). Además de mantener alineados los
dos repos sin que alguien tenga que acordarse.

**Cómo.** Copiar el de Gastos y adaptar: ecosistemas `npm` (root, con
`versioning-strategy: increase`), `github-actions`, y `swift` para
`apps/ios/` (Dependabot soporta SPM). Agrupar los `@firebase/*` en un solo PR.
Semanal, lunes.

**Verificar.** El primer PR de Dependabot que llegue tiene que pasar el CI sin
tocar nada. Si `pnpm install --frozen-lockfile` falla en ese PR, el
`versioning-strategy` está mal.

### 1.3 · E2E: tres de cinco pantallas sin cobertura

**Evidencia.** `apps/web/e2e/shopping.spec.ts` cubre `/stock` y
`/falta-comprar`. **`/plan`, `/recetas` y `/ajustes` no tienen ningún e2e.**
Los flujos sin cubrir incluyen dos batches: `markCooked` (descuenta stock +
sube `timesCooked` + marca el día) y el alta de receta con `shortName` y su
validación de unicidad (que vive sólo en el editor, porque las reglas no pueden
comparar hermanos).

**Cómo.** Un spec por pantalla, en el mismo estilo del existente: selectores
por rol y `aria-label`, controles independientes del orden de ejecución (los
specs comparten el hogar sembrado — leer el comentario sobre `Servilletas`).
Mínimo:
- `recipes.spec.ts`: crear receta con nombre corto; intentar otra con el mismo
  nombre corto → el botón queda deshabilitado y aparece el mensaje.
- `plan.spec.ts`: asignar una receta a un día; marcarla cocinada; **leer el
  número** de stock del ingrediente después (no la ausencia de algo).
- `settings.spec.ts`: cambiar `planConfig.length` y ver que el rango del plan
  cambia de 7 a 14 días.

**Verificar.** Cada aserción, por mutación: romper el batch de `markCooked` y
ver caer el test **en la aserción del número**, no en otra.

### 1.4 · Tests que faltan en módulos que cargan peso

**Evidencia.** Sin test propio:
- web `domain/items.ts` — `stockStatus`, **la derivación central del producto**.
  Está cubierta indirectamente por los vectores de sugerencias, pero un cambio
  en `expiryStatus` no lo vería nadie.
- web `domain/quantities.ts` — `formatQuantity` escala 1200 g → "1,2 kg". Un
  error acá se ve en cada fila.
- web `receipts/pdf.ts` — `layoutPage` reconstruye columnas por coordenadas.
  Se verificó a mano contra `pdftotext` (10 y 32 líneas idénticas) pero no hay
  fixture automatizado; un cambio en pdfjs lo rompe en silencio.
- iOS `Data/Firestore+Decoding.swift` — **decodifica todos los documentos.** Un
  campo mal leído hace que `compactMap` descarte el doc sin ruido. No entra a
  `StockTests` porque importa Firebase; extraer la lógica pura (dict → Item) a
  `Domain/` para que sí.

**Cómo.** Tests unitarios directos. Para `pdf.ts`, guardar dos PDFs de Coles
como fixtures (uno online, uno de local) y aseverar las líneas exactas. Para el
decoder de iOS, un test por tipo con un diccionario mínimo y otro con todos los
opcionales.

**Verificar.** Mutación en cada uno. Para `stockStatus`, cambiar `<=` por `<`
en el umbral de `low` debe fallar.

### 1.5 · Cinco campos sin tope de tamaño en las reglas

**Evidencia.** Las reglas acotan todo — `name ≤80`, `barcodes ≤20`,
`ingredients ≤60`, `days ≤14` — salvo: `tags` (recipes), `notes` (items),
`steps` (recipes), y los mapas `categories` y `locations` del hogar. Un
documento de hogar con `categories` desbocado degrada **a todos los listeners**
de los dos clientes, porque ese doc lo escuchan todos.

**Cómo.** `tags.size() <= 20`, `notes.size() <= 500`, `steps.size() <= 5000`,
`categories.size() <= 40`, `locations.size() <= 20`. Cada uno con su test en
`firebase/rules-tests/` (dos casos: en el límite pasa, uno más falla). Reflejar
en `schema.md`.

**Verificar.** `pnpm test:rules` con exit 0, y la mutación de quitar un tope
debe hacer caer exactamente su test.

---

## P2 — Accesibilidad

### 2.1 · iOS es inutilizable con texto grande

**Evidencia.** 103 usos de `.stock(N)` con tamaño fijo, **0** usos de
`@ScaledMetric` o `relativeTo:`, **1** `accessibilityLabel` en toda la app,
**0** `accessibilityHint`/`Value`. Una persona con "Texto más grande" activado
ve la app exactamente igual. Los steppers, el dial de nivel y los tildes son
botones con ícono y sin nombre para VoiceOver.

**Cómo.**
1. En `Design/Theme.swift`, que `.stock(size, weight)` use `Font.custom(_:
   size:, relativeTo:)` con el `TextStyle` más cercano (12→.caption, 15→.body,
   18→.title3). Es un cambio en un lugar; las 103 llamadas no se tocan.
2. `accessibilityLabel` en: `Stepper` (nombre del ítem, como se hizo en la web
   esta semana — `"Restar Huevos"`), `LevelDial` (nombre + nivel actual), el
   tilde de la lista (`"Tildar Huevos"`), `HueBadge` (`accessibilityHidden`, es
   decorativo).
3. `accessibilityValue` en el stepper con la cantidad formateada.

**Verificar.** Simulador con `Settings → Accessibility → Larger Text` al
máximo: las filas tienen que seguir legibles sin cortar texto. Y el
Accessibility Inspector de Xcode sobre la pantalla de Stock: cero controles sin
etiqueta.

### 2.2 · Web: movimiento y foco

**Evidencia.** 18 `aria-label`, 8 `role=`, 0 `prefers-reduced-motion`, 2 estilos
de foco. El `animate-pulse` del mark de carga ignora la preferencia de
movimiento reducido. Los controles custom con `role="checkbox"` (tildes de la
lista, filas del import de calendario) no tienen `focus-visible` propio.

**Cómo.** `motion-reduce:animate-none` en el mark. Clase de foco compartida
para los botones-checkbox en `primitives.tsx`. Recorrer con Tab las tres
pantallas y anotar dónde se pierde el foco.

**Verificar.** Lighthouse accesibilidad ≥ 95 en `/stock` y `/falta-comprar`
(hoy no se midió — medirlo primero para tener el número de partida).

---

## P3 — Producto prometido en Fase 4 y no hecho

### 3.1 · Widget "qué se cocina hoy"

**Evidencia.** `CLAUDE.md` y `docs/PLAN.md` Fase 4 lo nombran. `project.yml` no
tiene target de widget. Es la pieza de Fase 4 con más valor visible: la cena de
hoy en la pantalla de inicio, sin abrir nada.

**Cómo.** Target `StockWidget` (WidgetKit) que lee un snapshot escrito por la
app en un App Group — el patrón exacto de `GastosDiariosWidget/BudgetSnapshot`.
El snapshot lo escribe `Store` cuando cambia `todaysRecipe`. Timeline de una
entrada por día. **Ojo:** un target más es un **tercer perfil de firma**;
`tools/install-ios.sh` ya busca `PlugIns/*.appex`, y `SigningExpiry` ya lee
todos los perfiles del bundle, así que no hay que tocarlos — pero verificar que
el script reporta tres.

**Verificar.** El widget muestra la receta del día del seed en el simulador.
`tools/install-ios.sh` lista tres perfiles con la misma fecha.

### 3.2 · Historial de movimientos por ítem

**Evidencia.** `mutations.ts:243 recentMoves()` existe, acotado y con su
índice — y **ninguna pantalla lo llama**, en ninguna plataforma. La colección
`moves` se escribe en cada compra, cocción y ajuste, y nadie la lee.

**Cómo.** En `ItemSheet.tsx` (web), una sección "Últimos movimientos" con los 20
más recientes: fecha, tipo (compra/cocina/ajuste), delta, quién. En iOS lo
mismo en el sheet de edición. Es una lectura `getDocs` con `limit(20)`, nunca un
listener — la regla del CLAUDE.md.

**Verificar.** Después de un `Cerrar compra` en el e2e, el historial del ítem
muestra el movimiento con el delta correcto.

### 3.3 · Confirmar qué existe de "gestión de categorías y ubicaciones"

**Evidencia.** `ajustes/page.tsx` menciona `categories` una vez. No se verificó
si es un editor o sólo lectura. La Fase 4 promete gestión.

**Cómo.** Leer `ajustes/page.tsx`. Si no hay editor: agregar/renombrar/reordenar
categorías y ubicaciones, con el tope de 1.5 respetado en el cliente. Si lo
hay: marcar la línea del PLAN como hecha.

---

## P4 — Higiene

### 4.1 · Audit: 4 *high* en `fast-uri`

**Evidencia.** `pnpm audit` → 9 (5 moderate, 4 high). Los 4 high son el mismo
paquete, `fast-uri < 3.1.6`, por `firebase-tools → @modelcontextprotocol/sdk →
ajv`. Dev-only, no alcanzable en runtime. Igual: cuatro *high* en el audit son
ruido que tapa el próximo real.

**Cómo.** En `pnpm-workspace.yaml`, `overrides: { fast-uri: ">=3.1.6" }` con
un comentario que diga por qué y hasta cuándo (hasta que firebase-tools lo
suba). **Después verificar que pnpm no haya escrito ningún
`minimumReleaseAgeExclude`** — diff del archivo antes y después.

**Verificar.** `pnpm audit` baja a 5 moderate. Lockfile con un solo cambio.

### 4.2 · CI sin `concurrency`, sin `timeout-minutes`, sin caché de browsers

**Evidencia.** `ci.yml` tiene `cache: pnpm` y nada más. Dos pushes rápidos
corren dos veces (los minutos son compartidos con Gastos). Un emulador colgado
corre hasta el máximo de 6 h. Playwright descarga ~95 MB de Chromium en cada
corrida, en dos jobs.

**Cómo.**
```yaml
concurrency: { group: ci-${{ github.ref }}, cancel-in-progress: true }
```
`timeout-minutes: 15` en cada job. `actions/cache` sobre `~/.cache/ms-playwright`
con key del lockfile. **Sin interpolar nada del evento en `run:`** — el
workflow hoy tiene cero `${{ }}` y conviene que siga así salvo el `github.ref`
de arriba.

**Verificar.** Dos pushes seguidos: el primero se cancela. Duración del job web
baja (medir antes y después con `gh run view`).

### 4.3 · Web sin `error.tsx`

**Evidencia.** No existe `app/error.tsx` ni `global-error.tsx`. Un crash de
render muestra la pantalla por defecto de Next, en inglés.

**Cómo.** `app/error.tsx` mínimo, en español, con el mark y un botón
"Reintentar" que llame a `reset()`. Que **no** trague el error: `console.error`
en `useEffect`.

### 4.4 · Cabeceras de seguridad

**Evidencia.** `next.config.ts` no define `headers()`. Sin
`X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`.

**Cómo.** Las tres, en `headers()`. CSP **no** — Firebase Auth y Google Identity
Services necesitan `unsafe-inline` y varios orígenes, y una CSP a medias rompe
el login en Safari; documentar en el mismo `headers()` por qué se omite.

**Verificar.** `curl -sI https://stock.cardozo.dev/stock | grep -i x-content`.

### 4.5 · Código muerto y errores tragados en iOS

**Evidencia.** `Mutations.ensurePlan` no se llama desde ningún lado (iOS
consume el plan que crea la web; es diseño, pero el código muerto confunde).
16 `try?`: la mayoría son best-effort legítimos (`SigningExpiry`, `WatchSync`),
pero `ExpiryNotifications.swift:61` traga un fallo al programar (ver 0.2) y
`ScannerScreen.swift:227` traga el fallo de Open Food Facts sin distinguir
"sin red" de "producto desconocido" — el usuario ve lo mismo en los dos casos.

**Cómo.** Borrar `ensurePlan` de iOS con un comentario en `Store.attachPlan`
diciendo que el plan lo materializa la web. En el scanner, distinguir los dos
casos en el texto del sheet manual ("no hay conexión" vs "no está en la base").

### 4.6 · Tamaño del bundle

**Evidencia.** 1,8 MB de JS estático; el chunk más grande (647 KB) es Firebase
(firestore + auth). `pdfjs-dist` está bien: importado dinámicamente, en su
propio chunk de 419 KB que sólo baja quien importa un ticket.

**Cómo.** No hay acción barata: Firestore con listeners necesita el SDK
completo. Medir first-load real con Lighthouse en 4G y decidir si vale la
pena. Anotar el número de partida en este archivo.

---

## Lo que está bien y no hay que tocar

Dicho para que nadie lo "arregle":

- **Reglas de Firestore.** Cobertura completa de las 8 colecciones, `hasOnly`
  en todas, `allow list: if false` en `households` e `invites`, timestamps de
  servidor obligatorios, 63 tests. Es el único límite de seguridad y está bien.
- **Sin secretos en el repo.** Ningún `.env` trackeado. La `apiKey` web de
  Firebase en `config.ts` es pública por diseño (las reglas son el límite, no
  la key). `GoogleService-Info.plist` idem.
- **Cero `any`, cero `catch {}` vacíos, cero `console.*` tragando.** Un solo
  force unwrap en iOS y es una URL literal.
- **`schema.md` ↔ reglas en sincronía.** Se comparó campo por campo; el primer
  resultado del script dio tres campos "faltantes" en `shoppingList` y era la
  regex leyendo sólo el primer backtick de filas compuestas. Verificado a mano:
  están.
- **Lecturas acotadas.** `recentMoves` es `getDocs` + `orderBy` + `limit(20)`
  con su índice, el único compuesto y el único necesario. Ningún `getDocs` sin
  `limit`.
- **PWA.** Verificada y con precacheo de assets arreglado esta semana
  (`2c32216`); `pnpm verify:pwa` contra producción da 5/5.
- **Vectores compartidos.** 36 casos + 6 grupos, con guarda de conjunto en las
  dos plataformas para que un grupo nuevo no pase en silencio (`b2f68dd`).
- **Firebase iOS 12.18.0.** Verificado corriendo, con la evidencia y lo que no
  se sabe escritos por separado al lado del pin en `project.yml`. No revertir
  por el revert de Gastos: su disparador (seed dentro de la app) no existe acá.

---

## Orden sugerido

1. **0.1** (medio día) — es el bug con más consecuencia y el más fácil de
   verificar en las dos direcciones.
2. **1.1** (dos horas) — cero copias de los datos es lo más grave que no es un
   bug.
3. **0.2, 0.3, 1.5** (una tarde entre los tres) — chicos, con test cada uno.
4. **1.2, 4.1, 4.2** (una hora) — higiene de repo, sin tocar producto.
5. **1.3, 1.4** (un día) — cobertura. Después de esto, las próximas features
   tienen red.
6. **2.1** (medio día) — el cambio de `Theme.swift` es una línea; las etiquetas
   son la mayor parte.
7. **3.x** — producto, cada una con su conversación previa con Cristian.
8. **4.3–4.6** — cuando sobre.

Cada tarea termina con `pnpm typecheck && pnpm lint && pnpm test:web && pnpm
build`, `pnpm test:rules`, `pnpm test:e2e` (con emuladores y seed), y los 20 de
iOS por el esquema `StockTests` — **con exit codes, no leyendo la salida**. Y
un commit por tarea, sin trailers de Claude.

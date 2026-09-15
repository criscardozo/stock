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
| 1.3 E2E de `/plan`, `/recetas`, `/ajustes` | hecho |
| 1.4 tests de módulos que cargan peso | hecho |
| 1.5 topes de tamaño en reglas | hecho; la «salvedad medida» era falsa — ver la corrección |
| 2.1 Dynamic Type y etiquetas (iOS) | hecho — y destapó que la app **nunca usó Outfit** |
| 2.2 movimiento y foco (web) | hecho — Lighthouse a11y **100** en las cinco pantallas (partida: 93) |
| 3.1 widget «qué se cocina hoy» | hecho |
| 3.2 historial de movimientos | hecho, web e iOS |
| 3.3 gestión de categorías y ubicaciones | hecho — eran **sólo lectura**, no había mutación en todo el repo |
| 4.1 audit | hecho |
| 4.2 CI | hecho |
| 4.3 `error.tsx` | hecho |
| 4.4 cabeceras de seguridad | hecho, sin CSP — ver la tarea |
| 4.5 código muerto en iOS | hecho |
| 4.6 tamaño del bundle | medido, sin acción — ver abajo |

Escribir los e2e de 1.3 destapó tres bugs que ninguna lectura había
encontrado, porque los tres se ven como una pantalla normal:

- **«Dejarlo sin plan» dejaba la app en blanco.** Escribía un `null` literal
  bajo la clave del día. La web reventaba calculando sugerencias; iOS perdía
  **la quincena entera** en silencio, porque el cast del mapa falla completo si
  un valor es NSNull. Arreglado en la escritura y en ambas lecturas: los docs
  ya escritos siguen ahí.
- **El dial de nivel nunca podía llenarse.** Cuatro segmentos para una escala
  de cuatro valores (0–3) con `step <= level`: «lleno» dejaba el dial corto, y
  el cuarto segmento se llamaba «Poner en undefined». En las dos plataformas.
- **Controles que sólo el color distinguía.** Los tres segmentados de Ajustes
  sin `aria-pressed`, y seis botones «Cocinada» idénticos en el plan. No es
  sólo accesibilidad: es lo que hacía imposible escribir el test.

Dos cosas que salieron de ejecutarlo y valen más que las tareas mismas:

- **`format.test.ts` no podía fallar.** Las aserciones sobre zona horaria
  pasaban en esta máquina (`Australia/Sydney`, +10) hicieras lo que hicieras con
  el código. Hace falta `Pacific/Kiritimati` (+14) y `Pacific/Honolulu` (−10)
  para acorralarlo; está medido en la cabecera de `format.timezone.test.ts`.
- **Un detector de fallos mal escrito reportó los 11 tests como caídos en las
  seis mutaciones**, porque matcheaba las líneas de ejecución y no las de error.
  Antes de creerle a una sonda, corrésela contra el árbol limpio y exigí que
  diga cero.
- **Los emuladores de Stock y de Gastos Diarios no pueden convivir**: los dos
  reclaman Auth 9099 y UI 4000. Los puertos son configurables en los tres lados
  (`client.ts`, `seed-emulator.mjs`, `StockApp.swift`), así que se levanta el
  suite con un config alternativo en vez de matar el del otro proyecto:
  `firebase emulators:start --only auth,firestore --config <alt>.json` y después
  `AUTH_EMULATOR_PORT=… FIRESTORE_EMULATOR_PORT=… pnpm seed` y
  `NEXT_PUBLIC_AUTH_EMULATOR_PORT=… pnpm test:e2e`. **Resuelto de raíz el
  5/9/2026:** los puertos de Stock se movieron a un bloque propio (el que esté
  en `firebase/firebase.json`, hoy 9280/8280/4280), así que los dos emuladores
  conviven sin overrides.

## Números de partida (05/09/2026)

Medidos con Lighthouse contra un build de producción servido en 3113.

| | |
| --- | --- |
| Accesibilidad, las cinco pantallas | **100** (era 93 en `/stock`) |
| Performance en `/stock` (4G simulado) | **78** |
| FCP / LCP / TBT / TTI | 2,1 s · 5,4 s · 60 ms · 3,6 s |
| JS estático | 1,8 MB en 21 archivos |
| Chunk más grande | 652 KB (Firebase: firestore + auth) |
| Segundo | 420 KB (`pdfjs-dist`, dinámico — sólo baja quien importa un ticket) |
| Peso total de la página | 3.063 KB |
| JS sin usar | 220 KB |

**4.6 queda sin acción, y el experimento está hecho (06/09/2026).** El LCP de
5,4 s es feo, pero el chunk grande es Firestore con listeners y no se recorta sin
cambiar la arquitectura.

Lo único barato que quedaba era diferir `firebase/auth`, y ahora está **medido**
en vez de estimado: build con `firebase/auth` aliaseado a un stub vacío
(`turbopack.resolveAlias` — Next 16 rechaza una config de webpack).

| | con auth | sin auth |
| --- | --- | --- |
| JS estático total | 1.828 KB | **1.744 KB** |
| Chunk mayor | 652 KB | 568 KB |

**84 KB**, o sea 4,6 % del total. Ése es el techo del ahorro, y el precio sería
el parpadeo de «deslogueado» en cada carga que `AppShell` evita a propósito. No
vale la pena: 84 KB no mueven un LCP de 5,4 s a nada que se note, y el costo es
visible en cada arranque.

## Un caso de vector puede pasar por el guard equivocado (06/09/2026)

Método de Gastos Diarios otra vez: apagar cada condición de a una y clasificar
qué la atrapa. Sobre los 8 guards de exclusión de `suggestions.ts`, siete tienen
red. El octavo —`ingredient.optional || !ingredient.itemId`— no la tenía, **y
había dos casos que decían cubrirlo**:

- `optional ingredients never create a shortfall`
- `free-text ingredients (no itemId) are invisible to the engine`

Los dos pasan con el guard apagado. Nombre correcto, resultado correcto, y
probando otra cosa: el del queso trae `quantity: 100` contra una receta que pide
exactamente 100, así que lo excluye el chequeo de stock más abajo.

Es el peligro propio de un caso **negativo**: un caso que espera "no sugerido"
puede recibir ese "no" de cualquiera de los guards del camino, y el orden decide
cuál. Los positivos no lo tienen, porque hay una sola forma de dar el resultado
correcto.

Cerrado como **vector** y no como test por plataforma —un hueco en el contrato es
un hueco en los dos clientes— con el caso construido para que el flag sea lo
único que decide: corto por la mitad de un ingrediente opcional. Verificado
cayendo en las dos.

Y la otra mitad del guard **no** era un hueco: `demand` sólo se lee por
`demand.get(item.id)`, así que una entrada con clave `undefined` nunca se
recupera. Mutante equivalente, anotado como tal en el código para que el próximo
que mute esa línea no lo reporte como falta de test.

De paso: el lado Swift asertaba el conteo de casos del vector para que un archivo
que dejara de cargarse no pasara en silencio, y su comentario decía «mantenelo
igual al lado TypeScript» — que no lo tenía. Ahora sí.

## Constantes escritas dos veces, sostenidas por un comentario (06/09/2026)

De Gastos Diarios: ir a leer **todos los comentarios que invocan a la otra
plataforma** y comprobar si detrás hay un mecanismo o sólo una oración. Ellos
encontraron una ventana de 48 horas fijada dos veces por separado; acá aparecieron
tres números en la misma situación.

- **`EXPIRING_WITHIN_DAYS = 3` (web) y `expiringWithinDays = 3` (iOS).** Dos
  literales sueltos, cada uno con su propio test afirmando el 3. Movés uno,
  actualizás su test, y el otro cliente queda en desacuerdo sobre cuándo un ítem
  «vence pronto» con las dos suites en verde. Y no había vector que lo atara: los
  vectores de sugerencias **nunca miran el vencimiento**, que es lo mismo que
  descubrí ayer al cubrir `ItemState`. La ausencia de vectores y la ausencia de
  acoplamiento eran la misma ausencia.
- **`LIMITS = { categories: 30, locations: 20 }`** en el editor de taxonomía,
  espejando los topes de `firestore.rules`. La dirección que duele es subir el
  del cliente sin subir el de las reglas: la pantalla deja llenar un formulario
  que el servidor después rechaza, o sea el diálogo de error de escritura
  disparándose por algo que la pantalla podía saber.

Cerrado en `apps/web/src/lib/domain/parity.test.ts`, que **lee** `ItemState.swift`
y `firestore.rules` en vez de repetir el número. El idioma ya existía en
`tokens.test.ts` para la paleta; faltaba aplicarlo acá. Verificado moviendo cada
número de un solo lado: los tres caen, cada uno en su test.

## El cliente permite lo que las reglas rechazan (06/09/2026) — HECHO

De Gastos Diarios, que lo encontró como clase después de preguntarse «dónde más
aplica» en vez de «¿lo apliqué?». Acá hay ocho campos de texto con tope en las
reglas y esto los respeta:

| campo | tope | web | iOS |
| --- | --- | --- | --- |
| Nombre del hogar | 60 | sí | — |
| Nombre corto de receta | 40 | sí | — |
| Nombre del ítem | 80 | — | — |
| Cómo le decimos en casa | 80 | — | — |
| Notas del ítem | 500 | — | — |
| Título de receta | 120 | — | — |
| **Preparación** | **5000** | — | — |
| Fila suelta de la lista | 80 | — | — |

**Por qué duele más que un rechazo cualquiera.** Firestore aplica la escritura a
la caché local antes de que el servidor la vea, así que la persona ve la receta
guardada y **después** aparece el diálogo de error — el que se construyó en 0.1
justamente para que un rechazo no sea invisible. Por un carácter de más. La
dirección importa: un cliente más estricto que las reglas es una molestia; uno
más laxo es un error que la pantalla podía evitar sola.

El más alcanzable de verdad es **Preparación (5000)**: pegar una receta larga es
algo que pasa.

**Lo hecho, porque no era decisión de nadie:** el nombre del hogar estaba capado
en Ajustes y NO en el onboarding — el mismo campo, dos formularios, una sola
regla aplicada. Unificado en `lib/domain/limits.ts` y acoplado a las reglas en
`parity.test.ts`.

**Decidido por Cristian: dejar escribir y avisar.** Nada trunca. Se puede tipear
o pegar de más, el formulario dice por cuánto te pasaste, y la acción primaria no
deja guardar. Aplicado a los **siete** campos alcanzables y no a los cinco que
faltaban: los dos que ya tenían `maxLength` truncaban en silencio, y dejarlos así
habría creado justo la inconsistencia que este archivo viene documentando.

`overBy()` cuenta sobre el string **trimmeado**, que es lo que ven las reglas —
avisar por espacios al final sería avisar por algo que nunca llega al servidor.
Los siete topes están acoplados a `firestore.rules` en `parity.test.ts`,
verificados moviendo cada número de un solo lado.

`items.notes` (500) queda sin aviso porque **ningún formulario web lo escribe**.
Y en iOS no hay tope en ningún campo: ahí no es un atributo sino trabajo nuevo, y
sigue pendiente.

## Topes de reglas sin cobertura (05/09/2026)

Método de Gastos Diarios, que es más barato que mutar de a uno: aflojar **todos**
los topes a la vez (`sed 's/size() <= [0-9]*/size() <= 999999/'`) y correr la
suite. Los tests que caen te dicen qué está cubierto; el resto es la lista de
candidatos, que se confirma en UNA corrida aflojando sólo ésos.

De 17 topes, 6 tenían red. Los 9 candidatos se confirmaron sin cobertura en una
sola pasada. Cubiertos desde entonces:

- `name.size() <= 60` del hogar — el que destapó el método
- `locations.size() <= 20` — el mapa que ahora Ajustes puede editar

- `categories.size() <= 30` — por los **dos** lados. Ver abajo.

Y uno que **no** se cubrió, con el motivo:

- `memberIds.size() <= 2` en `validHousehold`: el tope que trabaja es
  `before.memberIds.size() < 2` en el camino de *join*, y el test de invitación
  ya lo cubre de punta a punta. El de validación es su cinturón, inalcanzable
  mientras la otra regla se sostenga.

### Corrección: el motor de reglas no se planta en 31 entradas

Este archivo afirmaba, desde el 04/09/2026, que el motor se niega a evaluar un
mapa de más de ~31 entradas con un `PERMISSION_DENIED` idéntico al del tope, y
que por eso el lado que falla de `categories` no se podía afirmar. **Es falso.**

Lo remedí el 05/09/2026 después de que la sesión de Gastos Diarios no pudiera
reproducirlo: con el tope subido a 500, un hogar con **120 categorías se escribe
sin problema**. Y con el tope real de 30, 31 y 60 fallan — por el tope. El test
afirma las dos direcciones y cae si se saca el tope.

### Qué se pudo determinar (06/09/2026)

Reproducida la condición exacta del commit original —tope en **31**, mapa de
**31**, no un tope alto— y **los tres casos pasan** (29, 30 y 31 entradas). Con
el tope en 500, 120 entradas también. No hay límite del motor, en ninguna
combinación.

Lo que sí se pudo leer, del log que quedó guardado: el mensaje completo era

    evaluation error at L138:24 for 'create' @ L138,
    evaluation error at L144:24 for 'update' @ L144,
    false for 'create' @ L138

La última cláusula, **`false for 'create'`, es la regla devolviendo falso** — o
sea el tope haciendo exactamente su trabajo. El mensaje traía la respuesta y yo
leí la primera cláusula. Y «L138» tampoco señalaba el mapa: en aquel commit
L138 era `allow create: if isSignedIn()`, o sea el arranque de **toda** la
condición de create, no una línea del tope.

Qué produce el prefijo `evaluation error` sigue sin determinarse: no se reproduce
aislado ni con documento nuevo, ni sobre uno existente, ni con mapas de 21 o 40
entradas. Se descartó que dependa del tamaño del mapa, que es lo único que la
conclusión original afirmaba. Se deja acá y no se sigue cavando: lo accionable
—que el tope es testeable y ahora está testeado por los dos lados— ya está.

Dos lecciones, y la segunda es más específica que la primera:

1. **Una medición que explica por qué algo no se puede probar merece más
   escrutinio que una que prueba algo**, porque su conclusión es que dejes de
   mirar.
2. **Leer el mensaje entero, no su primera cláusula.** Un `PERMISSION_DENIED` de
   Firestore lista *todos* los caminos que evaluó. Que uno diga «evaluation
   error» no significa que el motor no pudo: puede haber otro, en la misma
   línea, diciendo `false`.

**Cerrados el 06/09/2026.** Los siete que quedaban tienen test:
`displayName` 100, `name` 80 del ítem, `title` 120 e `ingredients` 60 de
recetas, `days` 14 del plan y `label` 80 de la lista. Confirmado con el barrido:
aflojando los 17 a la vez caen 11 tests, y aflojando **sólo** `memberIds` no cae
ninguno — o sea que ése es el único sin red, y a propósito, porque el tope que
trabaja está en el camino de *join* y el test de invitación ya lo cubre.

## Lo que P3 destapó

- **`moves` se escribía en 7 lugares y no lo leía nadie**, ni siquiera el índice
  compuesto que ya estaba desplegado para esa consulta. iOS no tenía ni el
  modelo. Ahora lo lee el sheet del ítem en las dos plataformas.
- **Categorías y ubicaciones eran sólo lectura.** No había *ninguna* mutación
  para esos mapas en todo el repo: eran lo que sembró `shared/*.json` al crear
  el hogar. Los topes que se habían agregado a las reglas protegían campos que
  ninguna pantalla podía hacer crecer.
- **`sortOrder` es accidentalmente redundante en la web.** Aplanarlo a cero no
  hace fallar *ninguna* aserción de navegador: el mapa vuelve de Firestore en el
  orden en que se escribió y un sort estable sobre claves iguales no hace nada.
  Donde carga peso es en el teléfono, porque iOS lo decodifica a un `Dictionary`
  de Swift, que no tiene orden. Por eso está fijado en un test unitario y no en
  el e2e — está medido, no supuesto.
- **La app iOS nunca renderizó en Outfit.** `Outfit-Variable.ttf` registra la
  familia `Outfit` y la instancia `Outfit-Thin`; el código pedía
  `Outfit-Regular`/`-SemiBold`/`-Bold`, las tres devolvían `nil`, y todo caía al
  system rounded — mientras `CLAUDE.md` decía que las dos apps "se ven como un
  solo producto". Y esa rama de fallback tampoco tenía `relativeTo:`, que es por
  qué Dynamic Type no hacía nada: los dos defectos se tapaban entre sí.
- **`maximum-scale=1` costaba el zoom con dos dedos.** Era el único fallo de
  accesibilidad de Lighthouse. `touch-action: manipulation` hace lo que el
  comentario original quería (matar el doble toque) sin quitar el pinch.
- **La zona horaria vuelve a esconderse.** El chequeo de caducidad del widget
  leyendo la zona del *dispositivo* en vez de la del hogar no rompía nada,
  porque esta máquina **es** `Australia/Sydney`. Igual que `format.test.ts` esta
  mañana. El caso que muerde describe un hogar en Honolulu.

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

> **Hecho, los tres puntos.** Lo de abajo es la evidencia del día que se escribió
> y se deja tal cual: es lo que justificó el trabajo, no una descripción del
> código de hoy. Medido ahora: **7** usos de `relativeTo:`, **11**
> `accessibilityLabel`, **2** `accessibilityValue`, **1** `accessibilityHidden`.
>
> Los dos botones del `Stepper` (`Restar`/`Sumar`) ahora llevan
> `.accessibilityValue(label)` con la cantidad formateada, además del
> `accessibilityLabel` que ya decía qué hace cada uno. Antes, alguien
> navegando botón por botón escuchaba "Restar Huevos" y "Sumar Huevos" sin
> ningún número cerca — tenía que desviarse al texto del medio y volver. El
> `LevelDial` ya llevaba la cantidad adentro de su propio label
> (`"Huevos: poco"`) y no necesitaba el cambio.
>
> La API también cambió de nombre: `.stock(N, .peso)` pasó a ser el modifier
> `.appFont(N, .peso)`, y los símbolos a `.appSymbol(N)`.

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

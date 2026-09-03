# Reglas de trabajo

Las reglas que Cristian fijó para este proyecto, juntas y en un solo lado.

`CLAUDE.md` sigue siendo lo que un agente carga solo, y es la fuente de verdad
de las restricciones **técnicas** (esquema, unidades, listeners). Este archivo
recoge además las de **proceso** —las que no viven en el código— y explica el
*por qué* de cada una, que es lo que hace que se puedan aplicar a un caso nuevo
en vez de repetirlas de memoria.

---

## 1. Nada se publica sin que se pida

- **Commitear: libre.** Terminar el trabajo y dejarlo commiteado es lo esperado.
- **`git push`, `firebase deploy` e instalar en el iPhone: sólo cuando se pide,
  en ese mensaje.** Un permiso dado ayer no vale hoy.
- Al terminar, decir qué quedó sin pushear y qué implicaría publicarlo.

**Por qué:** cada push a `master` deploya la web a producción por Vercel, y la
app la usan dos personas de verdad.

**Dos excepciones, y son para avisar fuerte, no para decidir solo:** cuando algo
ya vivo en producción está *roto* por un cambio sin deployar (típicamente las
reglas de Firestore), y cuando deployar es el único modo de completar lo que se
acaba de pedir.

## 2. Cero gastos, sin excepciones

- **Firebase Spark.** Nunca Cloud Functions: exigen Blaze.
- **Vercel Hobby.** Nada de servicios pagos.
- **GitHub Actions no puede costar nada.** Los runners de macOS facturan a 10x,
  así que **no hay pipeline de iOS** — se compila y testea local antes de cada
  cambio. Todo lo que corre en Actions es Ubuntu.
- Las APIs de terceros se usan sólo si son gratis y sin API key (hoy: Open Food
  Facts), y siempre como **comodidad**, nunca como dependencia: si no responde,
  el flujo tiene que seguir funcionando.
- Si algo sólo se resuelve pagando, se dice y se propone la alternativa gratis;
  no se contrata nada.

## 3. Idiomas

- **Conversación:** español rioplatense.
- **Código, comentarios y nombres:** inglés.
- **La UI: sólo español.** Sin next-intl ni String Catalogs — fue una decisión
  explícita (el contenido real, los nombres de los ítems y las recetas, lo
  escribe el usuario en español igual). Si algún día hace falta inglés, se
  agrega entonces.
- **Mensajes de commit:** inglés australiano, en formato **conventional
  commits** (`feat:`, `fix:`, `refactor:`, `docs:`, `chore:`, `test:`,
  `build:`, `ci:`, con scope opcional entre paréntesis).
- **Nunca** el trailer `Co-Authored-By: Claude` (ni ninguna coautoría). Es una
  preferencia global y pisa cualquier default del harness.

## 4. Los datos, antes que la pantalla

- **Las cantidades son enteros** en la unidad del ítem (`unit`, `g`, `ml`).
  Jamás floats: `1,2 kg` es formateo de presentación sobre `1200 g`. Lo que no
  se cuenta en enteros usa el modo `level`, no un decimal.
- **Las fechas son `"YYYY-MM-DD"` en la timezone del hogar**, nunca la del
  dispositivo ni buckets UTC.
- **Lo derivable no se guarda; lo que dos personas editan, sí.** El estado de un
  ítem (`out`/`low`/`expiring`) y las *sugerencias* de compra son funciones de
  datos que el cliente ya tiene en cache: persistirlos obligaría a reescribirlos
  para mantenerlos sincronizados con algo que ya los determina. La **lista de
  compras**, en cambio, es estado compartido de verdad —dos personas tildando en
  góndolas distintas— y por eso es una colección real. La línea no es "cuánto
  cuesta calcularlo", es **si alguien lo edita**.
- **Las reglas de Firestore son la única frontera de seguridad.** Cualquier
  chequeo en el cliente es cosmético.
- **Sin backend propio.** Los dos clientes hablan directo con Firebase.

## 5. Firestore: el free tier es parte del diseño

- **Se escucha lo acotado, se pagina lo que crece.** El catálogo del hogar
  (~150 docs) y la lista de compras (~30) se escuchan enteros —ese listener es
  lo que hace que un tilde aparezca en el otro teléfono—; `moves` crece para
  siempre y va con `getDocs` + `limit()`, nunca con listener. En React, siempre
  devolver el unsubscribe desde el `useEffect`.
- Una página que se *visita* usa lectura única; una pantalla en la que se *vive*
  usa listener.
- Persistencia offline en los dos clientes. El súper es exactamente donde no
  hay señal.
- **No esperar la promesa de una escritura para mover la UI.** Firestore sólo la
  resuelve cuando el servidor confirma: `await` congela el formulario mientras
  no hay señal, aunque el dato ya esté guardado local. Escribir y seguir.
- Lo que toca varios documentos (cocinar, reponer) va en un `writeBatch`.

## 6. Código

- **Sin librerías de gráficos.** Las barras son divs y las líneas SVG a mano.
- **Lógica duplicada entre plataformas ⇒ vectores compartidos.** Si algo se
  implementa dos veces (aritmética de períodos, derivación de la lista de
  compras), los casos viven en `shared/*-vectors.json` y **las dos
  implementaciones los corren**. Se cambia primero el vector.
- Comentar el **por qué**, no el qué; sobre todo cuando la decisión fue contra
  la opción obvia.
- Sin subagentes ni workflows salvo pedido explícito.

## 7. Verificar, no suponer

- Un cambio visual se **mide o se mira** (captura, overflow en píxeles), no se
  deduce del CSS.
- Un test de regresión vale lo que atrapa: **reintroducir el bug** y ver el test
  fallar antes de darlo por bueno.
- Si algo no se pudo verificar, **decirlo** en el reporte. "Compila" no es
  "funciona".
- Lo que dice un paso de CI en verde no reemplaza mirar el artefacto.

## 8. Secretos

- Las claves de service account **nunca** entran al repo (gitignored) y cada
  una tiene su propio alcance, para poder revocar una sin romper el resto.
- La config pública de Firebase **es** pública: la seguridad son las reglas.

## 9. La máquina de Cristian

- **No tocar el stack de Docker propio (`ecko`/`holocron`, puerto 8080).** Por
  eso el emulador de Firestore de este proyecto escucha en **8085**: así nunca
  hay que decidir cuál de los dos vive.
- No dejar emuladores ni servidores de dev corriendo al terminar.

## 10. Familia con Gastos Diarios

Las dos apps son del mismo autor, la misma casa y el mismo lenguaje visual, así
que lo que se refinó en una vale en la otra. Lo que Stock tomó de Gastos
Diarios, y por qué —para que una tercera app arranque con esto puesto:

- **Tokens en `:root`, Tailwind sólo los mapea** (`@theme inline`). El día que
  haya dark, es un bloque de tokens más, no un rediseño.
- **Los controles de formulario van en `@layer base`.** Una regla sin capa le
  gana a cualquier utilidad de Tailwind por más específica que sea: un
  `bg-*` escrito en un `<input>` perdía en silencio.
- **`font-size: 16px` en `@media (pointer: coarse)`**, y esta *sin* capa a
  propósito. Safari en iOS hace zoom al enfocar un campo de menos de 16 px, y
  las dos apps viven como PWA en el teléfono.
- **Tarjeta de versión en Ajustes** — versión, commit y fecha, resueltos en
  build. Un número que alguien tiene que acordarse de subir es un número que
  miente.
- **Outfit bundleada también en iOS**, con fallback a la del sistema. Es lo que
  hace que se vean como un producto y no como dos que coinciden en los colores.
- **Aviso de vencimiento de la firma**, leído del `embedded.mobileprovision` y
  no de una fecha guardada: re-firmar no borra el contenedor, así que la fecha
  guardada mentiría para siempre.
- **`hasPendingWrites` a la vista.** Lo que todavía no subió se dice; el súper
  es justo donde no hay señal.
- **Háptica en la acción que se hace sin mirar** (tildar en la góndola).
- **Sin `setState` sincrónico dentro de un `useEffect`.** Para leer algo externo
  —localStorage— va `useSyncExternalStore`.

- **El Watch como relé, no como cliente.** No puede loguearse (Google necesita
  un navegador y en la muñeca no hay), así que nunca toca Firebase: el teléfono
  le manda la lista ya formateada por `updateApplicationContext` y hace todas
  las escrituras. Los tildes vuelven por `sendMessage` si el teléfono está al
  alcance —son dos personas mirando la misma lista, el tilde tiene que llegar
  ya— y por `transferUserInfo` si no, que encola en disco y llega igual.
- **El tilde se escribe al valor que pidió el reloj**, no invirtiendo el que
  está: así una entrega repetida no deshace nada.

Lo que **no** se copió, porque no aplica: i18n (Stock es sólo español), todo lo
de plata y presupuesto, y la ingesta del banco.

### El sistema es compartido, y eso tiene reglas propias

Desde agosto de 2026 las dos apps siguen un design system común, que Stock
copia en [`docs/design-system.md`](design-system.md). Lo que se aprendió
mientras se adoptaba, porque no es evidente:

- **Un número dominante en una app no es el número del sistema.** La fila mide
  14 en la web y 14.5 en iOS; el título 22 y 18. No son inconsistencias: un
  teléfono a distancia de brazo no es una ventana de navegador. Antes de copiar
  un valor, preguntar de qué plataforma salió.
- **Antes de declarar que el sistema miente, medir la plataforma que no miraste.**
  Dos veces un "esto contradice al código" resultó ser "esto es cierto en la
  otra plataforma". El padding de pantalla de 20 parecía inventado y era el de
  iOS, medido.
- **Los nombres de los tokens no se derivan entre plataformas.** `--ink-secondary`
  es `ink2`, y ninguna regla lleva "secondary" a "2": la web nombra la jerarquía
  con palabras porque su archivo de tokens se lee, iOS con números porque una
  vista lo tipea cincuenta veces. Son 3 de 16 acá y 8 de 15 en Gastos — y 3 de
  16 es la tasa peligrosa, porque una convención automática parecería andar
  hasta el cuarto token.
- **La paleta está escrita dos veces (tres, contando que el bloque oscuro del
  CSS va duplicado), y sólo el cuidado las mantiene iguales.** Gastos publicó un
  `--warn-text` bajo el mínimo AA en una plataforma durante meses por eso: los
  dos archivos son válidos por separado. `apps/web/src/lib/design/tokens.test.ts`
  compara los tres lugares. Se borra el día que Stock genere su tema desde un
  archivo de tokens, porque entonces no van a poder diferir.

### En una nota que queda, separar lo medido de lo que se cree

Un comentario dura más que la sesión que lo escribió y se lee como cosa cerrada,
así que mezclar una medición con una explicación plausible es peor ahí que en un
mensaje. Pasó el 03/09 con el pin de Firebase en `apps/ios/project.yml`: las
mediciones eran buenas —cuatro pestañas con datos del servidor, conexiones
aguantando minutos, sin GOAWAY en un log calibrado— pero el comentario además
afirmaba *por qué* fallaba la app hermana, con un mecanismo que nadie había
reproducido. Su propia timeline lo desmintió media hora después.

La forma que quedó, y que conviene copiar: un bloque de **lo que se verificó**,
con qué se midió, y otro de **lo que no se sabe**, dicho así. Si el mecanismo no
está reproducido, va en el segundo.

### Una escritura parcial tiene que decir qué significa

Regla que salió de que las dos apps cometieran la misma clase de error en la
misma semana, cada una por la punta opuesta:

- En Stock, `updateDoc` **mergea**: el formulario dejaba de mandar `minSpare` al
  apagar la reserva y el documento se quedaba con el valor viejo, que la pantalla
  ya no mostraba. Un switch apagado nunca llegaba a la base.
- En Gastos, escribir el mapa `defaultBudget` entero **reemplaza**: el payload no
  incluía `rollover`, así que cambiar el monto desde el teléfono apagaba el
  arrastre del sobrante en silencio. Estaba vivo en producción.

Las dos formas son válidas y Firestore hace lo que promete. Lo que falla es no
decidir cuál se quiere: **al escribir, hay que saber qué le pasa a los campos que
no se mencionan**, y si la respuesta es "se borran" o "sobreviven", que esté
dicho donde se escribe.

Cómo queda resuelto acá: los campos que se apagan se borran a propósito
(`deleteField()` en la web, `FieldValue.delete()` en iOS), los flags se escriben
siempre en las dos posiciones en vez de tener camino de borrado, y los mapas
anidados del hogar se tocan **por ruta** (`planConfig.length`), nunca enteros.
Auditado: no queda ninguna escritura de mapa completo fuera del alta.

### Cuidado con `Bundle.main` en código que compila el target de tests

En un bundle de tests, `Bundle.main` es el runner, no la app: los recursos no
están y el lookup devuelve `nil` sin quejarse, así que el test pasa habiendo
probado nada. En Gastos esto hizo que `L10n` devolviera la clave en vez del
texto. Acá `SigningExpiry` lee `Bundle.main`, pero su lógica está partida para
que los tests le pasen los bytes y las fechas — por eso no pica. Los tests usan
`Bundle(for: Self.self)` para sus fixtures, que es lo correcto.

### Dos cosas que cuestan una tarde si no están escritas

- **`-sdk iphonesimulator` se lo impone a *todos* los targets**, incluida la app
  de watchOS embebida: se compila para iPhone y su ícono falla con "did not have
  any applicable content". Va `-destination` solo.
- **watchOS rechaza un ícono con canal alfa** (iOS lo tolera). Los PNG del bundle
  de diseño lo traen, así que hay que aplanarlo.
- **Xcode se actualiza y se lleva la plataforma watchOS**, y como el esquema
  `Stock` embebe la app del reloj, deja de compilar *todo* iOS — simulador y
  dispositivo — con "watchOS 26.5 must be installed". Para el loop de tests está
  el esquema `StockTests`, que no la necesita; para correr la app hay que bajarla
  con `xcodebuild -downloadPlatform watchOS`.
- **Reinstalar NO renueva la firma.** El perfil del team gratuito dura 7 días y
  se reusa: el build toma el que ya existe y conserva su vencimiento, así que
  reinstalar el día 6 deja la app viva un día. Para renovar hay que borrar el
  perfil de `~/Library/Developer/Xcode/UserData/Provisioning Profiles` y
  recompilar con `-allowProvisioningUpdates`, que emite uno nuevo por 7 días.
- **Usar `tools/install-ios.sh`**, que hace el procedimiento entero con sus
  guardas. Lo de abajo es el porqué, no una lista para seguir a mano.
- **Instalar en el teléfono INCLUYE forzar la reemisión, siempre.** No es una
  decisión que se tome mirando cuántos días quedan: mirarlos es lo que lleva a
  no hacerlo. Cada instalación que no fuerza gasta días del mismo perfil — el
  30/08 una instalación normal dejó la app a 23 horas de morir, y reinstalar no
  la salvaba. Está también en la memoria del proyecto, que es lo que hace que se
  cumpla sin depender de acordarse.
- **Si el build falla, restaurar los perfiles apartados antes de terminar**, o la
  máquina queda sin poder compilar para dispositivo. Y **mirar el exit code del
  build ANTES de leer las fechas del bundle**: si falló, el `.app` en disco sigue
  siendo el anterior y sus fechas viejas se leen como "no se renovó" cuando en
  realidad no se emitió nada. Misma forma que todo lo de esa semana — un dato
  correcto sobre la pregunta que no era.
- **Una prueba negativa tiene que decir DÓNDE falló, no sólo que falló.** Probé
  el camino de error del script tres veces y las tres primeras murieron antes de
  llegar al paso que creía estar probando —una por un `»` multi-byte comido como
  nombre de variable, otra por una copia en `/tmp` que no resolvía su ruta
  relativa— y las tres imprimieron un "exit distinto de cero, perfiles
  restaurados" perfectamente plausible. Por eso el script nombra la etapa en cada
  salida.
- **En zsh, un glob sin coincidencias aborta el comando ENTERO, antes de
  correrlo.** No es que se expanda a nada: los demás argumentos, aunque sean
  rutas válidas, tampoco se procesan. Demostrado:
  `zsh -c 'rm -rf noexiste-* a b'` deja `a` y `b` intactos y sólo imprime
  `no matches found`. Bash hace lo contrario — pasa el patrón literal y sigue.
  Esto convirtió un `rm -rf ~/…/DerivedData/Stock-* build-sim build-device` en
  un no-op silencioso, el build siguiente falló por caché vieja, y la app
  arrancó igual desde un `.app` de una semana antes. `tools/install-ios.sh` no
  corre ese riesgo porque usa rutas fijas en bash, pero un comando suelto en la
  terminal sí. La lección de la sesión de Gastos es mejor que el flag:
  **no dejar nada que limpiar** — compilar en un directorio nuevo en vez de
  borrar uno viejo.
- **`xcodebuild ... | grep` devuelve el código de `grep`, no el de xcodebuild.**
  Medido: 0 para un build que falló con 65. Leer "BUILD SUCCEEDED" del texto
  funciona sólo porque xcodebuild lo imprime; el estado se captura antes de
  cualquier pipe.
- **Restaurar los perfiles apartados sólo tiene sentido si el build FALLÓ.**
  Xcode emite los nuevos con nombre de archivo nuevo, así que devolver los viejos
  después de un éxito no restaura nada: acumula un par muerto por corrida.
  Medido: 12 perfiles pasaron a 16 en dos corridas antes de que el script
  distinguiera los dos casos.
- **Xcode puede perder la sesión de la cuenta al actualizarse**: el build muere
  con `No Accounts: Add a new account in Accounts settings`. Se arregla en Xcode
  → Settings → Accounts; la cuenta es `cardozocristian@gmail.com`.
- **Hay que borrar TODOS los perfiles del bundle, no sólo el de la app**, y el
  que manda es **el más corto**. Cada target se firma por separado y Xcode
  reemite sólo lo que falta, así que un target agregado después arranca su propia
  semana: en Gastos el del reloj vencía cinco días más tarde que el de la app.
  Apartándolos juntos se reemiten en la misma pasada (los de Stock quedaron con
  dos segundos de diferencia). Y lo primero que deja de andar es lo que firma el
  perfil que vence antes — el reloj o el widget — sin que la app dé ninguna
  señal, que es por lo que `SigningExpiry` lee los perfiles de todo el bundle y
  se queda con el mínimo.

---

## Referencias

| Tema | Dónde |
|---|---|
| Especificación del producto | [`README.md`](../README.md) |
| Restricciones técnicas que carga el agente | [`CLAUDE.md`](../CLAUDE.md) |
| Decisiones de arquitectura y su porqué | [`docs/PLAN.md`](PLAN.md) |
| Esquema de Firestore (fuente de verdad) | `shared/schema.md` (Fase 0) |
| Puesta a punto manual (consola, dominio) | [`docs/setup.md`](setup.md) |

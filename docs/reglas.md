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

### Dos cosas que cuestan una tarde si no están escritas

- **`-sdk iphonesimulator` se lo impone a *todos* los targets**, incluida la app
  de watchOS embebida: se compila para iPhone y su ícono falla con "did not have
  any applicable content". Va `-destination` solo.
- **watchOS rechaza un ícono con canal alfa** (iOS lo tolera). Los PNG del bundle
  de diseño lo traen, así que hay que aplanarlo.

---

## Referencias

| Tema | Dónde |
|---|---|
| Especificación del producto | [`README.md`](../README.md) |
| Restricciones técnicas que carga el agente | [`CLAUDE.md`](../CLAUDE.md) |
| Decisiones de arquitectura y su porqué | [`docs/PLAN.md`](PLAN.md) |
| Esquema de Firestore (fuente de verdad) | `shared/schema.md` (Fase 0) |
| Puesta a punto manual (consola, dominio) | [`docs/setup.md`](setup.md) |

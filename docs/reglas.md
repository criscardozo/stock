# Reglas de trabajo

Las reglas que Cristian fijó para este proyecto, juntas y en un solo lado.

`CLAUDE.md` sigue siendo lo que un agente carga solo, y es la fuente de verdad
de las restricciones **técnicas** (esquema, unidades, listeners). Este archivo
recoge además las de **proceso** —las que no viven en el código— y explica el
*por qué* de cada una, que es lo que hace que se puedan aplicar a un caso nuevo
en vez de repetirlas de memoria.

---

## 1. Publicar

→ [`kyber/docs/publicar.md`](../kyber/docs/publicar.md)

## 2. Cero gastos, sin excepciones

→ [`kyber/docs/costo-cero.md`](../kyber/docs/costo-cero.md)

Acá la API de terceros que la regla contempla es **Open Food Facts**: un código
de barras desconocido igual guarda el ítem, y el catálogo propio del hogar lo
reconoce la próxima vez.

## 3. Idiomas

→ [`kyber/docs/idiomas.md`](../kyber/docs/idiomas.md)

**La UI de Stock: sólo español.** Sin next-intl ni String Catalogs — fue una
decisión explícita, y es donde este repo se aparta de Gastos: el contenido real
(los nombres de los ítems y las recetas) lo escribe el usuario en español igual.
Si algún día hace falta inglés, se agrega entonces.

## 4. Los datos, antes que la pantalla

→ [`kyber/docs/datos.md`](../kyber/docs/datos.md)

La unidad base acá es la del ítem (`unit`, `g`, `ml`), y lo que no se cuenta en
enteros usa el modo `level` — un dial de 0 a 3, no un decimal.

Y el delta que es sólo nuestro: **lo derivable no se guarda; lo que dos personas
editan, sí.** El estado de un ítem (`out`/`low`/`expiring`) y las *sugerencias*
de compra son funciones de datos que el cliente ya tiene en cache; persistirlos
obligaría a reescribirlos para mantenerlos sincronizados con algo que ya los
determina. La **lista de compras**, en cambio, es estado compartido de verdad
—dos personas tildando en góndolas distintas— y por eso es una colección real.
La línea no es "cuánto cuesta calcularlo", es **si alguien lo edita**.

## 5. Firestore: el free tier es parte del diseño

→ [`kyber/docs/firestore-free-tier.md`](../kyber/docs/firestore-free-tier.md)

Lo acotado, acá, son el catálogo del hogar (~150 docs) y la lista de compras
(~30): se escuchan enteros, y ese listener es lo que hace que un tilde aparezca
en el otro teléfono. `moves` crece para siempre y va con `getDocs` + `limit()`.

Y **persistencia offline en los dos clientes**: el súper es exactamente donde no
hay señal.

## 6. Código

→ [`kyber/docs/codigo.md`](../kyber/docs/codigo.md)

Los dos casos de lógica duplicada de este repo son la aritmética de períodos del
plan y la derivación de la lista de compras: `shared/plan-period-vectors.json` y
`shared/shopping-vectors.json`.

## 7. Verificar, no suponer

- Un cambio visual se **mide o se mira** (captura, overflow en píxeles), no se
  deduce del CSS.
- Un test de regresión vale lo que atrapa: **reintroducir el bug** y ver el test
  fallar antes de darlo por bueno.
- Si algo no se pudo verificar, **decirlo** en el reporte. "Compila" no es
  "funciona".
- Lo que dice un paso de CI en verde no reemplaza mirar el artefacto.

## 8. Secretos

→ [`kyber/docs/secretos.md`](../kyber/docs/secretos.md)

## 9. La máquina

→ [`kyber/docs/maquina.md`](../kyber/docs/maquina.md)

El puerto propio de este proyecto es **8280** para Firestore; el bloque entero
está en `firebase/firebase.json` y `apps/web/src/lib/domain/ports.test.ts` lo
sostiene.

## Versiones

→ [`kyber/docs/versiones.md`](../kyber/docs/versiones.md)

`pnpm set-version x.y.z` mueve las cuatro copias juntas, y después hay que
correr `xcodegen` para que el `Info.plist` las tome.

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

### Por qué funcionó preguntar (07/09/2026)

Cierre del intercambio largo con Gastos Diarios. Entre los dos proyectos
salieron ocho bugs reales en dos días, y **ninguno se encontró leyendo código
nuevo**. Cinco acá vinieron de aplicar a este repo algo que ellos habían
encontrado en el suyo; tres allá, de aplicar a su código de esa misma semana algo
que habíamos encontrado acá.

La observación es de ellos y explica la mecánica mejor que cualquiera de las
prácticas sueltas: **funcionó porque el que preguntaba no era el que había
escrito el código.** Va en las dos direcciones y no necesita que el otro conozca
el proyecto — sólo que traiga la pregunta.

Y lo que ninguno esperaba: el valor no estuvo en encontrar bugs sino en que
alguien midiera las frases escritas con seguridad. **Un comentario equivocado
sobrevive más que un bug, porque nada lo ejecuta**: un bug falla, alguien lo
reporta y alguien lo arregla; una frase falsa la lee el próximo y la usa, y si
está escrita con seguridad la usa sin verificarla.

Contadas, las de esta sesión fueron cinco, todas corregidas midiendo y no
releyendo:

| afirmación | corregida en |
| --- | --- |
| «el motor de reglas se planta en ~31 entradas» | `cf2c80f` |
| «contestó `Ok`, entonces es el emulador» | `7753fdd` |
| «`relativeTo:` rinde exactamente el mismo número» | `9bdc176` |
| «un batch rechazado se ve idéntico en pantalla» | `81968d2` |
| el comentario de `formatDayLong`, sin la coma que es-AR emite | `f185f22` |

Ninguna habría fallado nunca. Las tres primeras además cerraban una puerta —
decían que algo no se podía probar o que ya estaba probado— que es la clase que
más caro sale, porque su conclusión es que dejes de mirar.

Gastos Diarios corrigió las dos mitades de eso, y las dos correcciones valen:

**Una frase falsa tiene tres destinos, no dos.** Puede convocar trabajo que no
hace falta, puede hacer que dejes de mirar, o puede mandarte al lugar
equivocado. La diferencia no es de tono: «necesitaría esfuerzo» convoca al que
tiene tiempo, «es contradictorio» no convoca a nadie. Las mías cerraban puertas;
las suyas desviaban. El tercer destino es el más caro de los tres porque además
te da una respuesta: vas al puerto muerto, algo contesta, y no somos nosotros.

**Y no todas nacen falsas.** Mi generalización —«eran todas sobre herramientas
que no medí»— no aplica a las suyas: la mitad eran sobre sus propios artefactos,
**eran ciertas, y dejaron de serlo**. Esa clase no la agarra ninguna medición
inicial, porque en el momento de escribirla la medición da bien. Lo único que la
agarra es un guard que las relea cada vez. Buscadas acá aparecieron dos en el
día: `docs/reglas.md` y `docs/plan-mejoras.md` repetían los puertos viejos de
Auth y de la UI, cierto el 5/9 y falso el 7/9, cuando el bloque se movió. `ports.test.ts`
acoplaba diez copias en código y ninguna en prosa; ahora también lee los docs, y
mover el puerto de la UI —que vivía **sólo** en prosa— pasaba de romper 0 tests
a romper 4. Medido con la mutación, no supuesto.

**Corolario que va contra la intuición**, también suyo: sacar una dependencia
suele ser más corto **y** más seguro que blindarla, y uno igual la blinda porque
blindar se siente como trabajo y sacar se siente como esquivar. El caso concreto
fue un experimento que necesitaba encontrar un hogar: ellos le pusieron un wipe
adelante para que el `.find()` tuviera un solo candidato; acá se apuntó al id
fijo que siembra el seed y dejó de haber lookup. Lo segundo se escribió por
pereza y era la solución.

### Una medición que no puede dar el resultado contrario no es una medición (07/09/2026)

La versión útil de «verificar la sonda», porque se aplica **antes** de correr y
no después. La pregunta al diseñar una verificación es: *¿qué tendría que pasar
para que esto falle?* Si no hay respuesta, no hay experimento.

Esta semana la misma cosa apareció de tres formas que parecían distintas:

- **El baseline vacío.** Un detector corrido contra el árbol limpio que no
  imprime nada no distingue «todo bien» de «no corrió». Tiene que afirmar algo
  positivo — «11 passed», no silencio. (Gastos Diarios: corrió vitest desde la
  raíz en vez de `apps/web` y leyó el vacío como «ninguna falla».)
- **La sonda inerte.** Un `expect.poll` verde que consulta el endpoint
  equivocado pasa siempre. Acá pasó tres veces, y las tres se descartaron
  apuntando la sonda al valor equivocado y exigiendo que falle.
- **El control que no discrimina.** Si las dos ramas del experimento dan lo
  mismo, se midió el reloj y no el efecto.

Las tres se resolvían igual y ninguna de las dos sesiones lo había visto hasta
nombrarlo. Reemplaza tres entradas separadas de este archivo.

**Corolario, y es el que más caro sale:** un experimento **tirable** se saltea
justo las protecciones que importan, porque parece que no valen para algo que se
va a borrar. Las dos que costaron una tarde entre los dos proyectos: dejar
instaladas unas reglas hostiles, y confiar en un `.find()` que siempre devuelve
*algo*. Mejor que arreglar el lookup es diseñar el experimento **sin** lookup —
apuntar al id fijo que siembra el seed, y así no hay nada que pueda devolver otra
cosa.

### Una guarda también es código, y falla igual (10/09/2026)

Cuatro maneras de tener una guarda verde que no sostiene nada. Las cuatro salieron
en dos días, midiendo, entre este proyecto y Gastos Diarios.

**El que la escribe es el primero que quiere la excepción.** Escribir la
advertencia obliga a nombrar lo prohibido, y ahí uno se cree el caso especial —
en el minuto exacto en que acaba de convencerse de que las excepciones son
malas. Pasó tres veces esta semana con tres guardas distintas: un comentario que
deletreaba el project id malo para advertir sobre él, otro que citaba un puerto
muerto para contar que estaba muerto, y acá una exclusión `!path.endsWith(...)`
escrita **veinte minutos después** de negarme a poner una excepción por línea en
los docs. Escondía dos puertos vigentes, uno de ellos en el comentario que
explica que las frases sobre puertos caducan. La regla, entonces: **la guarda se
somete a su propia regla**, sin lista de exclusiones. Si necesita nombrar lo que
prohíbe, se reescribe la prosa, no la guarda.

**Fallar no alcanza: tiene que fallar en el lugar correcto.** Mover el
`websocketPort` rompía exactamente un test, el de prosa, así que el arreglo que
sugería era editar una oración — la suite quedaba verde y la CSP seguía
apuntando al puerto viejo. Una guarda que se pone verde con un arreglo parcial
es peor que ninguna, porque tiene forma de haber funcionado. Al mutar, no
preguntarse *¿falló?* sino ***¿falló el que corresponde?***, y contestarlo
buscando si existe una copia a la que debería haber apuntado.

**Comparar todo lo que hay no es comparar que esté todo.** Una lista escrita a
mano sólo prueba que lo que nombra coincide. Gastos Diarios lo encontró en un
comparador de restore que recorría un conjunto fijo de colecciones raíz; acá,
en esta misma lista de puertos, a la que le faltaban dos archivos que yo mismo
había agregado. El arreglo es que la lista se contraste contra el árbol y
**nombre el archivo** que falta.

**La primera corrida fallida es la que valida las siguientes.** Versión práctica
de «una medición que no puede dar el resultado contrario»: si el comparador
falló una vez por su propia culpa y lo arreglaste, ya sabés que puede reportar
diferencias. Si dio OK de entrada, no sabés si compara o si mira para otro lado.

**Una afirmación que decide algo viaja con cómo se obtuvo.** Entre sesiones, el
mecanismo por el que circula una frase falsa no es que esté mal escrita: es que
llega **separada de su procedencia**, y separada ya no se puede ponderar. En una
hora escribí tres versiones del mismo consejo sobre Vercel y submódulos —«dale
acceso a la app» (falso), «no se puede nunca» (cierto entonces), «anda» (cierto
ahora)— y sólo la tercera la medí en este repo. Las dos primeras venían de otras
sesiones, de buena fe, y las repetí con la misma firmeza que las medidas. La
única que se trató distinto fue la que llegó marcada como no verificada: cuando
mandé lo de Vercel como PLAUSIBLE, del otro lado lo midieron antes de usarlo.
Así que basta con tres etiquetas —**medido acá**, **leído en la doc**, **lo
supongo**— y ponerlas donde la afirmación decide algo. Es de Gastos Diarios, y
el caso que la motivó es mío.

**Y una instrucción puede ser correcta en contenido y falsa en el momento.**
«Borrá la deploy key» era verdad *después* de un push que todavía no había
ocurrido; dada antes, rompía el CI del otro repo en la siguiente corrida. Cuando
lo que se pide depende de un estado que todavía no existe, la condición va en la
misma oración.

**Escribí la guarda ANTES de arreglar lo que va a guardar.** En ese orden la
primera corrida es un control positivo gratis: no hace falta preguntarse si la
sonda puede dar el resultado contrario porque arranca dándolo. La de versiones
se escribió sobre el estado roto y falló sola —`['0.1']` contra `['0.1.0']`—
sin que hiciera falta inventar ninguna mutación. Gastos Diarios hizo el orden
inverso con la misma guarda: unificó primero, escribió el control después sobre
un estado ya sano, y tuvo que fabricar tres mutaciones para saber si servía.
Mismo resultado, tres pasos más y una duda que el otro orden no tiene.

**Un script que toca N destinos valida tarde por defecto, y hay que decidir no
hacerlo.** No es descuido: es el orden en que uno escribe. Abrís el primer
archivo, lo resolvés, pasás al segundo, y la validación aparece recién cuando
llegás a la parte que puede fallar — para entonces ya escribiste. Los dos
proyectos escribimos el mismo `set-version.mjs` con el mismo defecto: subía la
versión de la web y **después** contaba los targets de iOS, así que un conteo
mal dejaba las dos plataformas en desacuerdo, que es el estado exacto que el
script existe para evitar, producido por la herramienta de evitarlo. La regla:
leer y validar todo, escribir todo después, y decirlo en el mensaje de error
(«nothing was written»), porque el que lo lee necesita saber si quedó a medias.

**Y el orden de las líneas en un archivo no es el orden de ejecución.** Buscando
ese defecto en el resto de los scripts escribí una sonda que comparaba el número
de línea de la primera escritura contra el de la primera validación. Marcó tres
archivos. Los tres eran ruido: dos `import` que mencionaban `writeFileSync` y la
*definición* de una función que se llama mucho después. La sonda no podía
contestar la pregunta que le hice, y su salida tenía forma de respuesta. Para
esto no hay atajo textual: se leen los caminos de ejecución, que en este repo
eran cuatro.

**Una lista vacía es verdad en los dos mundos.** Apareció dos veces el mismo
día: `expect(wrong).toEqual([])` pasa igual si la sonda no encontró diferencias
que si no miró nada. La aserción tiene que llevar **cuánto se miró** al lado —
`{ checked: 8, wrong: [] }` — y la mutación que lo justifica es romper el
matcher, no los datos. Es la misma forma que contar hogares cuando el conteo da
1 en los dos casos.

**No la escribas, corrila — y antes de mirar, decí qué significaría cada color.**
La formulación abstracta («una medición que no puede dar el resultado contrario»)
se aplica pensando, y pensando fallamos los dos varias veces en dos días: cada
uno estaba seguro de que su chequeo discriminaba. La mitad ejecutable es de
Gastos Diarios. La otra mitad salió de un error mío: puse la garantía adentro de
un test que itera solo, volví a mutar, siguió verde, y estuve a punto de
«reforzar» algo que ya estaba bien — porque tenía en la cabeza que la mutación
**tenía** que fallar. Verde era la respuesta correcta: el bucle vacío ya no
borraba ninguna garantía. Sin la predicción escrita antes, uno lee el color según
lo que esperaba.

**Y por qué nada de esto se arregla con más atención.** Las sondas inertes de la
semana —seis entre los dos proyectos— no se rompieron solas: se escribieron
rotas, en el minuto exacto en que estábamos pensando en sondas rotas. El caso
límite es de ellos: un chequeo que buscaba una cadena literal en el archivo, y la
línea que la buscaba ponía la cadena en el archivo, así que se encontraba a sí
mismo y no podía fallar nunca. No es que se les haya pasado: **el acto de
escribir la aguja la creó**. Hay una clase de error que sólo se comete estando
concentrado en no cometerlo, y por eso ninguna regla que se aplique pensando la
cubre. Ésa es la razón de que todas las de arriba terminen en un paso ejecutable.
Para el round trip la versión corta es de ellos: **rompé algo a propósito
primero y confirmá que la comparación lo ve.** Es más rápido que desconfiar.

Corolario para los números: un comentario que dice **cuántos** archivos repiten
algo caduca el día que se agrega el siguiente. Las dos cabeceras decían «nueve» y
«seis» y estaban mal hacía días. No se corrigen a once — se sacan. La lista es la
cuenta.

### Hay fallos que ninguna sonda puede ver (07/09/2026)

Los emuladores de este proyecto se movieron a un bloque propio porque un forward
de SSH en esta máquina tiene **los seis puertos default de Firebase**. Al hacerlo
escribí que verificar «Firestore contesta `Ok` y Auth `ready=true`» distinguía el
emulador de otra cosa. **Es falso**, y lo corrigió Gastos Diarios midiendo lo
mismo de su lado. Medido acá, los tres a la vez:

|  | `GET /` | un documento que no existe | `households` |
| --- | --- | --- | --- |
| 8280 nuestro | `Ok` | el 404 JSON de Firestore | 1 |
| 8085 forward | `Ok` | `Not Found`, texto plano | no es JSON |
| 8080 forward | `Ok` | el 404 JSON de Firestore, **idéntico** | 0 |

`Ok` en los tres. Y el 8080 forwardea a un emulador de Firestore **real y
vacío**: mismo cuerpo de error carácter por carácter. Ninguna sonda de forma los
separa, porque uno de ellos **es** lo que la sonda busca.

Lo único que los distingue es data que sembramos nosotros. Y de ahí sale la
conclusión, que va contra el reflejo de las dos sesiones: **no hay sonda que
resuelva esto**. La protección es un bloque de puertos que nadie más use más una
guarda que fuerce a todas las copias del número a coincidir — `ports.test.ts`,
diez copias, verificado moviendo el puerto en una sola.

Ambos estuvimos a punto de construir la sonda que no puede funcionar. Lo que la
evitó las dos veces fue medir antes de escribirla.

### Si el archivo tiene gemelo, mirá el gemelo antes de commitear (06/09/2026)

De Gastos Diarios, y es el momento fijo más barato de todos los métodos que
salieron de esa semana: **cuando un arreglo toca un archivo que tiene gemelo en
la otra plataforma, ir a mirar el gemelo en el mismo cambio** — no al revisar,
no después, sino mientras todavía tenés en la cabeza por qué lo estabas
arreglando.

El motivo es que estos dos proyectos fallan así por defecto. Tres veces en una
semana apareció «decisión tomada en las dos plataformas, aplicada en una»: el
`--warn-text` de Gastos correcto de un lado y por debajo de AA del otro durante
meses; su fila de historial combinada en iOS y nunca en la web; y acá los
controles nombrados en la web mientras iOS quedaba igual. En las tres, el que lo
encontró fue alguien ajeno haciendo otra cosa, con días o meses de distancia.

Corrido sobre los arreglos de accesibilidad de esta semana, el resultado fue
mixto y por eso vale:

- **Controles segmentados**: la web necesitaba `aria-pressed` porque son botones
  hechos a mano; iOS usa `Picker`, que anuncia la selección solo. No aplica.
- **Filas del plan**: la web repite seis «Cocinada»; `TodayScreen` muestra un
  solo día, así que no hay dos controles iguales que confundir. No aplica.
- **Botones «Agregar» de sugerencias**: iOS tiene uno por fila, sin etiqueta.
  **El gemelo exacto, sin aplicar.**

Dos de tres no aplicaban, que es lo que hace que la práctica sea barata: mirar
cuesta un grep, y la respuesta suele ser «no aplica» por una razón que también
conviene saber.

### Un selector que necesita desambiguar es un síntoma — a veces (06/09/2026)

Tres veces esta semana, escribir un test destapó un control sin nombre: los seis
«Cocinada» del plan, los doce «Poner en poco» del dial, los doce «Agregar» de las
sugerencias. La intuición era que **no poder apuntarle a algo desde un test es el
mismo síntoma que no poder nombrarlo desde un lector de pantalla**, y que el test
es el detector más barato de los dos.

Gastos Diarios la afinó, y la refinación es lo que la hace usable. Cuando un test
necesita `.first()` o `.nth()` sobre un **control**, la pregunta siguiente es:

> ¿la app declaró un alcance que el lector de pantalla sí respeta?

- **Si lo declaró** (`role="dialog"` + `aria-modal="true"`, o un `<dialog>`), el
  defecto es del test. Playwright consulta el DOM y no respeta `aria-modal`, así
  que ve dos botones donde un lector de pantalla ve uno: el de atrás no existe
  mientras el modal está abierto. El arreglo es que el test exprese el alcance
  que la app ya declara —`getByRole('dialog').getByRole('button', …)`— y no
  renombrar nada.
- **Si no lo declaró**, el control no tiene nombre y están rotos los dos.

Acá el `Sheet` de `primitives.tsx` sí declara `role="dialog"` + `aria-modal`, así
que las ambigüedades dentro de un sheet caen en el primer caso. Aplicando la
pregunta a las cuatro desambiguaciones que quedaban en los e2e: tres eran sobre
**contenido** (`getByText` de un chip, de un nombre repetido) —ruido esperable— y
una era sobre un control: los dos botones «Editar» de Ajustes, en la misma
página, sin diálogo que los separe. Positivo real, y el test tenía que filtrar
secciones por su título para llegarles.

### Y ahora en la otra dirección (05/09/2026)

El primer lote que va de Stock a Gastos Diarios, avisado a esa sesión el
05/09/2026 después de verificar cada punto contra *su* repo, no contra el
nuestro:

- **La app iOS no renderizaba en Outfit, en ninguna de las dos.**
  `Outfit-Variable.ttf` registra la familia `Outfit` y la instancia por defecto
  `Outfit-Thin` — iOS no registra las instancias con nombre de una fuente
  variable. `UIFont(name: "Outfit-Regular")` devuelve `nil`, y todo caía al
  system rounded. Hay que pedir la FAMILIA y aplicar el peso con `.weight()`.
- **Ese mismo fallback no tenía `relativeTo:`**, así que Dynamic Type no hacía
  nada — y eso tapaba lo anterior: la tipografía "se veía bien" porque nadie
  podía agrandarla para notar que no era la que creía.
- **`maximum-scale=1` cuesta el pinch-zoom** y es el único fallo de
  accesibilidad que reporta Lighthouse. `touch-action: manipulation` mata el
  doble toque sin llevarse el pinch.
- **Un `onTapGesture` sobre una forma no existe para VoiceOver.** No hay qué
  enfocar ni qué nombrar. Tiene que ser un `Button`.
- **Los puertos de los emuladores chocaban.** Stock se corrió a un bloque
  propio (ver §"Los puertos"); Gastos se queda con 9099/4000. Ahora conviven.
  Esta viñeta repetía los dos números y era cierta cuando se escribió: cambiaron
  dos días después y la frase quedó mintiendo sola. Por eso ahora apunta al
  bloque en vez de copiarlo — y por eso ningún doc vuelve a nombrar un puerto
  muerto, ni para contar que estaba muerto: `ports.test.ts` los rechaza a todos
  y una excepción por línea es como un guard se vuelve decorativo. La historia
  con dígitos vive en ese test, que es código.

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

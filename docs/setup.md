# Puesta a punto manual (una sola vez, todo free tier)

Los pasos marcados ⏳ los tiene que hacer Cristian en una consola web; el resto
se hace desde el repo. El desarrollo local **no necesita nada de esto**: corre
entero contra los emuladores (§5).

El proyecto de Firebase va a ser **`qcris-stock`**, separado del de Gastos
Diarios a propósito: cuota, reglas y Auth propios, así un bug de listeners acá no
quema las lecturas de la otra app. La config de cliente es pública por diseño —
la frontera de seguridad es `firebase/firestore.rules`, nunca el secreto de la
config.

## 1. Consola de Firebase

1. **Crear el proyecto** — ✅ hecho (`qcris-stock`, número 176221729478).
2. **App web** — ✅ hecha. Su `firebaseConfig` está committeado en
   `apps/web/src/lib/firebase/config.ts`: esos valores son **públicos por
   diseño** (viajan dentro del bundle de cualquier build), así que esconderlos
   en variables de entorno no protegería nada y ataría el deploy al estado de un
   dashboard. La frontera de seguridad son las reglas.
3. **Firestore** — ✅ creada, modo nativo, base `(default)`.
4. **Auth** — ✅ proveedor **Google** habilitado. Es el único, en las dos
   plataformas (ver PLAN §9).
5. **App iOS** — ✅ registrada con bundle `dev.cardozo.stock`. Su
   `GoogleService-Info.plist` está en `apps/ios/Stock/Resources/`, y su
   `REVERSED_CLIENT_ID` está copiado en `GOOGLE_REVERSED_CLIENT_ID` de
   `apps/ios/project.yml`. **Los dos tienen que coincidir**: ese es el URL
   scheme por el que Google devuelve el login, y si no matchean el sign-in se
   va y no vuelve. Si alguna vez se re-descarga el plist, actualizar los dos y
   re-correr `xcodegen`.

**Reglas e índices** — ✅ deployados. Para volver a hacerlo tras un cambio:

```sh
firebase deploy --only firestore:rules,firestore:indexes --config firebase/firebase.json --project qcris-stock
```

Eso es lo que le pone dueño a los datos. Comprobado después de deployar: una
lectura anónima a `households/…` responde 403.

## 2. Restringir las API keys (recomendado, gratis, 5 minutos) ⏳

La config es pública por diseño, pero restringir cada key corta el abuso de cuota
desde afuera de tus apps. En **Google Cloud Console → APIs & Services →
Credentials** del proyecto:

1. **iOS key**: *Application restrictions* → **iOS apps** → bundle ID
   `dev.cardozo.stock`.
2. **Browser key**: → **Websites** → `stock.cardozo.dev`, el dominio
   `*.vercel.app` del proyecto, y `localhost:3000` para desarrollo.
3. Dejar *API restrictions* en "Don't restrict key" (Firebase necesita su propio
   set) o restringir a Identity Toolkit + Token Service + Firestore.

## 3. Vercel (web) ⏳

Es un **monorepo pnpm**, y eso cambia dos cosas respecto de una importación
normal:

1. Importar el repo `criscardozo/stock` en Vercel y poner **Root Directory** =
   `apps/web` (framework: Next.js).
2. **Dejar activado "Include source files outside of the Root Directory"** — en
   Vercel viene así al detectar un monorepo, pero no es opcional: el build
   importa `shared/*.json` desde fuera de `apps/web` (categorías semilla,
   ubicaciones) y sin esos archivos no compila.
3. **No hace falta configurar ninguna variable de entorno.** El config de
   Firebase está committeado; `NEXT_PUBLIC_FIREBASE_*` existe sólo para apuntar
   un build a otro proyecto.
4. Agregar el dominio de producción (`*.vercel.app` y el custom) a Firebase Auth
   → Settings → **Authorized domains**, o el sign-in con Google falla con
   `auth/unauthorized-domain`.

**El orden importa**: sin el paso 1 (Firestore creada, reglas deployadas, Google
habilitado), la web deploya perfecto y después no deja entrar a nadie.

### Sólo `main` deploya: `vercel.json` (en la RAÍZ)

Los previews estaban prendidos y no se usaban, así que cada push y cada PR
levantaba un deploy que nadie miraba. `vercel.json` los apaga.

**Va en la raíz del repo, no en `apps/web/`, y eso es contraintuitivo acá.** El
Root Directory de este proyecto es `apps/web` (`vercel project inspect stock
--scope merlines`) y Vercel lee de ahí las opciones de **build**. Pero
`git.deploymentEnabled` no la contesta el build: la contesta la integración de
Git al decidir si crea un deployment, antes de resolver ningún Root Directory.
Así que el archivo tiene que estar donde mira ese paso.

**Los docs no dicen esto, y la forma equivocada falla en silencio**: el archivo
existe, es JSON válido, la clave está bien escrita, y no hace absolutamente
nada. Medido acá el 16/09/2026 con una rama descartable: con el archivo en
`apps/web/` el push creó un preview igual; con el mismo archivo en la raíz, el
segundo push de la misma rama no creó ninguno. Un solo deployment para dos
commits, que es la diferencia que no se ve leyendo el archivo.

El archivo es JSON estricto y no admite comentarios, así que las dos razones
por las que está escrito exactamente así viven acá:

1. **No es `"deploymentEnabled": false` a secas.** Los docs ofrecen esa forma
   para «apagar todos los despliegues automáticos» y apaga **también
   producción**. Lo que se usa en su lugar es una regla explícita de los mismos
   docs: *«If a branch matches multiple rules and at least one rule is `true`,
   a deployment will occur»*. Así `main` matchea las dos entradas y gana el
   `true`; cualquier otra rama matchea sólo la primera.

2. **El patrón elegido no es cosmético**: es `**`, no `*`. Los
   patrones son [minimatch](https://github.com/isaacs/minimatch), donde `*`
   **no cruza la barra**. Medido con el minimatch del propio lockfile: `*`
   matchea `main` y `fix-typo` pero **no** `feature/login` ni
   `dependabot/npm_and_yarn/next-16`. Y como el default de una rama que no
   matchea ninguna regla es `true`, con `*` las ramas de Dependabot habrían
   seguido deployando — que es justo la fuente más frecuente de previews en
   este repo. `**` sí las matchea.

La mitad que la forma equivocada rompe es que `main` siga deployando, así que
esa es la que hay que mirar en el próximo merge, no sólo que los previews
desaparezcan.

### Dominio `stock.cardozo.dev`

El apex `cardozo.dev` está registrado en Namecheap.

1. **Vercel** → proyecto → Settings → Domains → agregar `stock.cardozo.dev`.
   Vercel muestra el registro DNS a crear — para un subdominio es un **CNAME**
   (valor tipo `cname.vercel-dns-0.com`; usar el exacto que muestre).
2. **Namecheap** → Domain List → `cardozo.dev` → Manage → Advanced DNS → Add New
   Record: `CNAME Record`, Host `stock`, Value = el target de Vercel, TTL
   Automatic. Borrar cualquier registro previo para el host `stock`.
3. Esperar la propagación (minutos a ~1 h). Vercel provisiona el certificado
   solo; `.dev` está en la lista HSTS preload, así que siempre es HTTPS.
4. **Firebase Auth** → Settings → **Authorized domains** → agregar
   `stock.cardozo.dev`.
5. **Canonical (opcional).** Vercel → Settings → Domains: `⋯` sobre
   `stock.cardozo.dev` → **Set as Production Domain**, y en el `.vercel.app`
   elegir **Redirect to** → `stock.cardozo.dev` (308).

### Handler de auth same-origin (necesario para la PWA instalada)

La app sirve el handler de Firebase desde su propio origen: `next.config.ts`
reescribe `/__/auth/*` hacia `<project>.firebaseapp.com`, y `authDomain` se
setea al host desde el que se cargó la app.

**Por qué:** con el `authDomain` cross-origin por defecto, el particionado de
storage de Safari rompe `signInWithRedirect`. Y un popup no es confiable dentro
de una PWA **instalada**: standalone abre un contexto separado y se pierde el
handshake de vuelta. Sirviendo el handler same-origin funcionan los dos, y la app
elige solo: popup en una pestaña, redirect cuando corre standalone.

Exige **un cambio de consola por dominio** ⏳:

1. **Google Cloud Console** → APIs & Services → **Credentials** → el *Web client*
   OAuth 2.0 que creó Firebase → **Authorized redirect URIs** → agregar
   `https://stock.cardozo.dev/__/auth/handler`. Sin eso Google rechaza el
   sign-in con **`redirect_uri_mismatch`**.
2. El dominio también tiene que estar en Firebase Auth → **Authorized domains**.

`localhost` no necesita nada: `next dev` aplica el mismo rewrite y ya está
autorizado.

### El submódulo `kyber` y Vercel

Nada que configurar: **kyber es público**, así que Vercel lo clona sin
credencial y el bundle puede importar de ahí.

Mientras fue privado no podía, y no por permisos — la documentación de build de
Vercel dice que un submódulo se despliega sólo si es accesible públicamente por
HTTP. El deploy quedaba **verde** con `kyber/` vacío y una sola línea de
`Warning: Failed to fetch one or more git submodules` entre el clon y la
compilación. Queda escrito porque es la forma de falla que no cambia el color de
nada, y porque si algún día kyber vuelve a ser privado, vuelve ese techo.

## 4. Instalar la PWA en el iPhone

Es como la app se queda en el teléfono para siempre — a diferencia del build
sideloaded, una app web en la pantalla de inicio no está firmada y no expira.

1. Abrir `https://stock.cardozo.dev` en **Safari** (sólo Safari puede instalar a
   la pantalla de inicio en iOS).
2. Compartir → **Agregar a inicio**.
3. Abrirla desde el ícono: corre standalone, entra por redirect y funciona
   offline (el shell lo precachea el service worker y Firestore mantiene su
   propio cache).

Después de cambiar el manifest hay que borrar el ícono y volver a agregarlo — iOS
cachea el manifest al instalar.

Lo que una PWA **no** puede hacer en iOS, y por eso existe la app nativa: escanear
códigos de barras con VisionKit, widgets, y notificaciones locales de vencimiento.
Las dos leen los mismos datos, así que se usan indistintamente.

## 5. Desarrollo local

Este repo tiene un submódulo, [`kyber`](https://github.com/criscardozo/kyber),
con las herramientas que comparte con Gastos Diarios y la tercera app. Al clonar:

```sh
git clone --recurse-submodules git@github.com:criscardozo/stock.git
# si ya lo tenías clonado:
git submodule update --init
# y una vez, para que `git pull` mueva también el contenido y no sólo el puntero:
git config submodule.recurse true
```

Sin ese último paso, `git pull` deja el submódulo en el commit viejo sin decir
nada: los scripts compartidos siguen corriendo la versión anterior y no hay
error que lo indique. `git submodule status` lo muestra con un `+` adelante.

```sh
pnpm install
pnpm emulators          # Auth 9280, Firestore 8280, UI 4280
pnpm seed               # un hogar de mentira pero realista, en el emulador
pnpm dev                # Next.js en :3000 — NEXT_PUBLIC_USE_EMULATORS=1 para apuntar al emulador
pnpm test:rules         # tests de security rules (levanta su propio emulador, necesita Java)
pnpm test:web           # unit tests, incluidos los vectores compartidos
pnpm test               # todo
```

El emulador de Firestore escucha en **8280**, no en el 8080 habitual, justamente
para no competir nunca con el stack de Docker propio (`ecko`/`holocron`).

Con `NEXT_PUBLIC_USE_EMULATORS=1`, la pantalla de login muestra además dos
botones de "Entrar como…" que firman contra el emulador de Auth: existen sólo
en ese modo, así que no hay camino hacia ellos en un build deployado. Es lo que
permite mirar las pantallas sin una cuenta de Google de verdad.

## 6. iOS

```sh
cd apps/ios && xcodegen   # genera Stock.xcodeproj desde project.yml
open Stock.xcodeproj
```

- Requiere Xcode 16+. Las dependencias (Firebase, GoogleSignIn) resuelven por SPM
  al abrir.
- **No hay CI de iOS, y es una decisión, no sólo una factura.** El porqué
  completo está en la cabecera de `.github/workflows/ci.yml` y no se repite acá.
  Lo que hay que saber para trabajar: se compila y testea local antes de cada
  cambio, que es además donde viven el teléfono y la identidad de firma:
  `xcodebuild test -project Stock.xcodeproj -scheme Stock -destination 'platform=iOS Simulator,name=<iPhone>' -only-testing:StockTests`.
- **Firma**: equipo personal gratuito `FA737M2U79` (el mismo de Gastos
  Diarios), fijado en `project.yml` para que Xcode no reescriba el proyecto
  generado en cada apertura. Certificado de **7 días**: pasada esa semana la
  app deja de abrir y hay que reinstalarla. Es el camino $0 hasta la decisión
  del Apple Developer Program (PLAN Fase 5).

### Instalar en un iPhone (sideload)

Con el teléfono pareado por USB o Wi-Fi:

```sh
cd apps/ios
xcodebuild build -project Stock.xcodeproj -scheme Stock \
  -destination 'platform=iOS,name=<nombre del teléfono>' \
  -allowProvisioningUpdates -derivedDataPath build-device
xcrun devicectl device install app --device '<nombre del teléfono>' \
  build-device/Build/Products/Debug-iphoneos/Stock.app
```

`xcrun devicectl list devices` lista los nombres. La primera vez, el teléfono
pide confiar en el certificado: Ajustes → General → VPN y gestión de
dispositivos.
- Para apuntar al emulador, setear `USE_FIREBASE_EMULATORS=1` en el scheme o
  pasar `-useEmulators` como launch argument.

## 7. Calendario de comidas (opcional)

La web puede leer el calendario de comidas y proponer el plan de la quincena.
Es **opcional**: sin configurar, el botón "Traer del calendario" no aparece y
todo lo demás anda igual.

El calendario es privado (su `.ics` público da 404), así que hace falta un token
OAuth con scope `calendar.readonly`. Se pide **desde el navegador** y se usa
desde el navegador — la API de Google manda cabeceras CORS — así que no hay
backend nuestro en el medio y sigue costando $0.

1. En la [consola de Google Cloud][cred] del proyecto `qcris-stock`, buscá el
   OAuth client de tipo **Aplicación web** que Firebase creó solo al habilitar
   Google Sign-In ("Web client (auto created by Google Service)"). Copiá su
   **Client ID**.
2. Agregá `https://stock.cardozo.dev` y `http://localhost:3000` a **Orígenes de
   JavaScript autorizados** de ese client, si no están.
3. En Vercel, variable de entorno `NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID` con ese
   valor. Para desarrollo, lo mismo en `apps/web/.env.local`.
4. En la **pantalla de consentimiento OAuth**, agregá el scope
   `.../auth/calendar.readonly`. Es un scope **sensible**: en modo *Testing* con
   hasta 100 usuarios de prueba —que es este caso— no necesita verificación de
   Google. Si algún día la app se publicara, sí.

El id del calendario está en `apps/web/src/lib/calendar/client.ts`. Es el `cid=`
del link de Google Calendar decodificado de base64.

Nota de alcance: Firebase no entrega refresh token, así que esto es un botón que
se aprieta al planificar, no una sincronización de fondo. El primer uso pide
permiso; los siguientes suelen ser silenciosos.

[cred]: https://console.cloud.google.com/apis/credentials?project=qcris-stock

## 8. Backup (Fase 4, gratis)

Firestore no tiene export gestionado gratis (eso necesita Blaze), así que
`pnpm backup` vuelca el proyecto entero —hogares con todas sus subcolecciones,
`users`, `invites`— a un JSON con timestamp en `backups/` (gitignored).

**El backup semanal NO corre desde este repo**, y la ausencia es deliberada.
Vive en `criscardozo/my-apps-backups`, que es privado y se queda privado: corre
el mismo `kyber/scripts/backup.mjs`, chequeando out este repo con submódulos
para que cada app la respalde el kyber que **ella** pinea, y commitea el volcado
adentro de ese repo en vez de dejarlo como artifact.

Las dos razones, en orden de peso:

1. **Las credenciales de service account no pueden vivir en un repo que va a
   ser público.** Son admin de producción. Ésta sola justificaría la mudanza.
2. Un artifact de workflow en un repo público **lo baja cualquiera**, y un
   volcado de la base de producción es exactamente lo que no puede pasar.

Así que acá no hay ningún secret de Firebase, y no hay que crear ninguno. La
key va como `FIREBASE_SERVICE_ACCOUNT_STOCK` en el repo de backups.

**A mano, que es el camino que sigue siendo de acá:**

`GOOGLE_APPLICATION_CREDENTIALS=firebase/service-account.json pnpm backup`.
Contra el emulador, para ensayar sin tocar producción:
`FIRESTORE_EMULATOR_HOST=127.0.0.1:8280 BACKUP_PROJECT_ID=demo-stock pnpm backup`.

**El otro extremo.** `pnpm restore <archivo>` lo vuelve a escribir, y
`pnpm round-trip` es el ensayo completo contra el emulador: siembra, hace
backup, borra, **verifica que el borrado dejó cero**, restaura y compara. El
control negativo corre **primero** y no es opcional — rompe los datos a
propósito y exige que la comparación vea exactamente ese daño, porque una
comparación que nunca reportó una diferencia no es una comparación.

El dump lleva el origen en el nombre y en un campo `source`, los dos derivados
de la conexión que se abrió de verdad y nunca de un argumento. `restore` con
`--production` rechaza cualquier dump que no venga de producción y pide que
tipees el project id; un dump sin `source` (los anteriores a este campo) se
rechaza con instrucciones en vez de asumir, porque asumir «producción» dejaría
pasar justo los ensayos y asumir «emulador» bloquearía los backups reales.

El workflow del repo de backups lo corre los jueves a la mañana de Sídney, y
**nunca corrió todavía**: se validó que el YAML parsea y que los secrets
existen, que no es lo mismo que andar.

No corre hasta el **01/10/2026**, cuando se reinicia el ciclo de facturación.
Ese bloqueo sobrevive a que estos repos sean públicos: los minutos de un repo
público no facturan, pero el workflow no vive acá — vive en
`my-apps-backups`, que es **privado**, así que sus minutos salen de la cuota
de la cuenta y la cuota está agotada. El efecto secundario bueno es que, desde
que Stock y Gastos son públicos, esa cuota la gasta sólo ese repo.

**Su primera corrida del 01/10 es la medición que falta, y conviene mirarla a
propósito** en vez de leer el color: el camino sano ejercita el workflow
entero, así que a diferencia de una guarda que pasa sin hacer nada, acá un
verde significa algo. Lo que sigue sin medirse, nombrado para que quien mire
sepa qué mirar:

- **El checkout de este repo desde allá.** Se escribió sin token a propósito,
  contando con que estos repos fueran públicos. Desde el 16/09/2026 lo son, o
  sea que la condición está cumplida — lo que no está probado es que el paso
  funcione, que es otra cosa.
- **Las dos ramas de la matriz compitiendo al pushear.** Van en serie
  (`max-parallel: 1`) y el paso de commit hace `pull --rebase` antes del push,
  pero ninguna de las dos defensas se ejercitó nunca.

**El mismo job chequea que las reglas desplegadas coincidan con el repo**
(`kyber/scripts/check-rules-drift.mjs`). Las reglas son el único límite de seguridad
del proyecto y se despliegan a mano, así que un arreglo escrito, revisado,
mergeado y nunca desplegado se lee como hecho en todos los lugares donde alguien
miraría. Una diferencia **falla el job**, que es lo que manda el mail.

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

```sh
pnpm install
pnpm emulators          # Auth 9098, Firestore 8085, UI 4001
pnpm seed               # un hogar de mentira pero realista, en el emulador
pnpm dev                # Next.js en :3000 — NEXT_PUBLIC_USE_EMULATORS=1 para apuntar al emulador
pnpm test:rules         # tests de security rules (levanta su propio emulador, necesita Java)
pnpm test:web           # unit tests, incluidos los vectores compartidos
pnpm test               # todo
```

El emulador de Firestore escucha en **8085**, no en el 8080 habitual, justamente
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
- **No hay CI de iOS, a propósito.** Los runners de macOS facturan a 10x y la
  regla es que Actions no cueste nada, así que se compila y testea local antes de
  cada cambio:
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

**Para que el backup semanal corra hace falta un paso de consola, una sola vez:**

1. Firebase console → Project settings → **Service accounts** → *Generate new
   private key*. Guardala **fuera del repo** (o en `firebase/service-account.json`,
   que está gitignoreado).
2. GitHub → Settings → Secrets and variables → Actions → **New repository
   secret**, nombre `FIREBASE_SERVICE_ACCOUNT`, y pegá el JSON entero.

Sin ese secret el workflow **falla en el primer paso con un mensaje explícito**
en vez de correr y no guardar nada.

De a ratos, a mano: `GOOGLE_APPLICATION_CREDENTIALS=/ruta/key.json pnpm backup`.
Contra el emulador, para ensayar sin tocar producción:
`FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 BACKUP_PROJECT_ID=demo-stock pnpm backup`.

`.github/workflows/backup.yml` lo corre los jueves a la mañana de Sídney (el
cron está en UTC y tiene el offset explicado al lado) y guarda el dump como
artifact por 90 días, que es el techo del tier gratuito. Cuesta un par de los
2000 minutos mensuales.

**El mismo job chequea que las reglas desplegadas coincidan con el repo**
(`scripts/check-rules-drift.mjs`). Las reglas son el único límite de seguridad
del proyecto y se despliegan a mano, así que un arreglo escrito, revisado,
mergeado y nunca desplegado se lee como hecho en todos los lugares donde alguien
miraría. Una diferencia **falla el job**, que es lo que manda el mail.

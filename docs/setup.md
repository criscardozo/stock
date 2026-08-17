# Puesta a punto manual (una sola vez, todo free tier)

Los pasos marcados ⏳ los tiene que hacer Cristian en una consola web; el resto
se hace desde el repo. El desarrollo local **no necesita nada de esto**: corre
entero contra los emuladores (§5).

El proyecto de Firebase va a ser **`qcris-stock`**, separado del de Gastos
Diarios a propósito: cuota, reglas y Auth propios, así un bug de listeners acá no
quema las lecturas de la otra app. La config de cliente es pública por diseño —
la frontera de seguridad es `firebase/firestore.rules`, nunca el secreto de la
config.

## 1. Consola de Firebase ⏳

1. **Crear el proyecto** — ✅ hecho (`qcris-stock`).
2. **Firestore**: crear la base en **modo nativo**, sobre la base **`(default)`**
   (el free tier de Spark aplica sólo a ella). Ubicación: `australia-southeast1`.
   Empezar en **production mode** — las reglas reales se deployan desde el repo.
3. **Auth** → Authentication → Sign-in method → habilitar **Google**. Es el único
   proveedor, en las dos plataformas (ver PLAN §9).
4. **App web** ⏳: Project settings → Your apps → Web → registrar la app y pasar
   el objeto `firebaseConfig`. Los valores entran como variables
   `NEXT_PUBLIC_FIREBASE_*` (ver `apps/web/src/lib/firebase/config.ts`), que es
   lo único que falta para que la app hable con el proyecto real en vez del
   emulador.
5. **App iOS**: Your apps → iOS → bundle ID `dev.cardozo.stock`. Descargar
   `GoogleService-Info.plist` a `apps/ios/Stock/Resources/`, y mantener
   `CLIENT_ID` / `REVERSED_CLIENT_ID` en sync con el `GIDClientID` y el URL
   scheme de `apps/ios/project.yml` (re-correr `xcodegen` después de tocarlo).

Después, desde el repo:

```sh
firebase deploy --only firestore:rules,firestore:indexes --config firebase/firebase.json --project qcris-stock
```

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

1. Importar el repo de GitHub en Vercel; **Root Directory** = `apps/web`
   (framework Next.js; el install command autodetecta pnpm).
2. La config de Firebase va committeada en `apps/web/src/lib/firebase/config.ts`;
   opcionalmente se puede pisar con variables `NEXT_PUBLIC_FIREBASE_*`.
3. Agregar el dominio de producción (`*.vercel.app` y el custom) a Firebase Auth
   → Settings → **Authorized domains**, o el sign-in con Google falla con
   `auth/unauthorized-domain`.

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
pnpm emulators          # Auth 9099, Firestore 8085, UI 4000
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
- **Firma**: equipo personal (gratis) → certificado de 7 días; re-deploy semanal
  desde Xcode a cada teléfono. Es el camino $0 hasta la decisión del Apple
  Developer Program (PLAN Fase 5).
- Para apuntar al emulador, setear `USE_FIREBASE_EMULATORS=1` en el scheme o
  pasar `-useEmulators` como launch argument.

## 7. Backup (Fase 4, gratis)

Firestore no tiene export gestionado gratis, así que `pnpm backup` va a volcar el
proyecto entero (hogares + subcolecciones, users, invites) a un JSON con
timestamp en `backups/` (gitignored), usando una service account generada en
Project settings → **Service accounts** y guardada fuera del repo. El mismo
script corre semanalmente en GitHub Actions (Ubuntu) guardando el dump como
artifact por 90 días.

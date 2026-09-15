# Design system

La fuente de verdad del aspecto de Stock, en los dos clientes. Vive acá y no en
`docs/design/` porque ese directorio es el **handover** de Claude Design — un
bundle generado, ignorado por git, que puede no estar en un clone.

Stock y [Gastos Diarios](../README.md#familia) son la misma familia: mismo autor,
misma casa, mismo lenguaje visual. Lo que cambia entre las dos es el color de
marca (verde acá, coral allá) y el dominio. Todo lo demás —tipografía, escala,
medidas, orden de una pantalla de ajustes— es deliberadamente igual, así la
tercera app que salga ya tiene de dónde copiar.

## 1. Tipografía

Una sola familia: **Outfit**, en tres pesos (400/600/700). La web la sirve con
`next/font`; iOS la trae bundleada (`Outfit-Variable.ttf`) con fallback a la del
sistema redondeada.

La escala está definida **por rol, no por tamaño**. Nadie debería elegir "13px":
se elige `body` y el sistema decide cuánto mide.

| Rol | Web | iOS | Peso | Para qué |
|---|---|---|---|---|
| `hero` | 52–66 | — | 700 | Entrada de un número. Tabular, `-0.03em`. Gastos lo usa; Stock no tiene montos |
| `welcome` | 30 | 30 | 700 | El texto de bienvenida de Login y Onboarding. Sólo ahí |
| `amount` | — | 26–28 | 700 | El dato grande de la pantalla **Hoy — que sólo existe en iOS** |
| `title` | 22 | **18** | 700 | Título de pantalla |
| `heading` | 17 | 17 | 700 | Título de sheet o diálogo |
| `lead` | 15 | 15 | 600 | Valor destacado dentro de una card |
| `row` | **14** | **15** | 600 | La fila de una lista |
| `body` | 13 | 13 | 600 | Cuerpo secundario |
| `meta` | 12 | 12 | 400 / 600 | Metadato al costado, número chico |
| `caption` | 11.5 | 11.5 | 400 | Pie de sección. Siempre `ink-3` |
| `label` | 11 | 11 | 700 | Etiqueta de sección. Mayúsculas, `+0.07em` |

Cosas que parecen erratas y no lo son:

- **`amount` no existe en la web.** Es el tamaño de la pantalla Hoy, y Hoy es
  una pantalla de iOS únicamente — el vistazo rápido parado frente a la
  heladera. La web es donde te sentás el viernes a planificar; no tiene un
  "hoy", tiene `/plan`. No es una omisión, es que el rol describe una pantalla
  que un solo cliente tiene.
- **`row` mide 14 en web y 15 en iOS**, no 14/14.5 como decía esta tabla antes
  — 14.5 se colapsó a 14 en iOS cuando se unificó la escala de Stock consigo
  misma (dos plataformas con 20 tamaños distintos, 12 de ellos en una sola).
  Sigue siendo una decisión, no un error: un teléfono a distancia de brazo no
  es una ventana de navegador. Y no es perfectamente parejo ni en la propia
  web — la fila de `falta-comprar` usa 15, como iOS, mientras el resto de las
  listas usa 14. Documentado así en vez de limado a la fuerza: la evidencia no
  dice cuál de las dos es la que hay que generalizar.
- **`body` va en 600, no en 400.** Es el peldaño más usado de las dos apps
  (13/600 ×38 en la web de Gastos). El 400 existe pero es minoría.
- **`meta` cambia de peso entre plataformas**, no de tamaño: 400 en la web
  (`text-xs`, sin `font-weight`), 600 en iOS (`.semibold`). Mismo rol, mismo
  tamaño, un peso que nadie igualó todavía.

iOS titula **más chico que la web** (18 contra 22) y lo hace con un `Text` dentro
del scroll, no con `navigationTitle` — el título grande de UIKit no es de este
sistema.

Reglas que no están en la tabla:

- **Todo número lleva cifras tabulares** (`font-variant-numeric: tabular-nums`,
  `.monospacedDigit()`). Sin eso el número salta al cambiar de dígito, y en una
  pantalla que se mira todo el día se nota.
- **Las cifras grandes llevan tracking negativo.** A 52px+ Outfit se abre demasiado.
- **iOS usa tamaño fijo, no Dynamic Type.** Los layouts están medidos a mano.
- **En un campo táctil, nunca menos de 16px.** iOS Safari hace zoom del viewport
  si enfocás un input más chico, y la web vive como PWA en un teléfono.

## 2. Color

Los valores viven en `apps/web/src/app/globals.css` (`:root` + el bloque oscuro)
y en `apps/ios/Stock/Design/Theme.swift`, uno a uno. **No se inventan colores.**

Stock es la app verde; Gastos Diarios es la coral. Es lo único que cambia entre
las dos.

Estos valores son **extraídos**, no copiados a mano: `design-system/tokens.json`
es la fuente, generada desde los dos archivos de arriba por
`design-system/extract.py`, y `design-system/emit.py --write` los reescribe
desde ahí. La tabla se puede quedar desactualizada; el JSON, si sigue el
procedimiento, no puede — `pnpm test:web` lo comprueba en cada corrida.

| Rol | Claro | Oscuro |
|---|---|---|
| `ground` | `#F4F4F4` | `#161616` |
| `surface` | `#FCFCFC` | `#212121` |
| `ink` | `#1F1F1F` | `#EEEEEE` |
| `ink-2` | `#5A5A5A` | `#A1A1A1` |
| `ink-3` | `#4F4F4F` | `#919191` |
| `primary` | `#2E9E5B` | `#45BC72` |
| `primary-deep` | `#1D7A43` | `#7FD79E` |
| `on-primary` | `#FFFFFF` | `#0F1A12` |
| `danger` | `#E5484D` | `#FF6B6E` |

**`ink-3` es más oscuro que `ink-2`** en los dos modos, pese al nombre —
"terciario" describe cuán seguido se usa, no cuán fuerte se ve. No es un
alias a corregir: `caption` usa `ink-3` a propósito porque necesita MÁS
contraste que `body`, sólo que se usa menos.

Hasta el 15/09/2026 los tres tonos de gris claro (`ink-2`, `ink-3` y la
`ink-4` que no entra en esta tabla familiar) estaban por debajo del piso AA de
WCAG contra `ground` **y** contra `surface` — `ink-2` daba 3.70:1 contra
`surface`, y `ink-4` (usada en 11 lugares) daba 2.35:1 contra `ground`, la
peor de las tres y la única que nunca se había medido. Se llevaron los tres a
un mismo factor de luminancia relativa que asegura ≥4.5:1 contra los dos
fondos, preservando el orden entre ellos. `tokens.test.ts` calcula WCAG desde
cero y lo sostiene.

Lo que hay que entender del modo oscuro:

- **No es un filtro invertido.** El acento *sube* a un verde más claro para
  sobrevivir sobre fondo oscuro, y por eso el texto *encima* del acento pasa de
  blanco a casi negro. Ese giro es `on-primary`: nunca `text-white` sobre un color.
  > Esto **no** es un desvío del sistema de la familia, aunque lo parezca. La regla
  > es "el acento conserva su identidad, ajustando luminosidad si el fondo lo
  > exige" — el resto de los colores ya lo hacía.
  >
  > Y no se sube por accesibilidad: medido, `#2E9E5B` sobre `#161616` (`ground`
  > oscuro) da **5.31:1** y pasa AA holgado (el coral de Gastos da 5.96:1 sobre
  > el suyo — más margen, no otra categoría). Se sube porque **sobre tarjeta**
  > `#212121` cae a **4.72:1**, que pasa AA raspando, y porque `#45BC72` llega a
  > **7.49:1** y alcanza AAA. Es una preferencia fundada, no una corrección
  > obligatoria.
- **`primary-deep` es más claro que `primary` en oscuro.** Sirve para texto de
  acento, no como "la versión oscura". Un degradado `primary → primary-deep` se
  invierte de noche: para eso están `mark-from` / `mark-to`.
- **Un token que cambia con el tema no sirve para la marca.** El ícono es verde con
  la bolsa crema en los dos modos; pintar la bolsa con `surface` la convierte en un
  agujero cuando el tema cambia.

## 3. Forma

Las tarjetas **no llevan sombra**: se separan del fondo por un borde de 1px. La
única sombra del sistema es la del CTA primario, y es **de color** — el acento al
35 %, nunca negro.

Los radios tienen nombre de rol, no de valor — `--radius-card` sobrevive a la
decisión de hacer las tarjetas más redondeadas sin tener que releer cada uso
para saber cuál era una tarjeta. Gastos Diarios los nombra por valor (`r18`);
la decisión de familia, al cruzar los dos sistemas, fue la convención de Stock.

| Elemento | Valor |
|---|---|
| Tarjeta (`card`, `panel`) | radio **18** · borde 1px · sin sombra |
| Sheet (`sheet`) | radio 24 |
| Nav (`nav`) | radio 12 |
| Pill, chip, botón secundario | radio 999 |
| CTA primario | cápsula, 54–58px de alto · sombra del acento al 35 % |
| Campo (`field`) | radio 10 |
| Padding horizontal de pantalla | 16 web (`px-4`, 28 desde `lg`) · 20 iOS |
| Padding horizontal de card | 18 |
| Separación entre elementos | 6 · 8 · 10 · 12 (los cuatro que cubren casi todo) |

## 4. Anatomía de una pantalla

Las cinco pantallas de Stock y las de Gastos tienen la misma estructura, y
conviene que la sexta también:

```
ScrollView
└── VStack (spacing 18)
    └── por sección:
        ├── SectionLabel      ← `label`, uppercase
        ├── Card              ← surface + borde `line`, radio 18
        │   └── filas separadas por `line-soft`
        └── caption           ← la nota que explica, opcional
```

**Nunca un `List` de UIKit ni un `Form`.** Traen sus propios grises (negro puro
detrás de filas `#1C1C1E` en oscuro) y se ven como otra app al lado de las demás.
Ajustes de iOS fue así hasta que se rehizo con este patrón.

## 5. Ajustes, en orden

El orden lo fijó Gastos Diarios y Stock lo copia: **primero lo que venís a
cambiar, después lo que venís a mirar**, y al final quién sos y cómo te vas.

1. La configuración del dominio (el plan; en Gastos, el presupuesto)
2. Preferencias (apariencia)
3. Avisos — **sólo iOS** ("Vencimientos": el aviso de expiración lo programa el
   dispositivo, y eso es una capacidad nativa que la PWA no tiene)
4. Catálogo — la web lo muestra como dos secciones, **Ubicaciones** y
   **Categorías**; iOS las junta bajo un solo título. Mismo contenido, un
   encabezado de diferencia
5. Compras — **sólo web** ("Importar un PDF de Coles": actualiza precios de
   referencia desde un ticket). No tiene equivalente en iOS todavía
6. Hogar, con la invitación adentro — quién está y cómo entra otro es un solo tema
7. La app: versión, build y vencimiento de la firma
8. Cerrar sesión, en rojo, como card

Sin zona horaria: se elige una vez al crear el hogar y se sigue usando para todas
las fechas, pero no es algo que se toque otra vez.

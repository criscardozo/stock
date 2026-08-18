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
| `hero` | 52–66 | — | 700 | Entrada de un número. Tabular, `-0.03em` |
| `amount` | 34 | 26 | 700 | La cifra o el dato grande de una card |
| `title` | 22 | **18** | 700 | Título de pantalla |
| `heading` | 17 | 17 | 700 | Título de sheet o diálogo |
| `lead` | 15 | 15 | 600 | Valor destacado dentro de una card |
| `row` | **14** | **14.5** | 600 | La fila de una lista. El peldaño más usado |
| `body` | 13 | 13 | 600 | Cuerpo secundario |
| `meta` | 12.5 | 12.5 | 600 | Metadato al costado, número chico |
| `caption` | 11.5 | 11.5 | 400 | Pie de sección. Siempre `ink-3` |
| `label` | 11 | 11 | 700 | Etiqueta de sección. Mayúsculas, `+0.07em` |

Dos cosas que parecen erratas y no lo son:

- **`row` mide 14 en web y 14.5 en iOS.** Medido sobre Gastos: la web usa 14/600
  en 25 lugares y iOS usa 14.5/semibold en 21. Ninguno es el correcto — un
  teléfono a distancia de brazo no es una ventana de navegador. Una decisión,
  dos expresiones, igual que el título.
- **`body` va en 600, no en 400.** Es el peldaño más usado de las dos apps
  (13/600 ×38 en la web de Gastos). El 400 existe pero es minoría.

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

| Rol | Claro | Oscuro |
|---|---|---|
| `ground` | `#F3F4EE` | `#141813` |
| `surface` | `#FCFCF8` | `#1E231C` |
| `ink` | `#1B2119` | `#ECEFE9` |
| `ink-2` | `#7C8578` | `#9AA396` |
| `ink-3` | `#6E776A` | `#8A9386` |
| `primary` | `#2E9E5B` | `#45BC72` |
| `primary-deep` | `#1D7A43` | `#7FD79E` |
| `on-primary` | `#FFFFFF` | `#0F1A12` |
| `danger` | `#E5484D` | `#FF6B6E` |

Lo que hay que entender del modo oscuro:

- **No es un filtro invertido.** El acento *sube* a un verde más claro para
  sobrevivir sobre fondo oscuro, y por eso el texto *encima* del acento pasa de
  blanco a casi negro. Ese giro es `on-primary`: nunca `text-white` sobre un color.
  > Esto **no** es un desvío del sistema de la familia, aunque lo parezca. La regla
  > es "el acento conserva su identidad, ajustando luminosidad si el fondo lo
  > exige" — el resto de los colores ya lo hacía.
  >
  > Y no se sube por accesibilidad: medido, `#2E9E5B` sobre `#141813` da **5.26:1**
  > y pasa AA holgado (el coral de Gastos da 5.96:1 — más margen, no otra
  > categoría). Se sube porque **sobre tarjeta** `#1E231C` cae a **4.69:1**, que
  > pasa AA raspando, y porque `#45BC72` llega a **7.43:1** y alcanza AAA. Es una
  > preferencia fundada, no una corrección obligatoria.
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

| Elemento | Valor |
|---|---|
| Tarjeta | radio 20–24 · borde 1px · sin sombra |
| Pill, chip, botón secundario | radio 999 |
| CTA primario | cápsula, 54–58px de alto · sombra del acento al 35 % |
| Campo / tecla | radio 13–15 |
| Padding horizontal de pantalla | 20 |
| Padding horizontal de card | 18 |
| Separación entre elementos | 6 · 8 · 10 · 12 (los cuatro que cubren casi todo) |
| Alto mínimo de fila táctil | 44 |

## 4. Anatomía de una pantalla

Las cinco pantallas de Stock y las de Gastos tienen la misma estructura, y
conviene que la sexta también:

```
ScrollView
└── VStack (spacing 18)
    └── por sección:
        ├── SectionLabel      ← `label`, uppercase
        ├── Card              ← surface + borde `line`, radio 20
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
3. Avisos
4. Catálogo
5. Hogar, con la invitación adentro — quién está y cómo entra otro es un solo tema
6. La app: versión, build y vencimiento de la firma
7. Cerrar sesión, en rojo, como card

Sin zona horaria: se elige una vez al crear el hogar y se sigue usando para todas
las fechas, pero no es algo que se toque otra vez.

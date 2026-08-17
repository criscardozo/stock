'use client'

/**
 * Manual theme preference, per device, in localStorage.
 *
 * "system" follows the OS through the `prefers-color-scheme` block in
 * globals.css; "light"/"dark" force the tokens via `html[data-theme]`. A tiny
 * blocking script in layout.tsx applies the stored value before first paint, so
 * a forced theme never flashes the other one.
 *
 * Same shape as Gastos Diarios, deliberately — see docs/reglas.md §10.
 */
export type ThemePref = 'system' | 'light' | 'dark'

export const THEME_STORAGE_KEY = 'stock:theme'

/** Page backgrounds, mirrored from the tokens in globals.css. */
const THEME_COLORS = { light: '#2E9E5B', dark: '#141813' } as const

/** Whatever came out of storage, narrowed to a preference. */
export function asThemePref(value: string | null): ThemePref {
  return value === 'light' || value === 'dark' ? value : 'system'
}

/** Applies the preference to `<html data-theme>` and the theme-color metas. */
export function applyTheme(pref: ThemePref): void {
  const root = document.documentElement
  if (pref === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', pref)

  // The metas carry prefers-color-scheme queries; when a theme is forced, both
  // must show the forced colour so the browser chrome matches regardless of
  // what the system is set to.
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((meta) => {
    const systemColor = meta.media.includes('dark') ? THEME_COLORS.dark : THEME_COLORS.light
    meta.content = pref === 'system' ? systemColor : THEME_COLORS[pref]
  })
}

'use client'

import { useEffect } from 'react'
import tokens from '../../../../design-system/tokens.json'

/**
 * A crash in the ROOT LAYOUT — the providers, the font, the shell.
 *
 * `error.tsx` catches a page that throws; it cannot catch the layout it lives
 * inside. Without this file that case gets Next's own screen: a stack trace, in
 * English, which reads as somebody else's error. This one replaces the whole
 * document, so it renders `<html>` and `<body>` itself.
 *
 * It depends on nothing that may be what broke: no providers, no app CSS, no
 * next/font. The colours come from design-system/tokens.json — the palette's
 * source — rather than being retyped, so this screen cannot drift from it, and
 * both appearances are covered by a style block carried in the document.
 *
 * Shape ported from Gastos Diarios' crash screen, including the build stamp,
 * which is what makes a screenshot of this worth anything a week later.
 */
const { core, accent } = tokens.color

function scheme(mode: 'light' | 'dark') {
  return [
    `--ground:${core.ground.$value[mode]}`,
    `--ink:${core.ink.$value[mode]}`,
    `--ink-2:${core['ink-secondary'].$value[mode]}`,
    `--ink-3:${core['ink-tertiary'].$value[mode]}`,
    `--primary:${accent.primary.$value[mode]}`,
    `--on-primary:${accent['on-primary'].$value[mode]}`,
  ].join(';')
}

const PALETTE = `:root{${scheme('light')}}@media (prefers-color-scheme:dark){:root{${scheme('dark')}}}`

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Not swallowed: nothing else would report it.
    console.error('Root layout error', error)
  }, [error])

  return (
    <html lang="es">
      <head>
        <style>{PALETTE}</style>
      </head>
      <body
        style={{
          margin: 0,
          minHeight: '100dvh',
          display: 'grid',
          placeItems: 'center',
          padding: '24px',
          boxSizing: 'border-box',
          background: 'var(--ground)',
          color: 'var(--ink)',
          fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        }}
      >
        <div style={{ maxWidth: '360px', textAlign: 'center' }}>
          <h1 style={{ fontSize: '22px', fontWeight: 700, margin: '0 0 8px' }}>Se rompió algo</h1>
          <p style={{ fontSize: '14px', lineHeight: 1.5, margin: '0 0 20px', color: 'var(--ink-2)' }}>
            La app no se pudo abrir. Los datos están a salvo — esto pasó acá, en el teléfono, no en
            el servidor. Probá de nuevo, y si vuelve a pasar, cerrá y volvé a abrir la app.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              font: 'inherit',
              fontSize: '15px',
              fontWeight: 700,
              color: 'var(--on-primary)',
              background: 'var(--primary)',
              border: 'none',
              borderRadius: '999px',
              padding: '13px 28px',
              cursor: 'pointer',
              touchAction: 'manipulation',
            }}
          >
            Reintentar
          </button>
          <p
            style={{
              fontSize: '11px',
              margin: '20px 0 0',
              color: 'var(--ink-3)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {process.env.NEXT_PUBLIC_APP_VERSION} · {process.env.NEXT_PUBLIC_BUILD_SHA}
            {error.digest !== undefined ? ` · ${error.digest}` : ''}
          </p>
        </div>
      </body>
    </html>
  )
}

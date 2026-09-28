import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import tokens from '../../../../design-system/tokens.json'
import GlobalError from './global-error'

/**
 * The screen that renders when the root layout itself threw. Its whole job is
 * to stand up with nothing else working, so it is rendered here with nothing
 * else: no providers, no app CSS, no layout.
 */
describe('the root-layout crash screen', () => {
  const html = renderToStaticMarkup(
    <GlobalError error={Object.assign(new Error('boom'), { digest: 'd1' })} reset={() => {}} />,
  )

  it('is a whole Spanish document on its own', () => {
    expect(html).toContain('<html lang="es">')
    expect(html).toContain('Se rompió algo')
    expect(html).toContain('Reintentar')
    expect(html).toContain('d1')
  })

  it('takes its colours from the palette source, in both appearances', () => {
    // Read from tokens.json here too rather than written as hex: a guard that
    // spells the value is the next copy of it.
    const { core, accent } = tokens.color
    for (const mode of ['light', 'dark'] as const) {
      expect(html).toContain(core.ground.$value[mode])
      expect(html).toContain(accent.primary.$value[mode])
    }
    expect(html).toContain('prefers-color-scheme:dark')
  })
})

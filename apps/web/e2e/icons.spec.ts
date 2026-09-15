import { expect, test, type Page } from '@playwright/test'

/**
 * Every icon the app draws resolved to a GLYPH, not to its own name.
 *
 * `icons.test.ts` already holds `ICON_NAMES` against the icons it can find in
 * the source, in both directions. This is the guard for what that one cannot
 * see: it sweeps four syntactic shapes, and an icon written a fifth way is
 * invisible to it. Then the name is missing from the subsetted font request,
 * the glyph is not in the file, and Material Symbols — a ligature font —
 * renders the literal word. Everything stays green.
 *
 * That is not hypothetical. `login`, the icon on the button of the first screen
 * anyone sees, shipped that way: the sweep knew `<Icon name="x" />` and not
 * `<PrimaryAction icon="x" />`, so the list was "complete" over a set that was
 * missing one. A person looking at the browser found it, which is the check
 * this file replaces.
 *
 * WIDTH is the discriminator, and it has to be: `innerText` returns the
 * ligature text either way, so reading the DOM cannot tell a drawn glyph from
 * an undrawn word. A Material Symbols glyph is one em wide by construction; the
 * word `calendar_month` in the fallback face is roughly seven. The threshold
 * below sits far from both.
 */
const WIDEST_A_GLYPH_CAN_BE = 2 // em

async function signIn(page: Page, path: string) {
  await page.goto(path)
  await page.getByRole('button', { name: 'Entrar como cristian' }).click()
  await expect(page.getByRole('button', { name: 'Entrar como cristian' })).toBeHidden()
}

/**
 * Every `.ms` span on the page that is actually laid out, with its ratio.
 *
 * Waits for the icons THEMSELVES, not for a signal about them. Two probes were
 * tried first and both were measured to be useless here:
 *
 * `document.fonts.check('19px "Material Symbols Rounded"')` returns TRUE with
 * the font request blocked outright — measured, with fonts.googleapis.com
 * aborted at the route level and every icon rendering as its own word. A probe
 * that cannot give the contrary answer is not a probe.
 *
 * And waiting only for the sign-in button to disappear is too early: measured,
 * the page holds ZERO `.ms` spans at that moment and 92 a second and a half
 * later. That is what failed in CI — not a missing glyph, the anti-vacuity
 * assertion firing on a screen that had not rendered yet, which is what it is
 * for.
 */
async function iconsOnPage(page: Page) {
  // Two waits, and neither is the condition under test — waiting for the icons
  // to be NARROW would be waiting for the assertion to pass, which is a test
  // that cannot fail.
  //
  // First: the spans exist. React has not rendered them at sign-in.
  await page.waitForFunction(() => document.querySelectorAll('span.ms').length > 3)
  // Then: font loading has SETTLED. `fonts.ready` resolves either way — when
  // the face arrives and when the request fails — so it is a wait, not a
  // verdict. Without it the measurement lands inside the `display=block` swap,
  // where the fallback word is already drawn and the glyph is not: measured,
  // that reports every icon on every screen as 3 to 6 em wide.
  await page.evaluate(() => document.fonts.ready)

  return page.evaluate(() =>
    [...document.querySelectorAll('span.ms')]
      .map((el) => {
        const rect = el.getBoundingClientRect()
        const size = parseFloat(getComputedStyle(el).fontSize)
        return { name: el.textContent ?? '', width: rect.width, size }
      })
      // A span inside a closed sheet has no box; it is not being drawn, so it
      // is not evidence either way.
      .filter((icon) => icon.width > 0 && icon.size > 0)
  )
}

const SCREENS = ['/stock', '/falta-comprar', '/plan', '/recetas', '/ajustes'] as const

for (const screen of SCREENS) {
  test(`every icon on ${screen} is a glyph, not its own name`, async ({ page }) => {
    await signIn(page, screen)
    const icons = await iconsOnPage(page)

    // A screen that rendered no icons proves nothing, and every one of these
    // has several — the tab bar alone is five.
    expect(icons.length, `${screen} rendered no icons at all`).toBeGreaterThan(3)

    const unresolved = icons
      .filter((icon) => icon.width / icon.size > WIDEST_A_GLYPH_CAN_BE)
      .map((icon) => `${icon.name} (${(icon.width / icon.size).toFixed(1)} em wide)`)

    // "The font never arrived" and "this glyph is not in the subset" are
    // different failures with different owners, and a guard that reports the
    // second for the first cries wolf. `document.fonts` discriminates and does
    // not lie about it — measured both ways: with the request served the face
    // is present and `loaded`, with fonts.googleapis.com aborted at the route
    // level the list is EMPTY.
    //
    // (`document.fonts.check()` was tried first and returns true in both, which
    // is why it is not used anywhere in this file.)
    const face = await page.evaluate(() =>
      [...document.fonts].some((f) => f.family.includes('Material Symbols'))
    )
    expect(
      face,
      `the Material Symbols face never arrived on ${screen}: this environment ` +
        `has no route to Google Fonts, which is not the subset's fault — though ` +
        `a user in it sees words instead of icons`
    ).toBe(true)

    expect(unresolved).toEqual([])
  })
}

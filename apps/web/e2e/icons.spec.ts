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

/** Every `.ms` span on the page that is actually laid out, with its ratio. */
async function iconsOnPage(page: Page) {
  // The font has to have loaded, or every icon is mid-swap and measures as the
  // fallback — which is the exact failure being looked for, reported on all of
  // them at once. `display=block` means there is a moment where nothing is
  // drawn; waiting for the face is what makes this test about the subset
  // rather than about timing.
  await page.evaluate(() => document.fonts.ready)
  await page.waitForFunction(() => document.fonts.check('19px "Material Symbols Rounded"'))

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
    expect(unresolved).toEqual([])
  })
}

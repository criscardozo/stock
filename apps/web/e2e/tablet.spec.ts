import { expect, test } from '@playwright/test'

/**
 * The adaptive layout, at the width it was built for.
 *
 * The PWA is how this app lives on an iPad — there is no iPad build of the iOS
 * one, and that is deliberate: `TARGETED_DEVICE_FAMILY` is iPhone, and the
 * reason the web is installable in the first place is to be the surface Apple
 * signing does not gate. So "adaptive layout for iPad" is a claim about this
 * suite, and until now it was a claim nobody had checked.
 *
 * The default viewport in playwright.config.ts is a phone, so every other spec
 * here exercises the narrow layout. This one exercises the other branch, and
 * only the parts that actually switch — a screenshot would pass on any change
 * that still rendered something.
 */
test.use({ viewport: { width: 1024, height: 1366 } })

test('the sidebar replaces the bottom bar', async ({ page }) => {
  await page.goto('/stock')
  await page.getByRole('button', { name: 'Entrar como cristian' }).click()
  await expect(page.getByRole('button', { name: 'Entrar como cristian' })).toBeHidden()

  // Both navigations exist in the DOM at every width; which one is VISIBLE is
  // the whole of the switch, so that is what this asserts.
  const links = page.getByRole('link', { name: 'Stock' })
  await expect(links.first()).toBeVisible()
  const visible = await links.evaluateAll((all) =>
    all.filter((el) => (el as HTMLElement).offsetParent !== null).length,
  )
  expect(visible).toBe(1)

  // The sidebar carries the household's name, which the phone header does not.
  await expect(page.getByText('Casa Cardozo')).toBeVisible()
})

test('a fortnight shows its two weeks side by side', async ({ page }) => {
  await page.goto('/plan')
  // Clicked unconditionally. A `count()` guard was written here first, to
  // tolerate an existing session — the same mistake this suite made earlier
  // today and wrote down: `count()` does not wait, so on a fresh context it
  // returns 0 before the page paints and the test drives a logged-out screen.
  // Writing the lesson down did not stop me repeating it three hours later.
  await page.getByRole('button', { name: 'Entrar como cristian' }).click()
  await expect(page.getByRole('button', { name: 'Entrar como cristian' })).toBeHidden()

  // The precondition, stated. A fortnight is what produces two "Semana" labels
  // at all — a weekly period renders none — so if a previous spec leaves the
  // household on weekly this fails saying so, instead of timing out on a
  // missing label and looking like a layout regression.
  await expect(page.getByText('Semana 1')).toBeVisible()

  // Stacked on a phone, two columns here. Asserted by geometry rather than by
  // class name: what matters is that week 2 sits BESIDE week 1, not that some
  // particular utility is present.
  const first = await page.getByText('Semana 1').boundingBox()
  const second = await page.getByText('Semana 2').boundingBox()
  expect(first).not.toBeNull()
  expect(second).not.toBeNull()
  expect(second!.x).toBeGreaterThan(first!.x + 200)
  expect(Math.abs(second!.y - first!.y)).toBeLessThan(40)
})

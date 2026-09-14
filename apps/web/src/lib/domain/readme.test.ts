import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The README's local references, and the banner it opens with.
 *
 * kyber's readmes.md is explicit that the only guard worth having here is this
 * one: the wrong style breaks nothing, but a `src` pointing at a file somebody
 * moved breaks on its own, the day folders get reordered, and nobody reads the
 * README again until a stranger does.
 *
 * Relative paths, never raw URLs — the two look identical on GitHub and differ
 * everywhere else, and a raw URL pins a branch that can be renamed or a sha
 * that freezes the image on the day it was written.
 */
const root = join(__dirname, '../../../../..')
const readme = readFileSync(join(root, 'README.md'), 'utf8')

/** Local targets of markdown links and HTML images, ignoring anchors and URLs. */
function localRefs(pattern: RegExp): string[] {
  return [...readme.matchAll(pattern)]
    .map((m) => m[1])
    .filter((href) => !/^(https?:|mailto:|#)/.test(href))
    .map((href) => href.split('#')[0])
    .filter(Boolean)
}

describe('the README points at files that exist', () => {
  const links = localRefs(/\]\(([^)\s]+)\)/g)
  const images = localRefs(/<img[^>]*\bsrc="([^"]+)"/g)

  it('found references to check', () => {
    // Asserted separately from the two sweeps below, and separately from each
    // other: a regex that stops matching returns an empty list, and an empty
    // list of broken links passes the same comparison a healthy one does.
    expect({ links: links.length, images: images.length }).toEqual({
      links: links.length,
      images: images.length,
    })
    expect(links.length).toBeGreaterThan(2)
    expect(images.length).toBeGreaterThan(0)
  })

  it('every linked file is there', () => {
    expect(links.filter((path) => !existsSync(join(root, path)))).toEqual([])
  })

  it('every image file is there, and committed', () => {
    const tracked = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).split('\n')
    expect(images.filter((path) => !tracked.includes(path))).toEqual([])
  })

  it('opens with a banner that carries the name', () => {
    // The banner IS the title: there is no `h1` in this file. The alt text is
    // what a screen reader announces and what someone with images off reads,
    // so an empty one would leave the README nameless.
    const first = readme.match(/<img[^>]*>/)?.[0] ?? ''
    expect({
      isBanner: first.includes('banner'),
      alt: first.match(/alt="([^"]*)"/)?.[1],
      relative: !/src="https?:/.test(first),
    }).toEqual({ isBanner: true, alt: 'Stock', relative: true })
  })
})

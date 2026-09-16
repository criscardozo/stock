import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = join(__dirname, '../../../../..')

/**
 * `/favicon.ico` exists and every entry in it says the truth about its image.
 *
 * The file exists because the crawlers that build site icons start at
 * `/favicon.ico` and do not read SVG — browsers are perfectly happy with
 * `icon.svg`, so the absence shows up somewhere else entirely: blank in a
 * password manager, blank in anything that keeps a thumbnail, and the only
 * trace is a 404 in a console nobody here is looking at.
 *
 * It lives in `public/` and not `app/` deliberately. An `app/favicon.ico` is
 * metadata the build DECODES, and its decoder rejects anything that is not
 * RGBA — a converter writing 8-bit RGB for an opaque drawing makes the build
 * fail. From `public/` it is served byte for byte.
 *
 * What this checks is the half a viewer will not tell you about: the directory
 * carries a width and height PER ENTRY, and nothing makes them agree with the
 * image they point at. An entry claiming 32×32 over a 16×16 PNG opens fine and
 * draws at the wrong size.
 */
const ICO = join(root, 'apps/web/public/favicon.ico')

type Entry = { claimed: [number, number]; actual: [number, number]; offset: number }

function entries(ico: Buffer): Entry[] {
  expect(ico.readUInt16LE(0), 'not an ICO: reserved field').toBe(0)
  expect(ico.readUInt16LE(2), 'not an ICO: type should be 1').toBe(1)
  const count = ico.readUInt16LE(4)

  return Array.from({ length: count }, (_, i) => {
    const at = 6 + 16 * i
    // 0 in the directory means 256 — the field is one byte.
    const claimedW = ico[at] === 0 ? 256 : ico[at]
    const claimedH = ico[at + 1] === 0 ? 256 : ico[at + 1]
    const size = ico.readUInt32LE(at + 8)
    const offset = ico.readUInt32LE(at + 12)
    const image = ico.subarray(offset, offset + size)

    // Read the PNG's own IHDR rather than trusting the directory. That is the
    // whole point: these two are independent claims about one image.
    expect(image.subarray(0, 8).toString('hex'), 'entry is not a PNG').toBe('89504e470d0a1a0a')
    return {
      claimed: [claimedW, claimedH],
      actual: [image.readUInt32BE(16), image.readUInt32BE(20)],
      offset,
    }
  })
}

describe('the favicon a crawler will ask for', () => {
  const ico = readFileSync(ICO)

  it('carries the sizes the icon set already ships', () => {
    const found = entries(ico).map((e) => e.actual[0])
    // Exact, and the population is closed by this test: these are the two
    // favicon PNGs `build-icons.sh` renders, not an open set that grows.
    expect(found.sort((a, b) => a - b)).toEqual([16, 32])
  })

  it('no entry claims a size its image does not have', () => {
    const lying = entries(ico)
      .filter((e) => e.claimed[0] !== e.actual[0] || e.claimed[1] !== e.actual[1])
      .map((e) => `entry at ${e.offset}: directory says ${e.claimed.join('×')}, PNG is ${e.actual.join('×')}`)
    expect(lying).toEqual([])
  })

  it('every entry is the byte-for-byte PNG that was rendered', () => {
    // The packer re-encodes nothing, so each blob must equal the file on disk.
    // If it ever stops being true, the icon in a crawler's cache and the icon
    // in the app have quietly become two different drawings.
    const wrong: string[] = []
    for (const size of [16, 32]) {
      const png = readFileSync(join(root, `apps/web/public/icons/favicon-${size}.png`))
      if (!ico.includes(png)) wrong.push(`favicon-${size}.png is not inside favicon.ico verbatim`)
    }
    expect(wrong).toEqual([])
  })
})

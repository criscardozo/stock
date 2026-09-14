// Where this repo starts, found by walking up to `.kyber/config.json`.
//
// TEMPORARY: replaced by kyber/scripts/lib/consumer.mjs once the submodule
// lands. It exists now because the scripts below it must stop computing the
// root with a single `resolve(dirname(import.meta.url), "..")` BEFORE they move
// one directory deeper into `kyber/scripts/`, where that idiom resolves to the
// wrong repo — silently. Nothing errors; backup writes its dump into the
// submodule and round-trip wipes whatever it finds there.
//
// `git rev-parse --show-toplevel` is the obvious fix and is the same trap with
// another face: run from inside the submodule it returns kyber's root, not the
// consumer's. So the marker is the consumer's own config file, and a miss is
// loud and says where it looked.

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, parse } from 'node:path'

const MARKER = join('.kyber', 'config.json')

export function consumerRoot(from = import.meta.dirname) {
  const tried = []
  let dir = from
  for (;;) {
    tried.push(dir)
    if (existsSync(join(dir, MARKER))) return dir
    const parent = dirname(dir)
    if (parent === dir || dir === parse(dir).root) break
    dir = parent
  }
  throw new Error(
    `No encontré ${MARKER} subiendo desde ${from}.\n` +
      `  Miré en:\n${tried.map((d) => `    ${d}`).join('\n')}\n` +
      `  Si estás en un consumidor de kyber, ese archivo tiene que existir en su raíz.`,
  )
}

/** The consumer's config, checking only the keys the caller says it reads. */
export function consumerConfig(required = []) {
  const root = consumerRoot()
  const config = JSON.parse(readFileSync(join(root, MARKER), 'utf8'))
  const missing = required.filter((key) => config[key] === undefined)
  if (missing.length > 0) {
    throw new Error(`${MARKER} no declara: ${missing.join(', ')}`)
  }
  return { root, ...config }
}

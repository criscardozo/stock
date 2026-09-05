#!/usr/bin/env node
/**
 * Runs the rules tests on a port that is actually free.
 *
 * `firebase emulators:exec` takes its port from firebase.json, so a busy 8085
 * ends the run with "Could not start Firestore Emulator, port taken" — which
 * reads exactly like a broken test suite and sends you looking at the rules.
 * It happened here on 2026-09-05: the port was held by this repo's own
 * long-running emulators, started for the E2E suite minutes earlier.
 *
 * The port is not a fixed fact worth defending. This asks the OS for a free one
 * and tells both halves about it: the emulator through a temporary config, and
 * the tests through FIRESTORE_EMULATOR_PORT, which `test/helpers.ts` already
 * honoured.
 *
 * Ported from Gastos Diarios, which hit the same thing with Docker on 8080.
 */
import { createServer } from 'node:net'
import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

/** A port the OS says is free right now. */
function freePort() {
  return new Promise((ok, fail) => {
    const server = createServer()
    server.unref()
    server.on('error', fail)
    // Port 0 means "you choose": the OS hands back one nothing is using,
    // which is a stronger answer than probing a number we picked.
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close(() => ok(port))
    })
  })
}

const firebaseDir = resolve(import.meta.dirname, '..')
const port = await freePort()

// Absolute paths, because the config no longer sits beside the rules it names.
const dir = mkdtempSync(join(tmpdir(), 'stock-rules-'))
const config = join(dir, 'firebase.json')
writeFileSync(
  config,
  JSON.stringify({
    firestore: {
      rules: join(firebaseDir, 'firestore.rules'),
      indexes: join(firebaseDir, 'firestore.indexes.json'),
    },
    emulators: { firestore: { port }, singleProjectMode: true },
  }),
)

const child = spawn(
  'firebase',
  ['emulators:exec', '--only', 'firestore', '--project', 'demo-stock', '--config', config, 'vitest run'],
  { stdio: 'inherit', env: { ...process.env, FIRESTORE_EMULATOR_PORT: String(port) } },
)

child.on('exit', (code, signal) => {
  rmSync(dir, { recursive: true, force: true })
  // The child's status, not this script's. A wrapper that swallows a non-zero
  // exit is the same failure as the port one: green output, red reality.
  process.exit(signal ? 1 : (code ?? 1))
})

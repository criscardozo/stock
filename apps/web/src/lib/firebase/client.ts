'use client'

import { getApp, getApps, initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth } from 'firebase/auth'
import {
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  getFirestore,
} from 'firebase/firestore'
import { firebaseConfig, useEmulators } from './config'

// The emulator ports come from firebase/firebase.json. Firestore is on 8085,
// not the usual 8080, so it never competes with the local Docker stack.
const EMULATOR_HOST = '127.0.0.1'
// Overridable because Cristian's own Docker stack has been known to claim
// these ports; the defaults are what firebase/firebase.json uses.
const FIRESTORE_PORT = Number(process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_PORT ?? 8085)
const AUTH_PORT = Number(process.env.NEXT_PUBLIC_AUTH_EMULATOR_PORT ?? 9099)

function createApp() {
  if (getApps().length) return getApp()

  const app = initializeApp(firebaseConfig)

  // Offline persistence, because the supermarket is exactly where there is no
  // signal — and because a warm reload should cost no reads.
  initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  })

  if (useEmulators) {
    connectFirestoreEmulator(getFirestore(app), EMULATOR_HOST, FIRESTORE_PORT)
    connectAuthEmulator(getAuth(app), `http://${EMULATOR_HOST}:${AUTH_PORT}`, {
      disableWarnings: true,
    })
  }

  return app
}

export function db() {
  return getFirestore(createApp())
}

export function auth() {
  return getAuth(createApp())
}

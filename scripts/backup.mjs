#!/usr/bin/env node
// Local Firestore backup — dumps the whole project (households + subcollections,
// users, invites) to a timestamped JSON file. Firestore has no free managed
// export (that needs Blaze), so this is the $0 path: read everything with the
// Admin SDK and write it to disk.
//
// Usage:
//   1. Firebase console -> Project settings -> Service accounts ->
//      "Generate new private key". Save it OUTSIDE the repo (or as
//      firebase/service-account.json, which is gitignored).
//   2. GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json pnpm backup
//      (or drop it at firebase/service-account.json and just `pnpm backup`)
//
// Output: backups/stock-<source>-<project>-<stamp>.json (gitignored). The name
// carries where the data came from because a rehearsal against the emulator and
// a real backup are otherwise the same object, and the day you need one is the
// day you cannot check.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PROJECT_ID = "qcris-stock";

function resolveCredentials() {
  const explicit = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const fallback = join(repoRoot, "firebase", "service-account.json");
  const path = explicit ?? (existsSync(fallback) ? fallback : null);
  if (path === null) {
    console.error(
      "No service account key found.\n" +
        "  Set GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json, or place the\n" +
        "  key at firebase/service-account.json (gitignored).\n" +
        "  Get one: Firebase console -> Project settings -> Service accounts.",
    );
    process.exit(1);
  }
  return path;
}

// Recursively serialize a document's data + every subcollection.
async function dumpDoc(docRef) {
  const snap = await docRef.get();
  const out = { id: docRef.id, data: serialize(snap.data() ?? {}) };
  const subcollections = await docRef.listCollections();
  if (subcollections.length > 0) {
    out.collections = {};
    for (const sub of subcollections) {
      out.collections[sub.id] = await dumpCollection(sub);
    }
  }
  return out;
}

async function dumpCollection(collRef) {
  const snap = await collRef.get();
  const docs = [];
  for (const doc of snap.docs) {
    docs.push(await dumpDoc(doc.ref));
  }
  return docs;
}

// Firestore types -> JSON-safe values.
//
// Timestamps are TAGGED rather than flattened to an ISO string, and the reason
// is that the obvious version cannot be checked. Flatten them and a restore
// writes plain strings back; the next dump serialises those strings to the same
// characters, so comparing dump against dump agrees perfectly while every audit
// field has quietly changed type. The round trip would prove nothing, and it is
// the one thing it exists to prove.
//
// Anything else Firestore can hold and this schema does not use — GeoPoint,
// DocumentReference, Bytes — throws instead of being mangled into a shape that
// looks fine in JSON. If one ever appears, the backup stops rather than lying.
function serialize(value) {
  if (value instanceof Timestamp) return { $timestamp: value.toDate().toISOString() };
  if (Array.isArray(value)) return value.map(serialize);
  if (value instanceof Buffer) throw new Error("Bytes are not serialisable here");
  if (value !== null && typeof value === "object") {
    const name = value.constructor?.name;
    if (name !== undefined && name !== "Object") {
      throw new Error(`Cannot serialise a ${name} — teach serialize() about it first`);
    }
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, serialize(v)]),
    );
  }
  return value;
}

async function main() {
  // A backup nobody has ever read back is a hope. `pnpm round-trip` is what
  // makes this one more than that: it seeds the emulator, backs up, wipes,
  // checks the wipe left nothing, restores and compares — and it proves the
  // comparison can fail before it trusts one that passes.
  //
  // `source` and `project` are derived from the connection that was actually
  // opened, never from an argument. Reading production while an env var said
  // otherwise used to stamp the dump with the env var: a real backup wearing a
  // rehearsal's name, which `restore.mjs` would then refuse. The label has to
  // describe what happened, not what was asked for.
  const emulator = process.env.FIRESTORE_EMULATOR_HOST;
  let source;
  let project;
  if (emulator !== undefined && emulator !== "") {
    source = "emulator";
    project = process.env.BACKUP_PROJECT_ID ?? PROJECT_ID;
    console.log(`reading the EMULATOR at ${emulator} (project "${project}")`);
    initializeApp({ projectId: project });
  } else {
    const keyPath = resolveCredentials();
    const serviceAccount = JSON.parse(
      await import("node:fs").then((fs) => fs.readFileSync(keyPath, "utf8")),
    );
    // The key decides, and it has to be the key we expect. A dump labelled with
    // one project and read from another is worse than no dump.
    if (serviceAccount.project_id !== PROJECT_ID) {
      console.error(
        `That key belongs to "${serviceAccount.project_id}", not "${PROJECT_ID}".\n` +
          "  Refusing rather than writing a dump labelled with the wrong project.",
      );
      process.exit(1);
    }
    source = "production";
    project = serviceAccount.project_id;
    console.log(`reading PRODUCTION (project "${project}")`);
    initializeApp({ credential: cert(serviceAccount), projectId: project });
  }
  const db = getFirestore();

  const rootCollections = await db.listCollections();
  const dump = {
    source,
    project,
    exportedAt: new Date().toISOString(),
    collections: {},
  };
  for (const coll of rootCollections) {
    process.stdout.write(`  dumping ${coll.id}...`);
    dump.collections[coll.id] = await dumpCollection(coll);
    process.stdout.write(` ${dump.collections[coll.id].length} docs\n`);
  }

  const dir = join(repoRoot, "backups");
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = join(dir, `stock-${source}-${project}-${stamp}.json`);
  writeFileSync(file, JSON.stringify(dump, null, 2));
  console.log(`\nBackup written to ${file}`);
}

main().catch((err) => {
  console.error("Backup failed:", err);
  process.exit(1);
});

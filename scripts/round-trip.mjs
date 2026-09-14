#!/usr/bin/env node
// Proves the backup can be read back: seed, back up, wipe, check the wipe left
// nothing, restore, compare. Against the emulator only — the round trip cannot
// be rehearsed against production, which is exactly why it has to be rehearsed
// somewhere.
//
//   pnpm emulators                       # in one terminal
//   pnpm round-trip                      # in another
//   pnpm round-trip --verify <dump.json> # read a REAL backup back
//
// The --verify form is the one that matters on a Thursday: it takes a dump the
// weekly job produced and proves the file can actually be restored, in the
// emulator, without touching production. Opening the artifact shows the data
// looks right; this shows it can be read back, which is a different claim.
//
// The negative control runs FIRST and is not optional. A comparison that has
// never reported a difference is not a comparison, and "it passed" means
// nothing until "it can fail" is on the screen. So this breaks the data on
// purpose, checks the comparison sees exactly the damage, and only then trusts
// a clean result.

import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { consumerRoot } from "./lib/consumer-root.mjs";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const repoRoot = consumerRoot();

// One place, so moving backup and restore into the submodule is one edit and
// not five. They are spawned rather than imported on purpose: this rehearses
// the scripts a person runs, not a copy of their internals.
const SCRIPTS = {
  backup: join(repoRoot, "scripts/backup.mjs"),
  restore: join(repoRoot, "scripts/restore.mjs"),
};
const PROJECT = "demo-stock";
const { emulators } = JSON.parse(readFileSync(join(repoRoot, "firebase/firebase.json"), "utf8"));
const HOST = `127.0.0.1:${emulators.firestore.port}`;

// This process wipes, so it points ITSELF at the emulator before anything
// else. The first version only put the host in the children's env and left the
// parent on ambient credentials: `recursiveDelete` then aimed at whatever
// project gcloud was logged into. It failed with an expired token, which is
// luck, not a guard. Hence both — set the host, and refuse to run if the
// wiring did not take.
process.env.FIRESTORE_EMULATOR_HOST = HOST;
process.env.BACKUP_PROJECT_ID = PROJECT;
const env = { ...process.env };

if (!PROJECT.startsWith("demo-")) {
  console.error(`Refusing: "${PROJECT}" is not a demo project, and this script deletes everything.`);
  process.exit(1);
}

function run(label, command, args) {
  process.stdout.write(`  ${label}...`);
  const result = spawnSync(command, args, { cwd: repoRoot, env, encoding: "utf8" });
  if (result.status !== 0) {
    console.log(" failed");
    console.error(result.stdout ?? "", result.stderr ?? "");
    process.exit(1);
  }
  process.stdout.write(" ok\n");
  return result.stdout;
}

/** The newest dump in backups/, which is the one the run just wrote. */
/**
 * The dump this run just wrote — the one file that was not there before.
 *
 * It used to sort the names and take the last, which is the same answer only
 * while every filename shares a prefix. The moment the format changes, an older
 * `stock-…` sorts AFTER a newer `emulator-…` and the comparison silently comes
 * from the stale file: a round trip that passes without having read back
 * anything it just wrote.
 */
function dumpWrittenBy(before) {
  const dir = join(repoRoot, "backups");
  const fresh = readdirSync(dir).filter((f) => f.endsWith(".json") && !before.has(f));
  if (fresh.length !== 1) {
    console.error(
      `\nEsperaba exactamente un dump nuevo en backups/, encontré ${fresh.length}` +
        (fresh.length > 0 ? `: ${fresh.join(", ")}` : "") +
        ".\n  No comparo contra un archivo que no sé si escribió esta corrida.",
    );
    process.exit(1);
  }
  const path = join(dir, fresh[0]);
  return { path, dump: JSON.parse(readFileSync(path, "utf8")) };
}

/**
 * Every difference between two dumps, in both directions.
 *
 * Walking one side and looking things up in the other is the version that
 * reads fine and cannot see a missing collection: absent on the right is
 * absent from the walk. So each level compares the two key sets first.
 */
function diff(left, right, path = "") {
  if (left === undefined) return [`${path}: missing on the left`];
  if (right === undefined) return [`${path}: missing on the right`];
  if (Array.isArray(left) !== Array.isArray(right)) return [`${path}: array vs object`];
  if (left === null || right === null || typeof left !== "object" || typeof right !== "object") {
    return left === right ? [] : [`${path}: ${JSON.stringify(left)} != ${JSON.stringify(right)}`];
  }
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  return [...keys].flatMap((key) => diff(left[key], right[key], `${path}/${key}`));
}

/** Dumps hold collections as arrays of docs; compare them by id, not position. */
function byId(dump) {
  const walk = (docs) =>
    Object.fromEntries(
      docs.map((doc) => [
        doc.id,
        { data: doc.data, collections: mapValues(doc.collections ?? {}, walk) },
      ]),
    );
  return mapValues(dump.collections, walk);
}

const mapValues = (object, fn) =>
  Object.fromEntries(Object.entries(object).map(([k, v]) => [k, fn(v)]));

async function wipe(db) {
  for (const coll of await db.listCollections()) await db.recursiveDelete(coll);
  const left = await db.listCollections();
  // Restoring into a database that was never emptied proves nothing: the data
  // you find afterwards may be the data that was already there.
  if (left.length > 0) {
    console.error(`\nThe wipe left ${left.map((c) => c.id).join(", ")} behind. Stopping.`);
    process.exit(1);
  }
}

/**
 * Every dump this run leaves in backups/, deleted.
 *
 * They are labelled honestly — they did read the emulator — and in --verify
 * mode they are still a trap: the emulator was holding a restored PRODUCTION
 * database, so a file saying `emulator / demo-stock` contains the real
 * household. The label describes the connection, which is the right rule, and
 * it is not enough here. So the rehearsal cleans up after itself: it is
 * reproducible, and none of what it writes is worth keeping.
 */
function cleanUp(before) {
  const dir = join(repoRoot, "backups");
  for (const file of readdirSync(dir)) {
    if (!before.has(file)) rmSync(join(dir, file));
  }
}

async function main() {
  console.log(`Round trip against the emulator at ${HOST}\n`);
  const existingDumps = new Set(readdirSync(join(repoRoot, "backups")));
  initializeApp({ projectId: PROJECT });
  const db = getFirestore();
  if (db._settings?.host !== HOST.split(":")[0] && process.env.FIRESTORE_EMULATOR_HOST !== HOST) {
    console.error("This process is not pointed at the emulator. Refusing to wipe anything.");
    process.exit(1);
  }

  const verify = process.argv.indexOf("--verify");
  let original;
  let before;
  if (verify !== -1) {
    original = resolve(repoRoot, process.argv[verify + 1] ?? "");
    before = JSON.parse(readFileSync(original, "utf8"));
    console.log(`  verifying an existing dump instead of seeding`);
  } else {
    run("seeding", "pnpm", ["seed"]);
    const beforeSeed = new Set(readdirSync(join(repoRoot, "backups")));
    run("backing up", "node", [SCRIPTS.backup]);
    ({ path: original, dump: before } = dumpWrittenBy(beforeSeed));
  }
  console.log(`  dump: ${original.replace(`${repoRoot}/`, "")}`);
  console.log(`  labelled source="${before.source}" project="${before.project}"\n`);

  console.log("Negative control — break it on purpose, and see the comparison say so:");
  await wipe(db);
  const damaged = JSON.parse(JSON.stringify(before));
  const items = damaged.collections.households[0].collections.items;
  const victim = items.find((item) => typeof item.data.quantity === "number") ?? items[0];
  if (typeof victim.data.quantity === "number") victim.data.quantity += 1;
  else victim.data.name = `${victim.data.name} (damaged)`;
  const dropped = items.pop();
  // Deliberately NOT in backups/. A corrupt dump sitting next to real ones,
  // named like them, is the artefact this whole afternoon was about.
  const damagedPath = join(tmpdir(), "stock-round-trip-damaged.json");
  writeFileSync(damagedPath, JSON.stringify(damaged));
  run("restoring the damaged copy", "node", [SCRIPTS.restore, damagedPath]);
  const beforeDamaged = new Set(readdirSync(join(repoRoot, "backups")));
  run("backing up again", "node", [SCRIPTS.backup]);
  const seen = diff(byId(before), byId(dumpWrittenBy(beforeDamaged).dump));
  const sawQuantity = seen.some((d) => d.includes(`/${victim.id}/`));
  const sawMissing = seen.some((d) => d.includes(`/${dropped.id}`));
  if (!sawQuantity || !sawMissing) {
    console.error(
      `\n  The comparison did NOT see the damage. It reported ${seen.length} differences:\n` +
        seen.map((d) => `    ${d}`).join("\n") +
        `\n  Expected a change on "${victim.id}" and a missing "${dropped.id}".\n` +
        "  A comparison that cannot see this cannot vouch for a clean run.",
    );
    process.exit(1);
  }
  console.log(`  saw the change on "${victim.id}" and the missing "${dropped.id}"\n`);

  console.log("The real thing:");
  await wipe(db);
  console.log("  wiped, and the wipe left nothing");
  run("restoring", "node", [SCRIPTS.restore, original]);
  const beforeFinal = new Set(readdirSync(join(repoRoot, "backups")));
  run("backing up", "node", [SCRIPTS.backup]);
  const differences = diff(byId(before), byId(dumpWrittenBy(beforeFinal).dump));
  if (differences.length > 0) {
    console.error(`\nThe restore did not reproduce the backup:\n${differences.map((d) => `  ${d}`).join("\n")}`);
    process.exit(1);
  }
  const counts = Object.entries(byId(before)).flatMap(([name, docs]) => [
    `${Object.keys(docs).length} ${name}`,
    ...Object.values(docs).flatMap((doc) =>
      Object.entries(doc.collections).map(([sub, kids]) => `${Object.keys(kids).length} ${sub}`),
    ),
  ]);
  cleanUp(existingDumps);
  console.log(`\nIdentical after the round trip: ${counts.join(", ")}.`);
}

main().catch((err) => {
  console.error("Round trip failed:", err);
  process.exit(1);
});

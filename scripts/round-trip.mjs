#!/usr/bin/env node
// Proves the backup can be read back: seed, back up, wipe, check the wipe left
// nothing, restore, compare. Against the emulator only — the round trip cannot
// be rehearsed against production, which is exactly why it has to be rehearsed
// somewhere.
//
//   pnpm emulators        # in one terminal
//   pnpm round-trip       # in another
//
// The negative control runs FIRST and is not optional. A comparison that has
// never reported a difference is not a comparison, and "it passed" means
// nothing until "it can fail" is on the screen. So this breaks the data on
// purpose, checks the comparison sees exactly the damage, and only then trusts
// a clean result.

import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
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
function newestDump() {
  const dir = join(repoRoot, "backups");
  const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
  const path = join(dir, files[files.length - 1]);
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

async function main() {
  console.log(`Round trip against the emulator at ${HOST}\n`);
  initializeApp({ projectId: PROJECT });
  const db = getFirestore();
  if (db._settings?.host !== HOST.split(":")[0] && process.env.FIRESTORE_EMULATOR_HOST !== HOST) {
    console.error("This process is not pointed at the emulator. Refusing to wipe anything.");
    process.exit(1);
  }

  run("seeding", "pnpm", ["seed"]);
  run("backing up", "node", ["scripts/backup.mjs"]);
  const { path: original, dump: before } = newestDump();
  console.log(`  dump: ${original.replace(`${repoRoot}/`, "")}`);
  console.log(`  labelled source="${before.source}" project="${before.project}"\n`);

  console.log("Negative control — break it on purpose, and see the comparison say so:");
  await wipe(db);
  const damaged = JSON.parse(JSON.stringify(before));
  const items = damaged.collections.households[0].collections.items;
  const victim = items.find((item) => item.data.quantity !== undefined);
  victim.data.quantity += 1;
  const dropped = items.pop();
  // Deliberately NOT in backups/. A corrupt dump sitting next to real ones,
  // named like them, is the artefact this whole afternoon was about.
  const damagedPath = join(tmpdir(), "stock-round-trip-damaged.json");
  const { writeFileSync } = await import("node:fs");
  writeFileSync(damagedPath, JSON.stringify(damaged));
  run("restoring the damaged copy", "node", ["scripts/restore.mjs", damagedPath]);
  run("backing up again", "node", ["scripts/backup.mjs"]);
  const seen = diff(byId(before), byId(newestDump().dump));
  const sawQuantity = seen.some((d) => d.includes(`/${victim.id}/`) && d.includes("quantity"));
  const sawMissing = seen.some((d) => d.includes(`/${dropped.id}`));
  if (!sawQuantity || !sawMissing) {
    console.error(
      `\n  The comparison did NOT see the damage. It reported ${seen.length} differences:\n` +
        seen.map((d) => `    ${d}`).join("\n") +
        `\n  Expected a changed quantity on "${victim.id}" and a missing "${dropped.id}".\n` +
        "  A comparison that cannot see this cannot vouch for a clean run.",
    );
    process.exit(1);
  }
  console.log(`  saw the changed quantity on "${victim.id}" and the missing "${dropped.id}"\n`);

  console.log("The real thing:");
  await wipe(db);
  console.log("  wiped, and the wipe left nothing");
  run("restoring", "node", ["scripts/restore.mjs", original]);
  run("backing up", "node", ["scripts/backup.mjs"]);
  const differences = diff(byId(before), byId(newestDump().dump));
  if (differences.length > 0) {
    console.error(`\nThe restore did not reproduce the backup:\n${differences.map((d) => `  ${d}`).join("\n")}`);
    process.exit(1);
  }
  const counts = Object.entries(byId(before)).map(([n, d]) => `${Object.keys(d).length} ${n}`);
  console.log(`\nIdentical after the round trip: ${counts.join(", ")}.`);
}

main().catch((err) => {
  console.error("Round trip failed:", err);
  process.exit(1);
});

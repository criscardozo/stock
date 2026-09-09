#!/usr/bin/env node
// Writes a dump from `pnpm backup` back into Firestore. The other half of the
// backup, and the half that is only ever exercised on the worst day of the
// project — which is why `pnpm round-trip` exercises it on ordinary ones.
//
// Usage:
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8280 pnpm restore backups/<file>.json
//   pnpm restore backups/<file>.json --production      (asks for confirmation)

import { existsSync, readFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PROJECT_ID = "qcris-stock";

/** The tagged shapes `backup.mjs` writes, back into Firestore values. */
function revive(value) {
  if (Array.isArray(value)) return value.map(revive);
  if (value !== null && typeof value === "object") {
    if (typeof value.$timestamp === "string" && Object.keys(value).length === 1) {
      return Timestamp.fromDate(new Date(value.$timestamp));
    }
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, revive(v)]));
  }
  return value;
}

async function writeDoc(ref, node) {
  await ref.set(revive(node.data));
  for (const [name, docs] of Object.entries(node.collections ?? {})) {
    for (const child of docs) await writeDoc(ref.collection(name).doc(child.id), child);
  }
}

function readDump(path) {
  if (!existsSync(path)) {
    console.error(`No such dump: ${path}`);
    process.exit(1);
  }
  const dump = JSON.parse(readFileSync(path, "utf8"));
  // A dump with no `source` is one written before the field existed, and there
  // is no safe default. Assuming "production" would wave through exactly the
  // rehearsals this check exists to stop; assuming "emulator" would reject
  // every real backup taken before today. So: ask a human, and say why.
  if (dump.source !== "emulator" && dump.source !== "production") {
    console.error(
      `That dump has no "source" field, so where it came from is unknown.\n` +
        "  It predates the field. Look inside: a rehearsal names a demo project,\n" +
        `  a real backup names "${PROJECT_ID}". Add \`"source": "..."\` by hand\n` +
        "  once you are sure, or take a fresh backup.",
    );
    process.exit(1);
  }
  return dump;
}

async function confirm(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(question);
  rl.close();
  return answer;
}

async function main() {
  const args = process.argv.slice(2);
  const toProduction = args.includes("--production");
  const file = args.find((a) => !a.startsWith("--"));
  if (file === undefined) {
    console.error("Usage: pnpm restore <backups/file.json> [--production]");
    process.exit(1);
  }
  const dump = readDump(resolve(repoRoot, file));
  const emulator = process.env.FIRESTORE_EMULATOR_HOST;

  if (toProduction) {
    // The guard that matters, and it is negative on purpose: it does not check
    // that the dump is the right one, it refuses the ones that are provably
    // wrong. A rehearsal restored over production would not fail — it would
    // work, writing fiction over the ledger.
    if (dump.source !== "production") {
      console.error(
        `Refusing: that dump came from the ${dump.source}, not production.\n` +
          "  Restoring it over the real project would succeed, which is the problem.",
      );
      process.exit(1);
    }
    if (emulator !== undefined && emulator !== "") {
      console.error("FIRESTORE_EMULATOR_HOST is set and --production was passed. Pick one.");
      process.exit(1);
    }
    const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS ??
      join(repoRoot, "firebase", "service-account.json");
    const serviceAccount = JSON.parse(readFileSync(keyPath, "utf8"));
    if (serviceAccount.project_id !== PROJECT_ID) {
      console.error(`That key belongs to "${serviceAccount.project_id}", not "${PROJECT_ID}".`);
      process.exit(1);
    }
    const answer = await confirm(
      `\nAbout to overwrite ${PROJECT_ID} with ${file}\n` +
        `taken ${dump.exportedAt}. Type the project id to continue: `,
    );
    if (answer.trim() !== PROJECT_ID) {
      console.error("Not confirmed. Nothing was written.");
      process.exit(1);
    }
    initializeApp({ credential: cert(serviceAccount), projectId: PROJECT_ID });
  } else {
    if (emulator === undefined || emulator === "") {
      console.error(
        "No FIRESTORE_EMULATOR_HOST set, and --production was not passed.\n" +
          "  Refusing to guess which one you meant.",
      );
      process.exit(1);
    }
    console.log(`writing to the EMULATOR at ${emulator}`);
    initializeApp({ projectId: process.env.BACKUP_PROJECT_ID ?? "demo-stock" });
  }

  const db = getFirestore();
  for (const [name, docs] of Object.entries(dump.collections)) {
    process.stdout.write(`  restoring ${name}...`);
    for (const doc of docs) await writeDoc(db.collection(name).doc(doc.id), doc);
    process.stdout.write(` ${docs.length} docs\n`);
  }
  console.log("\nRestored.");
}

main().catch((err) => {
  console.error("Restore failed:", err);
  process.exit(1);
});

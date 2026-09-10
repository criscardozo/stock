#!/usr/bin/env node
// Moves every copy of the version at once, because there are four and none of
// them can read another:
//
//   apps/web/package.json     -> next.config.ts -> NEXT_PUBLIC_APP_VERSION -> VersionCard
//   apps/ios/project.yml      -> MARKETING_VERSION, three times: app, widget, watch
//
// Usage: pnpm set-version 1.2.3
//
// It counts what it expects to change and refuses if the count is off. A global
// replace that "worked" cannot tell you it reached everything — and the failure
// that matters here is silent: add a fourth iOS target, ship, and the watch
// shows last month's number on a screen that states it with confidence.
//
// The three private package.json files at the root, tools/ and
// firebase/rules-tests/ stay at 0.0.0 ON PURPOSE. They are workspace plumbing,
// never published and never displayed, so they are not copies of anything. That
// is written here so the next person does not "fix" them into three more copies
// somebody has to keep in step.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const IOS_TARGETS = 3;

const version = process.argv[2];
// Not a formatting preference: `0.1` is what iOS carries today and it is why
// the two platforms disagree while looking like they agree.
if (version === undefined || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(
    `Usage: pnpm set-version <x.y.z>\n` +
      `  Got ${version === undefined ? "nothing" : `"${version}"`}. Three numbers, no prefix,\n` +
      `  no suffix — "1.0" and "v1.0.0" are both refused.`,
  );
  process.exit(1);
}

// Read and check EVERYTHING before writing anything. The first version of this
// script wrote the web package.json and then counted the iOS targets, so a bad
// count left the two platforms disagreeing — the exact state it exists to
// prevent, produced by the tool for fixing it.
const webPath = join(repoRoot, "apps/web/package.json");
const web = JSON.parse(readFileSync(webPath, "utf8"));
const yamlPath = join(repoRoot, "apps/ios/project.yml");
const yaml = readFileSync(yamlPath, "utf8");
const found = yaml.match(/MARKETING_VERSION: '[^']*'/g) ?? [];
if (found.length !== IOS_TARGETS) {
  console.error(
    `Expected ${IOS_TARGETS} MARKETING_VERSION lines in project.yml, found ${found.length}.\n` +
      "  A target was added or removed. Update IOS_TARGETS here once you have\n" +
      "  checked every one of them should carry the app's version — refusing\n" +
      "  rather than leaving one behind showing the old number.\n" +
      "  Nothing was written.",
  );
  process.exit(1);
}

const wasWeb = web.version;
const wasIos = found[0].split("'")[1];
web.version = version;
writeFileSync(webPath, `${JSON.stringify(web, null, 2)}\n`);
writeFileSync(yamlPath, yaml.replaceAll(/MARKETING_VERSION: '[^']*'/g, `MARKETING_VERSION: '${version}'`));

console.log(`web  ${wasWeb} -> ${version}`);
console.log(`iOS  ${wasIos} -> ${version}  (${IOS_TARGETS} targets)`);
console.log(`\nRun \`cd apps/ios && xcodegen\` so the project picks it up.`);

#!/usr/bin/env node
/**
 * Bump version, commit, tag, and push to trigger GitHub Release workflow.
 *
 * Usage:
 *   node scripts/release.mjs 0.1.0
 *   node scripts/release.mjs 0.2.0-beta.1
 *
 * Requires: git remote "origin" pointing at GitHub, gh CLI optional for status.
 */

import { execSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const version = process.argv[2]?.replace(/^v/, "");
if (!version) {
  console.error("Usage: node scripts/release.mjs <version>");
  console.error("Example: node scripts/release.mjs 0.1.0");
  process.exit(1);
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const tag = `v${version}`;

function run(cmd, opts = {}) {
  console.log(`> ${cmd}`);
  execSync(cmd, { cwd: root, stdio: "inherit", ...opts });
}

function runCapture(cmd) {
  return execSync(cmd, { cwd: root, encoding: "utf8" }).trim();
}

try {
  runCapture("git rev-parse --is-inside-work-tree");
} catch {
  console.error("Not a git repository.");
  process.exit(1);
}

let remoteUrl = "";
try {
  remoteUrl = runCapture("git remote get-url origin");
} catch {
  console.error('No git remote "origin" configured.');
  console.error("Run: node scripts/setup-github.mjs");
  process.exit(1);
}

if (!/github\.com/i.test(remoteUrl)) {
  console.warn(`Warning: origin does not look like GitHub: ${remoteUrl}`);
}

const dirty = runCapture("git status --porcelain --untracked-files=no");
if (dirty) {
  console.error("Working tree has uncommitted changes. Commit or stash first.");
  process.exit(1);
}

run(`node scripts/sync-version.mjs ${version}`);
run("git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml");
const staged = runCapture("git diff --cached --name-only");
if (staged) {
  run(`git commit -m "chore(release): ${tag}"`);
} else {
  console.log("> version files already at target — skipping commit");
}

try {
  runCapture(`git rev-parse ${tag}`);
  console.error(`Tag ${tag} already exists. Delete it first or pick a new version.`);
  process.exit(1);
} catch {
  run(`git tag -a ${tag} -m "Release ${tag}"`);
}

console.log(`\nPushing ${tag} to origin (triggers Release workflow)...`);
run("git push origin HEAD");
run(`git push origin ${tag}`);

console.log(`
Done! GitHub Actions will build and publish:
  - NexusDeck_${version}.flatpak
  - NexusDeck_${version}_windows-setup.exe
  - NexusDeck_${version}_windows-portable.exe
  - install-steamdeck.sh
  - i.sh / u.sh (short filenames for curl one-liners)
  - SHA256SUMS.txt

Track progress:
  gh run list --workflow=Release
  gh release view ${tag}
`);

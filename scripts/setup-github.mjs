#!/usr/bin/env node
/**
 * One-time GitHub repo setup: create remote repo and push.
 *
 * Usage:
 *   node scripts/setup-github.mjs
 *   node scripts/setup-github.mjs --owner myuser --name NexusDeck --private
 *
 * Requires: GitHub CLI (gh) authenticated via `gh auth login`
 */

import { execSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { resolveGh, quoteGh } from "./gh-path.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const gh = resolveGh();

function run(cmd, opts = {}) {
  const resolved = gh ? quoteGh(cmd, gh) : cmd;
  console.log(`> ${resolved}`);
  return execSync(resolved, { cwd: root, stdio: "inherit", ...opts });
}

function runCapture(cmd) {
  const resolved = gh ? quoteGh(cmd, gh) : cmd;
  return execSync(resolved, { cwd: root, encoding: "utf8" }).trim();
}

const args = process.argv.slice(2);
const getArg = (flag, fallback = "") => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : fallback;
};
const hasFlag = (flag) => args.includes(flag);

const repoName = getArg("--name", "NexusDeck");
const visibility = hasFlag("--private") ? "private" : "public";
const owner = getArg("--owner", "");

if (!gh) {
  console.error("GitHub CLI (gh) is not installed or not found.");
  console.error("Install: https://cli.github.com/");
  console.error("After installing, close and reopen your terminal.");
  console.error("\nManual setup:");
  console.error("  1. Create a repo on GitHub");
  console.error("  2. git remote add origin https://github.com/YOU/NexusDeck.git");
  console.error("  3. git push -u origin overhaul");
  console.error("  4. node scripts/release.mjs 0.1.0");
  process.exit(1);
}

try {
  runCapture("gh auth status");
} catch {
  console.error("GitHub CLI is installed but you are not logged in.");
  console.error("\nRun this in your terminal first:");
  console.error("  gh auth login");
  console.error("\nChoose: GitHub.com → HTTPS → Login with browser");
  console.error("Then run: npm run setup:github");
  process.exit(1);
}

const branch = runCapture("git branch --show-current") || "main";

let remote = "";
try {
  remote = runCapture("git remote get-url origin");
  console.log(`Remote already configured: ${remote}`);
} catch {
  const ownerFlag = owner ? `--owner ${owner}` : "";
  run(
    `gh repo create ${repoName} ${ownerFlag} --${visibility} --source=. --remote=origin --description "Lightweight Nexus Mods client for Steam Deck and Windows"`
  );
  remote = runCapture("git remote get-url origin");
}

console.log(`\nPushing branch "${branch}" to origin...`);
run(`git push -u origin ${branch}`);

const repoSlug = runCapture("gh repo view --json nameWithOwner -q .nameWithOwner");
const [owner, repoNameOnly] = repoSlug.split("/");
const shortUrl = `https://${owner.toLowerCase()}.github.io/${repoNameOnly}/i.sh`;

console.log(`
GitHub repo ready: ${remote}

Next steps:
  1. Enable Actions: Settings → Actions → General → Allow all actions
  2. Enable Pages: Settings → Pages → Deploy from branch main, folder /docs
  3. Commit your current changes, then create first release:
       npm run release 0.1.0
  4. Or manual release: GitHub → Actions → Release → Run workflow

Steam Deck install (short URL, after Pages is enabled):
  curl -fsSL ${shortUrl} | bash

Release download (works after first release):
  curl -fsSL https://github.com/${repoSlug}/releases/latest/download/i.sh | bash
`);

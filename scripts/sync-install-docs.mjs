#!/usr/bin/env node
/**
 * Copy install/uninstall scripts to docs/i.sh and docs/u.sh for GitHub Pages short URLs.
 * Usage: node scripts/sync-install-docs.mjs [owner/repo]
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const docsDir = join(root, "docs");

function repoFromRemote() {
  try {
    const url = execSync("git remote get-url origin", {
      cwd: root,
      encoding: "utf8",
    }).trim();
    const match = url.match(/github\.com[:/]([^/]+)\/([^/.]+)/i);
    if (match) return `${match[1]}/${match[2]}`;
  } catch {
    /* no remote */
  }
  return "Enderappsrepo/NexusDeck";
}

const repo = process.argv[2] || repoFromRemote();
const [owner, name] = repo.split("/");
const pagesBase = `https://${owner.toLowerCase()}.github.io/${name}`;
const installPagesUrl = `${pagesBase}/i.sh`;
const uninstallPagesUrl = `${pagesBase}/u.sh`;
const installReleaseUrl = `https://github.com/${repo}/releases/latest/download/i.sh`;
const uninstallReleaseUrl = `https://github.com/${repo}/releases/latest/download/u.sh`;

mkdirSync(docsDir, { recursive: true });

function patchScript(path) {
  let script = readFileSync(path, "utf8");
  script = script.replace(/Enderappsrepo\/NexusDeck/g, repo);
  script = script.replace(/https:\/\/enderappsrepo\.github\.io\/NexusDeck/gi, pagesBase);
  return script;
}

writeFileSync(join(docsDir, "i.sh"), patchScript(join(root, "install", "install-steamdeck.sh")), "utf8");
writeFileSync(join(docsDir, "install-common.sh"), patchScript(join(root, "install", "install-common.sh")), "utf8");

import { cpSync, rmSync } from "node:fs";
const docsGui = join(docsDir, "gui");
rmSync(docsGui, { recursive: true, force: true });
cpSync(join(root, "install", "gui"), docsGui, { recursive: true });
writeFileSync(join(docsDir, "u.sh"), patchScript(join(root, "install", "uninstall-steamdeck.sh")), "utf8");

// docs/index.html and docs/landing.css are maintained as the public landing page — not overwritten here.

console.log("Synced docs/i.sh and docs/u.sh");
console.log(`Install (short):   ${installPagesUrl}`);
console.log(`Install (release): ${installReleaseUrl}`);
console.log(`Uninstall (short):   ${uninstallPagesUrl}`);
console.log(`Uninstall (release): ${uninstallReleaseUrl}`);
console.log(`Install one-liner:   curl -fsSL ${installPagesUrl} | bash`);
console.log(`Uninstall one-liner: curl -fsSL ${uninstallPagesUrl} | bash`);

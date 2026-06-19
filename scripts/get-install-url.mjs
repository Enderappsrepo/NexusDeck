#!/usr/bin/env node
/** Print install and uninstall URLs for this repo. */

import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

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
  return process.argv[2] || "YOUR_USER/NexusDeck";
}

const repo = repoFromRemote();
const [owner, name] = repo.split("/");
const pagesBase = `https://${owner.toLowerCase()}.github.io/${name}`;
const installPages = `${pagesBase}/i.sh`;
const uninstallPages = `${pagesBase}/u.sh`;
const installRelease = `https://github.com/${repo}/releases/latest/download/i.sh`;
const uninstallRelease = `https://github.com/${repo}/releases/latest/download/u.sh`;

console.log(`
NexusDeck URLs for ${repo}

  Install (short):
    ${installPages}

  Install (release):
    ${installRelease}

  Uninstall (short):
    ${uninstallPages}

  Uninstall (release):
    ${uninstallRelease}

  Steam Deck install:
    curl -fsSL ${installPages} | bash

  Steam Deck uninstall:
    curl -fsSL ${uninstallPages} | bash
`);

#!/usr/bin/env node
/** Print install URLs for this repo. */

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
const pages = `https://${owner.toLowerCase()}.github.io/${name}/i.sh`;
const release = `https://github.com/${repo}/releases/latest/download/i.sh`;

console.log(`
NexusDeck install URLs for ${repo}

  Short (GitHub Pages):
    ${pages}

  Release asset:
    ${release}

  Steam Deck one-liner:
    curl -fsSL ${pages} | bash

  Optional custom domain:
    Add docs/CNAME with e.g. get.nexusdeck.app → curl https://get.nexusdeck.app/i.sh | bash
`);

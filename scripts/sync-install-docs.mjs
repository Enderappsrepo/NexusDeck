#!/usr/bin/env node
/**
 * Copy install script to docs/i.sh for GitHub Pages short URL.
 * Usage: node scripts/sync-install-docs.mjs [owner/repo]
 */

import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
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
  return "nexusdeck/nexusdeck";
}

const repo = process.argv[2] || repoFromRemote();
const [owner, name] = repo.split("/");
const pagesUrl = `https://${owner.toLowerCase()}.github.io/${name}/i.sh`;
const releaseUrl = `https://github.com/${repo}/releases/latest/download/i.sh`;

mkdirSync(docsDir, { recursive: true });

let script = readFileSync(join(root, "install", "install-steamdeck.sh"), "utf8");
script = script.replace(/nexusdeck\/nexusdeck/g, repo);
writeFileSync(join(docsDir, "i.sh"), script, "utf8");

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Install NexusDeck</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 40rem; margin: 3rem auto; padding: 0 1rem; line-height: 1.5; }
    code, pre { background: #1a1a2e; color: #e8e8f0; border-radius: 8px; }
    pre { padding: 1rem; overflow-x: auto; }
    h1 { font-size: 1.75rem; }
    p.muted { color: #666; font-size: 0.95rem; }
  </style>
</head>
<body>
  <h1>Install NexusDeck on Steam Deck</h1>
  <p>Open Konsole in Desktop Mode and run:</p>
  <pre><code>curl -fsSL ${pagesUrl} | bash</code></pre>
  <p class="muted">Direct release link (alternative):</p>
  <pre><code>curl -fsSL ${releaseUrl} | bash</code></pre>
  <p class="muted">Enable GitHub Pages (Settings → Pages → Deploy from branch <strong>main</strong>, folder <strong>/docs</strong>) if this URL 404s.</p>
</body>
</html>
`;

writeFileSync(join(docsDir, "index.html"), html, "utf8");

console.log("Synced docs/i.sh");
console.log(`Short URL:  ${pagesUrl}`);
console.log(`Release URL: ${releaseUrl}`);
console.log(`One-liner:   curl -fsSL ${pagesUrl} | bash`);

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
writeFileSync(join(docsDir, "u.sh"), patchScript(join(root, "install", "uninstall-steamdeck.sh")), "utf8");

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>NexusDeck — Install &amp; Uninstall</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 40rem; margin: 3rem auto; padding: 0 1rem; line-height: 1.5; }
    code, pre { background: #1a1a2e; color: #e8e8f0; border-radius: 8px; }
    pre { padding: 1rem; overflow-x: auto; }
    h1 { font-size: 1.75rem; }
    h2 { font-size: 1.25rem; margin-top: 2rem; }
    p.muted { color: #666; font-size: 0.95rem; }
  </style>
</head>
<body>
  <h1>NexusDeck on Steam Deck</h1>

  <h2>Install</h2>
  <p>Open Konsole in Desktop Mode and run:</p>
  <pre><code>curl -fsSL ${installPagesUrl} | bash</code></pre>
  <p class="muted">Direct release link (alternative):</p>
  <pre><code>curl -fsSL ${installReleaseUrl} | bash</code></pre>

  <h2>Uninstall</h2>
  <pre><code>curl -fsSL ${uninstallPagesUrl} | bash</code></pre>
  <p class="muted">Direct release link (alternative):</p>
  <pre><code>curl -fsSL ${uninstallReleaseUrl} | bash</code></pre>

  <p class="muted">Enable GitHub Pages (Settings → Pages → Deploy from branch <strong>main</strong>, folder <strong>/docs</strong>) if these URLs 404.</p>
</body>
</html>
`;

writeFileSync(join(docsDir, "index.html"), html, "utf8");

console.log("Synced docs/i.sh and docs/u.sh");
console.log(`Install (short):   ${installPagesUrl}`);
console.log(`Install (release): ${installReleaseUrl}`);
console.log(`Uninstall (short):   ${uninstallPagesUrl}`);
console.log(`Uninstall (release): ${uninstallReleaseUrl}`);
console.log(`Install one-liner:   curl -fsSL ${installPagesUrl} | bash`);
console.log(`Uninstall one-liner: curl -fsSL ${uninstallPagesUrl} | bash`);

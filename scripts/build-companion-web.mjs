#!/usr/bin/env node
/**
 * Build the static NexusDeck Companion web app for GitHub Pages + release zip + receiver bundle.
 *
 * Outputs:
 *   docs/companion/          — GitHub Pages at /<repo>/companion/
 *   dist-companion-release/  — zipped for GitHub Releases
 *   src-tauri/resources/companion-web/ — served at http://<device-ip>:8731/app/
 */

import { execSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const repo = process.env.GITHUB_REPOSITORY?.split("/")[1] ?? "NexusDeck";

function buildCompanion(base, outDir) {
  process.env.VITE_COMPANION_BASE = base;
  console.log(`Building companion web (base=${base}, out=${outDir})…`);
  execSync(`npx vite build --config companion-web/vite.config.ts --outDir "${outDir}"`, {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, VITE_COMPANION_BASE: base },
  });
}

// GitHub Pages + release zip
const pagesBase = process.env.VITE_COMPANION_BASE ?? `/${repo}/companion/`;
const pagesOut = join(root, "docs", "companion");
buildCompanion(pagesBase, pagesOut);
console.log(`Companion web ready: ${pagesOut}`);

const staging = join(root, "dist-companion-release");
rmSync(staging, { recursive: true, force: true });
mkdirSync(staging, { recursive: true });
cpSync(pagesOut, join(staging, "companion"), { recursive: true });

// Receiver bundle (plain HTTP on the Deck/PC — avoids HTTPS mixed-content blocks)
const receiverOut = join(root, "src-tauri", "resources", "companion-web");
buildCompanion("/app/", receiverOut);
console.log(`Receiver companion ready: ${receiverOut}`);

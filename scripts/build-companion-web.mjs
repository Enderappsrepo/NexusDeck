#!/usr/bin/env node
/**
 * Build the static NexusDeck Companion web app for GitHub Pages + release zip.
 * Output: docs/companion/ (served at https://<user>.github.io/<repo>/companion/)
 */

import { execSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const repo = process.env.GITHUB_REPOSITORY?.split("/")[1] ?? "NexusDeck";

process.env.VITE_COMPANION_BASE = process.env.VITE_COMPANION_BASE ?? `/${repo}/companion/`;

console.log(`Building companion web (base=${process.env.VITE_COMPANION_BASE})…`);
execSync("npx vite build --config companion-web/vite.config.ts", {
  cwd: root,
  stdio: "inherit",
});

const out = join(root, "docs", "companion");
console.log(`Companion web ready: ${out}`);

// Staging folder used by release.yml to zip the companion for GitHub Releases.
const staging = join(root, "dist-companion-release");
rmSync(staging, { recursive: true, force: true });
mkdirSync(staging, { recursive: true });
cpSync(out, join(staging, "companion"), { recursive: true });

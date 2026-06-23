#!/usr/bin/env node
/**
 * Build the NexusDeck Host Decky plugin and copy it into Tauri resources.
 */
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pluginRoot = join(root, "decky", "nexusdeck-host");
const outDir = join(root, "src-tauri", "resources", "decky", "nexusdeck-host");

function run(cmd, cwd) {
  console.log(`→ ${cmd}`);
  execSync(cmd, { cwd, stdio: "inherit" });
}

if (!existsSync(pluginRoot)) {
  console.error("Missing decky/nexusdeck-host");
  process.exit(1);
}

run("npm install", pluginRoot);
run("npm run build", pluginRoot);

if (!existsSync(join(pluginRoot, "dist", "index.js"))) {
  console.error("Build did not produce dist/index.js");
  process.exit(1);
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(dirname(outDir), { recursive: true });

for (const name of ["plugin.json", "main.py", "package.json"]) {
  cpSync(join(pluginRoot, name), join(outDir, name));
}
cpSync(join(pluginRoot, "dist"), join(outDir, "dist"), { recursive: true });

console.log(`✓ Decky plugin staged at ${outDir}`);

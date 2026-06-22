#!/usr/bin/env node
/**
 * Downloads official 7-Zip binaries into src-tauri/resources/7zip for bundling.
 * Windows CI runners include 7z on PATH; Linux uses tar.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const VERSION = "2601";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEST = path.join(ROOT, "src-tauri", "resources", "7zip");
const CACHE = path.join(ROOT, ".cache", "7zip");

function run(cmd, opts = {}) {
  execSync(cmd, { stdio: "inherit", ...opts });
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function hasBundledBinary() {
  return ["7z.exe", "7z", "7zz"].some((name) => fs.existsSync(path.join(DEST, name)));
}

function fetchWindows() {
  ensureDir(CACHE);
  ensureDir(DEST);

  const installDir = path.join(CACHE, "installer");
  if (!fs.existsSync(path.join(installDir, "7z.exe"))) {
    const installer = path.join(CACHE, `7z${VERSION}-x64.exe`);
    const url = `https://www.7-zip.org/a/7z${VERSION}-x64.exe`;
    if (!fs.existsSync(installer)) {
      console.log(`Downloading ${url}`);
      run(`curl -fsSL -o "${installer}" "${url}"`);
    }
    ensureDir(installDir);
    console.log(`Installing 7-Zip to ${installDir}`);
    run(`"${installer}" /S /D="${installDir}"`);
  }

  for (const name of ["7z.exe", "7z.dll", "7z.sfx", "7zCon.sfx"]) {
    const src = path.join(installDir, name);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(DEST, name));
      console.log(`Installed ${name}`);
    }
  }
}

function fetchLinux() {
  ensureDir(CACHE);
  ensureDir(DEST);
  const archive = path.join(CACHE, `7z${VERSION}-linux-x64.tar.xz`);
  const url = `https://www.7-zip.org/a/7z${VERSION}-linux-x64.tar.xz`;

  if (!fs.existsSync(archive)) {
    console.log(`Downloading ${url}`);
    run(`curl -fsSL -o "${archive}" "${url}"`);
  }

  const extractDir = path.join(CACHE, "linux");
  ensureDir(extractDir);
  run(`tar -xJf "${archive}" -C "${extractDir}"`);

  const src = path.join(extractDir, "7zz");
  if (!fs.existsSync(src)) {
    throw new Error("Expected 7zz in Linux 7-Zip tarball");
  }
  fs.copyFileSync(src, path.join(DEST, "7zz"));
  console.log("Installed 7zz");
}

function main() {
  if (hasBundledBinary()) {
    console.log("Bundled 7-Zip already present, skipping fetch.");
    return;
  }

  if (process.platform === "win32") {
    fetchWindows();
  } else if (process.platform === "linux") {
    fetchLinux();
  } else {
    console.log(`Skipping 7-Zip fetch on ${process.platform}`);
  }
}

main();

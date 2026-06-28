#!/usr/bin/env node
/**
 * Print the CHANGELOG section for a release version (for GitHub Release body).
 *
 * Usage: node scripts/changelog-notes.mjs 1.1.27
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const version = process.argv[2]?.replace(/^v/, "");
if (!version) {
  console.error("Usage: node scripts/changelog-notes.mjs <version>");
  process.exit(1);
}

const changelogPath = join(dirname(fileURLToPath(import.meta.url)), "..", "CHANGELOG.md");
const text = readFileSync(changelogPath, "utf8");
const header = `## [${version}]`;
const start = text.indexOf(header);
if (start === -1) {
  console.error(`No changelog section found for ${version} (expected "${header}")`);
  process.exit(1);
}

const afterHeader = text.indexOf("\n", start) + 1;
const nextSection = text.indexOf("\n## [", afterHeader);
const section = nextSection === -1 ? text.slice(afterHeader) : text.slice(afterHeader, nextSection);

process.stdout.write(section.trim() + "\n");

import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const WINDOWS_PATHS = [
  join(process.env.ProgramFiles || "C:\\Program Files", "GitHub CLI", "gh.exe"),
  join(
    process.env.LOCALAPPDATA || "",
    "Programs",
    "GitHub CLI",
    "gh.exe"
  ),
  join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "GitHub CLI", "gh.exe"),
];

/** Resolve gh binary — handles fresh Windows installs before PATH refresh. */
export function resolveGh() {
  const direct = spawnSync("gh", ["--version"], { stdio: "ignore" });
  if (direct.status === 0) return "gh";

  for (const path of WINDOWS_PATHS) {
    if (path && existsSync(path)) {
      const probe = spawnSync(path, ["--version"], { stdio: "ignore" });
      if (probe.status === 0) return `"${path}"`;
    }
  }

  return null;
}

export function quoteGh(cmd, gh) {
  if (gh === "gh") return cmd;
  return cmd.replace(/\bgh\b/g, gh);
}

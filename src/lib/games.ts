import { api } from "@/lib/commands";
import type { SupportedGameInfo } from "@/lib/nexus/types";

/** Fallback list when backend is unavailable (must match Rust GameRegistry). */
export const SUPPORTED_GAMES: SupportedGameInfo[] = [
  { domain: "fallout4", display_name: "Fallout 4", script_extender_label: "F4SE" },
  {
    domain: "skyrimspecialedition",
    display_name: "Skyrim Special Edition",
    script_extender_label: "SKSE",
  },
  { domain: "skyrim", display_name: "Skyrim", script_extender_label: "SKSE" },
  {
    domain: "falloutnv",
    display_name: "Fallout: New Vegas",
    script_extender_label: "xNVSE",
  },
  { domain: "fallout3", display_name: "Fallout 3", script_extender_label: "FOSE" },
  { domain: "starfield", display_name: "Starfield", script_extender_label: "SFSE" },
  { domain: "oblivion", display_name: "Oblivion", script_extender_label: "OBSE" },
];

export const SUPPORTED_DOMAINS = new Set(SUPPORTED_GAMES.map((g) => g.domain));

let cachedGames: SupportedGameInfo[] | null = null;

function normalizeSupportedGame(raw: unknown): SupportedGameInfo | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;

  const domain =
    typeof row.domain === "string"
      ? row.domain
      : typeof row.domain_name === "string"
        ? row.domain_name
        : null;
  if (!domain) return null;

  const display_name =
    typeof row.display_name === "string"
      ? row.display_name
      : typeof row.displayName === "string"
        ? row.displayName
        : domain;

  const script_extender_label =
    typeof row.script_extender_label === "string"
      ? row.script_extender_label
      : typeof row.scriptExtenderLabel === "string"
        ? row.scriptExtenderLabel
        : null;

  return { domain, display_name, script_extender_label };
}

export async function loadSupportedGames(): Promise<SupportedGameInfo[]> {
  if (cachedGames) return cachedGames;
  try {
    const raw = await api.listSupportedGames();
    const normalized = raw
      .map(normalizeSupportedGame)
      .filter((g): g is SupportedGameInfo => g !== null);
    cachedGames = normalized.length > 0 ? normalized : SUPPORTED_GAMES;
    return cachedGames;
  } catch {
    return SUPPORTED_GAMES;
  }
}

export function getGameMeta(
  domain: string,
  games: SupportedGameInfo[] = SUPPORTED_GAMES
): SupportedGameInfo | undefined {
  return games.find((g) => g.domain === domain);
}

export function hasScriptExtender(
  domain: string,
  games: SupportedGameInfo[] = SUPPORTED_GAMES
): boolean {
  return !!getGameMeta(domain, games)?.script_extender_label;
}

export function isSupportedDomain(domain: string): boolean {
  return SUPPORTED_DOMAINS.has(domain);
}

/** @deprecated Use getScriptExtenderInstallInfo(domain) */
export const SCRIPT_EXTENDER_URLS: Record<string, string> = {
  fallout4: "https://f4se.silverlock.org/",
  skyrimspecialedition: "https://skse.silverlock.org/",
  skyrim: "https://skse.silverlock.org/",
  falloutnv: "https://github.com/xNVSE/NVSE/releases",
  fallout3: "http://fose.silverlock.org/",
  starfield: "https://sfse.silverlock.org/",
  oblivion: "http://obse.silverlock.org/",
};

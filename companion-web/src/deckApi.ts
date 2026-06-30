import type {
  CompanionGame,
  CompanionInstalledMod,
  DiscoveryFeeds,
  InstallSessionStatus,
  ModDetail,
  ModFileInfo,
  ModSummary,
  SelectedInstallOption,
  UninstallResult,
} from "./types";

export const COMPANION_API_VERSION = 2;

export interface PairedDeck {
  name: string;
  host: string;
  port: number;
  token: string;
}

export interface PingInfo {
  name: string;
  version?: string;
  paired?: boolean;
  nexus_configured?: boolean;
  companion_api?: number;
  games?: CompanionGame[];
  companion_url?: string;
  lan_hosts?: string[];
  companion_urls?: string[];
}

export const PAIRED_KEY = "nexusdeck_paired_deck";
const FETCH_TIMEOUT_MS = 20_000;

export function loadPaired(): PairedDeck | null {
  try {
    const raw = localStorage.getItem(PAIRED_KEY);
    return raw ? (JSON.parse(raw) as PairedDeck) : null;
  } catch {
    return null;
  }
}

export function savePaired(deck: PairedDeck) {
  localStorage.setItem(PAIRED_KEY, JSON.stringify(deck));
}

export function clearPaired() {
  localStorage.removeItem(PAIRED_KEY);
}

export function companionAppUrl(host: string, port = 8731): string {
  return `http://${host}:${port}/app/`;
}

function fetchError(err: unknown): Error {
  if (err instanceof DOMException && err.name === "AbortError") {
    return new Error(
      "Timed out — check the IP, make sure Receive is on, and that your phone is on the same Wi‑Fi."
    );
  }
  if (err instanceof TypeError) {
    return new Error(
      "Network blocked — open http://YOUR_DEVICE_IP:8731/app/ on your phone (not GitHub Pages)."
    );
  }
  return err instanceof Error ? err : new Error(String(err));
}

async function fetchDeck(
  url: string,
  init?: RequestInit,
  timeoutMs = FETCH_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    throw fetchError(err);
  } finally {
    window.clearTimeout(timer);
  }
}

function authHeaders(paired: PairedDeck): HeadersInit {
  return { Authorization: `Bearer ${paired.token}` };
}

async function readJson<T>(resp: Response): Promise<T> {
  const body = (await resp.json()) as T | { error?: string };
  if (!resp.ok) {
    const msg =
      typeof body === "object" && body && "error" in body
        ? String((body as { error?: string }).error)
        : `HTTP ${resp.status}`;
    throw new Error(msg);
  }
  return body as T;
}

export async function pingDeck(host: string, port: number): Promise<PingInfo> {
  const resp = await fetchDeck(`http://${host}:${port}/ping`);
  return readJson<PingInfo>(resp);
}

/** Fast probe for LAN discovery scans (short timeout, no throw on failure). */
export async function probeDeck(
  host: string,
  port: number,
  timeoutMs = 700
): Promise<PingInfo | null> {
  try {
    const resp = await fetchDeck(`http://${host}:${port}/ping`, undefined, timeoutMs);
    return await readJson<PingInfo>(resp);
  } catch {
    return null;
  }
}

/** Authenticated keepalive — lets the device know this companion is still live.
 *  Returns false (never throws) so a dropped connection is easy to detect. */
export async function heartbeatDeck(paired: PairedDeck): Promise<boolean> {
  try {
    const resp = await fetchDeck(
      `http://${paired.host}:${paired.port}/heartbeat`,
      { headers: authHeaders(paired) },
      6000
    );
    return resp.ok;
  } catch {
    return false;
  }
}

export async function pairWithDeck(host: string, port: number, code: string): Promise<string> {
  const resp = await fetchDeck(`http://${host}:${port}/pair`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  const body = await readJson<{ token?: string }>(resp);
  if (!body.token) throw new Error("The device didn't return a pairing token.");
  return body.token;
}

export async function listGames(paired: PairedDeck): Promise<CompanionGame[]> {
  const resp = await fetchDeck(`http://${paired.host}:${paired.port}/games/list`, {
    headers: authHeaders(paired),
  });
  return readJson<CompanionGame[]>(resp);
}

export async function searchModsViaDeck(
  paired: PairedDeck,
  gameDomain: string,
  query: string
): Promise<ModSummary[]> {
  const params = new URLSearchParams({ domain: gameDomain, q: query });
  const resp = await fetchDeck(
    `http://${paired.host}:${paired.port}/search/mods?${params}`,
    { headers: authHeaders(paired) }
  );
  return readJson<ModSummary[]>(resp);
}

export async function fetchTrending(
  paired: PairedDeck,
  gameDomain: string
): Promise<ModSummary[]> {
  const params = new URLSearchParams({ domain: gameDomain });
  const resp = await fetchDeck(
    `http://${paired.host}:${paired.port}/browse/trending?${params}`,
    { headers: authHeaders(paired) }
  );
  return readJson<ModSummary[]>(resp);
}

export async function fetchLatest(
  paired: PairedDeck,
  gameDomain: string,
  offset = 0
): Promise<ModSummary[]> {
  const params = new URLSearchParams({ domain: gameDomain, offset: String(offset) });
  const resp = await fetchDeck(
    `http://${paired.host}:${paired.port}/browse/latest?${params}`,
    { headers: authHeaders(paired) }
  );
  return readJson<ModSummary[]>(resp);
}

export async function fetchDiscovery(
  paired: PairedDeck,
  gameDomain: string
): Promise<DiscoveryFeeds> {
  const params = new URLSearchParams({ domain: gameDomain });
  const resp = await fetchDeck(
    `http://${paired.host}:${paired.port}/browse/discovery?${params}`,
    { headers: authHeaders(paired) }
  );
  return readJson<DiscoveryFeeds>(resp);
}

export async function fetchLibraryMods(
  paired: PairedDeck,
  gameDomain: string
): Promise<CompanionInstalledMod[]> {
  const params = new URLSearchParams({ domain: gameDomain });
  const resp = await fetchDeck(
    `http://${paired.host}:${paired.port}/library/mods?${params}`,
    { headers: authHeaders(paired) }
  );
  return readJson<CompanionInstalledMod[]>(resp);
}

export async function toggleLibraryMod(
  paired: PairedDeck,
  modId: string,
  enabled: boolean
): Promise<void> {
  const resp = await fetchDeck(`http://${paired.host}:${paired.port}/library/mod/toggle`, {
    method: "POST",
    headers: { ...authHeaders(paired), "Content-Type": "application/json" },
    body: JSON.stringify({ mod_id: modId, enabled }),
  });
  await readJson<{ ok: boolean }>(resp);
}

export async function uninstallLibraryMod(
  paired: PairedDeck,
  modId: string
): Promise<UninstallResult> {
  const resp = await fetchDeck(`http://${paired.host}:${paired.port}/library/mod/uninstall`, {
    method: "POST",
    headers: { ...authHeaders(paired), "Content-Type": "application/json" },
    body: JSON.stringify({ mod_id: modId }),
  });
  return readJson<UninstallResult>(resp);
}

/** Move a mod up/down in load order; returns the refreshed library list. */
export async function reorderLibraryMod(
  paired: PairedDeck,
  gameDomain: string,
  modId: string,
  direction: "up" | "down"
): Promise<CompanionInstalledMod[]> {
  const resp = await fetchDeck(`http://${paired.host}:${paired.port}/library/mod/reorder`, {
    method: "POST",
    headers: { ...authHeaders(paired), "Content-Type": "application/json" },
    body: JSON.stringify({ game_domain: gameDomain, mod_id: modId, direction }),
  });
  return readJson<CompanionInstalledMod[]>(resp);
}

export function isApiNotFoundError(err: unknown): boolean {
  return err instanceof Error && err.message === "Not found";
}

export function isGitHubPagesHost(): boolean {
  return typeof location !== "undefined" && location.hostname.endsWith("github.io");
}

export async function fetchModDetail(
  paired: PairedDeck,
  gameDomain: string,
  modId: number
): Promise<ModDetail> {
  const params = new URLSearchParams({ domain: gameDomain, mod_id: String(modId) });
  const resp = await fetchDeck(
    `http://${paired.host}:${paired.port}/mods/detail?${params}`,
    { headers: authHeaders(paired) }
  );
  return readJson<ModDetail>(resp);
}

export async function fetchModFiles(
  paired: PairedDeck,
  gameDomain: string,
  modId: number
): Promise<ModFileInfo[]> {
  const params = new URLSearchParams({ domain: gameDomain, mod_id: String(modId) });
  const resp = await fetchDeck(
    `http://${paired.host}:${paired.port}/mods/files?${params}`,
    { headers: authHeaders(paired) }
  );
  return readJson<ModFileInfo[]>(resp);
}

export async function startInstallSession(
  paired: PairedDeck,
  payload: {
    game_domain: string;
    nexus_mod_id: number;
    nexus_file_id: number;
    mod_name: string;
    file_name: string;
    expected_size_kb: number;
    file_version?: string | null;
  }
): Promise<InstallSessionStatus> {
  const resp = await fetchDeck(
    `http://${paired.host}:${paired.port}/install/session/start`,
    {
      method: "POST",
      headers: { ...authHeaders(paired), "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  );
  return readJson<InstallSessionStatus>(resp);
}

export async function getInstallSession(
  paired: PairedDeck,
  sessionId: string
): Promise<InstallSessionStatus> {
  const resp = await fetchDeck(
    `http://${paired.host}:${paired.port}/install/session/${sessionId}`,
    { headers: authHeaders(paired) }
  );
  return readJson<InstallSessionStatus>(resp);
}

export async function confirmInstallSession(
  paired: PairedDeck,
  sessionId: string,
  payload: {
    strategy?: string;
    enable_mod?: boolean;
    overwrite_files?: boolean;
    selected_options?: SelectedInstallOption[];
  }
): Promise<InstallSessionStatus> {
  const resp = await fetchDeck(
    `http://${paired.host}:${paired.port}/install/session/${sessionId}/confirm`,
    {
      method: "POST",
      headers: { ...authHeaders(paired), "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  );
  return readJson<InstallSessionStatus>(resp);
}

export async function fetchEssentialsManifest(
  paired: PairedDeck,
  domain: string
): Promise<import("./types").GameEssentialsManifest> {
  const params = new URLSearchParams({ domain });
  const resp = await fetchDeck(
    `http://${paired.host}:${paired.port}/essentials/manifest?${params}`,
    { headers: authHeaders(paired) }
  );
  return readJson(resp);
}

export async function fetchEssentialsStatus(
  paired: PairedDeck,
  domain: string
): Promise<import("./types").GameEssentialModStatus[]> {
  const params = new URLSearchParams({ domain });
  const resp = await fetchDeck(
    `http://${paired.host}:${paired.port}/essentials/status?${params}`,
    { headers: authHeaders(paired) }
  );
  return readJson(resp);
}

export async function startEssentialsOnDeck(
  paired: PairedDeck,
  payload: {
    game_domain: string;
    mod_ids?: string[];
    include_setup?: boolean;
  }
): Promise<import("./types").QueuedEssentialMod[]> {
  const resp = await fetchDeck(`http://${paired.host}:${paired.port}/essentials/start`, {
    method: "POST",
    headers: { ...authHeaders(paired), "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return readJson(resp);
}

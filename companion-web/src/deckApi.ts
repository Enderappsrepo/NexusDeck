import { filtersToSearchParams } from "./lib/modFilters";
import type {
  CollectionInstallQueued,
  CollectionModDiffEntry,
  CollectionModEntry,
  CollectionSummary,
  CompanionCollectionDetail,
  CollectionDetail,
  CollectionDiffResult,
  CompanionDeviceSettings,
  CompanionDownloadRecord,
  CompanionGame,
  CompanionInstalledMod,
  DiscoveryFeeds,
  InstallSessionStatus,
  LoadOrderModEntry,
  LoadOrderPluginEntry,
  LoadOrderState,
  ModDetail,
  ModFileInfo,
  ModSearchFilters,
  ModSearchResult,
  ModCategory,
  ModSummary,
  ModUpdateInfo,
  UpdateBatchResult,
  UpdateJob,
  SelectedInstallOption,
  SyncActionResult,
  UninstallResult,
} from "./types";

export const COMPANION_API_VERSION = 6;

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
const LAN_HOSTS_KEY = "nexusdeck_paired_lan_hosts";
const FETCH_TIMEOUT_MS = 20_000;

export type HeartbeatResult = "ok" | "unauthorized" | "failed";

export function loadCachedLanHosts(): string[] {
  try {
    const raw = localStorage.getItem(LAN_HOSTS_KEY);
    const parsed = raw ? (JSON.parse(raw) as string[]) : [];
    return Array.isArray(parsed) ? parsed.filter((h) => typeof h === "string" && h.trim()) : [];
  } catch {
    return [];
  }
}

export function saveCachedLanHosts(hosts: string[]) {
  const unique = [...new Set(hosts.map((h) => h.trim()).filter(Boolean))];
  localStorage.setItem(LAN_HOSTS_KEY, JSON.stringify(unique.slice(0, 8)));
}

export function clearCachedLanHosts() {
  localStorage.removeItem(LAN_HOSTS_KEY);
}

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
  clearCachedLanHosts();
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

function ensureArray<T>(data: unknown): T[] {
  return Array.isArray(data) ? data : [];
}

export async function pingDeck(host: string, port: number): Promise<PingInfo> {
  const resp = await fetchDeck(`http://${host}:${port}/ping`);
  const info = await readJson<PingInfo>(resp);
  if (info.lan_hosts?.length) {
    saveCachedLanHosts([host, ...info.lan_hosts]);
  }
  return info;
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

/** Authenticated keepalive — lets the device know this companion is still live. */
export async function heartbeatDeck(paired: PairedDeck): Promise<HeartbeatResult> {
  try {
    const resp = await fetchDeck(
      `http://${paired.host}:${paired.port}/heartbeat`,
      { headers: authHeaders(paired) },
      6000
    );
    if (resp.status === 401) return "unauthorized";
    return resp.ok ? "ok" : "failed";
  } catch {
    return "failed";
  }
}

export function isHeartbeatOk(result: HeartbeatResult): boolean {
  return result === "ok";
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

export async function searchModsFiltered(
  paired: PairedDeck,
  gameDomain: string,
  options: {
    query?: string;
    sort?: string;
    offset?: number;
    count?: number;
    filters?: ModSearchFilters;
  } = {}
): Promise<ModSearchResult> {
  const {
    query = "",
    sort = "downloads",
    offset = 0,
    count = 20,
    filters,
  } = options;
  const params = new URLSearchParams({
    domain: gameDomain,
    q: query,
    sort,
    offset: String(offset),
    count: String(count),
  });
  if (filters) filtersToSearchParams(filters, params);
  const resp = await fetchDeck(
    `http://${paired.host}:${paired.port}/search/mods?${params}`,
    { headers: authHeaders(paired) }
  );
  const data = await readJson<Partial<ModSearchResult>>(resp);
  return {
    mods: ensureArray<ModSummary>(data.mods),
    total_count:
      typeof data.total_count === "number" ? data.total_count : ensureArray<ModSummary>(data.mods).length,
  };
}

/** @deprecated Use searchModsFiltered */
export async function searchModsViaDeck(
  paired: PairedDeck,
  gameDomain: string,
  query: string
): Promise<ModSummary[]> {
  const result = await searchModsFiltered(paired, gameDomain, { query });
  return result.mods;
}

export async function fetchModCategories(
  paired: PairedDeck,
  gameDomain: string
): Promise<ModCategory[]> {
  const params = new URLSearchParams({ domain: gameDomain });
  const resp = await fetchDeck(
    `http://${paired.host}:${paired.port}/categories/list?${params}`,
    { headers: authHeaders(paired) }
  );
  return readJson<ModCategory[]>(resp);
}

export async function fetchBrowseShelf(
  paired: PairedDeck,
  gameDomain: string,
  options: { sort: string; offset?: number; updated_since_days?: number }
): Promise<ModSummary[]> {
  const params = new URLSearchParams({
    domain: gameDomain,
    sort: options.sort,
    offset: String(options.offset ?? 0),
  });
  if (options.updated_since_days != null) {
    params.set("updated_since_days", String(options.updated_since_days));
  }
  const resp = await fetchDeck(
    `http://${paired.host}:${paired.port}/browse/shelf?${params}`,
    { headers: authHeaders(paired) }
  );
  return readJson<ModSummary[]>(resp);
}

export async function startModUpdate(
  paired: PairedDeck,
  gameDomain: string,
  installedModId: string
): Promise<UpdateJob> {
  const resp = await fetchDeck(`http://${paired.host}:${paired.port}/library/mod/update`, {
    method: "POST",
    headers: { ...authHeaders(paired), "Content-Type": "application/json" },
    body: JSON.stringify({ game_domain: gameDomain, mod_id: installedModId }),
  });
  return readJson<UpdateJob>(resp);
}

export async function updateAllMods(
  paired: PairedDeck,
  gameDomain: string
): Promise<UpdateBatchResult> {
  const resp = await fetchDeck(`http://${paired.host}:${paired.port}/library/updates/all`, {
    method: "POST",
    headers: { ...authHeaders(paired), "Content-Type": "application/json" },
    body: JSON.stringify({ game_domain: gameDomain }),
  });
  return readJson<UpdateBatchResult>(resp);
}

export async function setLibraryModPosition(
  paired: PairedDeck,
  gameDomain: string,
  modId: string,
  position: number
): Promise<CompanionInstalledMod[]> {
  const resp = await fetchDeck(`http://${paired.host}:${paired.port}/library/mod/position`, {
    method: "POST",
    headers: { ...authHeaders(paired), "Content-Type": "application/json" },
    body: JSON.stringify({ game_domain: gameDomain, mod_id: modId, position }),
  });
  return readJson<CompanionInstalledMod[]>(resp);
}

export async function rescanLibrary(
  paired: PairedDeck,
  gameDomain: string
): Promise<{ mods_added: number; plugins_found: number; message: string }> {
  const resp = await fetchDeck(`http://${paired.host}:${paired.port}/library/rescan`, {
    method: "POST",
    headers: { ...authHeaders(paired), "Content-Type": "application/json" },
    body: JSON.stringify({ game_domain: gameDomain }),
  });
  return readJson(resp);
}

export async function cancelDownload(paired: PairedDeck, downloadId: string): Promise<void> {
  const resp = await fetchDeck(`http://${paired.host}:${paired.port}/downloads/cancel`, {
    method: "POST",
    headers: { ...authHeaders(paired), "Content-Type": "application/json" },
    body: JSON.stringify({ download_id: downloadId }),
  });
  await readJson<{ ok: boolean }>(resp);
}

export async function retryDownload(paired: PairedDeck, downloadId: string): Promise<void> {
  const resp = await fetchDeck(`http://${paired.host}:${paired.port}/downloads/retry`, {
    method: "POST",
    headers: { ...authHeaders(paired), "Content-Type": "application/json" },
    body: JSON.stringify({ download_id: downloadId }),
  });
  await readJson(resp);
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
  const data = await readJson<CompanionInstalledMod[]>(resp);
  return ensureArray<CompanionInstalledMod>(data);
}

export async function toggleLibraryMod(
  paired: PairedDeck,
  gameDomain: string,
  modId: string,
  enabled: boolean
): Promise<void> {
  const resp = await fetchDeck(`http://${paired.host}:${paired.port}/library/mod/toggle`, {
    method: "POST",
    headers: { ...authHeaders(paired), "Content-Type": "application/json" },
    body: JSON.stringify({ game_domain: gameDomain, mod_id: modId, enabled }),
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
    `http://${paired.host}:${paired.port}/install/session/${encodeURIComponent(sessionId)}`,
    { headers: authHeaders(paired) }
  );
  return readJson<InstallSessionStatus>(resp);
}

export async function fetchFomodAsset(
  paired: PairedDeck,
  sessionId: string,
  relativePath: string
): Promise<string | null> {
  const params = new URLSearchParams({ path: relativePath });
  const resp = await fetchDeck(
    `http://${paired.host}:${paired.port}/install/session/${encodeURIComponent(sessionId)}/fomod-asset?${params}`,
    { headers: authHeaders(paired) }
  );
  if (!resp.ok) return null;
  const payload = await readJson<{ bytes: number[]; mime_type: string }>(resp);
  if (!payload.bytes?.length) return null;
  const blob = new Blob([Uint8Array.from(payload.bytes)], {
    type: payload.mime_type || "application/octet-stream",
  });
  return URL.createObjectURL(blob);
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

function normalizeLoadOrderState(raw: Partial<LoadOrderState>): LoadOrderState {
  return {
    mods: ensureArray<LoadOrderModEntry>(raw.mods).map((mod) => ({
      ...mod,
      plugins: Array.isArray(mod.plugins) ? mod.plugins : [],
    })),
    plugins: ensureArray<LoadOrderPluginEntry>(raw.plugins),
    plugins_txt_path: raw.plugins_txt_path ?? null,
    plugins_txt_ready: raw.plugins_txt_ready ?? false,
    active_plugin_count: raw.active_plugin_count ?? 0,
    message: raw.message ?? "",
    loot_issues: ensureArray(raw.loot_issues),
  };
}

export async function fetchLoadOrderState(
  paired: PairedDeck,
  gameDomain: string
): Promise<LoadOrderState> {
  const params = new URLSearchParams({ domain: gameDomain });
  const resp = await fetchDeck(
    `http://${paired.host}:${paired.port}/loadorder/state?${params}`,
    { headers: authHeaders(paired) }
  );
  const data = await readJson<Partial<LoadOrderState>>(resp);
  return normalizeLoadOrderState(data);
}

export async function sortLoadOrder(paired: PairedDeck, gameDomain: string): Promise<LoadOrderState> {
  const resp = await fetchDeck(`http://${paired.host}:${paired.port}/loadorder/sort`, {
    method: "POST",
    headers: { ...authHeaders(paired), "Content-Type": "application/json" },
    body: JSON.stringify({ game_domain: gameDomain }),
  });
  const data = await readJson<Partial<LoadOrderState>>(resp);
  return normalizeLoadOrderState(data);
}

export async function syncPluginsTxt(
  paired: PairedDeck,
  gameDomain: string
): Promise<{ plugin_count: number; path?: string }> {
  const resp = await fetchDeck(
    `http://${paired.host}:${paired.port}/loadorder/sync-plugins`,
    {
      method: "POST",
      headers: { ...authHeaders(paired), "Content-Type": "application/json" },
      body: JSON.stringify({ game_domain: gameDomain }),
    }
  );
  return readJson(resp);
}

export async function fetchDownloads(
  paired: PairedDeck,
  gameDomain: string
): Promise<CompanionDownloadRecord[]> {
  const params = new URLSearchParams({ domain: gameDomain });
  const resp = await fetchDeck(`http://${paired.host}:${paired.port}/downloads?${params}`, {
    headers: authHeaders(paired),
  });
  const data = await readJson<CompanionDownloadRecord[]>(resp);
  return Array.isArray(data) ? data : [];
}

export async function fetchLibraryUpdates(
  paired: PairedDeck,
  gameDomain: string
): Promise<ModUpdateInfo[]> {
  const params = new URLSearchParams({ domain: gameDomain });
  const resp = await fetchDeck(
    `http://${paired.host}:${paired.port}/library/updates?${params}`,
    { headers: authHeaders(paired) }
  );
  const data = await readJson<ModUpdateInfo[]>(resp);
  return ensureArray<ModUpdateInfo>(data);
}

export async function fetchCollections(
  paired: PairedDeck,
  gameDomain: string,
  offset = 0
): Promise<CollectionSummary[]> {
  const params = new URLSearchParams({ domain: gameDomain, offset: String(offset) });
  const resp = await fetchDeck(
    `http://${paired.host}:${paired.port}/collections/list?${params}`,
    { headers: authHeaders(paired) }
  );
  const data = await readJson<CollectionSummary[]>(resp);
  return ensureArray<CollectionSummary>(data);
}

function normalizeCollectionDetail(raw: Partial<CompanionCollectionDetail>): CompanionCollectionDetail {
  const detail = raw.detail ?? ({} as Partial<CollectionDetail>);
  const diff = raw.diff ?? ({} as Partial<CollectionDiffResult>);
  return {
    detail: {
      name: detail.name ?? "Collection",
      slug: detail.slug ?? "",
      author: detail.author ?? "",
      mod_count: detail.mod_count ?? 0,
      mods: ensureArray<CollectionModEntry>(detail.mods),
    },
    diff: {
      installed_count: diff.installed_count ?? 0,
      total_count: diff.total_count ?? 0,
      missing_count: diff.missing_count ?? 0,
      outdated_count: diff.outdated_count ?? 0,
      wrong_file_count: diff.wrong_file_count ?? 0,
      mods: ensureArray<CollectionModDiffEntry>(diff.mods),
    },
  };
}

export async function fetchCollectionDetail(
  paired: PairedDeck,
  gameDomain: string,
  slug: string
): Promise<CompanionCollectionDetail> {
  const params = new URLSearchParams({ domain: gameDomain, slug });
  const resp = await fetchDeck(
    `http://${paired.host}:${paired.port}/collections/detail?${params}`,
    { headers: authHeaders(paired) }
  );
  const data = await readJson<Partial<CompanionCollectionDetail>>(resp);
  return normalizeCollectionDetail(data);
}

export async function startCollectionInstall(
  paired: PairedDeck,
  gameDomain: string,
  slug: string,
  options?: { include_optional?: boolean; include_outdated?: boolean }
): Promise<CollectionInstallQueued[]> {
  const resp = await fetchDeck(
    `http://${paired.host}:${paired.port}/collections/install/start`,
    {
      method: "POST",
      headers: { ...authHeaders(paired), "Content-Type": "application/json" },
      body: JSON.stringify({
        game_domain: gameDomain,
        slug,
        include_optional: options?.include_optional ?? false,
        include_outdated: options?.include_outdated ?? false,
      }),
    }
  );
  const data = await readJson<CollectionInstallQueued[]>(resp);
  return ensureArray<CollectionInstallQueued>(data);
}

function normalizeDeviceSettings(raw: Partial<CompanionDeviceSettings>): CompanionDeviceSettings {
  return {
    app_version: raw.app_version ?? "unknown",
    nexus_configured: raw.nexus_configured ?? false,
    receive_enabled: raw.receive_enabled ?? false,
    auto_sort_after_install: raw.auto_sort_after_install ?? false,
    companion_api: raw.companion_api ?? COMPANION_API_VERSION,
    download_settings: {
      max_concurrent: raw.download_settings?.max_concurrent ?? 2,
      speed_limit_kbps: raw.download_settings?.speed_limit_kbps ?? 0,
      auto_install_after_download: raw.download_settings?.auto_install_after_download,
    },
  };
}

export async function fetchDeviceSettings(paired: PairedDeck): Promise<CompanionDeviceSettings> {
  const resp = await fetchDeck(`http://${paired.host}:${paired.port}/settings/device`, {
    headers: authHeaders(paired),
  });
  const data = await readJson<Partial<CompanionDeviceSettings>>(resp);
  return normalizeDeviceSettings(data);
}

export async function syncPresetsOnDevice(
  paired: PairedDeck,
  gameDomain: string
): Promise<SyncActionResult> {
  const resp = await fetchDeck(`http://${paired.host}:${paired.port}/sync/presets`, {
    method: "POST",
    headers: { ...authHeaders(paired), "Content-Type": "application/json" },
    body: JSON.stringify({ game_domain: gameDomain }),
  });
  return readJson<SyncActionResult>(resp);
}

export async function applyLoadOrderOnDevice(
  paired: PairedDeck,
  gameDomain: string
): Promise<SyncActionResult> {
  const resp = await fetchDeck(`http://${paired.host}:${paired.port}/sync/apply-loadorder`, {
    method: "POST",
    headers: { ...authHeaders(paired), "Content-Type": "application/json" },
    body: JSON.stringify({ game_domain: gameDomain }),
  });
  return readJson<SyncActionResult>(resp);
}

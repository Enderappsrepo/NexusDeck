import type {
  CompanionGame,
  InstallSessionStatus,
  ModDetail,
  ModFileInfo,
  ModSummary,
  SelectedInstallOption,
} from "./types";

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
  games?: CompanionGame[];
  companion_url?: string;
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

async function fetchDeck(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
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

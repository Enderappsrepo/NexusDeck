export interface PairedDeck {
  name: string;
  host: string;
  port: number;
  token: string;
}

export interface DeckGame {
  domain: string;
  name: string;
}

export interface PingInfo {
  name: string;
  version?: string;
  paired?: boolean;
  nexus_configured?: boolean;
  games?: DeckGame[];
  companion_url?: string;
}

export interface ModHit {
  mod_id: number;
  name: string;
  author: string;
  summary?: string;
  picture_url?: string | null;
}

export interface ModFileHit {
  file_id: number;
  name: string;
  file_name: string;
  size_kb: number;
  version: string;
  is_primary: boolean;
}

export const PAIRED_KEY = "nexusdeck_paired_deck";
const FETCH_TIMEOUT_MS = 15_000;

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
      "Network blocked — open the companion from http://YOUR_DECK_IP:8731/app/ instead of GitHub Pages."
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

export async function pingDeck(host: string, port: number): Promise<PingInfo> {
  const resp = await fetchDeck(`http://${host}:${port}/ping`);
  if (!resp.ok) throw new Error(`Couldn't reach the device (HTTP ${resp.status}).`);
  return resp.json() as Promise<PingInfo>;
}

export async function pairWithDeck(host: string, port: number, code: string): Promise<string> {
  const resp = await fetchDeck(`http://${host}:${port}/pair`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  if (!resp.ok) throw new Error("That pairing code didn't match — check the code on your Deck/PC.");
  const body = (await resp.json()) as { token?: string };
  if (!body.token) throw new Error("The device didn't return a pairing token.");
  return body.token;
}

function authHeaders(paired: PairedDeck): HeadersInit {
  return {
    Authorization: `Bearer ${paired.token}`,
  };
}

export async function searchModsViaDeck(
  paired: PairedDeck,
  gameDomain: string,
  query: string
): Promise<ModHit[]> {
  const params = new URLSearchParams({ domain: gameDomain, q: query });
  const resp = await fetchDeck(
    `http://${paired.host}:${paired.port}/search/mods?${params}`,
    { headers: authHeaders(paired) }
  );
  const body = (await resp.json()) as ModHit[] | { error?: string };
  if (!resp.ok) {
    throw new Error(
      typeof body === "object" && body && "error" in body
        ? String(body.error)
        : `Search failed (HTTP ${resp.status}).`
    );
  }
  return Array.isArray(body) ? body : [];
}

export async function sendModViaDeck(
  paired: PairedDeck,
  gameDomain: string,
  modId: number,
  modName: string
): Promise<string> {
  const resp = await fetchDeck(`http://${paired.host}:${paired.port}/install/nexus/mod`, {
    method: "POST",
    headers: {
      ...authHeaders(paired),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      game_domain: gameDomain,
      nexus_mod_id: modId,
      mod_name: modName,
    }),
  });
  const body = (await resp.json()) as { message?: string; error?: string; ok?: boolean };
  if (!resp.ok) throw new Error(body.message || body.error || `HTTP ${resp.status}`);
  return body.message ?? "Sent — downloading on your device.";
}

export interface NexusInstallPayload {
  game_domain: string;
  nexus_mod_id: number;
  nexus_file_id: number;
  mod_name: string;
  file_name: string;
  expected_size_kb: number;
  file_version?: string | null;
}

export async function sendNexusInstall(paired: PairedDeck, payload: NexusInstallPayload) {
  const resp = await fetchDeck(`http://${paired.host}:${paired.port}/install/nexus`, {
    method: "POST",
    headers: {
      ...authHeaders(paired),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const body = (await resp.json()) as { message?: string; error?: string };
  if (!resp.ok) throw new Error(body.message || body.error || `HTTP ${resp.status}`);
  return body.message ?? "Sent to device.";
}

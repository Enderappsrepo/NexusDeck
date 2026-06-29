export interface PairedDeck {
  name: string;
  host: string;
  port: number;
  token: string;
}

export const PAIRED_KEY = "nexusdeck_paired_deck";

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

export async function pingDeck(host: string, port: number) {
  const resp = await fetch(`http://${host}:${port}/ping`);
  if (!resp.ok) throw new Error(`Couldn't reach the Deck (HTTP ${resp.status}).`);
  return resp.json() as Promise<{ name: string; version?: string }>;
}

export async function pairWithDeck(host: string, port: number, code: string): Promise<string> {
  const resp = await fetch(`http://${host}:${port}/pair`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  if (!resp.ok) throw new Error("The Deck rejected that pairing code.");
  const body = (await resp.json()) as { token?: string };
  if (!body.token) throw new Error("The Deck didn't return a pairing token.");
  return body.token;
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
  const resp = await fetch(`http://${paired.host}:${paired.port}/install/nexus`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${paired.token}`,
    },
    body: JSON.stringify(payload),
  });
  const body = (await resp.json()) as { message?: string; error?: string };
  if (!resp.ok) throw new Error(body.message || body.error || `HTTP ${resp.status}`);
  return body.message ?? "Sent to Deck.";
}

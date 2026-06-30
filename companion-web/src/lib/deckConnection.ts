import {
  heartbeatDeck,
  loadCachedLanHosts,
  loadPaired,
  pingDeck,
  saveCachedLanHosts,
  type HeartbeatResult,
  type PairedDeck,
  type PingInfo,
} from "../deckApi";
import { discoverDevicesNearHost, discoverDevicesOnLan, type LanDevice } from "./lanDiscovery";

export type ReachResult =
  | { ok: true; deck: PairedDeck; info: PingInfo }
  | { ok: false; reason: "auth" | "unreachable" };

const HEARTBEAT_MS = 12_000;

function uniqueHosts(hosts: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of hosts) {
    const host = raw.trim();
    if (!host || seen.has(host)) continue;
    seen.add(host);
    out.push(host);
  }
  return out;
}

function hostCandidates(deck: PairedDeck): string[] {
  return uniqueHosts([deck.host, ...loadCachedLanHosts()]);
}

async function tryHost(
  deck: PairedDeck,
  host: string
): Promise<{ ok: true; deck: PairedDeck; info: PingInfo } | HeartbeatResult> {
  const candidate: PairedDeck = { ...deck, host };
  const beat = await heartbeatDeck(candidate);
  if (beat !== "ok") return beat;

  try {
    const info = await pingDeck(host, deck.port);
    const updated: PairedDeck = {
      ...deck,
      host,
      name: info.name || deck.name,
    };
    if (info.lan_hosts?.length) {
      saveCachedLanHosts([host, ...info.lan_hosts]);
    }
    return { ok: true, deck: updated, info };
  } catch {
    return "failed";
  }
}

async function findDeviceByName(
  deck: PairedDeck,
  devices: LanDevice[]
): Promise<LanDevice | null> {
  const target = deck.name.trim().toLowerCase();
  if (!target) return devices[0] ?? null;
  return devices.find((d) => d.name.trim().toLowerCase() === target) ?? devices[0] ?? null;
}

/** Try to reach a paired device, rotating through cached LAN IPs when DHCP changes. */
export async function reachPairedDeck(deck: PairedDeck): Promise<ReachResult> {
  for (const host of hostCandidates(deck)) {
    const result = await tryHost(deck, host);
    if (result === "unauthorized") return { ok: false, reason: "auth" };
    if (result === "failed") continue;
    return result;
  }

  const near = await discoverDevicesNearHost(deck.host, deck.port);
  const matched = await findDeviceByName(deck, near);
  if (matched) {
    const result = await tryHost(deck, matched.host);
    if (result === "unauthorized") return { ok: false, reason: "auth" };
    if (result !== "failed") return result;
  }

  const broad = await discoverDevicesOnLan(deck.port);
  const fallback = await findDeviceByName(deck, broad);
  if (!fallback) return { ok: false, reason: "unreachable" };

  const result = await tryHost(deck, fallback.host);
  if (result === "unauthorized") return { ok: false, reason: "auth" };
  if (result === "failed") return { ok: false, reason: "unreachable" };
  return result;
}

/** If we already have a token for this host, skip re-entering the pairing code. */
export async function resumePairedSession(
  host: string,
  port: number
): Promise<{ deck: PairedDeck; info: PingInfo } | null> {
  const saved = loadPaired();
  if (!saved || saved.host !== host || saved.port !== port) return null;

  const beat = await heartbeatDeck(saved);
  if (beat === "unauthorized") return null;
  if (beat === "ok") {
    try {
      const info = await pingDeck(host, port);
      return {
        deck: { ...saved, name: info.name || saved.name },
        info,
      };
    } catch {
      return { deck: saved, info: { name: saved.name } };
    }
  }

  const reached = await reachPairedDeck(saved);
  if (!reached.ok) return null;
  return { deck: reached.deck, info: reached.info };
}

export { HEARTBEAT_MS };

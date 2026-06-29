import { probeDeck } from "../deckApi";
import type { PingInfo } from "../deckApi";

export interface LanDevice {
  name: string;
  host: string;
  port: number;
  version?: string;
  nexus_configured?: boolean;
}

const DEFAULT_SUBNETS = [
  "192.168.1",
  "192.168.0",
  "192.168.2",
  "192.168.50",
  "10.0.0",
  "10.0.1",
  "172.16.0",
];

const BATCH_SIZE = 28;

async function guessLocalSubnet(): Promise<string | null> {
  if (typeof RTCPeerConnection === "undefined") return null;

  return new Promise((resolve) => {
    const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    const timer = window.setTimeout(() => {
      pc.close();
      resolve(null);
    }, 2500);

    pc.createDataChannel("probe");
    pc.onicecandidate = (event) => {
      const cand = event.candidate?.candidate;
      if (!cand) return;
      const match = /(\d{1,3}(?:\.\d{1,3}){3})/.exec(cand);
      if (!match) return;
      const ip = match[1];
      if (
        ip.startsWith("127.") ||
        ip.startsWith("169.254.") ||
        ip.endsWith(".0") ||
        ip.endsWith(".255")
      ) {
        return;
      }
      const parts = ip.split(".");
      if (parts.length !== 4) return;
      window.clearTimeout(timer);
      pc.close();
      resolve(`${parts[0]}.${parts[1]}.${parts[2]}`);
    };

    void pc.createOffer().then((offer) => pc.setLocalDescription(offer)).catch(() => {
      window.clearTimeout(timer);
      pc.close();
      resolve(null);
    });
  });
}

async function probeHost(host: string, port: number): Promise<LanDevice | null> {
  const info: PingInfo | null = await probeDeck(host, port);
  if (!info?.name) return null;
  return {
    name: info.name,
    host,
    port,
    version: info.version,
    nexus_configured: info.nexus_configured,
  };
}

function buildHostList(prefixes: string[]): string[] {
  const hosts: string[] = [];
  for (const prefix of prefixes) {
    for (let last = 1; last <= 254; last += 1) {
      hosts.push(`${prefix}.${last}`);
    }
  }
  return hosts;
}

export async function discoverDevicesOnLan(
  port = 8731,
  onProgress?: (scanned: number, total: number, found: LanDevice[]) => void
): Promise<LanDevice[]> {
  const hints = new Set(DEFAULT_SUBNETS);
  const local = await guessLocalSubnet();
  if (local) hints.add(local);

  const selfHost = getReceiverSelfHost();
  if (selfHost) {
    const parts = selfHost.host.split(".");
    if (parts.length === 4) hints.add(`${parts[0]}.${parts[1]}.${parts[2]}`);
  }

  const hosts = buildHostList([...hints]);
  const found: LanDevice[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < hosts.length; i += BATCH_SIZE) {
    const batch = hosts.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(batch.map((host) => probeHost(host, port)));
    for (const device of results) {
      if (!device || seen.has(device.host)) continue;
      seen.add(device.host);
      found.push(device);
    }
    onProgress?.(Math.min(i + BATCH_SIZE, hosts.length), hosts.length, found);
  }

  found.sort((a, b) => a.name.localeCompare(b.name));
  return found;
}

export function getReceiverSelfHost(): { host: string; port: number } | null {
  if (typeof location === "undefined") return null;
  if (location.hostname.endsWith("github.io")) return null;
  const host = location.hostname;
  if (!host || host === "localhost" || host === "127.0.0.1") return null;
  const port = Number(location.port) || 8731;
  return { host, port };
}

export function parseCompanionTarget(raw: string): { host: string; port: number } | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("nexusdeck://")) {
    const rest = trimmed.slice("nexusdeck://".length);
    const [hostPart, portPart] = rest.split(":");
    if (!hostPart) return null;
    return { host: hostPart, port: Number(portPart) || 8731 };
  }

  try {
    const url = new URL(trimmed.includes("://") ? trimmed : `http://${trimmed}`);
    if (!url.hostname) return null;
    return { host: url.hostname, port: Number(url.port) || 8731 };
  } catch {
    return null;
  }
}

export function readConnectParamsFromUrl(): { host: string; port: number } | null {
  if (typeof location === "undefined") return null;
  const params = new URLSearchParams(location.search);
  const host = params.get("host")?.trim();
  if (!host) return getReceiverSelfHost();
  const port = Number(params.get("port")) || 8731;
  return { host, port };
}

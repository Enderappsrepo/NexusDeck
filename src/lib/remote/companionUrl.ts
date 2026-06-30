/** Primary companion URL to encode in a QR code (first LAN address). */
export function primaryCompanionUrl(urls: string[] | undefined): string | null {
  return urls?.find(Boolean) ?? null;
}

/** Short deep link form supported by the companion QR scanner. */
export function companionDeepLink(host: string, port = 8731): string {
  return `nexusdeck://${host}:${port}`;
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

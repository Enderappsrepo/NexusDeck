import { api } from "@/lib/commands";

const assetUrlCache = new Map<string, string>();

function cacheKey(extractDir: string, relativePath: string) {
  return `${extractDir}::${relativePath}`;
}

export async function loadFomodAssetUrl(
  extractDir: string | null | undefined,
  relativePath?: string | null
): Promise<string | null> {
  if (!extractDir || !relativePath) return null;

  const key = cacheKey(extractDir, relativePath);
  const cached = assetUrlCache.get(key);
  if (cached) return cached;

  const payload = await api.readFomodAsset({
    extractDir,
    relativePath,
  });
  if (!payload || payload.bytes.length === 0) return null;

  const blob = new Blob([Uint8Array.from(payload.bytes)], { type: payload.mime_type });
  const url = URL.createObjectURL(blob);
  assetUrlCache.set(key, url);
  return url;
}

export function releaseFomodAssetUrls() {
  for (const url of assetUrlCache.values()) {
    URL.revokeObjectURL(url);
  }
  assetUrlCache.clear();
}

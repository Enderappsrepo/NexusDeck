import { api } from "@/lib/commands";
import type { ModFileInfo, Profile, RemoteModInstallMeta } from "@/lib/nexus/types";
import { modFileDownloadName } from "@/lib/nexus/types";
import { loadPairedDeck, type PairedDeck } from "@/lib/remote/pairedDeck";

export function getPairedDeck(): PairedDeck | null {
  return loadPairedDeck();
}

export async function resolveArchiveForSend(
  profile: Profile,
  modId: number,
  fileId: number,
  fileName: string
): Promise<string | null> {
  const downloads = await api.listDownloads();
  const match = downloads.find(
    (d) =>
      d.game_domain === profile.game_domain &&
      d.mod_id === modId &&
      d.file_id === fileId &&
      d.status === "complete" &&
      d.dest_path
  );
  if (match?.dest_path) return match.dest_path;
  try {
    const resolved = await api.resolveModArchivePath(profile.staging_path, fileName);
    return resolved.path;
  } catch {
    return null;
  }
}

export async function sendModArchiveToDeck(
  paired: PairedDeck,
  archivePath: string,
  meta: Omit<RemoteModInstallMeta, "filename"> & { filename?: string }
): Promise<string> {
  const filename =
    meta.filename ??
    archivePath.split(/[/\\]/).pop()?.replace(/[^a-zA-Z0-9._-]+/g, "_") ??
    "mod.7z";

  const result = await api.sendModToDeck(paired.host, paired.port, paired.token, archivePath, {
    ...meta,
    filename,
    options: meta.options ?? {
      strategy: "auto",
      enable_mod: true,
      overwrite_files: false,
      selected_options: [],
    },
  });

  return result.message;
}

export async function sendModFileToDeck(
  paired: PairedDeck,
  domain: string,
  modId: number,
  modName: string,
  file: ModFileInfo,
  archivePath: string
): Promise<string> {
  return sendModArchiveToDeck(paired, archivePath, {
    game_domain: domain,
    mod_name: modName,
    nexus_mod_id: modId,
    nexus_file_id: file.file_id,
    filename: modFileDownloadName(file),
    file_version: file.version || null,
  });
}

export async function sendPresetsToPairedDeck(
  paired: PairedDeck,
  profileId: string
): Promise<string> {
  const result = await api.sendPresetsToDeck(
    paired.host,
    paired.port,
    paired.token,
    profileId
  );
  return result.message;
}

export async function sendLoadOrderToPairedDeck(
  paired: PairedDeck,
  profileId: string
): Promise<string> {
  const result = await api.sendLoadOrderToDeck(
    paired.host,
    paired.port,
    paired.token,
    profileId
  );
  return result.message;
}

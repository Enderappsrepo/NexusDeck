import { api } from "@/lib/commands";
import {
  modFileDownloadName,
  type DownloadProgress,
  type ModSummary,
  type Profile,
} from "@/lib/nexus/types";

export async function quickDownloadMod(params: {
  domain: string;
  modId: number;
  profile: Profile;
  modName?: string;
}): Promise<{ started: boolean; modId: number; progress?: DownloadProgress }> {
  const { domain, modId, profile, modName } = params;
  const modFiles = await api.getModFiles(domain, modId);
  const primary = modFiles.find((f) => f.is_primary) ?? modFiles[0];
  if (!primary) {
    return { started: false, modId };
  }
  const progress = await api.startModDownload({
    gameDomain: domain,
    modId,
    fileId: primary.file_id,
    fileName: modFileDownloadName(primary),
    stagingPath: profile.staging_path,
    expectedSizeKb: primary.size_kb,
    modName,
    profileId: profile.id,
  });
  return { started: true, modId, progress };
}

export function findModName(mods: ModSummary[], modId: number): string | undefined {
  return mods.find((m) => m.mod_id === modId)?.name;
}

import { create } from "zustand";
import type { DownloadProgress } from "@/lib/nexus/types";
import type { InstallJob } from "@/stores/installQueueStore";

export type CollectionModStatus =
  | "pending"
  | "downloading"
  | "installing"
  | "done"
  | "failed";

export interface CollectionModProgress {
  modId: number;
  name: string;
  downloadId?: string;
  status: CollectionModStatus;
  error?: string;
}

export interface ActiveCollectionInstall {
  slug: string;
  name: string;
  gameDomain: string;
  profileId: string;
  mods: CollectionModProgress[];
  startedAt: number;
}

interface CollectionInstallState {
  active: ActiveCollectionInstall | null;
  startBatch: (batch: Omit<ActiveCollectionInstall, "startedAt">) => void;
  bindDownload: (modId: number, downloadId: string) => void;
  syncFromDownload: (download: DownloadProgress, error?: string) => void;
  syncFromInstallJob: (job: InstallJob) => void;
  dismiss: () => void;
  doneCount: () => number;
  totalCount: () => number;
}

function findMod(
  mods: CollectionModProgress[],
  download: DownloadProgress
): CollectionModProgress | undefined {
  return (
    mods.find((m) => m.downloadId === download.id) ??
    mods.find((m) => m.modId === download.mod_id && !m.downloadId)
  );
}

export const useCollectionInstallStore = create<CollectionInstallState>((set, get) => ({
  active: null,

  startBatch: (batch) =>
    set({
      active: {
        ...batch,
        startedAt: Date.now(),
      },
    }),

  bindDownload: (modId, downloadId) =>
    set((s) => {
      if (!s.active) return s;
      const mods = s.active.mods.map((m) =>
        m.modId === modId ? { ...m, downloadId, status: "downloading" as const } : m
      );
      return { active: { ...s.active, mods } };
    }),

  syncFromDownload: (download, error) =>
    set((s) => {
      if (!s.active) return s;
      const mod = findMod(s.active.mods, download);
      if (!mod) return s;

      let status: CollectionModStatus = mod.status;
      if (error || download.status === "failed") {
        status = "failed";
      } else if (download.status === "complete") {
        status = "installing";
      } else if (
        download.status === "downloading" ||
        download.status === "queued" ||
        download.status === "paused"
      ) {
        status = "downloading";
      }

      const mods = s.active.mods.map((m) =>
        m.modId === mod.modId
          ? {
              ...m,
              downloadId: download.id,
              status,
              error: error ?? (download.status === "failed" ? "Download failed" : m.error),
            }
          : m
      );
      return { active: { ...s.active, mods } };
    }),

  syncFromInstallJob: (job) =>
    set((s) => {
      if (!s.active || job.source !== "collection") return s;
      const mod = s.active.mods.find((m) => m.modId === job.modId);
      if (!mod) return s;

      const status: CollectionModStatus =
        job.status === "done"
          ? "done"
          : job.status === "failed"
            ? "failed"
            : job.status === "active"
              ? "installing"
              : mod.status;

      const mods = s.active.mods.map((m) =>
        m.modId === mod.modId
          ? {
              ...m,
              status,
              error: job.error ?? m.error,
            }
          : m
      );
      return { active: { ...s.active, mods } };
    }),

  dismiss: () => set({ active: null }),

  doneCount: () => {
    const active = get().active;
    if (!active) return 0;
    return active.mods.filter((m) => m.status === "done").length;
  },

  totalCount: () => get().active?.mods.length ?? 0,
}));

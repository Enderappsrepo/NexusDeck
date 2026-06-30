import { create } from "zustand";
import type { DownloadProgress, Profile } from "@/lib/nexus/types";
import type { InstallJob } from "@/stores/installQueueStore";

export type CollectionModStatus =
  | "pending"
  | "downloading"
  | "ready"
  | "installing"
  | "done"
  | "failed"
  | "skipped";

export interface CollectionModProgress {
  modId: number;
  name: string;
  fileId?: number | null;
  optional: boolean;
  downloadId?: string;
  status: CollectionModStatus;
  error?: string;
}

export interface ActiveCollectionInstall {
  slug: string;
  name: string;
  gameDomain: string;
  profile: Profile;
  mods: CollectionModProgress[];
  startedAt: number;
}

interface CollectionInstallState {
  active: ActiveCollectionInstall | null;
  startBatch: (batch: Omit<ActiveCollectionInstall, "startedAt">) => void;
  bindDownload: (modId: number, downloadId: string) => void;
  syncFromDownload: (download: DownloadProgress, error?: string) => void;
  syncFromInstallJob: (job: InstallJob) => void;
  markSkipped: (modId: number) => void;
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

  startBatch: (batch) => {
    const existing = get().active;
    if (
      existing?.slug === batch.slug &&
      existing.mods.some(
        (m) => m.status !== "done" && m.status !== "failed" && m.status !== "skipped"
      )
    ) {
      return;
    }
    set({
      active: {
        ...batch,
        startedAt: Date.now(),
      },
    });
  },

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
        status = "ready";
      } else if (
        download.status === "downloading" ||
        download.status === "queued" ||
        download.status === "paused"
      ) {
        status = "downloading";
      }

      const nextError = error ?? (download.status === "failed" ? "Download failed" : mod.error);
      if (mod.downloadId === download.id && mod.status === status && mod.error === nextError) {
        return s;
      }

      const mods = s.active.mods.map((m) =>
        m.modId === mod.modId
          ? {
              ...m,
              downloadId: download.id,
              status,
              error: nextError,
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
              : job.status === "queued"
                ? "ready"
                : mod.status;

      const nextError = job.error ?? mod.error;
      if (mod.status === status && mod.error === nextError) {
        return s;
      }

      const mods = s.active.mods.map((m) =>
        m.modId === mod.modId
          ? {
              ...m,
              status,
              error: nextError,
            }
          : m
      );
      return { active: { ...s.active, mods } };
    }),

  markSkipped: (modId) =>
    set((s) => {
      if (!s.active) return s;
      const mods = s.active.mods.map((m) =>
        m.modId === modId ? { ...m, status: "skipped" as const } : m
      );
      return { active: { ...s.active, mods } };
    }),

  dismiss: () => set({ active: null }),

  doneCount: () => {
    const active = get().active;
    if (!active) return 0;
    return active.mods.filter((m) => m.status === "done" || m.status === "skipped").length;
  },

  totalCount: () => get().active?.mods.length ?? 0,
}));

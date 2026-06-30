import { create } from "zustand";
import type { DownloadProgress, Profile } from "@/lib/nexus/types";
import type { InstallJob } from "@/stores/installQueueStore";

export type EssentialsModStatus =
  | "pending"
  | "setup"
  | "downloading"
  | "installing"
  | "done"
  | "failed"
  | "skipped";

export interface EssentialsModProgress {
  id: string;
  name: string;
  optional: boolean;
  downloadId?: string;
  status: EssentialsModStatus;
  error?: string;
}

export interface ActiveEssentialsInstall {
  manifestId: string;
  name: string;
  gameDomain: string;
  profile: Profile;
  mods: EssentialsModProgress[];
  setupDone: boolean;
  postBatchDone: boolean;
  startedAt: number;
}

interface EssentialsInstallState {
  active: ActiveEssentialsInstall | null;
  startBatch: (batch: Omit<ActiveEssentialsInstall, "startedAt" | "setupDone" | "postBatchDone">) => void;
  markSetupDone: () => void;
  markPostBatchDone: () => void;
  bindDownload: (essentialId: string, downloadId: string) => void;
  syncFromDownload: (download: DownloadProgress, error?: string) => void;
  syncFromInstallJob: (job: InstallJob) => void;
  markSkipped: (essentialId: string) => void;
  dismiss: () => void;
  doneCount: () => number;
  totalCount: () => number;
}

function findMod(
  mods: EssentialsModProgress[],
  download: DownloadProgress
): EssentialsModProgress | undefined {
  return (
    mods.find((m) => m.downloadId === download.id) ??
    mods.find((m) => !m.downloadId && download.mod_name.includes(m.name.slice(0, 12)))
  );
}

export const useEssentialsInstallStore = create<EssentialsInstallState>((set, get) => ({
  active: null,

  startBatch: (batch) => {
    const existing = get().active;
    if (
      existing?.manifestId === batch.manifestId &&
      existing.mods.some(
        (m) => m.status !== "done" && m.status !== "failed" && m.status !== "skipped"
      )
    ) {
      return;
    }
    set({
      active: {
        ...batch,
        setupDone: false,
        postBatchDone: false,
        startedAt: Date.now(),
      },
    });
  },

  markSetupDone: () =>
    set((s) => (s.active ? { active: { ...s.active, setupDone: true } } : s)),

  markPostBatchDone: () =>
    set((s) => (s.active ? { active: { ...s.active, postBatchDone: true } } : s)),

  bindDownload: (essentialId, downloadId) =>
    set((s) => {
      if (!s.active) return s;
      const mods = s.active.mods.map((m) =>
        m.id === essentialId ? { ...m, downloadId, status: "downloading" as const } : m
      );
      return { active: { ...s.active, mods } };
    }),

  syncFromDownload: (download, error) =>
    set((s) => {
      if (!s.active) return s;
      const mod = findMod(s.active.mods, download);
      if (!mod) return s;

      let status: EssentialsModStatus = mod.status;
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

      const nextError = error ?? (download.status === "failed" ? "Download failed" : mod.error);
      if (mod.downloadId === download.id && mod.status === status && mod.error === nextError) {
        return s;
      }

      const mods = s.active.mods.map((m) =>
        m.id === mod.id
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
      if (!s.active || job.source !== "essentials") return s;
      const mod = s.active.mods.find((m) => m.downloadId === job.downloadId);
      if (!mod) return s;

      const status: EssentialsModStatus =
        job.status === "done"
          ? "done"
          : job.status === "failed"
            ? "failed"
            : job.status === "active"
              ? "installing"
              : mod.status;

      const nextError = job.error ?? mod.error;
      if (mod.status === status && mod.error === nextError) {
        return s;
      }

      const mods = s.active.mods.map((m) =>
        m.id === mod.id ? { ...m, status, error: nextError } : m
      );
      return { active: { ...s.active, mods } };
    }),

  markSkipped: (essentialId) =>
    set((s) => {
      if (!s.active) return s;
      const mods = s.active.mods.map((m) =>
        m.id === essentialId ? { ...m, status: "skipped" as const } : m
      );
      return { active: { ...s.active, mods } };
    }),

  dismiss: () => set({ active: null }),

  doneCount: () => {
    const active = get().active;
    if (!active) return 0;
    const modsDone = active.mods.filter(
      (m) => m.status === "done" || m.status === "skipped"
    ).length;
    const setupWeight = active.setupDone ? 1 : 0;
    const postWeight = active.postBatchDone ? 1 : 0;
    return modsDone + setupWeight + postWeight;
  },

  totalCount: () => {
    const active = get().active;
    if (!active) return 0;
    return active.mods.length + 2;
  },
}));

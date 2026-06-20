import { create } from "zustand";
import type { DownloadProgress, DownloadRecord } from "@/lib/nexus/types";
import { downloadRecordToProgress } from "@/lib/nexus/types";
import { api } from "@/lib/commands";

interface DownloadsState {
  active: Record<string, DownloadProgress>;
  errors: Record<string, string>;
  hydrated: boolean;
  autoInstallIds: Set<string>;
  setProgress: (progress: DownloadProgress) => void;
  setError: (id: string, error: string) => void;
  remove: (id: string) => void;
  clearError: (id: string) => void;
  hydrateFromRecords: (records: DownloadRecord[]) => void;
  markAutoInstall: (id: string) => void;
  consumeAutoInstall: (id: string) => boolean;
  cancel: (downloadId: string) => Promise<void>;
  retry: (downloadId: string) => Promise<void>;
  dismiss: (downloadId: string) => Promise<void>;
  clearCompleted: () => Promise<void>;
  clearFailed: () => Promise<void>;
}

export const useDownloadsStore = create<DownloadsState>((set, get) => ({
  active: {},
  errors: {},
  hydrated: false,
  autoInstallIds: new Set(),

  setProgress: (progress) =>
    set((s) => {
      const errors = { ...s.errors };
      delete errors[progress.id];
      return { active: { ...s.active, [progress.id]: progress }, errors };
    }),

  setError: (id, error) =>
    set((s) => ({
      errors: { ...s.errors, [id]: error },
      active: {
        ...s.active,
        [id]: s.active[id]
          ? { ...s.active[id], status: "failed" }
          : {
              id,
              game_domain: "",
              mod_id: 0,
              file_id: 0,
              file_name: "Download failed",
              bytes_done: 0,
              bytes_total: 0,
              status: "failed",
              dest_path: "",
            },
      },
    })),

  remove: (id) =>
    set((s) => {
      const { [id]: _a, ...active } = s.active;
      const { [id]: _e, ...errors } = s.errors;
      return { active, errors };
    }),

  clearError: (id) =>
    set((s) => {
      const { [id]: _, ...errors } = s.errors;
      return { errors };
    }),

  hydrateFromRecords: (records) => {
    const active: Record<string, DownloadProgress> = {};
    for (const record of records) {
      if (record.status === "complete" || record.status === "cancelled") continue;
      active[record.id] = downloadRecordToProgress(record);
    }
    set({ active, hydrated: true });
  },

  markAutoInstall: (id) =>
    set((s) => {
      const next = new Set(s.autoInstallIds);
      next.add(id);
      return { autoInstallIds: next };
    }),

  consumeAutoInstall: (id) => {
    const state = get();
    if (!state.autoInstallIds.has(id)) return false;
    const next = new Set(state.autoInstallIds);
    next.delete(id);
    set({ autoInstallIds: next });
    return true;
  },

  cancel: async (downloadId) => {
    await api.cancelDownload(downloadId);
    get().remove(downloadId);
  },

  retry: async (downloadId) => {
    const progress = await api.retryDownload(downloadId);
    get().setProgress(progress);
  },

  clearCompleted: async () => {
    await api.clearCompletedDownloads();
    set((s) => {
      const active = { ...s.active };
      for (const [id, d] of Object.entries(active)) {
        if (d.status === "complete") delete active[id];
      }
      return { active };
    });
  },

  dismiss: async (downloadId) => {
    await api.dismissDownload(downloadId);
    get().remove(downloadId);
  },

  clearFailed: async () => {
    await api.clearFailedDownloads();
    set((s) => {
      const active = { ...s.active };
      const errors = { ...s.errors };
      for (const [id, d] of Object.entries(active)) {
        if (d.status === "failed" || d.status === "cancelled") {
          delete active[id];
          delete errors[id];
        }
      }
      return { active, errors };
    });
  },
}));

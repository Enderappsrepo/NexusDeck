import { create } from "zustand";
import { api } from "@/lib/commands";
import type { DownloadProgress, ModFileInfo, Profile, InstallPreset } from "@/lib/nexus/types";

export type InstallJobSource = "manual" | "update" | "dep" | "collection" | "bodyslide" | "cbbe" | "nxm";
export type InstallJobStatus = "queued" | "active" | "done" | "failed";

export interface InstallJob {
  id: string;
  downloadId: string;
  profile: Profile;
  modId: number;
  modName: string;
  file: ModFileInfo;
  archivePath: string;
  replaceModId?: string;
  source: InstallJobSource;
  status: InstallJobStatus;
  error?: string;
  installPreset?: InstallPreset;
}

export interface PendingInstallMeta {
  source: InstallJobSource;
  replaceModId?: string;
  collectionSlug?: string;
  collectionName?: string;
  modId?: number;
  modName?: string;
}

interface InstallQueueState {
  jobs: InstallJob[];
  activeJobId: string | null;
  pendingByDownloadId: Record<string, PendingInstallMeta>;
  installPrompt: DownloadProgress | null;
  profileError: string | null;
  profileErrorDomain: string | null;

  registerPendingInstall: (downloadId: string, meta: PendingInstallMeta) => void;
  clearPendingInstall: (downloadId: string) => void;

  enqueueFromDownload: (
    download: DownloadProgress,
    source: InstallJobSource,
    profiles: Profile[],
    options?: { front?: boolean; replaceModId?: string; installPreset?: InstallPreset }
  ) => Promise<boolean>;

  prioritizeDownload: (downloadId: string) => void;
  activateNext: () => void;
  completeActive: (downloadId?: string) => void;
  failActive: (error: string) => void;
  cancelActive: () => void;
  retryJob: (jobId: string) => void;
  removeJob: (jobId: string) => void;
  clearFailedJobs: () => void;
  clearDoneJobs: () => void;

  showInstallPrompt: (download: DownloadProgress) => void;
  dismissInstallPrompt: () => void;
  clearProfileError: () => void;

  getActiveJob: () => InstallJob | null;
  queuedCount: () => number;
}

function syntheticFileFromDownload(download: DownloadProgress): ModFileInfo {
  return {
    file_id: download.file_id,
    name: download.file_name,
    file_name: download.file_name,
    size_kb: Math.ceil(download.bytes_total / 1024),
    is_primary: true,
    version: "",
    uploaded_timestamp: 0,
    category_id: 0,
    category_name: "",
  };
}

async function resolveFileForDownload(
  download: DownloadProgress
): Promise<ModFileInfo | null> {
  try {
    const files = await api.getModFiles(download.game_domain, download.mod_id);
    return (
      files.find((f) => f.file_id === download.file_id) ??
      files.find((f) => f.is_primary) ??
      files[0] ??
      null
    );
  } catch {
    return syntheticFileFromDownload(download);
  }
}

export const useInstallQueueStore = create<InstallQueueState>((set, get) => ({
  jobs: [],
  activeJobId: null,
  pendingByDownloadId: {},
  installPrompt: null,
  profileError: null,
  profileErrorDomain: null,

  registerPendingInstall: (downloadId, meta) =>
    set((s) => ({
      pendingByDownloadId: { ...s.pendingByDownloadId, [downloadId]: meta },
    })),

  clearPendingInstall: (downloadId) =>
    set((s) => {
      const { [downloadId]: _, ...pendingByDownloadId } = s.pendingByDownloadId;
      return { pendingByDownloadId };
    }),

  enqueueFromDownload: async (download, source, profiles, options) => {
    if (get().jobs.some((j) => j.downloadId === download.id)) {
      return true;
    }

    const profile = download.profile_id
      ? profiles.find((p) => p.id === download.profile_id)
      : profiles.find((p) => p.game_domain === download.game_domain);

    if (!profile) {
      set({
        profileError: `No game profile found for ${download.game_domain}. Set up the game first.`,
        profileErrorDomain: download.game_domain,
      });
      return false;
    }

    const file = await resolveFileForDownload(download);
    if (!file) {
      set({ profileError: "Could not resolve mod file metadata for install." });
      return false;
    }

    const job: InstallJob = {
      id: crypto.randomUUID(),
      downloadId: download.id,
      profile,
      modId: download.mod_id,
      modName: download.mod_name || file.name,
      file,
      archivePath: download.dest_path,
      replaceModId: options?.replaceModId ?? download.update_target_mod_id,
      source,
      status: "queued",
      installPreset: options?.installPreset,
    };

    set((s) => {
      const jobs = options?.front ? [job, ...s.jobs] : [...s.jobs, job];
      return { jobs, profileError: null, profileErrorDomain: null };
    });

    get().clearPendingInstall(download.id);

    if (!get().activeJobId) {
      get().activateNext();
    }
    return true;
  },

  prioritizeDownload: (downloadId) => {
    set((s) => {
      const idx = s.jobs.findIndex(
        (j) => j.downloadId === downloadId && j.status === "queued"
      );
      if (idx <= 0) return s;
      const jobs = [...s.jobs];
      const [job] = jobs.splice(idx, 1);
      jobs.unshift(job);
      return { jobs };
    });
    if (!get().activeJobId) get().activateNext();
  },

  activateNext: () => {
    const { jobs, activeJobId } = get();
    if (activeJobId) return;
    const next = jobs.find((j) => j.status === "queued");
    if (!next) return;
    set({
      jobs: jobs.map((j) =>
        j.id === next.id ? { ...j, status: "active" as const } : j
      ),
      activeJobId: next.id,
    });
  },

  completeActive: (downloadId) => {
    const { activeJobId, jobs } = get();
    if (!activeJobId) return;
    set({
      jobs: jobs.map((j) =>
        j.id === activeJobId ? { ...j, status: "done" as const } : j
      ),
      activeJobId: null,
    });
    if (downloadId) get().clearPendingInstall(downloadId);
    get().activateNext();
  },

  failActive: (error) => {
    const { activeJobId, jobs } = get();
    if (!activeJobId) return;
    set({
      jobs: jobs.map((j) =>
        j.id === activeJobId ? { ...j, status: "failed" as const, error } : j
      ),
      activeJobId: null,
    });
    get().activateNext();
  },

  cancelActive: () => {
    const { activeJobId, jobs } = get();
    if (!activeJobId) return;
    const job = jobs.find((j) => j.id === activeJobId);
    if (job) {
      void api.cancelInstall(job.profile.id).catch(() => {});
    }
    set({
      jobs: jobs.filter((j) => j.id !== activeJobId),
      activeJobId: null,
    });
    get().activateNext();
  },

  retryJob: (jobId: string) => {
    set((s) => ({
      jobs: s.jobs.map((j) =>
        j.id === jobId
          ? { ...j, status: "queued" as const, error: undefined }
          : j
      ),
    }));
    if (!get().activeJobId) get().activateNext();
  },

  removeJob: (jobId: string) => {
    const { activeJobId, jobs } = get();
    set({
      jobs: jobs.filter((j) => j.id !== jobId),
      activeJobId: activeJobId === jobId ? null : activeJobId,
    });
    if (activeJobId === jobId || !get().activeJobId) get().activateNext();
  },

  clearFailedJobs: () =>
    set((s) => ({ jobs: s.jobs.filter((j) => j.status !== "failed") })),

  clearDoneJobs: () =>
    set((s) => ({ jobs: s.jobs.filter((j) => j.status !== "done") })),

  showInstallPrompt: (download) =>
    set({ installPrompt: download, profileError: null, profileErrorDomain: null }),
  dismissInstallPrompt: () => set({ installPrompt: null }),
  clearProfileError: () => set({ profileError: null, profileErrorDomain: null }),

  getActiveJob: () => {
    const { jobs, activeJobId } = get();
    return jobs.find((j) => j.id === activeJobId) ?? null;
  },

  queuedCount: () => get().jobs.filter((j) => j.status === "queued").length,
}));

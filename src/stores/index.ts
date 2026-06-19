import { create } from "zustand";
import type {
  DownloadProgress,
  DownloadRecord,
  DownloadSettings,
  ModCategory,
  ModSearchFilters,
  ModSummary,
  NexusUser,
  Profile,
} from "@/lib/nexus/types";
import { downloadRecordToProgress } from "@/lib/nexus/types";
import { DEFAULT_FILTERS } from "@/lib/nexus/filters";
import { api } from "@/lib/commands";

const BATTERY_MODE_KEY = "nexusdeck_battery_mode";

interface AuthState {
  user: NexusUser | null;
  loading: boolean;
  error: string | null;
  initialized: boolean;
  setUser: (user: NexusUser | null) => void;
  initialize: () => Promise<void>;
  login: (key: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: false,
  error: null,
  initialized: false,

  setUser: (user) => set({ user }),

  initialize: async () => {
    set({ loading: true, error: null });
    try {
      const user = await api.loadStoredApiKey();
      set({ user, initialized: true, loading: false });
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : String(e),
        initialized: true,
        loading: false,
      });
    }
  },

  login: async (key) => {
    set({ loading: true, error: null });
    try {
      const user = await api.validateAndStoreApiKey(key);
      set({ user, loading: false });
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : String(e),
        loading: false,
      });
      throw e;
    }
  },

  logout: async () => {
    await api.clearApiKey();
    set({ user: null });
  },
}));

interface GamesState {
  profiles: Profile[];
  loading: boolean;
  loadProfiles: () => Promise<void>;
  getProfile: (domain: string) => Profile | undefined;
}

export const useGamesStore = create<GamesState>((set, get) => ({
  profiles: [],
  loading: false,

  loadProfiles: async () => {
    set({ loading: true });
    const profiles = await api.listProfiles();
    set({ profiles, loading: false });
  },

  getProfile: (domain) =>
    get().profiles.find((p) => p.game_domain === domain),
}));

interface WizardState {
  step: number;
  gamePath: string;
  stagingPath: string;
  protonPrefixPath: string;
  profileName: string;
  f4seStatus: unknown;
  setStep: (step: number) => void;
  setGamePath: (path: string) => void;
  setStagingPath: (path: string) => void;
  setProtonPrefixPath: (path: string) => void;
  setProfileName: (name: string) => void;
  setF4seStatus: (status: unknown) => void;
  reset: () => void;
}

export const useWizardStore = create<WizardState>((set) => ({
  step: 0,
  gamePath: "",
  stagingPath: "",
  protonPrefixPath: "",
  profileName: "Default",
  f4seStatus: null,
  setStep: (step) => set({ step }),
  setGamePath: (gamePath) => set({ gamePath }),
  setStagingPath: (stagingPath) => set({ stagingPath }),
  setProtonPrefixPath: (protonPrefixPath) => set({ protonPrefixPath }),
  setProfileName: (profileName) => set({ profileName }),
  setF4seStatus: (f4seStatus) => set({ f4seStatus }),
  reset: () =>
    set({
      step: 0,
      gamePath: "",
      stagingPath: "",
      protonPrefixPath: "",
      profileName: "Default",
      f4seStatus: null,
    }),
}));

interface DownloadsState {
  active: Record<string, DownloadProgress>;
  errors: Record<string, string>;
  hydrated: boolean;
  setProgress: (progress: DownloadProgress) => void;
  setError: (id: string, error: string) => void;
  remove: (id: string) => void;
  clearError: (id: string) => void;
  hydrateFromRecords: (records: DownloadRecord[]) => void;
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

interface SettingsState {
  downloadSettings: DownloadSettings;
  batteryMode: boolean;
  loading: boolean;
  loadSettings: () => Promise<void>;
  setDownloadSettings: (settings: DownloadSettings) => Promise<void>;
  setBatteryMode: (enabled: boolean) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  downloadSettings: { max_concurrent: 2, speed_limit_kbps: 0 },
  batteryMode: localStorage.getItem(BATTERY_MODE_KEY) === "true",
  loading: false,

  loadSettings: async () => {
    set({ loading: true });
    try {
      const downloadSettings = await api.getDownloadSettings();
      set({ downloadSettings, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  setDownloadSettings: async (settings) => {
    await api.setDownloadSettings(settings);
    set({ downloadSettings: settings });
  },

  setBatteryMode: (enabled) => {
    localStorage.setItem(BATTERY_MODE_KEY, String(enabled));
    set({ batteryMode: enabled });
  },
}));

interface ModsState {
  mods: ModSummary[];
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  query: string;
  sort: string;
  filters: ModSearchFilters;
  totalCount: number;
  categories: ModCategory[];
  categoriesLoading: boolean;
  hasMore: boolean;
  setQuery: (query: string) => void;
  setSort: (sort: string) => void;
  setFilters: (filters: ModSearchFilters) => void;
  loadCategories: (domain: string) => Promise<void>;
  search: (domain: string) => Promise<void>;
  loadMore: (domain: string) => Promise<void>;
}

const MODS_PAGE_SIZE = 48;

export const useModsStore = create<ModsState>((set, get) => ({
  mods: [],
  loading: false,
  loadingMore: false,
  error: null,
  query: "",
  sort: "endorsements",
  filters: { ...DEFAULT_FILTERS },
  totalCount: 0,
  categories: [],
  categoriesLoading: false,
  hasMore: false,

  setQuery: (query) => set({ query }),
  setSort: (sort) => set({ sort }),
  setFilters: (filters) => set({ filters }),

  loadCategories: async (domain) => {
    set({ categoriesLoading: true });
    try {
      const categories = await api.listModCategories(domain);
      set({ categories, categoriesLoading: false });
    } catch (e) {
      console.error("[NexusDeck] Failed to load mod categories:", e);
      set({ categories: [], categoriesLoading: false });
    }
  },

  search: async (domain) => {
    set({ loading: true, error: null });
    try {
      const { query, sort, filters } = get();
      const result = await api.searchModsFiltered(
        domain,
        query,
        sort,
        0,
        MODS_PAGE_SIZE,
        filters
      );
      set({
        mods: result.mods,
        totalCount: result.total_count,
        loading: false,
        error: null,
        hasMore: result.mods.length >= MODS_PAGE_SIZE,
      });
    } catch (e) {
      set({
        loading: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  },

  loadMore: async (domain) => {
    const { loading, loadingMore, mods, query, sort, filters, hasMore } = get();
    if (loading || loadingMore || !hasMore) return;

    set({ loadingMore: true, error: null });
    try {
      const result = await api.searchModsFiltered(
        domain,
        query,
        sort,
        mods.length,
        MODS_PAGE_SIZE,
        filters
      );
      set({
        mods: [...mods, ...result.mods],
        totalCount: result.total_count,
        loadingMore: false,
        hasMore: result.mods.length >= MODS_PAGE_SIZE,
      });
    } catch (e) {
      set({
        loadingMore: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  },
}));

export { useLaunchStore } from "./launchStore";

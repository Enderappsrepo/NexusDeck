import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import { api } from "@/lib/commands";
import type { ToastMessage } from "@/components/ui/toast";
import type {
  GameRunningState,
  LaunchConfig,
  LaunchOptions,
  LaunchSettings,
  LaunchValidationResult,
  PlaytimeStats,
} from "@/lib/nexus/types";

interface LaunchState {
  configs: LaunchConfig[];
  recentConfigs: LaunchConfig[];
  settings: LaunchSettings;
  runningByProfile: Record<string, GameRunningState>;
  launching: boolean;
  launchStage: string | null;
  toasts: ToastMessage[];
  playtimeByProfile: Record<string, PlaytimeStats>;
  eventsSubscribed: boolean;

  addToast: (title: string, description?: string, variant?: ToastMessage["variant"]) => void;
  dismissToast: (id: string) => void;
  loadConfigs: (profileId: string) => Promise<void>;
  loadSettings: () => Promise<void>;
  saveSettings: (settings: LaunchSettings) => Promise<void>;
  refreshRunningState: (profileId: string) => Promise<void>;
  loadPlaytime: (profileId: string) => Promise<void>;
  validateLaunch: (profileId: string, configId?: string) => Promise<LaunchValidationResult>;
  launch: (profileId: string, configId?: string, options?: LaunchOptions) => Promise<void>;
  stopGame: (profileId: string) => Promise<void>;
  subscribeEvents: () => () => void;
}

let toastCounter = 0;

export const useLaunchStore = create<LaunchState>((set, get) => ({
  configs: [],
  recentConfigs: [],
  settings: {
    always_ask_before_launch: false,
    close_app_after_launch: false,
    safe_launch_default: false,
    default_deck_args: true,
    global_launch_hotkey: null,
  },
  runningByProfile: {},
  launching: false,
  launchStage: null,
  toasts: [],
  playtimeByProfile: {},
  eventsSubscribed: false,

  addToast: (title, description, variant = "default") => {
    const id = `toast-${++toastCounter}`;
    set((s) => ({
      toasts: [...s.toasts, { id, title, description, variant }],
    }));
    setTimeout(() => get().dismissToast(id), 5000);
  },

  dismissToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  loadConfigs: async (profileId) => {
    const [configs, recent] = await Promise.all([
      api.listLaunchConfigs(profileId),
      api.getRecentLaunchConfigs(profileId, 5),
    ]);
    set({ configs, recentConfigs: recent });
  },

  loadSettings: async () => {
    const settings = await api.getLaunchSettings();
    set({ settings });
  },

  saveSettings: async (settings) => {
    await api.setLaunchSettings(settings);
    set({ settings });
  },

  refreshRunningState: async (profileId) => {
    const state = await api.getGameRunningState(profileId);
    set((s) => ({
      runningByProfile: { ...s.runningByProfile, [profileId]: state },
    }));
  },

  loadPlaytime: async (profileId) => {
    const stats = await api.getPlaytimeStats(profileId);
    set((s) => ({
      playtimeByProfile: { ...s.playtimeByProfile, [profileId]: stats },
    }));
  },

  validateLaunch: (profileId, configId) =>
    api.validateLaunch(profileId, configId),

  launch: async (profileId, configId, options) => {
    set({ launching: true, launchStage: "validating" });
    try {
      const settings = get().settings;
      const result = await api.launchGame(profileId, configId, {
        skip_validation: false,
        safe_launch: settings.safe_launch_default,
        sync_plugins: true,
        extra_args: [],
        ...options,
      });
      get().addToast("Game launched", result.message, "success");
      await get().refreshRunningState(profileId);
      await get().loadConfigs(profileId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      get().addToast("Launch failed", msg, "error");
      throw e;
    } finally {
      set({ launching: false, launchStage: null });
    }
  },

  stopGame: async (profileId) => {
    await api.stopGame(profileId, true);
    await get().refreshRunningState(profileId);
    get().addToast("Game stopped", "Fallout 4 was closed.", "default");
  },

  subscribeEvents: () => {
    if (get().eventsSubscribed) return () => {};
    set({ eventsSubscribed: true });

    const unsubs: Array<() => void> = [];

    listen<{ profile_id: string; stage: string }>("launch:progress", (e) => {
      set({ launchStage: e.payload.stage });
      const labels: Record<string, string> = {
        validating: "Validating…",
        syncing_plugins: "Syncing plugins.txt…",
        launching: "Launching…",
        launched: "Launched!",
      };
      const label = labels[e.payload.stage];
      if (label && e.payload.stage !== "launched") {
        get().addToast("Launching", label, "default");
      }
    }).then((u) => unsubs.push(u));

    listen<{ profile_id: string; message: string }>("launch:error", (e) => {
      get().addToast("Launch error", e.payload.message, "error");
    }).then((u) => unsubs.push(u));

    listen<GameRunningState>("game:started", (e) => {
      set((s) => ({
        runningByProfile: {
          ...s.runningByProfile,
          [e.payload.profile_id]: e.payload,
        },
      }));
    }).then((u) => unsubs.push(u));

    listen<GameRunningState>("game:exited", (e) => {
      set((s) => ({
        runningByProfile: {
          ...s.runningByProfile,
          [e.payload.profile_id]: { ...e.payload, running: false },
        },
      }));
      get().addToast("Game closed", "Mod status refreshed.", "default");
      get().loadPlaytime(e.payload.profile_id);
    }).then((u) => unsubs.push(u));

    return () => {
      unsubs.forEach((u) => u());
      set({ eventsSubscribed: false });
    };
  },
}));

import { create } from "zustand";
import type { DownloadSettings } from "@/lib/nexus/types";
import { api } from "@/lib/commands";
import {
  applyDeckAttribute,
  applyPerfAttribute,
  detectSteamDeck,
  resolvePerfActive,
  type NavMode,
  type PerformanceMode,
} from "@/lib/platform";
import { loadThemeId, saveTheme, type ThemeId } from "@/lib/themes";

const SIDEBAR_COLLAPSED_KEY = "nexusdeck_sidebar_collapsed";
const GYRO_SCROLL_KEY = "nexusdeck_gyro_scroll";
const PERF_MODE_KEY = "nexusdeck_perf_mode";
const NAV_MODE_KEY = "nexusdeck_nav_mode";
const LEGACY_BATTERY_KEY = "nexusdeck_battery_mode";

function loadPerformanceMode(): PerformanceMode {
  const v = localStorage.getItem(PERF_MODE_KEY);
  if (v === "auto" || v === "on" || v === "off") return v;
  // Migrate the old battery-mode boolean: "on" is the closest intent.
  if (localStorage.getItem(LEGACY_BATTERY_KEY) === "true") return "on";
  return "auto";
}

function loadNavMode(): NavMode {
  const v = localStorage.getItem(NAV_MODE_KEY);
  if (v === "auto" || v === "bottom" || v === "sidebar") return v;
  return "auto";
}

interface SettingsState {
  downloadSettings: DownloadSettings;
  performanceMode: PerformanceMode;
  navMode: NavMode;
  deckDetected: boolean;
  perfActive: boolean;
  sidebarCollapsed: boolean;
  gyroScroll: boolean;
  theme: ThemeId;
  loading: boolean;
  loadSettings: () => Promise<void>;
  setDownloadSettings: (settings: DownloadSettings) => Promise<void>;
  setTheme: (theme: ThemeId) => void;
  setPerformanceMode: (mode: PerformanceMode) => void;
  setNavMode: (mode: NavMode) => void;
  setGyroScroll: (enabled: boolean) => void;
  toggleSidebar: () => void;
}

// Resolve device + perf defaults once at module load so the correct visual
// profile is applied before React's first paint (no flash of the heavy theme).
const deckDetected = detectSteamDeck();
const initialPerfMode = loadPerformanceMode();
const initialPerfActive = resolvePerfActive(initialPerfMode, deckDetected);
applyDeckAttribute(deckDetected);
applyPerfAttribute(initialPerfActive);

export const useSettingsStore = create<SettingsState>((set, get) => ({
  downloadSettings: { max_concurrent: 2, speed_limit_kbps: 0, auto_install_after_download: false },
  performanceMode: initialPerfMode,
  navMode: loadNavMode(),
  deckDetected,
  perfActive: initialPerfActive,
  sidebarCollapsed: localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true",
  gyroScroll: localStorage.getItem(GYRO_SCROLL_KEY) === "true",
  theme: loadThemeId(),
  loading: false,

  loadSettings: async () => {
    if (get().loading) return;
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

  setPerformanceMode: (mode) => {
    localStorage.setItem(PERF_MODE_KEY, mode);
    const perfActive = resolvePerfActive(mode, get().deckDetected);
    applyPerfAttribute(perfActive);
    set({ performanceMode: mode, perfActive });
  },

  setNavMode: (mode) => {
    localStorage.setItem(NAV_MODE_KEY, mode);
    set({ navMode: mode });
  },

  setGyroScroll: (enabled) => {
    localStorage.setItem(GYRO_SCROLL_KEY, String(enabled));
    set({ gyroScroll: enabled });
  },

  setTheme: (theme) => {
    saveTheme(theme);
    set({ theme });
  },

  toggleSidebar: () =>
    set((s) => {
      const next = !s.sidebarCollapsed;
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
      return { sidebarCollapsed: next };
    }),
}));

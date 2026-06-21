import { create } from "zustand";
import type { DownloadSettings } from "@/lib/nexus/types";
import { api } from "@/lib/commands";

const BATTERY_MODE_KEY = "nexusdeck_battery_mode";
const SIDEBAR_COLLAPSED_KEY = "nexusdeck_sidebar_collapsed";

interface SettingsState {
  downloadSettings: DownloadSettings;
  batteryMode: boolean;
  sidebarCollapsed: boolean;
  gyroScroll: boolean;
  loading: boolean;
  loadSettings: () => Promise<void>;
  setDownloadSettings: (settings: DownloadSettings) => Promise<void>;
  setBatteryMode: (enabled: boolean) => void;
  setGyroScroll: (enabled: boolean) => void;
  toggleSidebar: () => void;
}

const GYRO_SCROLL_KEY = "nexusdeck_gyro_scroll";

export const useSettingsStore = create<SettingsState>((set) => ({
  downloadSettings: { max_concurrent: 2, speed_limit_kbps: 0, auto_install_after_download: false },
  batteryMode: localStorage.getItem(BATTERY_MODE_KEY) === "true",
  sidebarCollapsed: localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true",
  gyroScroll: localStorage.getItem(GYRO_SCROLL_KEY) === "true",
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

  setGyroScroll: (enabled) => {
    localStorage.setItem(GYRO_SCROLL_KEY, String(enabled));
    set({ gyroScroll: enabled });
  },

  toggleSidebar: () =>
    set((s) => {
      const next = !s.sidebarCollapsed;
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
      return { sidebarCollapsed: next };
    }),
}));

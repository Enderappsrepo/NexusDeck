import { create } from "zustand";
import type { DownloadSettings } from "@/lib/nexus/types";
import { api } from "@/lib/commands";

const BATTERY_MODE_KEY = "nexusdeck_battery_mode";

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

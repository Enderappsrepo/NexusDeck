import { create } from "zustand";
import { loadLastGame, saveLastGame } from "../lib/preferences";
import { loadThemeId, saveTheme, type ThemeId } from "../lib/themes";

const HAPTICS_KEY = "nexusdeck_companion_haptics";
const NOTIFICATIONS_KEY = "nexusdeck_companion_notifications";
const COMPACT_KEY = "nexusdeck_companion_compact";
const AUTO_RECONNECT_KEY = "nexusdeck_companion_auto_reconnect";

export type NotificationPref = "install_complete" | "download_progress" | "none";

function loadBool(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    if (v === "true") return true;
    if (v === "false") return false;
  } catch {
    /* ignore */
  }
  return fallback;
}

function loadNotifications(): NotificationPref {
  try {
    const v = localStorage.getItem(NOTIFICATIONS_KEY);
    if (v === "install_complete" || v === "download_progress" || v === "none") return v;
  } catch {
    /* ignore */
  }
  return "install_complete";
}

interface CompanionSettingsState {
  theme: ThemeId;
  haptics: boolean;
  defaultGameDomain: string;
  notifications: NotificationPref;
  compactUi: boolean;
  autoReconnect: boolean;
  setTheme: (theme: ThemeId) => void;
  setHaptics: (enabled: boolean) => void;
  setDefaultGameDomain: (domain: string) => void;
  setNotifications: (pref: NotificationPref) => void;
  setCompactUi: (enabled: boolean) => void;
  setAutoReconnect: (enabled: boolean) => void;
}

export const useCompanionSettings = create<CompanionSettingsState>((set) => ({
  theme: loadThemeId(),
  haptics: loadBool(HAPTICS_KEY, true),
  defaultGameDomain: loadLastGame(),
  notifications: loadNotifications(),
  compactUi: loadBool(COMPACT_KEY, false),
  autoReconnect: loadBool(AUTO_RECONNECT_KEY, true),

  setTheme: (theme) => {
    saveTheme(theme);
    set({ theme });
  },
  setHaptics: (haptics) => {
    localStorage.setItem(HAPTICS_KEY, String(haptics));
    set({ haptics });
  },
  setDefaultGameDomain: (domain) => {
    saveLastGame(domain);
    set({ defaultGameDomain: domain });
  },
  setNotifications: (notifications) => {
    localStorage.setItem(NOTIFICATIONS_KEY, notifications);
    set({ notifications });
  },
  setCompactUi: (compactUi) => {
    localStorage.setItem(COMPACT_KEY, String(compactUi));
    set({ compactUi });
  },
  setAutoReconnect: (autoReconnect) => {
    localStorage.setItem(AUTO_RECONNECT_KEY, String(autoReconnect));
    set({ autoReconnect });
  },
}));

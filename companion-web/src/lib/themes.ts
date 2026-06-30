export type ThemeId =
  | "nexusdeck"
  | "midnight"
  | "ember"
  | "creation"
  | "light"
  | "high-contrast";

export interface ThemePreset {
  id: ThemeId;
  label: string;
  description: string;
  themeColor: string;
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: "nexusdeck",
    label: "NexusDeck",
    description: "Orange dark — default handheld look",
    themeColor: "#0a0b10",
  },
  {
    id: "midnight",
    label: "Midnight",
    description: "Cool blue accents on dark surfaces",
    themeColor: "#080b14",
  },
  {
    id: "ember",
    label: "Ember",
    description: "Warm red accent theme",
    themeColor: "#100808",
  },
  {
    id: "creation",
    label: "Creation",
    description: "Legacy gold accent",
    themeColor: "#0c0a08",
  },
  {
    id: "light",
    label: "Light",
    description: "Light surfaces with orange primary",
    themeColor: "#f2f3f8",
  },
  {
    id: "high-contrast",
    label: "High contrast",
    description: "Accessibility preset",
    themeColor: "#000000",
  },
];

const STORAGE_KEY = "nexusdeck_companion_theme";

export function loadThemeId(): ThemeId {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (THEME_PRESETS.some((t) => t.id === v)) return v as ThemeId;
  } catch {
    /* ignore */
  }
  return "nexusdeck";
}

export function applyTheme(themeId: ThemeId) {
  document.documentElement.setAttribute("data-theme", themeId);
  const preset = THEME_PRESETS.find((t) => t.id === themeId);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta && preset) meta.setAttribute("content", preset.themeColor);
}

export function saveTheme(themeId: ThemeId) {
  try {
    localStorage.setItem(STORAGE_KEY, themeId);
  } catch {
    /* ignore */
  }
  applyTheme(themeId);
}

applyTheme(loadThemeId());

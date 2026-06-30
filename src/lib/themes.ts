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
}

export const THEME_PRESETS: ThemePreset[] = [
  { id: "nexusdeck", label: "NexusDeck", description: "Orange dark — default" },
  { id: "midnight", label: "Midnight", description: "Cool blue accents" },
  { id: "ember", label: "Ember", description: "Warm red accent" },
  { id: "creation", label: "Creation", description: "Legacy gold accent" },
  { id: "light", label: "Light", description: "Light surfaces" },
  { id: "high-contrast", label: "High contrast", description: "Accessibility preset" },
];

const STORAGE_KEY = "nexusdeck_theme";

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

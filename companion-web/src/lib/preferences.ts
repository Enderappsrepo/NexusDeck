const GAME_KEY = "nexusdeck_companion_last_game";

export function loadLastGame(): string {
  try {
    return localStorage.getItem(GAME_KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveLastGame(domain: string) {
  try {
    if (domain.trim()) localStorage.setItem(GAME_KEY, domain.trim());
  } catch {
    /* ignore */
  }
}

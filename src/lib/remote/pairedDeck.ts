export const PAIRED_DECK_KEY = "nexusdeck_paired_deck";

export interface PairedDeck {
  name: string;
  host: string;
  port: number;
  token: string;
}

export function loadPairedDeck(): PairedDeck | null {
  try {
    const raw = localStorage.getItem(PAIRED_DECK_KEY);
    return raw ? (JSON.parse(raw) as PairedDeck) : null;
  } catch {
    return null;
  }
}

export function savePairedDeck(deck: PairedDeck): void {
  localStorage.setItem(PAIRED_DECK_KEY, JSON.stringify(deck));
}

export function clearPairedDeck(): void {
  localStorage.removeItem(PAIRED_DECK_KEY);
}

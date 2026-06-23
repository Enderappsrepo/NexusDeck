import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

export function formatDate(timestamp: number): string {
  if (!timestamp) return "Unknown";
  return new Date(timestamp * 1000).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatRelativeDate(timestamp: number): string {
  if (!timestamp) return "";
  const diff = Date.now() - timestamp * 1000;
  const days = Math.floor(diff / 86_400_000);
  if (days < 1) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

/** Resolve when `promise` settles or `ms` elapses (whichever comes first). */
export function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => {
      window.setTimeout(() => resolve(fallback), ms);
    }),
  ]);
}

export const GAME_GRADIENTS: Record<string, string> = {
  fallout4:
    "from-amber-800/70 via-orange-950/50 to-[var(--color-background)]",
  skyrim:
    "from-sky-900/70 via-indigo-950/50 to-[var(--color-background)]",
  skyrimspecialedition:
    "from-sky-900/70 via-indigo-950/50 to-[var(--color-background)]",
  falloutnv:
    "from-yellow-900/60 via-stone-950/50 to-[var(--color-background)]",
  fallout3:
    "from-green-900/60 via-stone-950/50 to-[var(--color-background)]",
  starfield:
    "from-violet-900/70 via-slate-950/50 to-[var(--color-background)]",
  oblivion:
    "from-emerald-900/60 via-stone-950/50 to-[var(--color-background)]",
  default: "from-[#1a3a5c]/80 via-[#12121a] to-[var(--color-background)]",
};

export function gameGradient(domain: string): string {
  return GAME_GRADIENTS[domain] ?? GAME_GRADIENTS.default;
}

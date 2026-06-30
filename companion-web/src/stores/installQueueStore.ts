import { create } from "zustand";

const STORAGE_KEY = "nexusdeck_companion_install_queue";

export type CompanionQueueItemStatus = "queued" | "active" | "done" | "failed";

export interface CompanionInstallQueueItem {
  id: string;
  gameDomain: string;
  modId: number;
  modName: string;
  fileId: number;
  fileName: string;
  expectedSizeKb: number;
  fileVersion: string | null;
  status: CompanionQueueItemStatus;
  error?: string;
  source?: "manual" | "collection";
  collectionSlug?: string;
  collectionName?: string;
}

interface InstallQueueState {
  items: CompanionInstallQueueItem[];
  processing: boolean;
  activeItemId: string | null;

  enqueue: (item: Omit<CompanionInstallQueueItem, "id" | "status">) => boolean;
  enqueueMany: (items: Array<Omit<CompanionInstallQueueItem, "id" | "status">>) => number;
  remove: (id: string) => void;
  clearDone: () => void;
  clearFailed: () => void;
  startProcessing: () => CompanionInstallQueueItem | null;
  activateNext: () => CompanionInstallQueueItem | null;
  completeActive: () => void;
  failActive: (error: string) => void;
  cancelActive: () => void;
  badgeCount: () => number;
  pendingCount: () => number;
}

function loadItems(): CompanionInstallQueueItem[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CompanionInstallQueueItem[];
    return Array.isArray(parsed)
      ? parsed.map((i) => ({
          ...i,
          status: i.status === "active" ? "queued" : i.status,
        }))
      : [];
  } catch {
    return [];
  }
}

function persistItems(items: CompanionInstallQueueItem[]) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    /* ignore */
  }
}

function queueKey(item: { gameDomain: string; modId: number; fileId: number }) {
  return `${item.gameDomain}:${item.modId}:${item.fileId}`;
}

/** crypto.randomUUID() is unavailable over plain HTTP (device IP), so fall back. */
function newQueueItemId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    try {
      return crypto.randomUUID();
    } catch {
      /* fall through */
    }
  }
  return `q-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export const useInstallQueueStore = create<InstallQueueState>((set, get) => ({
  items: loadItems(),
  processing: false,
  activeItemId: null,

  enqueue: (item) => {
    const key = queueKey(item);
    if (get().items.some((i) => queueKey(i) === key && i.status !== "done" && i.status !== "failed")) {
      return false;
    }
    const next: CompanionInstallQueueItem = {
      ...item,
      id: newQueueItemId(),
      status: "queued",
    };
    set((s) => {
      const items = [...s.items, next];
      persistItems(items);
      return { items };
    });
    return true;
  },

  enqueueMany: (items) => {
    let added = 0;
    for (const item of items) {
      if (get().enqueue(item)) added += 1;
    }
    return added;
  },

  remove: (id) => {
    set((s) => {
      const items = s.items.filter((i) => i.id !== id);
      persistItems(items);
      return {
        items,
        activeItemId: s.activeItemId === id ? null : s.activeItemId,
      };
    });
  },

  clearDone: () => {
    set((s) => {
      const items = s.items.filter((i) => i.status !== "done");
      persistItems(items);
      return { items };
    });
  },

  clearFailed: () => {
    set((s) => {
      const items = s.items.filter((i) => i.status !== "failed");
      persistItems(items);
      return { items };
    });
  },

  startProcessing: () => {
    set({ processing: true });
    return get().activateNext();
  },

  activateNext: () => {
    const { items, activeItemId, processing } = get();
    if (!processing || activeItemId) return null;
    const next = items.find((i) => i.status === "queued");
    if (!next) {
      set({ processing: false });
      return null;
    }
    const updated = items.map((i) => (i.id === next.id ? { ...i, status: "active" as const } : i));
    persistItems(updated);
    set({ items: updated, activeItemId: next.id });
    return { ...next, status: "active" as const };
  },

  completeActive: () => {
    const { activeItemId, items } = get();
    if (!activeItemId) return;
    const updated = items.map((i) =>
      i.id === activeItemId ? { ...i, status: "done" as const, error: undefined } : i
    );
    persistItems(updated);
    set({ items: updated, activeItemId: null });
  },

  failActive: (error) => {
    const { activeItemId, items } = get();
    if (!activeItemId) return;
    const updated = items.map((i) =>
      i.id === activeItemId ? { ...i, status: "failed" as const, error } : i
    );
    persistItems(updated);
    set({ items: updated, activeItemId: null });
    get().activateNext();
  },

  cancelActive: () => {
    const { activeItemId, items } = get();
    if (!activeItemId) return;
    const updated = items.filter((i) => i.id !== activeItemId);
    persistItems(updated);
    set({ items: updated, activeItemId: null, processing: false });
  },

  badgeCount: () => {
    const { items } = get();
    return items.filter((i) => i.status === "queued" || i.status === "failed" || i.status === "active").length;
  },

  pendingCount: () => get().items.filter((i) => i.status === "queued").length,
}));

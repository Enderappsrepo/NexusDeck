import { useEffect } from "react";
import { create } from "zustand";
import { api } from "@/lib/commands";
import type { CompanionInstallSummary } from "@/lib/nexus/types";

import type { CompanionInstallSummary } from "@/lib/nexus/types";

function sameInstallSummary(
  a: CompanionInstallSummary | null,
  b: CompanionInstallSummary | null
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.mod_name === b.mod_name &&
    a.status === b.status &&
    a.message === b.message &&
    a.progress_pct === b.progress_pct
  );
}

interface CompanionState {
  /** A paired companion (phone) is actively connected to this device. */
  connected: boolean;
  host: string | null;
  /** What the companion is installing right now, if anything. */
  activeInstall: CompanionInstallSummary | null;
  /** User dismissed the connected overlay (kept as a reopenable indicator). */
  dismissed: boolean;
  setPresence: (next: {
    connected: boolean;
    host: string | null;
    activeInstall: CompanionInstallSummary | null;
  }) => void;
  dismiss: () => void;
  reopen: () => void;
}

export const useCompanionStore = create<CompanionState>((set, get) => ({
  connected: false,
  host: null,
  activeInstall: null,
  dismissed: false,
  setPresence: ({ connected, host, activeInstall }) => {
    const wasConnected = get().connected;
    const prev = get();
    const nextDismissed = connected && !wasConnected ? false : prev.dismissed;
    if (
      prev.connected === connected &&
      prev.host === host &&
      sameInstallSummary(prev.activeInstall, activeInstall) &&
      prev.dismissed === nextDismissed
    ) {
      return;
    }
    set({
      connected,
      host,
      activeInstall,
      dismissed: nextDismissed,
    });
  },
  dismiss: () => set({ dismissed: true }),
  reopen: () => set({ dismissed: false }),
}));

/** Poll the receiver so the app knows when a companion is actively connected. */
export function useCompanionPresencePoll() {
  const setPresence = useCompanionStore((s) => s.setPresence);
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const status = await api.getRemoteReceiverStatus();
        if (cancelled) return;
        setPresence({
          connected: !!status.companion_connected,
          host: status.companion_host ?? null,
          activeInstall: status.active_install ?? null,
        });
      } catch {
        if (!cancelled) {
          setPresence({ connected: false, host: null, activeInstall: null });
        }
      }
    };
    void poll();
    const id = window.setInterval(() => void poll(), 5000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [setPresence]);
}

/** Selector for install gating: true while a companion owns installation. */
export const useCompanionConnected = () => useCompanionStore((s) => s.connected);

const ACTIVE_COMPANION_INSTALL = new Set([
  "downloading",
  "extracting",
  "installing",
  "ready",
]);

/** True when the phone companion is driving this download's install flow. */
export function isCompanionManagedDownload(
  download: { companion_managed?: boolean; mod_name?: string },
  activeInstall: CompanionInstallSummary | null
): boolean {
  if (download.companion_managed) return true;
  if (!activeInstall || !ACTIVE_COMPANION_INSTALL.has(activeInstall.status)) {
    return false;
  }
  const modName = download.mod_name?.trim();
  if (!modName) return false;
  return activeInstall.mod_name.trim() === modName;
}

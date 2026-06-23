import { useCallback, useEffect, useRef } from "react";
import { api } from "@/lib/commands";

/**
 * Keeps the Steam Deck screen awake during long operations (Proton deps install, etc.).
 * Uses the browser Wake Lock API when available, plus a host systemd-inhibit fallback.
 */
export function useWakeLock(active: boolean, reason = "NexusDeck operation in progress") {
  const lockRef = useRef<WakeLockSentinel | null>(null);

  const release = useCallback(async () => {
    if (lockRef.current) {
      try {
        await lockRef.current.release();
      } catch {
        /* ignore */
      }
      lockRef.current = null;
    }
    try {
      await api.releaseWakeLock();
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!active) {
      void release();
      return;
    }

    let cancelled = false;

    const acquire = async () => {
      try {
        await api.acquireWakeLock(reason);
      } catch {
        /* host inhibit may be unavailable on Windows */
      }

      if (cancelled) return;

      if ("wakeLock" in navigator) {
        try {
          lockRef.current = await navigator.wakeLock.request("screen");
        } catch {
          /* permission or unsupported */
        }
      }
    };

    void acquire();

    const onVisible = () => {
      if (document.visibilityState === "visible" && active && !lockRef.current) {
        void acquire();
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      void release();
    };
  }, [active, reason, release]);
}

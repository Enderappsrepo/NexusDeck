import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { api } from "@/lib/commands";
import { gamepadRouter } from "@/hooks/useGamepadRouter";
import { useLaunchStore } from "@/stores/launchStore";
import { useGamesStore } from "@/stores";

function isWebViewCorrupt(): boolean {
  const root = document.getElementById("root");
  if (!root) return true;
  const rect = root.getBoundingClientRect();
  if (rect.width < 8 || rect.height < 8) return true;
  if (document.documentElement.dataset.webviewCorrupt === "true") return true;
  return false;
}

/**
 * Handles system suspend/resume from the Rust logind monitor.
 * Reloads the WebView when the GPU context appears lost after sleep.
 */
export function usePowerLifecycle() {
  const refreshAllRunningStates = useLaunchStore((s) => s.refreshAllRunningStates);
  const profiles = useGamesStore((s) => s.profiles);
  const recoveringRef = useRef(false);

  useEffect(() => {
    const unsubs: Array<() => void> = [];

    listen("power:suspend", () => {
      gamepadRouter.pause();
    }).then((u) => unsubs.push(u));

    listen("power:resume", async () => {
      if (recoveringRef.current) return;
      recoveringRef.current = true;
      try {
        gamepadRouter.stop();
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        if (isWebViewCorrupt()) {
          document.documentElement.dataset.webviewCorrupt = "true";
          await api.reloadWebView();
        } else {
          await api.claimGamescopeFocus().catch(() => {});
        }
        gamepadRouter.start();
        const ids = profiles.map((p) => p.id);
        if (ids.length > 0) {
          await refreshAllRunningStates(ids);
        }
      } finally {
        recoveringRef.current = false;
        delete document.documentElement.dataset.webviewCorrupt;
      }
    }).then((u) => unsubs.push(u));

    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (isWebViewCorrupt()) {
        document.documentElement.dataset.webviewCorrupt = "true";
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      unsubs.forEach((u) => u());
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [profiles, refreshAllRunningStates]);
}

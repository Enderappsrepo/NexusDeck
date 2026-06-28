/**
 * Local design-preview entry (NOT shipped). Fakes a Steam Deck environment so
 * detectSteamDeck() is true, installs the permissive Tauri mock, then boots the
 * real app — giving us the *actual* Deck UI (compact nav, perf profile, deck
 * layout branches) at 1280×800 in a browser.
 *
 * Order matters: static `import` declarations are hoisted and run first, but the
 * app (and its settingsStore, which calls detectSteamDeck() at module load) is
 * pulled in via the dynamic import below — so the environment shims in this
 * top-level body execute before detection runs.
 */
import "./tw.css";
import { installPreviewMock } from "./mock";

// Make lib/platform.ts::detectSteamDeck() resolve true: Linux UA + 1280×800.
try {
  Object.defineProperty(navigator, "userAgent", {
    configurable: true,
    get: () => "Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0",
  });
  Object.defineProperty(window.screen, "width", { configurable: true, get: () => 1280 });
  Object.defineProperty(window.screen, "height", { configurable: true, get: () => 800 });
} catch {
  // Some props may be non-configurable; the setState fallback below covers it.
}

installPreviewMock();

// Default to a real Deck's resolved settings (auto → bottom nav + perf on).
const params = new URLSearchParams(location.search);
localStorage.setItem("nexusdeck_nav_mode", params.get("nav") ?? "auto");
localStorage.setItem("nexusdeck_perf_mode", params.get("perf") ?? "auto");

import("@/main").then(async () => {
  // Belt-and-suspenders: if the UA/screen shims didn't take, force the store's
  // device flags so deck-only layout branches (compactBrowse, etc.) still fire.
  try {
    const { useSettingsStore } = await import("@/stores/settingsStore");
    if (!useSettingsStore.getState().deckDetected) {
      useSettingsStore.setState({ deckDetected: true, perfActive: params.get("perf") !== "off" });
    }
  } catch {
    // ignore
  }
  if (params.get("controller") === "1") {
    document.documentElement.setAttribute("data-controller", "true");
  }
  // Expose focus helpers so the harness can simulate D-pad navigation for tests.
  const nav = await import("@/lib/gamepad/focusNavigation");
  const fomod = await import("@/components/mod/FomodInstallWizard");
  (window as unknown as Record<string, unknown>).__nd = {
    moveFocus: nav.moveFocus,
    focusFirst: nav.focusFirst,
    filterVisibleWizardSteps: fomod.filterVisibleWizardSteps,
  };

  // Expose a trigger so the harness can render the mod install dialog on demand.
  const [{ useInstallQueueStore }, { useGamesStore }] = await Promise.all([
    import("@/stores/installQueueStore"),
    import("@/stores/gamesStore"),
  ]);
  (window as unknown as Record<string, unknown>).__triggerInstall = () => {
    const profile = useGamesStore.getState().profiles[0];
    useInstallQueueStore.setState({
      jobs: [
        {
          id: "job-1",
          downloadId: "dl-1",
          profile,
          modId: 2,
          modName: "Sim Settlements 2",
          file: {
            file_id: 1,
            name: "Sim Settlements 2",
            file_name: "SS2.7z",
            version: "2.0",
            category_name: "Main",
            is_primary: true,
            size_kb: 100000,
          },
          archivePath: "/home/deck/staging/ss2.7z",
          source: "manual",
          status: "active",
        },
      ],
      activeJobId: "job-1",
    });
  };
});

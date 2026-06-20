import { createRootRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import { AppShell } from "@/components/layout/AppShell";
import { DownloadQueuePanel } from "@/components/download/DownloadQueuePanel";
import { InstallPromptDialog } from "@/components/install/InstallPromptDialog";
import { ModInstallDialog } from "@/components/mod/ModInstallDialog";
import { useAuthStore, useDownloadsStore, useGamesStore } from "@/stores";
import { ControllerHintBar } from "@/components/controller/ControllerHintBar";
import { CommandPalette } from "@/components/controller/CommandPalette";
import { useFocusNavigation } from "@/hooks/useFocusNavigation";
import { useGamepadBack } from "@/hooks/useGamepadBack";
import { GamepadRouterProvider } from "@/hooks/useGamepadRouter";
import { resolveContextFromPath } from "@/lib/gamepad/contexts";
import { gamepadRouter } from "@/lib/gamepad/GamepadRouter";
import { useLaunchStore } from "@/stores/launchStore";
import { api } from "@/lib/commands";
import { ensureGamepadPolyfill } from "@/lib/gamepadPolyfill";
import type { DownloadProgress, ModFileInfo, Profile } from "@/lib/nexus/types";

function markBootReady() {
  window.__nexusdeckBootReady?.();
}

function BootReadyMarker() {
  useEffect(() => {
    markBootReady();
    void api.logStartupEvent("router_rendered");
  }, []);
  return null;
}

export const Route = createRootRoute({
  component: RootLayout,
});

function resolveProfile(
  profiles: Profile[],
  download: DownloadProgress
): Profile | undefined {
  if (download.profile_id) {
    return profiles.find((p) => p.id === download.profile_id);
  }
  return profiles.find((p) => p.game_domain === download.game_domain);
}

function RootLayout() {
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isOnboarding = pathname === "/onboarding";
  const initialize = useAuthStore((s) => s.initialize);
  const profiles = useGamesStore((s) => s.profiles);
  const loadProfiles = useGamesStore((s) => s.loadProfiles);
  const setProgress = useDownloadsStore((s) => s.setProgress);
  const active = useDownloadsStore((s) => s.active);
  const setError = useDownloadsStore((s) => s.setError);
  const hydrateFromRecords = useDownloadsStore((s) => s.hydrateFromRecords);
  const subscribeLaunchEvents = useLaunchStore((s) => s.subscribeEvents);
  const loadLaunchSettings = useLaunchStore((s) => s.loadSettings);
  const launchFromStore = useLaunchStore((s) => s.launch);

  const [installPrompt, setInstallPrompt] = useState<DownloadProgress | null>(null);
  const [pendingInstall, setPendingInstall] = useState<{
    profile: Profile;
    modId: number;
    modName: string;
    file: ModFileInfo;
    archivePath: string;
  } | null>(null);

  const handleInstallNowFromDownload = useCallback(async (download: DownloadProgress) => {
    const prof = resolveProfile(profiles, download);
    if (!prof) return;
    try {
      const files = await api.getModFiles(download.game_domain, download.mod_id);
      const file = files.find((f) => f.file_id === download.file_id) ?? files[0];
      if (!file) return;
      setPendingInstall({
        profile: prof,
        modId: download.mod_id,
        modName: download.mod_name || file.name,
        file,
        archivePath: download.dest_path,
      });
    } catch {
      setInstallPrompt(download);
    }
  }, [profiles]);

  useFocusNavigation(containerRef);
  useGamepadBack();

  useEffect(() => {
    gamepadRouter.setContext(resolveContextFromPath(pathname));
  }, [pathname]);

  useEffect(() => {
    void ensureGamepadPolyfill();
    initialize();
    loadProfiles();
    loadLaunchSettings();
    api.listDownloads().then(hydrateFromRecords);
    const unsubLaunch = subscribeLaunchEvents();
    api
      .isOnboardingComplete()
      .then((done) => {
        if (!done && pathname !== "/onboarding") {
          navigate({ to: "/onboarding" });
        }
      })
      .catch(() => {
        if (pathname !== "/onboarding") {
          navigate({ to: "/onboarding" });
        }
      });
    return () => unsubLaunch();
  }, [
    initialize,
    loadProfiles,
    hydrateFromRecords,
    subscribeLaunchEvents,
    loadLaunchSettings,
    navigate,
    pathname,
  ]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "l") {
        e.preventDefault();
        const profile = profiles[0];
        if (profile) {
          launchFromStore(profile.id).catch(() => {});
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [profiles, launchFromStore]);

  useEffect(() => {
    const unsubs: Array<() => void> = [];
    listen<DownloadProgress>("download-progress", (e) => setProgress(e.payload)).then(
      (u) => unsubs.push(u)
    );
    listen<DownloadProgress>("download-complete", (e) => {
      setProgress(e.payload);
      const download = e.payload;
      if (download.update_target_mod_id) {
        void api.completeModUpdate(download.id).catch((err) => {
          setError(download.id, err instanceof Error ? err.message : String(err));
        });
        return;
      }
      const autoInstall = useDownloadsStore.getState().consumeAutoInstall(e.payload.id);
      if (autoInstall) {
        void handleInstallNowFromDownload(e.payload);
      } else {
        setInstallPrompt(e.payload);
      }
    }).then((u) => unsubs.push(u));
    listen<{ id: string; error: string }>("download-error", (e) => {
      setError(e.payload.id, e.payload.error);
    }).then((u) => unsubs.push(u));
    listen<string>("nxm-url", (e) => {
      api.handleNxmUrl(e.payload).then((data) => {
        const d = data as { game_domain: string; mod_id: number };
        navigate({
          to: "/games/$domain/mods/$modId",
          params: { domain: d.game_domain, modId: String(d.mod_id) },
        });
      });
    }).then((u) => unsubs.push(u));
    return () => unsubs.forEach((u) => u());
  }, [setProgress, setError, navigate, handleInstallNowFromDownload]);

  useEffect(() => {
    const onInstall = (e: Event) => {
      const { downloadId } = (e as CustomEvent).detail as { downloadId: string };
      const download = active[downloadId];
      if (download?.status === "complete") {
        void handleInstallNowFromDownload(download);
      }
    };
    window.addEventListener("nexusdeck-install-download", onInstall);
    return () => window.removeEventListener("nexusdeck-install-download", onInstall);
  }, [active, handleInstallNowFromDownload]);

  const promptProfile = installPrompt
    ? resolveProfile(profiles, installPrompt)
    : undefined;

  const handleInstallNow = async () => {
    if (!installPrompt || !promptProfile) return;
    await handleInstallNowFromDownload(installPrompt);
    setInstallPrompt(null);
  };

  return (
    <GamepadRouterProvider>
      <div ref={containerRef} className="flex h-full min-h-screen flex-col">
        <BootReadyMarker />
        <AppShell hideNav={isOnboarding}>
          <Outlet />
        </AppShell>
        {!isOnboarding && <DownloadQueuePanel />}
        {!isOnboarding && <ControllerHintBar />}
        <CommandPalette />

      {!isOnboarding && (
        <InstallPromptDialog
          open={!!installPrompt}
          onOpenChange={(open) => !open && setInstallPrompt(null)}
          download={installPrompt}
          profile={promptProfile ?? null}
          onInstall={handleInstallNow}
          onDismiss={() => setInstallPrompt(null)}
        />
      )}

      {!isOnboarding && pendingInstall && (
        <ModInstallDialog
          open
          onOpenChange={(open) => !open && setPendingInstall(null)}
          profile={pendingInstall.profile}
          modId={pendingInstall.modId}
          modName={pendingInstall.modName}
          file={pendingInstall.file}
          archivePathOverride={pendingInstall.archivePath}
          onInstalled={() => setPendingInstall(null)}
        />
      )}
      </div>
    </GamepadRouterProvider>
  );
}

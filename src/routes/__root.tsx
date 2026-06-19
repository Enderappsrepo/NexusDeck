import { createRootRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { AppShell } from "@/components/layout/AppShell";
import { DownloadQueuePanel } from "@/components/download/DownloadQueuePanel";
import { InstallPromptDialog } from "@/components/install/InstallPromptDialog";
import { ModInstallDialog } from "@/components/mod/ModInstallDialog";
import { useAuthStore, useDownloadsStore, useGamesStore } from "@/stores";
import { useFocusNavigation } from "@/hooks/useFocusNavigation";
import { useGamepadBack } from "@/hooks/useGamepadBack";
import { useLaunchStore } from "@/stores/launchStore";
import { api } from "@/lib/commands";
import type { DownloadProgress, ModFileInfo, Profile } from "@/lib/nexus/types";

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
  const initialize = useAuthStore((s) => s.initialize);
  const profiles = useGamesStore((s) => s.profiles);
  const loadProfiles = useGamesStore((s) => s.loadProfiles);
  const setProgress = useDownloadsStore((s) => s.setProgress);
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

  useFocusNavigation(containerRef);
  useGamepadBack();

  useEffect(() => {
    initialize();
    loadProfiles();
    loadLaunchSettings();
    api.listDownloads().then(hydrateFromRecords);
    const unsubLaunch = subscribeLaunchEvents();
    api.isOnboardingComplete().then((done) => {
      if (!done) navigate({ to: "/onboarding" });
    });
    return () => unsubLaunch();
  }, [initialize, loadProfiles, hydrateFromRecords, navigate, subscribeLaunchEvents, loadLaunchSettings]);

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
      setInstallPrompt(e.payload);
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
  }, [setProgress, setError, navigate]);

  const promptProfile = installPrompt
    ? resolveProfile(profiles, installPrompt)
    : undefined;

  const handleInstallNow = async () => {
    if (!installPrompt || !promptProfile) return;
    try {
      const files = await api.getModFiles(
        installPrompt.game_domain,
        installPrompt.mod_id
      );
      const file =
        files.find((f) => f.file_id === installPrompt.file_id) ?? files[0];
      if (!file) return;
      setPendingInstall({
        profile: promptProfile,
        modId: installPrompt.mod_id,
        modName: installPrompt.mod_name || file.name,
        file,
        archivePath: installPrompt.dest_path,
      });
      setInstallPrompt(null);
    } catch {
      setInstallPrompt(null);
    }
  };

  return (
    <div ref={containerRef} className="h-full">
      <AppShell>
        <Outlet />
      </AppShell>
      <DownloadQueuePanel />

      <InstallPromptDialog
        open={!!installPrompt}
        onOpenChange={(open) => !open && setInstallPrompt(null)}
        download={installPrompt}
        profile={promptProfile ?? null}
        onInstall={handleInstallNow}
        onDismiss={() => setInstallPrompt(null)}
      />

      {pendingInstall && (
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
  );
}

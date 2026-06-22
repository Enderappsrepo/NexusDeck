import { createRootRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useCallback, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { AppShell } from "@/components/layout/AppShell";
import { DownloadQueuePanel } from "@/components/download/DownloadQueuePanel";
import { InstallPromptDialog } from "@/components/install/InstallPromptDialog";
import { InstallQueuePanel } from "@/components/install/InstallQueuePanel";
import { CollectionInstallProgressPanel } from "@/components/collections/CollectionInstallProgressPanel";
import { ModInstallDialog } from "@/components/mod/ModInstallDialog";
import { InstallSuccessDialog } from "@/components/install/InstallSuccessDialog";
import {
  useAuthStore,
  useDownloadsStore,
  useGamesStore,
  useInstallQueueStore,
  useSettingsStore,
} from "@/stores";
import { ControllerHintBar } from "@/components/controller/ControllerHintBar";
import { CommandPalette } from "@/components/controller/CommandPalette";
import { useFocusNavigation } from "@/hooks/useFocusNavigation";
import { useGamepadBack } from "@/hooks/useGamepadBack";
import { GamepadRouterProvider } from "@/hooks/useGamepadRouter";
import { resolveContextFromPath } from "@/lib/gamepad/contexts";
import { gamepadRouter } from "@/lib/gamepad/GamepadRouter";
import { useLaunchStore } from "@/stores/launchStore";
import { useCollectionInstallStore } from "@/stores/collectionInstallStore";
import { api } from "@/lib/commands";
import { ensureGamepadPolyfill } from "@/lib/gamepadPolyfill";
import { applyPerfAttribute } from "@/lib/platform";
import type { DownloadProgress, Profile, AppUpdateInfo, ModFileInfo } from "@/lib/nexus/types";
import { modFileDownloadName } from "@/lib/nexus/types";

const DISMISSED_UPDATE_KEY = "nexusdeck_dismissed_update_version";

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
  const dismiss = useDownloadsStore((s) => s.dismiss);
  const hydrateFromRecords = useDownloadsStore((s) => s.hydrateFromRecords);
  const hydrated = useDownloadsStore((s) => s.hydrated);
  const downloadSettings = useSettingsStore((s) => s.downloadSettings);
  const loadSettings = useSettingsStore((s) => s.loadSettings);
  const settingsLoading = useSettingsStore((s) => s.loading);
  const perfActive = useSettingsStore((s) => s.perfActive);
  const updatingDownloadsRef = useRef(new Set<string>());
  const bootedRef = useRef(false);
  const recoveryHandledRef = useRef(false);
  const subscribeLaunchEvents = useLaunchStore((s) => s.subscribeEvents);
  const loadLaunchSettings = useLaunchStore((s) => s.loadSettings);
  const launchFromStore = useLaunchStore((s) => s.launch);

  const installPrompt = useInstallQueueStore((s) => s.installPrompt);
  const activeJob = useInstallQueueStore((s) => s.getActiveJob());
  const showInstallPrompt = useInstallQueueStore((s) => s.showInstallPrompt);
  const dismissInstallPrompt = useInstallQueueStore((s) => s.dismissInstallPrompt);
  const enqueueFromDownload = useInstallQueueStore((s) => s.enqueueFromDownload);
  const completeActive = useInstallQueueStore((s) => s.completeActive);
  const failActive = useInstallQueueStore((s) => s.failActive);
  const cancelActive = useInstallQueueStore((s) => s.cancelActive);
  const installJobs = useInstallQueueStore((s) => s.jobs);
  const syncCollectionDownload = useCollectionInstallStore((s) => s.syncFromDownload);
  const syncCollectionInstall = useCollectionInstallStore((s) => s.syncFromInstallJob);
  const collectionActive = useCollectionInstallStore((s) => s.active);
  const downloadErrors = useDownloadsStore((s) => s.errors);

  const [updateInfo, setUpdateInfo] = useState<AppUpdateInfo | null>(null);
  const [installSuccess, setInstallSuccess] = useState<{
    profile: Profile;
    modName: string;
  } | null>(null);

  useEffect(() => {
    applyPerfAttribute(perfActive);
  }, [perfActive]);

  useEffect(() => {
    void api.checkAppUpdate().then((info) => {
      if (!info.update_available && !info.update_required) return;
      const dismissed = localStorage.getItem(DISMISSED_UPDATE_KEY);
      if (!info.update_required && dismissed === info.latest_version) return;
      setUpdateInfo(info);
    }).catch(() => {});
  }, []);

  const dismissUpdate = useCallback(() => {
    if (updateInfo && !updateInfo.update_required) {
      localStorage.setItem(DISMISSED_UPDATE_KEY, updateInfo.latest_version);
    }
    setUpdateInfo(null);
  }, [updateInfo]);
  const registerPendingInstall = useInstallQueueStore((s) => s.registerPendingInstall);
  const prioritizeDownload = useInstallQueueStore((s) => s.prioritizeDownload);
  const pendingByDownloadId = useInstallQueueStore((s) => s.pendingByDownloadId);

  const completeUpdateDownload = useCallback(
    async (download: DownloadProgress) => {
      if (updatingDownloadsRef.current.has(download.id)) return;
      updatingDownloadsRef.current.add(download.id);
      try {
        await api.completeModUpdate(download.id);
        await dismiss(download.id);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes("REWIZARD_REQUIRED")) {
          await enqueueFromDownload(download, "update", profiles, {
            replaceModId: download.update_target_mod_id,
          });
        } else {
          setError(download.id, message);
        }
      } finally {
        updatingDownloadsRef.current.delete(download.id);
      }
    },
    [dismiss, setError, enqueueFromDownload, profiles]
  );

  const handleDownloadComplete = useCallback(
    async (download: DownloadProgress) => {
      if (download.update_target_mod_id) {
        await completeUpdateDownload(download);
        return;
      }

      const pending = pendingByDownloadId[download.id];
      const autoInstall =
        download.auto_install ||
        pending?.source === "collection" ||
        pending?.source === "dep" ||
        pending?.source === "bodyslide" ||
        pending?.source === "cbbe" ||
        pending?.source === "nxm" ||
        downloadSettings.auto_install_after_download;

      if (autoInstall) {
        const source = pending?.source ?? "manual";
        const installPreset =
          source === "bodyslide"
            ? { strategy: "merge_loose_to_data", autoConfirm: true }
            : source === "cbbe"
              ? { strategy: "auto", fomodPreset: "cbbe_deck" as const, autoConfirm: true }
              : undefined;
        await enqueueFromDownload(download, source, profiles, {
          replaceModId: pending?.replaceModId,
          installPreset,
        });
      } else {
        showInstallPrompt(download);
      }
    },
    [
      pendingByDownloadId,
      downloadSettings.auto_install_after_download,
      completeUpdateDownload,
      enqueueFromDownload,
      profiles,
      showInstallPrompt,
    ]
  );

  const handleInstallNowFromDownload = useCallback(
    async (download: DownloadProgress, front = false) => {
      if (download.update_target_mod_id) {
        await completeUpdateDownload(download);
        return;
      }
      await enqueueFromDownload(download, "manual", profiles, { front });
    },
    [profiles, completeUpdateDownload, enqueueFromDownload]
  );

  useFocusNavigation(containerRef);
  useGamepadBack();

  useEffect(() => {
    gamepadRouter.setRouteContext(resolveContextFromPath(pathname));
  }, [pathname]);

  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;

    void ensureGamepadPolyfill();
    void initialize();
    void loadProfiles();
    void loadLaunchSettings();
    void loadSettings();
    void api.listDownloads().then(hydrateFromRecords);
    const unsubLaunch = subscribeLaunchEvents();
    return () => unsubLaunch();
  }, [
    initialize,
    loadProfiles,
    hydrateFromRecords,
    subscribeLaunchEvents,
    loadLaunchSettings,
    loadSettings,
  ]);

  useEffect(() => {
    if (isOnboarding) return;
    api
      .isOnboardingComplete()
      .then((done) => {
        if (!done) {
          navigate({ to: "/onboarding" });
        }
      })
      .catch(() => {
        navigate({ to: "/onboarding" });
      });
  }, [isOnboarding, navigate]);

  useEffect(() => {
    if (!hydrated || settingsLoading || isOnboarding || recoveryHandledRef.current) return;
    if (installPrompt || activeJob) return;

    const completed = Object.values(active).filter(
      (d) => d.status === "complete" && !d.update_target_mod_id
    );
    if (completed.length === 0) return;

    recoveryHandledRef.current = true;
    const download = completed[0];
    const pending = pendingByDownloadId[download.id];
    const autoInstall =
      download.auto_install ||
      pending?.source === "collection" ||
      pending?.source === "dep" ||
      pending?.source === "bodyslide" ||
      pending?.source === "cbbe" ||
      pending?.source === "nxm" ||
      downloadSettings.auto_install_after_download;

    if (autoInstall) {
      void enqueueFromDownload(download, pending?.source ?? "manual", profiles, {
        replaceModId: pending?.replaceModId,
      });
    } else {
      showInstallPrompt(download);
    }
  }, [
    hydrated,
    settingsLoading,
    isOnboarding,
    active,
    installPrompt,
    activeJob,
    pendingByDownloadId,
    downloadSettings.auto_install_after_download,
    profiles,
    enqueueFromDownload,
    showInstallPrompt,
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
      void handleDownloadComplete(e.payload);
    }).then((u) => unsubs.push(u));
    listen<{ id: string; error: string }>("download-error", (e) => {
      setError(e.payload.id, e.payload.error);
    }).then((u) => unsubs.push(u));
    listen<string>("nxm-url", (e) => {
      api.handleNxmUrl(e.payload).then(async (data) => {
        const d = data as {
          game_domain: string;
          mod_id: number;
          file_id?: number;
          files?: ModFileInfo[];
        };
        const profile = profiles.find((p) => p.game_domain === d.game_domain);
        const nxmOneClick =
          localStorage.getItem("nexusdeck_nxm_one_click") !== "false";
        if (profile && nxmOneClick && d.files?.length) {
          const fileId = d.file_id ?? d.files[0].file_id;
          const file = d.files.find((f) => f.file_id === fileId) ?? d.files[0];
          try {
            const progress = await api.startModDownload({
              gameDomain: d.game_domain,
              modId: d.mod_id,
              fileId: file.file_id,
              fileName: modFileDownloadName(file),
              stagingPath: profile.staging_path,
              expectedSizeKb: file.size_kb,
              modName: file.name,
              profileId: profile.id,
            });
            registerPendingInstall(progress.id, {
              source: "nxm",
              modId: d.mod_id,
              modName: file.name,
            });
            setProgress(progress);
            navigate({
              to: "/games/$domain/mods/$modId",
              params: { domain: d.game_domain, modId: String(d.mod_id) },
            });
            return;
          } catch {
            // fall through to mod page navigation
          }
        }
        navigate({
          to: "/games/$domain/mods/$modId",
          params: { domain: d.game_domain, modId: String(d.mod_id) },
        });
      });
    }).then((u) => unsubs.push(u));
    return () => unsubs.forEach((u) => u());
  }, [setProgress, setError, navigate, handleDownloadComplete, profiles, registerPendingInstall]);

  useEffect(() => {
    const onInstall = (e: Event) => {
      const { downloadId, front } = (e as CustomEvent).detail as {
        downloadId: string;
        front?: boolean;
      };
      const download = active[downloadId];
      if (download?.status === "complete") {
        if (front) prioritizeDownload(downloadId);
        void handleInstallNowFromDownload(download, front);
      }
    };
    window.addEventListener("nexusdeck-install-download", onInstall);
    return () => window.removeEventListener("nexusdeck-install-download", onInstall);
  }, [active, handleInstallNowFromDownload, prioritizeDownload]);

  useEffect(() => {
    if (!collectionActive) return;
    for (const download of Object.values(active)) {
      syncCollectionDownload(download, downloadErrors[download.id]);
    }
  }, [active, collectionActive, downloadErrors, syncCollectionDownload]);

  useEffect(() => {
    if (!collectionActive) return;
    for (const job of installJobs) {
      syncCollectionInstall(job);
    }
  }, [installJobs, collectionActive, syncCollectionInstall]);

  const promptProfile = installPrompt
    ? resolveProfile(profiles, installPrompt)
    : undefined;

  const handleInstallNow = async () => {
    if (!installPrompt) return;
    await handleInstallNowFromDownload(installPrompt);
    dismissInstallPrompt();
  };

  const handleInstallComplete = async (downloadId?: string) => {
    const job = useInstallQueueStore.getState().getActiveJob();
    const clearAfterInstall =
      localStorage.getItem("nexusdeck_clear_download_after_install") !== "false";
    if (downloadId && clearAfterInstall) {
      await dismiss(downloadId).catch(() => {});
    }
    completeActive(downloadId);
    if (job) {
      setInstallSuccess({ profile: job.profile, modName: job.modName });
    }
  };

  return (
    <GamepadRouterProvider>
      <div ref={containerRef} className="flex h-full min-h-screen flex-col">
        <BootReadyMarker />
        <AppShell hideNav={isOnboarding} updateInfo={updateInfo} onDismissUpdate={dismissUpdate}>
          <Outlet />
        </AppShell>
        {!isOnboarding && <DownloadQueuePanel />}
        {!isOnboarding && <InstallQueuePanel />}
        {!isOnboarding && <CollectionInstallProgressPanel />}
        {!isOnboarding && <ControllerHintBar />}
        <CommandPalette />

        {!isOnboarding && (
          <InstallPromptDialog
            open={!!installPrompt}
            onOpenChange={(open) => !open && dismissInstallPrompt()}
            download={installPrompt}
            profile={promptProfile ?? null}
            onInstall={handleInstallNow}
            onDismiss={dismissInstallPrompt}
          />
        )}

        {!isOnboarding && activeJob && (
          <ModInstallDialog
            open
            onOpenChange={(open) => !open && cancelActive()}
            profile={activeJob.profile}
            modId={activeJob.modId}
            modName={activeJob.modName}
            file={activeJob.file}
            archivePathOverride={activeJob.archivePath}
            replaceModId={activeJob.replaceModId}
            installPreset={activeJob.installPreset}
            onInstalled={() => void handleInstallComplete(activeJob.downloadId)}
            onInstallFailed={(err) => failActive(err)}
          />
        )}

        <InstallSuccessDialog
          open={!!installSuccess}
          onOpenChange={(open) => !open && setInstallSuccess(null)}
          profile={installSuccess?.profile ?? null}
          modName={installSuccess?.modName ?? ""}
        />
      </div>
    </GamepadRouterProvider>
  );
}

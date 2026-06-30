import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ModInstallDialog } from "@/components/mod/ModInstallDialog";
import { InstallSuccessDialog } from "@/components/install/InstallSuccessDialog";
import { SetupRequiredState } from "@/components/game/SetupRequiredState";
import { FreeDownloadDialog } from "@/components/mod/FreeDownloadDialog";
import {
  MOD_DETAIL_TABS,
  ModDetailView,
  type ModDetailTab,
} from "@/components/mod/ModDetailView";
import { groupModFiles } from "@/components/mod/ModFileSections";
import { ApiErrorBanner } from "@/components/ui/ApiErrorBanner";
import { ListRowSkeleton } from "@/components/ui/LoadingSkeleton";
import { useGamepadTabs } from "@/hooks/useGamepadTabs";
import { useGamepadContextAction } from "@/hooks/useGamepadRouter";
import { useAppBack } from "@/hooks/useAppBack";
import { GP } from "@/lib/gamepad/buttons";
import { getPairedDeck, sendNexusModToPairedDeck } from "@/lib/remote/sendToDeck";
import { useAuthStore, useDownloadsStore, useGamesStore, useInstallQueueStore } from "@/stores";
import { useSettingsStore } from "@/stores/settingsStore";
import { api } from "@/lib/commands";
import { formatModDescription } from "@/lib/bbcode";
import type { InstalledMod, ModDetail, ModFileInfo } from "@/lib/nexus/types";
import { modFileDownloadName } from "@/lib/nexus/types";

export const Route = createFileRoute("/games/$domain/mods/$modId")({
  component: ModDetailPage,
});

function ModDetailPage() {
  const { domain, modId: modIdParam } = useParams({ from: "/games/$domain/mods/$modId" });
  const modId = Number(modIdParam);
  const navigate = useNavigate();
  const { getProfile } = useGamesStore();
  const user = useAuthStore((s) => s.user);
  const profile = getProfile(domain);
  const active = useDownloadsStore((s) => s.active);
  const setProgress = useDownloadsStore((s) => s.setProgress);
  const registerPendingInstall = useInstallQueueStore((s) => s.registerPendingInstall);

  const [detail, setDetail] = useState<ModDetail | null>(null);
  const [files, setFiles] = useState<ModFileInfo[]>([]);
  const [installedMod, setInstalledMod] = useState<InstalledMod | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [activeTab, setActiveTab] = useState<ModDetailTab>("overview");
  const [selectedScreenshot, setSelectedScreenshot] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const [queueing, setQueueing] = useState(false);
  const [installFile, setInstallFile] = useState<ModFileInfo | null>(null);
  const [freeDownloadFile, setFreeDownloadFile] = useState<ModFileInfo | null>(null);
  const [endorsing, setEndorsing] = useState(false);
  const [tracking, setTracking] = useState(false);
  const [installSuccessOpen, setInstallSuccessOpen] = useState(false);
  const [sendingToDeck, setSendingToDeck] = useState(false);
  const [sendToDeckNote, setSendToDeckNote] = useState<string | null>(null);

  const deckDetected = useSettingsStore((s) => s.deckDetected);
  const pairedDeck = !deckDetected ? getPairedDeck() : null;
  const goBack = useAppBack();

  const isPremium = user?.is_premium ?? false;

  const loadDetail = () => {
    if (!modId || Number.isNaN(modId)) return;
    setLoading(true);
    setError(null);
    Promise.all([api.getModDetail(domain, modId), api.getModFiles(domain, modId)])
      .then(([modDetail, modFiles]) => {
        setDetail(modDetail);
        setFiles(modFiles);
        setSelectedScreenshot(0);
      })
      .catch((e) => setError(e))
      .finally(() => setLoading(false));
  };

  useEffect(loadDetail, [domain, modId]);

  useEffect(() => {
    if (!profile) return;
    api
      .listInstalledMods(profile.id)
      .then((mods) => setInstalledMod(mods.find((m) => m.nexus_mod_id === modId) ?? null))
      .catch(() => setInstalledMod(null));
  }, [profile, modId]);

  useGamepadTabs([...MOD_DETAIL_TABS], activeTab, (tab) => setActiveTab(tab as ModDetailTab));

  const formattedDescription = useMemo(
    () => (detail ? formatModDescription(detail.description_html) : ""),
    [detail]
  );

  const downloadFile = async (file: ModFileInfo) => {
    if (!profile) return;
    setDownloading(true);
    try {
      const progress = await api.startModDownload({
        gameDomain: domain,
        modId,
        fileId: file.file_id,
        fileName: modFileDownloadName(file),
        stagingPath: profile.staging_path,
        expectedSizeKb: file.size_kb,
        modName: detail?.name,
        profileId: profile.id,
      });
      setProgress(progress);
      setActiveTab("files");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.toLowerCase().includes("premium")) {
        setFreeDownloadFile(file);
      }
    } finally {
      setDownloading(false);
    }
  };

  const queueForInstall = async (file: ModFileInfo) => {
    if (!profile || !detail) return;
    setQueueing(true);
    try {
      const progress = await api.queueModForInstall({
        profileId: profile.id,
        nexusModId: modId,
        nexusFileId: file.file_id,
        modName: detail.name,
      });
      registerPendingInstall(progress.id, {
        source: "queued",
        modId,
        modName: detail.name,
      });
      setProgress(progress);
    } finally {
      setQueueing(false);
    }
  };

  const openOnNexus = async () => {
    const urls = await api.getNexusBrowserUrls(domain, modId);
    await openUrl(urls.mod_page);
  };

  const toggleEndorse = async () => {
    if (!detail) return;
    setEndorsing(true);
    try {
      if (detail.viewer_endorsed) {
        await api.abstainMod(domain, modId);
      } else {
        await api.endorseMod(domain, modId, detail.version);
      }
      loadDetail();
    } finally {
      setEndorsing(false);
    }
  };

  const toggleTrack = async () => {
    if (!detail) return;
    setTracking(true);
    try {
      if (!detail.viewer_tracked) {
        await api.trackMod(domain, modId);
      }
      loadDetail();
    } finally {
      setTracking(false);
    }
  };

  const filterByTag = (tag: string) => {
    navigate({
      to: "/games/$domain/mods",
      params: { domain },
      search: { tags: tag, modId: undefined },
    });
  };

  const filterByAuthor = (author: string) => {
    navigate({
      to: "/games/$domain/mods",
      params: { domain },
      search: { author, modId: undefined },
    });
  };

  const sendToDeck = async (file: ModFileInfo) => {
    if (!profile || !detail || !pairedDeck) return;
    setSendingToDeck(true);
    setSendToDeckNote(null);
    setError(null);
    try {
      const message = await sendNexusModToPairedDeck(
        pairedDeck,
        domain,
        modId,
        detail.name,
        file
      );
      setSendToDeckNote(message);
    } catch (e) {
      setError(e);
    } finally {
      setSendingToDeck(false);
    }
  };

  const galleryLength = useMemo(() => {
    if (!detail) return 0;
    if (detail.screenshots.length > 0) return detail.screenshots.length;
    if (detail.hero_image_url || detail.picture_url) return 1;
    return 0;
  }, [detail]);

  useEffect(() => {
    const onGalleryScroll = (e: Event) => {
      const { direction } = (e as CustomEvent).detail as { direction: "up" | "down" };
      if (galleryLength <= 1) return;
      setSelectedScreenshot((i) => {
        if (direction === "up") return (i - 1 + galleryLength) % galleryLength;
        return (i + 1) % galleryLength;
      });
    };
    window.addEventListener("nexusdeck-gallery-scroll", onGalleryScroll);
    return () => window.removeEventListener("nexusdeck-gallery-scroll", onGalleryScroll);
  }, [galleryLength]);

  useGamepadContextAction(GP.X, () => {
    setActiveTab("files");
    return true;
  }, "modDetail");

  useGamepadContextAction(
    GP.A,
    () => {
      const { mainFiles } = groupModFiles(files);
      const primary = mainFiles.find((f) => f.is_primary) ?? mainFiles[0];
      if (!primary) return false;
      setInstallFile(primary);
      return true;
    },
    "modDetail"
  );

  useGamepadContextAction(
    GP.Y,
    () => {
      if (detail && !detail.viewer_endorsed) {
        void toggleEndorse();
        return true;
      }
      if (detail && !detail.viewer_tracked) {
        void toggleTrack();
        return true;
      }
    },
    "modDetail"
  );

  if (!profile) {
    return <SetupRequiredState domain={domain} />;
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="aspect-[21/9] animate-pulse rounded-2xl bg-[var(--color-secondary)]" />
        <ListRowSkeleton count={3} />
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="mx-auto max-w-4xl">
        <button
          type="button"
          onClick={goBack}
          className="focusable mb-6 inline-flex items-center gap-2 text-[var(--color-muted)] hover:text-white"
          data-focusable="true"
        >
          <ArrowLeft className="h-5 w-5" />
          Back to mods
        </button>
        <ApiErrorBanner
          context="mod-detail"
          error={error ?? "Mod not found"}
          onRetry={loadDetail}
        />
      </div>
    );
  }

  const gallery =
    detail.screenshots.length > 0
      ? detail.screenshots
      : detail.hero_image_url
        ? [detail.hero_image_url]
        : detail.picture_url
          ? [detail.picture_url]
          : [];

  const activeDownloads = Object.values(active).filter(
    (d) => d.game_domain === domain && d.mod_id === modId
  );

  const prevScreenshot = () =>
    setSelectedScreenshot((i) => (i - 1 + gallery.length) % gallery.length);
  const nextScreenshot = () => setSelectedScreenshot((i) => (i + 1) % gallery.length);

  return (
    <>
      <ModDetailView
        domain={domain}
        modId={modId}
        modIdParam={modIdParam}
        profile={profile}
        detail={detail}
        files={files}
        gallery={gallery}
        selectedScreenshot={selectedScreenshot}
        onSelectScreenshot={setSelectedScreenshot}
        onPrevScreenshot={prevScreenshot}
        onNextScreenshot={nextScreenshot}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        formattedDescription={formattedDescription}
        isPremium={isPremium}
        downloading={downloading}
        endorsing={endorsing}
        tracking={tracking}
        installedMod={installedMod}
        activeDownloads={activeDownloads}
        onDownload={downloadFile}
        onBrowserDownload={setFreeDownloadFile}
        onInstall={setInstallFile}
        onQueueInstall={(file) => void queueForInstall(file)}
        queueing={queueing}
        sendToDeck={Boolean(pairedDeck)}
        sendingToDeck={sendingToDeck}
        onSendToDeck={(file) => void sendToDeck(file)}
        onEndorse={toggleEndorse}
        onTrack={toggleTrack}
        onOpenNexus={openOnNexus}
        onFilterTag={filterByTag}
        onFilterAuthor={filterByAuthor}
      />

      {sendToDeckNote && (
        <p className="mx-auto mt-4 max-w-6xl rounded-xl bg-[var(--color-success)]/10 px-4 py-3 text-sm text-[var(--color-success)]">
          {sendToDeckNote}
        </p>
      )}

      {installFile && (
        <ModInstallDialog
          open={!!installFile}
          onOpenChange={(open) => !open && setInstallFile(null)}
          profile={profile}
          modId={modId}
          modName={detail.name}
          file={installFile}
          category={detail.category}
          tags={detail.tags}
          onInstalled={() => {
            setInstallFile(null);
            setInstallSuccessOpen(true);
            api
              .listInstalledMods(profile.id)
              .then((mods) => setInstalledMod(mods.find((m) => m.nexus_mod_id === modId) ?? null));
          }}
        />
      )}

      <InstallSuccessDialog
        open={installSuccessOpen}
        onOpenChange={setInstallSuccessOpen}
        profile={profile}
        modName={detail.name}
      />

      {freeDownloadFile && (
        <FreeDownloadDialog
          open={!!freeDownloadFile}
          onOpenChange={(open) => !open && setFreeDownloadFile(null)}
          gameDomain={domain}
          modId={modId}
          modName={detail.name}
          file={freeDownloadFile}
          stagingPath={profile.staging_path}
          onReadyToInstall={() => setInstallFile(freeDownloadFile)}
        />
      )}
    </>
  );
}

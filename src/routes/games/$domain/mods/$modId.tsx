import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ComponentType } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  Eye,
  Heart,
  ImageIcon,
  Star,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ModInstallDialog } from "@/components/mod/ModInstallDialog";
import { FreeDownloadDialog } from "@/components/mod/FreeDownloadDialog";
import { ModFileSections } from "@/components/mod/ModFileSections";
import { DependencyPanel } from "@/components/deps/DependencyPanel";
import { LaunchButton } from "@/components/launch/LaunchButton";
import { Progress } from "@/components/ui/progress";
import { ApiErrorBanner } from "@/components/ui/ApiErrorBanner";
import { ListRowSkeleton } from "@/components/ui/LoadingSkeleton";
import { useGamepadTabs } from "@/hooks/useGamepadTabs";
import { useGamepadContextAction } from "@/hooks/useGamepadRouter";
import { GP } from "@/lib/gamepad/buttons";
import { useAuthStore, useDownloadsStore, useGamesStore } from "@/stores";
import { api } from "@/lib/commands";
import { formatModDescription } from "@/lib/bbcode";
import { formatBytes, formatDate, formatNumber } from "@/lib/utils";
import type { ModDetail, ModFileInfo } from "@/lib/nexus/types";
import { modFileDownloadName } from "@/lib/nexus/types";

export const Route = createFileRoute("/games/$domain/mods/$modId")({
  component: ModDetailPage,
});

const MOD_TABS = ["overview", "about", "files", "media"] as const;
type ModTab = (typeof MOD_TABS)[number];

function ModDetailPage() {
  const { domain, modId: modIdParam } = useParams({ from: "/games/$domain/mods/$modId" });
  const modId = Number(modIdParam);
  const navigate = useNavigate();
  const { getProfile } = useGamesStore();
  const user = useAuthStore((s) => s.user);
  const profile = getProfile(domain);
  const active = useDownloadsStore((s) => s.active);
  const setProgress = useDownloadsStore((s) => s.setProgress);

  const [detail, setDetail] = useState<ModDetail | null>(null);
  const [files, setFiles] = useState<ModFileInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [activeTab, setActiveTab] = useState<ModTab>("overview");
  const [selectedScreenshot, setSelectedScreenshot] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const [installFile, setInstallFile] = useState<ModFileInfo | null>(null);
  const [freeDownloadFile, setFreeDownloadFile] = useState<ModFileInfo | null>(null);
  const [endorsing, setEndorsing] = useState(false);
  const [tracking, setTracking] = useState(false);

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

  useGamepadTabs([...MOD_TABS], activeTab, (tab) => setActiveTab(tab as ModTab));

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
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.toLowerCase().includes("premium")) {
        setFreeDownloadFile(file);
      }
    } finally {
      setDownloading(false);
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
    if (activeTab !== "files") setActiveTab("files");
  });

  useGamepadContextAction(GP.Y, () => {
    if (detail && !detail.viewer_endorsed) void toggleEndorse();
    else if (detail && !detail.viewer_tracked) void toggleTrack();
  });

  if (!profile) {
    return <p className="text-[var(--color-muted)]">Set up this game before browsing mods.</p>;
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl">
        <ListRowSkeleton count={4} />
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="mx-auto max-w-4xl">
        <Link
          to="/games/$domain/mods"
          params={{ domain }}
          search={{ modId: undefined }}
          className="focusable mb-6 inline-flex items-center gap-2 text-[var(--color-muted)] hover:text-white"
          data-focusable="true"
        >
          <ArrowLeft className="h-5 w-5" />
          Back to mods
        </Link>
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
  const nextScreenshot = () =>
    setSelectedScreenshot((i) => (i + 1) % gallery.length);

  const changelogFiles = files.filter(
    (f) =>
      f.category_name.toLowerCase().includes("changelog") ||
      f.name.toLowerCase().includes("changelog")
  );

  return (
    <div className="mx-auto max-w-5xl pb-12">
      <Link
        to="/games/$domain/mods"
        params={{ domain }}
        search={{ modId: undefined }}
        className="focusable mb-6 inline-flex items-center gap-2 text-[var(--color-muted)] hover:text-white"
        data-focusable="true"
      >
        <ArrowLeft className="h-5 w-5" />
        Back to mods
      </Link>

      {profile && (
        <div className="mb-6">
          <LaunchButton profileId={profile.id} gameDomain={domain} compact />
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[image:var(--gradient-surface)] shadow-[var(--shadow-md)]">
        {gallery.length > 0 && (
          <div
            className="relative aspect-[21/9] overflow-hidden bg-[var(--color-secondary)]"
            data-focus-group="gallery"
            tabIndex={0}
            data-focusable="true"
          >
            <img
              src={gallery[selectedScreenshot]}
              alt={detail.name}
              className="h-full w-full object-cover"
            />
            {gallery.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={prevScreenshot}
                  className="focusable absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2"
                  data-focusable="true"
                  aria-label="Previous image"
                >
                  <ChevronLeft className="h-6 w-6" />
                </button>
                <button
                  type="button"
                  onClick={nextScreenshot}
                  className="focusable absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2"
                  data-focusable="true"
                  aria-label="Next image"
                >
                  <ChevronRight className="h-6 w-6" />
                </button>
                <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-2">
                  {gallery.map((_, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setSelectedScreenshot(i)}
                      className={`focusable min-h-[44px] min-w-[44px] rounded-full ${
                        i === selectedScreenshot ? "bg-white" : "bg-white/40"
                      }`}
                      data-focusable="true"
                      aria-label={`Image ${i + 1}`}
                    />
                  ))}
                </div>
                <p className="absolute right-3 top-3 rounded-lg bg-black/50 px-2 py-1 text-xs text-white">
                  L2/R2: Gallery
                </p>
              </>
            )}
          </div>
        )}

        <div className="space-y-6 p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap gap-2">
                <Badge variant="muted">{detail.category}</Badge>
                {detail.adult_content && <Badge variant="nsfw">Adult content</Badge>}
                <Badge variant="muted">v{detail.version}</Badge>
              </div>
              <h1 className="mt-3 text-3xl font-bold">{detail.name}</h1>
              <p className="mt-2 text-lg text-[var(--color-muted)]">{detail.summary}</p>
            </div>
            <div className="flex flex-wrap gap-2 rounded-xl bg-[var(--color-secondary)] p-2">
              <Button
                variant={detail.viewer_endorsed ? "default" : "ghost"}
                size="sm"
                disabled={endorsing}
                onClick={toggleEndorse}
              >
                <Heart className="h-5 w-5" />
                {detail.viewer_endorsed ? "Endorsed" : "Endorse"}
              </Button>
              <Button
                variant={detail.viewer_tracked ? "default" : "ghost"}
                size="sm"
                disabled={tracking || detail.viewer_tracked}
                onClick={toggleTrack}
              >
                <Star className="h-5 w-5" />
                {detail.viewer_tracked ? "Tracked" : "Track"}
              </Button>
              <Link
                to="/games/$domain/preview/$modId"
                params={{ domain, modId: modIdParam }}
                className="focusable"
                data-focusable="true"
              >
                <Button variant="ghost" size="sm">
                  <Eye className="h-5 w-5" />
                  Preview
                </Button>
              </Link>
              <Button variant="ghost" size="sm" onClick={openOnNexus}>
                <ExternalLink className="h-5 w-5" />
                Nexus
              </Button>
            </div>
          </div>

          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ModTab)}>
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="about">About</TabsTrigger>
              <TabsTrigger value="files">Files ({files.length})</TabsTrigger>
              <TabsTrigger value="media">Media ({gallery.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="overview">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Stat label="Endorsements" value={formatNumber(detail.endorsements)} icon={Heart} />
                <Stat label="Downloads" value={formatNumber(detail.mod_downloads)} icon={Download} />
                <Stat label="Author" value={detail.author} icon={User} />
                <Stat label="Updated" value={formatDate(detail.updated_timestamp)} />
              </div>

              <div className="mt-6 space-y-4 rounded-xl bg-[var(--color-secondary)] p-4">
                <div>
                  <p className="text-sm text-[var(--color-muted)]">Uploader</p>
                  <p className="font-medium">{detail.uploader}</p>
                </div>
                <div>
                  <p className="text-sm text-[var(--color-muted)]">Category</p>
                  <p className="font-medium">{detail.category}</p>
                </div>
                {detail.tags.length > 0 && (
                  <div>
                    <p className="mb-2 text-sm text-[var(--color-muted)]">Tags</p>
                    <div className="flex flex-wrap gap-2">
                      {detail.tags.map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => filterByTag(tag)}
                          className="focusable"
                          data-focusable="true"
                        >
                          <Badge variant="muted">{tag}</Badge>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <DependencyPanel profile={profile} modId={modId} gameDomain={domain} />
            </TabsContent>

            <TabsContent value="about">
              {formattedDescription ? (
                <div
                  className="mod-description rounded-xl bg-[var(--color-secondary)] p-6"
                  dangerouslySetInnerHTML={{ __html: formattedDescription }}
                />
              ) : (
                <p className="text-[var(--color-muted)]">No description provided.</p>
              )}
            </TabsContent>

            <TabsContent value="files">
              <p className="mb-4 text-sm text-[var(--color-muted)]">
                Uploaded by {detail.uploader} · Updated {formatDate(detail.updated_timestamp)}
              </p>

              {changelogFiles.length > 0 && (
                <div className="mb-4 rounded-xl border border-[var(--color-border)] p-4">
                  <h4 className="mb-2 font-semibold">Changelog files</h4>
                  <ul className="space-y-1 text-sm">
                    {changelogFiles.map((f) => (
                      <li key={f.file_id}>
                        {f.name} — v{f.version}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {activeDownloads.length > 0 && (
                <div className="mb-4 space-y-2 rounded-xl border border-[var(--color-border)] p-4">
                  {activeDownloads.map((d) => (
                    <div key={d.id}>
                      <div className="flex justify-between text-sm">
                        <span>{d.file_name}</span>
                        <span>
                          {formatBytes(d.bytes_done)} / {formatBytes(d.bytes_total || 0)}
                        </span>
                      </div>
                      <Progress value={d.bytes_total ? (d.bytes_done / d.bytes_total) * 100 : 0} />
                    </div>
                  ))}
                </div>
              )}

              <ModFileSections
                files={files}
                isPremium={isPremium}
                downloading={downloading}
                onDownload={downloadFile}
                onBrowserDownload={setFreeDownloadFile}
                onInstall={setInstallFile}
              />
            </TabsContent>

            <TabsContent value="media">
              {gallery.length > 0 ? (
                <div className="space-y-4">
                  <div className="relative aspect-video overflow-hidden rounded-xl bg-black/30">
                    <img
                      src={gallery[selectedScreenshot]}
                      alt={`${detail.name} screenshot ${selectedScreenshot + 1}`}
                      className="h-full w-full object-contain"
                    />
                    {gallery.length > 1 && (
                      <div className="absolute inset-x-0 top-1/2 flex -translate-y-1/2 justify-between px-2">
                        <Button variant="secondary" size="icon" onClick={prevScreenshot}>
                          <ChevronLeft className="h-5 w-5" />
                        </Button>
                        <Button variant="secondary" size="icon" onClick={nextScreenshot}>
                          <ChevronRight className="h-5 w-5" />
                        </Button>
                      </div>
                    )}
                  </div>
                  {gallery.length > 1 && (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {gallery.map((url, index) => (
                        <button
                          key={`${url}-${index}`}
                          type="button"
                          onClick={() => setSelectedScreenshot(index)}
                          className={`focusable overflow-hidden rounded-xl border-2 ${
                            selectedScreenshot === index
                              ? "border-[var(--color-primary)]"
                              : "border-transparent opacity-80 hover:opacity-100"
                          }`}
                          data-focusable="true"
                        >
                          <img src={url} alt="" className="aspect-video w-full object-cover" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center rounded-xl bg-[var(--color-secondary)] py-16 text-[var(--color-muted)]">
                  <ImageIcon className="mb-2 h-8 w-8" />
                  <p>No screenshots available</p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {installFile && (
        <ModInstallDialog
          open={!!installFile}
          onOpenChange={(open) => !open && setInstallFile(null)}
          profile={profile}
          modId={modId}
          modName={detail.name}
          file={installFile}
          onInstalled={() => setInstallFile(null)}
        />
      )}

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
    </div>
  );
}

function Stat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon?: ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-xl bg-[var(--color-secondary)] p-4">
      <div className="flex items-center gap-2 text-sm text-[var(--color-muted)]">
        {Icon && <Icon className="h-4 w-4" />}
        {label}
      </div>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  );
}

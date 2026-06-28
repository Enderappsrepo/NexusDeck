import { Link } from "@tanstack/react-router";
import { useMemo, type ComponentType } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  Eye,
  FolderOpen,
  Heart,
  ImageIcon,
  Package,
  Star,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { ModFileSections, groupModFiles } from "@/components/mod/ModFileSections";
import { ModDetailActionBar } from "@/components/mod/ModDetailActionBar";
import { DependencyPanel } from "@/components/deps/DependencyPanel";
import { useIsNarrow } from "@/hooks/useMediaQuery";
import { useSettingsStore } from "@/stores/settingsStore";
import { resolveCompactNav } from "@/lib/platform";
import type { DownloadProgress, InstalledMod, ModDetail, ModFileInfo, Profile } from "@/lib/nexus/types";
import { formatBytes, formatDate, formatNumber, formatRelativeDate, cn } from "@/lib/utils";

export const MOD_DETAIL_TABS = ["overview", "about", "files"] as const;
export type ModDetailTab = (typeof MOD_DETAIL_TABS)[number];

const TAB_OPTIONS = [
  { value: "overview" as const, label: "Overview" },
  { value: "about" as const, label: "About" },
  { value: "files" as const, label: "Files" },
];

interface ModDetailViewProps {
  domain: string;
  modId: number;
  modIdParam: string;
  profile: Profile;
  detail: ModDetail;
  files: ModFileInfo[];
  gallery: string[];
  selectedScreenshot: number;
  onSelectScreenshot: (index: number) => void;
  onPrevScreenshot: () => void;
  onNextScreenshot: () => void;
  activeTab: ModDetailTab;
  onTabChange: (tab: ModDetailTab) => void;
  formattedDescription: string;
  isPremium: boolean;
  downloading: boolean;
  endorsing: boolean;
  tracking: boolean;
  installedMod: InstalledMod | null;
  activeDownloads: DownloadProgress[];
  onDownload: (file: ModFileInfo) => void;
  onBrowserDownload: (file: ModFileInfo) => void;
  onInstall: (file: ModFileInfo) => void;
  onEndorse: () => void;
  onTrack: () => void;
  onOpenNexus: () => void;
  onFilterTag: (tag: string) => void;
  onFilterAuthor?: (author: string) => void;
}

export function ModDetailView(props: ModDetailViewProps) {
  const narrow = useIsNarrow();
  const deckDetected = useSettingsStore((s) => s.deckDetected);
  const navMode = useSettingsStore((s) => s.navMode);
  const deckMode = resolveCompactNav(navMode, narrow, deckDetected);

  return deckMode ? <ModDetailDeckLayout {...props} /> : <ModDetailDesktopLayout {...props} />;
}

function ModDetailDeckLayout(props: ModDetailViewProps) {
  const {
    domain,
    modId,
    modIdParam,
    profile,
    detail,
    files,
    gallery,
    selectedScreenshot,
    onSelectScreenshot,
    onPrevScreenshot,
    onNextScreenshot,
    activeTab,
    onTabChange,
    formattedDescription,
    isPremium,
    downloading,
    endorsing,
    tracking,
    installedMod,
    activeDownloads,
    onDownload,
    onBrowserDownload,
    onInstall,
    onEndorse,
    onTrack,
    onOpenNexus,
    onFilterTag,
    onFilterAuthor,
  } = props;

  const { mainFiles } = useMemo(() => groupModFiles(files), [files]);
  const primaryFile = mainFiles.find((f) => f.is_primary) ?? mainFiles[0];

  const descriptionPreview = useMemo(() => {
    if (!formattedDescription) return "";
    const stripped = formattedDescription.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (stripped.length <= 320) return stripped;
    return `${stripped.slice(0, 317)}…`;
  }, [formattedDescription]);

  const tabOptions = TAB_OPTIONS.map((t) =>
    t.value === "files" ? { ...t, label: `Files (${files.length})` } : t
  );

  return (
    <div className="mod-detail-deck mx-auto max-w-6xl pb-36" data-mod-detail-deck>
      <nav className="mb-3">
        <Link
          to="/games/$domain/mods"
          params={{ domain }}
          search={{ modId: undefined }}
          className="focusable inline-flex min-h-[48px] items-center gap-2 text-base text-[var(--color-muted)] hover:text-[var(--color-foreground)]"
          data-focusable="true"
        >
          <ChevronLeft className="h-5 w-5" />
          Back to browse
        </Link>
      </nav>

      <ModDetailHero
        detail={detail}
        gallery={gallery}
        selectedScreenshot={selectedScreenshot}
        onSelectScreenshot={onSelectScreenshot}
        onPrevScreenshot={onPrevScreenshot}
        onNextScreenshot={onNextScreenshot}
        installedMod={installedMod}
        deckMode
      />

      <ModDetailQuickActions
        detail={detail}
        endorsing={endorsing}
        tracking={tracking}
        domain={domain}
        modIdParam={modIdParam}
        onEndorse={onEndorse}
        onTrack={onTrack}
        onOpenNexus={onOpenNexus}
        deckMode
      />

      {detail.tags.length > 0 && (
        <section className="mt-4" aria-label="Tags">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--color-muted)]">
            Tags
          </h2>
          <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {detail.tags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => onFilterTag(tag)}
                className="focusable shrink-0"
                data-focusable="true"
              >
                <Badge variant="muted" className="min-h-[44px] px-4 text-base">
                  {tag}
                </Badge>
              </button>
            ))}
          </div>
        </section>
      )}

      <Tabs value={activeTab} onValueChange={(v) => onTabChange(v as ModDetailTab)} className="mt-5">
        <SegmentedControl
          options={tabOptions}
          value={activeTab}
          onChange={onTabChange}
          fill
          className="mb-5 w-full"
          ariaLabel="Mod detail sections"
        />

        <TabsContent value="overview" className="space-y-5">
          <DependencyPanel profile={profile} modId={modId} gameDomain={domain} />

          {descriptionPreview && (
            <Card className="p-5">
              <h2 className="mb-3 text-xl font-semibold">Description</h2>
              <p className="text-base leading-relaxed text-[var(--color-muted)]">{descriptionPreview}</p>
              {formattedDescription.length > descriptionPreview.length && (
                <Button
                  variant="secondary"
                  size="lg"
                  className="mt-4 min-h-[48px] w-full"
                  onClick={() => onTabChange("about")}
                  data-focusable="true"
                >
                  Read full description
                </Button>
              )}
            </Card>
          )}

          <Card className="p-5">
            <h2 className="mb-4 text-xl font-semibold">Details</h2>
            <div className="flex flex-wrap gap-2">
              <DetailChip label="Author" value={detail.author} onClick={onFilterAuthor ? () => onFilterAuthor(detail.author) : undefined} />
              <DetailChip label="Version" value={detail.version} />
              <DetailChip label="Updated" value={formatRelativeDate(detail.updated_timestamp)} />
              <DetailChip label="Category" value={detail.category} />
            </div>
          </Card>

          {installedMod && (
            <Link
              to="/games/$domain/library"
              params={{ domain }}
              className="focusable block"
              data-focusable="true"
            >
              <Card className="flex min-h-[56px] items-center gap-3 p-4 transition hover:border-[var(--color-primary)]/40">
                <FolderOpen className="h-6 w-6 shrink-0 text-[var(--color-primary)]" />
                <div className="min-w-0">
                  <p className="text-base font-semibold">In your library</p>
                  <p className="truncate text-sm text-[var(--color-muted)]">
                    {installedMod.enabled ? "Enabled" : "Disabled"} · v{installedMod.version ?? "?"}
                  </p>
                </div>
              </Card>
            </Link>
          )}
        </TabsContent>

        <TabsContent value="about">
          {formattedDescription ? (
            <div
              className="mod-description mod-description-deck rounded-2xl border border-[var(--color-border)] bg-[var(--color-secondary)] p-5"
              dangerouslySetInnerHTML={{ __html: formattedDescription }}
            />
          ) : (
            <Card className="p-8 text-center text-base text-[var(--color-muted)]">
              No description provided on Nexus Mods.
            </Card>
          )}
        </TabsContent>

        <TabsContent value="files" className="space-y-4">
          <ActiveDownloadsCard activeDownloads={activeDownloads} />
          <ModFileSections
            files={files}
            isPremium={isPremium}
            downloading={downloading}
            onDownload={onDownload}
            onBrowserDownload={onBrowserDownload}
            onInstall={onInstall}
            deckMode
          />
        </TabsContent>
      </Tabs>

      <ModDetailActionBar
        primaryFile={primaryFile}
        downloading={downloading}
        isPremium={isPremium}
        onDownload={onDownload}
        onInstall={onInstall}
        onBrowserDownload={onBrowserDownload}
      />
    </div>
  );
}

function ModDetailDesktopLayout(props: ModDetailViewProps) {
  const {
    domain,
    modId,
    modIdParam,
    profile,
    detail,
    files,
    gallery,
    selectedScreenshot,
    onSelectScreenshot,
    onPrevScreenshot,
    onNextScreenshot,
    activeTab,
    onTabChange,
    formattedDescription,
    isPremium,
    downloading,
    endorsing,
    tracking,
    installedMod,
    activeDownloads,
    onDownload,
    onBrowserDownload,
    onInstall,
    onEndorse,
    onTrack,
    onOpenNexus,
    onFilterTag,
    onFilterAuthor,
  } = props;

  const { mainFiles } = useMemo(() => groupModFiles(files), [files]);
  const primaryFile = mainFiles.find((f) => f.is_primary) ?? mainFiles[0];

  const changelogFiles = files.filter(
    (f) =>
      f.category_name.toLowerCase().includes("changelog") ||
      f.name.toLowerCase().includes("changelog")
  );

  const descriptionPreview = useMemo(() => {
    if (!formattedDescription) return "";
    const stripped = formattedDescription.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (stripped.length <= 280) return stripped;
    return `${stripped.slice(0, 277)}…`;
  }, [formattedDescription]);

  return (
    <div className="mx-auto max-w-6xl pb-16">
      <nav className="mb-4 flex flex-wrap items-center gap-2 text-sm text-[var(--color-muted)]">
        <Link
          to="/games/$domain/mods"
          params={{ domain }}
          search={{ modId: undefined }}
          className="focusable inline-flex items-center gap-1.5 hover:text-[var(--color-foreground)]"
          data-focusable="true"
        >
          <ChevronLeft className="h-4 w-4" />
          Browse
        </Link>
        <span aria-hidden>/</span>
        <span className="truncate">{detail.category}</span>
      </nav>

      <ModDetailHero
        detail={detail}
        gallery={gallery}
        selectedScreenshot={selectedScreenshot}
        onSelectScreenshot={onSelectScreenshot}
        onPrevScreenshot={onPrevScreenshot}
        onNextScreenshot={onNextScreenshot}
        installedMod={installedMod}
        deckMode={false}
      />

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
        <div className="min-w-0">
          <Tabs value={activeTab} onValueChange={(v) => onTabChange(v as ModDetailTab)}>
            <SegmentedControl
              options={TAB_OPTIONS.map((t) =>
                t.value === "files" ? { ...t, label: `Files (${files.length})` } : t
              )}
              value={activeTab}
              onChange={onTabChange}
              className="mb-6"
              ariaLabel="Mod detail sections"
            />

            <TabsContent value="overview" className="space-y-6">
              {descriptionPreview && (
                <Card className="p-5">
                  <h2 className="mb-2 text-lg font-semibold">Description</h2>
                  <p className="leading-relaxed text-[var(--color-muted)]">{descriptionPreview}</p>
                  {formattedDescription.length > descriptionPreview.length && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-3 px-0"
                      onClick={() => onTabChange("about")}
                      data-focusable="true"
                    >
                      Read full description
                    </Button>
                  )}
                </Card>
              )}

              <Card className="p-5">
                <h2 className="mb-4 text-lg font-semibold">Details</h2>
                <dl className="grid gap-4 sm:grid-cols-2">
                  {onFilterAuthor && detail.author ? (
                    <DetailRow
                      label="Author"
                      value={detail.author}
                      onClick={() => onFilterAuthor(detail.author)}
                    />
                  ) : (
                    <DetailRow label="Author" value={detail.author} />
                  )}
                  <DetailRow label="Uploader" value={detail.uploader} />
                  <DetailRow label="Category" value={detail.category} />
                  <DetailRow label="Last updated" value={formatDate(detail.updated_timestamp)} />
                  <DetailRow label="Version" value={detail.version} />
                  <DetailRow label="Mod ID" value={String(detail.mod_id)} />
                </dl>
              </Card>

              <DependencyPanel profile={profile} modId={modId} gameDomain={domain} />
            </TabsContent>

            <TabsContent value="about">
              {formattedDescription ? (
                <div
                  className="mod-description rounded-2xl border border-[var(--color-border)] bg-[var(--color-secondary)] p-6 sm:p-8"
                  dangerouslySetInnerHTML={{ __html: formattedDescription }}
                />
              ) : (
                <Card className="p-8 text-center text-[var(--color-muted)]">
                  No description provided on Nexus Mods.
                </Card>
              )}
            </TabsContent>

            <TabsContent value="files" className="space-y-4">
              <p className="text-sm text-[var(--color-muted)]">
                Uploaded by {detail.uploader} · Updated {formatDate(detail.updated_timestamp)}
              </p>

              {changelogFiles.length > 0 && (
                <Card className="p-4">
                  <h4 className="mb-2 font-semibold">Changelog files</h4>
                  <ul className="space-y-1 text-sm text-[var(--color-muted)]">
                    {changelogFiles.map((f) => (
                      <li key={f.file_id}>
                        {f.name} — v{f.version}
                      </li>
                    ))}
                  </ul>
                </Card>
              )}

              <ActiveDownloadsCard activeDownloads={activeDownloads} />

              <ModFileSections
                files={files}
                isPremium={isPremium}
                downloading={downloading}
                onDownload={onDownload}
                onBrowserDownload={onBrowserDownload}
                onInstall={onInstall}
              />
            </TabsContent>
          </Tabs>
        </div>

        <ModDetailSidebar
          primaryFile={primaryFile}
          detail={detail}
          domain={domain}
          modIdParam={modIdParam}
          installedMod={installedMod}
          isPremium={isPremium}
          downloading={downloading}
          endorsing={endorsing}
          tracking={tracking}
          onDownload={onDownload}
          onBrowserDownload={onBrowserDownload}
          onInstall={onInstall}
          onEndorse={onEndorse}
          onTrack={onTrack}
          onOpenNexus={onOpenNexus}
          onFilterTag={onFilterTag}
          onFilterAuthor={onFilterAuthor}
        />
      </div>
    </div>
  );
}

function ModDetailHero({
  detail,
  gallery,
  selectedScreenshot,
  onSelectScreenshot,
  onPrevScreenshot,
  onNextScreenshot,
  installedMod,
  deckMode,
}: {
  detail: ModDetail;
  gallery: string[];
  selectedScreenshot: number;
  onSelectScreenshot: (index: number) => void;
  onPrevScreenshot: () => void;
  onNextScreenshot: () => void;
  installedMod: InstalledMod | null;
  deckMode: boolean;
}) {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-secondary)] shadow-[var(--shadow-lg)]">
      <div
        className={cn(
          "relative w-full overflow-hidden",
          deckMode ? "aspect-video min-h-[200px] max-h-[320px]" : "aspect-[21/9] min-h-[200px] max-h-[420px]"
        )}
        data-focus-group="gallery"
      >
        {gallery.length > 0 ? (
          <img
            src={gallery[selectedScreenshot]}
            alt={detail.name}
            className="h-full w-full object-cover"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-[var(--color-muted)]">
            <ImageIcon className="h-12 w-12 opacity-50" />
            <span className="text-base">No preview image</span>
          </div>
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[var(--color-background)] via-[var(--color-background)]/70 to-transparent" />

        {gallery.length > 1 && (
          <>
            <button
              type="button"
              onClick={onPrevScreenshot}
              className={cn(
                "focusable absolute left-3 top-1/2 z-10 -translate-y-1/2 rounded-full border border-white/10 bg-black/50 backdrop-blur-sm transition hover:bg-black/70",
                deckMode ? "min-h-[48px] min-w-[48px] p-3" : "p-2.5"
              )}
              data-focusable="true"
              aria-label="Previous image"
            >
              <ChevronLeft className="h-6 w-6 text-white" />
            </button>
            <button
              type="button"
              onClick={onNextScreenshot}
              className={cn(
                "focusable absolute right-3 top-1/2 z-10 -translate-y-1/2 rounded-full border border-white/10 bg-black/50 backdrop-blur-sm transition hover:bg-black/70",
                deckMode ? "min-h-[48px] min-w-[48px] p-3" : "p-2.5"
              )}
              data-focusable="true"
              aria-label="Next image"
            >
              <ChevronRight className="h-6 w-6 text-white" />
            </button>
            <p className="absolute right-3 top-3 rounded-lg bg-black/55 px-3 py-1.5 text-sm font-medium text-white/95 backdrop-blur-sm">
              L2 / R2 · Gallery
            </p>
          </>
        )}
      </div>

      <div className={cn("relative space-y-3", deckMode ? "-mt-12 px-4 pb-4 pt-0" : "-mt-16 space-y-4 px-6 pb-6 pt-0")}>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="muted" className={deckMode ? "text-sm" : undefined}>
            {detail.category}
          </Badge>
          <Badge variant="muted" className={deckMode ? "text-sm" : undefined}>
            v{detail.version}
          </Badge>
          {detail.adult_content && <Badge variant="nsfw">Adult</Badge>}
          {installedMod && (
            <Badge variant="success" className="gap-1">
              <Package className="h-3.5 w-3.5" />
              Installed
            </Badge>
          )}
        </div>

        <h1 className={cn("font-bold tracking-tight", deckMode ? "text-2xl leading-tight" : "text-3xl sm:text-4xl")}>
          {detail.name}
        </h1>

        {!deckMode && detail.summary && (
          <p className="max-w-3xl text-lg leading-relaxed text-[var(--color-muted)]">{detail.summary}</p>
        )}

        {deckMode && detail.summary && (
          <p className="text-base leading-relaxed text-[var(--color-muted)] line-clamp-3">{detail.summary}</p>
        )}

        <div className="flex flex-wrap gap-2">
          <MetricPill icon={Heart} label={formatNumber(detail.endorsements)} large={deckMode} />
          <MetricPill icon={Download} label={formatNumber(detail.mod_downloads)} large={deckMode} />
          <MetricPill icon={User} label={detail.author} large={deckMode} />
          <MetricPill label={formatRelativeDate(detail.updated_timestamp)} large={deckMode} />
        </div>

        {gallery.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin" data-scroll-pane>
            {gallery.map((url, index) => (
              <button
                key={`${url}-${index}`}
                type="button"
                onClick={() => onSelectScreenshot(index)}
                className={cn(
                  "focusable shrink-0 overflow-hidden rounded-lg border-2 transition",
                  selectedScreenshot === index
                    ? "border-[var(--color-primary)] ring-2 ring-[var(--color-primary)]/40"
                    : "border-transparent opacity-75 hover:opacity-100",
                  deckMode && "min-h-[56px]"
                )}
                data-focusable="true"
                aria-label={`Screenshot ${index + 1}`}
                aria-current={selectedScreenshot === index}
              >
                <img
                  src={url}
                  alt=""
                  className={deckMode ? "h-14 w-24 object-cover" : "h-16 w-28 object-cover"}
                  loading="lazy"
                  decoding="async"
                />
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function ModDetailQuickActions({
  detail,
  endorsing,
  tracking,
  domain,
  modIdParam,
  onEndorse,
  onTrack,
  onOpenNexus,
  deckMode,
}: {
  detail: ModDetail;
  endorsing: boolean;
  tracking: boolean;
  domain: string;
  modIdParam: string;
  onEndorse: () => void;
  onTrack: () => void;
  onOpenNexus: () => void;
  deckMode?: boolean;
}) {
  if (!deckMode) return null;

  return (
    <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Button
        variant={detail.viewer_endorsed ? "default" : "outline"}
        size="lg"
        className="min-h-[52px]"
        disabled={endorsing}
        onClick={onEndorse}
        data-focusable="true"
      >
        <Heart className="h-5 w-5" />
        {detail.viewer_endorsed ? "Endorsed" : "Endorse"}
      </Button>
      <Button
        variant={detail.viewer_tracked ? "default" : "outline"}
        size="lg"
        className="min-h-[52px]"
        disabled={tracking || detail.viewer_tracked}
        onClick={onTrack}
        data-focusable="true"
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
        <Button variant="outline" size="lg" className="min-h-[52px] w-full">
          <Eye className="h-5 w-5" />
          Preview
        </Button>
      </Link>
      <Button variant="outline" size="lg" className="min-h-[52px]" onClick={onOpenNexus} data-focusable="true">
        <ExternalLink className="h-5 w-5" />
        Nexus
      </Button>
    </div>
  );
}

function ModDetailSidebar({
  primaryFile,
  detail,
  domain,
  modIdParam,
  installedMod,
  isPremium,
  downloading,
  endorsing,
  tracking,
  onDownload,
  onBrowserDownload,
  onInstall,
  onEndorse,
  onTrack,
  onOpenNexus,
  onFilterTag,
  onFilterAuthor,
}: {
  primaryFile?: ModFileInfo;
  detail: ModDetail;
  domain: string;
  modIdParam: string;
  installedMod: InstalledMod | null;
  isPremium: boolean;
  downloading: boolean;
  endorsing: boolean;
  tracking: boolean;
  onDownload: (file: ModFileInfo) => void;
  onBrowserDownload: (file: ModFileInfo) => void;
  onInstall: (file: ModFileInfo) => void;
  onEndorse: () => void;
  onTrack: () => void;
  onOpenNexus: () => void;
  onFilterTag: (tag: string) => void;
  onFilterAuthor?: (author: string) => void;
}) {
  return (
    <aside className="space-y-4 lg:sticky lg:top-6">
      {primaryFile && (
        <Card className="overflow-hidden border-[var(--color-primary)]/30 p-0">
          <div className="border-b border-[var(--color-border)] bg-[var(--color-primary)]/10 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-primary)]">
              Primary file
            </p>
          </div>
          <div className="space-y-4 p-4">
            <div>
              <p className="font-semibold leading-snug">{primaryFile.name}</p>
              <p className="mt-1 text-sm text-[var(--color-muted)]">
                v{primaryFile.version} · {formatBytes(primaryFile.size_kb * 1024)}
              </p>
            </div>
            <div className="flex flex-col gap-2">
              {isPremium ? (
                <Button
                  className="w-full min-h-[48px]"
                  loading={downloading}
                  disabled={downloading}
                  onClick={() => onDownload(primaryFile)}
                  data-focusable="true"
                >
                  <Download className="h-4 w-4" />
                  Download
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  className="w-full min-h-[48px]"
                  onClick={() => onBrowserDownload(primaryFile)}
                  data-focusable="true"
                >
                  <Download className="h-4 w-4" />
                  Get file
                </Button>
              )}
              <Button
                variant="secondary"
                className="w-full min-h-[48px]"
                onClick={() => onInstall(primaryFile)}
                data-focusable="true"
              >
                <Package className="h-4 w-4" />
                Install
              </Button>
            </div>
          </div>
        </Card>
      )}

      <Card className="p-3">
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant={detail.viewer_endorsed ? "default" : "outline"}
            size="sm"
            className="min-h-[44px]"
            disabled={endorsing}
            onClick={onEndorse}
            data-focusable="true"
          >
            <Heart className="h-4 w-4" />
            {detail.viewer_endorsed ? "Endorsed" : "Endorse"}
          </Button>
          <Button
            variant={detail.viewer_tracked ? "default" : "outline"}
            size="sm"
            className="min-h-[44px]"
            disabled={tracking || detail.viewer_tracked}
            onClick={onTrack}
            data-focusable="true"
          >
            <Star className="h-4 w-4" />
            {detail.viewer_tracked ? "Tracked" : "Track"}
          </Button>
          <Link
            to="/games/$domain/preview/$modId"
            params={{ domain, modId: modIdParam }}
            className="focusable col-span-1"
            data-focusable="true"
          >
            <Button variant="outline" size="sm" className="w-full min-h-[44px]">
              <Eye className="h-4 w-4" />
              Preview
            </Button>
          </Link>
          <Button variant="outline" size="sm" className="min-h-[44px]" onClick={onOpenNexus} data-focusable="true">
            <ExternalLink className="h-4 w-4" />
            Nexus
          </Button>
        </div>
      </Card>

      {installedMod && (
        <Link
          to="/games/$domain/library"
          params={{ domain }}
          className="focusable block"
          data-focusable="true"
        >
          <Card className="flex items-center gap-3 p-4 transition hover:border-[var(--color-primary)]/40">
            <FolderOpen className="h-5 w-5 text-[var(--color-primary)]" />
            <div className="min-w-0">
              <p className="text-sm font-semibold">Installed in library</p>
              <p className="truncate text-xs text-[var(--color-muted)]">
                {installedMod.enabled ? "Enabled" : "Disabled"} · v{installedMod.version ?? "?"}
              </p>
            </div>
          </Card>
        </Link>
      )}

      {onFilterAuthor && detail.author && (
        <Button
          variant="outline"
          size="sm"
          className="w-full min-h-[44px]"
          onClick={() => onFilterAuthor(detail.author)}
          data-focusable="true"
        >
          <User className="h-4 w-4" />
          More mods by {detail.author}
        </Button>
      )}

      {detail.tags.length > 0 && (
        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold text-[var(--color-muted)]">Tags</h3>
          <div className="flex flex-wrap gap-2">
            {detail.tags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => onFilterTag(tag)}
                className="focusable"
                data-focusable="true"
              >
                <Badge variant="muted">{tag}</Badge>
              </button>
            ))}
          </div>
        </Card>
      )}
    </aside>
  );
}

function ActiveDownloadsCard({ activeDownloads }: { activeDownloads: DownloadProgress[] }) {
  if (activeDownloads.length === 0) return null;
  return (
    <Card className="space-y-3 p-4">
      <h4 className="text-lg font-semibold">Active downloads</h4>
      {activeDownloads.map((d) => (
        <div key={d.id}>
          <div className="mb-1 flex justify-between text-sm">
            <span className="truncate pr-2">{d.file_name}</span>
            <span className="shrink-0 text-[var(--color-muted)]">
              {formatBytes(d.bytes_done)} / {formatBytes(d.bytes_total || 0)}
            </span>
          </div>
          <Progress value={d.bytes_total ? (d.bytes_done / d.bytes_total) * 100 : 0} />
        </div>
      ))}
    </Card>
  );
}

function MetricPill({
  icon: Icon,
  label,
  interactive = false,
  large = false,
}: {
  icon?: ComponentType<{ className?: string }>;
  label: string;
  interactive?: boolean;
  large?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-card)]/90 backdrop-blur-sm",
        large ? "px-4 py-2 text-base font-medium" : "px-3 py-1.5 text-sm",
        interactive &&
          "border-[var(--color-primary)]/40 transition-colors hover:border-[var(--color-primary)] hover:bg-[var(--color-primary)]/10"
      )}
    >
      {Icon && <Icon className={cn("text-[var(--color-muted)]", large ? "h-4 w-4" : "h-3.5 w-3.5")} />}
      <span className="font-medium">{label}</span>
    </span>
  );
}

function DetailChip({
  label,
  value,
  onClick,
}: {
  label: string;
  value: string;
  onClick?: () => void;
}) {
  const content = (
    <span className="inline-flex min-h-[44px] flex-col justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-secondary)] px-4 py-2">
      <span className="text-xs font-medium uppercase tracking-wide text-[var(--color-muted)]">{label}</span>
      <span className="text-base font-semibold">{value}</span>
    </span>
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="focusable" data-focusable="true">
        {content}
      </button>
    );
  }
  return content;
}

function DetailRow({
  label,
  value,
  onClick,
}: {
  label: string;
  value: string;
  onClick?: () => void;
}) {
  if (onClick) {
    return (
      <div>
        <dt className="text-xs font-medium uppercase tracking-wide text-[var(--color-muted)]">{label}</dt>
        <dd className="mt-1">
          <button
            type="button"
            onClick={onClick}
            className="focusable font-medium text-[var(--color-primary)] hover:underline"
            data-focusable="true"
          >
            {value}
          </button>
        </dd>
      </div>
    );
  }

  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-[var(--color-muted)]">{label}</dt>
      <dd className="mt-1 font-medium">{value}</dd>
    </div>
  );
}

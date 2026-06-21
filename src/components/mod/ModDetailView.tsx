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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { ModFileSections, groupModFiles } from "@/components/mod/ModFileSections";
import { DependencyPanel } from "@/components/deps/DependencyPanel";
import type { DownloadProgress, InstalledMod, ModDetail, ModFileInfo, Profile } from "@/lib/nexus/types";
import { formatBytes, formatDate, formatNumber, formatRelativeDate } from "@/lib/utils";

export const MOD_DETAIL_TABS = ["overview", "about", "files"] as const;
export type ModDetailTab = (typeof MOD_DETAIL_TABS)[number];

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
}

export function ModDetailView({
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
}: ModDetailViewProps) {
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

      <section className="relative overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-secondary)] shadow-[var(--shadow-lg)]">
        <div className="relative aspect-[21/9] min-h-[200px] max-h-[420px] w-full overflow-hidden" data-focus-group="gallery">
          {gallery.length > 0 ? (
            <img
              src={gallery[selectedScreenshot]}
              alt={detail.name}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-[var(--color-muted)]">
              <ImageIcon className="h-10 w-10 opacity-50" />
              <span>No preview image</span>
            </div>
          )}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[var(--color-background)] via-[var(--color-background)]/60 to-transparent" />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[var(--color-background)]/80 via-transparent to-transparent" />

          {gallery.length > 1 && (
            <>
              <button
                type="button"
                onClick={onPrevScreenshot}
                className="focusable absolute left-3 top-1/2 z-10 -translate-y-1/2 rounded-full border border-white/10 bg-black/40 p-2.5 backdrop-blur-sm transition hover:bg-black/60"
                data-focusable="true"
                aria-label="Previous image"
              >
                <ChevronLeft className="h-5 w-5 text-white" />
              </button>
              <button
                type="button"
                onClick={onNextScreenshot}
                className="focusable absolute right-3 top-1/2 z-10 -translate-y-1/2 rounded-full border border-white/10 bg-black/40 p-2.5 backdrop-blur-sm transition hover:bg-black/60"
                data-focusable="true"
                aria-label="Next image"
              >
                <ChevronRight className="h-5 w-5 text-white" />
              </button>
              <p className="absolute right-3 top-3 rounded-lg bg-black/50 px-2 py-1 text-xs text-white/90 backdrop-blur-sm">
                L2/R2 gallery
              </p>
            </>
          )}
        </div>

        <div className="relative -mt-16 space-y-4 px-6 pb-6 pt-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="muted">{detail.category}</Badge>
            <Badge variant="muted">v{detail.version}</Badge>
            {detail.adult_content && <Badge variant="nsfw">Adult content</Badge>}
            {installedMod && (
              <Badge variant="success" className="gap-1">
                <Package className="h-3 w-3" />
                In library
              </Badge>
            )}
          </div>

          <div className="max-w-3xl">
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{detail.name}</h1>
            {detail.summary && (
              <p className="mt-2 text-lg leading-relaxed text-[var(--color-muted)]">{detail.summary}</p>
            )}
          </div>

          <div className="flex flex-wrap gap-3">
            <MetricPill icon={Heart} label={formatNumber(detail.endorsements)} />
            <MetricPill icon={Download} label={formatNumber(detail.mod_downloads)} />
            <MetricPill icon={User} label={detail.author} />
            <MetricPill label={formatRelativeDate(detail.updated_timestamp)} />
          </div>

          {gallery.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin" data-scroll-pane>
              {gallery.map((url, index) => (
                <button
                  key={`${url}-${index}`}
                  type="button"
                  onClick={() => onSelectScreenshot(index)}
                  className={`focusable shrink-0 overflow-hidden rounded-lg border-2 transition ${
                    selectedScreenshot === index
                      ? "border-[var(--color-primary)] ring-2 ring-[var(--color-primary)]/30"
                      : "border-transparent opacity-70 hover:opacity-100"
                  }`}
                  data-focusable="true"
                  aria-label={`Screenshot ${index + 1}`}
                >
                  <img src={url} alt="" className="h-16 w-28 object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
        <div className="min-w-0">
          <Tabs value={activeTab} onValueChange={(v) => onTabChange(v as ModDetailTab)}>
            <TabsList className="mb-6 w-full justify-start overflow-x-auto">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="about">About</TabsTrigger>
              <TabsTrigger value="files">Files ({files.length})</TabsTrigger>
            </TabsList>

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
                    >
                      Read full description
                    </Button>
                  )}
                </Card>
              )}

              <Card className="p-5">
                <h2 className="mb-4 text-lg font-semibold">Details</h2>
                <dl className="grid gap-4 sm:grid-cols-2">
                  <DetailRow label="Author" value={detail.author} />
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

              {activeDownloads.length > 0 && (
                <Card className="space-y-3 p-4">
                  <h4 className="font-semibold">Active downloads</h4>
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
              )}

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
                  <Button
                    className="w-full"
                    loading={downloading}
                    disabled={downloading}
                    onClick={() => onDownload(primaryFile)}
                    data-focusable="true"
                  >
                    <Download className="h-4 w-4" />
                    Download
                  </Button>
                  <Button
                    variant="secondary"
                    className="w-full"
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
                <Button variant="outline" size="sm" className="w-full">
                  <Eye className="h-4 w-4" />
                  Preview
                </Button>
              </Link>
              <Button variant="outline" size="sm" onClick={onOpenNexus} data-focusable="true">
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
      </div>
    </div>
  );
}

function MetricPill({
  icon: Icon,
  label,
}: {
  icon?: ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-card)]/80 px-3 py-1.5 text-sm backdrop-blur-sm">
      {Icon && <Icon className="h-3.5 w-3.5 text-[var(--color-muted)]" />}
      <span className="font-medium">{label}</span>
    </span>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-[var(--color-muted)]">{label}</dt>
      <dd className="mt-1 font-medium">{value}</dd>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Package } from "lucide-react";
import { AppDialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/commands";
import type { InstallOptions, InstallPreview, ModFileInfo, Profile } from "@/lib/nexus/types";
import { modFileDownloadName } from "@/lib/nexus/types";

interface ModInstallDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: Profile;
  modId: number;
  modName: string;
  file: ModFileInfo;
  archivePathOverride?: string;
  onInstalled?: () => void;
}

function displayInstallPath(fullPath: string, gamePath: string) {
  const normalizedGame = gamePath.replace(/\\/g, "/").replace(/\/$/, "");
  const normalizedPath = fullPath.replace(/\\/g, "/");
  if (normalizedPath.startsWith(`${normalizedGame}/`)) {
    return normalizedPath.slice(normalizedGame.length + 1);
  }
  return fullPath;
}

export function ModInstallDialog({
  open,
  onOpenChange,
  profile,
  modId,
  modName,
  file,
  archivePathOverride,
  onInstalled,
}: ModInstallDialogProps) {
  const [archivePath, setArchivePath] = useState("");
  const [preview, setPreview] = useState<InstallPreview | null>(null);
  const [strategy, setStrategy] = useState("auto");
  const [enableMod, setEnableMod] = useState(true);
  const [overwriteFiles, setOverwriteFiles] = useState(false);
  const [loading, setLoading] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPreview = async (nextStrategy: string, resolvedPath: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.previewModInstall({
        profileId: profile.id,
        archivePath: resolvedPath,
        modName,
        strategy: nextStrategy,
      });
      setPreview(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPreview(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;

    setStrategy("auto");
    setEnableMod(true);
    setOverwriteFiles(false);
    setPreview(null);
    setError(null);

    const prepare = async () => {
      setLoading(true);
      try {
        let resolved = archivePathOverride ?? "";
        if (!resolved) {
          const match = await api.resolveModArchivePath(
            profile.staging_path,
            modFileDownloadName(file)
          );
          resolved = match.path;
        }
        setArchivePath(resolved);
        await loadPreview("auto", resolved);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setArchivePath("");
        setPreview(null);
        setLoading(false);
      }
    };

    prepare();
  }, [open, archivePathOverride, file.file_id, file.file_name, file.name, modName, profile.id, profile.staging_path]);

  const handleStrategyChange = (next: string) => {
    setStrategy(next);
    if (archivePath) loadPreview(next, archivePath);
  };

  const installPaths = useMemo(() => {
    if (!preview) return [];
    const source =
      preview.deploy_files.length > 0
        ? preview.deploy_files
        : preview.entries.map((entry) => entry.path);
    return source.map((path) => displayInstallPath(path, profile.game_path));
  }, [preview, profile.game_path]);

  const install = async () => {
    if (!archivePath) return;
    setInstalling(true);
    setError(null);
    try {
      const options: InstallOptions = {
        strategy,
        enable_mod: enableMod,
        overwrite_files: overwriteFiles,
      };
      await api.installModFromArchive({
        profileId: profile.id,
        modName,
        nexusModId: modId,
        nexusFileId: file.file_id,
        archivePath,
        options,
      });
      onInstalled?.();
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setInstalling(false);
    }
  };

  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Install: ${modName}`}
      description={`${file.name} · v${file.version}`}
      className="max-w-3xl"
    >
      <div className="space-y-5">
        {archivePath && (
          <p className="rounded-lg bg-[var(--color-secondary)] p-3 font-mono text-xs break-all text-[var(--color-muted)]">
            Archive: {archivePath}
          </p>
        )}

        <div>
          <label className="mb-2 block text-sm font-medium">Install method</label>
          <select
            value={strategy}
            onChange={(e) => handleStrategyChange(e.target.value)}
            className="focusable h-14 w-full rounded-xl border-2 border-[var(--color-border)] bg-[var(--color-card)] px-4 text-lg"
            data-focusable="true"
            disabled={loading || !preview}
          >
            {(preview?.strategies ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        {preview && (
          <div
            className={
              preview.plan.requires_confirmation
                ? "rounded-xl border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10 p-4"
                : "rounded-xl border border-[var(--color-success)]/40 bg-[var(--color-success)]/10 p-4"
            }
          >
            <div className="flex items-start gap-3">
              {preview.plan.requires_confirmation ? (
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-warning)]" />
              ) : (
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-success)]" />
              )}
              <div className="space-y-1">
                <p className="font-medium">
                  {preview.plan.requires_confirmation ? "Quick check recommended" : "Ready to install"}
                </p>
                <p className="text-sm text-[var(--color-muted)]">{preview.plan.description}</p>
                <p className="text-sm text-[var(--color-muted)]">
                  Destination:{" "}
                  <span className="font-mono text-xs">{displayInstallPath(preview.plan.target, profile.game_path)}</span>
                </p>
                {preview.archive_folders.length > 0 && (
                  <p className="text-sm text-[var(--color-muted)]">
                    Archive contains: {preview.archive_folders.slice(0, 4).join(", ")}
                    {preview.archive_folders.length > 4 ? "…" : ""}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--color-border)] p-4">
            <input
              type="checkbox"
              checked={enableMod}
              onChange={(e) => setEnableMod(e.target.checked)}
              className="mt-1 h-5 w-5 accent-[var(--color-primary)]"
            />
            <div>
              <p className="font-medium">Enable after install</p>
              <p className="text-sm text-[var(--color-muted)]">Mark mod as active in your library</p>
            </div>
          </label>
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--color-border)] p-4">
            <input
              type="checkbox"
              checked={overwriteFiles}
              onChange={(e) => setOverwriteFiles(e.target.checked)}
              className="mt-1 h-5 w-5 accent-[var(--color-primary)]"
            />
            <div>
              <p className="font-medium">Overwrite existing files</p>
              <p className="text-sm text-[var(--color-muted)]">
                Replace files that already exist at the target path
              </p>
            </div>
          </label>
        </div>

        {preview && (
          <div className="rounded-xl border border-[var(--color-border)] p-4">
            <div className="mb-2 flex items-center gap-2">
              <Package className="h-5 w-5" />
              <span className="font-medium">{preview.file_count} files will be deployed</span>
            </div>
            {preview.skipped_existing > 0 && (
              <p className="mb-2 text-sm text-[var(--color-warning)]">
                {preview.skipped_existing} file(s) already exist in Data/ and will be skipped unless
                you enable overwrite.
              </p>
            )}
            <div className="max-h-40 overflow-auto text-sm text-[var(--color-muted)] scrollbar-thin">
              {installPaths.slice(0, 30).map((path) => (
                <div key={path} className="truncate font-mono text-xs">
                  {path}
                </div>
              ))}
              {installPaths.length > 30 && (
                <p className="mt-2">…and {installPaths.length - 30} more</p>
              )}
            </div>
          </div>
        )}

        {preview && preview.conflicts.length > 0 && (
          <div className="rounded-xl border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10 p-4">
            <div className="mb-2 flex items-center gap-2 text-[var(--color-warning)]">
              <AlertTriangle className="h-5 w-5" />
              <span className="font-medium">{preview.conflicts.length} potential conflicts</span>
            </div>
            <div className="max-h-32 space-y-1 overflow-auto text-sm scrollbar-thin">
              {preview.conflicts.slice(0, 10).map((c) => (
                <p key={c.path} className="font-mono text-xs">
                  {c.path} — used by {c.existing_mod}
                </p>
              ))}
            </div>
          </div>
        )}

        {error && (
          <p className="rounded-xl bg-[var(--color-danger)]/10 p-3 text-sm text-[var(--color-danger)]">
            {error}
          </p>
        )}

        <div className="flex gap-3">
          <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="lg"
            className="flex-1"
            onClick={install}
            disabled={loading || installing || !preview || !archivePath}
          >
            {installing ? "Installing..." : loading ? "Analyzing..." : "Confirm Install"}
          </Button>
        </div>
      </div>
    </AppDialog>
  );
}

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatBytes } from "@/lib/utils";
import { modFileDownloadName, type ModFileInfo } from "@/lib/nexus/types";

const HIDDEN_CATEGORIES = new Set(["REMOVED", "ARCHIVED"]);
const MAIN_CATEGORIES = new Set(["MAIN", "UPDATE"]);

export function groupModFiles(files: ModFileInfo[]) {
  const visible = files.filter(
    (f) => !HIDDEN_CATEGORIES.has(f.category_name.toUpperCase())
  );

  const mainFiles = visible.filter(
    (f) => f.is_primary || MAIN_CATEGORIES.has(f.category_name.toUpperCase())
  );
  const mainIds = new Set(mainFiles.map((f) => f.file_id));
  const otherFiles = visible.filter((f) => !mainIds.has(f.file_id));

  return { mainFiles, otherFiles };
}

interface ModFileSectionsProps {
  files: ModFileInfo[];
  isPremium: boolean;
  downloading: boolean;
  onDownload: (file: ModFileInfo) => void;
  onBrowserDownload: (file: ModFileInfo) => void;
  onInstall: (file: ModFileInfo) => void;
}

export function ModFileSections({
  files,
  isPremium,
  downloading,
  onDownload,
  onBrowserDownload,
  onInstall,
}: ModFileSectionsProps) {
  const { mainFiles, otherFiles } = groupModFiles(files);

  if (mainFiles.length === 0 && otherFiles.length === 0) {
    return <p className="text-[var(--color-muted)]">No files listed for this mod.</p>;
  }

  return (
    <div className="space-y-8">
      {mainFiles.length > 0 && (
        <section>
          <h3 className="mb-1 text-lg font-semibold">Main files</h3>
          <p className="mb-4 text-sm text-[var(--color-muted)]">
            Primary mod archives and updates — install these first.
          </p>
          <div className="space-y-3">
            {mainFiles.map((f) => (
              <ModFileRow
                key={f.file_id}
                file={f}
                isPremium={isPremium}
                downloading={downloading}
                onDownload={onDownload}
                onBrowserDownload={onBrowserDownload}
                onInstall={onInstall}
              />
            ))}
          </div>
        </section>
      )}

      {otherFiles.length > 0 && (
        <section>
          <h3 className="mb-1 text-lg font-semibold">Optional & other files</h3>
          <p className="mb-4 text-sm text-[var(--color-muted)]">
            Optional patches, resources, older versions, and extras.
          </p>
          <div className="space-y-3">
            {otherFiles.map((f) => (
              <ModFileRow
                key={f.file_id}
                file={f}
                isPremium={isPremium}
                downloading={downloading}
                onDownload={onDownload}
                onBrowserDownload={onBrowserDownload}
                onInstall={onInstall}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function ModFileRow({
  file,
  isPremium,
  downloading,
  onDownload,
  onBrowserDownload,
  onInstall,
}: {
  file: ModFileInfo;
  isPremium: boolean;
  downloading: boolean;
  onDownload: (file: ModFileInfo) => void;
  onBrowserDownload: (file: ModFileInfo) => void;
  onInstall: (file: ModFileInfo) => void;
}) {
  const archiveName = modFileDownloadName(file);

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4 shadow-[var(--shadow-sm)] sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <p className="font-semibold leading-snug">{file.name}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Badge variant="muted">v{file.version}</Badge>
          <Badge variant="muted">{file.category_name || "Uncategorized"}</Badge>
          {file.is_primary && <Badge variant="default">Primary</Badge>}
          <Badge variant="muted">{formatBytes(file.size_kb * 1024)}</Badge>
        </div>
        {archiveName !== file.name && (
          <p className="mt-2 truncate text-xs text-[var(--color-muted)]">{archiveName}</p>
        )}
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        {isPremium ? (
          <Button
            size="sm"
            variant="secondary"
            disabled={downloading}
            onClick={() => onDownload(file)}
          >
            Download
          </Button>
        ) : (
          <Button size="sm" variant="secondary" onClick={() => onBrowserDownload(file)}>
            Download (browser)
          </Button>
        )}
        <Button size="sm" onClick={() => onInstall(file)}>
          Install...
        </Button>
      </div>
    </div>
  );
}

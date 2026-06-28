import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatBytes, cn } from "@/lib/utils";
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
  deckMode?: boolean;
}

export function ModFileSections({
  files,
  isPremium,
  downloading,
  onDownload,
  onBrowserDownload,
  onInstall,
  deckMode = false,
}: ModFileSectionsProps) {
  const { mainFiles, otherFiles } = groupModFiles(files);

  if (mainFiles.length === 0 && otherFiles.length === 0) {
    return <p className="text-[var(--color-muted)]">No files listed for this mod.</p>;
  }

  return (
    <div className="space-y-8">
      {mainFiles.length > 0 && (
        <section>
          <h3 className={deckMode ? "mb-1 text-xl font-semibold" : "mb-1 text-lg font-semibold"}>Main files</h3>
          <p className={cn("mb-4 text-[var(--color-muted)]", deckMode ? "text-base" : "text-sm")}>
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
                deckMode={deckMode}
              />
            ))}
          </div>
        </section>
      )}

      {otherFiles.length > 0 && (
        <section>
          <h3 className={deckMode ? "mb-1 text-xl font-semibold" : "mb-1 text-lg font-semibold"}>Optional & other files</h3>
          <p className={cn("mb-4 text-[var(--color-muted)]", deckMode ? "text-base" : "text-sm")}>
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
                deckMode={deckMode}
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
  deckMode = false,
}: {
  file: ModFileInfo;
  isPremium: boolean;
  downloading: boolean;
  onDownload: (file: ModFileInfo) => void;
  onBrowserDownload: (file: ModFileInfo) => void;
  onInstall: (file: ModFileInfo) => void;
  deckMode?: boolean;
}) {
  const archiveName = modFileDownloadName(file);
  const btnSize = deckMode ? "lg" : "sm";
  const btnClass = deckMode ? "min-h-[52px] flex-1 text-base sm:flex-none" : undefined;

  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-[var(--shadow-sm)]",
        deckMode ? "p-5" : "p-4 sm:flex-row sm:items-center sm:justify-between"
      )}
      data-focusable="true"
    >
      <div className="min-w-0 flex-1">
        <p className={cn("font-semibold leading-snug", deckMode && "text-lg")}>{file.name}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Badge variant="muted" className={deckMode ? "text-sm" : undefined}>v{file.version}</Badge>
          <Badge variant="muted" className={deckMode ? "text-sm" : undefined}>{file.category_name || "Uncategorized"}</Badge>
          {file.is_primary && <Badge variant="default">Primary</Badge>}
          <Badge variant="muted" className={deckMode ? "text-sm" : undefined}>{formatBytes(file.size_kb * 1024)}</Badge>
        </div>
        {archiveName !== file.name && (
          <p className={cn("mt-2 truncate text-[var(--color-muted)]", deckMode ? "text-sm" : "text-xs")}>{archiveName}</p>
        )}
      </div>
      <div className={cn("flex shrink-0 gap-2", deckMode ? "flex-row" : "flex-wrap")}>
        {isPremium ? (
          <Button
            size={btnSize}
            variant="secondary"
            className={btnClass}
            disabled={downloading}
            onClick={() => onDownload(file)}
            data-focusable="true"
          >
            Download
          </Button>
        ) : (
          <Button
            size={btnSize}
            variant="secondary"
            className={btnClass}
            onClick={() => onBrowserDownload(file)}
            data-focusable="true"
          >
            Get file
          </Button>
        )}
        <Button size={btnSize} className={btnClass} onClick={() => onInstall(file)} data-focusable="true">
          Install
        </Button>
      </div>
    </div>
  );
}

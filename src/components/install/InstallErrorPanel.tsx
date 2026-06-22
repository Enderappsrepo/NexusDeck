import { AlertTriangle, ClipboardCopy, Download, FileText } from "lucide-react";
import { useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/commands";

interface InstallErrorPanelProps {
  error: string;
  logPath?: string | null;
  archivePath?: string;
  onRetry?: () => void;
  onDismiss?: () => void;
}

function troubleshootingHint(error: string): string {
  if (error.includes("FOMOD_SELECTION_EMPTY") || error.includes("FOMOD selections")) {
    return "Try different install options in the FOMOD wizard, or enable overwrite if files already exist.";
  }
  if (error.includes("Permission denied")) {
    return "Close the game and any tools using mod files, then retry. On Linux, check folder permissions.";
  }
  if (error.includes("Archive error") || error.includes("Extract failed")) {
    return "Re-download the mod and check the log for archive format details.";
  }
  if (error.includes("Proton prefix")) {
    return "Launch the game once through Steam to create a Proton prefix, then retry.";
  }
  if (error.includes("No files were found")) {
    return "The archive layout may not match Fallout 4. Try a different install method on the review screen.";
  }
  return "Export the log and include it when reporting the issue.";
}

export function InstallErrorPanel({
  error,
  logPath,
  archivePath,
  onRetry,
  onDismiss,
}: InstallErrorPanelProps) {
  const [exporting, setExporting] = useState(false);
  const [fullLog, setFullLog] = useState<string | null>(null);
  const hint = troubleshootingHint(error);

  const handleViewLog = async () => {
    if (!logPath) return;
    try {
      const content = await api.readInstallLog(logPath);
      setFullLog(content);
    } catch {
      setFullLog("(Could not read log file)");
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const dest = await save({
        defaultPath: "nexusdeck-install-logs.zip",
        filters: [{ name: "Zip archive", extensions: ["zip"] }],
      });
      if (!dest) return;
      await api.exportInstallLogsTo({
        destPath: dest,
        lastN: 10,
        includeArchive: archivePath ?? null,
      });
    } finally {
      setExporting(false);
    }
  };

  const copyLogPath = () => {
    if (logPath) void navigator.clipboard.writeText(logPath);
  };

  return (
    <div className="space-y-4 rounded-xl border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 p-5">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-[var(--color-danger)]" />
        <div className="min-w-0 space-y-2">
          <p className="font-semibold text-[var(--color-danger)]">Installation failed</p>
          <p className="text-sm whitespace-pre-wrap">{error.split("\n\nFull log:")[0]}</p>
          <p className="text-sm text-[var(--color-muted)]">{hint}</p>
          {logPath && (
            <p className="truncate font-mono text-xs text-[var(--color-muted)]">{logPath}</p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {onRetry && (
          <Button variant="primary" onClick={onRetry} data-focusable="true">
            Try again
          </Button>
        )}
        {logPath && (
          <>
            <Button variant="secondary" onClick={() => void handleViewLog()} data-focusable="true">
              <FileText className="mr-2 h-4 w-4" />
              View full log
            </Button>
            <Button
              variant="secondary"
              onClick={copyLogPath}
              data-focusable="true"
            >
              <ClipboardCopy className="mr-2 h-4 w-4" />
              Copy log path
            </Button>
          </>
        )}
        <Button
          variant="outline"
          onClick={() => void handleExport()}
          disabled={exporting}
          data-focusable="true"
        >
          <Download className="mr-2 h-4 w-4" />
          {exporting ? "Exporting…" : "Export logs"}
        </Button>
        {onDismiss && (
          <Button variant="ghost" onClick={onDismiss} data-focusable="true">
            Close
          </Button>
        )}
      </div>

      {fullLog !== null && (
        <pre className="max-h-64 overflow-auto rounded-lg bg-[var(--color-secondary)] p-3 text-xs scrollbar-thin">
          {fullLog}
        </pre>
      )}
    </div>
  );
}

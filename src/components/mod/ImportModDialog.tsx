import { useEffect, useState } from "react";
import { open as pickFile } from "@tauri-apps/plugin-dialog";
import { FolderOpen, FlaskConical } from "lucide-react";
import { AppDialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ModInstallDialog } from "@/components/mod/ModInstallDialog";
import { api } from "@/lib/commands";
import { formatBytes } from "@/lib/utils";
import type { ModFileInfo, Profile, StagingFile } from "@/lib/nexus/types";

interface ImportModDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: Profile;
  onImported?: () => void;
}

export function ImportModDialog({
  open,
  onOpenChange,
  profile,
  onImported,
}: ImportModDialogProps) {
  const [files, setFiles] = useState<StagingFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [installTarget, setInstallTarget] = useState<{
    file: ModFileInfo;
    modName: string;
    archivePath: string;
  } | null>(null);

  const refresh = async () => {
    setLoading(true);
    const list = await api.listStagingArchives(profile.staging_path);
    setFiles(list);
    setLoading(false);
  };

  useEffect(() => {
    if (open) refresh();
  }, [open, profile.staging_path]);

  const pickExternalFile = async () => {
    const selected = await pickFile({
      multiple: false,
      filters: [{ name: "Mod archives", extensions: ["zip", "7z", "rar"] }],
    });
    if (!selected || typeof selected !== "string") return;

    const name = selected.split(/[/\\]/).pop() ?? "imported_mod.zip";
    setInstallTarget({
      modName: name.replace(/\.(zip|7z|rar)$/i, ""),
      archivePath: selected,
      file: {
        file_id: 0,
        name,
        file_name: name,
        version: "manual",
        category_name: "Imported",
        is_primary: true,
        size_kb: 0,
      },
    });
  };

  const runPractice = async () => {
    setLoading(true);
    try {
      const practice = await api.createPracticeMod(profile.id);
      await refresh();
      setInstallTarget({
        modName: "NexusDeck Practice Mod",
        archivePath: practice.path,
        file: {
          file_id: 0,
          name: practice.name,
          file_name: practice.name,
          version: "practice",
          category_name: "Test",
          is_primary: true,
          size_kb: Math.ceil(practice.size / 1024),
        },
      });
    } finally {
      setLoading(false);
    }
  };

  const selectStagingFile = (f: StagingFile) => {
    setInstallTarget({
      modName: f.name.replace(/\.(zip|7z|rar)$/i, ""),
      archivePath: f.path,
      file: {
        file_id: 0,
        name: f.name,
        file_name: f.name,
        version: "manual",
        category_name: "Staging",
        is_primary: true,
        size_kb: Math.ceil(f.size / 1024),
      },
    });
  };

  return (
    <>
      <AppDialog
        open={open && !installTarget}
        onOpenChange={onOpenChange}
        title="Import mod archive"
        description="Install mods without Premium by using files you've downloaded manually or a practice test mod."
      >
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" onClick={runPractice} disabled={loading}>
              <FlaskConical className="h-5 w-5" />
              Create practice mod
            </Button>
            <Button variant="outline" onClick={pickExternalFile}>
              <FolderOpen className="h-5 w-5" />
              Pick file...
            </Button>
            <Button variant="ghost" onClick={refresh} disabled={loading}>
              Refresh
            </Button>
          </div>

          <p className="text-sm text-[var(--color-muted)]">
            Staging folder: <span className="font-mono text-xs">{profile.staging_path}</span>
          </p>

          {files.length === 0 ? (
            <p className="text-sm text-[var(--color-muted)]">
              No archives in staging yet. Download a mod from Nexus in your browser, save it here,
              or use Create practice mod to test the install flow.
            </p>
          ) : (
            <div className="max-h-64 space-y-2 overflow-auto scrollbar-thin">
              {files.map((f) => (
                <button
                  key={f.path}
                  type="button"
                  className="focusable flex w-full items-center justify-between rounded-xl border border-[var(--color-border)] p-4 text-left hover:border-[var(--color-primary)]"
                  data-focusable="true"
                  onClick={() => selectStagingFile(f)}
                >
                  <span className="font-medium">{f.name}</span>
                  <span className="text-sm text-[var(--color-muted)]">{formatBytes(f.size)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </AppDialog>

      {installTarget && (
        <ModInstallDialog
          open={!!installTarget}
          onOpenChange={(o) => {
            if (!o) setInstallTarget(null);
          }}
          profile={profile}
          modId={0}
          modName={installTarget.modName}
          file={installTarget.file}
          archivePathOverride={installTarget.archivePath}
          onInstalled={() => {
            setInstallTarget(null);
            onOpenChange(false);
            onImported?.();
          }}
        />
      )}
    </>
  );
}

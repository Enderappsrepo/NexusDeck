import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useGamesStore } from "@/stores";
import { api } from "@/lib/commands";
import { ArchiveFileTree } from "@/components/preview/ArchiveFileTree";
import { TexturePreview } from "@/components/preview/TexturePreview";
import type { PreviewFileResult, PreviewNode } from "@/lib/nexus/types";
import { modFileDownloadName } from "@/lib/nexus/types";

export const Route = createFileRoute("/games/$domain/preview/$modId")({
  component: PreviewPage,
});

function PreviewPage() {
  const { domain, modId: modIdParam } = useParams({
    from: "/games/$domain/preview/$modId",
  });
  const modId = Number(modIdParam);
  const { getProfile } = useGamesStore();
  const profile = getProfile(domain);

  const [archiveName, setArchiveName] = useState<string | null>(null);
  const [tree, setTree] = useState<PreviewNode[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewFileResult | null>(null);
  const [loadingTree, setLoadingTree] = useState(true);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile || !modId) return;
    setLoadingTree(true);
    setError(null);
    api
      .getModFiles(domain, modId)
      .then((files) => {
        const primary = files.find((f) => f.is_primary) ?? files[0];
        if (!primary) throw new Error("No files found for this mod");
        const name = modFileDownloadName(primary);
        setArchiveName(name);
        return api.getArchiveFileTree(profile.id, name);
      })
      .then(setTree)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoadingTree(false));
  }, [profile, domain, modId]);

  const handleSelect = async (path: string, previewable: boolean) => {
    if (!profile || !archiveName) return;
    setSelectedPath(path);
    if (!previewable) {
      setPreview(null);
      return;
    }
    setLoadingPreview(true);
    try {
      const result = await api.previewArchiveFile(profile.id, archiveName, path);
      setPreview(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingPreview(false);
    }
  };

  if (!profile) {
    return <p className="text-[var(--color-muted)]">Set up this game first.</p>;
  }

  return (
    <div className="mx-auto max-w-6xl" data-scroll-pane>
      <Link
        to="/games/$domain/mods/$modId"
        params={{ domain, modId: modIdParam }}
        className="focusable mb-6 inline-flex items-center gap-2 text-[var(--color-muted)] hover:text-white"
        data-focusable="true"
      >
        <ArrowLeft className="h-5 w-5" />
        Back to mod
      </Link>

      <h1 className="mb-2 text-3xl font-bold">Archive Preview</h1>
      {archiveName && (
        <p className="mb-6 text-sm text-[var(--color-muted)]">{archiveName}</p>
      )}

      {error && (
        <p className="mb-4 rounded-xl bg-[var(--color-danger)]/10 p-4 text-[var(--color-danger)]">
          {error}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div data-scroll-pane>
          <h2 className="mb-3 font-semibold">File tree</h2>
          {loadingTree ? (
            <p className="text-[var(--color-muted)]">Loading archive...</p>
          ) : (
            <ArchiveFileTree
              nodes={tree}
              selectedPath={selectedPath}
              onSelect={handleSelect}
            />
          )}
        </div>
        <div data-scroll-pane>
          <h2 className="mb-3 font-semibold">Texture preview</h2>
          <TexturePreview preview={preview} loading={loadingPreview} />
        </div>
      </div>
    </div>
  );
}

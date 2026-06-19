import { useMemo } from "react";
import type { PreviewFileResult } from "@/lib/nexus/types";

interface TexturePreviewProps {
  preview: PreviewFileResult | null;
  loading?: boolean;
}

export function TexturePreview({ preview, loading }: TexturePreviewProps) {
  const src = useMemo(() => {
    if (!preview?.data?.length) return null;
    const bytes = new Uint8Array(preview.data);
    const blob = new Blob([bytes], { type: preview.mime_type || "image/png" });
    return URL.createObjectURL(blob);
  }, [preview]);

  if (loading) {
    return (
      <div className="flex aspect-square items-center justify-center rounded-xl bg-[var(--color-secondary)] text-[var(--color-muted)]">
        Loading preview...
      </div>
    );
  }

  if (!preview || !src) {
    return (
      <div className="flex aspect-square items-center justify-center rounded-xl bg-[var(--color-secondary)] text-[var(--color-muted)]">
        Select a previewable file
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-black/30">
      <img
        src={src}
        alt={preview.path}
        className="max-h-96 w-full object-contain"
        onLoad={() => {
          if (src) URL.revokeObjectURL(src);
        }}
      />
      <p className="truncate p-2 text-xs text-[var(--color-muted)]">{preview.path}</p>
    </div>
  );
}

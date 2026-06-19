import { useState } from "react";
import { ChevronDown, ChevronRight, File, Folder, ImageIcon } from "lucide-react";
import type { PreviewNode } from "@/lib/nexus/types";
import { cn, formatBytes } from "@/lib/utils";

interface ArchiveFileTreeProps {
  nodes: PreviewNode[];
  selectedPath: string | null;
  onSelect: (path: string, previewable: boolean) => void;
}

export function ArchiveFileTree({ nodes, selectedPath, onSelect }: ArchiveFileTreeProps) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-2">
      {nodes.map((node) => (
        <TreeNode
          key={node.path}
          node={node}
          depth={0}
          selectedPath={selectedPath}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

function TreeNode({
  node,
  depth,
  selectedPath,
  onSelect,
}: {
  node: PreviewNode;
  depth: number;
  selectedPath: string | null;
  onSelect: (path: string, previewable: boolean) => void;
}) {
  const [open, setOpen] = useState(depth < 2);
  const selected = selectedPath === node.path;

  if (node.is_dir) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className={cn(
            "focusable flex min-h-[40px] w-full items-center gap-2 rounded-lg px-2 text-left hover:bg-[var(--color-secondary)]",
            selected && "bg-[var(--color-primary)]/10"
          )}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          data-focusable="true"
        >
          {open ? (
            <ChevronDown className="h-4 w-4 shrink-0" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0" />
          )}
          <Folder className="h-4 w-4 shrink-0 text-[var(--color-warning)]" />
          <span className="truncate">{node.name}</span>
        </button>
        {open &&
          node.children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              onSelect={onSelect}
            />
          ))}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onSelect(node.path, node.previewable)}
      className={cn(
        "focusable flex min-h-[40px] w-full items-center gap-2 rounded-lg px-2 text-left hover:bg-[var(--color-secondary)]",
        selected && "bg-[var(--color-primary)]/15"
      )}
      style={{ paddingLeft: `${depth * 16 + 28}px` }}
      data-focusable="true"
    >
      {node.previewable ? (
        <ImageIcon className="h-4 w-4 shrink-0 text-[var(--color-primary)]" />
      ) : (
        <File className="h-4 w-4 shrink-0 text-[var(--color-muted)]" />
      )}
      <span className="min-w-0 flex-1 truncate">{node.name}</span>
      <span className="shrink-0 text-xs text-[var(--color-muted)]">
        {formatBytes(node.size)}
      </span>
    </button>
  );
}

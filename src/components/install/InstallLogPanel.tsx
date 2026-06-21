import { ChevronDown, ChevronUp, ScrollText } from "lucide-react";
import { useState } from "react";
import type { InstallLogLine } from "@/hooks/useInstallLogger";
import { cn } from "@/lib/utils";

interface InstallLogPanelProps {
  lines: InstallLogLine[];
  className?: string;
  defaultOpen?: boolean;
}

function levelColor(level: InstallLogLine["level"]) {
  switch (level) {
    case "ERROR":
      return "text-[var(--color-danger)]";
    case "WARN":
      return "text-[var(--color-warning)]";
    case "DEBUG":
      return "text-[var(--color-muted)]";
    default:
      return "text-[var(--color-foreground)]";
  }
}

export function InstallLogPanel({ lines, className, defaultOpen = false }: InstallLogPanelProps) {
  const [open, setOpen] = useState(defaultOpen);

  if (lines.length === 0) return null;

  return (
    <div className={cn("rounded-xl border border-[var(--color-border)]", className)}>
      <button
        type="button"
        className="focusable flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
        onClick={() => setOpen((v) => !v)}
        data-focusable="true"
      >
        <span className="flex items-center gap-2 text-sm font-medium">
          <ScrollText className="h-4 w-4" />
          Install log ({lines.length})
        </span>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {open && (
        <div className="max-h-48 overflow-auto border-t border-[var(--color-border)] px-4 py-2 font-mono text-xs scrollbar-thin">
          {lines.map((line, i) => (
            <div key={`${line.ts}-${i}`} className={levelColor(line.level)}>
              <span className="text-[var(--color-muted)]">[{line.phase}]</span> {line.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

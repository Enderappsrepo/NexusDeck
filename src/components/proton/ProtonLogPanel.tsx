import { ChevronDown, ChevronUp, Copy, ScrollText } from "lucide-react";
import { useState } from "react";
import type { ProtonLogLine } from "@/hooks/useProtonLogger";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ProtonLogPanelProps {
  lines: ProtonLogLine[];
  logPath?: string | null;
  className?: string;
  defaultOpen?: boolean;
  title?: string;
}

function levelColor(level: ProtonLogLine["level"]) {
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

export function ProtonLogPanel({
  lines,
  logPath,
  className,
  defaultOpen = false,
  title = "Proton log",
}: ProtonLogPanelProps) {
  const [open, setOpen] = useState(defaultOpen);

  if (lines.length === 0 && !logPath) return null;

  const copyLog = async () => {
    const text = lines
      .map((line) => `[${line.ts}] ${line.level} [${line.category}] [${line.phase}] ${line.message}`)
      .join("\n");
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* ignore */
    }
  };

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
          {title} {lines.length > 0 ? `(${lines.length})` : ""}
        </span>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {open && (
        <div className="border-t border-[var(--color-border)] px-4 py-2">
          {logPath && (
            <p className="mb-2 font-mono text-xs text-[var(--color-muted)] break-all">{logPath}</p>
          )}
          {lines.length > 0 && (
            <>
              <div className="mb-2 flex justify-end">
                <Button variant="ghost" size="sm" onClick={() => void copyLog()} data-focusable="true">
                  <Copy className="h-3.5 w-3.5" />
                  Copy
                </Button>
              </div>
              <div className="max-h-56 overflow-auto font-mono text-xs scrollbar-thin">
                {lines.map((line, i) => (
                  <div key={`${line.ts}-${i}`} className={levelColor(line.level)}>
                    <span className="text-[var(--color-muted)]">
                      [{line.category}/{line.phase}]
                    </span>{" "}
                    {line.message}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

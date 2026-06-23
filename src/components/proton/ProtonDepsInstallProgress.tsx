import { useEffect, useMemo, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { CheckCircle2, Circle, Loader2, XCircle } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import type { ProtonDepProgress } from "@/lib/autofix-types";
import { cn } from "@/lib/utils";

type PkgStatus = "pending" | "preparing" | "installing" | "done" | "failed";

const PACKAGE_LABELS: Record<string, string> = {
  vcrun2019: "Visual C++ 2019",
  dotnet48: ".NET Framework 4.8",
  d3dx9_43: "DirectX 9",
  xact: "XACT (audio)",
  xact_64: "XACT 64-bit",
  xinput: "XInput (gamepad)",
};

function labelFor(pkg: string) {
  return PACKAGE_LABELS[pkg] ?? pkg;
}

export function ProtonDepsInstallProgress({
  active,
  packages,
}: {
  active: boolean;
  packages: string[];
}) {
  const [statusByPkg, setStatusByPkg] = useState<Record<string, PkgStatus>>({});
  const [current, setCurrent] = useState<ProtonDepProgress | null>(null);

  useEffect(() => {
    if (!active) {
      setStatusByPkg({});
      setCurrent(null);
      return;
    }

    const initial = Object.fromEntries(packages.map((p) => [p, "pending" as PkgStatus]));
    setStatusByPkg(initial);
    setCurrent({ package: "", index: 0, total: packages.length, status: "preparing" });

    let unlisten: (() => void) | undefined;
    void listen<ProtonDepProgress>("proton-deps:progress", (event) => {
      const p = event.payload;
      setCurrent(p);

      if (p.status === "preparing") {
        return;
      }

      if (!p.package) return;

      setStatusByPkg((prev) => {
        const next = { ...prev };
        if (p.status === "installing") {
          next[p.package] = "installing";
        } else if (p.status === "done") {
          next[p.package] = "done";
        } else if (p.status === "failed") {
          next[p.package] = "failed";
        }
        return next;
      });
    }).then((fn) => {
      unlisten = fn;
    });

    return () => unlisten?.();
  }, [active, packages]);

  const doneCount = useMemo(
    () => packages.filter((p) => statusByPkg[p] === "done").length,
    [packages, statusByPkg]
  );

  const failedCount = useMemo(
    () => packages.filter((p) => statusByPkg[p] === "failed").length,
    [packages, statusByPkg]
  );

  const progressValue =
    packages.length === 0 ? 0 : Math.round((doneCount / packages.length) * 100);

  if (!active || packages.length === 0) {
    return null;
  }

  const headline =
    current?.status === "preparing"
      ? "Preparing Proton prefix and Protontricks access…"
      : current?.package
        ? `Installing ${labelFor(current.package)} (${current.index}/${current.total})…`
        : `Installing dependencies (${doneCount}/${packages.length})…`;

  return (
    <div className="space-y-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-secondary)]/30 p-4">
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[var(--color-primary)]" />
          {headline}
        </div>
        <Progress value={progressValue} className="h-2" />
        <p className="text-xs text-[var(--color-muted)]">
          {doneCount} of {packages.length} complete
          {failedCount > 0 ? ` · ${failedCount} failed` : ""}
          {" · .NET can take 10+ minutes — keep NexusDeck open."}
        </p>
      </div>

      <ul className="space-y-1.5">
        {packages.map((pkg) => {
          const status = statusByPkg[pkg] ?? "pending";
          return (
            <li
              key={pkg}
              className={cn(
                "flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm",
                status === "installing" && "bg-[var(--color-primary)]/10",
                status === "failed" && "bg-[var(--color-danger)]/10"
              )}
            >
              {status === "done" && (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--color-success)]" />
              )}
              {status === "failed" && (
                <XCircle className="h-4 w-4 shrink-0 text-[var(--color-danger)]" />
              )}
              {status === "installing" && (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[var(--color-primary)]" />
              )}
              {(status === "pending" || status === "preparing") && (
                <Circle className="h-4 w-4 shrink-0 text-[var(--color-muted)]" />
              )}
              <span className="min-w-0 flex-1 truncate">{labelFor(pkg)}</span>
              <span className="shrink-0 font-mono text-xs text-[var(--color-muted)]">{pkg}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

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

function formatElapsed(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
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
  const [activity, setActivity] = useState<string[]>([]);
  const [elapsedSec, setElapsedSec] = useState(0);

  useEffect(() => {
    if (!active) {
      setStatusByPkg({});
      setCurrent(null);
      setActivity([]);
      setElapsedSec(0);
      return;
    }

    const initial = Object.fromEntries(packages.map((p) => [p, "pending" as PkgStatus]));
    setStatusByPkg(initial);
    setCurrent({
      package: "",
      index: 0,
      total: packages.length,
      status: "preparing",
      detail: "Starting Proton dependency install…",
    });
    setActivity(["Starting Proton dependency install…"]);

    const tick = window.setInterval(() => setElapsedSec((s) => s + 1), 1000);

    let unlisten: (() => void) | undefined;
    void listen<ProtonDepProgress>("proton-deps:progress", (event) => {
      const p = event.payload;
      setCurrent(p);

      if (p.detail) {
        setActivity((prev) => [...prev.slice(-7), p.detail!]);
      } else if (p.status === "installing" && p.package) {
        setActivity((prev) => [
          ...prev.slice(-7),
          `Installing ${labelFor(p.package)} (${p.index}/${p.total})…`,
        ]);
      }

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

    return () => {
      window.clearInterval(tick);
      unlisten?.();
    };
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
    current?.detail ??
    (current?.status === "preparing"
      ? "Preparing Proton prefix and Protontricks access…"
      : current?.package
        ? `Installing ${labelFor(current.package)} (${current.index}/${current.total})…`
        : `Installing dependencies (${doneCount}/${packages.length})…`);

  const prepareStuck = current?.status === "preparing" && elapsedSec >= 45;

  return (
    <div className="space-y-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-secondary)]/30 p-4">
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[var(--color-primary)]" />
          <span className="min-w-0 flex-1">{headline}</span>
          <span className="shrink-0 font-mono text-xs text-[var(--color-muted)]">
            {formatElapsed(elapsedSec)}
          </span>
        </div>
        <Progress value={progressValue} className="h-2" />
        <p className="text-xs text-[var(--color-muted)]">
          {doneCount} of {packages.length} complete
          {failedCount > 0 ? ` · ${failedCount} failed` : ""}
          {current?.status === "installing"
            ? " · .NET can take 10+ minutes — keep NexusDeck open."
            : ""}
        </p>
        {prepareStuck && (
          <div className="space-y-1 text-xs text-[var(--color-warning)]">
            <p>
              Prepare is taking longer than expected
              {current?.detail ? `: ${current.detail}` : ""}.
            </p>
            {elapsedSec >= 90 && (
              <p>
                If this does not finish soon, cancel and ensure Protontricks is installed (Discover
                → Protontricks), launch the game once from Steam, then retry.
              </p>
            )}
          </div>
        )}
      </div>

      {activity.length > 0 && (
        <div className="rounded-lg bg-[var(--color-secondary)]/50 px-3 py-2 font-mono text-xs text-[var(--color-muted)]">
          {activity.map((line, i) => (
            <div
              key={`${line}-${i}`}
              className={i === activity.length - 1 ? "text-[var(--color-foreground)]" : ""}
            >
              {line}
            </div>
          ))}
        </div>
      )}

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

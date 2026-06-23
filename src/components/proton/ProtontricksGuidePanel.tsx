import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Circle, Copy, ExternalLink, Loader2, Terminal, Wrench } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProtonDepsInstallProgress } from "@/components/proton/ProtonDepsInstallProgress";
import { ProtonLogPanel } from "@/components/proton/ProtonLogPanel";
import { api } from "@/lib/commands";
import { useProtonLogger } from "@/hooks/useProtonLogger";
import { useWakeLock } from "@/hooks/useWakeLock";
import { PROTON_DEPS_PACKAGES, type DepsVerification, type ProtontricksHealth, type ProtontricksInfo } from "@/lib/autofix-types";
import { cn, withTimeout } from "@/lib/utils";

const PROTON_DEPS_GAMES = new Set(["fallout4", "skyrimspecialedition"]);

const INSTALL_STEPS = [
  "Switch to Desktop Mode (Power → Switch to Desktop).",
  "Open Discover and search for Protontricks, then Install.",
  "Or in Konsole: flatpak install flathub com.github.Matoking.protontricks",
  "Return to NexusDeck and tap Check again below.",
];

const DETECT_TIMEOUT_MS = 20_000;
const HEALTH_TIMEOUT_MS = 25_000;

const FALLBACK_PT: ProtontricksInfo = {
  available: false,
  command: "",
  message: "Protontricks detection timed out. Tap Check again or install from Discover.",
  kind: "none",
};

export function ProtontricksGuidePanel({
  gameDomain,
  profileId,
  compact = false,
  autoVerify = true,
  checkHealthOnMount = true,
}: {
  gameDomain?: string | null;
  profileId?: string | null;
  compact?: boolean;
  /** When false, skip automatic dependency verification on mount (Settings page). */
  autoVerify?: boolean;
  /** When false, skip the slow shortcuts health probe on mount (Settings). */
  checkHealthOnMount?: boolean;
}) {
  const [status, setStatus] = useState<ProtontricksInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingStage, setLoadingStage] = useState("Detecting Protontricks…");
  const [healthLoading, setHealthLoading] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [verification, setVerification] = useState<DepsVerification | null>(null);
  const [generatingDiag, setGeneratingDiag] = useState(false);
  const [health, setHealth] = useState<ProtontricksHealth | null>(null);
  const [fixing, setFixing] = useState(false);
  const [logPath, setLogPath] = useState<string | null>(null);
  const loggingActive = installing || fixing || generatingDiag;
  const { lines: protonLogLines, clear: clearProtonLog } = useProtonLogger(loggingActive);
  useWakeLock(installing || fixing, "Installing Proton dependencies");

  const runHealthCheck = useCallback(async () => {
    setHealthLoading(true);
    setLoadingStage("Checking Steam shortcuts & Protontricks…");
    try {
      const healthResult = await withTimeout(
        api.checkProtontricksHealth().catch(() => null),
        HEALTH_TIMEOUT_MS,
        null
      );
      setHealth(healthResult);
      if (!healthResult) {
        setMessage((m) => m ?? "Health check timed out — Protontricks may still work. Tap Check again.");
      }
    } finally {
      setHealthLoading(false);
    }
  }, []);

  const refresh = useCallback(
    async (includeHealth = checkHealthOnMount) => {
      setLoading(true);
      setLoadingStage("Detecting Protontricks…");
      setMessage(null);
      try {
        const pt = await withTimeout(api.detectProtontricks(), DETECT_TIMEOUT_MS, FALLBACK_PT);
        setStatus(pt);
      } catch {
        setStatus(FALLBACK_PT);
      } finally {
        setLoading(false);
      }

      if (includeHealth) {
        await runHealthCheck();
      }
    },
    [checkHealthOnMount, runHealthCheck]
  );

  const verifyDeps = useCallback(async () => {
    if (!gameDomain || !PROTON_DEPS_GAMES.has(gameDomain)) return;
    try {
      setVerification(
        await withTimeout(
          api.verifyProtonDeps(profileId ?? undefined, gameDomain),
          HEALTH_TIMEOUT_MS,
          null
        )
      );
    } catch (e) {
      setVerification(null);
      setMessage(e instanceof Error ? e.message : String(e));
    }
  }, [profileId, gameDomain]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (status?.available && autoVerify) void verifyDeps();
  }, [status?.available, verifyDeps, autoVerify]);

  const installPackages = useMemo(() => {
    if (!gameDomain) return [];
    if (verification && (verification.present.length > 0 || verification.missing.length > 0)) {
      return [...verification.present, ...verification.missing];
    }
    return PROTON_DEPS_PACKAGES[gameDomain] ?? [];
  }, [gameDomain, verification]);

  const installDeps = async () => {
    if (!gameDomain || !PROTON_DEPS_GAMES.has(gameDomain)) return;
    setInstalling(true);
    setLogPath(null);
    clearProtonLog();
    setMessage("Installing Proton dependencies… this can take 5–15 minutes. Keep NexusDeck open.");
    try {
      const result = await api.installProtonDeps(gameDomain, false, profileId ?? undefined);
      setMessage(result.message);
      if (result.log_path) setLogPath(result.log_path);
      await refresh(true);
      void verifyDeps();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setInstalling(false);
    }
  };

  const fixProtontricks = async () => {
    setFixing(true);
    setMessage(null);
    setLogPath(null);
    clearProtonLog();
    try {
      const result = await api.fixProtontricksError();
      setMessage(result.message);
      if (result.log_path) setLogPath(result.log_path);
      await refresh(true);
      void verifyDeps();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setFixing(false);
    }
  };

  const copyInstallCommand = async () => {
    try {
      await navigator.clipboard.writeText(
        "flatpak install flathub com.github.Matoking.protontricks"
      );
      setMessage("Install command copied.");
    } catch {
      setMessage("Could not copy to clipboard.");
    }
  };

  const copyDiagnostics = async () => {
    if (!profileId) return;
    setGeneratingDiag(true);
    try {
      const report = await api.collectProtonDiagnostics(profileId);
      await navigator.clipboard.writeText(report);
      setMessage("Diagnostics copied to clipboard — paste them back to share your setup.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setGeneratingDiag(false);
    }
  };

  if (loading && !status) {
    return (
      <Card>
        <CardContent className="flex flex-col gap-2 p-5 text-sm text-[var(--color-muted)]">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            {loadingStage}
          </div>
          <p className="text-xs">Host checks can take up to 20 seconds on Steam Deck.</p>
        </CardContent>
      </Card>
    );
  }

  const available = status?.available ?? false;

  return (
    <Card>
      <CardHeader className={compact ? "pb-2" : undefined}>
        <CardTitle className="flex flex-wrap items-center gap-2 text-lg">
          <Terminal className="h-5 w-5 text-[var(--color-primary)]" />
          Protontricks
          {available ? (
            <Badge variant="success">Detected</Badge>
          ) : (
            <Badge variant="warning">Not detected</Badge>
          )}
          {healthLoading && (
            <Badge variant="muted" className="gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              Checking shortcuts…
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-[var(--color-muted)]">
          Protontricks installs Windows libraries (.NET, Visual C++, DirectX) into your
          game&apos;s Proton prefix. NexusDeck needs it on the{" "}
          <strong>host</strong> (outside the app sandbox) for F4SE/SKSE, BodySlide, and
          voice audio fixes.
        </p>

        {status && (
          <p className="text-sm">
            {status.message}
            {status.command && available && (
              <span className="mt-1 block font-mono text-xs text-[var(--color-muted)]">
                {status.command}
              </span>
            )}
          </p>
        )}

        {health && !health.healthy && (
          <div className="rounded-xl border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10 p-3 text-sm">
            <p className="font-medium text-[var(--color-warning)]">Protontricks problem detected</p>
            <p className="mt-1 text-[var(--color-muted)]">{health.message}</p>
            {health.shortcuts_path && (
              <p className="mt-2 font-mono text-xs text-[var(--color-muted)] break-all">
                {health.shortcuts_path}
              </p>
            )}
            <Button
              size="sm"
              className="mt-3"
              onClick={() => void fixProtontricks()}
              loading={fixing}
              disabled={fixing}
              data-focusable="true"
            >
              <Wrench className="h-4 w-4" />
              Fix Protontricks crash
            </Button>
            <p className="mt-2 text-xs text-[var(--color-muted)]">
              Fully exit Steam first if the fix does not help. Non-Steam shortcuts may need to be
              re-added afterward.
            </p>
          </div>
        )}

        {health?.healthy && health.protontricks_responds && (
          <p className="flex items-center gap-2 text-sm text-[var(--color-success)]">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            Protontricks responds and Steam shortcuts look valid.
          </p>
        )}

        {!checkHealthOnMount && !health && !healthLoading && (
          <p className="text-xs text-[var(--color-muted)]">
            Shortcut health check skipped on load. Tap Check again to run the full Protontricks test.
          </p>
        )}

        {!available && (
          <ol className="space-y-2 text-sm">
            {INSTALL_STEPS.map((step) => (
              <li key={step} className="flex gap-2">
                <Circle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-muted)]" />
                <span>{step}</span>
              </li>
            ))}
          </ol>
        )}

        {available && (
          <ul className="space-y-1 text-sm text-[var(--color-muted)]">
            <li className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-[var(--color-success)]" />
              Protontricks is ready on your Steam Deck
            </li>
            {gameDomain && PROTON_DEPS_GAMES.has(gameDomain) && !verification && (
              <li className="flex items-center gap-2">
                <Circle className="h-4 w-4" />
                Next: install game dependencies for your Proton prefix
              </li>
            )}
          </ul>
        )}

        {available && verification && gameDomain && PROTON_DEPS_GAMES.has(gameDomain) && (
          <div className="rounded-xl border border-[var(--color-border)] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">Game dependencies</p>
              {verification.satisfied ? (
                <Badge variant="success">All installed</Badge>
              ) : (
                <Badge variant="warning">{verification.missing.length} missing</Badge>
              )}
            </div>
            <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-3">
              {verification.present.map((pkg) => (
                <li key={pkg} className="flex items-center gap-1.5 text-[var(--color-muted)]">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[var(--color-success)]" />
                  {pkg}
                </li>
              ))}
              {verification.missing.map((pkg) => (
                <li key={pkg} className="flex items-center gap-1.5 text-[var(--color-warning)]">
                  <Circle className="h-3.5 w-3.5 shrink-0" />
                  {pkg}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-[var(--color-muted)]">
              {verification.checked_against_prefix
                ? "Verified against your Proton prefix."
                : "Based on the last install record — protontricks couldn't query the prefix directly."}
            </p>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void refresh(true);
              void verifyDeps();
            }}
            loading={loading || healthLoading}
            data-focusable="true"
          >
            Check again
          </Button>
          {health && !health.healthy && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void fixProtontricks()}
              loading={fixing}
              disabled={fixing}
              data-focusable="true"
            >
              <Wrench className="h-4 w-4" />
              Fix crash
            </Button>
          )}
          {profileId && (
            <Button
              variant="outline"
              size="sm"
              onClick={copyDiagnostics}
              loading={generatingDiag}
              data-focusable="true"
            >
              <Copy className="h-4 w-4" />
              Copy diagnostics
            </Button>
          )}
          {!available && (
            <>
              <Button variant="secondary" size="sm" onClick={copyInstallCommand} data-focusable="true">
                Copy install command
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void openUrl("https://flathub.org/apps/com.github.Matoking.protontricks")}
                data-focusable="true"
              >
                <ExternalLink className="h-4 w-4" />
                Flathub page
              </Button>
            </>
          )}
          {available && gameDomain && PROTON_DEPS_GAMES.has(gameDomain) && (
            <Button size="sm" onClick={installDeps} loading={installing} disabled={installing} data-focusable="true">
              {installing ? "Installing…" : "Install game dependencies"}
            </Button>
          )}
        </div>

        {installing && (
          <p className="text-xs text-[var(--color-muted)]">
            Screen will stay awake during install — keep NexusDeck in the foreground if possible.
          </p>
        )}

        {installing && (
          <ProtonDepsInstallProgress active={installing} packages={installPackages} />
        )}

        <ProtonLogPanel
          lines={protonLogLines}
          logPath={logPath}
          defaultOpen={loggingActive}
          title="Proton operation log"
        />

        {message && !installing && (
          <p className={cn("text-sm whitespace-pre-wrap", available ? "text-[var(--color-muted)]" : "text-[var(--color-warning)]")}>
            {message}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

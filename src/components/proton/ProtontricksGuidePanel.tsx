import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Circle, ExternalLink, Loader2, Terminal } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/commands";
import type { ProtontricksInfo } from "@/lib/autofix-types";
import { cn } from "@/lib/utils";

const PROTON_DEPS_GAMES = new Set(["fallout4", "skyrimspecialedition"]);

const INSTALL_STEPS = [
  "Switch to Desktop Mode (Power → Switch to Desktop).",
  "Open Discover and search for Protontricks, then Install.",
  "Or in Konsole: flatpak install flathub com.github.Matoking.protontricks",
  "Return to NexusDeck and tap Check again below.",
];

export function ProtontricksGuidePanel({
  gameDomain,
  profileId,
  compact = false,
}: {
  gameDomain?: string | null;
  profileId?: string | null;
  compact?: boolean;
}) {
  const [status, setStatus] = useState<ProtontricksInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setLoading(true);
    api
      .detectProtontricks()
      .then(setStatus)
      .catch(() =>
        setStatus({
          available: false,
          command: "",
          message: "Could not detect Protontricks.",
          kind: "none",
        })
      )
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const installDeps = async () => {
    if (!gameDomain || !PROTON_DEPS_GAMES.has(gameDomain)) return;
    setInstalling(true);
    setMessage("Installing Proton dependencies… this can take 5–15 minutes. Keep NexusDeck open.");
    try {
      const result = await api.installProtonDeps(gameDomain, false, profileId ?? undefined);
      setMessage(result.message);
      refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setInstalling(false);
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

  if (loading && !status) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 p-5 text-sm text-[var(--color-muted)]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Checking Protontricks…
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

        {!available && (
          <ol className="space-y-2 text-sm">
            {INSTALL_STEPS.map((step, i) => (
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
            {gameDomain && PROTON_DEPS_GAMES.has(gameDomain) && (
              <li className="flex items-center gap-2">
                <Circle className="h-4 w-4" />
                Next: install game dependencies for your Proton prefix
              </li>
            )}
          </ul>
        )}

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={refresh} data-focusable="true">
            Check again
          </Button>
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
            <Button size="sm" onClick={installDeps} loading={installing} data-focusable="true">
              {installing ? "Installing… (5–15 min)" : "Install game dependencies"}
            </Button>
          )}
        </div>

        {message && (
          <p className={cn("text-sm whitespace-pre-wrap", available ? "text-[var(--color-muted)]" : "text-[var(--color-warning)]")}>
            {message}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

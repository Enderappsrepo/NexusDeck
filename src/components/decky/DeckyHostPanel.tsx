import { useCallback, useEffect, useState } from "react";
import { Download, RefreshCw, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/commands";
import type { DeckyHostInstallResult, DeckyHostStatus } from "@/lib/nexus/types";
import { useLaunchStore } from "@/stores/launchStore";

export function DeckyHostPanel() {
  const { addToast } = useLaunchStore();
  const [status, setStatus] = useState<DeckyHostStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState(false);
  const [lastResult, setLastResult] = useState<DeckyHostInstallResult | null>(null);

  const refresh = useCallback(() => {
    setLoading(true);
    api
      .getDeckyHostStatus()
      .then(setStatus)
      .catch(() =>
        setStatus({
          available: false,
          decky_installed: false,
          decky_home: null,
          plugin_installed: false,
          plugin_version: null,
          plugin_loader_active: false,
          bundled_plugin_present: false,
          message: "Could not read Decky status.",
        })
      )
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const install = async () => {
    setInstalling(true);
    setLastResult(null);
    try {
      const result = await api.installDeckyHostPlugin();
      setLastResult(result);
      if (result.success) {
        addToast("Decky plugin installed", result.message, "success");
      } else {
        addToast("Manual install needed", result.message, "warning");
      }
      refresh();
    } catch (e) {
      addToast(
        "Install failed",
        e instanceof Error ? e.message : String(e),
        "error"
      );
    } finally {
      setInstalling(false);
    }
  };

  if (loading && !status) {
    return null;
  }

  if (!status?.available) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <Wrench className="h-5 w-5 text-[var(--color-primary)]" />
          Decky Host plugin
          {status.plugin_installed && <Badge variant="success">Installed</Badge>}
          {status.decky_installed && !status.plugin_installed && (
            <Badge variant="warning">Not installed</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-[var(--color-muted)]">
          Optional companion for Gaming Mode. Runs on the host (outside Flatpak) to
          check protontricks, Steam paths, and launch NexusDeck with fewer sandbox
          issues. Requires{" "}
          <a
            className="text-[var(--color-primary)] underline"
            href="https://github.com/SteamDeckHomebrew/decky-loader"
            target="_blank"
            rel="noreferrer"
          >
            Decky Loader
          </a>
          .
        </p>
        <p className="text-sm">{status.message}</p>
        {status.decky_home && (
          <p className="text-xs text-[var(--color-muted)]">
            Decky home: <span className="font-mono">{status.decky_home}</span>
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {!status.plugin_installed && status.decky_installed && status.bundled_plugin_present && (
            <Button onClick={install} loading={installing} data-focusable="true">
              <Download className="h-4 w-4" />
              Install NexusDeck Host
            </Button>
          )}
          {status.plugin_installed && (
            <Button variant="secondary" onClick={install} loading={installing} data-focusable="true">
              <RefreshCw className="h-4 w-4" />
              Reinstall / update
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={refresh} data-focusable="true">
            Refresh status
          </Button>
        </div>
        {!status.decky_installed && (
          <div className="rounded-xl bg-[var(--color-secondary)] p-4 text-sm text-[var(--color-muted)]">
            <p className="font-medium text-[var(--color-foreground)]">Install Decky first</p>
            <p className="mt-1">
              In Desktop Mode, open Konsole and run the Decky install script from the
              Decky Loader README, then return here.
            </p>
          </div>
        )}
        {lastResult && lastResult.manual_steps.length > 0 && (
          <div className="rounded-xl border border-[var(--color-border)] p-4 text-sm">
            <p className="font-medium">Next steps</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-[var(--color-muted)]">
              {lastResult.manual_steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </div>
        )}
        <p className="text-xs text-[var(--color-muted)]">
          After install, open Quick Access → NexusDeck for health checks and support
          log export. You may be prompted for your password when Decky&apos;s plugins
          folder is read-only.
        </p>
      </CardContent>
    </Card>
  );
}

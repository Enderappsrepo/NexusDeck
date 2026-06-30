import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Smartphone, Gamepad2, Layers, Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCompanionStore } from "@/stores/companionStore";
import { useGamesStore } from "@/stores";

const INSTALL_LABEL: Record<string, string> = {
  downloading: "Downloading",
  extracting: "Extracting",
  installing: "Installing",
  ready: "Awaiting options on phone",
};

/**
 * Shown on the device while a phone companion is actively connected. The user
 * can launch games and manage mods from here, or dismiss it to use the full
 * app (installs are driven from the phone while connected). A small reopenable
 * chip stays in the corner after dismissal.
 */
export function CompanionConnectedOverlay() {
  const connected = useCompanionStore((s) => s.connected);
  const dismissed = useCompanionStore((s) => s.dismissed);
  const host = useCompanionStore((s) => s.host);
  const activeInstall = useCompanionStore((s) => s.activeInstall);
  const dismiss = useCompanionStore((s) => s.dismiss);
  const reopen = useCompanionStore((s) => s.reopen);
  const profiles = useGamesStore((s) => s.profiles);
  const loadProfiles = useGamesStore((s) => s.loadProfiles);
  const navigate = useNavigate();

  useEffect(() => {
    if (connected) void loadProfiles();
  }, [connected, loadProfiles]);

  if (!connected) return null;

  if (dismissed) {
    return (
      <button
        type="button"
        onClick={reopen}
        data-focusable="true"
        className="focusable fixed bottom-24 right-4 z-[60] inline-flex items-center gap-2 rounded-full border border-[var(--color-primary)]/40 bg-[var(--color-card)] px-4 py-2.5 text-sm font-semibold text-[var(--color-foreground)] shadow-[var(--shadow-glow)]"
        style={{ paddingBottom: "calc(0.625rem + env(safe-area-inset-bottom, 0px))" }}
      >
        <Smartphone className="h-4 w-4 text-[var(--color-primary)]" />
        Companion connected
      </button>
    );
  }

  const launch = (domain: string) => {
    navigate({ to: "/games/$domain", params: { domain } });
    dismiss();
  };
  const manage = (domain: string) => {
    navigate({ to: "/games/$domain/library", params: { domain } });
    dismiss();
  };

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label="Connected to companion"
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center"
    >
      <div
        className="flex max-h-[88dvh] w-full max-w-md flex-col gap-4 overflow-y-auto rounded-3xl border border-[var(--color-border-strong)] bg-[var(--color-card)] p-5 shadow-2xl"
        style={{ paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom, 0px))" }}
      >
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--color-primary)]/15 text-[var(--color-primary)]">
            <Smartphone className="h-6 w-6" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-bold text-[var(--color-foreground)]">
              Connected to companion
            </h2>
            <p className="mt-0.5 text-sm text-[var(--color-muted)]">
              {host
                ? `Your phone (${host}) is connected. Browse and install from there.`
                : "Your phone is connected. Browse and install from there."}
            </p>
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss"
            data-focusable="true"
            className="focusable -mr-1 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--color-muted)] hover:bg-[var(--color-card-hover)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {activeInstall && (
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)]/60 p-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-foreground)]">
              <Download className="h-4 w-4 text-[var(--color-primary)]" />
              <span className="min-w-0 flex-1 truncate">{activeInstall.mod_name}</span>
              <span className="shrink-0 text-xs font-medium text-[var(--color-muted)]">
                {INSTALL_LABEL[activeInstall.status] ?? activeInstall.status}
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/40">
              <div
                className="h-full bg-[image:var(--gradient-primary)] transition-all duration-500"
                style={{ width: `${Math.max(4, activeInstall.progress_pct)}%` }}
              />
            </div>
            <p className="mt-1.5 truncate text-xs text-[var(--color-muted)]">
              {activeInstall.message}
            </p>
          </div>
        )}

        <div className="space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--color-muted)]">
            Launch &amp; manage
          </p>
          {profiles.length === 0 ? (
            <p className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)]/50 p-3 text-sm text-[var(--color-muted)]">
              Add a game in NexusDeck to launch and manage it here.
            </p>
          ) : (
            profiles.map((p) => (
              <div
                key={p.id}
                className="flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)]/50 p-2.5"
              >
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--color-foreground)]">
                  {p.name}
                </span>
                <Button size="sm" variant="default" onClick={() => launch(p.game_domain)}>
                  <Gamepad2 className="h-4 w-4" />
                  Launch
                </Button>
                <Button size="sm" variant="outline" onClick={() => manage(p.game_domain)}>
                  <Layers className="h-4 w-4" />
                  Manage
                </Button>
              </div>
            ))
          )}
        </div>

        <p className="text-center text-xs text-[var(--color-muted)]">
          Installs are sent from your phone while connected.
        </p>
        <Button variant="ghost" onClick={dismiss} className="w-full">
          Use this device
        </Button>
      </div>
    </div>
  );
}

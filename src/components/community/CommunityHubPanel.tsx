import { useEffect, useState } from "react";
import { ExternalLink, Flag, Heart, Star } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Link } from "@tanstack/react-router";
import { api } from "@/lib/commands";
import type { TrackedMod, UserEndorsement } from "@/lib/nexus/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface CommunityHubPanelProps {
  gameDomain: string;
  embedded?: boolean;
}

export function CommunityHubPanel({ gameDomain, embedded = false }: CommunityHubPanelProps) {
  const [endorsements, setEndorsements] = useState<UserEndorsement[]>([]);
  const [tracked, setTracked] = useState<TrackedMod[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([api.getUserEndorsements(), api.listTrackedMods()])
      .then(([e, t]) => {
        setEndorsements(e.filter((x) => x.game_domain === gameDomain));
        setTracked(t.filter((x) => x.game_domain === gameDomain));
      })
      .catch(() => {
        setEndorsements([]);
        setTracked([]);
      })
      .finally(() => setLoading(false));
  }, [gameDomain]);

  const openNexusCommunity = () => {
    openUrl(`https://www.nexusmods.com/games/${gameDomain}`);
  };

  const reportIssue = () => {
    openUrl("https://github.com/nexusmods/nexusmods/issues");
  };

  return (
    <div
      className={cn(
        "rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-5",
        !embedded && "mt-8 p-6"
      )}
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--color-muted)]">
          Your endorsements and tracked mods on Nexus.
        </p>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={openNexusCommunity}>
            <ExternalLink className="h-4 w-4" />
            Nexus site
          </Button>
          <Button variant="outline" size="sm" onClick={reportIssue}>
            <Flag className="h-4 w-4" />
            Report issue
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-[var(--color-muted)]">Loading community data...</p>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2">
          <section>
            <div className="mb-2 flex items-center gap-2">
              <Heart className="h-4 w-4 text-[var(--color-danger)]" />
              <span className="font-medium">Your endorsements</span>
              <Badge variant="muted">{endorsements.length}</Badge>
            </div>
            {endorsements.length === 0 ? (
              <p className="text-sm text-[var(--color-muted)]">No endorsements yet.</p>
            ) : (
              <ul className="max-h-40 space-y-1 overflow-y-auto text-sm scrollbar-thin">
                {endorsements.slice(0, 10).map((e) => (
                  <li key={`${e.mod_id}-${e.version}`}>
                    <Link
                      to="/games/$domain/mods/$modId"
                      params={{ domain: e.game_domain, modId: String(e.mod_id) }}
                      className="focusable text-[var(--color-primary)] hover:underline"
                      data-focusable="true"
                    >
                      Mod #{e.mod_id}
                    </Link>
                    <span className="text-[var(--color-muted)]"> v{e.version}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <div className="mb-2 flex items-center gap-2">
              <Star className="h-4 w-4 text-[var(--color-warning)]" />
              <span className="font-medium">Tracked mods</span>
              <Badge variant="muted">{tracked.length}</Badge>
            </div>
            {tracked.length === 0 ? (
              <p className="text-sm text-[var(--color-muted)]">No tracked mods.</p>
            ) : (
              <ul className="max-h-40 space-y-1 overflow-y-auto text-sm scrollbar-thin">
                {tracked.slice(0, 10).map((t) => (
                  <li key={`${t.game_domain}-${t.mod_id}`}>
                    <Link
                      to="/games/$domain/mods/$modId"
                      params={{ domain: t.game_domain, modId: String(t.mod_id) }}
                      className="focusable hover:text-[var(--color-primary)]"
                      data-focusable="true"
                    >
                      {t.name}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

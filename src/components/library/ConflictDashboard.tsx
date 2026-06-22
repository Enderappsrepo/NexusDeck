import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/commands";
import type { ProfileConflictSummary } from "@/lib/nexus/types";

export function ConflictDashboard({
  profileId,
  gameDomain,
}: {
  profileId: string;
  gameDomain: string;
}) {
  const [summary, setSummary] = useState<ProfileConflictSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api
      .scanProfileConflicts(profileId)
      .then(setSummary)
      .catch(() => setSummary(null))
      .finally(() => setLoading(false));
  }, [profileId]);

  if (loading) return null;
  if (!summary || summary.total_conflicts === 0) return null;

  return (
    <Card className="border-[var(--color-warning)]/40 p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="h-5 w-5 text-[var(--color-warning)]" />
            {summary.total_conflicts} file conflict{summary.total_conflicts === 1 ? "" : "s"} across{" "}
            {summary.affected_mods.length} mod{summary.affected_mods.length === 1 ? "" : "s"}
          </p>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            Last mod wins at launch. Disable or reorder conflicting mods in Load Order.
          </p>
        </div>
        <Button variant="secondary" size="sm" asChild data-focusable="true">
          <Link to="/games/$domain/load-order" params={{ domain: gameDomain }}>
            Load Order
          </Link>
        </Button>
      </div>
      <ul className="max-h-40 space-y-1 overflow-y-auto font-mono text-xs scrollbar-thin" data-scroll-pane>
        {summary.conflicts.slice(0, 30).map((c) => (
          <li key={`${c.path}-${c.new_mod}`} className="truncate text-[var(--color-muted)]">
            {c.path} — {c.existing_mod} vs {c.new_mod}
          </li>
        ))}
      </ul>
    </Card>
  );
}

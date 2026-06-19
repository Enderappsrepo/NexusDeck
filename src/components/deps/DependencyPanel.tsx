import { Download, Package, RefreshCw } from "lucide-react";
import { useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { useDepsStore } from "@/stores/depsStore";
import { DependencyGraphView } from "./DependencyGraph";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ApiErrorBanner } from "@/components/ui/ApiErrorBanner";
import { EmptyState } from "@/components/ui/EmptyState";
import { TextSkeleton } from "@/components/ui/LoadingSkeleton";
import type { Profile } from "@/lib/nexus/types";

interface DependencyPanelProps {
  profile: Profile;
  modId: number;
  gameDomain: string;
}

export function DependencyPanel({ profile, modId, gameDomain }: DependencyPanelProps) {
  const { graph, loading, queueing, error, resolve, queueMissing, reset } =
    useDepsStore();

  useEffect(() => {
    resolve(profile.id, modId);
    return () => reset();
  }, [profile.id, modId, resolve, reset]);

  return (
    <div className="mt-6 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-semibold">Dependencies</h3>
        {graph && graph.missing_required.length > 0 && (
          <Button
            size="sm"
            disabled={queueing}
            onClick={() => queueMissing(profile.id, modId)}
          >
            <Download className="h-4 w-4" />
            {queueing ? "Queueing..." : "Download missing"}
          </Button>
        )}
      </div>

      {loading && <TextSkeleton lines={2} />}

      {error && (
        <ApiErrorBanner
          context="dependencies"
          error={error}
          onRetry={() => resolve(profile.id, modId)}
        />
      )}

      {graph &&
        graph.missing_required.length === 0 &&
        graph.nodes.every((n) => n.requirements.length === 0) &&
        !error && (
          <EmptyState
            icon={Package}
            title="No dependencies"
            description="This mod does not list any requirements on Nexus."
            className="py-8"
          />
        )}

      {graph && (
        <>
          {graph.missing_required.length > 0 && (
            <div className="mb-4 space-y-2">
              <p className="text-sm font-medium text-[var(--color-warning)]">
                Missing required ({graph.missing_required.length})
              </p>
              {graph.missing_required.map((req) => (
                <div
                  key={req.mod_id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[var(--color-secondary)] p-3"
                >
                  <Link
                    to="/games/$domain/mods/$modId"
                    params={{ domain: req.game_domain, modId: String(req.mod_id) }}
                    className="focusable font-medium hover:text-[var(--color-primary)]"
                    data-focusable="true"
                  >
                    {req.name}
                  </Link>
                  <div className="flex gap-2">
                    {req.installed && <Badge variant="success">Installed</Badge>}
                    {req.downloaded && <Badge variant="muted">Downloaded</Badge>}
                    {!req.installed && !req.downloaded && (
                      <Badge variant="warning">Missing</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {graph.cycles.length > 0 && (
            <p className="mb-4 text-sm text-[var(--color-danger)]">
              Circular dependency detected — review manually.
            </p>
          )}

          <DependencyGraphView nodes={graph.nodes} gameDomain={gameDomain} />
        </>
      )}

      {!loading && !graph && !error && (
        <Button variant="ghost" size="sm" onClick={() => resolve(profile.id, modId)}>
          <RefreshCw className="h-4 w-4" />
          Retry
        </Button>
      )}
    </div>
  );
}

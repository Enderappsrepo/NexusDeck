import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Download } from "lucide-react";
import { useGamesStore } from "@/stores";
import { api } from "@/lib/commands";
import { CollectionInstallDialog } from "@/components/collections/CollectionInstallDialog";
import type { CollectionDetail } from "@/lib/nexus/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ApiErrorBanner } from "@/components/ui/ApiErrorBanner";
import { ListRowSkeleton } from "@/components/ui/LoadingSkeleton";

export const Route = createFileRoute("/games/$domain/collections/$slug")({
  component: CollectionDetailPage,
});

function CollectionDetailPage() {
  const { domain, slug } = useParams({
    from: "/games/$domain/collections/$slug",
  });
  const { getProfile } = useGamesStore();
  const profile = getProfile(domain);
  const [detail, setDetail] = useState<CollectionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [installOpen, setInstallOpen] = useState(false);

  useEffect(() => {
    setLoading(true);
    api
      .getCollectionDetail(domain, slug)
      .then(setDetail)
      .catch((e) => setError(e))
      .finally(() => setLoading(false));
  }, [slug]);

  if (!profile) {
    return <p className="text-[var(--color-muted)]">Set up this game first.</p>;
  }

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        to="/games/$domain/collections"
        params={{ domain }}
        className="focusable mb-6 inline-flex items-center gap-2 text-[var(--color-muted)] hover:text-white"
        data-focusable="true"
      >
        <ArrowLeft className="h-5 w-5" />
        Back to collections
      </Link>

      {loading && <ListRowSkeleton count={5} />}
      {!!error && (
        <ApiErrorBanner
          context="collection-detail"
          error={error}
          onRetry={() => {
            setLoading(true);
            setError(null);
            api
              .getCollectionDetail(domain, slug)
              .then(setDetail)
              .catch(setError)
              .finally(() => setLoading(false));
          }}
        />
      )}

      {detail && (
        <>
          <div className="mb-8 flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-[var(--color-border)] bg-[image:var(--gradient-surface)] p-6 shadow-[var(--shadow-md)]">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">{detail.name}</h1>
              <p className="mt-2 text-[var(--color-muted)]">by {detail.author}</p>
              <Badge variant="muted" className="mt-3">
                {detail.mod_count} mods
              </Badge>
            </div>
            <Button onClick={() => setInstallOpen(true)}>
              <Download className="h-4 w-4" />
              Install collection
            </Button>
          </div>

          <div className="space-y-3">
            {detail.mods.map((mod) => (
              <Card key={mod.mod_id} className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <Link
                      to="/games/$domain/mods/$modId"
                      params={{ domain, modId: String(mod.mod_id) }}
                      className="focusable text-lg font-semibold hover:text-[var(--color-primary)]"
                      data-focusable="true"
                    >
                      {mod.name}
                    </Link>
                    <p className="mt-1 text-sm text-[var(--color-muted)]">v{mod.version}</p>
                  </div>
                  {mod.optional ? (
                    <Badge variant="muted">Optional</Badge>
                  ) : (
                    <Badge variant="success">Required</Badge>
                  )}
                </div>
              </Card>
            ))}
          </div>

          <CollectionInstallDialog
            open={installOpen}
            onOpenChange={setInstallOpen}
            collection={detail}
            profile={profile}
            gameDomain={domain}
          />
        </>
      )}
    </div>
  );
}

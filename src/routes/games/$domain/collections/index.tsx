import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Layers } from "lucide-react";
import { useGamesStore } from "@/stores";
import { api } from "@/lib/commands";
import { CollectionCard } from "@/components/collections/CollectionCard";
import { Button } from "@/components/ui/button";
import { ApiErrorBanner } from "@/components/ui/ApiErrorBanner";
import { EmptyState } from "@/components/ui/EmptyState";
import { ModGridSkeleton } from "@/components/ui/LoadingSkeleton";
import type { CollectionSummary } from "@/lib/nexus/types";

export const Route = createFileRoute("/games/$domain/collections/")({
  component: CollectionsPage,
});

function CollectionsPage() {
  const { domain } = useParams({ from: "/games/$domain/collections/" });
  const { getProfile } = useGamesStore();
  const profile = getProfile(domain);
  const [collections, setCollections] = useState<CollectionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const load = async (offset: number, append: boolean) => {
    try {
      setError(null);
      const batch = await api.listCollections(domain, offset, 24);
      setCollections((prev) => (append ? [...prev, ...batch] : batch));
    } catch (e) {
      setError(e);
      if (!append) setCollections([]);
    }
  };

  useEffect(() => {
    if (!profile) return;
    setLoading(true);
    load(0, false).finally(() => setLoading(false));
  }, [profile, domain]);

  if (!profile) {
    return <p className="text-[var(--color-muted)]">Set up this game first.</p>;
  }

  return (
    <div className="mx-auto max-w-6xl">
      <Link
        to="/games/$domain"
        params={{ domain }}
        className="focusable mb-6 inline-flex items-center gap-2 text-[var(--color-muted)] hover:text-white"
        data-focusable="true"
      >
        <ArrowLeft className="h-5 w-5" />
        Back to game
      </Link>

      <h1 className="mb-6 text-3xl font-bold">Collections</h1>

      {!!error && (
        <ApiErrorBanner
          context="collections"
          error={error}
          onRetry={() => {
            setLoading(true);
            load(0, false).finally(() => setLoading(false));
          }}
          className="mb-6"
        />
      )}

      {loading && <ModGridSkeleton count={6} className="mb-6" />}

      {!loading && !error && collections.length === 0 && (
        <EmptyState
          icon={Layers}
          title="No collections found"
          description="There are no listed collections for this game yet."
        />
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {collections.map((c) => (
          <CollectionCard key={c.slug} collection={c} domain={domain} />
        ))}
      </div>

      {collections.length > 0 && (
        <div className="mt-8 flex justify-center">
          <Button
            variant="secondary"
            disabled={loadingMore}
            onClick={async () => {
              setLoadingMore(true);
              await load(collections.length, true);
              setLoadingMore(false);
            }}
          >
            {loadingMore ? "Loading..." : "Load more"}
          </Button>
        </div>
      )}
    </div>
  );
}

import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ModGridSkeleton } from "@/components/ui/LoadingSkeleton";
import { ModHeroCarousel } from "@/components/home/ModHeroCarousel";
import { ModRowCarousel } from "@/components/home/ModRowCarousel";
import { api } from "@/lib/commands";
import { getUserMessage } from "@/lib/apiError";
import { DEFAULT_FILTERS } from "@/lib/nexus/filters";
import type { ModSummary } from "@/lib/nexus/types";

interface DiscoveryFeeds {
  featured: ModSummary[];
  topEndorsed: ModSummary[];
  mostDownloaded: ModSummary[];
  recentlyUpdated: ModSummary[];
}

const EMPTY_FEEDS: DiscoveryFeeds = {
  featured: [],
  topEndorsed: [],
  mostDownloaded: [],
  recentlyUpdated: [],
};

interface GameModDiscoveryProps {
  domain: string;
  signedIn: boolean;
}

export function GameModDiscovery({ domain, signedIn }: GameModDiscoveryProps) {
  const [feeds, setFeeds] = useState<DiscoveryFeeds>(EMPTY_FEEDS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const loadDiscovery = () => {
    setLoading(true);
    setError(null);

    Promise.all([
      api.searchModsFiltered(domain, "", "endorsements", 0, 12, DEFAULT_FILTERS),
      api.getTrendingMods(domain, 12),
      api.searchModsFiltered(domain, "", "updated", 0, 12, DEFAULT_FILTERS),
    ])
      .then(([endorsedResult, downloaded, updatedResult]) => {
        setFeeds({
          featured: endorsedResult.mods.slice(0, 6),
          topEndorsed: endorsedResult.mods,
          mostDownloaded: downloaded,
          recentlyUpdated: updatedResult.mods,
        });
      })
      .catch((e) => {
        setError(e);
        setFeeds(EMPTY_FEEDS);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadDiscovery();
  }, [domain]);

  const hasAnyMods =
    feeds.featured.length > 0 ||
    feeds.topEndorsed.length > 0 ||
    feeds.mostDownloaded.length > 0 ||
    feeds.recentlyUpdated.length > 0;

  if (loading) {
    return <ModGridSkeleton count={3} />;
  }

  if (!hasAnyMods) {
    return (
      <EmptyState
        icon={Sparkles}
        title="No mods to show"
        description={
          error
            ? getUserMessage("mods", error).userMessage
            : signedIn
              ? "Search above to find mods for this game."
              : "Sign in with your Nexus API key in Settings to browse mods."
        }
        action={
          <div className="flex flex-wrap justify-center gap-2">
            {!!error && (
              <Button variant="secondary" onClick={loadDiscovery}>
                Retry
              </Button>
            )}
            <Link
              to="/games/$domain/mods"
              params={{ domain }}
              search={{ modId: undefined }}
            >
              <Button>Browse all mods</Button>
            </Link>
          </div>
        }
        className="py-10"
      />
    );
  }

  return (
    <div className="space-y-8">
      <ModHeroCarousel mods={feeds.featured} domain={domain} label="Top mods" />

      <ModRowCarousel
        title="Most endorsed"
        subtitle="Community favorites on Nexus"
        mods={feeds.topEndorsed}
        domain={domain}
      />

      <ModRowCarousel
        title="Most downloaded"
        subtitle="Popular installs this month"
        mods={feeds.mostDownloaded}
        domain={domain}
      />

      <ModRowCarousel
        title="Recently updated"
        subtitle="Fresh releases and patches"
        mods={feeds.recentlyUpdated}
        domain={domain}
      />
    </div>
  );
}

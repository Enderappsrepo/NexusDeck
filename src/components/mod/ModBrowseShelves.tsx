import { useEffect, useState } from "react";
import { ModRowCarousel } from "@/components/home/ModRowCarousel";
import { api } from "@/lib/commands";
import { DEFAULT_FILTERS } from "@/lib/nexus/filters";
import type { ModSummary } from "@/lib/nexus/types";

interface ModBrowseShelvesProps {
  domain: string;
  compact?: boolean;
  enabled?: boolean;
}

const SHELF_COUNT = 10;

export function ModBrowseShelves({ domain, compact = false, enabled = true }: ModBrowseShelvesProps) {
  const [endorsed, setEndorsed] = useState<ModSummary[]>([]);
  const [downloaded, setDownloaded] = useState<ModSummary[]>([]);
  const [recent, setRecent] = useState<ModSummary[]>([]);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    Promise.all([
      api.searchModsFiltered(domain, "", "endorsements", 0, SHELF_COUNT, { ...DEFAULT_FILTERS }),
      api.searchModsFiltered(domain, "", "downloads", 0, SHELF_COUNT, { ...DEFAULT_FILTERS }),
      api.searchModsFiltered(
        domain,
        "",
        "created",
        0,
        SHELF_COUNT,
        { ...DEFAULT_FILTERS, updated_since_days: 14 }
      ),
    ])
      .then(([a, b, c]) => {
        if (!active) return;
        setEndorsed(a.mods);
        setDownloaded(b.mods);
        setRecent(c.mods);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [domain, enabled]);

  if (!enabled) return null;

  return (
    <div className="mb-6 space-y-5">
      <ModRowCarousel
        title="Most Endorsed"
        mods={endorsed}
        domain={domain}
        compact={compact}
        sort="endorsements"
      />
      <ModRowCarousel
        title="Most Downloaded"
        mods={downloaded}
        domain={domain}
        compact={compact}
        sort="downloads"
      />
      <ModRowCarousel
        title="Newly Added"
        mods={recent}
        domain={domain}
        compact={compact}
        sort="created"
        filterPatch={{ updated_since_days: 14 }}
      />
    </div>
  );
}

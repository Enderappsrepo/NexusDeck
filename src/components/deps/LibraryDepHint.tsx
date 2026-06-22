import { useEffect, useState } from "react";
import { Link2 } from "lucide-react";
import { api } from "@/lib/commands";
import type { DependencyGraph } from "@/lib/nexus/types";

export function LibraryDepSummary({
  profileId,
  nexusModId,
}: {
  profileId: string;
  nexusModId: number;
}) {
  const [graph, setGraph] = useState<DependencyGraph | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .resolveModDependencies(profileId, nexusModId)
      .then((g) => {
        if (!cancelled) setGraph(g);
      })
      .catch(() => {
        if (!cancelled) setGraph(null);
      });
    return () => {
      cancelled = true;
    };
  }, [profileId, nexusModId]);

  const missing = graph?.missing_required ?? [];
  if (missing.length === 0) return null;

  return (
    <p className="mt-1 flex items-center gap-1 text-xs text-[var(--color-warning)]">
      <Link2 className="h-3 w-3 shrink-0" />
      Needs {missing.length} mod{missing.length === 1 ? "" : "s"}:{" "}
      {missing
        .slice(0, 2)
        .map((m) => m.name)
        .join(", ")}
      {missing.length > 2 ? "…" : ""}
    </p>
  );
}

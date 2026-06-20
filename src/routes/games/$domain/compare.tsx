import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useCompareStore } from "@/stores/compareStore";
import { useGamesStore } from "@/stores";
import { ModCompareView } from "@/components/compare/ModCompareView";
import { api } from "@/lib/commands";
import type { InstalledMod } from "@/lib/nexus/types";

export const Route = createFileRoute("/games/$domain/compare")({
  component: ComparePage,
  validateSearch: (s: Record<string, unknown>) => ({
    modA: typeof s.modA === "string" ? s.modA : undefined,
    modB: typeof s.modB === "string" ? s.modB : undefined,
  }),
});

import { useGamepadTabs } from "@/hooks/useGamepadTabs";

function ComparePage() {
  const { domain } = useParams({ from: "/games/$domain/compare" });
  const { modA, modB } = Route.useSearch();
  const { getProfile } = useGamesStore();
  const profile = getProfile(domain);
  const { result, loading, error, compareInstalled, reset } = useCompareStore();
  const [mods, setMods] = useState<InstalledMod[]>([]);
  const [selectedA, setSelectedA] = useState(modA ?? "");
  const [selectedB, setSelectedB] = useState(modB ?? "");

  useEffect(() => {
    if (profile) {
      api.listInstalledMods(profile.id).then(setMods);
    }
    return () => reset();
  }, [profile, reset]);

  useEffect(() => {
    if (modA) setSelectedA(modA);
    if (modB) setSelectedB(modB);
  }, [modA, modB]);

  const modIds = mods.map((m) => m.id);
  useGamepadTabs(modIds, selectedA || modIds[0] || "", (id) => setSelectedA(id));

  useEffect(() => {
    if (profile && selectedA && selectedB && selectedA !== selectedB) {
      compareInstalled(profile.id, selectedA, selectedB);
    }
  }, [profile, selectedA, selectedB, compareInstalled]);

  if (!profile) {
    return <p className="text-[var(--color-muted)]">Set up this game first.</p>;
  }

  return (
    <div className="mx-auto max-w-5xl">
      <Link
        to="/games/$domain/library"
        params={{ domain }}
        className="focusable mb-6 inline-flex items-center gap-2 text-[var(--color-muted)] hover:text-white"
        data-focusable="true"
      >
        <ArrowLeft className="h-5 w-5" />
        Back to library
      </Link>

      <h1 className="mb-6 text-3xl font-bold">Compare Mods</h1>

      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <label className="space-y-2">
          <span className="text-sm text-[var(--color-muted)]">Mod A</span>
          <select
            value={selectedA}
            onChange={(e) => setSelectedA(e.target.value)}
            className="focusable h-12 w-full rounded-xl border-2 border-[var(--color-border)] bg-[var(--color-surface-1)] px-3 transition-colors focus-visible:border-[var(--color-primary)] focus-visible:shadow-[var(--shadow-focus)] focus-visible:outline-none"
            data-focusable="true"
          >
            <option value="">Select mod...</option>
            {mods.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-2">
          <span className="text-sm text-[var(--color-muted)]">Mod B</span>
          <select
            value={selectedB}
            onChange={(e) => setSelectedB(e.target.value)}
            className="focusable h-12 w-full rounded-xl border-2 border-[var(--color-border)] bg-[var(--color-surface-1)] px-3 transition-colors focus-visible:border-[var(--color-primary)] focus-visible:shadow-[var(--shadow-focus)] focus-visible:outline-none"
            data-focusable="true"
          >
            <option value="">Select mod...</option>
            {mods.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {selectedA && selectedB && selectedA === selectedB && (
        <p className="mb-4 text-[var(--color-warning)]">Select two different mods.</p>
      )}

      {loading && <p className="text-[var(--color-muted)]">Comparing...</p>}
      {error && (
        <p className="mb-4 rounded-xl bg-[var(--color-danger)]/10 p-4 text-[var(--color-danger)]">
          {error}
        </p>
      )}
      {result && <ModCompareView result={result} />}

      {!selectedA || !selectedB ? (
        <p className="text-[var(--color-muted)]">Select two installed mods to compare.</p>
      ) : null}
    </div>
  );
}

import { useEffect, useState } from "react";
import { api } from "@/lib/commands";
import type { LoadOrderState } from "@/lib/nexus/types";
import { LoadOrderIssuesPanel } from "@/components/game/LoadOrderIssuesPanel";

export function LoadOrderBanner({
  profileId,
  gameDomain,
}: {
  profileId: string;
  gameDomain: string;
}) {
  const [state, setState] = useState<LoadOrderState | null>(null);

  useEffect(() => {
    api
      .getLoadOrderState(profileId)
      .then(setState)
      .catch(() => setState(null));
    const onInstalled = () => {
      api.getLoadOrderState(profileId).then(setState).catch(() => setState(null));
    };
    window.addEventListener("nexusdeck-mod-installed", onInstalled);
    return () => window.removeEventListener("nexusdeck-mod-installed", onInstalled);
  }, [profileId]);

  if (!state?.loot_issues?.length) return null;

  return (
    <LoadOrderIssuesPanel
      issues={state.loot_issues}
      gameDomain={gameDomain}
      compact
    />
  );
}

import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/commands";
import type { LoadOrderState } from "@/lib/nexus/types";

interface LoadOrderHealthBadgeProps {
  profileId: string;
  domain: string;
}

export function LoadOrderHealthBadge({ profileId, domain }: LoadOrderHealthBadgeProps) {
  const [state, setState] = useState<LoadOrderState | null>(null);

  useEffect(() => {
    api
      .getLoadOrderState(profileId)
      .then(setState)
      .catch(() => setState(null));
  }, [profileId]);

  if (!state) return null;

  const issues = state.loot_issues?.length ?? 0;
  const enabled = state.mods?.filter((m) => m.enabled).length ?? state.active_plugin_count ?? 0;
  const healthy = issues === 0;

  return (
    <Link
      to="/games/$domain/load-order"
      params={{ domain }}
      className="focusable inline-flex"
      data-focusable="true"
    >
      <Badge variant={healthy ? "success" : "warning"}>
        {healthy
          ? `Load order OK · ${enabled} active`
          : `${issues} LOOT issue${issues === 1 ? "" : "s"}`}
      </Badge>
    </Link>
  );
}

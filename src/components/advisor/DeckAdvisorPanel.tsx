import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { api } from "@/lib/commands";
import type { AdvisorFinding } from "@/lib/nexus/types";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface DeckAdvisorPanelProps {
  profileId: string;
}

const severityIcon = {
  error: AlertTriangle,
  warning: AlertTriangle,
  info: Info,
  success: CheckCircle2,
};

export function DeckAdvisorPanel({ profileId }: DeckAdvisorPanelProps) {
  const [findings, setFindings] = useState<AdvisorFinding[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api
      .analyzeDeckProfile(profileId)
      .then(setFindings)
      .catch(() => setFindings([]))
      .finally(() => setLoading(false));
  }, [profileId]);

  if (loading) {
    return null;
  }

  if (findings.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      <h3 className="text-lg font-semibold">Deck Advisor</h3>
      {findings.map((finding) => {
        const Icon =
          severityIcon[finding.severity as keyof typeof severityIcon] ?? Info;
        return (
          <div
            key={finding.rule_id}
            className={cn(
              "rounded-xl border p-4",
              finding.severity === "error" && "border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10",
              finding.severity === "warning" && "border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10",
              finding.severity !== "error" &&
                finding.severity !== "warning" &&
                "border-[var(--color-border)] bg-[var(--color-card)]"
            )}
          >
            <div className="flex items-start gap-3">
              <Icon className="mt-0.5 h-5 w-5 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant={
                      finding.severity === "error" || finding.severity === "warning"
                        ? "warning"
                        : "muted"
                    }
                  >
                    {finding.severity}
                  </Badge>
                </div>
                <p className="mt-2">{finding.message}</p>
                {finding.deck_tip && (
                  <p className="mt-2 text-sm text-[var(--color-primary)]">
                    Deck tip: {finding.deck_tip}
                  </p>
                )}
                {finding.affected_mods.length > 0 && (
                  <p className="mt-2 text-xs text-[var(--color-muted)]">
                    Affected: {finding.affected_mods.join(", ")}
                  </p>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

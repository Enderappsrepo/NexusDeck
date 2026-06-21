import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { DiagnosticFinding } from "@/lib/autofix-types";

interface FixActionCardProps {
  finding: DiagnosticFinding;
  onApply?: (remedyId: string) => void;
  applying?: boolean;
}

const severityVariant = (severity: string) => {
  switch (severity) {
    case "error":
      return "destructive" as const;
    case "warning":
      return "secondary" as const;
    default:
      return "outline" as const;
  }
};

export function FixActionCard({ finding, onApply, applying }: FixActionCardProps) {
  return (
    <Card className="border-[var(--color-border)]">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={severityVariant(finding.severity)}>{finding.severity}</Badge>
          <CardTitle className="text-base">{finding.id}</CardTitle>
        </div>
        <CardDescription>{finding.message}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {finding.deck_tip && (
          <p className="text-sm text-[var(--color-muted)]">Deck tip: {finding.deck_tip}</p>
        )}
        {finding.remedy_id && onApply && (
          <Button
            size="sm"
            variant={finding.auto_fixable ? "default" : "outline"}
            disabled={applying}
            data-focusable="true"
            onClick={() => onApply(finding.remedy_id!)}
          >
            {finding.auto_fixable ? "Apply fix" : "Run remedy"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

interface DiagnosticReportProps {
  findings: DiagnosticFinding[];
  onApplyFix?: (remedyId: string) => void;
  applyingRemedy?: string | null;
}

export function DiagnosticReport({ findings, onApplyFix, applyingRemedy }: DiagnosticReportProps) {
  if (findings.length === 0) {
    return (
      <p className="rounded-xl bg-[var(--color-secondary)] p-6 text-center text-[var(--color-success)]">
        No issues detected — your setup looks healthy.
      </p>
    );
  }

  const order = ["error", "warning", "info"];
  const sorted = [...findings].sort(
    (a, b) => order.indexOf(a.severity) - order.indexOf(b.severity)
  );

  return (
    <div className="space-y-4">
      {sorted.map((f) => (
        <FixActionCard
          key={f.id}
          finding={f}
          onApply={onApplyFix}
          applying={applyingRemedy === f.remedy_id}
        />
      ))}
    </div>
  );
}

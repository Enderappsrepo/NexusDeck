import { useEffect, useState } from "react";
import { Gauge } from "lucide-react";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/commands";
import type { TextureBudgetReport } from "@/lib/nexus/types";

export function TextureBudgetPanel({ profileId }: { profileId: string }) {
  const [report, setReport] = useState<TextureBudgetReport | null>(null);

  useEffect(() => {
    api.analyzeTextureBudget(profileId).then(setReport).catch(() => setReport(null));
  }, [profileId]);

  if (!report) return null;

  return (
    <Card className="border-[var(--color-warning)]/30 p-4">
      <p className="mb-1 flex items-center gap-2 font-semibold">
        <Gauge className="h-5 w-5" />
        Texture budget (Deck estimate)
      </p>
      <p className="mb-3 text-sm text-[var(--color-muted)]">
        ~{report.estimated_vram_mb} MB est. VRAM · {report.texture_count} textures ·{" "}
        {report.mesh_count} meshes · {report.loose_file_count} loose files
      </p>
      <p className="text-sm text-[var(--color-warning)]">{report.recommendation}</p>
    </Card>
  );
}

import { useState } from "react";
import { ScanSearch } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/commands";
import type { DeployScanResult } from "@/lib/nexus/types";

export function DeployScanPanel({ profileId }: { profileId: string }) {
  const [result, setResult] = useState<DeployScanResult | null>(null);
  const [scanning, setScanning] = useState(false);

  const scan = async () => {
    setScanning(true);
    try {
      setResult(await api.scanDeployFootprint(profileId));
    } finally {
      setScanning(false);
    }
  };

  return (
    <Card className="p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-semibold">Orphan & duplicate scan</p>
          <p className="text-sm text-[var(--color-muted)]">
            Find loose files not owned by any mod and paths deployed by multiple mods.
          </p>
        </div>
        <Button size="sm" loading={scanning} onClick={() => void scan()} data-focusable="true">
          <ScanSearch className="h-4 w-4" />
          Scan Data/
        </Button>
      </div>
      {result && (
        <div className="space-y-3 text-sm">
          <p>
            {result.orphan_count} orphan file{result.orphan_count === 1 ? "" : "s"} ·{" "}
            {result.duplicate_count} duplicate path
            {result.duplicate_count === 1 ? "" : "s"}
          </p>
          {result.duplicate_files.length > 0 && (
            <ul className="max-h-32 overflow-y-auto rounded-lg bg-[var(--color-secondary)] p-2 scrollbar-thin">
              {result.duplicate_files.slice(0, 20).map((d) => (
                <li key={d.path} className="truncate font-mono text-xs">
                  {d.path} ({d.mods.join(", ")})
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}

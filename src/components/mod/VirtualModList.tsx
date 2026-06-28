import { useEffect, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ModListRow } from "@/components/mod/ModListRow";
import type { ModSummary } from "@/lib/nexus/types";

interface VirtualModListProps {
  mods: ModSummary[];
  domain: string;
  installedIds: Set<number>;
  onNearEnd?: () => void;
}

const ROW_HEIGHT = 96;

export function VirtualModList({
  mods,
  domain,
  installedIds,
  onNearEnd,
}: VirtualModListProps) {
  const listRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: mods.length,
    getScrollElement: () =>
      listRef.current?.closest("[data-scroll-pane]") as HTMLElement | null,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
  });

  useEffect(() => {
    if (!onNearEnd) return;
    const items = virtualizer.getVirtualItems();
    const last = items[items.length - 1];
    if (last && last.index >= mods.length - 5) {
      onNearEnd();
    }
  }, [virtualizer.getVirtualItems(), mods.length, onNearEnd, virtualizer]);

  return (
    <div ref={listRef} className="mod-list relative w-full" style={{ height: virtualizer.getTotalSize() }}>
      {virtualizer.getVirtualItems().map((item) => {
        const mod = mods[item.index];
        return (
          <div
            key={mod.mod_id}
            className="absolute left-0 top-0 w-full pb-2"
            style={{ transform: `translateY(${item.start}px)` }}
          >
            <ModListRow
              mod={mod}
              domain={domain}
              installed={installedIds.has(mod.mod_id)}
            />
          </div>
        );
      })}
    </div>
  );
}

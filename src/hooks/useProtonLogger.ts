import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import type { ProtonLogLine } from "@/lib/autofix-types";

export function useProtonLogger(active: boolean, category?: string) {
  const [lines, setLines] = useState<ProtonLogLine[]>([]);

  useEffect(() => {
    if (!active) {
      setLines([]);
      return;
    }

    let unlisten: (() => void) | undefined;
    void listen<ProtonLogLine>("proton:log", (event) => {
      if (category && event.payload.category !== category) return;
      setLines((prev) => [...prev.slice(-499), event.payload]);
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      unlisten?.();
    };
  }, [active, category]);

  const clear = () => setLines([]);

  return { lines, clear };
}

export type { ProtonLogLine };

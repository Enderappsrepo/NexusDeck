import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";

export interface InstallLogLine {
  session_id: string;
  ts: string;
  level: "DEBUG" | "INFO" | "WARN" | "ERROR";
  phase: string;
  message: string;
}

export function useInstallLogger(active: boolean) {
  const [lines, setLines] = useState<InstallLogLine[]>([]);

  useEffect(() => {
    if (!active) {
      setLines([]);
      return;
    }

    let unlisten: (() => void) | undefined;
    void listen<InstallLogLine>("install:log", (event) => {
      setLines((prev) => [...prev.slice(-499), event.payload]);
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      unlisten?.();
    };
  }, [active]);

  const clear = () => setLines([]);

  return { lines, clear };
}

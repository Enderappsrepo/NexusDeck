import type { InstallSessionStatus } from "../types";

const STAGE_LABEL: Record<string, string> = {
  downloading: "Downloading",
  extracting: "Extracting",
  reading_options: "Reading options",
  nested_extract: "Unpacking nested archives",
  preparing: "Preparing",
  deploying: "Copying files",
  plan: "Planning install",
  validating: "Validating",
  ready: "Ready",
};

export function installStageLabel(session: InstallSessionStatus): string {
  const stage = session.progress?.stage ?? session.status;
  return STAGE_LABEL[stage] ?? stage.replace(/_/g, " ");
}

export function installProgressPct(session: InstallSessionStatus | null): number {
  if (!session) return 4;
  if (session.status === "done") return 100;
  if (session.status === "ready") return session.progress?.progress_pct ?? 60;
  if (session.progress?.progress_pct != null) {
    return Math.max(session.progress.progress_pct, 4);
  }
  if (session.status === "downloading") return 8;
  if (session.status === "extracting") return 35;
  if (session.status === "installing") return 65;
  return 8;
}

export function installDetailLine(session: InstallSessionStatus): string | null {
  const p = session.progress;
  if (!p) return null;

  if (session.status === "downloading" && p.bytes_total > 0) {
    return null; // bytes line shown separately
  }

  if (p.files_total && p.files_total > 0) {
    const file = p.current_file?.split(/[/\\]/).pop();
    if (file) {
      return `${p.files_done ?? 0} / ${p.files_total} files · ${file}`;
    }
    return `${p.files_done ?? 0} / ${p.files_total} files`;
  }

  if (p.current_file) {
    return p.current_file.split(/[/\\]/).pop() ?? p.current_file;
  }

  return null;
}

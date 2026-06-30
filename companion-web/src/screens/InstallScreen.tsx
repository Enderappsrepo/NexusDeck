import { CheckIcon, ChevronDownIcon, ChevronUpIcon, FolderIcon } from "../components/icons";
import { ConflictPreview } from "../components/ConflictPreview";
import { InstallOptions } from "../components/InstallOptions";
import { formatBytes, formatEta } from "../lib/format";
import type { InstallSessionStatus, SelectedInstallOption } from "../types";

export function InstallScreen({
  session,
  selections,
  setSelections,
  strategy,
  setStrategy,
  showStrategyOverride,
  setShowStrategyOverride,
  installBusy,
  installProgressPct,
  conflictAck,
  setConflictAck,
  onConfirm,
  onDone,
}: {
  session: InstallSessionStatus;
  selections: SelectedInstallOption[];
  setSelections: (s: SelectedInstallOption[]) => void;
  strategy: string;
  setStrategy: (s: string) => void;
  showStrategyOverride: boolean;
  setShowStrategyOverride: (v: boolean | ((p: boolean) => boolean)) => void;
  installBusy: boolean;
  installProgressPct: number;
  conflictAck: boolean;
  setConflictAck: (v: boolean) => void;
  onConfirm: () => void;
  onDone: () => void;
}) {
  const conflicts = session.prepare?.conflicts ?? [];
  const needsConflictAck = conflicts.length > 0 && !conflictAck;

  return (
    <div className="cc-body space-y-4">
      <div className="cc-panel space-y-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--cc-gold)]">Install</p>
        <p className="text-sm">{session.message}</p>
        {session.status === "downloading" && session.progress && session.progress.bytes_total > 0 && (
          <p className="text-xs text-[var(--cc-muted)]">
            {formatBytes(session.progress.bytes_done)} / {formatBytes(session.progress.bytes_total)}
            {session.progress.eta_seconds ? ` · ~${formatEta(session.progress.eta_seconds)} left` : ""}
          </p>
        )}
        <div className="cc-progress">
          <div className="cc-progress-fill" style={{ width: `${installProgressPct}%` }} />
        </div>
      </div>

      {session.status === "ready" && session.prepare && (
        <>
          <InstallOptions
            wizard={session.prepare.install_wizard}
            optionGroups={session.prepare.install_wizard ? [] : session.prepare.option_groups}
            selections={selections}
            onChange={setSelections}
          />
          <ConflictPreview conflicts={conflicts} />
          {conflicts.length > 0 && (
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={conflictAck} onChange={(e) => setConflictAck(e.target.checked)} />
              <span>I understand these file conflicts and want to continue.</span>
            </label>
          )}

          {session.prepare.strategies.length > 0 && (
            <div className="cc-panel space-y-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--cc-gold)]">Where this installs</p>
              {session.prepare.detected && strategy === "auto" ? (
                <div className="cc-detected">
                  <span className="cc-detected-icon">
                    <CheckIcon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="cc-detected-target">
                      <FolderIcon className="h-3.5 w-3.5 shrink-0" />
                      {session.prepare.detected.target}
                    </p>
                    <p className="cc-detected-desc">{session.prepare.detected.description}</p>
                  </div>
                </div>
              ) : null}
              <button
                type="button"
                className="cc-btn-ghost inline-flex items-center gap-1 text-xs"
                onClick={() => setShowStrategyOverride((v) => !v)}
              >
                {showStrategyOverride ? <ChevronUpIcon className="h-4 w-4" /> : <ChevronDownIcon className="h-4 w-4" />}
                {showStrategyOverride ? "Hide options" : "Change install location"}
              </button>
              {showStrategyOverride && (
                <div className="space-y-2 border-t border-[var(--cc-border-subtle)] pt-3">
                  {session.prepare.strategies.map((s) => (
                    <label key={s.id} className={`cc-file ${strategy === s.id ? "cc-file-active" : ""}`}>
                      <input
                        type="radio"
                        name="strategy"
                        checked={strategy === s.id}
                        onChange={() => setStrategy(s.id)}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="font-medium">{s.label}</span>
                        <span className="block text-[11px] text-[var(--cc-muted)]">{s.description}</span>
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          <button
            type="button"
            className="cc-btn w-full"
            disabled={installBusy || needsConflictAck}
            onClick={onConfirm}
          >
            {installBusy ? "Installing…" : needsConflictAck ? "Acknowledge conflicts to continue" : "Confirm install"}
          </button>
        </>
      )}

      {session.status === "done" && (
        <button type="button" className="cc-btn w-full" onClick={onDone}>
          Back to catalog
        </button>
      )}

      {session.status === "error" && <p className="cc-banner-err">{session.error ?? "Install failed."}</p>}
    </div>
  );
}

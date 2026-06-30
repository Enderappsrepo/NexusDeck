import { useState } from "react";
import {
  ArrowLeftIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  FolderIcon,
} from "../components/icons";
import { ConflictPreview } from "../components/ConflictPreview";
import { InstallOptions, defaultSelectionsFromPrepare } from "../components/InstallOptions";
import { coverUrl, formatUpdated, nexusModUrl, stripHtml } from "../lib/modUi";
import { groupModFiles } from "../lib/modFiles";
import type { CompanionGame, ModDetail, ModFileInfo, ModSummary } from "../types";

export function ModScreen({
  modDetail,
  modFiles,
  modBusy,
  selectedMod,
  selectedFileId,
  setSelectedFileId,
  showOtherFiles,
  setShowOtherFiles,
  showFullDescription,
  setShowFullDescription,
  gameDomain,
  activeGame,
  installBusy,
  isInstalled,
  onBack,
  onInstall,
}: {
  modDetail: ModDetail | null;
  modFiles: ModFileInfo[];
  modBusy: boolean;
  selectedMod: ModSummary;
  selectedFileId: number | null;
  setSelectedFileId: (id: number | null) => void;
  showOtherFiles: boolean;
  setShowOtherFiles: (v: boolean | ((p: boolean) => boolean)) => void;
  showFullDescription: boolean;
  setShowFullDescription: (v: boolean | ((p: boolean) => boolean)) => void;
  gameDomain: string;
  activeGame?: CompanionGame;
  installBusy: boolean;
  isInstalled: boolean;
  onBack: () => void;
  onInstall: () => void;
}) {
  const heroImg = modDetail ? coverUrl(modDetail) : coverUrl(selectedMod);
  const { mainFiles, otherFiles } = groupModFiles(modFiles);
  const selectedFile = modFiles.find((f) => f.file_id === selectedFileId);

  return (
    <>
      <div className="cc-detail-hero">
        {heroImg ? (
          <img src={heroImg} alt="" className="cc-detail-hero-img" />
        ) : (
          <div className="cc-tile-fallback cc-detail-hero-img" />
        )}
        <div className="cc-detail-hero-scrim" />
        <button type="button" className="cc-detail-back" aria-label="Back" onClick={onBack}>
          <ArrowLeftIcon className="h-5 w-5" />
        </button>
        <div className="cc-detail-hero-body">
          {modBusy ? (
            <p className="text-sm text-white/80">Loading…</p>
          ) : (
            modDetail && (
              <>
                {modDetail.category && <span className="cc-detail-eyebrow">{modDetail.category}</span>}
                <h2 className="cc-detail-title">{modDetail.name}</h2>
                <p className="cc-detail-author">by {modDetail.author}</p>
              </>
            )
          )}
        </div>
      </div>

      {modDetail && !modBusy && (
        <div className="cc-detail-body">
          {isInstalled && (
            <p className="cc-mod-installed-badge inline-flex items-center gap-1.5">
              <CheckIcon className="h-4 w-4 shrink-0" />
              Installed on your device
            </p>
          )}

          {modDetail.summary && <p className="cc-detail-summary">{modDetail.summary}</p>}

          {modDetail.description_html && (() => {
            const plain = stripHtml(modDetail.description_html);
            const truncated = plain.length > 600;
            const shown = showFullDescription || !truncated ? plain : `${plain.slice(0, 600)}…`;
            return (
              <div className="cc-mod-description">
                <p className="text-sm leading-relaxed text-[var(--cc-muted)] whitespace-pre-wrap">{shown}</p>
                {truncated && (
                  <button
                    type="button"
                    className="cc-btn-ghost mt-2 text-xs"
                    onClick={() => setShowFullDescription((v) => !v)}
                  >
                    {showFullDescription ? "Show less" : "Read full description"}
                  </button>
                )}
              </div>
            );
          })()}

          <div className="cc-panel space-y-3">
            <p className="cc-panel-label">Choose a file</p>
            {(mainFiles.length ? mainFiles : groupModFiles(modFiles).all).map((file) => (
              <label
                key={file.file_id}
                className={`cc-file ${selectedFileId === file.file_id ? "cc-file-active" : ""}`}
              >
                <input
                  type="radio"
                  name="file"
                  checked={selectedFileId === file.file_id}
                  onChange={() => setSelectedFileId(file.file_id)}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{file.name}</span>
                  <span className="text-[11px] uppercase tracking-wide text-[var(--cc-muted)]">
                    v{file.version} · {Math.max(1, Math.round(file.size_kb / 1024))} MB
                  </span>
                </span>
              </label>
            ))}
            {otherFiles.length > 0 && (
              <>
                <button type="button" className="cc-btn-ghost" onClick={() => setShowOtherFiles((v) => !v)}>
                  {showOtherFiles ? "Hide" : "Show"} optional files ({otherFiles.length})
                </button>
                {showOtherFiles &&
                  otherFiles.map((file) => (
                    <label
                      key={file.file_id}
                      className={`cc-file ${selectedFileId === file.file_id ? "cc-file-active" : ""}`}
                    >
                      <input
                        type="radio"
                        name="file"
                        checked={selectedFileId === file.file_id}
                        onChange={() => setSelectedFileId(file.file_id)}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{file.name}</span>
                      </span>
                    </label>
                  ))}
              </>
            )}
          </div>

          <a
            href={nexusModUrl(gameDomain, modDetail.mod_id)}
            target="_blank"
            rel="noopener noreferrer"
            className="cc-nexus-link"
          >
            Open on Nexus Mods ↗
          </a>
        </div>
      )}

      {modDetail && !modBusy && (
        <div className="cc-detail-cta" data-detail-cta>
          <button
            type="button"
            className="cc-btn w-full"
            disabled={!activeGame?.can_install || !selectedFileId || installBusy}
            onClick={onInstall}
          >
            {installBusy
              ? "Sending…"
              : !activeGame?.can_install
                ? "Add this game on your device first"
                : "Send to device"}
          </button>
        </div>
      )}
    </>
  );
}

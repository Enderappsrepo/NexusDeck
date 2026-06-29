import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { InstallOptions, defaultSelectionsFromPrepare } from "./components/InstallOptions";
import {
  clearPaired,
  companionAppUrl,
  confirmInstallSession,
  fetchLatest,
  fetchModDetail,
  fetchModFiles,
  fetchTrending,
  getInstallSession,
  listGames,
  loadPaired,
  pairWithDeck,
  pingDeck,
  savePaired,
  searchModsViaDeck,
  startInstallSession,
  type PairedDeck,
  type PingInfo,
} from "./deckApi";
import { usePullToRefresh } from "./hooks/usePullToRefresh";
import { formatBytes, formatEta } from "./lib/format";
import { hapticSuccess } from "./lib/haptic";
import { groupModFiles, pickDefaultFile } from "./lib/modFiles";
import { loadLastGame, saveLastGame } from "./lib/preferences";
import type {
  CompanionGame,
  InstallSessionStatus,
  ModDetail,
  ModFileInfo,
  ModSummary,
  SelectedInstallOption,
} from "./types";

type Screen = "connect" | "browse" | "mod" | "install";
type ConnectStep = "ip" | "pair";

function coverUrl(mod: { picture_url?: string | null; hero_image_url?: string | null }) {
  return mod.hero_image_url || mod.picture_url || null;
}

function CcTile({
  mod,
  className = "",
  onOpen,
}: {
  mod: ModSummary;
  className?: string;
  onOpen: (mod: ModSummary) => void;
}) {
  const img = coverUrl(mod);
  return (
    <button type="button" className={`cc-tile ${className}`.trim()} onClick={() => onOpen(mod)}>
      <div className="cc-tile-media">
        {img ? (
          <img src={img} alt="" className="cc-tile-img" loading="lazy" />
        ) : (
          <div className="cc-tile-fallback" />
        )}
        <div className="cc-tile-scrim" />
        <div className="cc-tile-caption">
          <p className="cc-tile-title">{mod.name}</p>
          <p className="cc-tile-meta">{mod.author}</p>
        </div>
      </div>
    </button>
  );
}

function stripHtml(html: string): string {
  const el = document.createElement("div");
  el.innerHTML = html;
  return el.textContent?.trim() ?? "";
}

export default function App() {
  const [paired, setPaired] = useState<PairedDeck | null>(() => loadPaired());
  const [screen, setScreen] = useState<Screen>(paired ? "browse" : "connect");
  const [connectStep, setConnectStep] = useState<ConnectStep>("ip");
  const installLock = useRef(false);

  const [host, setHost] = useState(paired?.host ?? "");
  const [port, setPort] = useState(String(paired?.port ?? 8731));
  const [code, setCode] = useState("");
  const [deviceInfo, setDeviceInfo] = useState<PingInfo | null>(null);
  const [connectBusy, setConnectBusy] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  const [games, setGames] = useState<CompanionGame[]>([]);
  const [gameDomain, setGameDomain] = useState(() => loadLastGame());
  const [query, setQuery] = useState("");
  const [trending, setTrending] = useState<ModSummary[]>([]);
  const [latest, setLatest] = useState<ModSummary[]>([]);
  const [searchResults, setSearchResults] = useState<ModSummary[]>([]);
  const [browseBusy, setBrowseBusy] = useState(false);
  const [browseError, setBrowseError] = useState<string | null>(null);

  const [selectedMod, setSelectedMod] = useState<ModSummary | null>(null);
  const [modDetail, setModDetail] = useState<ModDetail | null>(null);
  const [modFiles, setModFiles] = useState<ModFileInfo[]>([]);
  const [showOtherFiles, setShowOtherFiles] = useState(false);
  const [selectedFileId, setSelectedFileId] = useState<number | null>(null);
  const [modBusy, setModBusy] = useState(false);

  const [session, setSession] = useState<InstallSessionStatus | null>(null);
  const [selections, setSelections] = useState<SelectedInstallOption[]>([]);
  const [installBusy, setInstallBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const companionLink = useMemo(() => {
    const h = host.trim();
    return h ? companionAppUrl(h, Number(port) || 8731) : null;
  }, [host, port]);

  const activeGame = games.find((g) => g.domain === gameDomain);
  const { mainFiles, otherFiles } = useMemo(() => groupModFiles(modFiles), [modFiles]);

  const loadBrowse = useCallback(async (deck: PairedDeck, domain: string) => {
    setBrowseBusy(true);
    setBrowseError(null);
    try {
      const [t, l] = await Promise.all([
        fetchTrending(deck, domain),
        fetchLatest(deck, domain),
      ]);
      setTrending(t);
      setLatest(l);
      setSearchResults([]);
      setQuery("");
    } catch (e) {
      setBrowseError(e instanceof Error ? e.message : String(e));
    } finally {
      setBrowseBusy(false);
    }
  }, []);

  const refreshBrowse = useCallback(async () => {
    if (!paired || !gameDomain) return;
    await loadBrowse(paired, gameDomain);
  }, [paired, gameDomain, loadBrowse]);

  const { pullDistance, refreshing, pullProps } = usePullToRefresh(refreshBrowse, !!paired);

  const refreshGames = useCallback(
    async (deck: PairedDeck) => {
      try {
        const list = await listGames(deck);
        setGames(list);
        if (!list.length) return;
        const saved = loadLastGame();
        const pick =
          (saved && list.some((g) => g.domain === saved) && saved) ||
          list.find((g) => g.can_install)?.domain ||
          list[0]!.domain;
        setGameDomain((current) =>
          current && list.some((g) => g.domain === current) ? current : pick
        );
      } catch {
        if (deviceInfo?.games?.length) setGames(deviceInfo.games);
      }
    },
    [deviceInfo?.games]
  );

  useEffect(() => {
    if (gameDomain) saveLastGame(gameDomain);
  }, [gameDomain]);

  useEffect(() => {
    if (!paired) return;
    void refreshGames(paired);
  }, [paired, refreshGames]);

  useEffect(() => {
    if (!paired || !gameDomain) return;
    void loadBrowse(paired, gameDomain);
  }, [paired, gameDomain, loadBrowse]);

  useEffect(() => {
    if (!paired || !session?.session_id) return;
    if (["ready", "done", "error"].includes(session.status)) return;

    const timer = window.setInterval(() => {
      void getInstallSession(paired, session.session_id).then((next) => {
        setSession(next);
        if (next.prepare && selections.length === 0) {
          setSelections(defaultSelectionsFromPrepare(next.prepare));
        }
      });
    }, 1200);
    return () => window.clearInterval(timer);
  }, [paired, session?.session_id, session?.status, selections.length]);

  const openMod = async (mod: ModSummary) => {
    if (!paired) return;
    setSelectedMod(mod);
    setScreen("mod");
    setModBusy(true);
    setModDetail(null);
    setModFiles([]);
    setShowOtherFiles(false);
    try {
      const [detail, files] = await Promise.all([
        fetchModDetail(paired, gameDomain, mod.mod_id),
        fetchModFiles(paired, gameDomain, mod.mod_id),
      ]);
      setModDetail(detail);
      setModFiles(files);
      setSelectedFileId(pickDefaultFile(files)?.file_id ?? null);
    } catch (e) {
      setBrowseError(e instanceof Error ? e.message : String(e));
    } finally {
      setModBusy(false);
    }
  };

  const beginInstall = async () => {
    if (
      installLock.current ||
      !paired ||
      !selectedMod ||
      !selectedFileId ||
      !activeGame?.can_install
    ) {
      return;
    }
    const file = modFiles.find((f) => f.file_id === selectedFileId);
    if (!file) return;

    installLock.current = true;
    setInstallBusy(true);
    setBrowseError(null);
    setSession(null);
    setSelections([]);
    try {
      const started = await startInstallSession(paired, {
        game_domain: gameDomain,
        nexus_mod_id: selectedMod.mod_id,
        nexus_file_id: file.file_id,
        mod_name: selectedMod.name,
        file_name: file.file_name || file.name,
        expected_size_kb: file.size_kb,
        file_version: file.version || null,
      });
      setSession(started);
      setScreen("install");
      hapticSuccess();
    } catch (e) {
      setBrowseError(e instanceof Error ? e.message : String(e));
    } finally {
      setInstallBusy(false);
      installLock.current = false;
    }
  };

  const confirmInstall = async () => {
    if (installLock.current || !paired || !session?.session_id) return;
    installLock.current = true;
    setInstallBusy(true);
    try {
      const result = await confirmInstallSession(paired, session.session_id, {
        selected_options: selections,
        enable_mod: true,
        strategy: "auto",
      });
      setSession(result);
      setNote(result.message);
      if (result.status === "done") hapticSuccess();
    } catch (e) {
      setBrowseError(e instanceof Error ? e.message : String(e));
    } finally {
      setInstallBusy(false);
      installLock.current = false;
    }
  };

  const installProgressPct = useMemo(() => {
    if (!session) return 12;
    if (session.status === "ready" || session.status === "done") return 100;
    if (session.status === "downloading" && session.progress) {
      return Math.max(session.progress.progress_pct, 4);
    }
    if (session.status === "extracting") return 92;
    if (session.status === "installing") return 96;
    return 12;
  }, [session]);

  const showSearch = query.trim().length > 0;
  const heroImg = modDetail ? coverUrl(modDetail) : selectedMod ? coverUrl(selectedMod) : null;

  return (
    <div className="shell">
      <header className="cc-header">
        <p className="cc-brand">NexusDeck · Companion</p>
        <h1 className="cc-title">
          {paired ? paired.name : "Mod Catalog"}
        </h1>
        <p className="cc-sub">
          {paired
            ? "Browse and send installs to your device — Creation Club style."
            : "Pair with your Deck or PC to browse Nexus mods."}
        </p>
      </header>

      {paired && (
        <nav className="cc-tab-bar">
          <button
            type="button"
            className={
              screen === "browse" || screen === "mod" ? "cc-tab cc-tab-active" : "cc-tab"
            }
            onClick={() => setScreen("browse")}
          >
            Browse
          </button>
          <button
            type="button"
            className={screen === "install" ? "cc-tab cc-tab-active" : "cc-tab"}
            onClick={() => session && setScreen("install")}
            disabled={!session}
          >
            Install
          </button>
          <button
            type="button"
            className={screen === "connect" ? "cc-tab cc-tab-active" : "cc-tab"}
            onClick={() => setScreen("connect")}
          >
            Device
          </button>
        </nav>
      )}

      {note && screen === "browse" && <p className="cc-banner-ok">{note}</p>}
      {(connectError || browseError) && (
        <p className="cc-banner-err">{connectError ?? browseError}</p>
      )}

      {screen === "connect" && (
        <div className="cc-body">
          {!paired ? (
            <>
              {companionLink && (
                <p className="cc-banner-warn text-xs">
                  Open on your network:{" "}
                  <a href={companionLink} className="text-[var(--cc-gold)] underline">
                    {companionLink}
                  </a>
                </p>
              )}
              {connectStep === "ip" ? (
                <div className="cc-panel space-y-3">
                  <p className="text-xs uppercase tracking-wider text-[var(--cc-muted)]">
                    Step 1 — Device IP
                  </p>
                  <input
                    className="cc-input"
                    placeholder="192.168.1.42"
                    value={host}
                    onChange={(e) => setHost(e.target.value)}
                  />
                  <input
                    className="cc-input"
                    placeholder="8731"
                    value={port}
                    onChange={(e) => setPort(e.target.value.replace(/\D/g, "").slice(0, 5))}
                  />
                  <button
                    type="button"
                    className="cc-btn w-full"
                    disabled={connectBusy}
                    onClick={() => {
                      void (async () => {
                        setConnectBusy(true);
                        setConnectError(null);
                        try {
                          const info = await pingDeck(host.trim(), Number(port) || 8731);
                          setDeviceInfo(info);
                          if (info.games?.length) setGames(info.games);
                          setConnectStep("pair");
                        } catch (e) {
                          setConnectError(e instanceof Error ? e.message : String(e));
                        } finally {
                          setConnectBusy(false);
                        }
                      })();
                    }}
                  >
                    {connectBusy ? "Connecting…" : "Connect"}
                  </button>
                </div>
              ) : (
                <div className="cc-panel space-y-3">
                  <p className="text-xs text-[var(--cc-success)]">
                    Found {deviceInfo?.name}
                  </p>
                  <input
                    className="cc-input cc-input-code"
                    placeholder="000000"
                    maxLength={6}
                    inputMode="numeric"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="cc-btn-secondary flex-1"
                      onClick={() => setConnectStep("ip")}
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      className="cc-btn flex-1"
                      disabled={connectBusy || code.length !== 6}
                      onClick={() => {
                        void (async () => {
                          setConnectBusy(true);
                          try {
                            const token = await pairWithDeck(
                              host.trim(),
                              Number(port) || 8731,
                              code
                            );
                            const info = deviceInfo ?? (await pingDeck(host.trim(), Number(port) || 8731));
                            savePaired({
                              name: info.name,
                              host: host.trim(),
                              port: Number(port) || 8731,
                              token,
                            });
                            setPaired(loadPaired());
                            setScreen("browse");
                          } catch (e) {
                            setConnectError(e instanceof Error ? e.message : String(e));
                          } finally {
                            setConnectBusy(false);
                          }
                        })();
                      }}
                    >
                      Pair
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="cc-panel space-y-3">
              <p className="text-sm">
                Paired with <strong>{paired.name}</strong>
              </p>
              <button
                type="button"
                className="cc-btn-secondary w-full"
                onClick={() => {
                  clearPaired();
                  setPaired(null);
                  setScreen("connect");
                  setSession(null);
                }}
              >
                Unpair
              </button>
            </div>
          )}
        </div>
      )}

      {paired && screen === "browse" && (
        <div className="cc-browse-wrap" {...pullProps}>
          {(pullDistance > 8 || refreshing) && (
            <div
              className="cc-pull-indicator"
              style={{ height: refreshing ? 36 : Math.min(pullDistance * 0.45, 48) }}
            >
              <span className="text-[10px] uppercase tracking-wider text-[var(--cc-gold)]">
                {refreshing ? "Refreshing…" : pullDistance >= 72 ? "Release to refresh" : "Pull to refresh"}
              </span>
            </div>
          )}

          <div className="cc-game-bar">
            {games.map((g) => (
              <button
                key={g.domain}
                type="button"
                className={gameDomain === g.domain ? "cc-chip cc-chip-active" : "cc-chip"}
                onClick={() => setGameDomain(g.domain)}
              >
                {g.name}
              </button>
            ))}
          </div>

          <div className="cc-search">
            <input
              className="cc-input flex-1"
              placeholder="Search catalog…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && paired && gameDomain && query.trim()) {
                  void (async () => {
                    setBrowseBusy(true);
                    try {
                      setSearchResults(
                        await searchModsViaDeck(paired, gameDomain, query.trim())
                      );
                    } catch (err) {
                      setBrowseError(err instanceof Error ? err.message : String(err));
                    } finally {
                      setBrowseBusy(false);
                    }
                  })();
                }
              }}
            />
            <button
              type="button"
              className="cc-btn shrink-0 px-4"
              disabled={browseBusy}
              onClick={() => {
                if (!query.trim()) return;
                void (async () => {
                  setBrowseBusy(true);
                  try {
                    setSearchResults(
                      await searchModsViaDeck(paired, gameDomain, query.trim())
                    );
                  } catch (err) {
                    setBrowseError(err instanceof Error ? err.message : String(err));
                  } finally {
                    setBrowseBusy(false);
                  }
                })();
              }}
            >
              Go
            </button>
          </div>

          {browseBusy && (
            <p className="px-4 text-xs uppercase tracking-wider text-[var(--cc-muted)]">
              Loading…
            </p>
          )}

          {showSearch ? (
            <section>
              <p className="cc-section-label px-4">Results</p>
              <div className="cc-stack">
                {searchResults.map((mod) => (
                  <CcTile key={mod.mod_id} mod={mod} onOpen={(m) => void openMod(m)} />
                ))}
              </div>
            </section>
          ) : (
            <>
              {trending.length > 0 && (
                <section>
                  <p className="cc-section-label px-4">Featured</p>
                  <div className="cc-shelf-track">
                    {trending.map((mod) => (
                      <CcTile
                        key={mod.mod_id}
                        mod={mod}
                        className="cc-shelf-tile"
                        onOpen={(m) => void openMod(m)}
                      />
                    ))}
                  </div>
                </section>
              )}

              {latest.length > 0 && (
                <section>
                  <p className="cc-section-label px-4">Latest</p>
                  <div className="cc-stack">
                    {latest.map((mod) => (
                      <CcTile key={mod.mod_id} mod={mod} onOpen={(m) => void openMod(m)} />
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      )}

      {paired && screen === "mod" && selectedMod && (
        <>
          <div className="cc-hero">
            {heroImg ? (
              <img src={heroImg} alt="" className="cc-hero-img" />
            ) : (
              <div className="cc-tile-fallback cc-hero-img" />
            )}
            <div className="cc-hero-scrim" />
            <div className="cc-hero-body">
              <button type="button" className="cc-btn-ghost mb-3" onClick={() => setScreen("browse")}>
                ← Catalog
              </button>
              {modBusy ? (
                <p className="text-sm text-[var(--cc-muted)]">Loading…</p>
              ) : (
                modDetail && (
                  <>
                    <h2 className="cc-hero-title">{modDetail.name}</h2>
                    <p className="cc-hero-author">{modDetail.author}</p>
                  </>
                )
              )}
            </div>
          </div>

          {modDetail && !modBusy && (
            <div className="cc-body space-y-4">
              {modDetail.summary && (
                <p className="text-sm leading-relaxed text-[var(--cc-muted)]">{modDetail.summary}</p>
              )}
              {modDetail.description_html && (
                <p className="text-sm leading-relaxed text-[var(--cc-muted)] line-clamp-5">
                  {stripHtml(modDetail.description_html).slice(0, 500)}
                </p>
              )}

              <div className="cc-panel space-y-3">
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--cc-gold)]">
                  Download
                </p>
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
                        {file.is_primary ? " · recommended" : ""}
                      </span>
                    </span>
                  </label>
                ))}

                {otherFiles.length > 0 && (
                  <>
                    <button
                      type="button"
                      className="cc-btn-ghost"
                      onClick={() => setShowOtherFiles((v) => !v)}
                    >
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
                            <span className="text-[11px] text-[var(--cc-muted)]">
                              v{file.version} · optional
                            </span>
                          </span>
                        </label>
                      ))}
                  </>
                )}
              </div>

              <button
                type="button"
                className="cc-btn w-full"
                disabled={!activeGame?.can_install || !selectedFileId || installBusy}
                onClick={() => void beginInstall()}
              >
                {installBusy ? "Sending…" : "Send to device"}
              </button>
            </div>
          )}
        </>
      )}

      {paired && screen === "install" && session && (
        <div className="cc-body space-y-4">
          <div className="cc-panel space-y-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--cc-gold)]">
              Install
            </p>
            <p className="text-sm">{session.message}</p>
            {session.status === "downloading" && session.progress && session.progress.bytes_total > 0 && (
              <p className="text-xs text-[var(--cc-muted)]">
                {formatBytes(session.progress.bytes_done)} / {formatBytes(session.progress.bytes_total)}
                {session.progress.eta_seconds
                  ? ` · ~${formatEta(session.progress.eta_seconds)} left`
                  : ""}
              </p>
            )}
            <div className="cc-progress">
              <div
                className="cc-progress-fill"
                style={{ width: `${installProgressPct}%` }}
              />
            </div>
          </div>

          {session.status === "ready" && session.prepare && (
            <>
              <InstallOptions
                wizard={session.prepare.install_wizard}
                optionGroups={
                  session.prepare.install_wizard ? [] : session.prepare.option_groups
                }
                selections={selections}
                onChange={setSelections}
              />
              <button
                type="button"
                className="cc-btn w-full"
                disabled={installBusy}
                onClick={() => void confirmInstall()}
              >
                {installBusy ? "Installing…" : "Confirm install"}
              </button>
            </>
          )}

          {session.status === "done" && (
            <button type="button" className="cc-btn w-full" onClick={() => setScreen("browse")}>
              Back to catalog
            </button>
          )}

          {session.status === "error" && (
            <p className="cc-banner-err">{session.error ?? "Install failed."}</p>
          )}
        </div>
      )}
    </div>
  );
}

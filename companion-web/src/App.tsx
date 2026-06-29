import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { QrScanPanel } from "./components/QrScanPanel";
import {
  clearPaired,
  companionAppUrl,
  confirmInstallSession,
  fetchDiscovery,
  fetchLatest,
  fetchLibraryMods,
  fetchModDetail,
  fetchModFiles,
  fetchTrending,
  getInstallSession,
  isApiNotFoundError,
  isGitHubPagesHost,
  listGames,
  loadPaired,
  pairWithDeck,
  pingDeck,
  savePaired,
  searchModsViaDeck,
  startInstallSession,
  toggleLibraryMod,
  uninstallLibraryMod,
  type PairedDeck,
  type PingInfo,
} from "./deckApi";
import { CompanionEssentialsCard } from "./components/CompanionEssentialsCard";
import { InstallOptions, defaultSelectionsFromPrepare } from "./components/InstallOptions";
import { usePullToRefresh } from "./hooks/usePullToRefresh";
import { formatBytes, formatEta } from "./lib/format";
import { hapticSuccess } from "./lib/haptic";
import {
  discoverDevicesOnLan,
  getReceiverSelfHost,
  readConnectParamsFromUrl,
  type LanDevice,
} from "./lib/lanDiscovery";
import { groupModFiles, pickDefaultFile } from "./lib/modFiles";
import {
  isStandalonePwa,
  listenForInstallPrompt,
  type BeforeInstallPromptEvent,
} from "./lib/pwa";
import { loadLastGame, saveLastGame } from "./lib/preferences";
import type {
  CompanionGame,
  CompanionInstalledMod,
  DiscoveryFeeds,
  InstallSessionStatus,
  ModDetail,
  ModFileInfo,
  ModSummary,
  SelectedInstallOption,
} from "./types";
import { EMPTY_DISCOVERY } from "./types";

type Screen = "connect" | "browse" | "library" | "mod" | "install";
type ConnectStep = "find" | "pair" | "manual" | "qr";

const DISCOVERY_SHELVES: {
  key: keyof DiscoveryFeeds;
  title: string;
  layout: "hero" | "shelf" | "stack";
}[] = [
  { key: "featured", title: "Featured", layout: "hero" },
  { key: "top_endorsed", title: "Most endorsed", layout: "shelf" },
  { key: "most_downloaded", title: "Most downloaded", layout: "shelf" },
  { key: "trending", title: "Trending now", layout: "shelf" },
  { key: "newly_added", title: "Newly added", layout: "stack" },
  { key: "recently_updated", title: "Recently updated", layout: "stack" },
  { key: "hot_this_week", title: "Hot this week", layout: "stack" },
];

const OUTDATED_DEVICE_MSG =
  "Your NexusDeck app is out of date — update it on your PC or Deck, then open the companion at http://YOUR_DEVICE_IP:8731/app/ (not GitHub Pages).";

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

function formatCount(n?: number): string {
  if (n == null || n <= 0) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatUpdated(ts?: number): string | null {
  if (!ts) return null;
  const d = new Date(ts * 1000);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function nexusModUrl(domain: string, modId: number): string {
  return `https://www.nexusmods.com/${domain}/mods/${modId}`;
}

export default function App() {
  const [paired, setPaired] = useState<PairedDeck | null>(() => loadPaired());
  const [screen, setScreen] = useState<Screen>(paired ? "browse" : "connect");
  const [connectStep, setConnectStep] = useState<ConnectStep>("find");
  const installLock = useRef(false);
  const autoConnectTried = useRef(false);

  const [host, setHost] = useState(paired?.host ?? "");
  const [port, setPort] = useState(String(paired?.port ?? 8731));
  const [code, setCode] = useState("");
  const [deviceInfo, setDeviceInfo] = useState<PingInfo | null>(null);
  const [connectBusy, setConnectBusy] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [foundDevices, setFoundDevices] = useState<LanDevice[]>([]);
  const [scanProgress, setScanProgress] = useState<{ done: number; total: number } | null>(null);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  const [games, setGames] = useState<CompanionGame[]>([]);
  const [gameDomain, setGameDomain] = useState(() => loadLastGame());
  const [query, setQuery] = useState("");
  const [discovery, setDiscovery] = useState<DiscoveryFeeds>(EMPTY_DISCOVERY);
  const [searchResults, setSearchResults] = useState<ModSummary[]>([]);
  const [browseBusy, setBrowseBusy] = useState(false);
  const [browseError, setBrowseError] = useState<string | null>(null);

  const [libraryMods, setLibraryMods] = useState<CompanionInstalledMod[]>([]);
  const [libraryBusy, setLibraryBusy] = useState(false);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [libraryActionId, setLibraryActionId] = useState<string | null>(null);

  const [selectedMod, setSelectedMod] = useState<ModSummary | null>(null);
  const [modDetail, setModDetail] = useState<ModDetail | null>(null);
  const [modFiles, setModFiles] = useState<ModFileInfo[]>([]);
  const [showOtherFiles, setShowOtherFiles] = useState(false);
  const [showFullDescription, setShowFullDescription] = useState(false);
  const [selectedFileId, setSelectedFileId] = useState<number | null>(null);
  const [modBusy, setModBusy] = useState(false);

  const [session, setSession] = useState<InstallSessionStatus | null>(null);
  const [selections, setSelections] = useState<SelectedInstallOption[]>([]);
  const [strategy, setStrategy] = useState("auto");
  const [installBusy, setInstallBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const companionLink = useMemo(() => {
    const h = host.trim();
    return h ? companionAppUrl(h, Number(port) || 8731) : null;
  }, [host, port]);

  const activeGame = games.find((g) => g.domain === gameDomain);
  const { mainFiles, otherFiles } = useMemo(() => groupModFiles(modFiles), [modFiles]);
  const onGitHubPages = isGitHubPagesHost();
  const deviceCompanionUrl = paired ? companionAppUrl(paired.host, paired.port) : companionLink;
  const receiverSelf = getReceiverSelfHost();

  const connectToDevice = useCallback(async (nextHost: string, nextPort: number) => {
    setConnectBusy(true);
    setConnectError(null);
    setHost(nextHost);
    setPort(String(nextPort));
    try {
      const info = await pingDeck(nextHost, nextPort);
      setDeviceInfo(info);
      if (info.games?.length) setGames(info.games);
      setConnectStep("pair");
    } catch (e) {
      setConnectError(e instanceof Error ? e.message : String(e));
    } finally {
      setConnectBusy(false);
    }
  }, []);

  const scanForDevices = useCallback(async () => {
    setConnectBusy(true);
    setConnectError(null);
    setFoundDevices([]);
    setScanProgress({ done: 0, total: 1 });
    try {
      const portNum = Number(port) || 8731;
      const found = await discoverDevicesOnLan(portNum, (done, total, partial) => {
        setScanProgress({ done, total });
        setFoundDevices([...partial]);
      });
      setFoundDevices(found);
      if (!found.length) {
        setConnectError(
          "No NexusDeck devices found. Turn on Receive in NexusDeck Settings and make sure your phone is on the same Wi‑Fi."
        );
      }
    } catch (e) {
      setConnectError(e instanceof Error ? e.message : String(e));
    } finally {
      setConnectBusy(false);
      setScanProgress(null);
    }
  }, [port]);

  useEffect(() => {
    return listenForInstallPrompt((event) => setInstallPrompt(event));
  }, []);

  useEffect(() => {
    if (paired || autoConnectTried.current) return;
    autoConnectTried.current = true;
    const target = readConnectParamsFromUrl();
    if (!target) return;
    void connectToDevice(target.host, target.port);
  }, [paired, connectToDevice]);

  const loadBrowse = useCallback(async (deck: PairedDeck, domain: string) => {
    setBrowseBusy(true);
    setBrowseError(null);
    try {
      const feeds = await fetchDiscovery(deck, domain);
      setDiscovery(feeds);
      setSearchResults([]);
      setQuery("");
    } catch (e) {
      if (isApiNotFoundError(e)) {
        try {
          const [t, l] = await Promise.all([
            fetchTrending(deck, domain),
            fetchLatest(deck, domain),
          ]);
          setDiscovery({
            ...EMPTY_DISCOVERY,
            featured: t.slice(0, 6),
            trending: t,
            recently_updated: l,
          });
          setSearchResults([]);
          setQuery("");
          setBrowseError(
            "Limited browse — update NexusDeck on your device for full discovery shelves."
          );
        } catch {
          setBrowseError(OUTDATED_DEVICE_MSG);
        }
      } else {
        setBrowseError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setBrowseBusy(false);
    }
  }, []);

  const loadLibrary = useCallback(async (deck: PairedDeck, domain: string) => {
    setLibraryBusy(true);
    setLibraryError(null);
    try {
      const mods = await fetchLibraryMods(deck, domain);
      setLibraryMods(mods.sort((a, b) => a.sort_order - b.sort_order));
    } catch (e) {
      if (isApiNotFoundError(e)) {
        setLibraryError(OUTDATED_DEVICE_MSG);
      } else {
        setLibraryError(e instanceof Error ? e.message : String(e));
      }
      setLibraryMods([]);
    } finally {
      setLibraryBusy(false);
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
    if (!paired || !gameDomain || screen !== "library") return;
    void loadLibrary(paired, gameDomain);
  }, [paired, gameDomain, screen, loadLibrary]);

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
    setShowFullDescription(false);
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
    setStrategy("auto");
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
        strategy,
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
  const hasDiscoveryContent = DISCOVERY_SHELVES.some((s) => discovery[s.key].length > 0);

  const handleToggleMod = async (mod: CompanionInstalledMod) => {
    if (!paired) return;
    setLibraryActionId(mod.id);
    setLibraryError(null);
    try {
      await toggleLibraryMod(paired, mod.id, !mod.enabled);
      setLibraryMods((prev) =>
        prev.map((m) => (m.id === mod.id ? { ...m, enabled: !m.enabled } : m))
      );
      hapticSuccess();
    } catch (e) {
      setLibraryError(e instanceof Error ? e.message : String(e));
    } finally {
      setLibraryActionId(null);
    }
  };

  const handleUninstallMod = async (mod: CompanionInstalledMod) => {
    if (!paired) return;
    if (!window.confirm(`Uninstall "${mod.name}" from your device?`)) return;
    setLibraryActionId(mod.id);
    setLibraryError(null);
    try {
      await uninstallLibraryMod(paired, mod.id);
      setLibraryMods((prev) => prev.filter((m) => m.id !== mod.id));
      setNote(`Uninstalled "${mod.name}".`);
      hapticSuccess();
    } catch (e) {
      setLibraryError(e instanceof Error ? e.message : String(e));
    } finally {
      setLibraryActionId(null);
    }
  };

  const openInstalledMod = (mod: CompanionInstalledMod) => {
    void openMod({
      mod_id: mod.nexus_mod_id,
      name: mod.name,
      author: "",
    });
  };

  return (
    <div className="shell">
      <header className="cc-header">
        <p className="cc-brand">NexusDeck · Companion</p>
        <h1 className="cc-title">
          {paired ? paired.name : "Mod Catalog"}
        </h1>
        <p className="cc-sub">
          {paired
            ? "Browse Nexus and send installs straight to your device."
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
            className={screen === "library" ? "cc-tab cc-tab-active" : "cc-tab"}
            onClick={() => setScreen("library")}
          >
            Library
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

      {!isStandalonePwa() && installPrompt && (
        <div className="cc-pwa-banner mx-4 flex items-center gap-2">
          <p className="flex-1 text-xs text-[var(--cc-muted)]">Install for quick access from your home screen.</p>
          <button
            type="button"
            className="cc-btn shrink-0 px-3 py-2 text-[10px]"
            onClick={() => {
              void installPrompt.prompt().then(() => setInstallPrompt(null));
            }}
          >
            Install
          </button>
        </div>
      )}

      {paired && onGitHubPages && deviceCompanionUrl && (
        <p className="cc-banner-warn mx-4 text-xs leading-relaxed">
          GitHub Pages cannot reach your device. For browse, install, and library management open{" "}
          <a href={deviceCompanionUrl} className="text-[var(--cc-gold)] underline">
            {deviceCompanionUrl}
          </a>{" "}
          on your phone (same Wi‑Fi).
        </p>
      )}

      {note && (screen === "browse" || screen === "library") && (
        <p className="cc-banner-ok">{note}</p>
      )}
      {(connectError || browseError) && (
        <p className="cc-banner-err">
          {screen === "connect" ? connectError : browseError ?? connectError}
        </p>
      )}
      {libraryError && screen === "library" && (
        <p className="cc-banner-err">{libraryError}</p>
      )}

      {screen === "connect" && (
        <div className="cc-body">
          {!paired ? (
            <>
              {receiverSelf && connectStep === "find" && (
                <p className="cc-banner-ok text-xs">
                  You're on your NexusDeck device — tap a found device below or pair directly.
                </p>
              )}

              {connectStep === "find" && (
                <div className="cc-panel space-y-3">
                  <p className="text-xs uppercase tracking-wider text-[var(--cc-muted)]">
                    Find your PC or Deck
                  </p>
                  <p className="text-sm leading-relaxed text-[var(--cc-muted)]">
                    On the same Wi‑Fi, NexusDeck can scan your network — no IP required. Turn on{" "}
                    <strong>Receive</strong> in NexusDeck Settings first.
                  </p>

                  <button
                    type="button"
                    className="cc-btn w-full"
                    disabled={connectBusy}
                    onClick={() => void scanForDevices()}
                  >
                    {connectBusy
                      ? scanProgress
                        ? `Scanning… ${Math.round((scanProgress.done / scanProgress.total) * 100)}%`
                        : "Scanning…"
                      : "Scan network"}
                  </button>

                  <button
                    type="button"
                    className="cc-btn-secondary w-full"
                    disabled={connectBusy}
                    onClick={() => setConnectStep("qr")}
                  >
                    Scan QR code
                  </button>

                  {receiverSelf && (
                    <button
                      type="button"
                      className="cc-btn-secondary w-full"
                      disabled={connectBusy}
                      onClick={() => void connectToDevice(receiverSelf.host, receiverSelf.port)}
                    >
                      Use this device ({receiverSelf.host})
                    </button>
                  )}

                  {foundDevices.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--cc-gold)]">
                        Found on your network
                      </p>
                      {foundDevices.map((device) => (
                        <button
                          key={`${device.host}:${device.port}`}
                          type="button"
                          className="cc-device-row w-full"
                          disabled={connectBusy}
                          onClick={() => void connectToDevice(device.host, device.port)}
                        >
                          <span className="block text-left font-medium">{device.name}</span>
                          <span className="block text-left text-[10px] uppercase tracking-wide text-[var(--cc-muted)]">
                            {device.host}:{device.port}
                            {device.version ? ` · v${device.version}` : ""}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}

                  <button
                    type="button"
                    className="cc-btn-ghost w-full"
                    onClick={() => setConnectStep("manual")}
                  >
                    Enter IP manually
                  </button>
                </div>
              )}

              {connectStep === "qr" && (
                <QrScanPanel
                  onFound={(h, p) => void connectToDevice(h, p)}
                  onCancel={() => setConnectStep("find")}
                />
              )}

              {connectStep === "manual" && (
                <div className="cc-panel space-y-3">
                  <p className="text-xs uppercase tracking-wider text-[var(--cc-muted)]">
                    Manual connection
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
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="cc-btn-secondary flex-1"
                      onClick={() => setConnectStep("find")}
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      className="cc-btn flex-1"
                      disabled={connectBusy || !host.trim()}
                      onClick={() => void connectToDevice(host.trim(), Number(port) || 8731)}
                    >
                      {connectBusy ? "Connecting…" : "Connect"}
                    </button>
                  </div>
                </div>
              )}

              {connectStep === "pair" && (
                <div className="cc-panel space-y-3">
                  <p className="text-xs text-[var(--cc-success)]">
                    Found {deviceInfo?.name} at {host}:{port}
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
                      onClick={() => setConnectStep("find")}
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
                            const info =
                              deviceInfo ??
                              (await pingDeck(host.trim(), Number(port) || 8731));
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

          <CompanionEssentialsCard
            paired={paired}
            gameDomain={gameDomain}
            canInstall={!!activeGame?.can_install}
          />

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
              {!browseBusy && !hasDiscoveryContent && !showSearch && (
                <p className="px-4 text-sm text-[var(--cc-muted)]">
                  No mods loaded yet. Search above, or update NexusDeck on your device if shelves
                  stay empty.
                </p>
              )}

              {DISCOVERY_SHELVES.map((shelf) => {
                const mods = discovery[shelf.key];
                if (!mods.length) return null;

                if (shelf.layout === "hero") {
                  return (
                    <section key={shelf.key}>
                      <p className="cc-section-label px-4">{shelf.title}</p>
                      <div className="cc-shelf-track cc-shelf-track-hero">
                        {mods.map((mod) => (
                          <CcTile
                            key={mod.mod_id}
                            mod={mod}
                            className="cc-shelf-tile cc-shelf-tile-hero"
                            onOpen={(m) => void openMod(m)}
                          />
                        ))}
                      </div>
                    </section>
                  );
                }

                if (shelf.layout === "shelf") {
                  return (
                    <section key={shelf.key}>
                      <p className="cc-section-label px-4">{shelf.title}</p>
                      <div className="cc-shelf-track">
                        {mods.map((mod) => (
                          <CcTile
                            key={mod.mod_id}
                            mod={mod}
                            className="cc-shelf-tile"
                            onOpen={(m) => void openMod(m)}
                          />
                        ))}
                      </div>
                    </section>
                  );
                }

                return (
                  <section key={shelf.key}>
                    <p className="cc-section-label px-4">{shelf.title}</p>
                    <div className="cc-stack">
                      {mods.map((mod) => (
                        <CcTile key={mod.mod_id} mod={mod} onOpen={(m) => void openMod(m)} />
                      ))}
                    </div>
                  </section>
                );
              })}
            </>
          )}
        </div>
      )}

      {paired && screen === "library" && (
        <div className="cc-browse-wrap">
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

          {libraryBusy && (
            <p className="px-4 text-xs uppercase tracking-wider text-[var(--cc-muted)]">
              Loading library…
            </p>
          )}

          {!libraryBusy && libraryMods.length === 0 && !libraryError && (
            <p className="px-4 text-sm text-[var(--cc-muted)]">
              No mods installed for this game yet. Browse and send installs from the Browse tab.
            </p>
          )}

          <div className="cc-library-list">
            {libraryMods.map((mod) => (
              <div key={mod.id} className="cc-library-row">
                <button
                  type="button"
                  className="cc-library-main"
                  onClick={() => openInstalledMod(mod)}
                >
                  <span className="cc-library-name">{mod.name}</span>
                  <span className="cc-library-meta">
                    {mod.version ? `v${mod.version}` : "Installed mod"}
                    {!mod.enabled ? " · disabled" : ""}
                  </span>
                </button>
                <label className="cc-toggle" title={mod.enabled ? "Disable mod" : "Enable mod"}>
                  <input
                    type="checkbox"
                    checked={mod.enabled}
                    disabled={libraryActionId === mod.id}
                    onChange={() => void handleToggleMod(mod)}
                  />
                  <span className="cc-toggle-track" />
                </label>
                <button
                  type="button"
                  className="cc-library-uninstall"
                  disabled={libraryActionId === mod.id}
                  onClick={() => void handleUninstallMod(mod)}
                >
                  Uninstall
                </button>
              </div>
            ))}
          </div>
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
              <div className="cc-mod-stats">
                <div className="cc-mod-stat">
                  <span className="cc-mod-stat-value">{formatCount(modDetail.endorsements)}</span>
                  <span className="cc-mod-stat-label">Endorsements</span>
                </div>
                <div className="cc-mod-stat">
                  <span className="cc-mod-stat-value">{formatCount(modDetail.mod_downloads)}</span>
                  <span className="cc-mod-stat-label">Downloads</span>
                </div>
                {modDetail.version && (
                  <div className="cc-mod-stat">
                    <span className="cc-mod-stat-value">{modDetail.version}</span>
                    <span className="cc-mod-stat-label">Version</span>
                  </div>
                )}
                {formatUpdated(modDetail.updated_timestamp) && (
                  <div className="cc-mod-stat">
                    <span className="cc-mod-stat-value">{formatUpdated(modDetail.updated_timestamp)}</span>
                    <span className="cc-mod-stat-label">Updated</span>
                  </div>
                )}
              </div>

              {(modDetail.category || (modDetail.tags && modDetail.tags.length > 0)) && (
                <div className="cc-mod-meta">
                  {modDetail.category && (
                    <span className="cc-mod-chip cc-mod-chip-category">{modDetail.category}</span>
                  )}
                  {modDetail.tags?.slice(0, 8).map((tag) => (
                    <span key={tag} className="cc-mod-chip">
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {libraryMods.some((m) => m.nexus_mod_id === modDetail.mod_id) && (
                <p className="cc-mod-installed-badge">Installed on your device</p>
              )}

              {modDetail.summary && (
                <p className="text-sm leading-relaxed text-[var(--cc-text)]">{modDetail.summary}</p>
              )}
              {modDetail.description_html && (() => {
                const plain = stripHtml(modDetail.description_html);
                const truncated = plain.length > 600;
                const shown = showFullDescription || !truncated ? plain : `${plain.slice(0, 600)}…`;
                return (
                  <div className="cc-mod-description">
                    <p className="text-sm leading-relaxed text-[var(--cc-muted)] whitespace-pre-wrap">
                      {shown}
                    </p>
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

              <a
                href={nexusModUrl(gameDomain, modDetail.mod_id)}
                target="_blank"
                rel="noopener noreferrer"
                className="cc-nexus-link"
              >
                Open on Nexus Mods ↗
              </a>

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

              {session.prepare.strategies.length > 0 && (
                <div className="cc-panel space-y-3">
                  <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--cc-gold)]">
                    Deployment method
                  </p>
                  {session.prepare.strategies.map((s) => (
                    <label
                      key={s.id}
                      className={`cc-file ${strategy === s.id ? "cc-file-active" : ""}`}
                    >
                      <input
                        type="radio"
                        name="strategy"
                        checked={strategy === s.id}
                        onChange={() => setStrategy(s.id)}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{s.label}</span>
                        <span className="text-[11px] text-[var(--cc-muted)]">{s.description}</span>
                      </span>
                    </label>
                  ))}
                </div>
              )}

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

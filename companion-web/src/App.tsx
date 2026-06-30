import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { installProgressPct as computeInstallProgressPct } from "./lib/installUi";
import { BottomNav } from "./components/BottomNav";
import { DownloadQueueBar, DownloadQueueSheet } from "./components/DownloadQueueBar";
import { InstallQueueHeaderButton, InstallQueueSheet } from "./components/InstallQueueSheet";
import {
  cancelDownload,
  clearPaired,
  companionAppUrl,
  confirmInstallSession,
  fetchDiscovery,
  fetchDownloads,
  fetchLatest,
  fetchLibraryMods,
  fetchLibraryUpdates,
  fetchLoadOrderState,
  fetchModDetail,
  fetchModFiles,
  fetchTrending,
  getInstallSession,
  isApiNotFoundError,
  isGitHubPagesHost,
  listGames,
  loadPaired,
  pingDeck,
  reorderLibraryMod,
  retryDownload,
  savePaired,
  setLibraryModPosition,
  startInstallSession,
  startModUpdate,
  toggleLibraryMod,
  uninstallLibraryMod,
  updateAllMods,
  type PairedDeck,
  type PingInfo,
} from "./deckApi";
import { hapticSuccess } from "./lib/haptic";
import {
  discoverDevicesOnLan,
  getReceiverSelfHost,
  readConnectParamsFromUrl,
  type LanDevice,
} from "./lib/lanDiscovery";
import { pickDefaultFile } from "./lib/modFiles";
import { DEFAULT_FILTERS, appendTagFilter, loadStoredBrowseFilters, loadStoredBrowseSort, storeBrowseFilters, storeBrowseSort, type ModBrowseSort } from "./lib/modFilters";
import { useDeckConnection } from "./hooks/useDeckConnection";
import { useDocumentVisible } from "./hooks/useDocumentVisible";
import { OUTDATED_DEVICE_MSG } from "./lib/modUi";
import { loadLastGame } from "./lib/preferences";
import { showCompanionNotification } from "./lib/notifications";
import { isStandalonePwa, listenForInstallPrompt, type BeforeInstallPromptEvent } from "./lib/pwa";
import "./lib/themes";
import { BrowseScreen } from "./screens/BrowseScreen";
import { CollectionDetailScreen, CollectionsScreen } from "./screens/CollectionsScreen";
import { ConnectScreen, type ConnectStep } from "./screens/ConnectScreen";
import { InstallScreen } from "./screens/InstallScreen";
import { LibraryScreen } from "./screens/LibraryScreen";
import { LoadOrderScreen } from "./screens/LoadOrderScreen";
import { ModScreen } from "./screens/ModScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { useCompanionSettings } from "./stores/companionSettingsStore";
import {
  useInstallQueueStore,
  type CompanionInstallQueueItem,
} from "./stores/installQueueStore";
import type {
  CompanionDownloadRecord,
  CompanionGame,
  CompanionInstalledMod,
  DiscoveryFeeds,
  InstallSessionStatus,
  ModDetail,
  ModFileInfo,
  ModSearchFilters,
  ModSummary,
  ModUpdateInfo,
  SelectedInstallOption,
} from "./types";
import { EMPTY_DISCOVERY } from "./types";
import { defaultSelectionsFromPrepare } from "./components/InstallOptions";

type Screen =
  | "connect"
  | "browse"
  | "library"
  | "loadorder"
  | "settings"
  | "mod"
  | "install"
  | "collections"
  | "collection-detail";

export default function App() {
  const defaultGameDomainSetting = useCompanionSettings((s) => s.defaultGameDomain);
  const setDefaultGameDomain = useCompanionSettings((s) => s.setDefaultGameDomain);
  const notifications = useCompanionSettings((s) => s.notifications);
  const haptics = useCompanionSettings((s) => s.haptics);
  const compactUi = useCompanionSettings((s) => s.compactUi);
  const [paired, setPaired] = useState<PairedDeck | null>(() => loadPaired());
  const [screen, setScreen] = useState<Screen>(paired ? "browse" : "connect");
  const [connectStep, setConnectStep] = useState<ConnectStep>("find");
  const [collectionSlug, setCollectionSlug] = useState("");
  const installLock = useRef(false);
  const autoConnectTried = useRef(false);

  const [online, setOnline] = useState(true);
  const documentVisible = useDocumentVisible();
  const [host, setHost] = useState(paired?.host ?? "");
  const [port, setPort] = useState(String(paired?.port ?? 8731));
  const [code, setCode] = useState("");
  const [deviceInfo, setDeviceInfo] = useState<PingInfo | null>(null);
  const [connectBusy, setConnectBusy] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [foundDevices, setFoundDevices] = useState<LanDevice[]>([]);
  const [scanProgress, setScanProgress] = useState<{ done: number; total: number } | null>(null);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [downloadQueueOpen, setDownloadQueueOpen] = useState(false);
  const [installQueueOpen, setInstallQueueOpen] = useState(false);
  const [installQueueStarting, setInstallQueueStarting] = useState(false);

  const [games, setGames] = useState<CompanionGame[]>([]);
  const [gameDomain, setGameDomain] = useState(() => loadLastGame());
  const [query, setQuery] = useState("");
  const [discovery, setDiscovery] = useState<DiscoveryFeeds>(EMPTY_DISCOVERY);
  const [searchResults, setSearchResults] = useState<ModSummary[]>([]);
  const [searchTotalCount, setSearchTotalCount] = useState(0);
  const [browseFilters, setBrowseFilters] = useState<ModSearchFilters>(() =>
    loadStoredBrowseFilters(loadLastGame())
  );
  const [browseSort, setBrowseSortState] = useState<ModBrowseSort>(() => loadStoredBrowseSort(loadLastGame()));
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [browseSearchTrigger, setBrowseSearchTrigger] = useState(0);
  const [modReturnScreen, setModReturnScreen] = useState<Screen>("browse");
  const [overwriteFiles, setOverwriteFiles] = useState(false);
  const [browseBusy, setBrowseBusy] = useState(false);
  const [browseError, setBrowseError] = useState<string | null>(null);

  const [libraryMods, setLibraryMods] = useState<CompanionInstalledMod[]>([]);
  const [libraryBusy, setLibraryBusy] = useState(false);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [libraryActionId, setLibraryActionId] = useState<string | null>(null);
  const [updates, setUpdates] = useState<ModUpdateInfo[]>([]);
  const [lootErrorCount, setLootErrorCount] = useState(0);
  const [downloads, setDownloads] = useState<CompanionDownloadRecord[]>([]);

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
  const [showStrategyOverride, setShowStrategyOverride] = useState(false);
  const [conflictAck, setConflictAck] = useState(false);
  const [installBusy, setInstallBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const installQueueItems = useInstallQueueStore((s) => s.items);
  const installQueuePending = useInstallQueueStore(
    (s) => s.items.filter((i) => i.status === "queued").length
  );

  const installedModIds = useMemo(
    () => new Set(libraryMods.map((m) => m.nexus_mod_id)),
    [libraryMods]
  );
  const onGitHubPages = isGitHubPagesHost();
  const deviceCompanionUrl = paired ? companionAppUrl(paired.host, paired.port) : null;
  const receiverSelf = getReceiverSelfHost();
  const activeGame = games.find((g) => g.domain === gameDomain);

  const { online: deckOnline, connectionState, reconnectNow } = useDeckConnection({
    paired,
    onPairedChange: setPaired,
    onAuthLost: () => {
      setScreen("connect");
      setConnectError("Session expired — pair again on your device.");
    },
  });

  useEffect(() => {
    setOnline(deckOnline);
  }, [deckOnline]);

  const setBrowseSort = useCallback(
    (sort: ModBrowseSort) => {
      setBrowseSortState(sort);
      storeBrowseSort(gameDomain, sort);
    },
    [gameDomain]
  );

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

  useEffect(() => listenForInstallPrompt((event) => setInstallPrompt(event)), []);

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
      setDiscovery(await fetchDiscovery(deck, domain));
      setSearchResults([]);
      setSearchTotalCount(0);
      setQuery("");
      setBrowseFilters(loadStoredBrowseFilters(domain));
      setBrowseSortState(loadStoredBrowseSort(domain));
    } catch (e) {
      if (isApiNotFoundError(e)) {
        try {
          const [t, l] = await Promise.all([fetchTrending(deck, domain), fetchLatest(deck, domain)]);
          setDiscovery({ ...EMPTY_DISCOVERY, featured: t.slice(0, 6), trending: t, recently_updated: l });
          setBrowseError("Limited browse — update NexusDeck on your device for full discovery shelves.");
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
      const [mods, upd, lo] = await Promise.all([
        fetchLibraryMods(deck, domain),
        fetchLibraryUpdates(deck, domain).catch(() => [] as ModUpdateInfo[]),
        fetchLoadOrderState(deck, domain).catch(() => null),
      ]);
      setLibraryMods(mods.sort((a, b) => a.sort_order - b.sort_order));
      setUpdates(upd);
      setLootErrorCount(
        Array.isArray(lo?.loot_issues)
          ? lo.loot_issues.filter((i) => i.severity === "error").length
          : 0
      );
    } catch (e) {
      setLibraryError(isApiNotFoundError(e) ? OUTDATED_DEVICE_MSG : e instanceof Error ? e.message : String(e));
      setLibraryMods([]);
    } finally {
      setLibraryBusy(false);
    }
  }, []);

  const refreshBrowse = useCallback(async () => {
    if (!paired || !gameDomain) return;
    await loadBrowse(paired, gameDomain);
  }, [paired, gameDomain, loadBrowse]);

  const refreshGames = useCallback(
    async (deck: PairedDeck) => {
      try {
        const list = await listGames(deck);
        setGames(list);
        if (!list.length) return;
        const saved = defaultGameDomainSetting;
        const pick =
          (saved && list.some((g) => g.domain === saved) && saved) ||
          list.find((g) => g.can_install)?.domain ||
          list[0]!.domain;
        setGameDomain((current) => (current && list.some((g) => g.domain === current) ? current : pick));
      } catch {
        if (deviceInfo?.games?.length) setGames(deviceInfo.games);
      }
    },
    [defaultGameDomainSetting, deviceInfo?.games]
  );

  useEffect(() => {
    if (gameDomain) setDefaultGameDomain(gameDomain);
  }, [gameDomain, setDefaultGameDomain]);

  const updateBrowseFilters = useCallback(
    (next: ModSearchFilters | ((prev: ModSearchFilters) => ModSearchFilters)) => {
      setBrowseFilters((prev) => {
        const resolved = typeof next === "function" ? next(prev) : next;
        storeBrowseFilters(gameDomain, resolved);
        return resolved;
      });
    },
    [gameDomain]
  );

  const handleFilterByTag = useCallback(
    (tag: string) => {
      updateBrowseFilters((prev) => appendTagFilter(prev, tag));
      setBrowseSearchTrigger((n) => n + 1);
      setScreen("browse");
    },
    [updateBrowseFilters]
  );

  useEffect(() => {
    if (!paired) return;
    void refreshGames(paired);
  }, [paired, refreshGames]);

  useEffect(() => {
    if (!paired || !gameDomain) return;
    void loadBrowse(paired, gameDomain);
  }, [paired, gameDomain, loadBrowse]);

  useEffect(() => {
    if (!paired || !gameDomain) return;
    void loadLibrary(paired, gameDomain);
  }, [paired, gameDomain, loadLibrary]);

  useEffect(() => {
    if (!paired || !gameDomain || screen !== "library") return;
    void loadLibrary(paired, gameDomain);
  }, [paired, gameDomain, screen, loadLibrary]);

  useEffect(() => {
    if (!paired || !gameDomain || !documentVisible) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const list = await fetchDownloads(paired, gameDomain);
        if (!cancelled) setDownloads(list);
      } catch {
        /* ignore */
      }
    };
    void poll();
    const id = window.setInterval(() => void poll(), 3000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [paired, gameDomain, documentVisible]);

  useEffect(() => {
    if (!paired || !session?.session_id) return;
    if (["ready", "done", "error"].includes(session.status)) return;
    const timer = window.setInterval(() => {
      void getInstallSession(paired, session.session_id).then((next) => {
        setSession((prev) => {
          if (
            prev &&
            next.status === "downloading" &&
            next.progress &&
            next.progress.progress_pct !== prev.progress?.progress_pct
          ) {
            showCompanionNotification(
              notifications,
              "download_progress",
              "Downloading mod",
              next.message
            );
          }
          return next;
        });
        if (next.prepare && selections.length === 0) {
          setSelections(defaultSelectionsFromPrepare(next.prepare));
        }
        if (next.status === "done") {
          showCompanionNotification(
            notifications,
            "install_complete",
            "Install complete",
            next.message
          );
          if (haptics) hapticSuccess();
          if (paired && gameDomain) void loadLibrary(paired, gameDomain);
        }
        if (next.status === "error" && useInstallQueueStore.getState().processing) {
          useInstallQueueStore.getState().failActive(next.error ?? "Install failed");
        }
      });
    }, 800);
    return () => window.clearInterval(timer);
  }, [paired, gameDomain, session?.session_id, session?.status, selections.length, notifications, haptics, loadLibrary]);

  const openMod = async (mod: ModSummary, from: Screen = screen) => {
    if (!paired) return;
    setModReturnScreen(from === "mod" || from === "install" ? "browse" : from);
    setSelectedMod(mod);
    setScreen("mod");
    setModBusy(true);
    setModDetail(null);
    setModFiles([]);
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

  const beginInstallFromQueueItem = useCallback(
    async (item: CompanionInstallQueueItem) => {
      if (installLock.current || !paired || !activeGame?.can_install) return false;
      installLock.current = true;
      setInstallBusy(true);
      setSession(null);
      setSelections([]);
      setStrategy("auto");
      setConflictAck(false);
      setOverwriteFiles(false);
      setSelectedMod({ mod_id: item.modId, name: item.modName, author: "" });
      setModReturnScreen("browse");
      try {
        const started = await startInstallSession(paired, {
          game_domain: item.gameDomain,
          nexus_mod_id: item.modId,
          nexus_file_id: item.fileId,
          mod_name: item.modName,
          file_name: item.fileName,
          expected_size_kb: item.expectedSizeKb,
          file_version: item.fileVersion,
        });
        setSession(started);
        setScreen("install");
        if (haptics) hapticSuccess();
        return true;
      } catch (e) {
        useInstallQueueStore.getState().failActive(e instanceof Error ? e.message : String(e));
        setBrowseError(e instanceof Error ? e.message : String(e));
        return false;
      } finally {
        setInstallBusy(false);
        installLock.current = false;
      }
    },
    [paired, activeGame?.can_install, haptics]
  );

  const advanceInstallQueue = useCallback(async () => {
    const store = useInstallQueueStore.getState();
    if (store.activeItemId) store.completeActive();
    const next = store.activateNext();
    if (next) {
      await beginInstallFromQueueItem(next);
      return true;
    }
    return false;
  }, [beginInstallFromQueueItem]);

  const startInstallQueue = useCallback(async () => {
    setInstallQueueOpen(false);
    setInstallQueueStarting(true);
    try {
      const next = useInstallQueueStore.getState().startProcessing();
      if (next) await beginInstallFromQueueItem(next);
    } finally {
      setInstallQueueStarting(false);
    }
  }, [beginInstallFromQueueItem]);

  const queueCurrentMod = useCallback(() => {
    if (!selectedMod || !selectedFileId) return;
    const file = modFiles.find((f) => f.file_id === selectedFileId);
    if (!file) return;
    const added = useInstallQueueStore.getState().enqueue({
      gameDomain,
      modId: selectedMod.mod_id,
      modName: selectedMod.name,
      fileId: file.file_id,
      fileName: file.file_name || file.name,
      expectedSizeKb: file.size_kb,
      fileVersion: file.version || null,
      source: "manual",
    });
    if (added) {
      setNote(`Queued "${selectedMod.name}". Open Queue to install when ready.`);
      if (haptics) hapticSuccess();
    } else {
      setNote(`"${selectedMod.name}" is already in the queue.`);
    }
  }, [selectedMod, selectedFileId, modFiles, gameDomain, haptics]);

  const beginInstall = async () => {
    if (installLock.current || !paired || !selectedMod || !selectedFileId || !activeGame?.can_install) return;
    const file = modFiles.find((f) => f.file_id === selectedFileId);
    if (!file) return;
    installLock.current = true;
    setInstallBusy(true);
    setSession(null);
    setSelections([]);
    setStrategy("auto");
    setConflictAck(false);
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
      if (haptics) hapticSuccess();
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
      setSession(
        await confirmInstallSession(paired, session.session_id, {
          selected_options: selections,
          enable_mod: true,
          strategy,
          overwrite_files: overwriteFiles,
        })
      );
    } catch (e) {
      setBrowseError(e instanceof Error ? e.message : String(e));
    } finally {
      setInstallBusy(false);
      installLock.current = false;
    }
  };

  const installProgressPct = computeInstallProgressPct(session);

  const handleToggleMod = async (mod: CompanionInstalledMod) => {
    if (!paired) return;
    setLibraryActionId(mod.id);
    try {
      await toggleLibraryMod(paired, gameDomain, mod.id, !mod.enabled);
      setLibraryMods((prev) => prev.map((m) => (m.id === mod.id ? { ...m, enabled: !m.enabled } : m)));
      if (haptics) hapticSuccess();
    } catch (e) {
      setLibraryError(e instanceof Error ? e.message : String(e));
    } finally {
      setLibraryActionId(null);
    }
  };

  const handleUninstallMod = async (mod: CompanionInstalledMod) => {
    if (!paired || !window.confirm(`Uninstall "${mod.name}" from your device?`)) return;
    setLibraryActionId(mod.id);
    try {
      await uninstallLibraryMod(paired, mod.id);
      setLibraryMods((prev) => prev.filter((m) => m.id !== mod.id));
      setNote(`Uninstalled "${mod.name}".`);
      if (haptics) hapticSuccess();
    } catch (e) {
      setLibraryError(e instanceof Error ? e.message : String(e));
    } finally {
      setLibraryActionId(null);
    }
  };

  const handleReorderMod = async (mod: CompanionInstalledMod, direction: "up" | "down") => {
    if (!paired) return;
    setLibraryActionId(mod.id);
    try {
      const next = await reorderLibraryMod(paired, gameDomain, mod.id, direction);
      setLibraryMods(next.sort((a, b) => a.sort_order - b.sort_order));
      if (haptics) hapticSuccess();
    } catch (e) {
      setLibraryError(e instanceof Error ? e.message : String(e));
    } finally {
      setLibraryActionId(null);
    }
  };

  const handleMoveModToPosition = async (mod: CompanionInstalledMod, position: number) => {
    if (!paired) return;
    setLibraryActionId(mod.id);
    try {
      const next = await setLibraryModPosition(paired, gameDomain, mod.id, position);
      setLibraryMods(next.sort((a, b) => a.sort_order - b.sort_order));
      if (haptics) hapticSuccess();
    } catch (e) {
      setLibraryError(e instanceof Error ? e.message : String(e));
    } finally {
      setLibraryActionId(null);
    }
  };

  const handleUpdateMod = async (update: ModUpdateInfo) => {
    if (!paired) return;
    setLibraryActionId(update.installed_mod_id);
    try {
      await startModUpdate(paired, gameDomain, update.installed_mod_id);
      setNote(`Updating "${update.name}" on your device…`);
      if (haptics) hapticSuccess();
    } catch (e) {
      setLibraryError(e instanceof Error ? e.message : String(e));
    } finally {
      setLibraryActionId(null);
    }
  };

  const handleUpdateAll = async () => {
    if (!paired || !updates.length) return;
    setLibraryActionId("all");
    try {
      const result = await updateAllMods(paired, gameDomain);
      setNote(`Queued ${result.queued.length} update(s).`);
      if (result.errors.length) {
        setLibraryError(result.errors.join(" · "));
      }
      if (haptics) hapticSuccess();
    } catch (e) {
      setLibraryError(e instanceof Error ? e.message : String(e));
    } finally {
      setLibraryActionId(null);
    }
  };

  const handleCancelDownload = async (downloadId: string) => {
    if (!paired) return;
    try {
      await cancelDownload(paired, downloadId);
      setDownloads(await fetchDownloads(paired, gameDomain));
    } catch (e) {
      setBrowseError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleRetryDownload = async (downloadId: string) => {
    if (!paired) return;
    try {
      await retryDownload(paired, downloadId);
      setDownloads(await fetchDownloads(paired, gameDomain));
    } catch (e) {
      setBrowseError(e instanceof Error ? e.message : String(e));
    }
  };

  const refreshLibraryData = useCallback(async () => {
    if (!paired || !gameDomain) return;
    await loadLibrary(paired, gameDomain);
  }, [paired, gameDomain, loadLibrary]);

  const disconnect = () => {
    clearPaired();
    setPaired(null);
    setScreen("connect");
    setSession(null);
  };

  const handlePaired = () => {
    const next = loadPaired();
    setPaired(next);
    if (next) setScreen("browse");
    else {
      setScreen("connect");
      setSession(null);
    }
  };

  const mainTab =
    screen === "mod" || screen === "collections" || screen === "collection-detail"
      ? "browse"
      : screen === "install"
        ? "browse"
        : screen;

  return (
    <div className="shell">
      <header className="cc-header">
        <div className="flex items-center justify-between gap-2">
          <p className="cc-brand">NexusDeck · Companion</p>
          {paired && (
            <div className="flex shrink-0 items-center gap-2">
              <InstallQueueHeaderButton onOpen={() => setInstallQueueOpen(true)} />
              <button
                type="button"
                className={`cc-conn ${online ? "cc-conn-ok" : "cc-conn-bad"}`}
                onClick={() => {
                  if (!online) reconnectNow();
                }}
              >
                <span className="cc-conn-dot" />
                {online ? "Connected" : connectionState === "reconnecting" ? "Reconnecting…" : "Tap to reconnect"}
              </button>
            </div>
          )}
        </div>
        <h1 className="cc-title">{paired ? paired.name : "Mod Catalog"}</h1>
        <p className="cc-sub">
          {paired
            ? "Browse Nexus, queue mods, and install them one at a time on your device."
            : "Pair with your Deck or PC to browse Nexus mods."}
        </p>
      </header>

      {paired && (
        <>
          <DownloadQueueBar downloads={downloads} onOpen={() => setDownloadQueueOpen(true)} />
          <DownloadQueueSheet
            downloads={downloads}
            open={downloadQueueOpen}
            onClose={() => setDownloadQueueOpen(false)}
            onCancel={(id) => void handleCancelDownload(id)}
            onRetry={(id) => void handleRetryDownload(id)}
            onOpenMod={(modId, name) => void openMod({ mod_id: modId, name, author: "" }, "browse")}
          />
          <InstallQueueSheet
            open={installQueueOpen}
            onClose={() => setInstallQueueOpen(false)}
            onStartInstalling={() => void startInstallQueue()}
            starting={installQueueStarting}
          />
          <BottomNav
            active={mainTab}
            onChange={(tab) => setScreen(tab)}
            sessionActive={!!session}
            onInstall={() => session && setScreen("install")}
          />
        </>
      )}

      {!paired && (
        <nav className="cc-tab-bar">
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
            onClick={() => void installPrompt.prompt().then(() => setInstallPrompt(null))}
          >
            Install
          </button>
        </div>
      )}

      {paired && onGitHubPages && deviceCompanionUrl && (
        <p className="cc-banner-warn mx-4 text-xs leading-relaxed">
          GitHub Pages cannot reach your device. Open{" "}
          <a href={deviceCompanionUrl} className="text-[var(--cc-gold)] underline">
            {deviceCompanionUrl}
          </a>{" "}
          on your phone (same Wi‑Fi).
        </p>
      )}

      {note && (screen === "browse" || screen === "library" || screen === "settings") && (
        <p className="cc-banner-ok">{note}</p>
      )}
      {(connectError || browseError) && (
        <p className="cc-banner-err">{screen === "connect" ? connectError : browseError ?? connectError}</p>
      )}

      {screen === "connect" && (
        <ConnectScreen
          paired={paired}
          connectStep={connectStep}
          setConnectStep={setConnectStep}
          host={host}
          setHost={setHost}
          port={port}
          setPort={setPort}
          code={code}
          setCode={setCode}
          deviceInfo={deviceInfo}
          connectBusy={connectBusy}
          foundDevices={foundDevices}
          scanProgress={scanProgress}
          receiverSelf={receiverSelf}
          onConnect={connectToDevice}
          onScan={() => void scanForDevices()}
          onPaired={handlePaired}
          setConnectError={setConnectError}
        />
      )}

      {paired && screen === "browse" && (
        <BrowseScreen
          paired={paired}
          games={games}
          gameDomain={gameDomain}
          setGameDomain={setGameDomain}
          discovery={discovery}
          searchResults={searchResults}
          setSearchResults={setSearchResults}
          searchTotalCount={searchTotalCount}
          setSearchTotalCount={setSearchTotalCount}
          query={query}
          setQuery={setQuery}
          filters={browseFilters}
          setFilters={updateBrowseFilters}
          sort={browseSort}
          setSort={setBrowseSort}
          filterSheetOpen={filterSheetOpen}
          setFilterSheetOpen={setFilterSheetOpen}
          browseSearchTrigger={browseSearchTrigger}
          browseBusy={browseBusy}
          setBrowseBusy={setBrowseBusy}
          setBrowseError={setBrowseError}
          installedModIds={installedModIds}
          onOpenMod={(m) => void openMod(m, "browse")}
          onOpenCollections={() => setScreen("collections")}
          refreshBrowse={refreshBrowse}
        />
      )}

      {paired && screen === "collections" && (
        <CollectionsScreen
          paired={paired}
          gameDomain={gameDomain}
          onBack={() => setScreen("browse")}
          onOpen={(slug) => {
            setCollectionSlug(slug);
            setScreen("collection-detail");
          }}
        />
      )}

      {paired && screen === "collection-detail" && collectionSlug && (
        <CollectionDetailScreen
          paired={paired}
          gameDomain={gameDomain}
          slug={collectionSlug}
          onBack={() => setScreen("collections")}
          onNotify={(msg) => {
            setNote(msg);
            showCompanionNotification(notifications, "collection_complete", "Collection", msg);
          }}
          onOpenMod={(modId, name) => void openMod({ mod_id: modId, name, author: "" }, "collection-detail")}
          onOpenInstallQueue={() => setInstallQueueOpen(true)}
        />
      )}

      {paired && screen === "library" && (
        <LibraryScreen
          games={games}
          gameDomain={gameDomain}
          setGameDomain={setGameDomain}
          libraryMods={libraryMods}
          libraryBusy={libraryBusy}
          libraryError={libraryError}
          libraryActionId={libraryActionId}
          updates={updates}
          lootErrorCount={lootErrorCount}
          compactUi={compactUi}
          onRefresh={refreshLibraryData}
          onOpenMod={(mod) =>
            void openMod({ mod_id: mod.nexus_mod_id, name: mod.name, author: "" }, "library")
          }
          onToggle={(mod) => void handleToggleMod(mod)}
          onUninstall={(mod) => void handleUninstallMod(mod)}
          onReorder={(mod, dir) => void handleReorderMod(mod, dir)}
          onMoveToPosition={(mod, pos) => void handleMoveModToPosition(mod, pos)}
          onUpdateMod={(u) => void handleUpdateMod(u)}
          onUpdateAll={() => void handleUpdateAll()}
          onGoLoadOrder={() => setScreen("loadorder")}
        />
      )}

      {paired && screen === "loadorder" && (
        <LoadOrderScreen
          paired={paired}
          games={games}
          gameDomain={gameDomain}
          setGameDomain={setGameDomain}
          onReorder={(modId, direction) => {
            const mod = libraryMods.find((m) => m.id === modId);
            if (mod) void handleReorderMod(mod, direction);
          }}
          onMoveToPosition={(modId, position) => {
            const mod = libraryMods.find((m) => m.id === modId);
            if (mod) void handleMoveModToPosition(mod, position);
          }}
        />
      )}

      {screen === "settings" && (
        <SettingsScreen
          paired={paired}
          games={games}
          gameDomain={gameDomain}
          onDisconnect={disconnect}
        />
      )}

      {paired && screen === "mod" && selectedMod && (
        <ModScreen
          modDetail={modDetail}
          modFiles={modFiles}
          modBusy={modBusy}
          selectedMod={selectedMod}
          selectedFileId={selectedFileId}
          setSelectedFileId={setSelectedFileId}
          showOtherFiles={showOtherFiles}
          setShowOtherFiles={setShowOtherFiles}
          showFullDescription={showFullDescription}
          setShowFullDescription={setShowFullDescription}
          gameDomain={gameDomain}
          activeGame={activeGame}
          installBusy={installBusy}
          isInstalled={libraryMods.some((m) => m.nexus_mod_id === selectedMod.mod_id)}
          updateInfo={updates.find((u) => u.nexus_mod_id === selectedMod.mod_id) ?? null}
          onBack={() => setScreen(modReturnScreen)}
          onFilterTag={handleFilterByTag}
          onUpdate={(u) => void handleUpdateMod(u)}
          onInstall={() => void beginInstall()}
          onQueue={queueCurrentMod}
          inQueue={
            !!selectedMod &&
            !!selectedFileId &&
            installQueueItems.some(
              (i) =>
                i.gameDomain === gameDomain &&
                i.modId === selectedMod.mod_id &&
                i.fileId === selectedFileId &&
                i.status !== "done" &&
                i.status !== "failed"
            )
          }
        />
      )}

      {paired && screen === "install" && session && (
        <InstallScreen
          paired={paired}
          session={session}
          selections={selections}
          setSelections={setSelections}
          strategy={strategy}
          setStrategy={setStrategy}
          showStrategyOverride={showStrategyOverride}
          setShowStrategyOverride={setShowStrategyOverride}
          installBusy={installBusy}
          installProgressPct={installProgressPct}
          conflictAck={conflictAck}
          setConflictAck={setConflictAck}
          overwriteFiles={overwriteFiles}
          setOverwriteFiles={setOverwriteFiles}
          onConfirm={() => void confirmInstall()}
          onCancel={() => {
            if (useInstallQueueStore.getState().processing) {
              useInstallQueueStore.getState().cancelActive();
            }
            setSession(null);
            setScreen(modReturnScreen);
          }}
          onDone={() => {
            void (async () => {
              await refreshLibraryData();
              const continued = await advanceInstallQueue();
              if (!continued) setScreen(modReturnScreen);
            })();
          }}
          queueRemaining={installQueuePending}
        />
      )}
    </div>
  );
}

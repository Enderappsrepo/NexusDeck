import { useCallback, useEffect, useMemo, useState } from "react";
import {
  clearPaired,
  companionAppUrl,
  loadPaired,
  pairWithDeck,
  pingDeck,
  savePaired,
  searchModsViaDeck,
  sendModViaDeck,
  sendNexusInstall,
  type DeckGame,
  type ModHit,
  type PairedDeck,
  type PingInfo,
} from "./deckApi";
import { getModFiles, loadApiKey, saveApiKey, searchMods } from "./nexusApi";

type Step = "connect" | "pair" | "browse";

function StepIndicator({ step }: { step: Step }) {
  const steps: { id: Step; label: string }[] = [
    { id: "connect", label: "Connect" },
    { id: "pair", label: "Pair" },
    { id: "browse", label: "Send" },
  ];
  const order: Step[] = ["connect", "pair", "browse"];
  const current = order.indexOf(step);

  return (
    <div className="flex items-center justify-between gap-2">
      {steps.map((s, i) => {
        const done = i < current;
        const active = s.id === step;
        return (
          <div key={s.id} className="flex flex-1 flex-col items-center gap-1">
            <div
              className={`step-dot ${active ? "step-dot-active" : done ? "step-dot-done" : "border-[var(--color-border)] text-[var(--color-muted)]"}`}
            >
              {done ? "✓" : i + 1}
            </div>
            <span className={`text-[10px] font-medium ${active ? "text-white" : "text-[var(--color-muted)]"}`}>
              {s.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function App() {
  const [paired, setPaired] = useState<PairedDeck | null>(() => loadPaired());
  const [step, setStep] = useState<Step>(paired ? "browse" : "connect");

  const [host, setHost] = useState(paired?.host ?? "");
  const [port, setPort] = useState(String(paired?.port ?? 8731));
  const [code, setCode] = useState("");
  const [deviceInfo, setDeviceInfo] = useState<PingInfo | null>(null);

  const [connectBusy, setConnectBusy] = useState(false);
  const [pairBusy, setPairBusy] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  const [games, setGames] = useState<DeckGame[]>([]);
  const [usesDeckNexus, setUsesDeckNexus] = useState(true);
  const [showLocalKey, setShowLocalKey] = useState(false);
  const [apiKey, setApiKey] = useState(() => loadApiKey());

  const [gameDomain, setGameDomain] = useState("fallout4");
  const [query, setQuery] = useState("");
  const [mods, setMods] = useState<ModHit[]>([]);
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [sendBusy, setSendBusy] = useState<number | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const [manualModId, setManualModId] = useState("");
  const [manualFileId, setManualFileId] = useState("");
  const [manualName, setManualName] = useState("");
  const [showManual, setShowManual] = useState(false);

  useEffect(() => {
    saveApiKey(apiKey);
  }, [apiKey]);

  const companionLink = useMemo(() => {
    const h = host.trim();
    if (!h) return null;
    return companionAppUrl(h, Number(port) || 8731);
  }, [host, port]);

  const refreshDeviceInfo = useCallback(async (h: string, p: number) => {
    const info = await pingDeck(h, p);
    setDeviceInfo(info);
    if (info.games?.length) {
      setGames(info.games);
      if (!info.games.some((g) => g.domain === gameDomain)) {
        setGameDomain(info.games[0]!.domain);
      }
    }
    setUsesDeckNexus(Boolean(info.nexus_configured));
    return info;
  }, [gameDomain]);

  useEffect(() => {
    if (!paired) return;
    void refreshDeviceInfo(paired.host, paired.port).catch(() => {
      setConnectError("Lost connection to your device — pair again.");
      clearPaired();
      setPaired(null);
      setStep("connect");
    });
  }, [paired, refreshDeviceInfo]);

  const testConnection = useCallback(async () => {
    const h = host.trim();
    const p = Number(port) || 8731;
    if (!h) {
      setConnectError("Enter the IP address shown on your Deck or PC.");
      return;
    }
    setConnectBusy(true);
    setConnectError(null);
    setNote(null);
    try {
      const info = await refreshDeviceInfo(h, p);
      setStep("pair");
      if (!info.nexus_configured) {
        setNote("Connected — sign in with your Nexus API key on the Deck/PC in Settings, or paste a key below after pairing.");
      }
    } catch (e) {
      setConnectError(e instanceof Error ? e.message : String(e));
    } finally {
      setConnectBusy(false);
    }
  }, [host, port, refreshDeviceInfo]);

  const completePairing = useCallback(async () => {
    const h = host.trim();
    const p = Number(port) || 8731;
    if (code.length !== 6) {
      setConnectError("Enter the 6-digit code from Settings → Remote install.");
      return;
    }
    setPairBusy(true);
    setConnectError(null);
    try {
      const token = await pairWithDeck(h, p, code.trim());
      const info = deviceInfo ?? (await pingDeck(h, p));
      const next: PairedDeck = { name: info.name, host: h, port: p, token };
      savePaired(next);
      setPaired(next);
      setCode("");
      setStep("browse");
      setNote(`Paired with ${info.name}. Search uses the Nexus account on that device.`);
      if (info.games?.length) setGames(info.games);
      setUsesDeckNexus(Boolean(info.nexus_configured));
    } catch (e) {
      setConnectError(e instanceof Error ? e.message : String(e));
    } finally {
      setPairBusy(false);
    }
  }, [host, port, code, deviceInfo]);

  const search = useCallback(async () => {
    if (!query.trim()) {
      setSearchError("Enter a mod name to search.");
      return;
    }
    if (!paired) return;

    setSearchBusy(true);
    setSearchError(null);
    setNote(null);
    try {
      if (usesDeckNexus) {
        setMods(await searchModsViaDeck(paired, gameDomain, query.trim()));
      } else {
        if (!apiKey.trim()) {
          setSearchError("Paste your Nexus API key or use the account on your Deck/PC.");
          return;
        }
        setMods(await searchMods(apiKey.trim(), gameDomain, query.trim()));
      }
    } catch (e) {
      setSearchError(e instanceof Error ? e.message : String(e));
    } finally {
      setSearchBusy(false);
    }
  }, [apiKey, gameDomain, paired, query, usesDeckNexus]);

  const sendMod = async (mod: ModHit) => {
    if (!paired) return;
    setSendBusy(mod.mod_id);
    setSearchError(null);
    setNote(null);
    try {
      if (usesDeckNexus) {
        setNote(await sendModViaDeck(paired, gameDomain, mod.mod_id, mod.name));
      } else if (apiKey.trim()) {
        const files = await getModFiles(apiKey.trim(), gameDomain, mod.mod_id);
        const file = files.find((f) => f.is_primary) ?? files[0];
        if (!file) throw new Error("No downloadable file found.");
        setNote(
          await sendNexusInstall(paired, {
            game_domain: gameDomain,
            nexus_mod_id: mod.mod_id,
            nexus_file_id: file.file_id,
            mod_name: mod.name,
            file_name: file.file_name || file.name,
            expected_size_kb: file.size_kb,
            file_version: file.version || null,
          })
        );
      } else {
        throw new Error("No Nexus API key available.");
      }
    } catch (e) {
      setSearchError(e instanceof Error ? e.message : String(e));
    } finally {
      setSendBusy(null);
    }
  };

  const sendManual = async () => {
    if (!paired) return;
    setSearchError(null);
    setNote(null);
    try {
      setNote(
        await sendNexusInstall(paired, {
          game_domain: gameDomain,
          nexus_mod_id: Number(manualModId),
          nexus_file_id: Number(manualFileId),
          mod_name: manualName || `Mod ${manualModId}`,
          file_name: `${manualName || "mod"}.zip`,
          expected_size_kb: 1,
        })
      );
    } catch (e) {
      setSearchError(e instanceof Error ? e.message : String(e));
    }
  };

  const gameOptions = games.length
    ? games
    : [
        { domain: "fallout4", name: "Fallout 4" },
        { domain: "skyrimspecialedition", name: "Skyrim SE" },
      ];

  return (
    <div className="shell">
      <header className="hero">
        <p className="label">NexusDeck</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-white">Mobile Companion</h1>
        <p className="mt-2 text-sm leading-relaxed text-[var(--color-muted)]">
          Browse on your phone. Your Deck or PC downloads from Nexus — nothing large is sent from
          this device.
        </p>
      </header>

      {!paired && <StepIndicator step={step} />}

      {companionLink && step !== "browse" && (
        <div className="banner-warn">
          <p className="font-medium text-white">Tip: use the on-network companion</p>
          <p className="mt-1 text-[var(--color-muted)]">
            If GitHub Pages gets stuck connecting, open this link on your phone (same Wi‑Fi):
          </p>
          <a className="mt-2 block break-all font-mono text-sm text-[var(--color-primary)]" href={companionLink}>
            {companionLink}
          </a>
        </div>
      )}

      {!paired && step === "connect" && (
        <section className="card space-y-4">
          <div>
            <h2 className="text-lg font-semibold">1. Find your device</h2>
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              On the <strong>Steam Deck</strong> (or PC): Settings → Remote install → turn{" "}
              <strong>Receive</strong> on.
            </p>
          </div>

          <div className="card-soft space-y-2 text-sm text-[var(--color-muted)]">
            <p>
              <strong className="text-white">Deck IP:</strong> Settings → Internet → Wi‑Fi → your
              network
            </p>
            <p>
              <strong className="text-white">PC IP:</strong> run <code className="text-[var(--color-primary)]">ipconfig</code>{" "}
              in Command Prompt
            </p>
          </div>

          <div className="space-y-2">
            <label className="label" htmlFor="host">
              Device IP address
            </label>
            <input
              id="host"
              className="input"
              placeholder="192.168.1.42"
              inputMode="decimal"
              autoComplete="off"
              value={host}
              onChange={(e) => setHost(e.target.value)}
            />
            <label className="label" htmlFor="port">
              Port
            </label>
            <input
              id="port"
              className="input"
              placeholder="8731"
              inputMode="numeric"
              value={port}
              onChange={(e) => setPort(e.target.value.replace(/\D/g, "").slice(0, 5))}
            />
          </div>

          <button type="button" className="btn w-full" disabled={connectBusy} onClick={() => void testConnection()}>
            {connectBusy ? "Testing connection…" : "Test connection"}
          </button>
        </section>
      )}

      {!paired && step === "pair" && (
        <section className="card space-y-4">
          <div>
            <h2 className="text-lg font-semibold">2. Pair securely</h2>
            {deviceInfo && (
              <p className="mt-1 text-sm text-[var(--color-success)]">
                Found <strong>{deviceInfo.name}</strong>
                {deviceInfo.version ? ` · v${deviceInfo.version}` : ""}
              </p>
            )}
            <p className="mt-2 text-sm text-[var(--color-muted)]">
              Enter the 6-digit code shown next to <strong>Pairing code</strong> on the device.
            </p>
          </div>

          <input
            className="input input-code"
            placeholder="000000"
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          />

          <div className="flex gap-2">
            <button type="button" className="btn-secondary flex-1" onClick={() => setStep("connect")}>
              Back
            </button>
            <button
              type="button"
              className="btn flex-1"
              disabled={pairBusy || code.length !== 6}
              onClick={() => void completePairing()}
            >
              {pairBusy ? "Pairing…" : "Pair"}
            </button>
          </div>
        </section>
      )}

      {paired && (
        <>
          <section className="banner-success flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold text-white">Paired with {paired.name}</p>
              <p className="text-xs text-[var(--color-muted)]">{paired.host}:{paired.port}</p>
            </div>
            <button
              type="button"
              className="btn-ghost shrink-0"
              onClick={() => {
                clearPaired();
                setPaired(null);
                setStep("connect");
                setDeviceInfo(null);
                setMods([]);
              }}
            >
              Unpair
            </button>
          </section>

          <section className="card space-y-4">
            <div>
              <h2 className="text-lg font-semibold">Search & send</h2>
              {usesDeckNexus ? (
                <p className="mt-1 text-sm text-[var(--color-success)]">
                  Using the Nexus account saved on {paired.name} — no API key needed on your phone.
                </p>
              ) : (
                <p className="mt-1 text-sm text-[var(--color-danger)]">
                  No Nexus key on {paired.name}. Sign in under Settings on that device, or paste a key
                  below.
                </p>
              )}
            </div>

            {!usesDeckNexus && (
              <div className="banner-warn">
                <p className="text-sm">
                  Open NexusDeck on your Deck/PC → Settings → paste your Nexus API key → then tap
                  refresh below.
                </p>
                <button
                  type="button"
                  className="btn-secondary mt-3 w-full"
                  onClick={() =>
                    void refreshDeviceInfo(paired.host, paired.port)
                      .then((info) => {
                        setUsesDeckNexus(Boolean(info.nexus_configured));
                        if (info.nexus_configured) setNote("Nexus account detected on your device.");
                      })
                      .catch((e) => setSearchError(e instanceof Error ? e.message : String(e)))
                  }
                >
                  Refresh device status
                </button>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {gameOptions.map((g) => (
                <button
                  key={g.domain}
                  type="button"
                  className={gameDomain === g.domain ? "chip chip-active" : "chip"}
                  onClick={() => setGameDomain(g.domain)}
                >
                  {g.name}
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              <input
                className="input flex-1"
                placeholder="Search mods…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void search()}
              />
              <button type="button" className="btn shrink-0" disabled={searchBusy} onClick={() => void search()}>
                {searchBusy ? "…" : "Search"}
              </button>
            </div>

            <button
              type="button"
              className="text-sm text-[var(--color-muted)] underline"
              onClick={() => setShowLocalKey((v) => !v)}
            >
              {showLocalKey ? "Hide phone API key" : "Advanced: use API key on this phone instead"}
            </button>

            {showLocalKey && (
              <div className="space-y-2">
                <input
                  className="input"
                  type="password"
                  placeholder="Nexus API key (optional fallback)"
                  value={apiKey}
                  onChange={(e) => {
                    setApiKey(e.target.value);
                    if (e.target.value.trim()) setUsesDeckNexus(false);
                  }}
                />
                <p className="text-xs text-[var(--color-muted)]">
                  Stored only in this browser.{" "}
                  <a
                    className="text-[var(--color-primary)]"
                    href="https://www.nexusmods.com/users/myaccount?tab=api"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Get an API key
                  </a>
                </p>
                {apiKey.trim() && (
                  <button type="button" className="btn-secondary w-full" onClick={() => setUsesDeckNexus(false)}>
                    Search with phone key
                  </button>
                )}
                {usesDeckNexus && apiKey.trim() && (
                  <button type="button" className="btn-secondary w-full" onClick={() => setUsesDeckNexus(true)}>
                    Use device Nexus account again
                  </button>
                )}
              </div>
            )}

            {searchError && <p className="banner-error">{searchError}</p>}
            {note && <p className="rounded-xl bg-[var(--color-success)]/10 p-3 text-sm text-[var(--color-success)]">{note}</p>}

            <ul className="space-y-2">
              {mods.map((mod) => (
                <li key={mod.mod_id} className="mod-row">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{mod.name}</p>
                    <p className="truncate text-xs text-[var(--color-muted)]">{mod.author}</p>
                  </div>
                  <button
                    type="button"
                    className="btn-sm shrink-0"
                    disabled={sendBusy !== null}
                    onClick={() => void sendMod(mod)}
                  >
                    {sendBusy === mod.mod_id ? "…" : "Send"}
                  </button>
                </li>
              ))}
              {!searchBusy && mods.length === 0 && query.trim() && (
                <p className="text-center text-sm text-[var(--color-muted)]">Search to find mods.</p>
              )}
            </ul>
          </section>

          <section className="card-soft">
            <button
              type="button"
              className="flex w-full items-center justify-between text-left"
              onClick={() => setShowManual((v) => !v)}
            >
              <span className="font-semibold">Manual send by mod/file ID</span>
              <span className="text-[var(--color-muted)]">{showManual ? "−" : "+"}</span>
            </button>
            {showManual && (
              <div className="mt-3 space-y-2">
                <p className="text-xs text-[var(--color-muted)]">
                  Copy IDs from the Nexus website if search is unavailable.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    className="input"
                    placeholder="Mod ID"
                    inputMode="numeric"
                    value={manualModId}
                    onChange={(e) => setManualModId(e.target.value.replace(/\D/g, ""))}
                  />
                  <input
                    className="input"
                    placeholder="File ID"
                    inputMode="numeric"
                    value={manualFileId}
                    onChange={(e) => setManualFileId(e.target.value.replace(/\D/g, ""))}
                  />
                </div>
                <input
                  className="input"
                  placeholder="Mod name (optional)"
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                />
                <button type="button" className="btn w-full" onClick={() => void sendManual()}>
                  Send by ID
                </button>
              </div>
            )}
          </section>
        </>
      )}

      {(connectError || (!paired && note)) && (
        <div className={connectError ? "banner-error" : "rounded-xl bg-[var(--color-success)]/10 p-3 text-sm text-[var(--color-success)]"}>
          {connectError ?? note}
        </div>
      )}

      <footer className="text-center text-xs leading-relaxed text-[var(--color-muted)]">
        Enable <strong className="text-white">Auto-install after download</strong> on the Deck for
        hands-free installs. FOMOD options and load-order sync require the full NexusDeck app.
      </footer>
    </div>
  );
}

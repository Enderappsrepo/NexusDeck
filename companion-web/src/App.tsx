import { useCallback, useEffect, useState } from "react";
import {
  clearPaired,
  loadPaired,
  pairWithDeck,
  pingDeck,
  savePaired,
  sendNexusInstall,
  type PairedDeck,
} from "./deckApi";
import { getModFiles, loadApiKey, saveApiKey, searchMods } from "./nexusApi";

const GAMES = [
  { domain: "fallout4", label: "Fallout 4" },
  { domain: "skyrimspecialedition", label: "Skyrim SE" },
];

export default function App() {
  const [paired, setPaired] = useState<PairedDeck | null>(() => loadPaired());
  const [host, setHost] = useState("");
  const [port, setPort] = useState("8731");
  const [code, setCode] = useState("");
  const [pairBusy, setPairBusy] = useState(false);
  const [pairError, setPairError] = useState<string | null>(null);

  const [apiKey, setApiKey] = useState(() => loadApiKey());
  const [gameDomain, setGameDomain] = useState("fallout4");
  const [query, setQuery] = useState("");
  const [mods, setMods] = useState<{ mod_id: number; name: string; author: string }[]>([]);
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [sendBusy, setSendBusy] = useState<number | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const [manualModId, setManualModId] = useState("");
  const [manualFileId, setManualFileId] = useState("");
  const [manualName, setManualName] = useState("");

  useEffect(() => {
    saveApiKey(apiKey);
  }, [apiKey]);

  const connect = useCallback(async () => {
    const h = host.trim();
    const p = Number(port) || 8731;
    if (!h) return;
    setPairBusy(true);
    setPairError(null);
    try {
      const info = await pingDeck(h, p);
      if (code.length !== 6) {
        setPairError(`Found ${info.name}. Enter the 6-digit code from the Deck and tap Pair.`);
        return;
      }
      const token = await pairWithDeck(h, p, code.trim());
      const next: PairedDeck = { name: info.name, host: h, port: p, token };
      savePaired(next);
      setPaired(next);
      setCode("");
      setNote(`Paired with ${info.name}.`);
    } catch (e) {
      setPairError(e instanceof Error ? e.message : String(e));
    } finally {
      setPairBusy(false);
    }
  }, [host, port, code]);

  const search = useCallback(async () => {
    if (!apiKey.trim() || !query.trim()) {
      setSearchError("Enter your Nexus API key and a search term.");
      return;
    }
    setSearchBusy(true);
    setSearchError(null);
    try {
      setMods(await searchMods(apiKey.trim(), gameDomain, query.trim()));
    } catch (e) {
      setSearchError(e instanceof Error ? e.message : String(e));
    } finally {
      setSearchBusy(false);
    }
  }, [apiKey, gameDomain, query]);

  const sendMod = async (modId: number, modName: string) => {
    if (!paired || !apiKey.trim()) return;
    setSendBusy(modId);
    setNote(null);
    setSearchError(null);
    try {
      const files = await getModFiles(apiKey.trim(), gameDomain, modId);
      const file = files.find((f) => f.is_primary) ?? files[0];
      if (!file) throw new Error("No downloadable file found.");
      setNote(
        await sendNexusInstall(paired, {
          game_domain: gameDomain,
          nexus_mod_id: modId,
          nexus_file_id: file.file_id,
          mod_name: modName,
          file_name: file.file_name || file.name,
          expected_size_kb: file.size_kb,
          file_version: file.version || null,
        })
      );
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

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col gap-4 p-4 pb-10">
      <header>
        <h1 className="text-2xl font-bold text-[var(--color-primary)]">NexusDeck Companion</h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Browse on your phone, install on your Steam Deck. The Deck downloads from Nexus — nothing
          huge is uploaded from this device.
        </p>
      </header>

      {!paired ? (
        <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-4">
          <h2 className="font-semibold">Pair with your Deck</h2>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            On the Deck: Settings → Remote install → turn on <strong>Receive</strong>, note the code.
          </p>
          <div className="mt-3 flex flex-col gap-2">
            <input
              className="input"
              placeholder="Deck IP (e.g. 192.168.1.42)"
              value={host}
              onChange={(e) => setHost(e.target.value)}
            />
            <input
              className="input"
              placeholder="Port (8731)"
              inputMode="numeric"
              value={port}
              onChange={(e) => setPort(e.target.value.replace(/\D/g, "").slice(0, 5))}
            />
            <input
              className="input text-center font-mono tracking-[0.3em]"
              placeholder="6-digit code"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            />
            <button type="button" className="btn" disabled={pairBusy} onClick={() => void connect()}>
              {pairBusy ? "Connecting…" : code.length === 6 ? "Pair" : "Connect"}
            </button>
          </div>
          {pairError && <p className="mt-2 text-sm text-[var(--color-danger)]">{pairError}</p>}
        </section>
      ) : (
        <>
          <section className="flex items-center justify-between rounded-2xl border border-[var(--color-success)]/40 bg-[var(--color-success)]/10 p-3">
            <div>
              <p className="font-medium">Paired with {paired.name}</p>
              <p className="text-xs text-[var(--color-muted)]">{paired.host}</p>
            </div>
            <button
              type="button"
              className="btn-ghost text-sm"
              onClick={() => {
                clearPaired();
                setPaired(null);
              }}
            >
              Unpair
            </button>
          </section>

          <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-4">
            <h2 className="font-semibold">Nexus API key</h2>
            <p className="mt-1 text-xs text-[var(--color-muted)]">
              Stored only on this device. Needed to search mods in the browser.
            </p>
            <input
              className="input mt-2"
              type="password"
              placeholder="Paste Nexus API key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
            <div className="mt-3 flex flex-wrap gap-2">
              {GAMES.map((g) => (
                <button
                  key={g.domain}
                  type="button"
                  className={gameDomain === g.domain ? "chip chip-active" : "chip"}
                  onClick={() => setGameDomain(g.domain)}
                >
                  {g.label}
                </button>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <input
                className="input flex-1"
                placeholder="Search mods…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void search()}
              />
              <button type="button" className="btn" disabled={searchBusy} onClick={() => void search()}>
                {searchBusy ? "…" : "Search"}
              </button>
            </div>
            {searchError && <p className="mt-2 text-sm text-[var(--color-danger)]">{searchError}</p>}
            {note && <p className="mt-2 text-sm text-[var(--color-success)]">{note}</p>}
            <ul className="mt-3 space-y-2">
              {mods.map((mod) => (
                <li
                  key={mod.mod_id}
                  className="flex items-center gap-2 rounded-xl bg-black/20 p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{mod.name}</p>
                    <p className="truncate text-xs text-[var(--color-muted)]">{mod.author}</p>
                  </div>
                  <button
                    type="button"
                    className="btn-sm"
                    disabled={sendBusy !== null}
                    onClick={() => void sendMod(mod.mod_id, mod.name)}
                  >
                    {sendBusy === mod.mod_id ? "…" : "Send"}
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-2xl border border-dashed border-[var(--color-border)] p-4">
            <h2 className="text-sm font-semibold">Manual send</h2>
            <p className="mt-1 text-xs text-[var(--color-muted)]">
              If search is blocked by the browser, enter Nexus mod/file IDs from the website.
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
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
              className="input mt-2"
              placeholder="Mod name (optional)"
              value={manualName}
              onChange={(e) => setManualName(e.target.value)}
            />
            <button type="button" className="btn mt-2 w-full" onClick={() => void sendManual()}>
              Send by ID
            </button>
          </section>
        </>
      )}

      <p className="text-center text-xs text-[var(--color-muted)]">
        Install the full NexusDeck app on PC/Deck for FOMOD options, load order sync, and presets.
      </p>

      <style>{`
        .input {
          width: 100%;
          border-radius: 0.75rem;
          border: 1px solid var(--color-border);
          background: #0e1018;
          padding: 0.65rem 0.85rem;
          color: inherit;
          font-size: 1rem;
        }
        .btn {
          border-radius: 0.75rem;
          background: var(--color-primary);
          color: #0a0b10;
          font-weight: 600;
          padding: 0.65rem 1rem;
          border: none;
        }
        .btn:disabled { opacity: 0.6; }
        .btn-sm {
          border-radius: 0.65rem;
          background: var(--color-primary);
          color: #0a0b10;
          font-weight: 600;
          padding: 0.45rem 0.75rem;
          border: none;
          font-size: 0.875rem;
        }
        .btn-ghost {
          background: transparent;
          border: 1px solid var(--color-border);
          border-radius: 0.65rem;
          padding: 0.35rem 0.65rem;
          color: inherit;
        }
        .chip {
          border-radius: 999px;
          border: 1px solid var(--color-border);
          padding: 0.35rem 0.75rem;
          font-size: 0.875rem;
          background: transparent;
          color: inherit;
        }
        .chip-active {
          border-color: var(--color-primary);
          background: color-mix(in srgb, var(--color-primary) 20%, transparent);
        }
      `}</style>
    </div>
  );
}

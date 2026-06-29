import { useCallback, useEffect, useState } from "react";
import { Loader2, MonitorSmartphone, RefreshCw, Wifi, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/commands";
import {
  clearPairedDeck,
  loadPairedDeck,
  savePairedDeck,
  type PairedDeck,
} from "@/lib/remote/pairedDeck";
import { useSettingsStore } from "@/stores/settingsStore";
import type { DiscoveredDeck, RemoteReceiverStatus } from "@/lib/nexus/types";

/**
 * PC↔Deck remote install: pair on the same Wi-Fi, then push mods, BodySlide
 * presets, and load order from the PC to a paired Deck.
 */
export function RemoteSyncPanel() {
  const deckDetected = useSettingsStore((s) => s.deckDetected);
  const [status, setStatus] = useState<RemoteReceiverStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [scanning, setScanning] = useState(false);
  const [found, setFound] = useState<DiscoveredDeck[]>([]);
  const [scanned, setScanned] = useState(false);
  const [pairTarget, setPairTarget] = useState<DiscoveredDeck | null>(null);
  const [code, setCode] = useState("");
  const [pairing, setPairing] = useState(false);
  const [paired, setPaired] = useState<PairedDeck | null>(() => loadPairedDeck());

  const [manualHost, setManualHost] = useState("");
  const [manualPort, setManualPort] = useState("8731");
  const [manualBusy, setManualBusy] = useState(false);

  useEffect(() => {
    api.getRemoteReceiverStatus().then(setStatus).catch(() => {});
  }, []);

  const toggleReceiver = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const next = status?.running
        ? await api.stopRemoteReceiver()
        : await api.startRemoteReceiver(deckDetected ? "Steam Deck" : "This PC");
      setStatus(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [status?.running, deckDetected]);

  const scan = useCallback(async () => {
    setScanning(true);
    setError(null);
    try {
      setFound(await api.discoverDecks());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setScanning(false);
      setScanned(true);
    }
  }, []);

  const confirmPair = useCallback(async () => {
    if (!pairTarget) return;
    setPairing(true);
    setError(null);
    try {
      const token = await api.pairWithDeck(pairTarget.host, pairTarget.http_port, code.trim());
      const next: PairedDeck = {
        name: pairTarget.name,
        host: pairTarget.host,
        port: pairTarget.http_port,
        token,
      };
      savePairedDeck(next);
      setPaired(next);
      setPairTarget(null);
      setCode("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPairing(false);
    }
  }, [pairTarget, code]);

  const connectManual = useCallback(async () => {
    const host = manualHost.trim();
    const port = Number(manualPort.trim()) || 8731;
    if (!host) return;
    setManualBusy(true);
    setError(null);
    try {
      const deck = await api.pingDeck(host, port);
      setPairTarget({ ...deck, host, http_port: port });
      setCode("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setManualBusy(false);
    }
  }, [manualHost, manualPort]);

  const unpair = useCallback(() => {
    clearPairedDeck();
    setPaired(null);
  }, []);

  return (
    <Card className="space-y-5 p-5">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--color-primary)]/15 text-[var(--color-primary)]">
          <MonitorSmartphone className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold">Remote install (PC ↔ Deck)</h2>
          <p className="text-sm text-[var(--color-muted)]">
            Pair your PC and Deck on the same Wi-Fi to push mods, BodySlide presets, and load
            order.
          </p>
        </div>
      </div>

      {error && (
        <p className="rounded-xl bg-[var(--color-danger)]/10 p-3 text-sm text-[var(--color-danger)]">
          {error}
        </p>
      )}

      {/* Receive on this device (enable on the Deck) */}
      <div className="rounded-2xl border border-[var(--color-border)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {status?.running ? (
              <Wifi className="h-5 w-5 text-[var(--color-success)]" />
            ) : (
              <WifiOff className="h-5 w-5 text-[var(--color-muted)]" />
            )}
            <div>
              <p className="font-semibold">Receive on this device</p>
              <p className="text-sm text-[var(--color-muted)]">
                {status?.running
                  ? "Discoverable on your Wi-Fi — pair from the other device."
                  : "Turn on so your PC can send mods here."}
              </p>
            </div>
          </div>
          <Button
            variant={status?.running ? "outline" : "default"}
            onClick={() => void toggleReceiver()}
            loading={busy}
            data-focusable="true"
          >
            {status?.running ? "Turn off" : "Turn on"}
          </Button>
        </div>

        {status?.running && (
          <div className="mt-4 flex items-center gap-3 rounded-xl bg-[var(--color-secondary)]/50 p-4">
            <span className="text-sm text-[var(--color-muted)]">Pairing code</span>
            <span className="font-mono text-2xl font-bold tracking-[0.3em] text-[var(--color-primary)]">
              {status.pair_code}
            </span>
            {status.paired && (
              <Badge variant="success" className="ml-auto">
                Paired
              </Badge>
            )}
          </div>
        )}
      </div>

      {/* Send to a Deck (use on the PC) */}
      <div className="rounded-2xl border border-[var(--color-border)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-semibold">Send to a Deck</p>
            <p className="text-sm text-[var(--color-muted)]">
              Find a Deck that has “Receive” turned on, then pair with its code.
            </p>
          </div>
          <Button
            variant="secondary"
            onClick={() => void scan()}
            loading={scanning}
            data-focusable="true"
          >
            <RefreshCw className="h-4 w-4" />
            Scan Wi-Fi
          </Button>
        </div>

        {paired && (
          <div className="mt-3 flex items-center gap-3 rounded-xl border border-[var(--color-success)]/30 bg-[var(--color-success)]/10 p-3">
            <Wifi className="h-5 w-5 text-[var(--color-success)]" />
            <div className="min-w-0">
              <p className="font-medium">Paired with {paired.name}</p>
              <p className="truncate text-xs text-[var(--color-muted)]">{paired.host}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={unpair} className="ml-auto" data-focusable="true">
              Unpair
            </Button>
          </div>
        )}

        <div className="mt-4 space-y-2 rounded-xl border border-dashed border-[var(--color-border)] p-3">
          <p className="text-sm font-medium">Manual IP (if scan finds nothing)</p>
          <p className="text-xs text-[var(--color-muted)]">
            Some routers block Wi-Fi broadcast. Enter the Deck&apos;s IP from Settings → Internet
            → Wi-Fi → your network.
          </p>
          <div className="flex flex-wrap gap-2">
            <Input
              value={manualHost}
              onChange={(e) => setManualHost(e.target.value)}
              placeholder="192.168.1.42"
              className="min-w-[10rem] flex-1"
              data-focusable="true"
            />
            <Input
              value={manualPort}
              onChange={(e) => setManualPort(e.target.value.replace(/\D/g, "").slice(0, 5))}
              placeholder="8731"
              className="w-24"
              inputMode="numeric"
              data-focusable="true"
            />
            <Button
              variant="secondary"
              onClick={() => void connectManual()}
              loading={manualBusy}
              disabled={!manualHost.trim()}
              data-focusable="true"
            >
              Connect
            </Button>
          </div>
        </div>

        {scanning && (
          <p className="mt-3 flex items-center gap-2 text-sm text-[var(--color-muted)]">
            <Loader2 className="h-4 w-4 animate-spin" />
            Looking for Decks on your network…
          </p>
        )}

        {!scanning && scanned && found.length === 0 && (
          <p className="mt-3 text-sm text-[var(--color-muted)]">
            No Decks found via broadcast. Try manual IP above, or confirm the Deck has “Receive”
            turned on.
          </p>
        )}

        {found.length > 0 && (
          <div className="mt-3 space-y-2">
            {found.map((deck) => (
              <div
                key={deck.host}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[var(--color-secondary)]/40 p-3"
              >
                <div className="min-w-0">
                  <p className="font-medium">{deck.name}</p>
                  <p className="truncate text-xs text-[var(--color-muted)]">
                    {deck.host}
                    {deck.version ? ` · v${deck.version}` : ""}
                  </p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setPairTarget(deck);
                    setCode("");
                  }}
                  data-focusable="true"
                >
                  Pair
                </Button>
              </div>
            ))}
          </div>
        )}

        {pairTarget && (
          <div className="mt-3 space-y-3 rounded-xl border border-[var(--color-primary)]/30 p-4">
            <p className="text-sm">
              Enter the 6-digit code shown on <strong>{pairTarget.name}</strong>.
            </p>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
              inputMode="numeric"
              className="text-center font-mono text-xl tracking-[0.3em]"
              data-focusable="true"
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setPairTarget(null)} data-focusable="true">
                Cancel
              </Button>
              <Button
                onClick={() => void confirmPair()}
                loading={pairing}
                disabled={code.length !== 6}
                data-focusable="true"
              >
                Pair
              </Button>
            </div>
          </div>
        )}
      </div>

      <p className="text-xs text-[var(--color-muted)]">
        After pairing on your PC, use <strong>Send to Deck</strong> on mod pages, the load-order
        screen, or the BodySlide panel. The Deck must have the same game profile set up first.
      </p>
    </Card>
  );
}

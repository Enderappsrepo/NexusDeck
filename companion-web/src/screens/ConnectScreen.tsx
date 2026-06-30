import { CompanionQrDisplay } from "../components/CompanionQrDisplay";
import { QrScanPanel } from "../components/QrScanPanel";
import { clearPaired, companionAppUrl, pairWithDeck, pingDeck, savePaired, type PairedDeck, type PingInfo } from "../deckApi";
import { getReceiverSelfHost, type LanDevice } from "../lib/lanDiscovery";

export type ConnectStep = "find" | "pair" | "manual" | "qr";

export function ConnectScreen({
  paired,
  connectStep,
  setConnectStep,
  host,
  setHost,
  port,
  setPort,
  code,
  setCode,
  deviceInfo,
  connectBusy,
  foundDevices,
  scanProgress,
  receiverSelf,
  onConnect,
  onScan,
  onPaired,
  setConnectError,
}: {
  paired: PairedDeck | null;
  connectStep: ConnectStep;
  setConnectStep: (s: ConnectStep) => void;
  host: string;
  setHost: (h: string) => void;
  port: string;
  setPort: (p: string) => void;
  code: string;
  setCode: (c: string) => void;
  deviceInfo: PingInfo | null;
  connectBusy: boolean;
  foundDevices: LanDevice[];
  scanProgress: { done: number; total: number } | null;
  receiverSelf: ReturnType<typeof getReceiverSelfHost>;
  onConnect: (host: string, port: number) => void;
  onScan: () => void;
  onPaired: () => void;
  setConnectError: (msg: string | null) => void;
}) {
  return (
    <div className="cc-body">
      {!paired ? (
        <>
          {receiverSelf && connectStep === "find" && (
            <>
              <p className="cc-banner-ok text-xs">
                You're on your NexusDeck device — scan the QR below from your phone, or pair directly.
              </p>
              <CompanionQrDisplay host={receiverSelf.host} port={receiverSelf.port} title="Pair your phone" />
              <button
                type="button"
                className="cc-btn-secondary w-full"
                disabled={connectBusy}
                onClick={() => onConnect(receiverSelf.host, receiverSelf.port)}
              >
                Use this device ({receiverSelf.host})
              </button>
            </>
          )}

          {connectStep === "find" && !receiverSelf && (
            <div className="cc-panel space-y-3">
              <p className="text-xs uppercase tracking-wider text-[var(--cc-muted)]">Find your PC or Deck</p>
              <p className="text-sm leading-relaxed text-[var(--cc-muted)]">
                On the same Wi‑Fi, NexusDeck can scan your network — no IP required. Turn on{" "}
                <strong>Receive</strong> in NexusDeck Settings first.
              </p>
              <button type="button" className="cc-btn w-full" disabled={connectBusy} onClick={onScan}>
                {connectBusy
                  ? scanProgress
                    ? `Scanning… ${Math.round((scanProgress.done / scanProgress.total) * 100)}%`
                    : "Scanning…"
                  : "Scan network"}
              </button>
              <button type="button" className="cc-btn-secondary w-full" disabled={connectBusy} onClick={() => setConnectStep("qr")}>
                Scan QR code
              </button>
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
                      onClick={() => onConnect(device.host, device.port)}
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
              <button type="button" className="cc-btn-ghost w-full" onClick={() => setConnectStep("manual")}>
                Enter IP manually
              </button>
            </div>
          )}

          {connectStep === "qr" && (
            <QrScanPanel onFound={(h, p) => onConnect(h, p)} onCancel={() => setConnectStep("find")} />
          )}

          {connectStep === "manual" && (
            <div className="cc-panel space-y-3">
              <p className="text-xs uppercase tracking-wider text-[var(--cc-muted)]">Manual connection</p>
              <input className="cc-input" placeholder="192.168.1.42" value={host} onChange={(e) => setHost(e.target.value)} />
              <input
                className="cc-input"
                placeholder="8731"
                value={port}
                onChange={(e) => setPort(e.target.value.replace(/\D/g, "").slice(0, 5))}
              />
              <div className="flex gap-2">
                <button type="button" className="cc-btn-secondary flex-1" onClick={() => setConnectStep("find")}>
                  Back
                </button>
                <button
                  type="button"
                  className="cc-btn flex-1"
                  disabled={connectBusy || !host.trim()}
                  onClick={() => onConnect(host.trim(), Number(port) || 8731)}
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
                <button type="button" className="cc-btn-secondary flex-1" onClick={() => setConnectStep("find")}>
                  Back
                </button>
                <button
                  type="button"
                  className="cc-btn flex-1"
                  disabled={connectBusy || code.length !== 6}
                  onClick={() => {
                    void (async () => {
                      try {
                        const token = await pairWithDeck(host.trim(), Number(port) || 8731, code);
                        const info = deviceInfo ?? (await pingDeck(host.trim(), Number(port) || 8731));
                        savePaired({ name: info.name, host: host.trim(), port: Number(port) || 8731, token });
                        onPaired();
                      } catch (e) {
                        setConnectError(e instanceof Error ? e.message : String(e));
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
          <p className="text-xs text-[var(--cc-muted)]">{companionAppUrl(paired.host, paired.port)}</p>
          <button
            type="button"
            className="cc-btn-secondary w-full"
            onClick={() => {
              clearPaired();
              onPaired();
            }}
          >
            Unpair
          </button>
        </div>
      )}
    </div>
  );
}

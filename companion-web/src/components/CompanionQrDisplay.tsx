import { QRCodeSVG } from "qrcode.react";
import { companionAppUrl } from "../deckApi";

interface CompanionQrDisplayProps {
  host: string;
  port: number;
  /** Shown under the QR when the receiver is waiting for a pairing code. */
  pairCode?: string;
  title?: string;
}

/** QR code another phone can scan to open this device's companion URL. */
export function CompanionQrDisplay({
  host,
  port,
  pairCode,
  title = "Scan to connect",
}: CompanionQrDisplayProps) {
  const url = companionAppUrl(host, port);

  return (
    <div className="cc-panel flex flex-col items-center gap-3 text-center">
      <p className="text-xs uppercase tracking-wider text-[var(--cc-muted)]">{title}</p>
      <div className="rounded-xl bg-white p-3 shadow-inner">
        <QRCodeSVG value={url} size={180} level="M" includeMargin={false} aria-label={`QR code for ${url}`} />
      </div>
      <code className="max-w-full break-all text-[11px] text-[var(--cc-gold)]">{url}</code>
      {pairCode && (
        <p className="text-sm text-[var(--cc-muted)]">
          Pairing code:{" "}
          <span className="font-mono text-lg font-bold tracking-[0.25em] text-[var(--cc-gold)]">
            {pairCode}
          </span>
        </p>
      )}
      <p className="text-xs leading-relaxed text-[var(--cc-muted)]">
        Open the companion on another phone → Scan QR code, or scan with your camera app.
      </p>
    </div>
  );
}

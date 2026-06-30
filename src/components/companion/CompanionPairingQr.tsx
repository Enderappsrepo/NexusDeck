import { useCallback, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Check, Copy, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { primaryCompanionUrl } from "@/lib/remote/companionUrl";

interface CompanionPairingQrProps {
  companionUrls?: string[];
  companionConnected?: boolean;
  companionHost?: string | null;
}

/**
 * QR code + URL shown on the device when Receive is on so a phone can scan
 * and open the bundled companion at http://host:8731/app/
 */
export function CompanionPairingQr({
  companionUrls,
  companionConnected,
  companionHost,
}: CompanionPairingQrProps) {
  const primaryUrl = primaryCompanionUrl(companionUrls);
  const [copied, setCopied] = useState<string | null>(null);

  const copy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(text);
      window.setTimeout(() => setCopied((c) => (c === text ? null : c)), 2000);
    } catch {
      // Clipboard may be unavailable in some webviews.
    }
  }, []);

  if (!primaryUrl) {
    return (
      <div className="rounded-xl border border-[var(--color-border)] p-4 text-sm text-[var(--color-muted)]">
        <p className="font-semibold text-[var(--color-foreground)]">Phone companion</p>
        <p className="mt-1">
          No local network address found. Connect to Wi‑Fi, then turn Receive off and on again.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[var(--color-border)] p-4">
      <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:items-start sm:text-left">
        {/* QR first — centered and large for Steam Deck / phone scanning */}
        <div className="shrink-0 rounded-2xl bg-white p-4 shadow-inner">
          <QRCodeSVG
            value={primaryUrl}
            size={240}
            level="M"
            includeMargin
            role="img"
            aria-label={`QR code for ${primaryUrl}`}
          />
        </div>

        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <p className="flex items-center justify-center gap-2 font-semibold sm:justify-start">
              <Smartphone className="h-4 w-4 text-[var(--color-primary)]" />
              Phone companion
            </p>
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              Scan this code with your phone camera or companion app → Scan QR code. Same Wi‑Fi
              required.
            </p>
          </div>

          {companionConnected && (
            <p className="rounded-lg bg-[var(--color-success)]/10 px-3 py-2 text-sm text-[var(--color-success)]">
              Phone connected{companionHost ? ` (${companionHost})` : ""}.
            </p>
          )}

          <div className="space-y-2">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <code className="min-w-0 flex-1 break-all rounded-lg bg-[var(--color-secondary)]/50 px-2 py-1.5 text-xs text-[var(--color-primary)]">
                {primaryUrl}
              </code>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void copy(primaryUrl)}
                data-focusable="true"
                aria-label="Copy companion URL"
                className="shrink-0"
              >
                {copied === primaryUrl ? (
                  <Check className="h-4 w-4 text-[var(--color-success)]" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
                Copy URL
              </Button>
            </div>

            {(companionUrls?.length ?? 0) > 1 && (
              <details className="text-left text-xs text-[var(--color-muted)]">
                <summary className="cursor-pointer select-none font-medium text-[var(--color-foreground)]">
                  Other network addresses ({companionUrls!.length - 1})
                </summary>
                <ul className="mt-2 space-y-1 font-mono">
                  {companionUrls!.slice(1).map((url) => (
                    <li key={url} className="flex flex-wrap items-center gap-2">
                      <span className="min-w-0 flex-1 break-all">{url}</span>
                      <button
                        type="button"
                        className="text-[var(--color-primary)] underline"
                        onClick={() => void copy(url)}
                      >
                        {copied === url ? "Copied" : "Copy"}
                      </button>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

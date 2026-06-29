import { useCallback, useEffect, useRef, useState } from "react";
import { parseCompanionTarget } from "../lib/lanDiscovery";

interface QrScanPanelProps {
  onFound: (host: string, port: number) => void;
  onCancel: () => void;
}

export function QrScanPanel({ onFound, onCancel }: QrScanPanelProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [manualUrl, setManualUrl] = useState("");
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);

  const stopCamera = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      if (!("BarcodeDetector" in window)) {
        setError("Camera QR scan isn't supported in this browser. Paste the URL below instead.");
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();

        const detector = new BarcodeDetector({ formats: ["qr_code"] });
        const scan = async () => {
          if (cancelled || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            for (const code of codes) {
              const target = parseCompanionTarget(code.rawValue);
              if (target) {
                stopCamera();
                onFound(target.host, target.port);
                return;
              }
            }
          } catch {
            // Keep scanning.
          }
          rafRef.current = requestAnimationFrame(() => {
            void scan();
          });
        };
        void scan();
      } catch {
        setError("Couldn't open the camera. Paste the companion URL from your PC instead.");
      }
    })();

    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [onFound, stopCamera]);

  const submitManual = () => {
    const target = parseCompanionTarget(manualUrl);
    if (!target) {
      setError("Enter a valid URL like http://192.168.1.42:8731/app/");
      return;
    }
    stopCamera();
    onFound(target.host, target.port);
  };

  return (
    <div className="cc-panel space-y-3">
      <p className="text-xs uppercase tracking-wider text-[var(--cc-muted)]">Scan QR code</p>
      {!error && (
        <video
          ref={videoRef}
          className="aspect-[4/3] w-full rounded-lg border border-[var(--cc-border-subtle)] bg-black object-cover"
          playsInline
          muted
        />
      )}
      {error && <p className="text-sm text-[var(--cc-muted)]">{error}</p>}
      <input
        className="cc-input"
        placeholder="Or paste http://192.168.1.42:8731/app/"
        value={manualUrl}
        onChange={(e) => setManualUrl(e.target.value)}
      />
      <div className="flex gap-2">
        <button type="button" className="cc-btn-secondary flex-1" onClick={() => {
          stopCamera();
          onCancel();
        }}>
          Back
        </button>
        <button type="button" className="cc-btn flex-1" onClick={submitManual}>
          Connect
        </button>
      </div>
    </div>
  );
}

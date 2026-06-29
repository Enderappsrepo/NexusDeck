export function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  const base = import.meta.env.BASE_URL;
  void navigator.serviceWorker.register(`${base}sw.js`, { scope: base }).catch(() => {
    // Non-fatal — app still works without offline shell.
  });
}

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function listenForInstallPrompt(
  onAvailable: (event: BeforeInstallPromptEvent) => void
): () => void {
  const handler = (event: Event) => {
    event.preventDefault();
    onAvailable(event as BeforeInstallPromptEvent);
  };
  window.addEventListener("beforeinstallprompt", handler);
  return () => window.removeEventListener("beforeinstallprompt", handler);
}

export function isStandalonePwa(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

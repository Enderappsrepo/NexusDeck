import type { NotificationPref } from "../stores/companionSettingsStore";

export async function requestNotificationPermission(): Promise<boolean> {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const result = await Notification.requestPermission();
  return result === "granted";
}

function postSwNotification(title: string, body: string, tag: string) {
  if (!("serviceWorker" in navigator)) return;
  const controller = navigator.serviceWorker.controller;
  if (controller) {
    controller.postMessage({ type: "SHOW_NOTIFICATION", title, body, tag });
  }
}

export function showCompanionNotification(
  pref: NotificationPref,
  kind: "install_complete" | "download_progress" | "collection_complete",
  title: string,
  body: string
) {
  if (pref === "none") return;
  if (kind === "download_progress" && pref !== "download_progress") return;
  if (
    (kind === "install_complete" || kind === "collection_complete") &&
    pref !== "install_complete" &&
    pref !== "download_progress"
  ) {
    return;
  }

  const tag = `nexusdeck-${kind}`;

  if ("Notification" in window && Notification.permission === "granted") {
    if (document.hidden) {
      postSwNotification(title, body, tag);
      return;
    }
    try {
      new Notification(title, { body, tag });
    } catch {
      postSwNotification(title, body, tag);
    }
    return;
  }

  postSwNotification(title, body, tag);
}

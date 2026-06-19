import "tauri-plugin-gamepad-api";

let started = false;

/** Ensure the Tauri gamepad polyfill is loaded (eager import for WebKitGTK). */
export async function ensureGamepadPolyfill(): Promise<void> {
  if (started) return;
  started = true;
}

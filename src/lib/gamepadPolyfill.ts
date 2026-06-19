let started = false;

/** Load the Tauri gamepad polyfill after the webview is ready. */
export async function ensureGamepadPolyfill(): Promise<void> {
  if (started) return;
  started = true;
  try {
    await import("tauri-plugin-gamepad-api");
  } catch (error) {
    console.warn("Gamepad polyfill unavailable:", error);
    started = false;
  }
}

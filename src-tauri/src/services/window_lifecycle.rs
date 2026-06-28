use tauri::{AppHandle, Manager};

use crate::error::Result;
use crate::services::startup_log;

const MAIN_WINDOW_LABEL: &str = "main";

pub fn hide_for_game_launch(app: &AppHandle) -> Result<()> {
    let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) else {
        return Ok(());
    };
    let _ = window.set_always_on_top(false);
    let _ = window.set_focusable(false);
    window.hide().map_err(|e| {
        crate::error::NexusDeckError::Other(format!("Failed to hide window: {e}"))
    })?;
    startup_log::log_step("window_lifecycle", "hidden for game launch");
    Ok(())
}

pub fn restore_after_game(app: &AppHandle) -> Result<()> {
    let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) else {
        return Ok(());
    };
    window.show().map_err(|e| {
        crate::error::NexusDeckError::Other(format!("Failed to show window: {e}"))
    })?;
    let _ = window.unminimize();
    let _ = window.set_focusable(true);
    let _ = window.set_focus();
    startup_log::log_step("window_lifecycle", "restored after game");
    Ok(())
}

pub fn reload_webview(app: &AppHandle) -> Result<()> {
    let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) else {
        return Ok(());
    };
    window
        .eval("location.reload()")
        .map_err(|e| crate::error::NexusDeckError::Other(format!("WebView reload failed: {e}")))?;
    startup_log::log_step("window_lifecycle", "webview reloaded");
    Ok(())
}

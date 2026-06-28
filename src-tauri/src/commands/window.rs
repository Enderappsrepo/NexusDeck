use tauri::AppHandle;

use crate::error::Result;
use crate::services::gamescope;
use crate::services::window_lifecycle;

#[tauri::command]
pub fn restore_window_after_game(app: AppHandle) -> Result<()> {
    gamescope::restore_after_game_session(&app)
}

#[tauri::command]
pub fn reload_webview(app: AppHandle) -> Result<()> {
    window_lifecycle::reload_webview(&app)
}

#[tauri::command]
pub fn claim_gamescope_focus(app: AppHandle) -> Result<()> {
    gamescope::claim_gamescope_focus_if_needed(&app)
}

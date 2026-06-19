use crate::error::Result;
use crate::services::startup_log;

#[tauri::command]
pub fn log_startup_event(step: String, detail: Option<String>) -> Result<()> {
    startup_log::log_step(&step, detail.as_deref().unwrap_or(""));
    Ok(())
}

#[tauri::command]
pub fn get_startup_diagnostics() -> Result<String> {
    Ok(serde_json::to_string_pretty(&startup_log::collect_diagnostics())?)
}

#[tauri::command]
pub fn get_startup_log_path() -> Result<String> {
    Ok(startup_log::log_path().display().to_string())
}

use crate::db;
use crate::error::Result;
use crate::services::paths::{config_dir, data_dir};

#[tauri::command]
pub fn export_diagnostics() -> Result<String> {
    db::export_diagnostics()
}

#[tauri::command]
pub fn backup_profile(profile_id: String, dest_path: String) -> Result<()> {
    db::backup_profile(&profile_id, &dest_path)
}

#[tauri::command]
pub fn restore_profile(src_path: String) -> Result<crate::db::Profile> {
    db::restore_profile(&src_path)
}

#[tauri::command]
pub fn get_app_paths() -> Result<serde_json::Value> {
    Ok(serde_json::json!({
        "config_dir": config_dir().display().to_string(),
        "data_dir": data_dir().display().to_string(),
    }))
}

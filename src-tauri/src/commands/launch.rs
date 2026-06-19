use std::sync::Arc;

use tauri::{AppHandle, State};

use crate::db::{self, LaunchConfig};
use crate::error::Result;
use crate::services::launch::{
    batch_launch_tools as run_batch_launch, launch_game as run_launch_game,
    validate_launch_for_profile, LaunchOptions, LaunchResult,
};
use crate::services::launch_config::{ensure_configs_for_profile, LaunchSettings};
use crate::services::plugins_txt::{
    create_safe_launch_backup as run_safe_backup, sync_plugins_txt as run_sync_plugins,
};
use crate::services::pre_launch::LaunchValidationResult;
use crate::services::process_monitor::{GameRunningState, ProcessMonitor};
use crate::services::steam_shortcut::{
    create_steam_shortcut as run_create_steam_shortcut, list_steam_shortcut_infos,
    write_shortcut_to_steam_vdf, SteamShortcutInfo,
};

#[tauri::command]
pub fn list_launch_configs(profile_id: String) -> Result<Vec<LaunchConfig>> {
    let profile = db::get_profile(&profile_id)?;
    if let Some(ref p) = profile {
        ensure_configs_for_profile(&profile_id, &p.game_domain)?;
    }
    db::list_launch_configs(&profile_id)
}

#[tauri::command]
pub fn save_launch_config(config: LaunchConfig) -> Result<LaunchConfig> {
    db::save_launch_config(&config)?;
    Ok(config)
}

#[tauri::command]
pub fn delete_launch_config(id: String) -> Result<()> {
    db::delete_launch_config(&id)
}

#[tauri::command]
pub fn get_recent_launch_configs(profile_id: String, limit: i64) -> Result<Vec<LaunchConfig>> {
    db::get_recent_launch_configs(&profile_id, limit)
}

#[tauri::command]
pub fn validate_launch(
    profile_id: String,
    config_id: Option<String>,
    monitor: State<'_, Arc<ProcessMonitor>>,
) -> Result<LaunchValidationResult> {
    validate_launch_for_profile(&profile_id, config_id.as_deref(), &monitor)
}

#[tauri::command]
pub fn launch_game(
    app: AppHandle,
    profile_id: String,
    config_id: Option<String>,
    options: Option<LaunchOptions>,
    monitor: State<'_, Arc<ProcessMonitor>>,
) -> Result<LaunchResult> {
    let result = run_launch_game(
        &app,
        &profile_id,
        config_id.as_deref(),
        options.unwrap_or_default(),
        &monitor,
    )?;

    let settings = LaunchSettings::load()?;
    if settings.close_app_after_launch {
        app.exit(0);
    }

    Ok(result)
}

#[tauri::command]
pub fn get_game_running_state(
    profile_id: String,
    monitor: State<'_, Arc<ProcessMonitor>>,
) -> Result<GameRunningState> {
    Ok(monitor.get_state(&profile_id))
}

#[tauri::command]
pub fn stop_game(
    profile_id: String,
    graceful: Option<bool>,
    monitor: State<'_, Arc<ProcessMonitor>>,
) -> Result<()> {
    monitor.stop_game(&profile_id, graceful.unwrap_or(true))
}

#[tauri::command]
pub fn sync_plugins_txt(profile_id: String) -> Result<String> {
    let profile = db::get_profile(&profile_id)?
        .ok_or_else(|| crate::error::NexusDeckError::NotFound("Profile not found".into()))?;
    run_sync_plugins(&profile)
}

#[tauri::command]
pub fn create_safe_launch_backup(profile_id: String) -> Result<Vec<String>> {
    let profile = db::get_profile(&profile_id)?
        .ok_or_else(|| crate::error::NexusDeckError::NotFound("Profile not found".into()))?;
    run_safe_backup(&profile)
}

#[tauri::command]
pub fn get_launch_settings() -> Result<LaunchSettings> {
    LaunchSettings::load()
}

#[tauri::command]
pub fn set_launch_settings(settings: LaunchSettings) -> Result<()> {
    settings.save()
}

#[tauri::command]
pub fn get_playtime_stats(profile_id: String) -> Result<serde_json::Value> {
    db::get_playtime_stats(&profile_id)
}

#[tauri::command]
pub fn create_steam_shortcut(
    profile_id: String,
    config_id: String,
    name: Option<String>,
    write_vdf: Option<bool>,
) -> Result<SteamShortcutInfo> {
    let profile = db::get_profile(&profile_id)?
        .ok_or_else(|| crate::error::NexusDeckError::NotFound("Profile not found".into()))?;
    let config = db::get_launch_config(&config_id)?
        .ok_or_else(|| crate::error::NexusDeckError::NotFound("Launch config not found".into()))?;
    let info = run_create_steam_shortcut(&profile, &config, name)?;

    if write_vdf.unwrap_or(false) {
        let _ = write_shortcut_to_steam_vdf(&profile, &config, &info.display_name);
    }

    Ok(info)
}

#[tauri::command]
pub fn list_steam_shortcuts(profile_id: String) -> Result<Vec<SteamShortcutInfo>> {
    list_steam_shortcut_infos(&profile_id)
}

#[tauri::command]
pub fn delete_steam_shortcut(id: String) -> Result<()> {
    db::delete_steam_shortcut(&id)
}

#[tauri::command]
pub fn pick_launch_executable() -> Result<Option<String>> {
    Ok(None)
}

#[tauri::command]
pub fn batch_launch_tools(
    app: AppHandle,
    profile_id: String,
    tool_ids: Vec<String>,
    monitor: State<'_, Arc<ProcessMonitor>>,
) -> Result<Vec<String>> {
    run_batch_launch(&app, &profile_id, tool_ids, &monitor)
}

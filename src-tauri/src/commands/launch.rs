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
    add_nexusdeck_to_steam as run_add_nexusdeck_to_steam,
    add_nexusdeck_to_steam_when_ready as run_add_when_ready,
    create_steam_shortcut as run_create_steam_shortcut,
    install_nexusdeck_steam_input_layout as run_install_steam_input,
    is_steam_client_running,
    list_steam_shortcut_infos,
    repair_steam_shortcuts as run_repair_steam_shortcuts,
    request_steam_shutdown,
    write_shortcut_to_steam_vdf, NexusDeckSteamShortcutResult, SteamShortcutInfo,
};
use crate::services::steam_input_install::SteamInputInstallResult;
use crate::services::tools::{
    bodyslide_catalog, cbbe_catalog, detect_bodyslide as run_detect_bodyslide,
    detect_sseedit as run_detect_sseedit, launch_bodyslide as run_launch_bodyslide,
    launch_outfit_studio as run_launch_outfit_studio, launch_sseedit as run_launch_sseedit,
    configure_bodyslide_paths as run_configure_bodyslide_paths,
    profile_has_body_mod, BodySlideInfo, SseEditInfo,
};
use crate::services::bodyslide_config::BodyslidePathInfo;
use crate::services::download_manager::{DownloadManager, DownloadProgress};
use crate::services::nexus_client::NexusClient;

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
pub async fn validate_launch(
    profile_id: String,
    config_id: Option<String>,
    monitor: State<'_, Arc<ProcessMonitor>>,
) -> Result<LaunchValidationResult> {
    let monitor = Arc::clone(&monitor);
    tokio::task::spawn_blocking(move || {
        validate_launch_for_profile(&profile_id, config_id.as_deref(), &monitor)
    })
    .await
    .map_err(|e| crate::error::NexusDeckError::Other(format!("Launch validation failed: {e}")))?
}

#[tauri::command]
pub async fn launch_game(
    app: AppHandle,
    profile_id: String,
    config_id: Option<String>,
    options: Option<LaunchOptions>,
    monitor: State<'_, Arc<ProcessMonitor>>,
) -> Result<LaunchResult> {
    let monitor = Arc::clone(&monitor);
    let options = options.unwrap_or_default();
    let app_for_launch = app.clone();
    let result = tokio::task::spawn_blocking(move || {
        run_launch_game(
            &app_for_launch,
            &profile_id,
            config_id.as_deref(),
            options,
            &monitor,
        )
    })
    .await
    .map_err(|e| crate::error::NexusDeckError::Other(format!("Launch task failed: {e}")))??;

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
pub fn clear_launch_tracking(
    profile_id: String,
    monitor: State<'_, Arc<ProcessMonitor>>,
) -> Result<()> {
    monitor.clear_tracking(&profile_id)
}

#[tauri::command]
pub async fn stop_game(
    profile_id: String,
    graceful: Option<bool>,
    monitor: State<'_, Arc<ProcessMonitor>>,
) -> Result<()> {
    let monitor = Arc::clone(&monitor);
    let graceful = graceful.unwrap_or(true);
    tokio::task::spawn_blocking(move || monitor.stop_game(&profile_id, graceful))
        .await
        .map_err(|e| crate::error::NexusDeckError::Other(format!("Stop game failed: {e}")))?
}

#[tauri::command]
pub async fn sync_plugins_txt(profile_id: String) -> Result<crate::services::plugins_txt::PluginsSyncResult> {
    let profile = db::get_profile(&profile_id)?
        .ok_or_else(|| crate::error::NexusDeckError::NotFound("Profile not found".into()))?;
    let profile = crate::services::prefix_manager::ensure_proton_prefix(&profile)?;
    tokio::task::spawn_blocking(move || run_sync_plugins(&profile))
        .await
        .map_err(|e| crate::error::NexusDeckError::Other(format!("Plugin sync failed: {e}")))?
}

#[tauri::command]
pub async fn create_safe_launch_backup(profile_id: String) -> Result<Vec<String>> {
    let profile = db::get_profile(&profile_id)?
        .ok_or_else(|| crate::error::NexusDeckError::NotFound("Profile not found".into()))?;
    tokio::task::spawn_blocking(move || run_safe_backup(&profile))
        .await
        .map_err(|e| {
            crate::error::NexusDeckError::Other(format!("Safe launch backup failed: {e}"))
        })?
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
        write_shortcut_to_steam_vdf(&profile, &config, &info.display_name)?;
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
pub fn add_nexusdeck_to_steam(name: Option<String>) -> Result<NexusDeckSteamShortcutResult> {
    run_add_nexusdeck_to_steam(name)
}

#[tauri::command]
pub fn is_steam_running() -> Result<bool> {
    is_steam_client_running()
}

#[tauri::command]
pub fn quit_steam_client() -> Result<()> {
    request_steam_shutdown()
}

#[tauri::command]
pub async fn add_nexusdeck_to_steam_when_ready(
    name: Option<String>,
    timeout_secs: Option<u64>,
) -> Result<NexusDeckSteamShortcutResult> {
    run_add_when_ready(name, timeout_secs.unwrap_or(180)).await
}

#[tauri::command]
pub fn install_nexusdeck_steam_input_layout(
    name: Option<String>,
) -> Result<SteamInputInstallResult> {
    run_install_steam_input(name)
}

#[tauri::command]
pub fn repair_steam_shortcuts(
) -> Result<crate::services::protontricks_health::ProtontricksFixResult> {
    run_repair_steam_shortcuts()
}

#[tauri::command]
pub fn pick_launch_executable() -> Result<Option<String>> {
    Ok(None)
}

#[tauri::command]
pub async fn batch_launch_tools(
    app: AppHandle,
    profile_id: String,
    tool_ids: Vec<String>,
    monitor: State<'_, Arc<ProcessMonitor>>,
) -> Result<Vec<String>> {
    let monitor = Arc::clone(&monitor);
    tokio::task::spawn_blocking(move || run_batch_launch(&app, &profile_id, tool_ids, &monitor))
        .await
        .map_err(|e| crate::error::NexusDeckError::Other(format!("Batch launch failed: {e}")))?
}

#[tauri::command]
pub async fn detect_bodyslide(profile_id: String) -> Result<BodySlideInfo> {
    tokio::task::spawn_blocking(move || run_detect_bodyslide(&profile_id))
        .await
        .map_err(|e| {
            crate::error::NexusDeckError::Other(format!("BodySlide detection failed: {e}"))
        })?
}

#[tauri::command]
pub async fn get_body_setup_status(
    profile_id: String,
) -> Result<crate::services::tools::BodySetupStatus> {
    tokio::task::spawn_blocking(move || crate::services::tools::get_body_setup_status(&profile_id))
        .await
        .map_err(|e| {
            crate::error::NexusDeckError::Other(format!("Body setup status failed: {e}"))
        })?
}

#[tauri::command]
pub async fn launch_bodyslide(profile_id: String) -> Result<String> {
    tokio::task::spawn_blocking(move || run_launch_bodyslide(&profile_id))
        .await
        .map_err(|e| crate::error::NexusDeckError::Other(format!("BodySlide launch failed: {e}")))?
}

#[tauri::command]
pub async fn configure_bodyslide_paths(profile_id: String) -> Result<BodyslidePathInfo> {
    tokio::task::spawn_blocking(move || run_configure_bodyslide_paths(&profile_id))
        .await
        .map_err(|e| {
            crate::error::NexusDeckError::Other(format!("BodySlide configure failed: {e}"))
        })?
}

#[tauri::command]
pub async fn launch_outfit_studio(profile_id: String) -> Result<String> {
    tokio::task::spawn_blocking(move || run_launch_outfit_studio(&profile_id))
        .await
        .map_err(|e| {
            crate::error::NexusDeckError::Other(format!("Outfit Studio launch failed: {e}"))
        })?
}

#[tauri::command]
pub async fn queue_bodyslide_install(
    app: AppHandle,
    profile_id: String,
    nexus: State<'_, Arc<NexusClient>>,
    downloads: State<'_, Arc<DownloadManager>>,
) -> Result<DownloadProgress> {
    use std::path::PathBuf;

    use crate::error::NexusDeckError;

    let profile = db::get_profile(&profile_id)?
        .ok_or_else(|| NexusDeckError::NotFound("Profile not found".into()))?;

    if run_detect_bodyslide(&profile_id)?.installed {
        return Err(NexusDeckError::Other("BodySlide is already installed.".into()));
    }

    let entry = bodyslide_catalog(&profile.game_domain).ok_or_else(|| {
        NexusDeckError::Other(format!(
            "One-click BodySlide install is not configured for {}.",
            profile.game_domain
        ))
    })?;

    let files = nexus.get_mod_files(&profile.game_domain, entry.mod_id).await?;
    let file = files
        .iter()
        .find(|f| f.is_primary)
        .or_else(|| files.first())
        .ok_or_else(|| NexusDeckError::NotFound("No BodySlide download files found.".into()))?;

    let progress = downloads
        .enqueue_download(
            app,
            Arc::clone(&*nexus),
            &profile.game_domain,
            entry.mod_id,
            file.file_id,
            &file.file_name,
            PathBuf::from(&profile.staging_path).as_path(),
            file.size_kb,
            entry.mod_name,
            &profile_id,
            None,
            0,
        )
        .await?;
    downloads.mark_auto_install(&progress.id);
    Ok(progress)
}

#[tauri::command]
pub async fn queue_cbbe_install(
    app: AppHandle,
    profile_id: String,
    nexus: State<'_, Arc<NexusClient>>,
    downloads: State<'_, Arc<DownloadManager>>,
) -> Result<DownloadProgress> {
    use std::path::PathBuf;

    use crate::error::NexusDeckError;

    let profile = db::get_profile(&profile_id)?
        .ok_or_else(|| NexusDeckError::NotFound("Profile not found".into()))?;

    if profile_has_body_mod(&profile_id)? {
        return Err(NexusDeckError::Other(
            "A body mod (CBBE or similar) is already installed.".into(),
        ));
    }

    let entry = cbbe_catalog(&profile.game_domain).ok_or_else(|| {
        NexusDeckError::Other(format!(
            "One-click CBBE install is not configured for {}.",
            profile.game_domain
        ))
    })?;

    let files = nexus.get_mod_files(&profile.game_domain, entry.mod_id).await?;
    let file = files
        .iter()
        .find(|f| f.is_primary)
        .or_else(|| files.first())
        .ok_or_else(|| NexusDeckError::NotFound("No CBBE download files found.".into()))?;

    let progress = downloads
        .enqueue_download(
            app,
            Arc::clone(&*nexus),
            &profile.game_domain,
            entry.mod_id,
            file.file_id,
            &file.file_name,
            PathBuf::from(&profile.staging_path).as_path(),
            file.size_kb,
            entry.mod_name,
            &profile_id,
            None,
            0,
        )
        .await?;
    Ok(progress)
}

#[tauri::command]
pub async fn detect_sseedit(profile_id: String) -> Result<SseEditInfo> {
    tokio::task::spawn_blocking(move || run_detect_sseedit(&profile_id))
        .await
        .map_err(|e| crate::error::NexusDeckError::Other(format!("SSEEdit detection failed: {e}")))?
}

#[tauri::command]
pub async fn launch_sseedit(profile_id: String) -> Result<String> {
    tokio::task::spawn_blocking(move || run_launch_sseedit(&profile_id))
        .await
        .map_err(|e| crate::error::NexusDeckError::Other(format!("SSEEdit launch failed: {e}")))?
}

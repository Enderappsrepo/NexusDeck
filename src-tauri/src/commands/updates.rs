use std::sync::Arc;

use tauri::{AppHandle, State};

use crate::db;
use crate::error::Result;
use crate::services::download_manager::DownloadManager;
use crate::services::load_order;
use crate::services::mod_uninstall;
use crate::services::nexus_client::NexusClient;
use crate::services::update_checker::{self, ModUpdateInfo, UpdateBatchResult, UpdateJob};

#[tauri::command]
pub async fn check_profile_updates(
    profile_id: String,
    nexus: State<'_, Arc<NexusClient>>,
) -> Result<Vec<ModUpdateInfo>> {
    update_checker::check_profile_updates(&nexus, &profile_id).await
}

#[tauri::command]
pub async fn start_mod_update(
    app: AppHandle,
    profile_id: String,
    installed_mod_id: String,
    nexus: State<'_, Arc<NexusClient>>,
    downloads: State<'_, Arc<DownloadManager>>,
) -> Result<UpdateJob> {
    let job = update_checker::start_mod_update(
        app.clone(),
        Arc::clone(&*nexus),
        Arc::clone(&*downloads),
        &profile_id,
        &installed_mod_id,
    )
    .await?;
    downloads.mark_auto_install(&job.download_id);
    Ok(job)
}

#[tauri::command]
pub async fn update_mod_safe(
    app: AppHandle,
    profile_id: String,
    installed_mod_id: String,
    nexus: State<'_, Arc<NexusClient>>,
    downloads: State<'_, Arc<DownloadManager>>,
) -> Result<()> {
    update_checker::update_mod_safe(
        app,
        Arc::clone(&*nexus),
        Arc::clone(&*downloads),
        &profile_id,
        &installed_mod_id,
    )
    .await
}

#[tauri::command]
pub async fn update_all_mods(
    app: AppHandle,
    profile_id: String,
    nexus: State<'_, Arc<NexusClient>>,
    downloads: State<'_, Arc<DownloadManager>>,
) -> Result<UpdateBatchResult> {
    update_checker::update_all_mods(
        app,
        Arc::clone(&*nexus),
        Arc::clone(&*downloads),
        &profile_id,
    )
    .await
}

#[tauri::command]
pub async fn complete_mod_update(
    app: AppHandle,
    download_id: String,
    nexus: State<'_, Arc<NexusClient>>,
) -> Result<db::InstalledMod> {
    crate::commands::deploy::finish_mod_update(&app, &nexus, &download_id).await
}

#[tauri::command]
pub fn uninstall_mod(mod_id: String) -> Result<mod_uninstall::UninstallResult> {
    mod_uninstall::uninstall_mod(&mod_id)
}

#[tauri::command]
pub fn get_load_order_state(profile_id: String) -> Result<load_order::LoadOrderState> {
    load_order::get_load_order_state(&profile_id)
}

#[tauri::command]
pub fn auto_sort_load_order(profile_id: String) -> Result<Vec<db::InstalledMod>> {
    load_order::auto_sort_load_order(&profile_id)
}

#[tauri::command]
pub async fn refresh_mod_metadata(
    profile_id: String,
    nexus: State<'_, Arc<NexusClient>>,
) -> Result<Vec<db::InstalledMod>> {
    crate::services::mod_metadata::refresh_profile_metadata(&nexus, &profile_id).await
}

#[tauri::command]
pub async fn get_updated_mods_feed(
    game_domain: String,
    period: String,
    nexus: State<'_, Arc<NexusClient>>,
) -> Result<Vec<crate::services::nexus_client::UpdatedModEntry>> {
    nexus.get_updated_mods(&game_domain, &period).await
}

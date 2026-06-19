use std::sync::Arc;

use tauri::{AppHandle, State};

use crate::error::Result;
use crate::services::download_manager::DownloadManager;
use crate::services::nexus_client::NexusClient;
use crate::services::update_checker::{self, ModUpdateInfo};

#[tauri::command]
pub async fn check_profile_updates(
    profile_id: String,
    nexus: State<'_, Arc<NexusClient>>,
) -> Result<Vec<ModUpdateInfo>> {
    update_checker::check_profile_updates(&nexus, &profile_id).await
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
pub async fn get_updated_mods_feed(
    game_domain: String,
    period: String,
    nexus: State<'_, Arc<NexusClient>>,
) -> Result<Vec<crate::services::nexus_client::UpdatedModEntry>> {
    nexus.get_updated_mods(&game_domain, &period).await
}

use std::sync::Arc;

use tauri::{AppHandle, State};

use crate::error::Result;
use crate::services::download_manager::{DownloadManager, DownloadProgress};
use crate::services::game_essentials::{
    self, GameEssentialModStatus, GameEssentialsManifest, QueuedEssentialMod,
};
use crate::services::nexus_client::NexusClient;

#[tauri::command]
pub fn get_game_essentials_manifest(domain: String) -> Result<GameEssentialsManifest> {
    game_essentials::get_game_essentials_manifest(&domain)
}

#[tauri::command]
pub fn get_game_essentials_status(profile_id: String) -> Result<Vec<GameEssentialModStatus>> {
    game_essentials::get_game_essentials_status(&profile_id)
}

#[tauri::command]
pub async fn queue_game_essential_mods(
    app: AppHandle,
    profile_id: String,
    mod_ids: Vec<String>,
    nexus: State<'_, Arc<NexusClient>>,
    downloads: State<'_, Arc<DownloadManager>>,
) -> Result<Vec<QueuedEssentialMod>> {
    game_essentials::queue_game_essential_mods(
        app,
        Arc::clone(&*nexus),
        Arc::clone(&*downloads),
        &profile_id,
        mod_ids,
    )
    .await
}

#[tauri::command]
pub fn finish_game_essentials(profile_id: String) -> Result<Vec<String>> {
    game_essentials::finish_game_essentials(&profile_id)
}

#[tauri::command]
pub async fn queue_mod_for_install(
    app: AppHandle,
    profile_id: String,
    nexus_mod_id: u64,
    nexus_file_id: Option<u64>,
    mod_name: String,
    nexus: State<'_, Arc<NexusClient>>,
    downloads: State<'_, Arc<DownloadManager>>,
) -> Result<DownloadProgress> {
    game_essentials::queue_mod_for_install(
        app,
        Arc::clone(&*nexus),
        Arc::clone(&*downloads),
        profile_id,
        nexus_mod_id,
        nexus_file_id,
        mod_name,
    )
    .await
}

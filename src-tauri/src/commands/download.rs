use std::path::PathBuf;
use std::sync::Arc;

use tauri::{AppHandle, State};

use crate::error::Result;
use crate::services::download_manager::{DownloadManager, DownloadProgress, DownloadSettings};

#[tauri::command]
pub async fn start_mod_download(
    app: AppHandle,
    game_domain: String,
    mod_id: u64,
    file_id: u64,
    file_name: String,
    staging_path: String,
    expected_size_kb: u64,
    mod_name: Option<String>,
    profile_id: Option<String>,
    nexus: State<'_, Arc<crate::services::nexus_client::NexusClient>>,
    downloads: State<'_, Arc<DownloadManager>>,
) -> Result<DownloadProgress> {
    downloads
        .enqueue_download(
            app,
            Arc::clone(&*nexus),
            &game_domain,
            mod_id,
            file_id,
            &file_name,
            PathBuf::from(staging_path).as_path(),
            expected_size_kb,
            mod_name.as_deref().unwrap_or(""),
            profile_id.as_deref().unwrap_or(""),
            None,
            0,
        )
        .await
}

#[tauri::command]
pub fn list_downloads(downloads: State<'_, Arc<DownloadManager>>) -> Result<Vec<crate::db::DownloadRecord>> {
    downloads.list_downloads()
}

#[tauri::command]
pub fn cancel_download(
    download_id: String,
    downloads: State<'_, Arc<DownloadManager>>,
) -> Result<()> {
    downloads.cancel_download(&download_id)
}

#[tauri::command]
pub async fn retry_download(
    app: AppHandle,
    download_id: String,
    nexus: State<'_, Arc<crate::services::nexus_client::NexusClient>>,
    downloads: State<'_, Arc<DownloadManager>>,
) -> Result<DownloadProgress> {
    downloads
        .retry_download(app, Arc::clone(&*nexus), &download_id)
        .await
}

#[tauri::command]
pub fn clear_completed_downloads(
    downloads: State<'_, Arc<DownloadManager>>,
) -> Result<u64> {
    downloads.clear_completed()
}

#[tauri::command]
pub fn dismiss_download(
    download_id: String,
    downloads: State<'_, Arc<DownloadManager>>,
) -> Result<()> {
    downloads.dismiss_download(&download_id)
}

#[tauri::command]
pub fn clear_failed_downloads(
    downloads: State<'_, Arc<DownloadManager>>,
) -> Result<u64> {
    downloads.clear_failed()
}

#[tauri::command]
pub fn get_download_settings(
    downloads: State<'_, Arc<DownloadManager>>,
) -> Result<DownloadSettings> {
    downloads.get_download_settings()
}

#[tauri::command]
pub fn set_download_settings(
    settings: DownloadSettings,
    downloads: State<'_, Arc<DownloadManager>>,
) -> Result<()> {
    downloads.set_download_settings(settings)
}

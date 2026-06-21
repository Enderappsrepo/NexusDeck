use std::path::PathBuf;
use std::sync::Arc;

use tauri::{AppHandle, State};

use crate::db;
use crate::error::{NexusDeckError, Result};
use crate::services::dependency_resolver::{self, DependencyGraph};
use crate::services::download_manager::DownloadManager;
use crate::services::nexus_client::NexusClient;

#[tauri::command]
pub async fn resolve_mod_dependencies(
    profile_id: String,
    mod_id: u64,
    nexus: State<'_, Arc<NexusClient>>,
) -> Result<DependencyGraph> {
    let profile = db::get_profile(&profile_id)?
        .ok_or_else(|| NexusDeckError::NotFound("Profile not found".into()))?;
    dependency_resolver::resolve_dependencies(&nexus, &profile, mod_id).await
}

#[tauri::command]
pub async fn queue_missing_dependencies(
    app: AppHandle,
    profile_id: String,
    mod_id: u64,
    nexus: State<'_, Arc<NexusClient>>,
    downloads: State<'_, Arc<DownloadManager>>,
) -> Result<Vec<String>> {
    let profile = db::get_profile(&profile_id)?
        .ok_or_else(|| NexusDeckError::NotFound("Profile not found".into()))?;
    let graph =
        dependency_resolver::resolve_dependencies(&nexus, &profile, mod_id).await?;
    let mut queued = Vec::new();
    let staging = PathBuf::from(&profile.staging_path);

    for req in graph.missing_required {
        if req.installed || req.downloaded {
            continue;
        }
        let files = nexus
            .get_mod_files(&req.game_domain, req.mod_id)
            .await?;
        let primary = files
            .iter()
            .find(|f| f.is_primary)
            .or_else(|| files.first());
        if let Some(file) = primary {
            let progress = downloads
                .enqueue_download(
                    app.clone(),
                    Arc::clone(&*nexus),
                    &req.game_domain,
                    req.mod_id,
                    file.file_id,
                    &file.file_name,
                    &staging,
                    file.size_kb,
                    &req.name,
                    &profile_id,
                    None,
                    0,
                )
                .await?;
            downloads.mark_auto_install(&progress.id);
            queued.push(progress.id);
        }
    }

    Ok(queued)
}

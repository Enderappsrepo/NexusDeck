use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

use crate::db;
use crate::error::{NexusDeckError, Result};
use crate::services::download_manager::DownloadManager;
use crate::services::mod_uninstall::remove_mod_files_for_update;
use crate::services::nexus_client::NexusClient;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModUpdateInfo {
    pub installed_mod_id: String,
    pub nexus_mod_id: u64,
    pub name: String,
    pub installed_version: Option<String>,
    pub latest_version: String,
    pub latest_file_id: u64,
    pub changelog_available: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateJob {
    pub download_id: String,
    pub installed_mod_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateBatchResult {
    pub queued: Vec<String>,
    pub skipped: Vec<String>,
    pub errors: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModUpdateProgress {
    pub installed_mod_id: String,
    pub phase: String,
    pub message: String,
}

pub async fn check_profile_updates(
    nexus: &NexusClient,
    profile_id: &str,
) -> Result<Vec<ModUpdateInfo>> {
    let profile = db::get_profile(profile_id)?
        .ok_or_else(|| NexusDeckError::NotFound("Profile not found".into()))?;
    let installed = db::list_installed_mods(profile_id)?;
    let updated = nexus
        .get_updated_mods(&profile.game_domain, "1m")
        .await?;
    let updated_ids: std::collections::HashSet<u64> =
        updated.iter().map(|u| u.mod_id).collect();

    let mut updates = Vec::new();
    for m in installed {
        if !updated_ids.contains(&(m.nexus_mod_id as u64)) {
            continue;
        }
        let files = nexus
            .get_mod_files(&profile.game_domain, m.nexus_mod_id as u64)
            .await?;
        let primary = files
            .iter()
            .find(|f| f.is_primary)
            .or_else(|| files.first());
        if let Some(file) = primary {
            let latest_version = file.version.clone();
            if m.version.as_deref() != Some(latest_version.as_str()) {
                updates.push(ModUpdateInfo {
                    installed_mod_id: m.id.clone(),
                    nexus_mod_id: m.nexus_mod_id as u64,
                    name: m.name.clone(),
                    installed_version: m.version.clone(),
                    latest_version,
                    latest_file_id: file.file_id,
                    changelog_available: true,
                });
            }
        }
    }
    Ok(updates)
}

pub async fn start_mod_update(
    app: AppHandle,
    nexus: Arc<NexusClient>,
    dm: Arc<DownloadManager>,
    profile_id: &str,
    installed_mod_id: &str,
) -> Result<UpdateJob> {
    emit_update_progress(
        &app,
        installed_mod_id,
        "preparing",
        "Preparing mod update…",
    );

    let profile = db::get_profile(profile_id)?
        .ok_or_else(|| NexusDeckError::NotFound("Profile not found".into()))?;
    let mut installed = db::get_installed_mod(installed_mod_id)?
        .ok_or_else(|| NexusDeckError::NotFound("Installed mod not found".into()))?;

    let was_enabled = installed.enabled;
    if let Ok(mut val) = serde_json::from_str::<serde_json::Value>(&installed.install_options_json) {
        if let Some(obj) = val.as_object_mut() {
            obj.insert("enable_mod".into(), serde_json::json!(was_enabled));
            installed.install_options_json = val.to_string();
            db::save_installed_mod(&installed)?;
        }
    }

    let files = nexus
        .get_mod_files(&profile.game_domain, installed.nexus_mod_id as u64)
        .await?;
    let primary = files
        .iter()
        .find(|f| f.is_primary)
        .or_else(|| files.first())
        .ok_or_else(|| NexusDeckError::NotFound("No downloadable file found".into()))?;

    remove_mod_files_for_update(&profile, &installed)?;
    db::set_mod_enabled(installed_mod_id, false)?;

    let staging = std::path::PathBuf::from(&profile.staging_path);
    let progress = dm
        .enqueue_update_download(
            app.clone(),
            nexus,
            &profile.game_domain,
            installed.nexus_mod_id as u64,
            primary.file_id,
            &primary.file_name,
            &staging,
            primary.size_kb,
            &installed.name,
            profile_id,
            installed_mod_id,
        )
        .await?;

    emit_update_progress(
        &app,
        installed_mod_id,
        "downloading",
        "Downloading update…",
    );

    Ok(UpdateJob {
        download_id: progress.id,
        installed_mod_id: installed_mod_id.to_string(),
    })
}

pub async fn update_all_mods(
    app: AppHandle,
    nexus: Arc<NexusClient>,
    dm: Arc<DownloadManager>,
    profile_id: &str,
) -> Result<UpdateBatchResult> {
    let updates = check_profile_updates(&nexus, profile_id).await?;
    let mut queued = Vec::new();
    let mut skipped = Vec::new();
    let mut errors = Vec::new();

    for update in updates {
        match start_mod_update(
            app.clone(),
            Arc::clone(&nexus),
            Arc::clone(&dm),
            profile_id,
            &update.installed_mod_id,
        )
        .await
        {
            Ok(job) => {
                queued.push(job.installed_mod_id);
                dm.mark_auto_install(&job.download_id);
            }
            Err(e) => errors.push(format!("{}: {e}", update.name)),
        }
    }

    Ok(UpdateBatchResult {
        queued,
        skipped,
        errors,
    })
}

pub fn emit_update_progress(app: &AppHandle, installed_mod_id: &str, phase: &str, message: &str) {
    let _ = app.emit(
        "mod-update-progress",
        ModUpdateProgress {
            installed_mod_id: installed_mod_id.to_string(),
            phase: phase.to_string(),
            message: message.to_string(),
        },
    );
}

/// Legacy alias kept for compatibility.
pub async fn update_mod_safe(
    app: AppHandle,
    nexus: Arc<NexusClient>,
    dm: Arc<DownloadManager>,
    profile_id: &str,
    installed_mod_id: &str,
) -> Result<()> {
    let job = start_mod_update(app, nexus, Arc::clone(&dm), profile_id, installed_mod_id).await?;
    dm.mark_auto_install(&job.download_id);
    Ok(())
}

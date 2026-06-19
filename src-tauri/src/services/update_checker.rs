use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::db::{self, InstalledMod};
use crate::error::{NexusDeckError, Result};
use crate::services::download_manager::DownloadManager;
use crate::services::nexus_client::NexusClient;
use std::sync::Arc;

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

pub async fn update_mod_safe(
    app: AppHandle,
    nexus: Arc<NexusClient>,
    dm: Arc<DownloadManager>,
    profile_id: &str,
    installed_mod_id: &str,
) -> Result<()> {
    let profile = db::get_profile(profile_id)?
        .ok_or_else(|| NexusDeckError::NotFound("Profile not found".into()))?;
    let installed = db::get_installed_mod(installed_mod_id)?
        .ok_or_else(|| NexusDeckError::NotFound("Installed mod not found".into()))?;

    db::set_mod_enabled(installed_mod_id, false)?;

    let files = nexus
        .get_mod_files(&profile.game_domain, installed.nexus_mod_id as u64)
        .await?;
    let primary = files
        .iter()
        .find(|f| f.is_primary)
        .or_else(|| files.first())
        .ok_or_else(|| NexusDeckError::NotFound("No downloadable file found".into()))?;

    let staging = std::path::PathBuf::from(&profile.staging_path);
    dm.start_download(
        app,
        nexus,
        &profile.game_domain,
        installed.nexus_mod_id as u64,
        primary.file_id,
        &primary.file_name,
        &staging,
        primary.size_kb,
    )
    .await?;

    Ok(())
}

pub fn list_outdated_mods(installed: &[InstalledMod], latest_versions: &[(u64, String)]) -> Vec<String> {
    let lookup: std::collections::HashMap<u64, &str> = latest_versions
        .iter()
        .map(|(id, v)| (*id, v.as_str()))
        .collect();

    installed
        .iter()
        .filter_map(|m| {
            lookup.get(&(m.nexus_mod_id as u64)).and_then(|latest| {
                if m.version.as_deref() != Some(*latest) {
                    Some(m.id.clone())
                } else {
                    None
                }
            })
        })
        .collect()
}

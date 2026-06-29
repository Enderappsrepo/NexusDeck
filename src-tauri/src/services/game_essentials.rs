//! Curated one-click essentials: manifest, status, download queue, post-batch actions.

use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use std::path::Path;

use crate::db;
use crate::games::GameRegistry;
use crate::error::{NexusDeckError, Result};
use crate::services::download_manager::{DownloadManager, DownloadProgress};
use crate::services::load_order;
use crate::services::nexus_client::NexusClient;
use crate::services::tools;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GameEssentialSetupStep {
    pub id: String,
    pub label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GameEssentialInstallPreset {
    pub strategy: String,
    #[serde(default)]
    pub auto_confirm: bool,
    #[serde(default)]
    pub fomod_preset: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GameEssentialMod {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub kind: Option<String>,
    pub nexus_mod_id: u64,
    #[serde(default)]
    pub nexus_file_id: Option<u64>,
    pub priority: u32,
    #[serde(default = "default_true")]
    pub required: bool,
    #[serde(default)]
    pub optional: bool,
    #[serde(default)]
    pub depends_on: Vec<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub install_preset: Option<GameEssentialInstallPreset>,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GameEssentialsManifest {
    pub id: String,
    pub domain: String,
    pub display_name: String,
    pub description: String,
    pub setup_steps: Vec<GameEssentialSetupStep>,
    pub mods: Vec<GameEssentialMod>,
    #[serde(default)]
    pub post_batch: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GameEssentialModStatus {
    pub id: String,
    pub name: String,
    pub nexus_mod_id: u64,
    pub required: bool,
    pub optional: bool,
    pub installed: bool,
    pub downloading: bool,
    pub description: Option<String>,
    pub depends_on: Vec<String>,
    pub install_preset: Option<GameEssentialInstallPreset>,
    pub kind: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueuedEssentialMod {
    pub essential_id: String,
    pub download: DownloadProgress,
}

fn load_manifest(domain: &str) -> Result<GameEssentialsManifest> {
    let raw = match domain {
        "fallout4" | "fo4" => include_str!("../knowledge/fallout4/game_essentials.json"),
        "skyrimspecialedition" | "skyrimse" => {
            include_str!("../knowledge/skyrim/game_essentials.json")
        }
        other => {
            return Err(NexusDeckError::GameNotFound(format!(
                "No one-click essentials list for {other}"
            )));
        }
    };
    serde_json::from_str(raw).map_err(|e| NexusDeckError::Other(format!("Invalid essentials manifest: {e}")))
}

fn mod_installed(profile_id: &str, nexus_mod_id: u64) -> Result<bool> {
    Ok(db::list_installed_mods(profile_id)?
        .iter()
        .any(|m| m.nexus_mod_id == nexus_mod_id as i64))
}

fn kind_installed(profile_id: &str, kind: &str) -> Result<bool> {
    match kind {
        "bodyslide" => Ok(tools::detect_bodyslide(profile_id)?.installed),
        "cbbe" => Ok(tools::profile_has_body_mod(profile_id)?),
        "script_extender" => {
            let profile = db::get_profile(profile_id)?
                .ok_or_else(|| NexusDeckError::NotFound("Profile not found".into()))?;
            let plugin = GameRegistry::get(&profile.game_domain)?;
            Ok(plugin
                .detect_script_extender(Path::new(&profile.game_path))
                .installed)
        }
        _ => Ok(false),
    }
}

fn mod_downloading(active: &[DownloadProgress], nexus_mod_id: u64) -> bool {
    active.iter().any(|d| {
        d.mod_id == nexus_mod_id
            && matches!(d.status.as_str(), "queued" | "downloading" | "paused")
    })
}

pub fn get_game_essentials_manifest(domain: &str) -> Result<GameEssentialsManifest> {
    load_manifest(domain)
}

pub fn get_game_essentials_status(profile_id: &str) -> Result<Vec<GameEssentialModStatus>> {
    let profile = db::get_profile(profile_id)?
        .ok_or_else(|| NexusDeckError::NotFound("Profile not found".into()))?;
    let manifest = load_manifest(&profile.game_domain)?;
    let active: Vec<DownloadProgress> = db::list_downloads()?
        .into_iter()
        .filter(|d| d.profile_id == profile_id)
        .map(|d| DownloadProgress {
            id: d.id,
            game_domain: d.game_domain,
            mod_id: d.mod_id as u64,
            file_id: d.file_id as u64,
            file_name: String::new(),
            bytes_done: d.bytes_done as u64,
            bytes_total: d.bytes_total as u64,
            status: d.status,
            dest_path: d.dest_path,
            mod_name: d.mod_name,
            profile_id: d.profile_id,
            update_target_mod_id: d.update_target_mod_id,
            auto_install: false,
            queue_position: 0,
        })
        .collect();

    let mut out = Vec::new();
    for m in manifest.mods {
        let installed = if let Some(ref kind) = m.kind {
            kind_installed(profile_id, kind)?
        } else {
            mod_installed(profile_id, m.nexus_mod_id)?
        };
        out.push(GameEssentialModStatus {
            id: m.id.clone(),
            name: m.name.clone(),
            nexus_mod_id: m.nexus_mod_id,
            required: m.required,
            optional: m.optional,
            installed,
            downloading: mod_downloading(&active, m.nexus_mod_id),
            description: m.description.clone(),
            depends_on: m.depends_on.clone(),
            install_preset: m.install_preset.clone(),
            kind: m.kind.clone(),
        });
    }
    Ok(out)
}

fn sorted_mods(manifest: &GameEssentialsManifest) -> Vec<&GameEssentialMod> {
    let mut mods: Vec<_> = manifest.mods.iter().collect();
    mods.sort_by_key(|m| m.priority);
    mods
}

fn resolve_mod_ids(manifest: &GameEssentialsManifest, mod_ids: &[String]) -> Result<Vec<String>> {
    if mod_ids.is_empty() {
        return Ok(sorted_mods(manifest)
            .into_iter()
            .map(|m| m.id.clone())
            .collect());
    }
    let known: HashSet<_> = manifest.mods.iter().map(|m| m.id.as_str()).collect();
    for id in mod_ids {
        if !known.contains(id.as_str()) {
            return Err(NexusDeckError::NotFound(format!("Unknown essential mod id: {id}")));
        }
    }
    let mut ordered: Vec<String> = sorted_mods(manifest)
        .into_iter()
        .map(|m| m.id.clone())
        .filter(|id| mod_ids.contains(id))
        .collect();
    if ordered.is_empty() {
        ordered = mod_ids.to_vec();
    }
    Ok(ordered)
}

pub async fn queue_game_essential_mods(
    app: AppHandle,
    nexus: Arc<NexusClient>,
    downloads: Arc<DownloadManager>,
    profile_id: &str,
    mod_ids: Vec<String>,
) -> Result<Vec<QueuedEssentialMod>> {
    let profile = db::get_profile(profile_id)?
        .ok_or_else(|| NexusDeckError::NotFound("Profile not found".into()))?;
    let manifest = load_manifest(&profile.game_domain)?;
    let ordered_ids = resolve_mod_ids(&manifest, &mod_ids)?;
    let by_id: HashMap<_, _> = manifest.mods.iter().map(|m| (m.id.as_str(), m)).collect();
    let selected: HashSet<String> = ordered_ids.iter().cloned().collect();

    let mut queued = Vec::new();

    for id in ordered_ids {
        let entry = by_id
            .get(id.as_str())
            .ok_or_else(|| NexusDeckError::NotFound(format!("Essential mod {id} not found")))?;

        for dep in &entry.depends_on {
            if !selected.contains(dep) {
                return Err(NexusDeckError::Other(format!(
                    "{} requires {} — include it in your selection.",
                    entry.name, dep
                )));
            }
        }

        let already = if let Some(ref kind) = entry.kind {
            kind_installed(profile_id, kind)?
        } else {
            mod_installed(profile_id, entry.nexus_mod_id)?
        };
        if already {
            continue;
        }

        let files = nexus
            .get_mod_files(&profile.game_domain, entry.nexus_mod_id)
            .await?;
        let file = if let Some(file_id) = entry.nexus_file_id {
            files
                .iter()
                .find(|f| f.file_id == file_id)
                .or_else(|| files.iter().find(|f| f.is_primary))
                .or_else(|| files.first())
        } else {
            files.iter().find(|f| f.is_primary).or_else(|| files.first())
        }
        .ok_or_else(|| {
            NexusDeckError::NotFound(format!("No download files found for {}", entry.name))
        })?;

        let progress = downloads
            .enqueue_download(
                app.clone(),
                Arc::clone(&nexus),
                &profile.game_domain,
                entry.nexus_mod_id,
                file.file_id,
                &file.file_name,
                PathBuf::from(&profile.staging_path).as_path(),
                file.size_kb,
                &entry.name,
                &profile.id,
                None,
                0,
            )
            .await?;
        downloads.mark_auto_install(&progress.id);

        queued.push(QueuedEssentialMod {
            essential_id: entry.id.clone(),
            download: progress,
        });
    }

    Ok(queued)
}

pub fn finish_game_essentials(profile_id: &str) -> Result<Vec<String>> {
    let profile = db::get_profile(profile_id)?
        .ok_or_else(|| NexusDeckError::NotFound("Profile not found".into()))?;
    let manifest = load_manifest(&profile.game_domain)?;
    let mut messages = Vec::new();

    for action in &manifest.post_batch {
        match action.as_str() {
            "loot_sort" => match load_order::auto_sort_load_order(&profile.id) {
                Ok(_) => messages.push("Load order sorted with LOOT.".into()),
                Err(e) => messages.push(format!("LOOT sort skipped: {e}")),
            },
            "bodyslide_paths" => {
                if tools::game_supports_body_setup(&profile.game_domain) {
                    match tools::configure_bodyslide_paths(&profile.id) {
                        Ok(_) => messages.push("BodySlide paths configured.".into()),
                        Err(e) => messages.push(format!("BodySlide paths skipped: {e}")),
                    }
                }
            }
            "plugins_sync" => match crate::services::plugins_txt::sync_plugins_txt(&profile) {
                Ok(_) => messages.push("plugins.txt synced.".into()),
                Err(e) => messages.push(format!("plugins.txt sync skipped: {e}")),
            },
            other => messages.push(format!("Unknown post action: {other}")),
        }
    }

    Ok(messages)
}

pub async fn queue_mod_for_install(
    app: AppHandle,
    nexus: Arc<NexusClient>,
    downloads: Arc<DownloadManager>,
    profile_id: String,
    nexus_mod_id: u64,
    nexus_file_id: Option<u64>,
    mod_name: String,
) -> Result<DownloadProgress> {
    let profile = db::get_profile(&profile_id)?
        .ok_or_else(|| NexusDeckError::NotFound("Profile not found".into()))?;

    let files = nexus
        .get_mod_files(&profile.game_domain, nexus_mod_id)
        .await?;
    let file = if let Some(file_id) = nexus_file_id {
        files
            .iter()
            .find(|f| f.file_id == file_id)
            .or_else(|| files.iter().find(|f| f.is_primary))
            .or_else(|| files.first())
    } else {
        files.iter().find(|f| f.is_primary).or_else(|| files.first())
    }
    .ok_or_else(|| NexusDeckError::NotFound("No mod files found.".into()))?;

    let progress = downloads
        .enqueue_download(
            app,
            nexus,
            &profile.game_domain,
            nexus_mod_id,
            file.file_id,
            &file.file_name,
            PathBuf::from(&profile.staging_path).as_path(),
            file.size_kb,
            &mod_name,
            &profile.id,
            None,
            0,
        )
        .await?;
    downloads.mark_auto_install(&progress.id);
    Ok(progress)
}

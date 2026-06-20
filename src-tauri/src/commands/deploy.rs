use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::db::{self, InstalledMod};
use crate::error::Result;
use crate::games;
use crate::services::archive::list_archive_entries;
use crate::services::deploy::{
    archive_top_level_folders, compute_deploy_paths, filter_deploy_paths,
};
use crate::services::mod_state::{apply_mod_enabled_state, backup_installed_files};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstallOptions {
    pub strategy: String,
    pub enable_mod: bool,
    pub overwrite_files: bool,
}

impl Default for InstallOptions {
    fn default() -> Self {
        Self {
            strategy: "auto".to_string(),
            enable_mod: true,
            overwrite_files: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstallPreview {
    pub entries: Vec<crate::services::archive::ArchiveEntry>,
    pub deploy_files: Vec<String>,
    pub plan: games::DeployPlan,
    pub conflicts: Vec<crate::services::conflict::FileConflict>,
    pub file_count: usize,
    pub skipped_existing: usize,
    pub strategies: Vec<StrategyOption>,
    pub archive_folders: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StrategyOption {
    pub id: String,
    pub label: String,
    pub description: String,
}

fn available_strategies() -> Vec<StrategyOption> {
    vec![
        StrategyOption {
            id: "auto".into(),
            label: "Automatic (recommended)".into(),
            description: "Detect the best layout from archive structure".into(),
        },
        StrategyOption {
            id: "merge_data".into(),
            label: "Merge into Data/".into(),
            description: "Copy archive Data/ folder into the game Data/ directory".into(),
        },
        StrategyOption {
            id: "copy_loose_to_data".into(),
            label: "Copy loose files to Data/".into(),
            description: "Copy .esp, .ba2, and related files into Data/".into(),
        },
        StrategyOption {
            id: "merge_root".into(),
            label: "Install to game root".into(),
            description: "Copy files to the Fallout 4 root folder (DLLs, loaders)".into(),
        },
        StrategyOption {
            id: "staging_only".into(),
            label: "Extract to staging only".into(),
            description: "Do not modify game files — keep a copy in your staging folder".into(),
        },
    ]
}

fn preview_conflicts(
    profile_id: &str,
    deploy_files: &[String],
    mod_name: &str,
) -> Result<Vec<crate::services::conflict::FileConflict>> {
    let existing: Vec<(String, Vec<String>)> = db::list_installed_mods(profile_id)?
        .into_iter()
        .map(|m| {
            let files: Vec<String> =
                serde_json::from_str(&m.installed_files_json).unwrap_or_default();
            (m.name, files)
        })
        .collect();

    Ok(crate::services::conflict::detect_conflicts(
        &existing,
        deploy_files,
        mod_name,
    ))
}

#[tauri::command]
pub async fn preview_mod_install(
    profile_id: String,
    archive_path: String,
    mod_name: String,
    strategy: String,
) -> Result<InstallPreview> {
    let profile = db::get_profile(&profile_id)?
        .ok_or_else(|| crate::error::NexusDeckError::NotFound("Profile not found".into()))?;

    let archive = PathBuf::from(&archive_path);
    let entries = list_archive_entries(&archive)?;

    let game_path = PathBuf::from(&profile.game_path);
    let plan = games::build_plan_for_strategy(
        &profile.game_domain,
        game_path.as_path(),
        &entries,
        &strategy,
    )?;

    let deploy_files = compute_deploy_paths(&plan, &entries, game_path.as_path());
    let (planned, skipped_existing) = filter_deploy_paths(&deploy_files, false);
    let conflicts = preview_conflicts(&profile.id, &planned, &mod_name)?;
    let archive_folders = archive_top_level_folders(&entries);

    Ok(InstallPreview {
        file_count: planned.len(),
        skipped_existing,
        deploy_files: planned,
        entries: entries.into_iter().take(100).collect(),
        plan,
        conflicts,
        strategies: available_strategies(),
        archive_folders,
    })
}

#[tauri::command]
pub async fn install_mod_from_archive(
    profile_id: String,
    mod_name: String,
    nexus_mod_id: i64,
    nexus_file_id: i64,
    archive_path: String,
    options: InstallOptions,
) -> Result<serde_json::Value> {
    use uuid::Uuid;

    use crate::services::archive::extract_archive;
    use crate::services::paths::install_work_dir;
    use crate::services::MergeOptions;

    let profile = db::get_profile(&profile_id)?
        .ok_or_else(|| crate::error::NexusDeckError::NotFound("Profile not found".into()))?;

    let archive = PathBuf::from(&archive_path);
    let entries = list_archive_entries(&archive)?;

    let plan = games::build_plan_for_strategy(
        &profile.game_domain,
        PathBuf::from(&profile.game_path).as_path(),
        &entries,
        &options.strategy,
    )?;

    let temp_extract = install_work_dir()?.join(format!("nexusdeck-install-{}", Uuid::new_v4()));
    extract_archive(&archive, &temp_extract)?;

    let merge_options = MergeOptions {
        overwrite: options.overwrite_files,
        dry_run: false,
    };

    let (manifest, plan, conflicts) = games::deploy_mod(
        &profile.game_domain,
        &profile,
        &temp_extract,
        &entries,
        Some(&plan),
        merge_options,
        &mod_name,
    )?;

    if manifest.files.is_empty() {
        let _ = std::fs::remove_dir_all(&temp_extract);
        return Err(crate::error::NexusDeckError::Other(
            "No files were installed. Enable \"Overwrite existing files\" if the mod is already present in your Data folder.".into(),
        ));
    }

    let mod_id = Uuid::new_v4().to_string();
    backup_installed_files(&profile, &mod_id, &manifest.files)?;

    let mut mod_record = InstalledMod {
        id: mod_id,
        profile_id: profile.id.clone(),
        nexus_mod_id,
        nexus_file_id: Some(nexus_file_id),
        name: mod_name,
        version: None,
        enabled: true,
        installed_files_json: serde_json::to_string(&manifest.files)?,
        installed_at: chrono::Utc::now().timestamp(),
    };

    if !options.enable_mod {
        apply_mod_enabled_state(&profile, &mod_record, false)?;
        mod_record.enabled = false;
    }

    db::save_installed_mod(&mod_record)?;

    // Ensure loose-file assets actually load (Creation Engine archive
    // invalidation). Best-effort: never fail an install over it.
    let archive_invalidation = crate::services::game_settings::ensure_archive_invalidation(&profile)
        .unwrap_or(false);

    let _ = std::fs::remove_dir_all(&temp_extract);

    Ok(serde_json::json!({
        "mod": mod_record,
        "plan": plan,
        "conflicts": conflicts,
        "files_installed": manifest.files.len(),
        "archive_invalidation": archive_invalidation,
    }))
}

#[tauri::command]
pub fn list_installed_mods(profile_id: String) -> Result<Vec<InstalledMod>> {
    db::list_installed_mods(&profile_id)
}

#[tauri::command]
pub fn set_mod_enabled(mod_id: String, enabled: bool) -> Result<()> {
    let mod_record = db::get_installed_mod(&mod_id)?
        .ok_or_else(|| crate::error::NexusDeckError::NotFound("Mod not found".into()))?;

    if mod_record.enabled == enabled {
        return Ok(());
    }

    let profile = db::get_profile(&mod_record.profile_id)?
        .ok_or_else(|| crate::error::NexusDeckError::NotFound("Profile not found".into()))?;

    apply_mod_enabled_state(&profile, &mod_record, enabled)?;
    db::set_mod_enabled(&mod_id, enabled)
}

#[tauri::command]
pub fn analyze_archive(
    archive_path: String,
    game_domain: String,
    game_path: String,
) -> Result<serde_json::Value> {
    let entries = list_archive_entries(PathBuf::from(&archive_path).as_path())?;
    let plan = games::build_plan_for_strategy(
        &game_domain,
        PathBuf::from(&game_path).as_path(),
        &entries,
        "auto",
    )?;
    Ok(serde_json::json!({
        "entries": entries,
        "plan": plan,
        "strategies": available_strategies(),
    }))
}

#[tauri::command]
pub fn check_mod_conflicts(
    profile_id: String,
    new_files: Vec<String>,
    mod_name: String,
) -> Result<Vec<crate::services::conflict::FileConflict>> {
    preview_conflicts(&profile_id, &new_files, &mod_name)
}

#[tauri::command]
pub fn get_install_strategies() -> Result<Vec<StrategyOption>> {
    Ok(available_strategies())
}

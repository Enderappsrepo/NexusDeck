use std::path::PathBuf;

use crate::db;
use crate::error::{NexusDeckError, Result};
use crate::services::archive;
use crate::services::compare::{self, ModCompareResult};

fn load_installed_manifests(profile_id: &str) -> Result<Vec<(String, Vec<String>)>> {
    Ok(db::list_installed_mods(profile_id)?
        .into_iter()
        .map(|m| {
            let files: Vec<String> = serde_json::from_str(&m.installed_files_json).unwrap_or_default();
            (m.name, files)
        })
        .collect())
}

#[tauri::command]
pub async fn compare_staging_archives(
    profile_id: String,
    archive_a: String,
    archive_b: String,
) -> Result<ModCompareResult> {
    let profile = db::get_profile(&profile_id)?
        .ok_or_else(|| NexusDeckError::NotFound("Profile not found".into()))?;
    let staging = PathBuf::from(&profile.staging_path);
    let path_a = archive::resolve_mod_archive(&staging, &archive_a)?;
    let path_b = archive::resolve_mod_archive(&staging, &archive_b)?;
    let files_a = archive::list_archive_entries(&path_a)?
        .into_iter()
        .map(|e| e.path)
        .collect::<Vec<_>>();
    let files_b = archive::list_archive_entries(&path_b)?
        .into_iter()
        .map(|e| e.path)
        .collect::<Vec<_>>();
    let installed = load_installed_manifests(&profile_id)?;
    Ok(compare::compare_file_lists(
        &files_a,
        &files_b,
        &archive_a,
        &archive_b,
        &installed,
    ))
}

#[tauri::command]
pub async fn compare_installed_mods(
    profile_id: String,
    mod_a_id: String,
    mod_b_id: String,
) -> Result<ModCompareResult> {
    let mod_a = db::get_installed_mod(&mod_a_id)?
        .ok_or_else(|| NexusDeckError::NotFound("Mod A not found".into()))?;
    let mod_b = db::get_installed_mod(&mod_b_id)?
        .ok_or_else(|| NexusDeckError::NotFound("Mod B not found".into()))?;

    let files_a: Vec<String> = serde_json::from_str(&mod_a.installed_files_json).unwrap_or_default();
    let files_b: Vec<String> = serde_json::from_str(&mod_b.installed_files_json).unwrap_or_default();
    let installed = load_installed_manifests(&profile_id)?;

    Ok(compare::compare_file_lists(
        &files_a,
        &files_b,
        &mod_a.name,
        &mod_b.name,
        &installed,
    ))
}

#[tauri::command]
pub async fn compare_mod_with_installed(
    profile_id: String,
    staging_archive: String,
    installed_mod_id: String,
) -> Result<ModCompareResult> {
    let profile = db::get_profile(&profile_id)?
        .ok_or_else(|| NexusDeckError::NotFound("Profile not found".into()))?;
    let installed_mod = db::get_installed_mod(&installed_mod_id)?
        .ok_or_else(|| NexusDeckError::NotFound("Installed mod not found".into()))?;
    let staging = PathBuf::from(&profile.staging_path);
    let path = archive::resolve_mod_archive(&staging, &staging_archive)?;
    let staging_files = archive::list_archive_entries(&path)?
        .into_iter()
        .map(|e| e.path)
        .collect::<Vec<_>>();
    let installed_files: Vec<String> =
        serde_json::from_str(&installed_mod.installed_files_json).unwrap_or_default();
    let installed = load_installed_manifests(&profile_id)?;

    Ok(compare::compare_file_lists(
        &staging_files,
        &installed_files,
        &staging_archive,
        &installed_mod.name,
        &installed,
    ))
}

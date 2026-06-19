use std::path::PathBuf;

use crate::db;
use crate::error::{NexusDeckError, Result};
use crate::services::archive;
use crate::services::mod_preview::{self, PreviewFileResult, PreviewNode};

#[tauri::command]
pub async fn get_archive_file_tree(
    profile_id: String,
    archive_name: String,
) -> Result<Vec<PreviewNode>> {
    let profile = db::get_profile(&profile_id)?
        .ok_or_else(|| NexusDeckError::NotFound("Profile not found".into()))?;
    let staging = PathBuf::from(&profile.staging_path);
    let path = archive::resolve_mod_archive(&staging, &archive_name)?;
    let entries = archive::list_archive_entries(&path)?;
    Ok(mod_preview::build_file_tree(&entries))
}

#[tauri::command]
pub async fn preview_archive_file(
    profile_id: String,
    archive_name: String,
    inner_path: String,
) -> Result<PreviewFileResult> {
    let profile = db::get_profile(&profile_id)?
        .ok_or_else(|| NexusDeckError::NotFound("Profile not found".into()))?;
    let staging = PathBuf::from(&profile.staging_path);
    let path = archive::resolve_mod_archive(&staging, &archive_name)?;
    let extracted = mod_preview::extract_preview_file(&path, &inner_path)?;
    mod_preview::read_preview_bytes(&extracted)
}

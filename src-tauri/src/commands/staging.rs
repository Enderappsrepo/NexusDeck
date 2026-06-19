use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use zip::write::SimpleFileOptions;
use zip::ZipWriter;

use crate::db;
use crate::error::{NexusDeckError, Result};
use crate::services::archive::{is_supported_archive, resolve_mod_archive};
use crate::services::paths::ensure_dir;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StagingFile {
    pub name: String,
    pub path: String,
    pub size: u64,
    pub modified_at: i64,
}

const ARCHIVE_EXTENSIONS: &[&str] = &["zip", "7z", "rar"];

fn is_archive(path: &Path) -> bool {
    let name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .to_lowercase();
    if ARCHIVE_EXTENSIONS
        .iter()
        .any(|ext| name.ends_with(&format!(".{ext}")))
    {
        return true;
    }
    is_supported_archive(path)
}

#[tauri::command]
pub fn list_staging_archives(staging_path: String) -> Result<Vec<StagingFile>> {
    let dir = PathBuf::from(&staging_path);
    if !dir.exists() {
        return Ok(Vec::new());
    }

    let mut files = Vec::new();
    for entry in fs::read_dir(&dir).map_err(|e| NexusDeckError::Io(e))? {
        let entry = entry?;
        let path = entry.path();
        if path.is_file() && is_archive(&path) {
            let meta = entry.metadata()?;
            files.push(StagingFile {
                name: path
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_string(),
                path: path.display().to_string(),
                size: meta.len(),
                modified_at: meta
                    .modified()
                    .ok()
                    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|d| d.as_secs() as i64)
                    .unwrap_or(0),
            });
        }
    }

    files.sort_by(|a, b| b.modified_at.cmp(&a.modified_at));
    Ok(files)
}

#[tauri::command]
pub fn create_practice_mod(profile_id: String) -> Result<StagingFile> {
    let profile = db::get_profile(&profile_id)?
        .ok_or_else(|| NexusDeckError::NotFound("Profile not found".into()))?;

    ensure_dir(Path::new(&profile.staging_path))?;

    let archive_name = "NexusDeck_Practice_Mod.zip";
    let archive_path = PathBuf::from(&profile.staging_path).join(archive_name);

    let file = fs::File::create(&archive_path)?;
    let mut zip = ZipWriter::new(file);
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    zip.start_file("Data/NexusDeck/practice.txt", options)
        .map_err(|e| NexusDeckError::Archive(e.to_string()))?;
    zip.write_all(
        b"NexusDeck practice mod\n\nThis file is safe to delete. It tests the install pipeline without Nexus Premium.\n",
    )?;

    zip.start_file("Data/NexusDeck/NexusDeck_TestMarker.txt", options)
        .map_err(|e| NexusDeckError::Archive(e.to_string()))?;
    zip.write_all(b"Installed by NexusDeck practice mode.\n")?;

    zip.finish()
        .map_err(|e| NexusDeckError::Archive(e.to_string()))?;

    let meta = fs::metadata(&archive_path)?;
    Ok(StagingFile {
        name: archive_name.to_string(),
        path: archive_path.display().to_string(),
        size: meta.len(),
        modified_at: chrono::Utc::now().timestamp(),
    })
}

#[tauri::command]
pub fn get_nexus_browser_urls(
    game_domain: String,
    mod_id: u64,
    file_id: Option<u64>,
) -> Result<serde_json::Value> {
    let mod_page = format!("https://www.nexusmods.com/{game_domain}/mods/{mod_id}");
    let files_tab = format!("{mod_page}?tab=files");
    let file_page = file_id.map(|id| format!("{mod_page}?tab=files&file_id={id}&nmm=1"));

    Ok(serde_json::json!({
        "mod_page": mod_page,
        "files_tab": files_tab,
        "file_page": file_page,
        "premium_info_url": "https://www.nexusmods.com/premium",
        "notes": "Free accounts must download through the Nexus website. Save the file to your staging folder, then use Import from staging."
    }))
}

#[tauri::command]
pub fn resolve_mod_archive_path(staging_path: String, file_name: String) -> Result<StagingFile> {
    let dir = PathBuf::from(&staging_path);
    let path = resolve_mod_archive(&dir, &file_name)?;
    let meta = fs::metadata(&path)?;
    Ok(StagingFile {
        name: path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string(),
        path: path.display().to_string(),
        size: meta.len(),
        modified_at: meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0),
    })
}

#[tauri::command]
pub fn watch_staging_ready(staging_path: String, file_name: String) -> Result<bool> {
    let dir = PathBuf::from(&staging_path);
    Ok(resolve_mod_archive(&dir, &file_name).is_ok())
}

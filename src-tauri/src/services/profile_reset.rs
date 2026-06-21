use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use walkdir::WalkDir;

use crate::db::{self, Profile};
use crate::error::{NexusDeckError, Result};
use crate::games::GameRegistry;
use crate::services::mod_uninstall;
use crate::services::plugins_txt;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResetProfileOptions {
    pub backup_before: bool,
    pub clear_staging: bool,
    pub clear_downloads: bool,
    pub reset_plugins_txt: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResetProfileResult {
    pub mods_removed: usize,
    pub downloads_cleared: usize,
    pub staging_cleared: bool,
    pub plugins_txt_reset: bool,
    pub backup_path: Option<String>,
    pub warnings: Vec<String>,
}

pub fn reset_profile_mods(profile_id: &str, options: ResetProfileOptions) -> Result<ResetProfileResult> {
    let profile = db::get_profile(profile_id)?
        .ok_or_else(|| NexusDeckError::NotFound("Profile not found".into()))?;

    let mut backup_path = None;
    if options.backup_before {
        let dest = PathBuf::from(&profile.staging_path)
            .join("backups")
            .join(format!(
                "pre_reset_{}.json",
                chrono::Utc::now().format("%Y%m%d_%H%M%S")
            ));
        if let Some(parent) = dest.parent() {
            fs::create_dir_all(parent)?;
        }
        db::backup_profile(profile_id, &dest.display().to_string())?;
        backup_path = Some(dest.display().to_string());
    }

    let mods = db::list_installed_mods(profile_id)?;
    let mut warnings = Vec::new();
    let mut mods_removed = 0usize;

    for mod_record in mods {
        match mod_uninstall::uninstall_mod(&mod_record.id) {
            Ok(result) => {
                mods_removed += 1;
                warnings.extend(result.warnings);
            }
            Err(e) => warnings.push(format!("Failed to remove {}: {e}", mod_record.name)),
        }
    }

    let downloads_cleared = if options.clear_downloads {
        clear_profile_downloads(&profile)?
    } else {
        0
    };

    let staging_cleared = if options.clear_staging {
        clear_staging_folder(&profile.staging_path)?
    } else {
        false
    };

    let plugins_txt_reset = if options.reset_plugins_txt {
        reset_plugins_to_vanilla(&profile)?
    } else {
        false
    };

    Ok(ResetProfileResult {
        mods_removed,
        downloads_cleared,
        staging_cleared,
        plugins_txt_reset,
        backup_path,
        warnings,
    })
}

fn clear_profile_downloads(profile: &Profile) -> Result<usize> {
    let downloads = db::list_downloads()?;
    let mut cleared = 0usize;

    for record in downloads {
        if !record.profile_id.is_empty() && record.profile_id != profile.id {
            continue;
        }
        if record.profile_id.is_empty() && record.game_domain != profile.game_domain {
            continue;
        }

        let path = PathBuf::from(&record.dest_path);
        if path.exists() {
            if path.is_file() {
                let _ = fs::remove_file(&path);
            } else if path.is_dir() {
                let _ = fs::remove_dir_all(&path);
            }
        }
        db::delete_download(&record.id)?;
        cleared += 1;
    }

    Ok(cleared)
}

fn clear_staging_folder(staging_path: &str) -> Result<bool> {
    let root = Path::new(staging_path);
    if !root.exists() {
        fs::create_dir_all(root)?;
        return Ok(true);
    }

    for entry in fs::read_dir(root)? {
        let entry = entry?;
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_lowercase();
        if name == "backups" {
            continue;
        }
        if path.is_dir() {
            fs::remove_dir_all(&path)?;
        } else {
            fs::remove_file(&path)?;
        }
    }
    Ok(true)
}

fn reset_plugins_to_vanilla(profile: &Profile) -> Result<bool> {
    let plugin = GameRegistry::get(&profile.game_domain)?;
    let Some(plugins_path) = plugin.plugins_txt_path(profile) else {
        return Ok(false);
    };

    let vanilla = collect_vanilla_plugins(&profile.game_path, &profile.game_domain);
    if vanilla.is_empty() {
        let _ = plugins_txt::sync_plugins_txt(profile)?;
        return Ok(true);
    }

    if let Some(parent) = plugins_path.parent() {
        fs::create_dir_all(parent)?;
    }

    let content: String = vanilla
        .iter()
        .map(|p| format!("*{p}"))
        .collect::<Vec<_>>()
        .join("\n");
    fs::write(&plugins_path, format!("{content}\n"))?;
    Ok(true)
}

fn collect_vanilla_plugins(game_path: &str, game_domain: &str) -> Vec<String> {
    let data_dir = Path::new(game_path).join("Data");
    if !data_dir.is_dir() {
        return Vec::new();
    }

    let vanilla_names: &[&str] = match game_domain {
        "skyrimspecialedition" => &[
            "Skyrim.esm",
            "Update.esm",
            "Dawnguard.esm",
            "HearthFires.esm",
            "Dragonborn.esm",
        ],
        "fallout4" => &[
            "Fallout4.esm",
            "DLCRobot.esm",
            "DLCworkshop01.esm",
            "DLCCoast.esm",
            "DLCworkshop02.esm",
            "DLCworkshop03.esm",
            "DLCNukaWorld.esm",
        ],
        "skyrim" => &["Skyrim.esm", "Update.esm"],
        _ => &[],
    };

    if vanilla_names.is_empty() {
        return WalkDir::new(&data_dir)
            .max_depth(1)
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_type().is_file())
            .filter_map(|e| e.file_name().to_str().map(str::to_string))
            .filter(|n| n.to_lowercase().ends_with(".esm"))
            .collect();
    }

    vanilla_names
        .iter()
        .filter(|name| data_dir.join(name).exists())
        .map(|s| (*s).to_string())
        .collect()
}

use std::path::{Path, PathBuf};

use crate::db::{InstalledMod, Profile};
use crate::error::{NexusDeckError, Result};

pub fn mod_backup_root(profile: &Profile, mod_id: &str) -> PathBuf {
    PathBuf::from(&profile.staging_path)
        .join("mod_backups")
        .join(mod_id)
}

fn backup_relative_path(profile: &Profile, game_file: &Path) -> PathBuf {
    let data_root = Path::new(&profile.game_path).join("Data");
    if let Ok(rel) = game_file.strip_prefix(&data_root) {
        return rel.to_path_buf();
    }
    game_file
        .file_name()
        .map(PathBuf::from)
        .unwrap_or_default()
}

fn backup_path_for(profile: &Profile, mod_id: &str, game_file: &Path) -> PathBuf {
    mod_backup_root(profile, mod_id).join(backup_relative_path(profile, game_file))
}

pub fn installed_file_paths(mod_record: &InstalledMod) -> Result<Vec<String>> {
    serde_json::from_str(&mod_record.installed_files_json).map_err(Into::into)
}

pub fn backup_installed_files(
    profile: &Profile,
    mod_id: &str,
    game_files: &[String],
) -> Result<()> {
    for game_path in game_files {
        let src = Path::new(game_path);
        if !src.is_file() {
            continue;
        }
        let dest = backup_path_for(profile, mod_id, src);
        if let Some(parent) = dest.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::copy(src, &dest)?;
    }
    Ok(())
}

pub fn disable_mod_files(profile: &Profile, mod_record: &InstalledMod) -> Result<()> {
    let files = installed_file_paths(mod_record)?;

    for game_path in files {
        let path = Path::new(&game_path);
        if !path.is_file() {
            continue;
        }

        let backup = backup_path_for(profile, &mod_record.id, path);
        if let Some(parent) = backup.parent() {
            std::fs::create_dir_all(parent)?;
        }
        if !backup.exists() {
            std::fs::copy(path, &backup)?;
        }
        std::fs::remove_file(path)?;
    }

    Ok(())
}

pub fn enable_mod_files(profile: &Profile, mod_record: &InstalledMod) -> Result<()> {
    let files = installed_file_paths(mod_record)?;
    let mut restored = 0usize;

    for game_path in files {
        let path = Path::new(&game_path);
        let backup = backup_path_for(profile, &mod_record.id, path);

        if backup.is_file() {
            if let Some(parent) = path.parent() {
                std::fs::create_dir_all(parent)?;
            }
            std::fs::copy(&backup, path)?;
            restored += 1;
            continue;
        }

        if path.is_file() {
            // Already present in the game folder (e.g. disabled before backups existed).
            if let Some(parent) = backup.parent() {
                std::fs::create_dir_all(parent)?;
            }
            std::fs::copy(path, &backup)?;
            restored += 1;
        }
    }

    if restored == 0 {
        return Err(NexusDeckError::Other(format!(
            "Could not restore \"{}\" — backup files are missing. Reinstall the mod to enable it again.",
            mod_record.name
        )));
    }

    Ok(())
}

pub fn apply_mod_enabled_state(
    profile: &Profile,
    mod_record: &InstalledMod,
    enabled: bool,
) -> Result<()> {
    if enabled {
        enable_mod_files(profile, mod_record)
    } else {
        disable_mod_files(profile, mod_record)
    }
}

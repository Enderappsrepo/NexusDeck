use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::db::{self, InstalledMod, Profile};
use crate::error::{NexusDeckError, Result};
use crate::services::conflict::detect_conflicts;
use crate::services::mod_state::{backup_path_for, installed_file_paths, mod_backup_root};
use crate::services::plugins_txt;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UninstallResult {
    pub removed_files: usize,
    pub restored_shared_files: usize,
    pub warnings: Vec<String>,
}

/// Remove deployed files and backups but keep the DB row (used before mod updates).
pub fn remove_mod_files_for_update(profile: &Profile, mod_record: &InstalledMod) -> Result<()> {
    snapshot_update_backup(profile, &mod_record.id)?;
    remove_mod_files_with_restore(profile, mod_record, false)?;
    cleanup_mod_backups(profile, &mod_record.id)?;
    Ok(())
}

pub fn uninstall_mod(mod_id: &str) -> Result<UninstallResult> {
    let mod_record = db::get_installed_mod(mod_id)?
        .ok_or_else(|| NexusDeckError::NotFound("Mod not found".into()))?;
    let profile = db::get_profile(&mod_record.profile_id)?
        .ok_or_else(|| NexusDeckError::NotFound("Profile not found".into()))?;

    let other_mods: Vec<InstalledMod> = db::list_installed_mods(&mod_record.profile_id)?
        .into_iter()
        .filter(|m| m.id != mod_record.id)
        .collect();

    let mut warnings = Vec::new();
    let files = installed_file_paths(&mod_record)?;
    for conflict in detect_conflicts(
        &other_mods
            .iter()
            .map(|m| {
                (
                    m.name.clone(),
                    installed_file_paths(m).unwrap_or_default(),
                )
            })
            .collect::<Vec<_>>(),
        &files,
        &mod_record.name,
    ) {
        warnings.push(format!(
            "{} is also used by {}",
            conflict.path, conflict.existing_mod
        ));
    }

    let restored = remove_mod_files_with_restore(&profile, &mod_record, true)?;
    prune_empty_dirs(&profile, &files);
    cleanup_mod_backups(&profile, &mod_record.id)?;

    db::delete_installed_mod(mod_id)?;
    db::renumber_sort_orders(&mod_record.profile_id)?;
    let _ = plugins_txt::sync_plugins_txt(&profile);

    Ok(UninstallResult {
        removed_files: files.len(),
        restored_shared_files: restored,
        warnings,
    })
}

fn remove_mod_files_with_restore(
    profile: &Profile,
    mod_record: &InstalledMod,
    restore_shared: bool,
) -> Result<usize> {
    let files = installed_file_paths(mod_record)?;
    if files.is_empty() {
        return Ok(0);
    }

    let mut restored = 0usize;
    let other_mods = db::list_installed_mods(&mod_record.profile_id)?
        .into_iter()
        .filter(|m| m.id != mod_record.id && m.enabled)
        .collect::<Vec<_>>();

    let mut path_owners: HashMap<String, (&InstalledMod, i32)> = HashMap::new();
    for other in &other_mods {
        for path in installed_file_paths(other)? {
            let key = normalize_path(&path);
            let entry = path_owners.get(&key);
            if entry.map(|(_, order)| other.sort_order > *order).unwrap_or(true) {
                path_owners.insert(key, (other, other.sort_order));
            }
        }
    }

    for game_path in &files {
        let path = Path::new(game_path);
        if mod_record.enabled && path.is_file() {
            fs::remove_file(path)?;
        }

        if !restore_shared {
            continue;
        }

        let key = normalize_path(game_path);
        if let Some((owner, _)) = path_owners.get(&key) {
            let backup = backup_path_for(profile, &owner.id, path);
            if backup.is_file() {
                if let Some(parent) = path.parent() {
                    fs::create_dir_all(parent)?;
                }
                fs::copy(&backup, path)?;
                restored += 1;
            }
        }
    }

    Ok(restored)
}

fn snapshot_update_backup(profile: &Profile, mod_id: &str) -> Result<()> {
    let src = mod_backup_root(profile, mod_id);
    if !src.is_dir() {
        return Ok(());
    }
    let dest = Path::new(&profile.staging_path)
        .join("update_backups")
        .join(mod_id);
    if dest.exists() {
        fs::remove_dir_all(&dest)?;
    }
    copy_dir_recursive(&src, &dest)?;
    Ok(())
}

fn cleanup_mod_backups(profile: &Profile, mod_id: &str) -> Result<()> {
    let backup_root = mod_backup_root(profile, mod_id);
    if backup_root.is_dir() {
        fs::remove_dir_all(&backup_root)?;
    }
    Ok(())
}

/// Remove directories under `Data/` left empty after a mod's files were removed.
/// Walks each affected directory upward, stopping at a non-empty dir or `Data/`.
/// Best-effort — failures are ignored.
fn prune_empty_dirs(profile: &Profile, files: &[String]) {
    let data_root = Path::new(&profile.game_path).join("Data");
    let mut dirs: Vec<PathBuf> = files
        .iter()
        .filter_map(|f| Path::new(f).parent().map(Path::to_path_buf))
        .collect();
    dirs.sort();
    dirs.dedup();

    for dir in dirs {
        let mut current = dir;
        while current.starts_with(&data_root) && current != data_root {
            match fs::read_dir(&current) {
                Ok(mut entries) => {
                    if entries.next().is_some() {
                        break;
                    }
                }
                Err(_) => break,
            }
            if fs::remove_dir(&current).is_err() {
                break;
            }
            match current.parent() {
                Some(parent) => current = parent.to_path_buf(),
                None => break,
            }
        }
    }
}

fn normalize_path(path: &str) -> String {
    Path::new(path)
        .display()
        .to_string()
        .replace('\\', "/")
        .to_lowercase()
}

fn copy_dir_recursive(src: &Path, dest: &Path) -> Result<()> {
    fs::create_dir_all(dest)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let target = dest.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_dir_recursive(&entry.path(), &target)?;
        } else {
            fs::copy(entry.path(), &target)?;
        }
    }
    Ok(())
}

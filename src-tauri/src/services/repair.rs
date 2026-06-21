use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::db::{self, InstalledMod};
use crate::error::{NexusDeckError, Result};
use crate::services::deploy::canonical_deploy_map;
use crate::services::game_settings::ensure_archive_invalidation;
use crate::services::mod_state::installed_file_paths;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RepairResult {
    pub mods_processed: usize,
    pub files_relocated: usize,
    pub warnings: Vec<String>,
}

/// Repair an existing deployment: collapse case-variant sibling folders left by
/// older installs (the cause of missing/purple textures on Linux) by relocating
/// each enabled mod's deployed files into one consistent casing, rewriting the
/// tracked paths, pruning emptied folders, and re-asserting archive
/// invalidation. Files already canonical are untouched, so it's safe to re-run.
pub fn repair_deployment(profile_id: &str) -> Result<RepairResult> {
    let profile = db::get_profile(profile_id)?
        .ok_or_else(|| NexusDeckError::NotFound("Profile not found".into()))?;
    let data_root = Path::new(&profile.game_path).join("Data");

    let mut mods: Vec<InstalledMod> = db::list_installed_mods(profile_id)?
        .into_iter()
        .filter(|m| m.enabled)
        .collect();
    mods.sort_by_key(|m| m.sort_order);
    let mods_processed = mods.len();

    // Gather every deployed Data-relative path, in load order, to build the map.
    let mut all_rel: Vec<String> = Vec::new();
    let mut mod_files: Vec<Vec<String>> = Vec::new();
    for m in &mods {
        let files = installed_file_paths(m)?;
        for abs in &files {
            if let Some(rel) = rel_under(&data_root, abs) {
                all_rel.push(rel);
            }
        }
        mod_files.push(files);
    }

    let canon = canonical_deploy_map(&all_rel);

    let mut files_relocated = 0usize;
    let mut warnings = Vec::new();
    let mut emptied_dirs: Vec<PathBuf> = Vec::new();

    for (m, files) in mods.into_iter().zip(mod_files) {
        let mut new_files: Vec<String> = Vec::with_capacity(files.len());
        for abs in files {
            let Some(rel) = rel_under(&data_root, &abs) else {
                // Outside Data/ (e.g. a game-root DLL) — leave as-is.
                new_files.push(abs);
                continue;
            };
            let canonical_rel = canon.get(&rel).cloned().unwrap_or(rel.clone());
            let canonical_abs = join_under(&data_root, &canonical_rel);
            let canonical_str = canonical_abs.display().to_string();

            if canonical_str != abs {
                let src = Path::new(&abs);
                if src.is_file() {
                    if let Some(parent) = canonical_abs.parent() {
                        let _ = fs::create_dir_all(parent);
                    }
                    if let Err(e) = fs::rename(src, &canonical_abs) {
                        warnings.push(format!("Couldn't move {rel}: {e}"));
                        new_files.push(abs);
                        continue;
                    }
                    files_relocated += 1;
                    if let Some(parent) = src.parent() {
                        emptied_dirs.push(parent.to_path_buf());
                    }
                }
            }
            new_files.push(canonical_str);
        }

        let mut updated = m;
        updated.installed_files_json = serde_json::to_string(&new_files)?;
        db::save_installed_mod(&updated)?;
    }

    prune_empty_dirs(&data_root, &emptied_dirs);
    let _ = ensure_archive_invalidation(&profile);

    Ok(RepairResult {
        mods_processed,
        files_relocated,
        warnings,
    })
}

fn rel_under(data_root: &Path, abs: &str) -> Option<String> {
    Path::new(abs)
        .strip_prefix(data_root)
        .ok()
        .map(|p| p.to_string_lossy().replace('\\', "/"))
}

fn join_under(data_root: &Path, rel: &str) -> PathBuf {
    let mut p = data_root.to_path_buf();
    for comp in rel.split('/').filter(|c| !c.is_empty()) {
        p.push(comp);
    }
    p
}

fn prune_empty_dirs(data_root: &Path, dirs: &[PathBuf]) {
    let mut unique = dirs.to_vec();
    unique.sort();
    unique.dedup();
    for dir in unique {
        let mut current = dir;
        while current.starts_with(data_root) && current.as_path() != data_root {
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

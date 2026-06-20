use std::path::{Path, PathBuf};

use walkdir::WalkDir;

use crate::error::Result;
use crate::games::DeployPlan;
use crate::services::archive::ArchiveEntry;
use crate::services::archive_options::{MergeOptions, MergeProgressEvent};

pub fn infer_content_prefix(entries: &[ArchiveEntry]) -> Option<String> {
    let files: Vec<_> = entries.iter().filter(|e| !e.is_dir).collect();
    if files.is_empty() {
        return None;
    }

    if files.iter().any(|e| !e.path.contains('/')) {
        return None;
    }

    let root = files[0].path.split('/').next()?.to_string();
    if files
        .iter()
        .all(|e| e.path.starts_with(&format!("{root}/")))
    {
        return Some(format!("{root}/"));
    }

    None
}

pub fn strip_archive_prefix(path: &str, prefix: Option<&str>) -> String {
    if let Some(p) = prefix {
        path.strip_prefix(p).unwrap_or(path).to_string()
    } else {
        path.to_string()
    }
}

pub fn normalized_relative_paths(entries: &[ArchiveEntry]) -> Vec<String> {
    let prefix = infer_content_prefix(entries);
    entries
        .iter()
        .filter(|e| !e.is_dir)
        .map(|e| strip_archive_prefix(&e.path.replace('\\', "/"), prefix.as_deref()))
        .collect()
}

pub fn has_data_folder(paths: &[String]) -> bool {
    paths.iter().any(|p| {
        let lower = p.to_lowercase();
        lower.starts_with("data/") || lower == "data"
    })
}

pub fn archive_has_data_folder(entries: &[ArchiveEntry]) -> bool {
    if has_data_folder(&normalized_relative_paths(entries)) {
        return true;
    }

    entries.iter().any(|e| {
        let lower = e.path.replace('\\', "/").to_lowercase();
        lower.starts_with("data/") || lower.contains("/data/")
    })
}

pub fn has_loose_fallout4_data_folders(paths: &[String]) -> bool {
    const FOLDERS: &[&str] = &[
        "meshes/",
        "textures/",
        "scripts/",
        "interface/",
        "materials/",
        "sound/",
        "music/",
        "strings/",
        "tools/",
        "seq/",
        "facegen/",
    ];

    paths.iter().any(|p| {
        let lower = p.replace('\\', "/").to_lowercase();
        FOLDERS.iter().any(|folder| {
            let folder = folder.trim_end_matches('/');
            lower.starts_with(&format!("{folder}/")) || lower.contains(&format!("/{folder}/"))
        })
    })
}

pub fn archive_top_level_folders(entries: &[ArchiveEntry]) -> Vec<String> {
    let mut folders: Vec<String> = entries
        .iter()
        .filter_map(|e| {
            e.path
                .replace('\\', "/")
                .split('/')
                .next()
                .filter(|part| !part.is_empty())
                .map(|part| part.to_string())
        })
        .collect();
    folders.sort();
    folders.dedup();
    folders
}

pub fn is_fallout4_data_file(path: &str) -> bool {
    let lower = path.to_lowercase();
    lower.ends_with(".esp")
        || lower.ends_with(".esm")
        || lower.ends_with(".esl")
        || lower.ends_with(".ba2")
        || lower.ends_with(".bsa")
        || lower.ends_with(".modgroups")
}

pub fn resolve_extract_root(extract_dir: &Path) -> PathBuf {
    let Ok(entries) = std::fs::read_dir(extract_dir) else {
        return extract_dir.to_path_buf();
    };

    let entries: Vec<_> = entries.filter_map(|e| e.ok()).collect();
    if entries.len() == 1 && entries[0].path().is_dir() {
        return entries[0].path();
    }

    extract_dir.to_path_buf()
}

pub fn compute_deploy_paths(
    plan: &DeployPlan,
    entries: &[ArchiveEntry],
    game_path: &Path,
) -> Vec<String> {
    let prefix = infer_content_prefix(entries);
    let mut paths = Vec::new();

    for entry in entries.iter().filter(|e| !e.is_dir) {
        let rel = strip_archive_prefix(&entry.path, prefix.as_deref());
        let rel = rel.replace('\\', "/");

        let target = match plan.strategy.as_str() {
            "merge_data" => {
                let rel = rel
                    .strip_prefix("Data/")
                    .or_else(|| rel.strip_prefix("data/"))
                    .unwrap_or(&rel);
                game_path.join("Data").join(rel)
            }
            "copy_loose_to_data" => {
                if !is_fallout4_data_file(&rel) {
                    continue;
                }
                game_path.join("Data").join(rel)
            }
            "merge_loose_to_data" => game_path.join("Data").join(rel),
            "staging_only" => continue,
            _ => game_path.join(&rel),
        };

        paths.push(target.display().to_string());
    }

    paths.sort();
    paths.dedup();
    paths
}

pub fn filter_deploy_paths(paths: &[String], overwrite: bool) -> (Vec<String>, usize) {
    if overwrite {
        return (paths.to_vec(), 0);
    }

    let mut deployable = Vec::new();
    let mut skipped = 0usize;

    for path in paths {
        if Path::new(path).exists() {
            skipped += 1;
        } else {
            deployable.push(path.clone());
        }
    }

    (deployable, skipped)
}

/// Decide whether to overwrite existing game files during install.
///
/// Overwrite is enabled when the user requested it, when replacing an existing
/// mod install (updates), or when every planned target path already exists and
/// nothing would be copied otherwise (common when reinstalling LooksMenu etc.).
pub fn resolve_install_overwrite(
    overwrite_requested: bool,
    is_mod_replace: bool,
    plan: &DeployPlan,
    entries: &[ArchiveEntry],
    game_path: &Path,
) -> bool {
    if overwrite_requested || is_mod_replace {
        return true;
    }

    let paths = compute_deploy_paths(plan, entries, game_path);
    if paths.is_empty() {
        return false;
    }

    let (planned, _) = filter_deploy_paths(&paths, false);
    planned.is_empty()
}

pub fn merge_game_data_directory(
    src: &Path,
    dest: &Path,
    options: MergeOptions,
) -> Result<Vec<String>> {
    let mut deployed = Vec::new();
    let file_entries: Vec<_> = WalkDir::new(src)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .filter(|entry| {
            let rel = entry
                .path()
                .strip_prefix(src)
                .unwrap()
                .to_string_lossy()
                .replace('\\', "/");
            is_fallout4_data_file(&rel)
        })
        .collect();
    let total = file_entries.len();

    for (index, entry) in file_entries.iter().enumerate() {
        let rel = entry.path().strip_prefix(src).unwrap();
        let target = dest.join(rel);
        if target.exists() && !options.overwrite {
            continue;
        }

        if options.dry_run {
            deployed.push(target.display().to_string());
        } else {
            if let Some(parent) = target.parent() {
                std::fs::create_dir_all(parent)?;
            }
            std::fs::copy(entry.path(), &target)?;
            deployed.push(target.display().to_string());
        }

        if let Some(ref on_progress) = options.on_progress {
            on_progress(MergeProgressEvent {
                files_done: index + 1,
                files_total: total,
                current_file: rel.display().to_string(),
            });
        }
    }

    Ok(deployed)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::games::DeployPlan;
    use crate::services::archive::ArchiveEntry;
    use std::fs;

    fn entry(path: &str) -> ArchiveEntry {
        ArchiveEntry {
            path: path.to_string(),
            size: 1,
            is_dir: false,
        }
    }

    fn merge_data_plan() -> DeployPlan {
        DeployPlan {
            strategy: "merge_data".to_string(),
            source_subpath: None,
            target: "Data".to_string(),
            description: String::new(),
            requires_confirmation: false,
        }
    }

    #[test]
    fn resolve_install_overwrite_when_all_targets_exist() {
        let game = std::env::temp_dir().join(format!(
            "nexusdeck-overwrite-test-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&game);
        let data = game.join("Data");
        fs::create_dir_all(&data).unwrap();
        fs::write(data.join("LooksMenu.esp"), b"x").unwrap();
        fs::write(data.join("LooksMenu.bsa"), b"x").unwrap();

        let plan = merge_data_plan();
        let entries = vec![entry("Data/LooksMenu.esp"), entry("Data/LooksMenu.bsa")];

        assert!(resolve_install_overwrite(
            false,
            false,
            &plan,
            &entries,
            &game,
        ));

        let _ = fs::remove_dir_all(&game);
    }

    #[test]
    fn resolve_install_overwrite_false_when_some_targets_missing() {
        let game = std::env::temp_dir().join(format!(
            "nexusdeck-overwrite-partial-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&game);
        let data = game.join("Data");
        fs::create_dir_all(&data).unwrap();

        let plan = merge_data_plan();

        assert!(!resolve_install_overwrite(
            false,
            false,
            &plan,
            &[entry("Data/LooksMenu.bsa")],
            &game,
        ));

        let _ = fs::remove_dir_all(&game);
    }

    #[test]
    fn resolve_install_overwrite_true_for_mod_replace() {
        let game = std::env::temp_dir().join(format!(
            "nexusdeck-overwrite-replace-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&game);

        let plan = merge_data_plan();
        let entries = vec![entry("Data/LooksMenu.esp")];

        assert!(resolve_install_overwrite(
            false,
            true,
            &plan,
            &entries,
            &game,
        ));

        let _ = fs::remove_dir_all(&game);
    }
}

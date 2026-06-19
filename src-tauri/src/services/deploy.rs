use std::path::{Path, PathBuf};

use walkdir::WalkDir;

use crate::error::Result;
use crate::games::DeployPlan;
use crate::services::archive::ArchiveEntry;
use crate::services::archive_options::MergeOptions;

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
        let lower = p.to_lowercase();
        FOLDERS.iter().any(|folder| lower.starts_with(folder))
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

pub fn merge_game_data_directory(
    src: &Path,
    dest: &Path,
    options: MergeOptions,
) -> Result<Vec<String>> {
    let mut deployed = Vec::new();

    for entry in WalkDir::new(src).into_iter().filter_map(|e| e.ok()) {
        if !entry.file_type().is_file() {
            continue;
        }

        let rel = entry
            .path()
            .strip_prefix(src)
            .unwrap()
            .to_string_lossy()
            .replace('\\', "/");

        if !is_fallout4_data_file(&rel) {
            continue;
        }

        let target = dest.join(entry.path().strip_prefix(src).unwrap());
        if target.exists() && !options.overwrite {
            continue;
        }

        if options.dry_run {
            deployed.push(target.display().to_string());
            continue;
        }

        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::copy(entry.path(), &target)?;
        deployed.push(target.display().to_string());
    }

    Ok(deployed)
}

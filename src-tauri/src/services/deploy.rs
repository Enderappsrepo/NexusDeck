use std::collections::HashMap;
use std::ffi::OsString;
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

    let mut prefix = files[0].path.split('/').next()?.to_string();
    if !files
        .iter()
        .all(|e| e.path.starts_with(&format!("{prefix}/")))
    {
        return None;
    }

    // Strip a second identical or common wrapper (ModName/ModName/...).
    let inner_paths: Vec<String> = files
        .iter()
        .filter_map(|e| e.path.strip_prefix(&format!("{prefix}/")).map(|s| s.to_string()))
        .collect();
    if inner_paths.iter().all(|p| p.contains('/')) {
        if let Some(second) = inner_paths[0].split('/').next() {
            if inner_paths
                .iter()
                .all(|p| p.starts_with(&format!("{second}/")))
            {
                prefix = format!("{prefix}/{second}");
            }
        }
    }

    Some(format!("{prefix}/"))
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

pub fn has_nested_data_folder(entries: &[ArchiveEntry]) -> bool {
    entries.iter().any(|e| {
        let lower = e.path.replace('\\', "/").to_lowercase();
        lower.contains("/data/data/") || lower.starts_with("data/data/")
    })
}

pub fn has_f4se_root_files(paths: &[String]) -> bool {
    paths.iter().any(|p| {
        let lower = p.replace('\\', "/").to_lowercase();
        let name = lower.rsplit('/').next().unwrap_or(&lower);
        name == "f4se_loader.exe"
            || name.starts_with("f4se_")
            || name == "d3d11.dll"
            || name == "f4se_loader.dll"
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
        "calientetools/",
    ];

    paths.iter().any(|p| {
        let lower = p.replace('\\', "/").to_lowercase();
        FOLDERS.iter().any(|folder| {
            let folder = folder.trim_end_matches('/');
            lower.starts_with(&format!("{folder}/")) || lower.contains(&format!("/{folder}/"))
        })
    })
}

/// True when entries include mesh/texture/asset files that must not use copy_loose_to_data.
pub fn entries_have_loose_assets(entries: &[ArchiveEntry]) -> bool {
    let paths = normalized_relative_paths(entries);
    if has_loose_fallout4_data_folders(&paths) {
        return true;
    }
    paths.iter().any(|p| {
        let lower = p.to_lowercase();
        lower.ends_with(".nif")
            || lower.ends_with(".dds")
            || lower.ends_with(".tga")
            || lower.ends_with(".hkx")
            || lower.ends_with(".wav")
            || lower.ends_with(".xwm")
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

/// Deploy one file into the game folder, preferring a hard link (instant, no
/// extra disk) and falling back to a copy when linking isn't possible — e.g.
/// staging and the game live on different drives (SSD vs SD card), or the
/// filesystem doesn't support links. Returns true when a hard link was used.
///
/// The destination is removed first so overwriting a file that is itself a hard
/// link to another mod's asset can't corrupt the shared inode.
pub fn deploy_file(src: &Path, dest: &Path) -> Result<bool> {
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent)?;
    }
    if dest.exists() {
        std::fs::remove_file(dest)?;
    }
    match std::fs::hard_link(src, dest) {
        Ok(()) => Ok(true),
        Err(_) => {
            std::fs::copy(src, dest)?;
            Ok(false)
        }
    }
}

/// Cache of directory listings (lowercased name -> real on-disk name) so a
/// single deploy doesn't re-`read_dir` the same folder for every file.
pub type CaseCache = HashMap<PathBuf, HashMap<String, OsString>>;

fn read_dir_casing(dir: &Path) -> HashMap<String, OsString> {
    let mut map = HashMap::new();
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let name = entry.file_name();
            map.insert(name.to_string_lossy().to_lowercase(), name);
        }
    }
    map
}

/// Resolve `rel` under `base` to a path that reuses any directory/file casing
/// already on disk, so we never create case-variant sibling folders (e.g.
/// `Textures/` next to `textures/`). Those siblings split loose assets across two
/// trees and are the #1 cause of missing / purple textures on case-sensitive
/// filesystems (Steam Deck / Linux). On case-insensitive filesystems this lands
/// in the same place a plain join would.
pub fn resolve_deploy_target(base: &Path, rel: &Path, cache: &mut CaseCache) -> PathBuf {
    let mut current = base.to_path_buf();
    for comp in rel.components() {
        let name = comp.as_os_str();
        let lower = name.to_string_lossy().to_lowercase();
        let listing = cache
            .entry(current.clone())
            .or_insert_with(|| read_dir_casing(&current));
        if let Some(existing) = listing.get(&lower) {
            current = current.join(existing);
        } else {
            // Register the new name so later files in this deploy match its casing.
            listing.insert(lower, name.to_os_string());
            current = current.join(name);
        }
    }
    current
}

/// Build a canonical-casing map for a set of already-deployed relative paths
/// (Data-relative, any separators). For every directory level it picks one
/// casing — the first seen in load order — so case-variant sibling folders
/// (`Textures/` + `textures/`) can be collapsed into a single tree. Returns each
/// input path mapped to its canonical form (directory components recased, file
/// name preserved). Used by the deployment repair to relocate mis-cased files.
pub fn canonical_deploy_map(rel_paths: &[String]) -> HashMap<String, String> {
    let mut dir_canon: HashMap<String, String> = HashMap::new();
    let mut out: HashMap<String, String> = HashMap::new();

    for rel in rel_paths {
        let norm = rel.replace('\\', "/");
        let (dir, file) = match norm.rfind('/') {
            Some(i) => (&norm[..i], &norm[i + 1..]),
            None => ("", norm.as_str()),
        };

        let mut canon_dir = String::new();
        let mut lower_acc = String::new();
        for comp in dir.split('/').filter(|c| !c.is_empty()) {
            lower_acc = if lower_acc.is_empty() {
                comp.to_lowercase()
            } else {
                format!("{lower_acc}/{}", comp.to_lowercase())
            };
            if let Some(existing) = dir_canon.get(&lower_acc) {
                canon_dir = existing.clone();
            } else {
                canon_dir = if canon_dir.is_empty() {
                    comp.to_string()
                } else {
                    format!("{canon_dir}/{comp}")
                };
                dir_canon.insert(lower_acc.clone(), canon_dir.clone());
            }
        }

        let canonical = if canon_dir.is_empty() {
            file.to_string()
        } else {
            format!("{canon_dir}/{file}")
        };
        out.insert(norm, canonical);
    }

    out
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
    let resolve_case = std::env::consts::OS == "linux";
    let mut case_cache = CaseCache::new();

    for (index, entry) in file_entries.iter().enumerate() {
        let rel = entry.path().strip_prefix(src).unwrap();
        let target = if resolve_case {
            resolve_deploy_target(dest, rel, &mut case_cache)
        } else {
            dest.join(rel)
        };
        if target.exists() && !options.overwrite {
            continue;
        }

        if options.dry_run {
            deployed.push(target.display().to_string());
        } else {
            deploy_file(entry.path(), &target)?;
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

    #[test]
    fn deploy_file_links_and_overwrites() {
        let base =
            std::env::temp_dir().join(format!("nexusdeck-deploy-{}", std::process::id()));
        let _ = fs::remove_dir_all(&base);
        let src = base.join("src").join("a.esp");
        let dest = base.join("game").join("Data").join("a.esp");
        fs::create_dir_all(src.parent().unwrap()).unwrap();
        fs::write(&src, b"v1").unwrap();

        deploy_file(&src, &dest).unwrap();
        assert!(dest.exists());
        assert_eq!(fs::read(&dest).unwrap(), b"v1");

        // Re-deploying over an existing destination replaces it cleanly.
        let src2 = base.join("src").join("b.esp");
        fs::write(&src2, b"v2").unwrap();
        deploy_file(&src2, &dest).unwrap();
        assert_eq!(fs::read(&dest).unwrap(), b"v2");

        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn resolve_deploy_target_reuses_existing_casing() {
        let base = std::env::temp_dir().join(format!("nexusdeck-case-{}", std::process::id()));
        let _ = fs::remove_dir_all(&base);
        fs::create_dir_all(base.join("Textures").join("Armor")).unwrap();

        let mut cache = CaseCache::new();
        // A mod referencing the lowercase variant lands in the existing dirs,
        // not a new `textures/armor` sibling.
        let target =
            resolve_deploy_target(&base, Path::new("textures/armor/skin.dds"), &mut cache);
        assert_eq!(target, base.join("Textures").join("Armor").join("skin.dds"));

        // New folders created mid-deploy stay consistent for later files.
        let a = resolve_deploy_target(&base, Path::new("Meshes/Weapon/sword.nif"), &mut cache);
        let b = resolve_deploy_target(&base, Path::new("meshes/weapon/axe.nif"), &mut cache);
        assert_eq!(a.parent().unwrap(), b.parent().unwrap());

        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn canonical_deploy_map_collapses_case_variants() {
        let paths = vec![
            "Textures/Armor/a.dds".to_string(),
            "textures/armor/b.dds".to_string(),
            "Meshes/x.nif".to_string(),
            "MESHES/y.nif".to_string(),
        ];
        let map = canonical_deploy_map(&paths);
        // Lowercase variant is recased into the first-seen "Textures/Armor".
        assert_eq!(map["textures/armor/b.dds"], "Textures/Armor/b.dds");
        assert_eq!(map["Textures/Armor/a.dds"], "Textures/Armor/a.dds");
        // First-seen "Meshes" casing wins for the later "MESHES".
        assert_eq!(map["MESHES/y.nif"], "Meshes/y.nif");
    }

    #[test]
    fn calientetools_counts_as_loose_data_folder() {
        assert!(has_loose_fallout4_data_folders(&[
            "CalienteTools/BodySlide/BodySlide x64.exe".to_string()
        ]));
    }

    #[test]
    fn entries_have_loose_assets_detects_nif() {
        let entries = vec![entry("Data/Plugins/mod.esp"), entry("Meshes/body.nif")];
        assert!(entries_have_loose_assets(&entries));
    }
}

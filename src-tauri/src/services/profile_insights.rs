//! Collection diff, mod safety, deploy scan, conflict summary, texture budget.

use std::collections::{HashMap, HashSet};
use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::db::{self, InstalledMod, Profile};
use crate::error::{NexusDeckError, Result};
use crate::services::conflict::{detect_conflicts, FileConflict};
use crate::services::mod_state::installed_file_paths;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CollectionModDiffEntry {
    pub mod_id: u64,
    pub name: String,
    pub optional: bool,
    pub status: String,
    pub collection_version: String,
    pub installed_version: Option<String>,
    pub installed_mod_id: Option<String>,
    pub collection_file_id: Option<u64>,
    pub installed_file_id: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CollectionDiffResult {
    pub installed_count: usize,
    pub total_count: usize,
    pub missing_count: usize,
    pub outdated_count: usize,
    pub wrong_file_count: usize,
    pub mods: Vec<CollectionModDiffEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CollectionModInput {
    pub mod_id: u64,
    pub file_id: Option<u64>,
    pub name: String,
    pub optional: bool,
    pub version: String,
}

pub fn diff_collection(profile_id: &str, collection_mods: &[CollectionModInput]) -> Result<CollectionDiffResult> {
    let installed = db::list_installed_mods(profile_id)?;
    let by_nexus: HashMap<u64, &InstalledMod> = installed
        .iter()
        .map(|m| (m.nexus_mod_id as u64, m))
        .collect();

    let mut entries = Vec::new();
    let mut installed_count = 0usize;
    let mut missing_count = 0usize;
    let mut outdated_count = 0usize;
    let mut wrong_file_count = 0usize;

    for cm in collection_mods {
        let inst = by_nexus.get(&cm.mod_id);
        let status = if inst.is_none() {
            missing_count += 1;
            "missing"
        } else {
            let m = inst.unwrap();
            let version_match = versions_match(&cm.version, m.version.as_deref());
            let file_match = cm.file_id.map(|f| m.nexus_file_id == Some(f as i64)).unwrap_or(true);
            if !file_match {
                wrong_file_count += 1;
                "wrong_file"
            } else if !version_match {
                outdated_count += 1;
                "outdated"
            } else {
                installed_count += 1;
                "installed"
            }
        };

        entries.push(CollectionModDiffEntry {
            mod_id: cm.mod_id,
            name: cm.name.clone(),
            optional: cm.optional,
            status: status.into(),
            collection_version: cm.version.clone(),
            installed_version: inst.and_then(|m| m.version.clone()),
            installed_mod_id: inst.map(|m| m.id.clone()),
            collection_file_id: cm.file_id,
            installed_file_id: inst.and_then(|m| m.nexus_file_id),
        });
    }

    Ok(CollectionDiffResult {
        installed_count,
        total_count: collection_mods.len(),
        missing_count,
        outdated_count,
        wrong_file_count,
        mods: entries,
    })
}

fn versions_match(expected: &str, actual: Option<&str>) -> bool {
    let Some(actual) = actual else { return false };
    normalize_version(expected) == normalize_version(actual)
}

fn normalize_version(v: &str) -> String {
    v.trim().trim_start_matches('v').to_lowercase()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModSafetyReport {
    pub safe: bool,
    pub severity: String,
    pub warnings: Vec<String>,
    pub plugin_count: usize,
    pub has_scripts: bool,
}

pub fn assess_mod_change(profile_id: &str, installed_mod_id: &str, action: &str) -> Result<ModSafetyReport> {
    let mods = db::list_installed_mods(profile_id)?;
    let m = mods
        .iter()
        .find(|x| x.id == installed_mod_id)
        .ok_or_else(|| NexusDeckError::NotFound("Mod not found".into()))?;

    let plugins: Vec<String> = serde_json::from_str(&m.plugins_json).unwrap_or_default();
    let mut warnings = Vec::new();
    let mut severity = "info".to_string();

    if !plugins.is_empty() {
        warnings.push(format!(
            "{} ships {} plugin(s): {}. Disabling may break your current save.",
            m.name,
            plugins.len(),
            plugins.join(", ")
        ));
        severity = "warning".into();
    }

    let mut has_scripts = false;
    for path in installed_file_paths(m)? {
        let lower = path.replace('\\', "/").to_lowercase();
        if lower.contains("/scripts/source/") || lower.ends_with(".pex") || lower.ends_with(".psc") {
            has_scripts = true;
            break;
        }
    }
    if has_scripts {
        warnings.push(format!(
            "{} includes script files. Removing or disabling mid-playthrough can corrupt saves.",
            m.name
        ));
        severity = "error".into();
    }

    if action == "uninstall" && m.enabled {
        warnings.push(
            "Uninstalling removes deployed files. Shared assets used by other mods may break.".into(),
        );
        if severity != "error" {
            severity = "warning".into();
        }
    }

    let safe = warnings.is_empty();
    Ok(ModSafetyReport {
        safe,
        severity,
        warnings,
        plugin_count: plugins.len(),
        has_scripts,
    })
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrphanFileEntry {
    pub path: String,
    pub size_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DuplicateFileEntry {
    pub path: String,
    pub mods: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeployScanResult {
    pub orphan_files: Vec<OrphanFileEntry>,
    pub duplicate_files: Vec<DuplicateFileEntry>,
    pub orphan_count: usize,
    pub duplicate_count: usize,
}

pub fn scan_deploy_footprint(profile_id: &str) -> Result<DeployScanResult> {
    let profile = db::get_profile(profile_id)?
        .ok_or_else(|| NexusDeckError::NotFound("Profile not found".into()))?;
    let mods = db::list_installed_mods(profile_id)?;
    let data_root = Path::new(&profile.game_path).join("Data");

    let mut owned: HashSet<String> = HashSet::new();
    let mut path_to_mods: HashMap<String, Vec<String>> = HashMap::new();

    for m in &mods {
        for file in installed_file_paths(m)? {
            let normalized = normalize_deploy_path(&file, &profile.game_path);
            if normalized.is_empty() {
                continue;
            }
            owned.insert(normalized.clone());
            path_to_mods
                .entry(normalized)
                .or_default()
                .push(m.name.clone());
        }
    }

    let mut duplicate_files: Vec<DuplicateFileEntry> = path_to_mods
        .into_iter()
        .filter(|(_, mods)| mods.len() > 1)
        .map(|(path, mods)| DuplicateFileEntry { path, mods })
        .collect();
    duplicate_files.sort_by(|a, b| a.path.cmp(&b.path));

    let mut orphan_files = Vec::new();
    if data_root.is_dir() {
        for entry in walkdir::WalkDir::new(&data_root)
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_type().is_file())
        {
            let rel = entry
                .path()
                .strip_prefix(&profile.game_path)
                .unwrap_or(entry.path())
                .display()
                .to_string()
                .replace('\\', "/")
                .to_lowercase();
            if !owned.contains(&rel) {
                orphan_files.push(OrphanFileEntry {
                    path: rel,
                    size_bytes: entry.metadata().map(|m| m.len()).unwrap_or(0),
                });
            }
        }
    }
    orphan_files.sort_by(|a, b| a.path.cmp(&b.path));
    if orphan_files.len() > 200 {
        orphan_files.truncate(200);
    }

    let orphan_count = orphan_files.len();
    let duplicate_count = duplicate_files.len();
    Ok(DeployScanResult {
        orphan_files,
        duplicate_files,
        orphan_count,
        duplicate_count,
    })
}

fn normalize_deploy_path(file: &str, game_path: &str) -> String {
    let normalized = file.replace('\\', "/").to_lowercase();
    let game = game_path.replace('\\', "/").trim_end_matches('/').to_lowercase();
    if let Some(rest) = normalized.strip_prefix(&format!("{game}/")) {
        return rest.to_string();
    }
    normalized
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProfileConflictSummary {
    pub total_conflicts: usize,
    pub affected_mods: Vec<String>,
    pub conflicts: Vec<FileConflict>,
}

pub fn scan_profile_conflicts(profile_id: &str) -> Result<ProfileConflictSummary> {
    let mods = db::list_installed_mods(profile_id)?;
    let enabled: Vec<&InstalledMod> = mods.iter().filter(|m| m.enabled).collect();
    let mut all_conflicts = Vec::new();
    let mut manifests: Vec<(String, Vec<String>)> = Vec::new();

    for m in &enabled {
        let files: Vec<String> = installed_file_paths(m)?
            .into_iter()
            .map(|p| p.replace('\\', "/"))
            .collect();
        let conflicts = detect_conflicts(&manifests, &files, &m.name);
        all_conflicts.extend(conflicts);
        manifests.push((m.name.clone(), files));
    }

    let mut affected: HashSet<String> = HashSet::new();
    for c in &all_conflicts {
        affected.insert(c.existing_mod.clone());
        affected.insert(c.new_mod.clone());
    }
    let mut affected_mods: Vec<String> = affected.into_iter().collect();
    affected_mods.sort();

    Ok(ProfileConflictSummary {
        total_conflicts: all_conflicts.len(),
        affected_mods,
        conflicts: all_conflicts,
    })
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TextureBudgetReport {
    pub loose_file_count: usize,
    pub loose_bytes: u64,
    pub texture_count: usize,
    pub mesh_count: usize,
    pub estimated_vram_mb: u64,
    pub recommendation: String,
}

pub fn analyze_texture_budget(profile_id: &str) -> Result<TextureBudgetReport> {
    let profile = db::get_profile(profile_id)?
        .ok_or_else(|| NexusDeckError::NotFound("Profile not found".into()))?;
    let mods = db::list_installed_mods(profile_id)?;

    let mut loose_file_count = 0usize;
    let mut loose_bytes = 0u64;
    let mut texture_count = 0usize;
    let mut mesh_count = 0usize;

    for m in mods.iter().filter(|m| m.enabled) {
        for path in installed_file_paths(m)? {
            let lower = path.replace('\\', "/").to_lowercase();
            if !lower.contains("/data/") {
                continue;
            }
            loose_file_count += 1;
            if let Ok(meta) = std::fs::metadata(&path) {
                loose_bytes += meta.len();
            }
            if lower.contains("/textures/") {
                texture_count += 1;
            }
            if lower.contains("/meshes/") {
                mesh_count += 1;
            }
        }
    }

    let estimated_vram_mb = (loose_bytes / (1024 * 1024)).saturating_add((texture_count as u64) / 50);
    let recommendation = if estimated_vram_mb > 4096 {
        "Heavy loose-file load — consider disabling 2K/4K texture mods on Deck.".into()
    } else if estimated_vram_mb > 2048 {
        "Moderate texture budget — monitor FPS in dense areas.".into()
    } else {
        "Texture budget looks reasonable for Steam Deck.".into()
    };

    let _ = profile;
    Ok(TextureBudgetReport {
        loose_file_count,
        loose_bytes,
        texture_count,
        mesh_count,
        estimated_vram_mb,
        recommendation,
    })
}

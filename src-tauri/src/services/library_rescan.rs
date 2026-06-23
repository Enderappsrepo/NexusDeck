//! Rebuild the mod library from plugin files already deployed under Data/.

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use walkdir::WalkDir;

use crate::db::{self, InstalledMod};
use crate::error::{NexusDeckError, Result};
use crate::services::mod_state::installed_file_paths;
use crate::services::plugins_txt::base_game_plugins;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LibraryRescanResult {
    pub mods_added: usize,
    pub plugins_found: usize,
    pub message: String,
}

fn is_plugin_name(name: &str) -> bool {
    let lower = name.to_lowercase();
    lower.ends_with(".esp") || lower.ends_with(".esm") || lower.ends_with(".esl")
}

fn is_creation_club(name: &str) -> bool {
    let lower = name.to_lowercase();
    (lower.starts_with("cc") || lower.starts_with("creationclub")) && is_plugin_name(&lower)
}

fn mod_name_for_plugin(data_root: &Path, plugin_path: &Path) -> String {
    if let Ok(rel) = plugin_path.strip_prefix(data_root) {
        let parts: Vec<String> = rel
            .components()
            .map(|c| c.as_os_str().to_string_lossy().into_owned())
            .collect();
        if parts.len() > 1 {
            let folder = &parts[0];
            let lower = folder.to_lowercase();
            const SKIP: &[&str] = &[
                "textures", "meshes", "scripts", "interface", "music", "sound", "strings", "seq",
                "video", "tools", "materials", "actors", "animations",
            ];
            if !SKIP.iter().any(|s| *s == lower) {
                return folder.clone();
            }
        }
    }
    plugin_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Imported mod")
        .to_string()
}

pub fn rescan_library_from_disk(profile_id: &str) -> Result<LibraryRescanResult> {
    let profile = db::get_profile(profile_id)?
        .ok_or_else(|| NexusDeckError::NotFound("Profile not found".into()))?;

    let existing = db::list_installed_mods(profile_id)?;
    let mut known_plugins: HashSet<String> = HashSet::new();
    for m in &existing {
        let plugins: Vec<String> = serde_json::from_str(&m.plugins_json).unwrap_or_default();
        for p in plugins {
            known_plugins.insert(p.to_lowercase());
        }
        for file in installed_file_paths(m)? {
            if let Some(name) = Path::new(&file).file_name().and_then(|n| n.to_str()) {
                if is_plugin_name(name) {
                    known_plugins.insert(name.to_lowercase());
                }
            }
        }
    }

    let data_root = PathBuf::from(&profile.game_path).join("Data");
    if !data_root.is_dir() {
        return Ok(LibraryRescanResult {
            mods_added: 0,
            plugins_found: 0,
            message: "Game Data folder not found — check your game path in Setup.".into(),
        });
    }

    let vanilla: HashSet<String> = base_game_plugins(&profile.game_domain, &profile.game_path)
        .into_iter()
        .map(|s| s.to_lowercase())
        .collect();

    let mut groups: HashMap<String, (Vec<String>, Vec<String>)> = HashMap::new();
    for entry in WalkDir::new(&data_root)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
    {
        let name = entry.file_name().to_string_lossy().into_owned();
        if !is_plugin_name(&name) {
            continue;
        }
        let lower = name.to_lowercase();
        if vanilla.contains(&lower) || is_creation_club(&name) || known_plugins.contains(&lower) {
            continue;
        }
        let mod_name = mod_name_for_plugin(&data_root, entry.path());
        let abs = entry.path().display().to_string();
        let group = groups.entry(mod_name).or_insert_with(|| (Vec::new(), Vec::new()));
        group.0.push(name);
        group.1.push(abs);
    }

    let plugins_found: usize = groups.values().map(|g| g.0.len()).sum();
    if groups.is_empty() {
        return Ok(LibraryRescanResult {
            mods_added: 0,
            plugins_found: 0,
            message: if existing.is_empty() {
                "No mod plugins found in the game Data folder.".into()
            } else {
                "Library already in sync — no new plugins to import.".into()
            },
        });
    }

    let mut mods_added = 0usize;
    let base_order = db::next_sort_order(profile_id).unwrap_or(0);

    for (idx, (mod_name, (plugins, files))) in groups.into_iter().enumerate() {
        if existing.iter().any(|m| m.name.eq_ignore_ascii_case(&mod_name)) {
            continue;
        }
        let mut plugins = plugins;
        plugins.sort_by(|a, b| a.to_lowercase().cmp(&b.to_lowercase()));

        let record = InstalledMod {
            id: uuid::Uuid::new_v4().to_string(),
            profile_id: profile_id.to_string(),
            nexus_mod_id: 0,
            nexus_file_id: None,
            name: mod_name,
            version: None,
            enabled: true,
            sort_order: base_order + idx as i32,
            installed_files_json: serde_json::to_string(&files)?,
            installed_at: chrono::Utc::now().timestamp(),
            category: "Imported from disk".into(),
            tags_json: "[]".into(),
            plugins_json: serde_json::to_string(&plugins)?,
            install_options_json: "{}".into(),
        };
        db::save_installed_mod(&record)?;
        mods_added += 1;
    }

    Ok(LibraryRescanResult {
        mods_added,
        plugins_found,
        message: if mods_added > 0 {
            format!("Imported {mods_added} mod(s) from {plugins_found} plugin file(s) on disk.")
        } else {
            "Found plugins on disk but they match existing library entries.".into()
        },
    })
}

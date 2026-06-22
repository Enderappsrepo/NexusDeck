use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use walkdir::WalkDir;

use crate::db::{self, Profile};
use crate::error::Result;
use crate::games::GameRegistry;
use crate::services::load_order;
use crate::services::mod_state::installed_file_paths;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginsSyncResult {
    pub path: String,
    pub plugin_count: usize,
    pub plugins: Vec<String>,
}

pub fn sync_plugins_txt(profile: &Profile) -> Result<PluginsSyncResult> {
    let plugin = GameRegistry::get(&profile.game_domain)?;
    let plugins_path = plugin
        .plugins_txt_path(profile)
        .ok_or_else(|| {
            crate::error::NexusDeckError::Other(
                "plugins.txt path not available — set your Proton prefix in Setup and launch the game once through Steam.".into(),
            )
        })?;

    let plugins = collect_plugins_for_launch(profile)?;
    write_plugins_txt(&plugins_path, &plugins)?;
    Ok(PluginsSyncResult {
        path: plugins_path.display().to_string(),
        plugin_count: plugins.len(),
        plugins,
    })
}

/// Full plugin list written to plugins.txt: vanilla masters, Creation Club, then LOOT-sorted mod plugins.
pub fn collect_plugins_for_launch(profile: &Profile) -> Result<Vec<String>> {
    let data_dir = Path::new(&profile.game_path).join("Data");
    let mut ordered: Vec<String> = Vec::new();
    let mut seen = HashSet::new();

    let push = |ordered: &mut Vec<String>, seen: &mut HashSet<String>, name: &str| {
        let key = name.to_lowercase();
        if seen.insert(key) {
            ordered.push(name.to_string());
        }
    };

    for name in base_game_plugins(&profile.game_domain, &profile.game_path) {
        push(&mut ordered, &mut seen, &name);
    }

    for name in creation_club_plugins(&data_dir) {
        push(&mut ordered, &mut seen, &name);
    }

    if let Ok(loot_sorted) = load_order::loot_sorted_mod_plugins(profile) {
        for name in loot_sorted {
            push(&mut ordered, &mut seen, &name);
        }
    } else {
        for name in mod_plugins_in_load_order(profile)? {
            push(&mut ordered, &mut seen, &name);
        }
    }

    Ok(ordered)
}

fn mod_plugins_in_load_order(profile: &Profile) -> Result<Vec<String>> {
    let mut plugins = Vec::new();
    let mut seen = HashSet::new();
    for mod_record in db::list_installed_mods(&profile.id)?.into_iter().filter(|m| m.enabled) {
        for file in installed_file_paths(&mod_record)? {
            let path = Path::new(&file);
            if !is_plugin_file(path) {
                continue;
            }
            if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                let key = name.to_lowercase();
                if seen.insert(key) {
                    plugins.push(name.to_string());
                }
            }
        }
    }
    Ok(plugins)
}

pub fn base_game_plugins(game_domain: &str, game_path: &str) -> Vec<String> {
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
        "falloutnv" => &["FalloutNV.esm"],
        "fallout3" => &["Fallout3.esm"],
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

fn creation_club_plugins(data_dir: &Path) -> Vec<String> {
    if !data_dir.is_dir() {
        return Vec::new();
    }
    let mut cc: Vec<String> = WalkDir::new(data_dir)
        .max_depth(1)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .filter_map(|e| e.file_name().to_str().map(str::to_string))
        .filter(|name| {
            let lower = name.to_lowercase();
            (lower.starts_with("cc") || lower.starts_with("creationclub"))
                && (lower.ends_with(".esl") || lower.ends_with(".esp") || lower.ends_with(".esm"))
        })
        .collect();
    cc.sort_by(|a, b| a.to_lowercase().cmp(&b.to_lowercase()));
    cc
}

fn is_plugin_file(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| {
            let lower = e.to_lowercase();
            lower == "esp" || lower == "esm" || lower == "esl"
        })
        .unwrap_or(false)
}

fn write_plugins_txt(path: &Path, plugins: &[String]) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let content: String = plugins
        .iter()
        .map(|p| format!("*{p}"))
        .collect::<Vec<_>>()
        .join("\n");
    let content = if content.is_empty() {
        String::new()
    } else {
        format!("{content}\n")
    };
    fs::write(path, content)?;
    Ok(())
}

pub fn create_safe_launch_backup(profile: &Profile) -> Result<Vec<String>> {
    let mut backed_up = Vec::new();
    let staging = Path::new(&profile.staging_path).join("safe_launch_backups");
    let timestamp = chrono::Utc::now().timestamp();
    let backup_dir = staging.join(timestamp.to_string());
    fs::create_dir_all(&backup_dir)?;

    let plugin = GameRegistry::get(&profile.game_domain)?;
    if let Some(plugins_path) = plugin.plugins_txt_path(profile) {
        if plugins_path.exists() {
            let dest = backup_dir.join("plugins.txt");
            fs::copy(&plugins_path, &dest)?;
            backed_up.push(dest.display().to_string());
        }
    }

    let saves_dir = resolve_saves_dir(profile);
    if saves_dir.exists() {
        let dest = backup_dir.join("Saves");
        copy_dir_recursive(&saves_dir, &dest)?;
        backed_up.push(dest.display().to_string());
    }

    Ok(backed_up)
}

fn resolve_saves_dir(profile: &Profile) -> PathBuf {
    let folder = GameRegistry::get(&profile.game_domain)
        .ok()
        .and_then(|p| p.my_games_folder().map(|s| s.to_string()))
        .unwrap_or_else(|| "Fallout4".to_string());

    if cfg!(target_os = "windows") {
        dirs::document_dir()
            .map(|d| d.join("My Games").join(&folder).join("Saves"))
            .unwrap_or_else(|| PathBuf::from(&profile.game_path).join("Saves"))
    } else if let Some(ref prefix) = profile.proton_prefix_path {
        for user in ["steamuser", "steam"] {
            let candidate = PathBuf::from(prefix)
                .join("drive_c")
                .join("users")
                .join(user)
                .join("Documents")
                .join("My Games")
                .join(&folder)
                .join("Saves");
            if candidate.parent().map(|p| p.exists()).unwrap_or(false) {
                return candidate;
            }
        }
        PathBuf::from(prefix)
            .join("drive_c")
            .join("users")
            .join("steamuser")
            .join("Documents")
            .join("My Games")
            .join(folder)
            .join("Saves")
    } else {
        PathBuf::from(&profile.game_path).join("Saves")
    }
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_creation_club_prefix() {
        let dir = std::env::temp_dir().join(format!("nd-cc-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("ccTest.esl"), b"").unwrap();
        fs::write(dir.join("MyMod.esp"), b"").unwrap();
        let cc = creation_club_plugins(&dir);
        assert!(cc.iter().any(|p| p.eq_ignore_ascii_case("ccTest.esl")));
        let _ = fs::remove_dir_all(&dir);
    }
}

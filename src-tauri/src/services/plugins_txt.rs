use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

use crate::db::{self, Profile};
use crate::error::{NexusDeckError, Result};
use crate::games::GameRegistry;
use crate::services::mod_state::installed_file_paths;

pub fn sync_plugins_txt(profile: &Profile) -> Result<String> {
    let plugin = GameRegistry::get(&profile.game_domain)?;
    let plugins_path = plugin
        .plugins_txt_path(profile)
        .ok_or_else(|| NexusDeckError::Other("plugins.txt path not available for this game".into()))?;

    let plugins = collect_enabled_plugins(profile)?;
    write_plugins_txt(&plugins_path, &plugins)?;
    Ok(plugins_path.display().to_string())
}

fn collect_enabled_plugins(profile: &Profile) -> Result<Vec<String>> {
    let data_dir = Path::new(&profile.game_path).join("Data");
    let mut disabled_plugins = HashSet::new();

    for mod_record in db::list_installed_mods(&profile.id)? {
        if mod_record.enabled {
            continue;
        }
        for file in installed_file_paths(&mod_record)? {
            let path = Path::new(&file);
            if is_plugin_file(path) {
                if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                    disabled_plugins.insert(name.to_lowercase());
                }
            }
        }
    }

    let mut plugins = Vec::new();
    if data_dir.is_dir() {
        for entry in fs::read_dir(&data_dir)? {
            let entry = entry?;
            let path = entry.path();
            if !path.is_file() {
                continue;
            }
            if !is_plugin_file(&path) {
                continue;
            }
            let name = path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or_default()
                .to_string();
            if disabled_plugins.contains(&name.to_lowercase()) {
                continue;
            }
            plugins.push(name);
        }
    }

    plugins.sort_by(|a, b| a.to_lowercase().cmp(&b.to_lowercase()));
    Ok(plugins)
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

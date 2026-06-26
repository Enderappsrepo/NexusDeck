//! Install bundled Steam Input templates when NexusDeck is added to Steam.

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::Result;

const TEMPLATE_NAME: &str = "nexusdeck_controller_config.vdf";
const TEMPLATE_BODY: &str = include_str!("../../resources/steam-input/nexusdeck_controller_config.vdf");

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SteamInputInstallResult {
    pub installed: bool,
    pub template_path: Option<String>,
    pub configset_path: Option<String>,
    pub message: String,
}

pub fn install_nexusdeck_steam_input(
    display_name: &str,
    shortcut_app_id: u32,
) -> Result<SteamInputInstallResult> {
    if cfg!(target_os = "windows") {
        return Ok(SteamInputInstallResult {
            installed: false,
            template_path: None,
            configset_path: None,
            message: "Steam Input auto-install is Linux-only.".into(),
        });
    }

    let Some(steam_root) = find_steam_root() else {
        return Ok(SteamInputInstallResult {
            installed: false,
            template_path: None,
            configset_path: None,
            message: "Steam install not found — skip Steam Input layout install.".into(),
        });
    };

    let Some(steam_user_id) = find_steam_user_id(&steam_root) else {
        return Ok(SteamInputInstallResult {
            installed: false,
            template_path: None,
            configset_path: None,
            message: "Steam userdata not found — launch Steam once, then re-add to Steam.".into(),
        });
    };

    let template_dir = steam_root.join("controller_base").join("templates");
    fs::create_dir_all(&template_dir)?;
    let template_path = template_dir.join(TEMPLATE_NAME);
    fs::write(&template_path, TEMPLATE_BODY)?;

    let configset_dir = steam_root
        .join("steamapps")
        .join("common")
        .join("Steam Controller Configs")
        .join(&steam_user_id)
        .join("config");
    fs::create_dir_all(&configset_dir)?;
    let configset_path = configset_dir.join("configset_controller_neptune.vdf");

    let lookup_name = display_name.trim().to_lowercase();
    let app_id_key = shortcut_app_id.to_string();
    merge_configset_entry(&configset_path, &lookup_name, TEMPLATE_NAME)?;
    if lookup_name != app_id_key {
        merge_configset_entry(&configset_path, &app_id_key, TEMPLATE_NAME)?;
    }

    Ok(SteamInputInstallResult {
        installed: true,
        template_path: Some(template_path.display().to_string()),
        configset_path: Some(configset_path.display().to_string()),
        message: format!(
            "Installed Steam Input layout \"NexusDeck\". In Gaming Mode, open Controller settings for {display_name} and pick the NexusDeck template if it is not already active."
        ),
    })
}

fn merge_configset_entry(path: &Path, key: &str, template: &str) -> Result<()> {
    let block = format!(
        "\"{key}\"\n\t{{\n\t\t\"template\"\t\t\"{template}\"\n\t}}\n"
    );

    if path.is_file() {
        let mut content = fs::read_to_string(path)?;
        let needle = format!("\"{key}\"");
        if content.contains(&needle) {
            return Ok(());
        }
        if content.contains("\"configset\"") {
            if let Some(pos) = content.rfind('}') {
                content.insert_str(pos, &block);
            } else {
                content.push_str(&block);
            }
        } else {
            content = format!("\"configset\"\n{{\n{block}}}\n");
        }
        fs::write(path, content)?;
    } else {
        fs::write(path, format!("\"configset\"\n{{\n{block}}}\n"))?;
    }
    Ok(())
}

fn find_steam_root() -> Option<PathBuf> {
    let home = std::env::var("HOME").ok()?;
    for candidate in [
        format!("{home}/.steam/steam"),
        format!("{home}/.local/share/Steam"),
        format!("{home}/.var/app/com.valvesoftware.Steam/data/Steam"),
    ] {
        let path = PathBuf::from(&candidate);
        if path.join("steamapps").is_dir() {
            return Some(path);
        }
    }
    None
}

fn find_steam_user_id(steam_root: &Path) -> Option<String> {
    let userdata = steam_root.join("userdata");
    let entries = fs::read_dir(&userdata).ok()?;
    for entry in entries.flatten() {
        if !entry.file_type().ok()?.is_dir() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        if name.chars().all(|c| c.is_ascii_digit()) && entry.path().join("config").is_dir() {
            return Some(name);
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn merge_configset_creates_and_appends_entries() {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let path = std::env::temp_dir().join(format!("nd-configset-{stamp}.vdf"));

        merge_configset_entry(&path, "nexusdeck", TEMPLATE_NAME).unwrap();
        let first = fs::read_to_string(&path).unwrap();
        assert!(first.contains("\"nexusdeck\""));
        assert!(first.contains(TEMPLATE_NAME));

        merge_configset_entry(&path, "nexusdeck", TEMPLATE_NAME).unwrap();
        merge_configset_entry(&path, "12345", TEMPLATE_NAME).unwrap();
        let second = fs::read_to_string(&path).unwrap();
        assert_eq!(second.matches("\"nexusdeck\"").count(), 1);
        assert!(second.contains("\"12345\""));

        let _ = fs::remove_file(path);
    }

    #[test]
    fn template_body_is_valid_vdf_header() {
        assert!(TEMPLATE_BODY.contains("\"controller_mappings\""));
        assert!(TEMPLATE_BODY.contains("controller_neptune"));
    }
}

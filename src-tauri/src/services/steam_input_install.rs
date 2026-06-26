//! Install bundled Steam Input templates when NexusDeck is added to Steam.

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::{NexusDeckError, Result};
use crate::services::platform;
use crate::services::host_shell::run_host_bash;

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

    let steam_roots = find_steam_roots();
    if steam_roots.is_empty() {
        return Ok(SteamInputInstallResult {
            installed: false,
            template_path: None,
            configset_path: None,
            message: "Steam install not found — skip Steam Input layout install.".into(),
        });
    }

    let mut template_paths = Vec::new();
    for root in &steam_roots {
        let template_dir = root.join("controller_base").join("templates");
        fs::create_dir_all(&template_dir)?;
        let template_path = template_dir.join(TEMPLATE_NAME);
        fs::write(&template_path, TEMPLATE_BODY)?;
        template_paths.push(template_path);
    }

    // When sandboxed, also write through the host shell so native / Flatpak Steam
    // both see the same bytes under every common Steam root.
    if platform::is_flatpak_sandbox() {
        sync_template_on_host()?;
    }

    let primary_root = steam_roots[0].clone();
    let Some(steam_user_id) = find_steam_user_id(&primary_root) else {
        return Ok(SteamInputInstallResult {
            installed: true,
            template_path: template_paths.first().map(|p| p.display().to_string()),
            configset_path: None,
            message: "Installed template file(s). Launch Steam once while signed in, then re-run Add to Steam to link the layout.".into(),
        });
    };

    let configset_dir = primary_root
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

    // Mirror configset merge on every Steam root (native vs Flatpak Steam userdata).
    for root in steam_roots.iter().skip(1) {
        if let Some(user_id) = find_steam_user_id(root) {
            let path = root
                .join("steamapps")
                .join("common")
                .join("Steam Controller Configs")
                .join(user_id)
                .join("config")
                .join("configset_controller_neptune.vdf");
            if let Some(parent) = path.parent() {
                let _ = fs::create_dir_all(parent);
            }
            let _ = merge_configset_entry(&path, &lookup_name, TEMPLATE_NAME);
            if lookup_name != app_id_key {
                let _ = merge_configset_entry(&path, &app_id_key, TEMPLATE_NAME);
            }
        }
    }

    Ok(SteamInputInstallResult {
        installed: true,
        template_path: template_paths.first().map(|p| p.display().to_string()),
        configset_path: Some(configset_path.display().to_string()),
        message: format!(
            "Installed Steam Input layout \"NexusDeck\" under controller_base/templates. Restart Steam, then in Gaming Mode open Controller settings for {display_name} → Templates → NexusDeck."
        ),
    })
}

fn sync_template_on_host() -> Result<()> {
    let staging = std::env::var("HOME")
        .map(|home| PathBuf::from(home).join(".nexusdeck").join(TEMPLATE_NAME))
        .map_err(|_| NexusDeckError::Other("HOME not set".into()))?;
    if let Some(parent) = staging.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(&staging, TEMPLATE_BODY)?;

    let script = format!(
        r#"
set -euo pipefail
src={staging:?}
for root in \
  "$HOME/.steam/steam" \
  "$HOME/.local/share/Steam" \
  "$HOME/.var/app/com.valvesoftware.Steam/data/Steam"; do
  [ -d "$root/steamapps" ] || continue
  dir="$root/controller_base/templates"
  mkdir -p "$dir"
  cp -f "$src" "$dir/{TEMPLATE_NAME}"
done
"#
    );
    let output = run_host_bash(&script)?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(NexusDeckError::Other(format!(
            "Host Steam Input template sync failed: {stderr}"
        )));
    }
    Ok(())
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

fn find_steam_roots() -> Vec<PathBuf> {
    let Ok(home) = std::env::var("HOME") else {
        return Vec::new();
    };
    let mut roots: Vec<PathBuf> = Vec::new();
    for candidate in [
        format!("{home}/.steam/steam"),
        format!("{home}/.local/share/Steam"),
        format!("{home}/.var/app/com.valvesoftware.Steam/data/Steam"),
    ] {
        let path = PathBuf::from(&candidate);
        if path.join("steamapps").is_dir() && !roots.iter().any(|r| same_path(r, &path)) {
            roots.push(path);
        }
    }
    roots
}

fn same_path(a: &Path, b: &Path) -> bool {
    fs::canonicalize(a)
        .ok()
        .zip(fs::canonicalize(b).ok())
        .map(|(a, b)| a == b)
        .unwrap_or(false)
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
        assert!(TEMPLATE_BODY.contains("\"preset\""));
        assert!(TEMPLATE_BODY.contains("\"group_source_bindings\""));
    }
}

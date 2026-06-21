use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::db::{self, Profile};
use crate::error::Result;
use crate::games::{self, GameRegistry};
use crate::services::process_monitor::ProcessMonitor;
use crate::services::steam::detect_steam;
use crate::services::steam_launch::detect_steam_launch_info;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LaunchCheckItem {
    pub code: String,
    pub message: String,
    pub severity: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LaunchValidationResult {
    pub blockers: Vec<LaunchCheckItem>,
    pub warnings: Vec<LaunchCheckItem>,
}

pub fn validate_launch(
    profile: &Profile,
    config: &db::LaunchConfig,
    monitor: &ProcessMonitor,
) -> Result<LaunchValidationResult> {
    let mut blockers = Vec::new();
    let mut warnings = Vec::new();

    let game_path = Path::new(&profile.game_path);
    if !game_path.exists() {
        blockers.push(item(
            "game_path_invalid",
            format!("Game path does not exist: {}", profile.game_path),
            "error",
        ));
    } else if let Ok(plugin) = GameRegistry::get(&profile.game_domain) {
        if let Err(e) = plugin.validate_game_root(game_path) {
            blockers.push(item("game_path_invalid", e.to_string(), "error"));
        }
    }

    let plugin = GameRegistry::get(&profile.game_domain).ok();
    let game_name = plugin
        .as_ref()
        .map(|p| p.display_name())
        .unwrap_or("Game");

    if monitor.is_running(&profile.id) {
        blockers.push(item(
            "game_already_running",
            format!("{game_name} is already running. Close it before launching again."),
            "error",
        ));
    } else if monitor.is_waiting(&profile.id) {
        blockers.push(item(
            "game_launch_pending",
            format!("{game_name} is still starting. Wait for it to appear or reset launch state."),
            "error",
        ));
    } else if monitor.any_running() {
        blockers.push(item(
            "game_already_running",
            "Another game is already running. Wait for it to finish before starting another.",
            "error",
        ));
    }

    if config.launch_method == "steam" {
        let app_id = plugin.and_then(|p| p.steam_app_id()).unwrap_or(377160);
        if detect_steam()?.is_none() && detect_steam_launch_info(app_id).is_err() {
            warnings.push(item(
                "steam_not_found",
                "Steam not detected. Direct launch will be attempted as fallback.",
                "warning",
            ));
        }
    }

    if config.use_f4se {
        if let Ok(plugin) = GameRegistry::get(&profile.game_domain) {
            let status = plugin.detect_script_extender(game_path);
            let extender = games::GameRegistry::supported_games()
                .into_iter()
                .find(|g| g.domain == profile.game_domain)
                .and_then(|g| g.script_extender_label)
                .unwrap_or_else(|| "Script extender".to_string());
            if !status.installed {
                if config.launch_method == "steam" {
                    warnings.push(item(
                        "script_extender_missing",
                        format!(
                            "{extender} not detected. Launch will use vanilla executable unless Steam launcher is patched."
                        ),
                        "warning",
                    ));
                } else {
                    blockers.push(item(
                        "script_extender_missing",
                        format!("{extender} is required for this launch config but is not installed."),
                        "error",
                    ));
                }
            }
        }
    }

    if cfg!(target_os = "linux") && profile.proton_prefix_path.is_none() {
        warnings.push(item(
            "proton_prefix_missing",
            "Proton prefix not set. First launch may take longer while Steam creates it.",
            "warning",
        ));
    }

    if config.launch_method == "custom" {
        if config
            .custom_executable
            .as_ref()
            .map(|p| !Path::new(p).exists())
            .unwrap_or(true)
        {
            blockers.push(item(
                "custom_exe_missing",
                "Custom executable not set or not found.",
                "error",
            ));
        }
    }

    let disabled_count = db::list_installed_mods(&profile.id)?
        .into_iter()
        .filter(|m| !m.enabled)
        .count();
    if disabled_count > 0 {
        warnings.push(item(
            "disabled_mods",
            format!("{disabled_count} mod(s) are disabled and will not load."),
            "info",
        ));
    }

    Ok(LaunchValidationResult {
        blockers,
        warnings,
    })
}

fn item(code: &str, message: impl Into<String>, severity: &str) -> LaunchCheckItem {
    LaunchCheckItem {
        code: code.to_string(),
        message: message.into(),
        severity: severity.to_string(),
    }
}

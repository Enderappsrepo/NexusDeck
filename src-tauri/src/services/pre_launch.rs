use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::db::{self, Profile};
use crate::error::Result;
use crate::games::{self, GameRegistry};
use crate::services::game_settings::{is_archive_invalidation_enabled, resolve_my_games_dir};
use crate::services::mod_state::installed_file_paths;
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

    let extender_label = games::GameRegistry::supported_games()
        .into_iter()
        .find(|g| g.domain == profile.game_domain)
        .and_then(|g| g.script_extender_label)
        .unwrap_or_else(|| "Script extender".to_string());

    let needs_extender = profile_needs_script_extender(profile)?;

    if needs_extender && !config.use_f4se {
        blockers.push(item(
            "script_extender_required",
            format!(
                "This profile has mods that require {extender_label} (MCM, SKSE/F4SE plugins, etc.). \
                 Choose a launch config with {extender_label} enabled, or disable those mods."
            ),
            "error",
        ));
    }

    if config.use_f4se {
        if let Ok(plugin) = GameRegistry::get(&profile.game_domain) {
            let status = plugin.detect_script_extender(game_path);
            if !status.installed {
                if config.launch_method == "steam" {
                    warnings.push(item(
                        "script_extender_missing",
                        format!(
                            "{extender_label} not detected. Launch will use vanilla executable unless Steam launcher is patched."
                        ),
                        "warning",
                    ));
                } else {
                    blockers.push(item(
                        "script_extender_missing",
                        format!("{extender_label} is required for this launch config but is not installed."),
                        "error",
                    ));
                }
            }
        }
    } else if needs_extender {
        // Covered by blocker above; keep a warning for vanilla configs when user bypasses validation.
        warnings.push(item(
            "script_extender_recommended",
            format!("{extender_label} is recommended for your installed mods."),
            "warning",
        ));
    }

    if profile_has_loose_assets(profile)? {
        match is_archive_invalidation_enabled(profile) {
            Ok(false) => warnings.push(item(
                "archive_invalidation_disabled",
                "Archive invalidation is off — loose textures and meshes may not load. \
                 NexusDeck will enable it automatically when you launch.",
                "warning",
            )),
            Err(e) => warnings.push(item(
                "archive_invalidation_unknown",
                format!(
                    "Could not verify archive invalidation ({e}). Loose-file mods may show missing textures."
                ),
                "warning",
            )),
            Ok(true) => {}
        }

        #[cfg(target_os = "linux")]
        {
            warnings.push(item(
                "linux_loose_files",
                "On Steam Deck/Linux, loose-file casing is normalized at launch. \
                 Use Library → Repair deployment if textures still look wrong after playing.",
                "info",
            ));
        }
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

    // Prefix exists but My Games config dir is missing — INI fixes won't apply yet.
    if profile_has_loose_assets(profile)? || needs_extender {
        if resolve_my_games_dir(profile).is_err() {
            warnings.push(item(
                "proton_config_missing",
                "Proton prefix or My Games folder not found. Launch the game once through Steam \
                 so Fallout/Skyrim creates its config, then try again.",
                "warning",
            ));
        }
    }

    Ok(LaunchValidationResult {
        blockers,
        warnings,
    })
}

/// True when any enabled mod deploys loose assets under Data/ (textures, meshes, etc.).
pub fn profile_has_loose_assets(profile: &Profile) -> Result<bool> {
    let data_root = Path::new(&profile.game_path).join("Data");
    for m in db::list_installed_mods(&profile.id)?.into_iter().filter(|m| m.enabled) {
        for path in installed_file_paths(&m)? {
            let normalized = path.replace('\\', "/").to_lowercase();
            if !normalized.contains("/data/") {
                continue;
            }
            if normalized.contains("/textures/")
                || normalized.contains("/meshes/")
                || normalized.contains("/materials/")
                || normalized.contains("/interface/")
                || normalized.contains("/strings/")
                || normalized.contains("/scripts/")
            {
                return Ok(true);
            }
        }
    }
    let _ = data_root;
    Ok(false)
}

/// True when any enabled mod ships script-extender plugins or MCM UI.
pub fn profile_needs_script_extender(profile: &Profile) -> Result<bool> {
    for m in db::list_installed_mods(&profile.id)?.into_iter().filter(|m| m.enabled) {
        for path in installed_file_paths(&m)? {
            if path_needs_script_extender(&path) {
                return Ok(true);
            }
        }
    }
    Ok(false)
}

fn path_needs_script_extender(path: &str) -> bool {
    let lower = path.replace('\\', "/").to_lowercase();
    lower.contains("/f4se/plugins/")
        || lower.contains("/skse/plugins/")
        || lower.contains("/skse64/plugins/")
        || lower.contains("/sfse/plugins/")
        || lower.contains("/fose/plugins/")
        || lower.contains("/nvse/plugins/")
        || lower.contains("/obse/plugins/")
        || lower.contains("/interface/mcm/")
        || lower.contains("/mcm/")
}

fn item(code: &str, message: impl Into<String>, severity: &str) -> LaunchCheckItem {
    LaunchCheckItem {
        code: code.to_string(),
        message: message.into(),
        severity: severity.to_string(),
    }
}

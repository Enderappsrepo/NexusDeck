use std::path::Path;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

use crate::db::{self, LaunchConfig, LaunchHistoryEntry, Profile};
use crate::error::{NexusDeckError, Result};
use crate::games::GameRegistry;
use crate::services::game_settings::ensure_archive_invalidation;
use crate::services::launch_config::LaunchSettings;
use crate::services::plugins_txt::{create_safe_launch_backup, sync_plugins_txt};
use crate::services::pre_launch::{profile_has_loose_assets, validate_launch, LaunchValidationResult};
use crate::services::process_monitor::ProcessMonitor;
use crate::services::repair::repair_deployment;
use crate::services::steam_launch::{
    launch_direct_executable, launch_through_proton, launch_via_steam_cli, launch_via_steam_uri,
    proton_compat_data_path,
};
use crate::services::steam_shortcut::resolve_config;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct LaunchOptions {
    pub skip_validation: bool,
    pub safe_launch: bool,
    pub sync_plugins: bool,
    pub extra_args: Vec<String>,
}

impl Default for LaunchOptions {
    fn default() -> Self {
        Self {
            skip_validation: false,
            safe_launch: false,
            sync_plugins: true,
            extra_args: vec![],
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LaunchResult {
    pub success: bool,
    pub message: String,
    pub method: String,
    pub history_id: String,
}

pub fn validate_launch_for_profile(
    profile_id: &str,
    config_id: Option<&str>,
    monitor: &ProcessMonitor,
) -> Result<LaunchValidationResult> {
    let profile = load_profile(profile_id)?;
    let config = resolve_config(profile_id, config_id)?;
    validate_launch(&profile, &config, monitor)
}

pub fn launch_game(
    app: &AppHandle,
    profile_id: &str,
    config_id: Option<&str>,
    options: LaunchOptions,
    monitor: &ProcessMonitor,
) -> Result<LaunchResult> {
    let profile = load_profile(profile_id)?;
    let config = resolve_config(profile_id, config_id)?;

    emit_progress(app, profile_id, "validating");

    if !options.skip_validation {
        let validation = validate_launch(&profile, &config, monitor)?;
        if !validation.blockers.is_empty() {
            let msg = validation.blockers[0].message.clone();
            let _ = app.emit(
                "launch:error",
                serde_json::json!({ "profile_id": profile_id, "message": msg }),
            );
            return Err(NexusDeckError::LaunchFailed(msg));
        }
    }

    let pre_actions: Vec<String> =
        serde_json::from_str(&config.pre_launch_actions_json).unwrap_or_default();
    let settings = LaunchSettings::load()?;

    if options.safe_launch || pre_actions.iter().any(|a| a == "safe_backup") || settings.safe_launch_default {
        create_safe_launch_backup(&profile)?;
    }

    if options.sync_plugins || pre_actions.iter().any(|a| a == "sync_plugins") {
        emit_progress(app, profile_id, "syncing_plugins");
        sync_plugins_txt(&profile).map_err(|e| {
            NexusDeckError::LaunchFailed(format!(
                "Could not sync plugins.txt: {e}. Open Load Order and tap Sync, or set your Proton prefix in Setup."
            ))
        })?;
    }

    emit_progress(app, profile_id, "preparing");

    #[cfg(target_os = "linux")]
    if crate::services::proton_audio::is_bethesda_game(&profile.game_domain) {
        emit_progress(app, profile_id, "preparing_audio");
        let _ = crate::services::proton_audio::ensure_bethesda_audio(
            &profile,
            crate::services::proton_log::ProtonLogger::new("audio", None).ok().as_ref(),
        );
    }

    if pre_actions.iter().any(|a| a == "ensure_archive_invalidation")
        || profile_has_loose_assets(&profile).unwrap_or(false)
    {
        emit_progress(app, profile_id, "preparing_loose_files");
        let _ = ensure_archive_invalidation(&profile);
    }

    if pre_actions.iter().any(|a| a == "repair_loose_files") || cfg!(target_os = "linux") {
        if profile_has_loose_assets(&profile).unwrap_or(false) {
            emit_progress(app, profile_id, "repairing_loose_files");
            let _ = repair_deployment(profile_id);
        }
    }

    emit_progress(app, profile_id, "launching");

    let history_id = uuid::Uuid::new_v4().to_string();
    let started_at = chrono::Utc::now().timestamp();
    db::insert_launch_history(&LaunchHistoryEntry {
        id: history_id.clone(),
        profile_id: profile_id.to_string(),
        config_id: Some(config.id.clone()),
        started_at,
        ended_at: None,
        duration_secs: None,
        success: None,
    })?;

    db::touch_launch_config(&config.id)?;

    let plugin = GameRegistry::get(&profile.game_domain)?;
    let app_id = plugin.steam_app_id().unwrap_or(377160);
    let mut args: Vec<String> = serde_json::from_str(&config.args_json).unwrap_or_default();
    args.extend(options.extra_args);

    let (direct_pid, method) = if should_launch_direct(&profile, &config) {
        let exe = resolve_executable(&profile, &config)?;
        let game_root = Path::new(&profile.game_path);
        let pid = if cfg!(target_os = "linux") {
            launch_through_proton(&profile, Path::new(&exe), game_root, &args)?
        } else {
            launch_direct_executable(Path::new(&exe), game_root, &args)?
        };
        let label = if config.use_f4se { "f4se_direct" } else { "direct" };
        (Some(pid), label.to_string())
    } else {
        match config.launch_method.as_str() {
            "direct" | "custom" => {
                let exe = resolve_executable(&profile, &config)?;
                let pid = launch_direct_executable(
                    Path::new(&exe),
                    Path::new(&profile.game_path),
                    &args,
                )?;
                (Some(pid), "direct".to_string())
            }
            _ => {
                let compat = resolve_compat_path(&profile, app_id);
                // Prefer the steam:// URI on every platform. Inside the Flatpak
                // sandbox it is the only reliable way to reach the host Steam (via
                // the desktop portal), and it lets Steam set up the Proton prefix
                // itself. Fall back to the Steam CLI — which can also pass custom
                // launch args — only if the URI launch fails. (Custom args are best
                // set via Steam launch options or the direct/custom launch method.)
                let method = if launch_via_steam_uri(app_id).is_ok() {
                    "steam_uri".to_string()
                } else {
                    launch_via_steam_cli(app_id, &args, compat.as_deref())?;
                    "steam_cli".to_string()
                };
                (None, method)
            }
        }
    };

    monitor.begin_tracking(
        profile_id,
        &profile.game_domain,
        Some(config.id.clone()),
        history_id.clone(),
        direct_pid,
    )?;

    let message = format!("Launched via {method}");
    let _ = app.emit(
        "launch:progress",
        serde_json::json!({
            "profile_id": profile_id,
            "stage": "launched",
            "method": method,
        }),
    );

    Ok(LaunchResult {
        success: true,
        message,
        method,
        history_id,
    })
}

fn load_profile(profile_id: &str) -> Result<Profile> {
    db::get_profile(profile_id)?
        .ok_or_else(|| NexusDeckError::NotFound("Profile not found".into()))
}

fn should_launch_direct(profile: &Profile, config: &LaunchConfig) -> bool {
    if config.launch_method == "direct" || config.launch_method == "custom" {
        return true;
    }
    if !config.use_f4se {
        return false;
    }
    let Ok(plugin) = GameRegistry::get(&profile.game_domain) else {
        return false;
    };
    // Steam's default shortcut always starts the vanilla exe — route F4SE through
    // the loader directly (via Proton on Linux).
    plugin
        .detect_script_extender(Path::new(&profile.game_path))
        .installed
}

fn resolve_executable(profile: &Profile, config: &LaunchConfig) -> Result<String> {
    if config.launch_method == "custom" {
        return config.custom_executable.clone().ok_or_else(|| {
            NexusDeckError::LaunchFailed("Custom executable not configured".into())
        });
    }
    let plugin = GameRegistry::get(&profile.game_domain)?;
    let targets = plugin.launch_targets(Path::new(&profile.game_path));
    let target = if config.use_f4se {
        targets.iter().find(|t| t.is_f4se)
    } else {
        targets.iter().find(|t| !t.is_f4se)
    }
    .or_else(|| targets.first())
    .ok_or_else(|| NexusDeckError::LaunchFailed("No executable found".into()))?;
    Ok(target.executable.clone())
}

fn resolve_compat_path(profile: &Profile, app_id: u32) -> Option<std::path::PathBuf> {
    if let Some(ref prefix) = profile.proton_prefix_path {
        return Some(Path::new(prefix).parent()?.to_path_buf());
    }
    crate::services::steam_shortcut::resolve_library_path(profile, app_id)
        .map(|lib| proton_compat_data_path(&lib, app_id))
}

fn emit_progress(app: &AppHandle, profile_id: &str, stage: &str) {
    let _ = app.emit(
        "launch:progress",
        serde_json::json!({ "profile_id": profile_id, "stage": stage }),
    );
}

pub fn batch_launch_tools(
    app: &AppHandle,
    profile_id: &str,
    tool_ids: Vec<String>,
    monitor: &ProcessMonitor,
) -> Result<Vec<String>> {
    let mut launched = Vec::new();

    for tool in tool_ids {
        match tool.as_str() {
            "game" => {
                launch_game(app, profile_id, None, LaunchOptions::default(), monitor)?;
                launched.push("game".to_string());
            }
            "loot" | "xedit" | "f4se" => {
                launched.push(format!(
                    "{tool}: configure external tool path in launch options"
                ));
            }
            _ => {}
        }
    }
    Ok(launched)
}

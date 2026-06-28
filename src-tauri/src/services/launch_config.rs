use serde::{Deserialize, Serialize};

use crate::db;
use crate::error::Result;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct LaunchSettings {
    pub always_ask_before_launch: bool,
    pub close_app_after_launch: bool,
    pub hide_on_launch: bool,
    pub gamescope_handoff: bool,
    pub safe_launch_default: bool,
    pub default_deck_args: bool,
    pub global_launch_hotkey: Option<String>,
}

impl Default for LaunchSettings {
    fn default() -> Self {
        let deck = crate::services::platform::is_steam_deck();
        Self {
            always_ask_before_launch: false,
            close_app_after_launch: false,
            hide_on_launch: deck,
            gamescope_handoff: deck,
            safe_launch_default: false,
            default_deck_args: true,
            global_launch_hotkey: None,
        }
    }
}

impl LaunchSettings {
    pub fn load() -> Result<Self> {
        let raw = db::get_setting("launch_settings")?;
        if let Some(json) = raw {
            Ok(serde_json::from_str(&json).unwrap_or_default())
        } else {
            Ok(Self::default())
        }
    }

    pub fn save(&self) -> Result<()> {
        db::set_setting("launch_settings", &serde_json::to_string(self)?)
    }
}

const DEFAULT_PRE_LAUNCH_ACTIONS: &[&str] = &[
    "sync_plugins",
    "ensure_archive_invalidation",
    "repair_loose_files",
];

pub fn ensure_configs_for_profile(profile_id: &str, game_domain: &str) -> Result<()> {
    db::seed_default_launch_configs(profile_id, game_domain)?;
    upgrade_launch_configs(profile_id)?;
    Ok(())
}

/// Add missing pre-launch steps to existing configs (archive invalidation, loose-file repair).
fn upgrade_launch_configs(profile_id: &str) -> Result<()> {
    for mut config in db::list_launch_configs(profile_id)? {
        let mut actions: Vec<String> =
            serde_json::from_str(&config.pre_launch_actions_json).unwrap_or_default();
        let mut changed = false;
        for action in DEFAULT_PRE_LAUNCH_ACTIONS {
            if !actions.iter().any(|a| a == action) {
                actions.push(action.to_string());
                changed = true;
            }
        }
        if changed {
            config.pre_launch_actions_json = serde_json::to_string(&actions)?;
            db::save_launch_config(&config)?;
        }
    }
    Ok(())
}

pub fn default_pre_launch_actions_json() -> String {
    serde_json::to_string(DEFAULT_PRE_LAUNCH_ACTIONS).unwrap_or_else(|_| "[]".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_pre_launch_includes_loose_file_steps() {
        let json = default_pre_launch_actions_json();
        assert!(json.contains("ensure_archive_invalidation"));
        assert!(json.contains("repair_loose_files"));
    }
}

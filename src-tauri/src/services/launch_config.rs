use serde::{Deserialize, Serialize};

use crate::db;
use crate::error::Result;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LaunchSettings {
    pub always_ask_before_launch: bool,
    pub close_app_after_launch: bool,
    pub safe_launch_default: bool,
    pub default_deck_args: bool,
    pub global_launch_hotkey: Option<String>,
}

impl Default for LaunchSettings {
    fn default() -> Self {
        Self {
            always_ask_before_launch: false,
            close_app_after_launch: false,
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

pub fn ensure_configs_for_profile(profile_id: &str, game_domain: &str) -> Result<()> {
    db::seed_default_launch_configs(profile_id, game_domain)
}

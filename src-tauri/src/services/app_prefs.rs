//! Startup preferences read before WebKit initializes (requires app restart to apply).

use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::error::Result;
use crate::services::paths::{config_dir, ensure_dir};

const PREFS_FILE: &str = "app_prefs.json";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum HardwareAccelerationMode {
    /// GPU compositing via WebKit (recommended on Steam Deck).
    On,
    /// CPU-only rendering for blank-window / glitches on older WebKit builds.
    Off,
}

impl Default for HardwareAccelerationMode {
    fn default() -> Self {
        Self::On
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppPrefs {
    #[serde(default)]
    pub hardware_acceleration: HardwareAccelerationMode,
}

impl Default for AppPrefs {
    fn default() -> Self {
        Self {
            hardware_acceleration: HardwareAccelerationMode::On,
        }
    }
}

fn prefs_path() -> PathBuf {
    config_dir().join(PREFS_FILE)
}

pub fn load_app_prefs() -> AppPrefs {
    let path = prefs_path();
    let Ok(raw) = fs::read_to_string(&path) else {
        return AppPrefs::default();
    };
    serde_json::from_str(&raw).unwrap_or_default()
}

pub fn save_app_prefs(prefs: &AppPrefs) -> Result<()> {
    ensure_dir(&config_dir())?;
    let json = serde_json::to_string_pretty(prefs)?;
    fs::write(prefs_path(), json)?;
    Ok(())
}

pub fn hardware_acceleration_enabled() -> bool {
    matches!(
        load_app_prefs().hardware_acceleration,
        HardwareAccelerationMode::On
    )
}

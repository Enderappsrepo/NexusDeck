use std::fs;
use std::path::Path;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlatformInfo {
    pub os: String,
    pub is_linux: bool,
    pub is_steam_deck: bool,
    pub is_flatpak: bool,
    pub steamos_version: Option<String>,
    pub app_version: String,
}

pub fn detect_platform() -> PlatformInfo {
    let is_linux = cfg!(target_os = "linux");
    let is_steam_deck = is_linux && is_steam_deck();
    let is_flatpak = is_flatpak_sandbox();
    let steamos_version = if is_steam_deck {
        read_steamos_version()
    } else {
        None
    };

    PlatformInfo {
        os: std::env::consts::OS.to_string(),
        is_linux,
        is_steam_deck,
        is_flatpak,
        steamos_version,
        app_version: env!("CARGO_PKG_VERSION").to_string(),
    }
}

pub fn is_steam_deck() -> bool {
    if std::env::var("SteamOS").is_ok() || std::env::var("STEAMOS").is_ok() {
        return true;
    }

    for path in ["/etc/os-release", "/usr/lib/os-release"] {
        if let Ok(content) = fs::read_to_string(path) {
            let lower = content.to_lowercase();
            if lower.contains("steamos") || lower.contains("valve") {
                return true;
            }
        }
    }

    Path::new("/home/deck").is_dir()
}

fn detect_steam_deck() -> bool {
    is_steam_deck()
}

pub fn is_flatpak_sandbox() -> bool {
    std::env::var("FLATPAK_ID").is_ok()
        || Path::new("/.flatpak-info").exists()
        || std::env::var("container")
            .map(|v| v.eq_ignore_ascii_case("flatpak"))
            .unwrap_or(false)
}

fn read_steamos_version() -> Option<String> {
    for path in ["/etc/os-release", "/usr/lib/os-release"] {
        if let Ok(content) = fs::read_to_string(path) {
            for line in content.lines() {
                if let Some(rest) = line.strip_prefix("VERSION_ID=") {
                    return Some(rest.trim_matches('"').to_string());
                }
            }
        }
    }
    None
}

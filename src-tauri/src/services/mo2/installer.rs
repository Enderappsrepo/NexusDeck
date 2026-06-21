use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use serde::{Deserialize, Serialize};

use crate::db;
use crate::error::{NexusDeckError, Result};
use crate::services::mo2::Mo2Status;

const DEFAULT_MO2_DIR: &str = ".local/share/modorganizer2";
const INSTALLER_REPO: &str = "https://github.com/rockerbacon/modorganizer2-linux-installer.git";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Mo2InstallResult {
    pub success: bool,
    pub install_path: String,
    pub message: String,
}

pub fn detect_installation() -> Mo2Status {
    let home = dirs::home_dir().unwrap_or_default();
    let candidates = [
        home.join(DEFAULT_MO2_DIR),
        home.join(".local/share/ModOrganizer2"),
        home.join("ModOrganizing2"),
    ];

    for path in candidates {
        if path.join("ModOrganizer.exe").exists() || path.join("modorganizer2").exists() {
            return Mo2Status {
                installed: true,
                install_path: Some(path.display().to_string()),
                instance_path: None,
                message: format!("MO2 found at {}", path.display()),
            };
        }
    }

    Mo2Status {
        installed: false,
        install_path: None,
        instance_path: None,
        message: "Mod Organizer 2 not detected. Install via DeckModFix MO2 wizard.".to_string(),
    }
}

pub fn run_linux_installer(profile_id: &str) -> Result<Mo2Status> {
    if cfg!(target_os = "windows") {
        return Ok(Mo2Status {
            installed: false,
            install_path: None,
            instance_path: None,
            message: "On Windows, install MO2 from modorganizer.org and point NexusDeck to the instance.".to_string(),
        });
    }

    let profile = db::get_profile(profile_id)?
        .ok_or_else(|| NexusDeckError::NotFound("Profile not found".into()))?;

    let work = std::env::temp_dir().join(format!("mo2-install-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&work)?;

    let clone = Command::new("git")
        .args(["clone", "--depth", "1", INSTALLER_REPO, "mo2-installer"])
        .current_dir(&work)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .status();

    if clone.map(|s| !s.success()).unwrap_or(true) {
        return Ok(Mo2Status {
            installed: false,
            install_path: None,
            instance_path: None,
            message: "Could not clone MO2 Linux installer. Install git and try again, or run the installer manually.".to_string(),
        });
    }

    let installer_dir = work.join("mo2-installer");
    let install = Command::new("bash")
        .arg("./install.sh")
        .current_dir(&installer_dir)
        .env("GAME_PATH", &profile.game_path)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .status();

    let _ = std::fs::remove_dir_all(&work);

    let mut status = detect_installation();
    if install.map(|s| s.success()).unwrap_or(false) || status.installed {
        status.message = "MO2 installer finished. Configure your Skyrim instance in the MO2 panel.".to_string();
        db::set_profile_mod_manager(profile_id, "mo2")?;
    } else {
        status.message = "MO2 installer did not complete successfully. Run rockerbacon/modorganizer2-linux-installer manually in Desktop mode.".to_string();
    }

    Ok(status)
}

pub fn default_mods_path(profile: &db::Profile) -> PathBuf {
    dirs::home_dir()
        .unwrap_or_default()
        .join("Games")
        .join("SkyrimSE")
        .join("mods")
}

pub fn ensure_mods_path(path: &Path) -> Result<()> {
    std::fs::create_dir_all(path)?;
    Ok(())
}

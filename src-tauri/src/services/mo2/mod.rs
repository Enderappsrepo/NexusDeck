pub mod installer;
pub mod instance;

use serde::{Deserialize, Serialize};

use crate::error::Result;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Mo2Status {
    pub installed: bool,
    pub install_path: Option<String>,
    pub instance_path: Option<String>,
    pub message: String,
}

pub fn detect_mo2() -> Mo2Status {
    installer::detect_installation()
}

pub fn get_status(profile_id: &str) -> Result<Mo2Status> {
    instance::status_for_profile(profile_id)
}

pub fn run_installer(profile_id: &str) -> Result<Mo2Status> {
    installer::run_linux_installer(profile_id)
}

pub fn configure_instance(profile_id: &str, mods_path: Option<String>) -> Result<Mo2Status> {
    instance::configure(profile_id, mods_path)
}

pub fn wabbajack_checklist() -> Vec<String> {
    vec![
        "Install MO2 via DeckModFix (recommended) or rockerbacon installer.".into(),
        "Run protontricks dependencies for Skyrim SE (489830).".into(),
        "Install SKSE matching your game version.".into(),
        "Launch vanilla Skyrim once to generate prefix and INIs.".into(),
        "On Deck, prefer Tuxborn Wabbajack builds or run Wabbajack on desktop.".into(),
        "After Wabbajack completes, register SKSE as MO2 executable.".into(),
        "Add MO2 or SKSE shortcut to Steam for Gaming Mode.".into(),
    ]
}

pub fn guidance_message(fix_type: &str) -> Option<String> {
    match fix_type {
        "wabbajack_guidance" => Some(wabbajack_checklist().join("\n• ")),
        "sd_card_staging_guidance" => Some(
            "Move your staging folder to internal storage (e.g. ~/Games/SkyrimSE/staging) in Setup → Staging Folder.".into(),
        ),
        "prefix_backup_guidance" => Some(
            "Use Troubleshoot → Backup Prefix before recreating. Prefixes over 8 GB often benefit from cleanup.".into(),
        ),
        "proton_guidance" => Some(
            "In Steam: Properties → Compatibility → Force Proton GE 9+ or Proton Experimental.".into(),
        ),
        _ => None,
    }
}

pub fn apply_guidance_fix(fix_type: &str, remedy_id: &str) -> crate::services::autofix::FixResult {
    let message = guidance_message(fix_type).unwrap_or_else(|| {
        format!("See DeckModFix docs for {fix_type}.")
    });
    crate::services::autofix::FixResult {
        remedy_id: remedy_id.to_string(),
        applied: false,
        skipped: false,
        message,
        backup_path: None,
    }
}

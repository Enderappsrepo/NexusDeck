use std::fs;
use std::path::PathBuf;

use crate::db;
use crate::error::{NexusDeckError, Result};
use crate::services::mo2::{installer, Mo2Status};

#[derive(Debug, serde::Serialize, serde::Deserialize)]
struct Mo2InstanceMeta {
    game_path: String,
    mods_path: String,
    profile_id: String,
    configured_at: String,
}

pub fn status_for_profile(profile_id: &str) -> Result<Mo2Status> {
    let profile = db::get_profile(profile_id)?
        .ok_or_else(|| NexusDeckError::NotFound("Profile not found".into()))?;
    let mut status = installer::detect_installation();
    if let Some(meta_path) = instance_meta_path(profile_id) {
        if meta_path.exists() {
            if let Ok(content) = fs::read_to_string(&meta_path) {
                if let Ok(meta) = serde_json::from_str::<Mo2InstanceMeta>(&content) {
                    status.instance_path = Some(meta.mods_path.clone());
                    status.message = format!(
                        "MO2 instance configured. Mods folder: {}",
                        meta.mods_path
                    );
                }
            }
        }
    }
    let _ = profile;
    Ok(status)
}

pub fn configure(profile_id: &str, mods_path: Option<String>) -> Result<Mo2Status> {
    let profile = db::get_profile(profile_id)?
        .ok_or_else(|| NexusDeckError::NotFound("Profile not found".into()))?;

    let mods = mods_path
        .map(PathBuf::from)
        .unwrap_or_else(|| installer::default_mods_path(&profile));
    installer::ensure_mods_path(&mods)?;

    let meta = Mo2InstanceMeta {
        game_path: profile.game_path.clone(),
        mods_path: mods.display().to_string(),
        profile_id: profile_id.to_string(),
        configured_at: chrono::Utc::now().to_rfc3339(),
    };

    let meta_path = instance_meta_path(profile_id)
        .ok_or_else(|| NexusDeckError::Other("Could not resolve MO2 meta path".into()))?;
    if let Some(parent) = meta_path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(&meta_path, serde_json::to_string_pretty(&meta)?)?;

    db::set_profile_mod_manager(profile_id, "mo2")?;

    Ok(Mo2Status {
        installed: installer::detect_installation().installed,
        install_path: installer::detect_installation().install_path,
        instance_path: Some(mods.display().to_string()),
        message: format!(
            "MO2 instance paths saved. Use MO2 to manage mods; staging: {}",
            mods.display()
        ),
    })
}

pub fn skse_mo2_executable_hint() -> String {
    "In MO2: Configure Executables → Add skse64_loader.exe from your game folder. Set as default.".into()
}

fn instance_meta_path(profile_id: &str) -> Option<PathBuf> {
    dirs::data_local_dir().map(|d| d.join("nexusdeck").join("mo2").join(format!("{profile_id}.json")))
}

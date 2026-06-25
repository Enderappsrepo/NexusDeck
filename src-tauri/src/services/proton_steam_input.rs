//! Steam Deck uses Steam Input for in-game controllers. The winetricks `xinput`
//! verb installs native Microsoft XInput DLLs that override Steam's virtual
//! gamepad and leave the game stuck in mouse-only mode.

use std::path::{Path, PathBuf};

use crate::db::Profile;
use crate::error::Result;
use crate::services::game_settings;
use crate::services::prefix_manager;
use crate::services::proton_log::ProtonLogger;

const XINPUT_DLL_KEYS: &[&str] = &[
    "xinput1_1",
    "xinput1_2",
    "xinput1_3",
    "xinput1_4",
    "xinput9_1_0",
];

/// Remove winetricks/native XInput DLL overrides so Steam Input's virtual
/// controller reaches the game. Idempotent — safe before every launch.
pub fn clear_xinput_winetricks_overrides(pfx: &Path) -> Result<bool> {
    let user_reg = pfx.join("user.reg");
    if !user_reg.is_file() {
        return Ok(false);
    }

    let mut content = std::fs::read_to_string(&user_reg)?;
    if !content.contains("[Software\\\\Wine\\\\DllOverrides]") {
        return Ok(false);
    }

    let mut changed = false;
    let lines: Vec<&str> = content.lines().collect();
    let mut kept = Vec::with_capacity(lines.len());
    for line in lines {
        let trimmed = line.trim();
        let is_xinput_override = XINPUT_DLL_KEYS.iter().any(|key| {
            trimmed.starts_with(&format!("\"{key}\""))
                || trimmed.starts_with(&format!("\"{}\"", key.to_uppercase()))
        });
        if is_xinput_override {
            changed = true;
        } else {
            kept.push(line);
        }
    }

    if !changed {
        return Ok(false);
    }

    content = kept.join("\n");
    if !content.ends_with('\n') {
        content.push('\n');
    }
    std::fs::write(&user_reg, content)?;
    Ok(true)
}

fn resolve_pfx(profile: &Profile) -> Option<PathBuf> {
    if let Some(ref stored) = profile.proton_prefix_path {
        let path = PathBuf::from(stored);
        if path.join("user.reg").is_file() {
            return Some(path);
        }
        let nested = path.join("pfx");
        if nested.join("user.reg").is_file() {
            return Some(nested);
        }
    }

    let plugin = crate::games::GameRegistry::get(&profile.game_domain).ok()?;
    let app_id = plugin.steam_app_id()?;
    prefix_manager::find_prefix_for_app(app_id)
}

/// Restore Steam Input compatibility: strip winetricks XInput overrides and
/// apply Fallout 4 gamepad INI when applicable.
pub fn ensure_steam_input_for_profile(
    profile: &Profile,
    logger: Option<&ProtonLogger>,
) -> Result<bool> {
    if cfg!(target_os = "windows") {
        return Ok(false);
    }

    let profile = prefix_manager::ensure_proton_prefix(profile).unwrap_or_else(|_| profile.clone());

    let Some(pfx) = resolve_pfx(&profile) else {
        return Ok(false);
    };

    let mut changed = false;
    match clear_xinput_winetricks_overrides(&pfx) {
        Ok(true) => {
            changed = true;
            if let Some(log) = logger {
                log.info(
                    "steam_input",
                    "Removed winetricks XInput DLL overrides — Steam Input can drive the game again",
                );
            }
        }
        Ok(false) => {}
        Err(e) => {
            if let Some(log) = logger {
                log.warn("steam_input", &format!("XInput override cleanup skipped: {e}"));
            }
        }
    }

    if profile.game_domain == "fallout4" {
        match game_settings::ensure_deck_gamepad_settings(&profile) {
            Ok(true) => {
                changed = true;
                if let Some(log) = logger {
                    log.info("steam_input", "Applied Fallout 4 gamepad INI (bGamepadEnable=1)");
                }
            }
            Ok(false) => {}
            Err(e) => {
                if let Some(log) = logger {
                    log.warn("steam_input", &format!("Gamepad INI fix skipped: {e}"));
                }
            }
        }
    }

    Ok(changed)
}

pub fn pfx_has_xinput_override(pfx: &Path) -> bool {
    let Ok(content) = std::fs::read_to_string(pfx.join("user.reg")) else {
        return false;
    };
    XINPUT_DLL_KEYS.iter().any(|key| content.contains(&format!("\"{key}\"")))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_xinput_override_lines() {
        let dir = std::env::temp_dir().join(format!("nd-xinput-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let reg = dir.join("user.reg");
        std::fs::write(
            &reg,
            r#"REGEDIT4

[Software\\Wine\\DllOverrides]
"xinput1_3"="native,builtin"
"xaudio2_7"="native,builtin"
"#,
        )
        .unwrap();

        assert!(clear_xinput_winetricks_overrides(&dir).unwrap());
        let after = std::fs::read_to_string(&reg).unwrap();
        assert!(!after.contains("xinput1_3"));
        assert!(after.contains("xaudio2_7"));

        let _ = std::fs::remove_dir_all(&dir);
    }
}

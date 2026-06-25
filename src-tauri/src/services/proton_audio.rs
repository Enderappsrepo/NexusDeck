//! Bethesda games (Fallout 4, Skyrim SE) need XACT + xaudio2_7 overrides on Proton
//! for NPC voice lines and music. SFX use a different path and often still work.

use std::path::{Path, PathBuf};
use std::process::Command;

use serde::{Deserialize, Serialize};

use crate::db::Profile;
use crate::error::{NexusDeckError, Result};
use crate::games::GameRegistry;
use crate::services::proton_deps::{detect_protontricks, install_packages_for_app};
use crate::services::proton_log::ProtonLogger;
use crate::services::steam::detect_steam;

pub const WINE_XAUDIO_OVERRIDES: &str = r"xaudio2_7=n,b;xaudio2_6=n,b";

const AUDIO_PACKAGES: [&str; 2] = ["xact", "xact_64"];
const OPTIONAL_AUDIO_PACKAGES: [&str; 1] = ["xact_64"];
const MARKER_FILE: &str = ".nexusdeck_bethesda_audio";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BethesdaAudioStatus {
    pub applicable: bool,
    pub ready: bool,
    pub dll_override_applied: bool,
    pub xact_installed: bool,
    pub message: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub log_path: Option<String>,
}

pub fn is_bethesda_game(game_domain: &str) -> bool {
    matches!(game_domain, "fallout4" | "skyrimspecialedition")
}

pub fn get_bethesda_audio_status(profile: &Profile) -> Result<BethesdaAudioStatus> {
    if cfg!(target_os = "windows") || !is_bethesda_game(&profile.game_domain) {
        return Ok(BethesdaAudioStatus {
            applicable: false,
            ready: true,
            dll_override_applied: true,
            xact_installed: true,
            message: None,
            log_path: None,
        });
    }

    let Some(pfx) = resolve_prefix_pfx(profile) else {
        return Ok(BethesdaAudioStatus {
            applicable: true,
            ready: false,
            dll_override_applied: false,
            xact_installed: false,
            message: Some(
                "Proton prefix not found. Launch the game once through Steam, then try again.".into(),
            ),
            log_path: None,
        });
    };

    let dll_override_applied = has_xaudio_dll_override(&pfx);
    let xact_installed = has_audio_marker(&pfx);
    let pt_available = detect_protontricks().available;
    let ready = dll_override_applied && (!pt_available || xact_installed);

    Ok(BethesdaAudioStatus {
        applicable: true,
        ready,
        dll_override_applied,
        xact_installed,
        message: if ready {
            None
        } else {
            Some(
                "NPC voices and music need a Proton audio fix (XACT + xaudio2). Tap Fix voice audio.".into(),
            )
        },
        log_path: None,
    })
}

/// Apply persistent prefix audio fix + install XACT. Safe to call before every launch.
pub fn ensure_bethesda_audio(
    profile: &Profile,
    logger: Option<&ProtonLogger>,
) -> Result<BethesdaAudioStatus> {
    if let Some(log) = logger {
        let _ = log.write_header(
            "Bethesda voice & music audio fix",
            &format!(
                "game={} profile={}\npath={}",
                profile.game_domain,
                profile.id,
                profile.game_path
            ),
        );
    }

    if cfg!(target_os = "windows") || !is_bethesda_game(&profile.game_domain) {
        return get_bethesda_audio_status(profile);
    }

    let pfx = resolve_prefix_pfx(profile).ok_or_else(|| {
        if let Some(log) = logger {
            log.error("prefix", "Proton prefix not found");
        }
        NexusDeckError::Other(
            "Proton prefix not found. Launch Fallout 4 once through Steam first.".into(),
        )
    })?;

    if let Some(log) = logger {
        log.info("prefix", &format!("Using prefix at {}", pfx.display()));
    }

    apply_xaudio_dll_override(&pfx, logger)?;

    let plugin = GameRegistry::get(&profile.game_domain)?;
    let app_id = plugin.steam_app_id().unwrap_or(377160);

    if !has_audio_marker(&pfx) {
        let pt = detect_protontricks();
        if let Some(log) = logger {
            log.info(
                "protontricks",
                &format!("available={} — installing XACT packages", pt.available),
            );
        }
        if pt.available {
            match install_packages_for_app(app_id, &AUDIO_PACKAGES, logger) {
                Ok(result) if result.failed.is_empty() => {
                    let _ = mark_audio_ready(&pfx);
                    if let Some(log) = logger {
                        log.info("xact", "XACT packages installed and marker written");
                    }
                }
                Ok(result)
                    if result.installed.iter().any(|p| p == "xact")
                        && result
                            .failed
                            .iter()
                            .all(|p| OPTIONAL_AUDIO_PACKAGES.contains(&p.as_str())) =>
                {
                    let _ = mark_audio_ready(&pfx);
                    if let Some(log) = logger {
                        log.info(
                            "xact",
                            "32-bit xact installed; optional xact_64 skipped — xaudio2 override active",
                        );
                    }
                }
                Ok(result)
                    if result.skipped.iter().any(|p| p == "xact_64")
                        && result.installed.iter().any(|p| p == "xact") =>
                {
                    let _ = mark_audio_ready(&pfx);
                    if let Some(log) = logger {
                        log.info(
                            "xact",
                            "32-bit xact installed; xact_64 optional skip — xaudio2 override active",
                        );
                    }
                }
                Ok(result) => {
                    let msg = format!(
                        "Some audio packages failed: {} — DLL override still applied.",
                        result.failed.join(", ")
                    );
                    log::warn!("{msg}");
                    if let Some(log) = logger {
                        log.warn("xact", &msg);
                    }
                }
                Err(e) => {
                    let msg = format!("protontricks audio install failed: {e} — DLL override still applied.");
                    log::warn!("{msg}");
                    if let Some(log) = logger {
                        log.warn("xact", &msg);
                    }
                }
            }
        } else if let Some(log) = logger {
            log.warn("protontricks", "Unavailable; applied xaudio DLL override only");
        }
    } else if let Some(log) = logger {
        log.info("xact", "Audio marker already present — skipping XACT install");
    }

    let mut status = get_bethesda_audio_status(profile)?;
    if let Some(log) = logger {
        status.log_path = Some(log.log_path_string());
        log.info(
            "result",
            &format!(
                "ready={} dll_override={} xact={}",
                status.ready, status.dll_override_applied, status.xact_installed
            ),
        );
    }
    Ok(status)
}

pub fn apply_bethesda_audio_env(cmd: &mut Command, game_domain: &str, flatpak_spawn: bool) {
    if cfg!(target_os = "windows") || !is_bethesda_game(game_domain) {
        return;
    }
    if flatpak_spawn {
        cmd.arg(format!("--env=WINEDLLOVERRIDES={WINE_XAUDIO_OVERRIDES}"));
    } else {
        cmd.env("WINEDLLOVERRIDES", WINE_XAUDIO_OVERRIDES);
    }
}

fn resolve_prefix_pfx(profile: &Profile) -> Option<PathBuf> {
    if let Some(ref stored) = profile.proton_prefix_path {
        let path = PathBuf::from(stored);
        if path.join("user.reg").is_file() {
            return Some(path);
        }
        let pfx = path.join("pfx");
        if pfx.join("user.reg").is_file() {
            return Some(pfx);
        }
    }

    let plugin = GameRegistry::get(&profile.game_domain).ok()?;
    let app_id = plugin.steam_app_id()?;
    let steam = detect_steam().ok().flatten()?;
    steam.library_folders.into_iter().find_map(|lib| {
        let candidate = Path::new(&lib)
            .join("steamapps")
            .join("compatdata")
            .join(app_id.to_string())
            .join("pfx");
        candidate.join("user.reg").is_file().then_some(candidate)
    })
}

fn has_audio_marker(pfx: &Path) -> bool {
    pfx.join(MARKER_FILE).is_file()
}

fn mark_audio_ready(pfx: &Path) -> Result<()> {
    std::fs::write(
        pfx.join(MARKER_FILE),
        chrono::Utc::now().to_rfc3339(),
    )?;
    Ok(())
}

fn has_xaudio_dll_override(pfx: &Path) -> bool {
    let Ok(content) = std::fs::read_to_string(pfx.join("user.reg")) else {
        return false;
    };
    content.contains(r#""xaudio2_7"="native,builtin""#)
        || content.contains(r#""xaudio2_7"="native, builtin""#)
}

/// Apply xaudio2 native,builtin overrides in user.reg (used when xact_64 fails on Proton).
pub fn apply_xaudio_for_pfx(pfx: &Path, logger: Option<&ProtonLogger>) -> Result<()> {
    apply_xaudio_dll_override(pfx, logger)
}

fn apply_xaudio_dll_override(pfx: &Path, logger: Option<&ProtonLogger>) -> Result<()> {
    let user_reg = pfx.join("user.reg");
    if !user_reg.is_file() {
        return Err(NexusDeckError::Other(
            "Wine prefix user.reg not found — launch the game through Steam once.".into(),
        ));
    }

    let mut content = std::fs::read_to_string(&user_reg)?;
    if has_xaudio_dll_override(pfx) {
        if let Some(log) = logger {
            log.info("dll_override", "xaudio2 overrides already present in user.reg");
        }
        return Ok(());
    }

    if let Some(log) = logger {
        log.info("dll_override", "Applying xaudio2_7/xaudio2_6 native,builtin overrides");
    }

    let entries = [
        ("xaudio2_7", "native,builtin"),
        ("xaudio2_6", "native,builtin"),
    ];

    if let Some(section_start) = content.find("[Software\\\\Wine\\\\DllOverrides]") {
        let after_header = content[section_start..]
            .find('\n')
            .map(|i| section_start + i + 1)
            .unwrap_or(content.len());
        let mut block = String::new();
        for (key, value) in entries {
            block.push_str(&format!("\"{key}\"=\"{value}\"\n"));
        }
        content.insert_str(after_header, &block);
    } else {
        content.push_str("\n[Software\\Wine\\DllOverrides]\n");
        for (key, value) in entries {
            content.push_str(&format!("\"{key}\"=\"{value}\"\n"));
        }
    }

    std::fs::write(&user_reg, content)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bethesda_domains_only() {
        assert!(is_bethesda_game("fallout4"));
        assert!(is_bethesda_game("skyrimspecialedition"));
        assert!(!is_bethesda_game("falloutnv"));
    }
}

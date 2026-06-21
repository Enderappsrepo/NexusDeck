//! External modding tools (BodySlide, …). On the Steam Deck these are Windows
//! executables that must run inside the game's Proton prefix so their output
//! (built body meshes) lands in the game's Data folder. NexusDeck ships as a
//! Flatpak there, so the actual exec is bounced to the host via `flatpak-spawn
//! --host`.
//!
//! NOTE: the Linux/Proton launch path cannot be exercised by the Windows dev
//! build — it is compiled (no `cfg` gating, so `cargo check` validates it) but
//! its runtime behaviour must be confirmed on a real Deck.

use std::path::{Path, PathBuf};
use std::process::Command;

use serde::{Deserialize, Serialize};

use crate::db::{self, Profile};
use crate::error::{NexusDeckError, Result};
use crate::games::GameRegistry;
use crate::services::steam::detect_steam;
use crate::services::steam_launch::launch_direct_executable;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BodySlideInfo {
    pub installed: bool,
    pub exe_path: Option<String>,
    pub working_dir: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SseEditInfo {
    pub installed: bool,
    pub exe_path: Option<String>,
    pub working_dir: Option<String>,
}

const SSEEDIT_NAMES: [&str; 2] = ["SSEEdit.exe", "x64 SSEEdit.exe"];

pub fn detect_sseedit(profile_id: &str) -> Result<SseEditInfo> {
    let profile = load_profile(profile_id)?;
    let game_root = PathBuf::from(&profile.game_path);

    let search_dirs = [
        game_root.clone(),
        game_root.join("SSEEdit"),
        game_root.join("xEdit"),
        PathBuf::from(&profile.staging_path).join("tools").join("SSEEdit"),
    ];

    for dir in search_dirs {
        for exe in SSEEDIT_NAMES {
            let candidate = dir.join(exe);
            if candidate.exists() {
                return Ok(SseEditInfo {
                    installed: true,
                    exe_path: Some(candidate.display().to_string()),
                    working_dir: Some(dir.display().to_string()),
                });
            }
        }
    }

    Ok(SseEditInfo {
        installed: false,
        exe_path: None,
        working_dir: Some(game_root.display().to_string()),
    })
}

pub fn launch_sseedit(profile_id: &str) -> Result<String> {
    let info = detect_sseedit(profile_id)?;
    let exe = info.exe_path.ok_or_else(|| {
        NexusDeckError::NotFound(
            "SSEEdit not found. Install SSEEdit as a mod or place it in your game folder.".into(),
        )
    })?;
    let cwd = info.working_dir.unwrap_or_default();

    if std::env::consts::OS == "windows" {
        launch_direct_executable(Path::new(&exe), Path::new(&cwd), &[])?;
        return Ok("Launched SSEEdit.".into());
    }

    let profile = load_profile(profile_id)?;
    launch_through_proton(&profile, Path::new(&exe), Path::new(&cwd))?;
    Ok("Launched SSEEdit through Proton.".into())
}

/// Standard deployed location for BodySlide (installed as a mod into Data).
const BODYSLIDE_SUBDIR: [&str; 3] = ["Data", "CalienteTools", "BodySlide"];
const BODYSLIDE_EXES: [&str; 2] = ["BodySlide x64.exe", "BodySlide.exe"];

fn load_profile(profile_id: &str) -> Result<Profile> {
    db::get_profile(profile_id)?
        .ok_or_else(|| NexusDeckError::NotFound("Profile not found".into()))
}

fn bodyslide_dir(profile: &Profile) -> PathBuf {
    let mut dir = PathBuf::from(&profile.game_path);
    for part in BODYSLIDE_SUBDIR {
        dir.push(part);
    }
    dir
}

pub fn detect_bodyslide(profile_id: &str) -> Result<BodySlideInfo> {
    let profile = load_profile(profile_id)?;
    let dir = bodyslide_dir(&profile);
    for exe in BODYSLIDE_EXES {
        let candidate = dir.join(exe);
        if candidate.exists() {
            return Ok(BodySlideInfo {
                installed: true,
                exe_path: Some(candidate.display().to_string()),
                working_dir: Some(dir.display().to_string()),
            });
        }
    }
    Ok(BodySlideInfo {
        installed: false,
        exe_path: None,
        working_dir: Some(dir.display().to_string()),
    })
}

pub fn launch_bodyslide(profile_id: &str) -> Result<String> {
    let info = detect_bodyslide(profile_id)?;
    let exe = info.exe_path.ok_or_else(|| {
        NexusDeckError::NotFound(
            "BodySlide isn't deployed yet. Install BodySlide as a mod and deploy it so it lands in Data/CalienteTools/BodySlide.".into(),
        )
    })?;
    let cwd = info.working_dir.unwrap_or_default();

    // Runtime branch (not `cfg!`) so both paths stay compiled and type-checked.
    if std::env::consts::OS == "windows" {
        launch_direct_executable(Path::new(&exe), Path::new(&cwd), &[])?;
        return Ok("Launched BodySlide.".into());
    }

    let profile = load_profile(profile_id)?;
    launch_through_proton(&profile, Path::new(&exe), Path::new(&cwd))?;
    Ok("Launched BodySlide through Proton. Build or Batch Build your presets, then re-deploy if prompted.".into())
}

fn launch_through_proton(profile: &Profile, exe: &Path, cwd: &Path) -> Result<()> {
    let plugin = GameRegistry::get(&profile.game_domain)?;
    let app_id = plugin.steam_app_id().unwrap_or(489830);

    let compat = compat_data_dir(profile, app_id).ok_or_else(|| {
        NexusDeckError::Other(
            "Couldn't find the game's Proton prefix. Launch the game once through Steam so Proton creates it, then try again.".into(),
        )
    })?;

    let steam_root = steam_root_dir().ok_or_else(|| {
        NexusDeckError::Other("Couldn't locate your Steam install.".into())
    })?;

    let proton = find_proton(&steam_root).ok_or_else(|| {
        NexusDeckError::Other(
            "Couldn't find a Proton version. Open the game's Properties in Steam, force a Proton version under Compatibility, then try again.".into(),
        )
    })?;

    let mut cmd = if Path::new("/.flatpak-info").exists() {
        // Inside the Flatpak sandbox: run on the host where Steam + Proton live.
        let mut c = Command::new("flatpak-spawn");
        c.arg("--host");
        c.arg(format!("--directory={}", cwd.display()));
        c.arg(format!("--env=STEAM_COMPAT_DATA_PATH={}", compat.display()));
        c.arg(format!(
            "--env=STEAM_COMPAT_CLIENT_INSTALL_PATH={}",
            steam_root.display()
        ));
        c.arg(format!("--env=STEAM_COMPAT_INSTALL_PATH={}", profile.game_path));
        c.arg(proton.display().to_string());
        c.arg("run");
        c.arg(exe.display().to_string());
        c
    } else {
        let mut c = Command::new(&proton);
        c.arg("run").arg(exe).current_dir(cwd);
        c.env("STEAM_COMPAT_DATA_PATH", &compat);
        c.env("STEAM_COMPAT_CLIENT_INSTALL_PATH", &steam_root);
        c.env("STEAM_COMPAT_INSTALL_PATH", &profile.game_path);
        c
    };

    cmd.spawn().map_err(|e| {
        NexusDeckError::LaunchFailed(format!("Failed to start BodySlide through Proton: {e}"))
    })?;
    Ok(())
}

/// `STEAM_COMPAT_DATA_PATH` — the `compatdata/<appid>` dir holding the prefix.
fn compat_data_dir(profile: &Profile, app_id: u32) -> Option<PathBuf> {
    if let Some(ref prefix) = profile.proton_prefix_path {
        // proton_prefix_path is `<lib>/steamapps/compatdata/<appid>/pfx`.
        return Path::new(prefix).parent().map(Path::to_path_buf);
    }
    let steam = detect_steam().ok().flatten()?;
    steam.library_folders.into_iter().find_map(|lib| {
        let candidate = Path::new(&lib)
            .join("steamapps")
            .join("compatdata")
            .join(app_id.to_string());
        candidate.exists().then_some(candidate)
    })
}

fn steam_root_dir() -> Option<PathBuf> {
    if let Ok(Some(steam)) = detect_steam() {
        let p = PathBuf::from(&steam.steam_path);
        if p.exists() {
            return Some(p);
        }
    }
    let home = std::env::var("HOME").ok()?;
    [
        format!("{home}/.steam/steam"),
        format!("{home}/.local/share/Steam"),
        format!("{home}/.var/app/com.valvesoftware.Steam/data/Steam"),
    ]
    .into_iter()
    .map(PathBuf::from)
    .find(|p| p.exists())
}

/// Best-effort Proton finder: scan Valve Proton installs + user compat tools,
/// preferring Experimental, then the highest version number.
fn find_proton(steam_root: &Path) -> Option<PathBuf> {
    let mut roots = vec![
        steam_root.join("steamapps").join("common"),
        steam_root.join("compatibilitytools.d"),
    ];
    if let Ok(Some(steam)) = detect_steam() {
        for lib in steam.library_folders {
            roots.push(Path::new(&lib).join("steamapps").join("common"));
        }
    }

    let mut best: Option<(i64, PathBuf)> = None;
    for root in roots {
        let Ok(entries) = std::fs::read_dir(&root) else {
            continue;
        };
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if !name.to_lowercase().contains("proton") {
                continue;
            }
            let proton_bin = entry.path().join("proton");
            if !proton_bin.exists() {
                continue;
            }
            let score = proton_score(&name);
            if best.as_ref().map(|(s, _)| score > *s).unwrap_or(true) {
                best = Some((score, proton_bin));
            }
        }
    }
    best.map(|(_, p)| p)
}

fn proton_score(name: &str) -> i64 {
    let lower = name.to_lowercase();
    if lower.contains("experimental") {
        return 100_000;
    }
    // First run of digits (e.g. "GE-Proton9-5" -> 95, "Proton 9.0" -> 90).
    let digits: String = name
        .chars()
        .map(|c| if c.is_ascii_digit() { c } else { ' ' })
        .collect();
    digits
        .split_whitespace()
        .take(2)
        .collect::<String>()
        .parse::<i64>()
        .unwrap_or(0)
}

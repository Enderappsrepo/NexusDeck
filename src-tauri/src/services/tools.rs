//! External modding tools (BodySlide, …). On the Steam Deck these are Windows
//! executables that must run inside the game's Proton prefix so their output
//! (built body meshes) lands in the game's Data folder.

use std::path::{Path, PathBuf};
use std::process::Command;

use serde::{Deserialize, Serialize};
use walkdir::WalkDir;

use crate::db::{self, Profile};
use crate::error::{NexusDeckError, Result};
use crate::games::GameRegistry;
use crate::services::steam::detect_steam;
use crate::services::steam_launch::launch_direct_executable;

pub const FO4_BODYSLIDE_NEXUS_URL: &str =
    "https://www.nexusmods.com/fallout4/mods/25";

const BODYSLIDE_EXES: [&str; 2] = ["BodySlide x64.exe", "BodySlide.exe"];

const BODY_MOD_KEYWORDS: [&str; 6] = ["cbbe", "caliente", "bodyslide", "body", "3ba", "unp"];

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BodySlideInfo {
    pub installed: bool,
    pub exe_path: Option<String>,
    pub working_dir: Option<String>,
    pub expected_path: Option<String>,
    pub found_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BodySetupStep {
    pub id: String,
    pub label: String,
    pub status: String,
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BodySetupStatus {
    pub cbbe_installed: bool,
    pub bodyslide_installed: bool,
    pub bodyslide_exe: Option<String>,
    pub presets_built: bool,
    pub steps: Vec<BodySetupStep>,
    pub nexus_bodyslide_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SseEditInfo {
    pub installed: bool,
    pub exe_path: Option<String>,
    pub working_dir: Option<String>,
}

const SSEEDIT_NAMES: [&str; 2] = ["SSEEdit.exe", "x64 SSEEdit.exe"];

fn load_profile(profile_id: &str) -> Result<Profile> {
    db::get_profile(profile_id)?
        .ok_or_else(|| NexusDeckError::NotFound("Profile not found".into()))
}

fn expected_bodyslide_dir(profile: &Profile) -> PathBuf {
    PathBuf::from(&profile.game_path)
        .join("Data")
        .join("CalienteTools")
        .join("BodySlide")
}

fn is_body_mod_name(name: &str) -> bool {
    let lower = name.to_lowercase();
    BODY_MOD_KEYWORDS.iter().any(|k| lower.contains(k))
}

pub fn profile_has_body_mod(profile_id: &str) -> Result<bool> {
    let mods = db::list_installed_mods(profile_id)?;
    Ok(mods.iter().any(|m| is_body_mod_name(&m.name)))
}

fn find_bodyslide_exe(game_root: &Path) -> Option<(PathBuf, PathBuf)> {
    let expected = game_root
        .join("Data")
        .join("CalienteTools")
        .join("BodySlide");

    for exe in BODYSLIDE_EXES {
        let candidate = expected.join(exe);
        if candidate.is_file() {
            return Some((candidate, expected.clone()));
        }
    }

    // Legacy wrong deploy: CalienteTools at game root (missing Data/).
    let legacy = game_root.join("CalienteTools").join("BodySlide");
    for exe in BODYSLIDE_EXES {
        let candidate = legacy.join(exe);
        if candidate.is_file() {
            return Some((candidate, legacy));
        }
    }

    // Case-insensitive walk under Data/ for BodySlide x64.exe.
    let data_root = game_root.join("Data");
    if data_root.is_dir() {
        for entry in WalkDir::new(&data_root).max_depth(6).into_iter().filter_map(|e| e.ok()) {
            if !entry.file_type().is_file() {
                continue;
            }
            let name = entry.file_name().to_string_lossy().to_lowercase();
            if BODYSLIDE_EXES.iter().any(|exe| name == exe.to_lowercase()) {
                let path = entry.path().to_path_buf();
                let dir = path.parent().map(|p| p.to_path_buf())?;
                return Some((path, dir));
            }
        }
    }

    None
}

fn presets_built(profile: &Profile) -> bool {
    let body_mesh = PathBuf::from(&profile.game_path)
        .join("Data")
        .join("meshes")
        .join("actors")
        .join("character")
        .join("body");
    if body_mesh.is_dir() {
        if WalkDir::new(&body_mesh)
            .max_depth(2)
            .into_iter()
            .filter_map(|e| e.ok())
            .any(|e| e.file_type().is_file() && e.path().extension().is_some_and(|x| x == "nif"))
        {
            return true;
        }
    }

    if let Some((_, dir)) = find_bodyslide_exe(Path::new(&profile.game_path)) {
        let slider_out = dir.join("SliderGroups");
        if slider_out.is_dir() {
            return true;
        }
    }

    false
}

pub fn detect_bodyslide(profile_id: &str) -> Result<BodySlideInfo> {
    let profile = load_profile(profile_id)?;
    let game_root = PathBuf::from(&profile.game_path);
    let expected = expected_bodyslide_dir(&profile);

    if let Some((exe, dir)) = find_bodyslide_exe(&game_root) {
        return Ok(BodySlideInfo {
            installed: true,
            exe_path: Some(exe.display().to_string()),
            working_dir: Some(dir.display().to_string()),
            expected_path: Some(expected.display().to_string()),
            found_at: Some(dir.display().to_string()),
        });
    }

    Ok(BodySlideInfo {
        installed: false,
        exe_path: None,
        working_dir: Some(expected.display().to_string()),
        expected_path: Some(expected.display().to_string()),
        found_at: None,
    })
}

pub fn get_body_setup_status(profile_id: &str) -> Result<BodySetupStatus> {
    let profile = load_profile(profile_id)?;
    let cbbe_installed = profile_has_body_mod(profile_id)?;
    let bodyslide = detect_bodyslide(profile_id)?;
    let presets_built = presets_built(&profile);

    let nexus_url = if profile.game_domain == "fallout4" {
        Some(FO4_BODYSLIDE_NEXUS_URL.to_string())
    } else {
        None
    };

    let step1_status = if cbbe_installed { "done" } else { "pending" };
    let step2_status = if bodyslide.installed {
        "done"
    } else if cbbe_installed {
        "action_needed"
    } else {
        "pending"
    };
    let step3_status = if presets_built {
        "done"
    } else if bodyslide.installed {
        "action_needed"
    } else {
        "pending"
    };
    let step4_status = if presets_built { "done" } else { "pending" };

    let steps = vec![
        BodySetupStep {
            id: "cbbe".into(),
            label: "Install CBBE or body mod".into(),
            status: step1_status.into(),
            description: Some(
                "Install a body framework (e.g. CBBE) via NexusDeck. Use the FOMOD wizard to pick your body shape.".into(),
            ),
        },
        BodySetupStep {
            id: "bodyslide".into(),
            label: "Install BodySlide + Outfit Studio".into(),
            status: step2_status.into(),
            description: Some(
                "Download BodySlide from Nexus and install it. Files must land in Data/CalienteTools/BodySlide.".into(),
            ),
        },
        BodySetupStep {
            id: "build".into(),
            label: "Build body presets in BodySlide".into(),
            status: step3_status.into(),
            description: Some(
                "Launch BodySlide, select your CBBE preset, then Batch Build. Output meshes go to Data/meshes/.".into(),
            ),
        },
        BodySetupStep {
            id: "verify".into(),
            label: "Verify meshes in game".into(),
            status: step4_status.into(),
            description: Some(
                "Launch the game and confirm your character uses the built body shape.".into(),
            ),
        },
    ];

    Ok(BodySetupStatus {
        cbbe_installed,
        bodyslide_installed: bodyslide.installed,
        bodyslide_exe: bodyslide.exe_path,
        presets_built,
        steps,
        nexus_bodyslide_url: nexus_url,
    })
}

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

pub fn launch_bodyslide(profile_id: &str) -> Result<String> {
    let info = detect_bodyslide(profile_id)?;
    let exe = info.exe_path.ok_or_else(|| {
        NexusDeckError::NotFound(format!(
            "BodySlide isn't deployed yet. Expected at {}. Install BodySlide as a mod — files must land in Data/CalienteTools/BodySlide.",
            info.expected_path.as_deref().unwrap_or("Data/CalienteTools/BodySlide")
        ))
    })?;
    let cwd = info.working_dir.unwrap_or_default();

    if std::env::consts::OS == "windows" {
        launch_direct_executable(Path::new(&exe), Path::new(&cwd), &[])?;
        return Ok("Launched BodySlide.".into());
    }

    let profile = load_profile(profile_id)?;
    launch_through_proton(&profile, Path::new(&exe), Path::new(&cwd))?;
    Ok("Launched BodySlide through Proton. Batch Build your presets, then verify meshes in Data/meshes/.".into())
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

fn compat_data_dir(profile: &Profile, app_id: u32) -> Option<PathBuf> {
    if let Some(ref prefix) = profile.proton_prefix_path {
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

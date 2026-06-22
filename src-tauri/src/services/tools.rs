//! External modding tools (BodySlide, …). On the Steam Deck these are Windows
//! executables that must run inside the game's Proton prefix so their output
//! (built body meshes) lands in the game's Data folder.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use walkdir::WalkDir;

use crate::db::{self, Profile};
use crate::error::{NexusDeckError, Result};
use crate::services::steam_launch::{launch_direct_executable, launch_through_proton};

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
    launch_through_proton(&profile, Path::new(&exe), Path::new(&cwd), &[])?;
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
    launch_through_proton(&profile, Path::new(&exe), Path::new(&cwd), &[])?;
    Ok("Launched BodySlide through Proton. Batch Build your presets, then verify meshes in Data/meshes/.".into())
}

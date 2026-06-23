//! External modding tools (BodySlide, …). On the Steam Deck these are Windows
//! executables that must run inside the game's Proton prefix so their output
//! (built body meshes) lands in the game's Data folder.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use walkdir::WalkDir;

use crate::db::{self, Profile};
use crate::error::{NexusDeckError, Result};
use crate::services::bodyslide_config::{self, BodyslidePathInfo};
use crate::services::steam_launch::{launch_direct_executable, launch_through_proton};

pub const FO4_BODYSLIDE_NEXUS_URL: &str =
    "https://www.nexusmods.com/fallout4/mods/25";

pub struct BodySlideCatalogEntry {
    pub game_domain: &'static str,
    pub mod_id: u64,
    pub mod_name: &'static str,
    pub nexus_url: &'static str,
}

const BODYSLIDE_CATALOG: &[BodySlideCatalogEntry] = &[
    BodySlideCatalogEntry {
        game_domain: "fallout4",
        mod_id: 25,
        mod_name: "BodySlide and Outfit Studio -",
        nexus_url: FO4_BODYSLIDE_NEXUS_URL,
    },
    BodySlideCatalogEntry {
        game_domain: "skyrimspecialedition",
        mod_id: 201,
        mod_name: "BodySlide and Outfit Studio -",
        nexus_url: "https://www.nexusmods.com/skyrimspecialedition/mods/201",
    },
];

pub struct CbbeCatalogEntry {
    pub game_domain: &'static str,
    pub mod_id: u64,
    pub mod_name: &'static str,
    pub nexus_url: &'static str,
}

const CBBE_CATALOG: &[CbbeCatalogEntry] = &[
    CbbeCatalogEntry {
        game_domain: "fallout4",
        mod_id: 111,
        mod_name: "Caliente's Beautiful Bodies Enhancer -CBBE-",
        nexus_url: "https://www.nexusmods.com/fallout4/mods/111",
    },
    CbbeCatalogEntry {
        game_domain: "skyrimspecialedition",
        mod_id: 198,
        mod_name: "Caliente's Beautiful Bodies Enhancer - CBBE",
        nexus_url: "https://www.nexusmods.com/skyrimspecialedition/mods/198",
    },
];

pub fn bodyslide_catalog(game_domain: &str) -> Option<&'static BodySlideCatalogEntry> {
    BODYSLIDE_CATALOG
        .iter()
        .find(|e| e.game_domain == game_domain)
}

pub fn cbbe_catalog(game_domain: &str) -> Option<&'static CbbeCatalogEntry> {
    CBBE_CATALOG.iter().find(|e| e.game_domain == game_domain)
}

const BODYSLIDE_EXES: [&str; 2] = ["BodySlide x64.exe", "BodySlide.exe"];
const OUTFIT_STUDIO_EXES: [&str; 2] = ["Outfit Studio x64.exe", "OutfitStudio.exe"];

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
    pub nexus_mod_id: Option<u64>,
    pub mod_name: Option<String>,
    pub can_one_click_install: bool,
    pub outfit_studio_available: bool,
    pub nexus_cbbe_url: Option<String>,
    pub cbbe_mod_id: Option<u64>,
    pub cbbe_mod_name: Option<String>,
    pub can_one_click_cbbe: bool,
    pub bodyslide_game_data_path: Option<String>,
    pub bodyslide_linux_data_path: Option<String>,
    pub bodyslide_config_ready: bool,
    pub bodyslide_browse_hint: Option<String>,
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

    // CBBE FO4 ships BodySlide under Data/Tools/BodySlide (not CalienteTools).
    let cbbe_tools = game_root.join("Data").join("Tools").join("BodySlide");
    for exe in BODYSLIDE_EXES {
        let candidate = cbbe_tools.join(exe);
        if candidate.is_file() {
            return Some((candidate, cbbe_tools.clone()));
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

fn find_tool_exe(game_root: &Path, exe_names: &[&str]) -> Option<(PathBuf, PathBuf)> {
    if let Some((exe, dir)) = find_bodyslide_exe(game_root) {
        for name in exe_names {
            let candidate = dir.join(name);
            if candidate.is_file() {
                return Some((candidate, dir.clone()));
            }
        }
    }
    None
}

fn outfit_studio_available(profile_id: &str) -> Result<bool> {
    let profile = load_profile(profile_id)?;
    Ok(find_tool_exe(Path::new(&profile.game_path), &OUTFIT_STUDIO_EXES).is_some())
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
    let catalog = bodyslide_catalog(&profile.game_domain);
    let cbbe = cbbe_catalog(&profile.game_domain);
    let outfit_studio = outfit_studio_available(profile_id).unwrap_or(false);

    let nexus_url = catalog.map(|c| c.nexus_url.to_string());
    let nexus_mod_id = catalog.map(|c| c.mod_id);
    let mod_name = catalog.map(|c| c.mod_name.to_string());
    let can_one_click_install = catalog.is_some() && !bodyslide.installed;
    let nexus_cbbe_url = cbbe.map(|c| c.nexus_url.to_string());
    let cbbe_mod_id = cbbe.map(|c| c.mod_id);
    let cbbe_mod_name = cbbe.map(|c| c.mod_name.to_string());
    let can_one_click_cbbe = cbbe.is_some() && !cbbe_installed;

    let path_info = if bodyslide.installed {
        bodyslide
            .working_dir
            .as_deref()
            .and_then(|dir| {
                bodyslide_config::bodyslide_path_info(&profile, Some(Path::new(dir))).ok()
            })
    } else {
        bodyslide_config::bodyslide_path_info(&profile, None).ok()
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
        nexus_mod_id,
        mod_name,
        can_one_click_install,
        outfit_studio_available: outfit_studio,
        nexus_cbbe_url,
        cbbe_mod_id,
        cbbe_mod_name,
        can_one_click_cbbe,
        bodyslide_game_data_path: path_info.as_ref().map(|p| p.game_data_path.clone()),
        bodyslide_linux_data_path: path_info.as_ref().map(|p| p.linux_data_path.clone()),
        bodyslide_config_ready: path_info.as_ref().is_some_and(|p| p.config_matches),
        bodyslide_browse_hint: path_info.as_ref().and_then(|p| p.browse_hint.clone()),
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

pub fn configure_bodyslide_paths(profile_id: &str) -> Result<BodyslidePathInfo> {
    let profile = load_profile(profile_id)?;
    let info = detect_bodyslide(profile_id)?;
    let dir = info.working_dir.ok_or_else(|| {
        NexusDeckError::NotFound(
            "BodySlide install folder not found. Install BodySlide to Data/CalienteTools/BodySlide or Data/Tools/BodySlide first.".into(),
        )
    })?;
    bodyslide_config::configure_bodyslide(&profile, Path::new(&dir))
}

fn prepare_bodyslide_launch(profile_id: &str, cwd: &str) -> Result<BodyslidePathInfo> {
    let profile = load_profile(profile_id)?;
    if std::env::consts::OS == "windows" {
        return bodyslide_config::bodyslide_path_info(&profile, Some(Path::new(cwd)));
    }
    bodyslide_config::configure_bodyslide(&profile, Path::new(cwd))
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
    let path_info = prepare_bodyslide_launch(profile_id, &cwd)?;

    if std::env::consts::OS == "windows" {
        launch_direct_executable(Path::new(&exe), Path::new(&cwd), &[])?;
        return Ok("Launched BodySlide.".into());
    }

    let profile = load_profile(profile_id)?;
    launch_through_proton(&profile, Path::new(&exe), Path::new(&cwd), &[])?;
    Ok(format!(
        "Configured BodySlide game path and launched through Proton. If prompted, use: {}",
        path_info.game_data_path
    ))
}

pub fn launch_outfit_studio(profile_id: &str) -> Result<String> {
    let profile = load_profile(profile_id)?;
    let game_root = PathBuf::from(&profile.game_path);
    let (exe, cwd) = find_tool_exe(&game_root, &OUTFIT_STUDIO_EXES).ok_or_else(|| {
        NexusDeckError::NotFound(
            "Outfit Studio not found. Install BodySlide first — it includes Outfit Studio.".into(),
        )
    })?;

    if std::env::consts::OS == "windows" {
        launch_direct_executable(&exe, &cwd, &[])?;
        return Ok("Launched Outfit Studio.".into());
    }

    let _path_info = prepare_bodyslide_launch(profile_id, &cwd.display().to_string())?;
    launch_through_proton(&profile, &exe, &cwd, &[])?;
    Ok("Configured game path and launched Outfit Studio through Proton.".into())
}

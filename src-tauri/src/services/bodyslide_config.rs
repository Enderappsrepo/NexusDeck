//! BodySlide reads `Config.xml` from Wine AppData (not the install folder) in release
//! builds. On Steam Deck the file picker also hides `.steam`, so NexusDeck:
//! 1. Symlinks the game into `C:\Program Files (x86)\Steam\steamapps\common\…` inside
//!    the Proton prefix (browseable in Wine).
//! 2. Writes `Config.xml` to every AppData location BodySlide may use.

use std::path::{Path, PathBuf};

use crate::db::Profile;
use crate::error::{NexusDeckError, Result};
use crate::games::GameRegistry;
use crate::services::steam::detect_steam;

#[derive(Debug, Clone)]
pub struct BodyslideGameTarget {
    pub target_game: i32,
    pub path_tag: &'static str,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct BodyslidePathInfo {
    /// Windows path BodySlide should use (browseable C: layout when possible).
    pub game_data_path: String,
    pub linux_data_path: String,
    /// Primary Config.xml NexusDeck wrote (usually under AppData in the prefix).
    pub config_path: Option<String>,
    pub config_matches: bool,
    /// How to navigate in BodySlide's folder picker if it still prompts.
    pub browse_hint: Option<String>,
}

const STEAM_COMMON_REL: &str = "drive_c/Program Files (x86)/Steam/steamapps/common";

const APPDATA_DIR_NAMES: [&str; 3] = [
    "BodySlide x64",
    "BodySlide and Outfit Studio",
    "BodySlide",
];

pub fn bodyslide_game_target(game_domain: &str) -> Option<BodyslideGameTarget> {
    match game_domain {
        "fallout4" => Some(BodyslideGameTarget {
            target_game: 3,
            path_tag: "Fallout4",
        }),
        "skyrimspecialedition" => Some(BodyslideGameTarget {
            target_game: 4,
            path_tag: "SkyrimSpecialEdition",
        }),
        _ => None,
    }
}

pub fn game_data_dir(profile: &Profile) -> Result<PathBuf> {
    let data = PathBuf::from(&profile.game_path).join("Data");
    if !data.is_dir() {
        return Err(NexusDeckError::NotFound(format!(
            "Game Data folder not found at {}. Verify your game path in profile settings.",
            data.display()
        )));
    }
    Ok(data)
}

/// Windows-style path BodySlide expects when running under Proton on Linux.
pub fn bodyslide_game_data_path(profile: &Profile) -> Result<String> {
    let data = game_data_dir(profile)?;
    if cfg!(target_os = "windows") {
        return Ok(to_windows_path(&data));
    }

    if let Some(prefix) = resolve_prefix_pfx(profile) {
        ensure_steam_common_symlink(profile, &prefix)?;
        if let Some(path) = steam_layout_path_in_prefix(&prefix, &data) {
            return Ok(path);
        }
    }

    Ok(proton_z_drive_path(&data))
}

pub fn bodyslide_path_info(profile: &Profile, bodyslide_dir: Option<&Path>) -> Result<BodyslidePathInfo> {
    let data = game_data_dir(profile)?;
    let game_data_path = bodyslide_game_data_path(profile)?;
    let config_dirs = bodyslide_config_directories(profile, bodyslide_dir);
    let config_matches = config_dirs.iter().any(|dir| {
        let config = dir.join("Config.xml");
        config.is_file() && config_contains_path(&config, &game_data_path)
    });
    let primary_config = config_dirs
        .first()
        .map(|d| d.join("Config.xml").display().to_string());

    Ok(BodyslidePathInfo {
        game_data_path: game_data_path.clone(),
        linux_data_path: data.display().to_string(),
        config_path: primary_config,
        config_matches,
        browse_hint: Some(browse_hint_for_path(&game_data_path)),
    })
}

pub fn configure_bodyslide(profile: &Profile, bodyslide_dir: &Path) -> Result<BodyslidePathInfo> {
    let target = bodyslide_game_target(&profile.game_domain).ok_or_else(|| {
        NexusDeckError::Other(format!(
            "BodySlide path auto-config is not supported for {}.",
            profile.game_domain
        ))
    })?;

    let game_data_path = bodyslide_game_data_path(profile)?;
    let config_dirs = bodyslide_config_directories(profile, Some(bodyslide_dir));

    if config_dirs.is_empty() {
        return Err(NexusDeckError::Other(
            "Couldn't find the game's Proton prefix. Launch Fallout 4 once through Steam, then try again.".into(),
        ));
    }

    let seed = config_dirs
        .iter()
        .find_map(|dir| {
            let config = dir.join("Config.xml");
            config.is_file()
                .then(|| std::fs::read_to_string(&config).ok())
                .flatten()
        })
        .or_else(|| {
            bodyslide_dir
                .join("Config.xml")
                .is_file()
                .then(|| std::fs::read_to_string(bodyslide_dir.join("Config.xml")).ok())
                .flatten()
        })
        .unwrap_or_else(default_config_template);

    let mut content = seed;
    content = set_xml_element_text(&content, "TargetGame", &target.target_game.to_string());
    content = set_xml_element_text(&content, "GameDataPath", &game_data_path);
    content = set_xml_element_text(&content, "OutputDataPath", &game_data_path);
    content = set_xml_element_text(&content, target.path_tag, &game_data_path);
    content = set_xml_element_text(&content, "WarnMissingGamePath", "false");

    for dir in &config_dirs {
        std::fs::create_dir_all(dir)?;
        std::fs::write(dir.join("Config.xml"), &content)?;
    }

    // Install dir copy helps if BodySlide is run in debug/portable mode.
    if bodyslide_dir.is_dir() {
        let _ = std::fs::write(bodyslide_dir.join("Config.xml"), &content);
    }

    bodyslide_path_info(profile, Some(bodyslide_dir))
}

fn browse_hint_for_path(game_data_path: &str) -> String {
    if game_data_path.starts_with("C:\\") || game_data_path.starts_with("c:\\") {
        "In BodySlide's folder picker: open C: → Program Files (x86) → Steam → steamapps → common → your game → Data. Do not browse for .steam — it is hidden.".into()
    } else {
        "Paste the path into BodySlide's address bar (Ctrl+L). Do not browse for .steam — hidden folders won't appear.".into()
    }
}

fn bodyslide_config_directories(profile: &Profile, bodyslide_dir: Option<&Path>) -> Vec<PathBuf> {
    let mut dirs = Vec::new();

    if let Some(prefix) = resolve_prefix_pfx(profile) {
        dirs.extend(discover_existing_config_dirs(&prefix));
        dirs.extend(default_appdata_config_dirs(&prefix));
    }

    if let Some(install) = bodyslide_dir {
        dirs.push(install.to_path_buf());
    }

    dirs.sort();
    dirs.dedup();
    dirs
}

fn discover_existing_config_dirs(prefix: &Path) -> Vec<PathBuf> {
    let mut found = Vec::new();
    for user in ["steamuser", "steam"] {
        for appdata in ["AppData/Roaming", "AppData/Local"] {
            let base = prefix.join("drive_c/users").join(user).join(appdata);
            let Ok(entries) = std::fs::read_dir(&base) else {
                continue;
            };
            for entry in entries.flatten() {
                let path = entry.path();
                if !path.is_dir() {
                    continue;
                }
                let name = entry.file_name().to_string_lossy().to_lowercase();
                if name.contains("bodyslide") && path.join("Config.xml").is_file() {
                    found.push(path);
                }
            }
        }
    }
    found
}

fn default_appdata_config_dirs(prefix: &Path) -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    for user in ["steamuser", "steam"] {
        for name in APPDATA_DIR_NAMES {
            dirs.push(
                prefix
                    .join("drive_c/users")
                    .join(user)
                    .join("AppData/Roaming")
                    .join(name),
            );
        }
    }
    dirs
}

fn resolve_prefix_pfx(profile: &Profile) -> Option<PathBuf> {
    if let Some(ref stored) = profile.proton_prefix_path {
        let path = PathBuf::from(stored);
        if path.join("drive_c").is_dir() {
            return Some(path);
        }
        let pfx = path.join("pfx");
        if pfx.join("drive_c").is_dir() {
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
        candidate.join("drive_c").is_dir().then_some(candidate)
    })
}

#[cfg(unix)]
fn ensure_steam_common_symlink(profile: &Profile, prefix: &Path) -> Result<()> {
    let game_root = PathBuf::from(&profile.game_path);
    let game_name = game_root.file_name().ok_or_else(|| {
        NexusDeckError::Other("Could not determine game folder name.".into())
    })?;

    let link_parent = prefix.join(STEAM_COMMON_REL);
    std::fs::create_dir_all(&link_parent)?;

    let link_path = link_parent.join(game_name);
    if link_path.exists() {
        if link_path.join("Data").is_dir() {
            return Ok(());
        }
        if link_path.is_symlink() {
            let _ = std::fs::remove_file(&link_path);
        }
    }

    let target = std::fs::canonicalize(&game_root).unwrap_or(game_root);
    std::os::unix::fs::symlink(&target, &link_path).map_err(|e| {
        NexusDeckError::Other(format!(
            "Could not link game into Proton prefix for BodySlide: {e}"
        ))
    })
}

#[cfg(not(unix))]
fn ensure_steam_common_symlink(_profile: &Profile, _prefix: &Path) -> Result<()> {
    Ok(())
}

fn default_config_template() -> String {
    r#"<Config>
    <TargetGame>-1</TargetGame>
    <WarnMissingGamePath>true</WarnMissingGamePath>
    <BSATextureScan>true</BSATextureScan>
    <GameDataFiles></GameDataFiles>
    <GameDataPaths>
        <Fallout3></Fallout3>
        <FalloutNewVegas></FalloutNewVegas>
        <Skyrim></Skyrim>
        <Fallout4></Fallout4>
        <SkyrimSpecialEdition></SkyrimSpecialEdition>
        <Fallout4VR></Fallout4VR>
        <SkyrimVR></SkyrimVR>
        <Fallout76></Fallout76>
        <Oblivion></Oblivion>
        <Starfield></Starfield>
    </GameDataPaths>
    <GameDataPath></GameDataPath>
    <OutputDataPath></OutputDataPath>
</Config>
"#
    .to_string()
}

fn set_xml_element_text(content: &str, tag: &str, value: &str) -> String {
    let escaped = xml_escape(value);
    let open = format!("<{tag}>");
    let close = format!("</{tag}>");

    if let Some(start) = content.find(&open) {
        if let Some(end) = content[start..].find(&close) {
            let end = start + end;
            let mut out = String::with_capacity(content.len() + escaped.len());
            out.push_str(&content[..start]);
            out.push_str(&open);
            out.push_str(&escaped);
            out.push_str(&close);
            out.push_str(&content[end + close.len()..]);
            return out;
        }
    }

    if let Some(close_start) = content.rfind("</Config>") {
        let mut out = String::with_capacity(content.len() + escaped.len() + tag.len() + 8);
        out.push_str(&content[..close_start]);
        out.push_str("    ");
        out.push_str(&open);
        out.push_str(&escaped);
        out.push_str(&close);
        out.push('\n');
        out.push_str(&content[close_start..]);
        return out;
    }

    format!("{content}\n<{tag}>{escaped}</{tag}>\n")
}

fn xml_escape(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

fn config_contains_path(config_path: &Path, expected: &str) -> bool {
    let Ok(content) = std::fs::read_to_string(config_path) else {
        return false;
    };
    let normalized = expected.trim_end_matches('\\').to_lowercase();
    content.to_lowercase().contains(&normalized)
}

fn proton_z_drive_path(linux_path: &Path) -> String {
    let abs = std::fs::canonicalize(linux_path).unwrap_or_else(|_| linux_path.to_path_buf());
    let mut path = abs.display().to_string();
    if path.starts_with("//?/") {
        path = path[4..].to_string();
    }
    path = path.replace('/', "\\");
    if !path.ends_with('\\') {
        path.push('\\');
    }
    format!("Z:\\{path}")
}

fn to_windows_path(path: &Path) -> String {
    let mut s = path.display().to_string().replace('/', "\\");
    if !s.ends_with('\\') {
        s.push('\\');
    }
    s
}

fn steam_layout_path_in_prefix(prefix: &Path, data_path: &Path) -> Option<String> {
    let game_root = data_path.parent()?;
    let game_name = game_root.file_name()?.to_string_lossy();

    for rel in [
        STEAM_COMMON_REL,
        "drive_c/Program Files/Steam/steamapps/common",
    ] {
        let candidate = prefix.join(rel).join(game_name.as_ref()).join("Data");
        if candidate.is_dir() {
            return Some(to_windows_path(&candidate));
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn proton_z_drive_path_uses_backslashes() {
        let path = PathBuf::from("/home/deck/.steam/steam/steamapps/common/Fallout 4/Data");
        let win = proton_z_drive_path(&path);
        assert!(win.starts_with("Z:\\"));
        assert!(win.contains("Fallout 4\\Data\\"));
    }

    #[test]
    fn set_xml_element_text_updates_existing_tag() {
        let xml = "<Config><TargetGame>-1</TargetGame></Config>";
        let out = set_xml_element_text(xml, "TargetGame", "3");
        assert!(out.contains("<TargetGame>3</TargetGame>"));
    }

    #[test]
    fn set_xml_element_text_updates_game_data_paths_entry() {
        let xml = "<GameDataPaths><Fallout4></Fallout4></GameDataPaths>";
        let path = r"C:\Program Files (x86)\Steam\steamapps\common\Fallout 4\Data\";
        let out = set_xml_element_text(xml, "Fallout4", path);
        assert!(out.contains(&format!("<Fallout4>{path}</Fallout4>")));
    }

    #[test]
    fn browse_hint_prefers_c_drive_instructions() {
        let hint = browse_hint_for_path(r"C:\Program Files (x86)\Steam\steamapps\common\Fallout 4\Data\");
        assert!(hint.contains("Program Files"));
        assert!(hint.contains(".steam"));
    }
}

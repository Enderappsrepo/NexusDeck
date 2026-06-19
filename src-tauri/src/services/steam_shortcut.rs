use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::db::{self, LaunchConfig, Profile, SteamShortcutRecord};
use crate::error::{NexusDeckError, Result};
use crate::games::GameRegistry;
use crate::services::steam::find_game_by_app_id;
use crate::services::steam_launch::detect_steam_launch_info;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SteamShortcutInfo {
    pub id: String,
    pub profile_id: String,
    pub config_id: String,
    pub display_name: String,
    pub steam_uri: String,
    pub app_id_generated: Option<i64>,
    pub created_at: i64,
}

pub fn resolve_config(profile_id: &str, config_id: Option<&str>) -> Result<LaunchConfig> {
    if let Some(id) = config_id {
        db::get_launch_config(id)?
            .ok_or_else(|| NexusDeckError::NotFound("Launch config not found".into()))
    } else if let Some(config) = db::get_default_launch_config(profile_id)? {
        Ok(config)
    } else {
        db::seed_default_launch_configs(profile_id, "fallout4")?;
        db::get_default_launch_config(profile_id)?
            .ok_or_else(|| NexusDeckError::NotFound("No launch config available".into()))
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NexusDeckSteamShortcutResult {
    pub display_name: String,
    pub executable: String,
    pub shortcuts_path: String,
    pub app_id_generated: u32,
}

pub fn add_nexusdeck_to_steam(display_name: Option<String>) -> Result<NexusDeckSteamShortcutResult> {
    let steam = crate::services::steam::detect_steam()?
        .ok_or_else(|| NexusDeckError::SteamNotFound("Steam not found".into()))?;

    let exe = std::env::current_exe().map_err(|e| NexusDeckError::Other(e.to_string()))?;
    let exe_str = exe.display().to_string();
    let start_dir = exe
        .parent()
        .map(|p| p.display().to_string())
        .unwrap_or_else(|| exe_str.clone());

    let name = display_name.unwrap_or_else(|| "NexusDeck".to_string());
    let userdata = find_steam_userdata(&steam.steam_path)?;
    let shortcuts_path = userdata.join("config").join("shortcuts.vdf");

    if shortcuts_path.exists() {
        let backup = shortcuts_path.with_extension("vdf.nexusdeck_backup");
        if !backup.exists() {
            std::fs::copy(&shortcuts_path, &backup)?;
        }
    }

    append_shortcut_vdf_text(&shortcuts_path, &name, &exe_str, "", &start_dir)?;
    let app_id = generate_shortcut_app_id(&name, &exe_str);

    Ok(NexusDeckSteamShortcutResult {
        display_name: name,
        executable: exe_str,
        shortcuts_path: shortcuts_path.display().to_string(),
        app_id_generated: app_id,
    })
}

pub fn create_steam_shortcut(
    profile: &Profile,
    config: &LaunchConfig,
    display_name: Option<String>,
) -> Result<SteamShortcutInfo> {
    let plugin = GameRegistry::get(&profile.game_domain)?;
    let app_id = plugin.steam_app_id().unwrap_or(377160);
    let name = display_name.unwrap_or_else(|| format!("{} - {}", profile.name, config.name));

    let steam_info = detect_steam_launch_info(app_id)?;
    let generated_id = generate_shortcut_app_id(&name, &profile.game_path);

    let record = SteamShortcutRecord {
        id: uuid::Uuid::new_v4().to_string(),
        profile_id: profile.id.clone(),
        config_id: config.id.clone(),
        display_name: name.clone(),
        app_id_generated: Some(generated_id as i64),
        created_at: chrono::Utc::now().timestamp(),
    };
    db::save_steam_shortcut(&record)?;

    Ok(SteamShortcutInfo {
        id: record.id,
        profile_id: record.profile_id,
        config_id: record.config_id,
        display_name: record.display_name,
        steam_uri: steam_info.steam_uri,
        app_id_generated: record.app_id_generated,
        created_at: record.created_at,
    })
}

pub fn list_steam_shortcut_infos(profile_id: &str) -> Result<Vec<SteamShortcutInfo>> {
    let profile = db::get_profile(profile_id)?
        .ok_or_else(|| NexusDeckError::NotFound("Profile not found".into()))?;
    let plugin = GameRegistry::get(&profile.game_domain)?;
    let app_id = plugin.steam_app_id().unwrap_or(377160);
    let steam_info = detect_steam_launch_info(app_id).ok();

    Ok(db::list_steam_shortcuts(profile_id)?
        .into_iter()
        .map(|r| SteamShortcutInfo {
            id: r.id,
            profile_id: r.profile_id,
            config_id: r.config_id,
            display_name: r.display_name,
            steam_uri: steam_info
                .as_ref()
                .map(|s| s.steam_uri.clone())
                .unwrap_or_else(|| format!("steam://rungameid/{app_id}")),
            app_id_generated: r.app_id_generated,
            created_at: r.created_at,
        })
        .collect())
}

/// Steam's algorithm for non-Steam app IDs (for metadata tracking).
fn generate_shortcut_app_id(name: &str, exe_path: &str) -> u32 {
    let combined = format!("{name}{exe_path}\0", name = name, exe_path = exe_path);
    let mut crc: u32 = 0;
    for byte in combined.bytes() {
        crc = crc.wrapping_shl(8) ^ byte as u32;
    }
    crc | 0x80000000
}

pub fn write_shortcut_to_steam_vdf(
    profile: &Profile,
    config: &LaunchConfig,
    display_name: &str,
) -> Result<String> {
    let steam = crate::services::steam::detect_steam()?
        .ok_or_else(|| NexusDeckError::SteamNotFound("Steam not found".into()))?;

    let plugin = GameRegistry::get(&profile.game_domain)?;
    let targets = plugin.launch_targets(Path::new(&profile.game_path));
    let exe = if config.use_f4se {
        targets
            .iter()
            .find(|t| t.is_f4se)
            .or_else(|| targets.first())
    } else {
        targets.iter().find(|t| !t.is_f4se).or_else(|| targets.first())
    }
    .ok_or_else(|| NexusDeckError::LaunchFailed("No launch target".into()))?;

    let userdata = find_steam_userdata(&steam.steam_path)?;
    let shortcuts_path = userdata.join("config").join("shortcuts.vdf");

    if shortcuts_path.exists() {
        let backup = shortcuts_path.with_extension("vdf.nexusdeck_backup");
        if !backup.exists() {
            std::fs::copy(&shortcuts_path, &backup)?;
        }
    }

    let args: Vec<String> = serde_json::from_str(&config.args_json).unwrap_or_default();
    let launch_options = args.join(" ");

    append_shortcut_vdf_text(
        &shortcuts_path,
        display_name,
        &exe.executable,
        &launch_options,
        &profile.game_path,
    )?;

    Ok(shortcuts_path.display().to_string())
}

fn find_steam_userdata(steam_path: &str) -> Result<std::path::PathBuf> {
    let userdata = Path::new(steam_path).join("userdata");
    if !userdata.exists() {
        return Err(NexusDeckError::SteamNotFound(
            "Steam userdata folder not found".into(),
        ));
    }
    for entry in std::fs::read_dir(&userdata)? {
        let entry = entry?;
        if entry.file_type()?.is_dir() {
            let config = entry.path().join("config");
            if config.exists() {
                return Ok(entry.path());
            }
        }
    }
    Err(NexusDeckError::SteamNotFound(
        "No Steam user config found".into(),
    ))
}

fn append_shortcut_vdf_text(
    path: &Path,
    name: &str,
    exe: &str,
    launch_options: &str,
    start_dir: &str,
) -> Result<()> {
    let app_id = generate_shortcut_app_id(name, exe);
    let block = format!(
        r#"
"AppName"		"{name}"
"Exe"		"{exe}"
"StartDir"		"{start_dir}"
"LaunchOptions"		"{launch_options}"
"icon"		""
"ShortcutPath"		""
"IsHidden"		"0"
"AllowDesktopConfig"		"1"
"AllowOverlay"		"1"
"OpenVR"		"0"
"Devkit"		"0"
"DevkitGameID"		""
"DevkitOverrideAppID"		"0"
"LastPlayTime"		"0"
"tags"		"{{}}"
"appid"		"{app_id}"
"Playtime"		"0"
"Playtime2wks"		"0"
"SortAs"		""
"UseLaunchOptions"		"1"
"LastUpdated"		"0"
"FlatpakAppID"		""
"GameID"		"{app_id}"
"#,
        name = name.replace('"', "\\\""),
        exe = exe.replace('"', "\\\""),
        start_dir = start_dir.replace('"', "\\\""),
        launch_options = launch_options.replace('"', "\\\""),
        app_id = app_id,
    );

    if path.exists() {
        let mut existing = std::fs::read_to_string(path).unwrap_or_default();
        if !existing.contains("\"AppName\"") {
            existing = "\"Shortcuts\"\n{\n".to_string();
        }
        if existing.ends_with("\n}") {
            existing = existing.trim_end_matches("\n}").to_string();
            existing.push_str(&block);
            existing.push_str("\n}\n");
        } else {
            existing.push_str(&block);
            if !existing.contains("\"Shortcuts\"") {
                existing = format!("\"Shortcuts\"\n{{\n{existing}\n}}\n");
            }
        }
        std::fs::write(path, existing)?;
    } else {
        std::fs::create_dir_all(path.parent().unwrap())?;
        std::fs::write(
            path,
            format!("\"Shortcuts\"\n{{\n{block}\n}}\n"),
        )?;
    }
    Ok(())
}

pub fn resolve_library_path(profile: &Profile, app_id: u32) -> Option<String> {
    if let Ok(candidates) = find_game_by_app_id(app_id) {
        for c in &candidates {
            if c.install_path == profile.game_path || profile.game_path.starts_with(&c.library_path)
            {
                return Some(c.library_path.clone());
            }
        }
        return candidates.first().map(|c| c.library_path.clone());
    }
    None
}

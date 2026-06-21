use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::db::{self, Profile};
use crate::error::{NexusDeckError, Result};
use crate::games::GameRegistry;

#[derive(Debug, Deserialize)]
struct SkyrimPresetEntry {
    id: String,
    label: String,
    description: String,
    values: HashMap<String, String>,
}

#[derive(Debug, Deserialize)]
struct SkyrimPresetsFile {
    presets: Vec<SkyrimPresetEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GameSettingDefinition {
    pub id: String,
    pub label: String,
    pub description: String,
    pub file_kind: String,
    pub section: String,
    pub key: String,
    pub kind: String,
    pub category: String,
    pub options: Option<Vec<GameSettingOption>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub range: Option<GameSettingRange>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GameSettingOption {
    pub value: String,
    pub label: String,
}

/// Bounds for a numeric setting rendered as a slider. Server-owned so the UI
/// stays a dumb renderer and the valid range lives next to the INI key.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GameSettingRange {
    pub min: f64,
    pub max: f64,
    pub step: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub unit: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GameSettingsPreset {
    pub id: String,
    pub label: String,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GameSettingsSchema {
    pub config_dir: String,
    pub settings: Vec<GameSettingDefinition>,
    pub presets: Vec<GameSettingsPreset>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GameSettingsValues {
    pub config_dir: String,
    pub values: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApplyGameSettingsResult {
    pub config_dir: String,
    pub backup_dir: String,
    pub applied: Vec<String>,
}

pub fn get_game_settings_schema(profile_id: &str) -> Result<GameSettingsSchema> {
    let profile = load_profile(profile_id)?;
    let config_dir = resolve_my_games_dir(&profile)?;
    Ok(GameSettingsSchema {
        config_dir: config_dir.display().to_string(),
        settings: setting_definitions(),
        presets: preset_definitions(&profile.game_domain),
    })
}

pub fn get_game_settings_values(profile_id: &str) -> Result<GameSettingsValues> {
    let profile = load_profile(profile_id)?;
    let config_dir = resolve_my_games_dir(&profile)?;
    let prefix = ini_prefix(&profile.game_domain)?;

    let mut values = HashMap::new();
    for def in setting_definitions() {
        if def.id == "display_mode" {
            values.insert(
                def.id.clone(),
                read_display_mode(&config_dir, prefix, &def)?,
            );
            continue;
        }
        let path = ini_path(&config_dir, prefix, &def.file_kind);
        let value = read_ini_value(&path, &def.section, &def.key).unwrap_or_default();
        values.insert(def.id.clone(), value);
    }

    Ok(GameSettingsValues {
        config_dir: config_dir.display().to_string(),
        values,
    })
}

pub fn apply_game_settings(
    profile_id: &str,
    changes: HashMap<String, String>,
) -> Result<ApplyGameSettingsResult> {
    let profile = load_profile(profile_id)?;
    let config_dir = resolve_my_games_dir(&profile)?;
    let prefix = ini_prefix(&profile.game_domain)?;
    let backup_dir = backup_config_dir(&config_dir, prefix)?;

    let mut applied = Vec::new();
    if let Some(mode) = changes.get("display_mode") {
        apply_display_mode(&config_dir, prefix, mode)?;
        applied.push("display_mode".to_string());
    }

    for def in setting_definitions() {
        if def.id == "display_mode" {
            continue;
        }
        let Some(value) = changes.get(&def.id) else {
            continue;
        };
        let path = ini_path(&config_dir, prefix, &def.file_kind);
        write_ini_value(&path, &def.section, &def.key, value)?;
        applied.push(def.id.clone());
    }

    Ok(ApplyGameSettingsResult {
        config_dir: config_dir.display().to_string(),
        backup_dir: backup_dir.display().to_string(),
        applied,
    })
}

pub fn apply_game_settings_preset(profile_id: &str, preset_id: &str) -> Result<ApplyGameSettingsResult> {
    let profile = load_profile(profile_id)?;
    let values = preset_values(&profile.game_domain, preset_id)?;
    apply_game_settings(profile_id, values)
}

/// Creation Engine titles ignore loose-file assets (textures, meshes, loose
/// scripts) unless archive invalidation is enabled in `<Game>Custom.ini`.
/// NexusDeck deploys loose files straight into `Data/`, so without this the
/// mods install successfully but never load in-game. We set it automatically.
///
/// Returns `Ok(true)` when the keys were written, `Ok(false)` when not
/// applicable — a non-Creation-Engine game, or a Proton prefix that does not
/// exist yet (it is re-applied on the next install once the prefix is created).
pub fn ensure_archive_invalidation(profile: &Profile) -> Result<bool> {
    // Only Creation Engine games use the [Archive] invalidation mechanism.
    let Ok(prefix) = ini_prefix(&profile.game_domain) else {
        return Ok(false);
    };

    // On Linux the INI lives inside the Proton prefix. If the game has never
    // been launched the prefix won't exist yet — skip rather than fabricate a
    // partial prefix; this runs again on the next install.
    #[cfg(not(target_os = "windows"))]
    {
        match profile.proton_prefix_path.as_deref() {
            Some(p) if Path::new(p).exists() => {}
            _ => return Ok(false),
        }
    }

    let config_dir = resolve_my_games_dir(profile)?;
    let path = ini_path(&config_dir, prefix, "custom");
    write_ini_value(&path, "Archive", "bInvalidateOlderFiles", "1")?;
    write_ini_value(&path, "Archive", "sResourceDataDirsFinal", "")?;
    Ok(true)
}

pub fn is_archive_invalidation_enabled(profile: &Profile) -> Result<bool> {
    let Ok(prefix) = ini_prefix(&profile.game_domain) else {
        return Ok(true);
    };

    #[cfg(not(target_os = "windows"))]
    {
        match profile.proton_prefix_path.as_deref() {
            Some(p) if Path::new(p).exists() => {}
            _ => return Ok(true),
        }
    }

    let config_dir = resolve_my_games_dir(profile)?;
    let path = ini_path(&config_dir, prefix, "custom");
    let invalidate = read_ini_value(&path, "Archive", "bInvalidateOlderFiles")
        .unwrap_or_else(|| "0".into());
    Ok(invalidate == "1")
}

fn load_profile(profile_id: &str) -> Result<Profile> {
    db::get_profile(profile_id)?
        .ok_or_else(|| NexusDeckError::NotFound("Profile not found".into()))
}

pub fn resolve_my_games_dir(profile: &Profile) -> Result<PathBuf> {
    let folder = GameRegistry::get(&profile.game_domain)?
        .my_games_folder()
        .map(str::to_string)
        .ok_or_else(|| {
            NexusDeckError::Other("Game settings are not supported for this title yet.".into())
        })?;

    let dir = if cfg!(target_os = "windows") {
        dirs::document_dir()
            .map(|d| d.join("My Games").join(&folder))
            .ok_or_else(|| NexusDeckError::Other("Could not locate Documents folder".into()))?
    } else if let Some(ref prefix) = profile.proton_prefix_path {
        PathBuf::from(prefix)
            .join("drive_c")
            .join("users")
            .join("steamuser")
            .join("Documents")
            .join("My Games")
            .join(folder)
    } else {
        return Err(NexusDeckError::Other(
            "Proton prefix not configured. Set it in game setup to edit INI settings on Linux."
                .into(),
        ));
    };

    if !dir.exists() {
        fs::create_dir_all(&dir)?;
    }
    Ok(dir)
}

fn ini_prefix(domain: &str) -> Result<&'static str> {
    match domain {
        "fallout4" => Ok("Fallout4"),
        "skyrimspecialedition" => Ok("Skyrim"),
        "skyrim" => Ok("Skyrim"),
        "falloutnv" => Ok("Fallout"),
        "fallout3" => Ok("Fallout"),
        "starfield" => Ok("Starfield"),
        "oblivion" => Ok("Oblivion"),
        other => Err(NexusDeckError::Other(format!(
            "INI settings not configured for {other}"
        ))),
    }
}

fn ini_path(config_dir: &Path, prefix: &str, file_kind: &str) -> PathBuf {
    let suffix = match file_kind {
        "custom" => "Custom.ini",
        _ => "Prefs.ini",
    };
    config_dir.join(format!("{prefix}{suffix}"))
}

fn setting_definitions() -> Vec<GameSettingDefinition> {
    vec![
        GameSettingDefinition {
            id: "display_mode".into(),
            label: "Display mode".into(),
            description: "Fullscreen, borderless, or windowed.".into(),
            file_kind: "prefs".into(),
            section: "Display".into(),
            key: "display_mode".into(),
            kind: "choice".into(),
            category: "display".into(),
            options: Some(vec![
                GameSettingOption {
                    value: "fullscreen".into(),
                    label: "Fullscreen".into(),
                },
                GameSettingOption {
                    value: "borderless".into(),
                    label: "Borderless".into(),
                },
                GameSettingOption {
                    value: "windowed".into(),
                    label: "Windowed".into(),
                },
            ]),
            range: None,
        },
        GameSettingDefinition {
            id: "width".into(),
            label: "Resolution width".into(),
            description: "Horizontal resolution in pixels.".into(),
            file_kind: "prefs".into(),
            section: "Display".into(),
            key: "iSize W".into(),
            kind: "int".into(),
            category: "display".into(),
            options: None,
            range: None,
        },
        GameSettingDefinition {
            id: "height".into(),
            label: "Resolution height".into(),
            description: "Vertical resolution in pixels.".into(),
            file_kind: "prefs".into(),
            section: "Display".into(),
            key: "iSize H".into(),
            kind: "int".into(),
            category: "display".into(),
            options: None,
            range: None,
        },
        GameSettingDefinition {
            id: "godrays".into(),
            label: "God rays".into(),
            description: "Volumetric lighting (expensive on Deck).".into(),
            file_kind: "custom".into(),
            section: "VolumetricLighting".into(),
            key: "bVolumetricLightingEnabled".into(),
            kind: "bool".into(),
            category: "graphics".into(),
            options: None,
            range: None,
        },
        GameSettingDefinition {
            id: "depth_of_field".into(),
            label: "Depth of field".into(),
            description: "Screen blur outside the focal plane.".into(),
            file_kind: "custom".into(),
            section: "ImageSpace".into(),
            key: "bDoDepthOfField".into(),
            kind: "bool".into(),
            category: "graphics".into(),
            options: None,
            range: None,
        },
        GameSettingDefinition {
            id: "motion_blur".into(),
            label: "Motion blur".into(),
            description: "Camera motion blur effect.".into(),
            file_kind: "custom".into(),
            section: "ImageSpace".into(),
            key: "bMotionBlur".into(),
            kind: "bool".into(),
            category: "graphics".into(),
            options: None,
            range: None,
        },
        GameSettingDefinition {
            id: "shadow_distance".into(),
            label: "Shadow distance".into(),
            description: "Higher values draw shadows farther away.".into(),
            file_kind: "custom".into(),
            section: "Display".into(),
            key: "fShadowDistance".into(),
            kind: "float".into(),
            category: "performance".into(),
            options: None,
            range: Some(GameSettingRange {
                min: 0.0,
                max: 16000.0,
                step: 500.0,
                unit: None,
            }),
        },
        GameSettingDefinition {
            id: "shadow_map".into(),
            label: "Shadow map resolution".into(),
            description: "Shadow quality; lower is faster.".into(),
            file_kind: "custom".into(),
            section: "Display".into(),
            key: "iShadowMapResolution".into(),
            kind: "int".into(),
            category: "performance".into(),
            options: None,
            range: Some(GameSettingRange {
                min: 512.0,
                max: 4096.0,
                step: 512.0,
                unit: Some("px".into()),
            }),
        },
        GameSettingDefinition {
            id: "anisotropy".into(),
            label: "Anisotropic filtering".into(),
            description: "Texture filtering at grazing angles.".into(),
            file_kind: "custom".into(),
            section: "Display".into(),
            key: "iMaxAnisotropy".into(),
            kind: "int".into(),
            category: "performance".into(),
            options: None,
            range: Some(GameSettingRange {
                min: 0.0,
                max: 16.0,
                step: 2.0,
                unit: Some("x".into()),
            }),
        },
    ]
}

fn preset_definitions(game_domain: &str) -> Vec<GameSettingsPreset> {
    if game_domain == "skyrimspecialedition" {
        if let Ok(file) = serde_json::from_str::<SkyrimPresetsFile>(include_str!(
            "../games/rules/skyrimspecialedition_ini_presets.json"
        )) {
            return file
                .presets
                .into_iter()
                .map(|p| GameSettingsPreset {
                    id: p.id,
                    label: p.label,
                    description: p.description,
                })
                .collect();
        }
    }

    vec![
        GameSettingsPreset {
            id: "deck".into(),
            label: "Steam Deck".into(),
            description: "1280×800 borderless, lighter shadows, god rays off.".into(),
        },
        GameSettingsPreset {
            id: "performance".into(),
            label: "Performance".into(),
            description: "1080p windowed with low shadow and post-processing load.".into(),
        },
        GameSettingsPreset {
            id: "balanced".into(),
            label: "Balanced".into(),
            description: "1080p borderless with medium shadows.".into(),
        },
        GameSettingsPreset {
            id: "quality".into(),
            label: "Quality".into(),
            description: "1440p borderless with higher shadow and filtering settings.".into(),
        },
    ]
}

fn preset_values(game_domain: &str, preset_id: &str) -> Result<HashMap<String, String>> {
    if game_domain == "skyrimspecialedition" {
        if let Ok(file) = serde_json::from_str::<SkyrimPresetsFile>(include_str!(
            "../games/rules/skyrimspecialedition_ini_presets.json"
        )) {
            if let Some(preset) = file.presets.into_iter().find(|p| p.id == preset_id) {
                return Ok(preset.values);
            }
        }
    }

    let map = match preset_id {
        "deck" => HashMap::from([
            ("display_mode".into(), "borderless".into()),
            ("width".into(), "1280".into()),
            ("height".into(), "800".into()),
            ("godrays".into(), "0".into()),
            ("depth_of_field".into(), "0".into()),
            ("motion_blur".into(), "0".into()),
            ("shadow_distance".into(), "3000.0000".into()),
            ("shadow_map".into(), "512".into()),
            ("anisotropy".into(), "4".into()),
        ]),
        "performance" => HashMap::from([
            ("display_mode".into(), "windowed".into()),
            ("width".into(), "1920".into()),
            ("height".into(), "1080".into()),
            ("godrays".into(), "0".into()),
            ("depth_of_field".into(), "0".into()),
            ("motion_blur".into(), "0".into()),
            ("shadow_distance".into(), "2000.0000".into()),
            ("shadow_map".into(), "512".into()),
            ("anisotropy".into(), "4".into()),
        ]),
        "balanced" => HashMap::from([
            ("display_mode".into(), "borderless".into()),
            ("width".into(), "1920".into()),
            ("height".into(), "1080".into()),
            ("godrays".into(), "1".into()),
            ("depth_of_field".into(), "1".into()),
            ("motion_blur".into(), "0".into()),
            ("shadow_distance".into(), "6000.0000".into()),
            ("shadow_map".into(), "1024".into()),
            ("anisotropy".into(), "8".into()),
        ]),
        "quality" => HashMap::from([
            ("display_mode".into(), "borderless".into()),
            ("width".into(), "2560".into()),
            ("height".into(), "1440".into()),
            ("godrays".into(), "1".into()),
            ("depth_of_field".into(), "1".into()),
            ("motion_blur".into(), "1".into()),
            ("shadow_distance".into(), "15000.0000".into()),
            ("shadow_map".into(), "2048".into()),
            ("anisotropy".into(), "16".into()),
        ]),
        other => {
            return Err(NexusDeckError::Other(format!("Unknown preset: {other}")));
        }
    };
    Ok(map)
}

fn read_display_mode(config_dir: &Path, prefix: &str, def: &GameSettingDefinition) -> Result<String> {
    let path = ini_path(config_dir, prefix, &def.file_kind);
    let fullscreen = read_ini_value(&path, &def.section, "bFull Screen").unwrap_or_else(|| "1".into());
    let borderless = read_ini_value(&path, &def.section, "bBorderless").unwrap_or_else(|| "0".into());
    Ok(if fullscreen == "1" {
        "fullscreen".into()
    } else if borderless == "1" {
        "borderless".into()
    } else {
        "windowed".into()
    })
}

fn apply_display_mode(config_dir: &Path, prefix: &str, mode: &str) -> Result<()> {
    let path = ini_path(config_dir, prefix, "prefs");
    let (fullscreen, borderless) = match mode {
        "fullscreen" => ("1", "0"),
        "borderless" => ("0", "1"),
        _ => ("0", "0"),
    };
    write_ini_value(&path, "Display", "bFull Screen", fullscreen)?;
    write_ini_value(&path, "Display", "bBorderless", borderless)?;
    Ok(())
}

fn backup_config_dir(config_dir: &Path, prefix: &str) -> Result<PathBuf> {
    let stamp = chrono::Utc::now().timestamp();
    let backup_dir = config_dir.join(format!(".nexusdeck_backup_{stamp}"));
    fs::create_dir_all(&backup_dir)?;
    for suffix in ["Prefs.ini", "Custom.ini"] {
        let src = config_dir.join(format!("{prefix}{suffix}"));
        if src.exists() {
            fs::copy(&src, backup_dir.join(format!("{prefix}{suffix}")))?;
        }
    }
    Ok(backup_dir)
}

fn read_ini_value(path: &Path, section: &str, key: &str) -> Option<String> {
    let content = fs::read_to_string(path).ok()?;
    parse_ini_value(&content, section, key)
}

fn parse_ini_value(content: &str, section: &str, key: &str) -> Option<String> {
    let mut current = String::new();
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with('[') && trimmed.ends_with(']') {
            current = trimmed[1..trimmed.len() - 1].trim().to_string();
            continue;
        }
        if current != section {
            continue;
        }
        if trimmed.starts_with(';') || trimmed.is_empty() {
            continue;
        }
        let (k, v) = trimmed.split_once('=')?;
        if k.trim() == key {
            return Some(v.trim().to_string());
        }
    }
    None
}

fn write_ini_value(path: &Path, section: &str, key: &str, value: &str) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }

    let mut lines: Vec<String> = if path.exists() {
        fs::read_to_string(path)?
            .lines()
            .map(str::to_string)
            .collect()
    } else {
        Vec::new()
    };

    let section_header = format!("[{section}]");
    let new_line = format!("{key}={value}");

    let mut section_start: Option<usize> = None;
    let mut section_end = lines.len();
    let mut replaced = false;

    for (idx, line) in lines.iter().enumerate() {
        let trimmed = line.trim();
        if trimmed.starts_with('[') && trimmed.ends_with(']') {
            if section_start.is_some() && section_end == lines.len() {
                section_end = idx;
            }
            if trimmed == section_header {
                section_start = Some(idx);
                section_end = lines.len();
            }
        }
    }

    if let Some(start) = section_start {
        for idx in start + 1..section_end {
            let trimmed = lines[idx].trim();
            if trimmed.starts_with('[') {
                break;
            }
            if let Some((k, _)) = trimmed.split_once('=') {
                if k.trim() == key {
                    lines[idx] = new_line.clone();
                    replaced = true;
                    break;
                }
            }
        }
        if !replaced {
            lines.insert(start + 1, new_line);
        }
    } else {
        if !lines.is_empty() && !lines.last().map(|l| l.is_empty()).unwrap_or(false) {
            lines.push(String::new());
        }
        lines.push(section_header);
        lines.push(new_line);
    }

    fs::write(path, lines.join("\n"))?;
    Ok(())
}

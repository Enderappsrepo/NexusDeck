use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::db::{self, LaunchConfig, Profile, SteamShortcutRecord};
use crate::error::{NexusDeckError, Result};
use crate::games::GameRegistry;
use crate::services::platform;
use crate::services::host_shell::run_host_bash;
use crate::services::shortcuts_vdf::{self, ShortcutUpsert};
use crate::services::steam_input_install::{self, SteamInputInstallResult};
use crate::services::steam::find_game_by_app_id;
use crate::services::steam_launch::detect_steam_launch_info;

const NEXUSDECK_APP_ID: &str = "com.nexusdeck.app";
const FLATPAK_BIN: &str = "/usr/bin/flatpak";

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

#[derive(Debug, Clone)]
struct NexusDeckLaunchSpec {
    exe: String,
    launch_options: String,
    start_dir: String,
    launch_method: String,
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
    pub launch_options: String,
    pub shortcuts_path: String,
    pub app_id_generated: u32,
    pub already_existed: bool,
    pub launch_method: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub steam_input: Option<SteamInputInstallResult>,
}

pub fn add_nexusdeck_to_steam(display_name: Option<String>) -> Result<NexusDeckSteamShortcutResult> {
    let name = display_name.unwrap_or_else(|| "NexusDeck".to_string());
    let spec = resolve_nexusdeck_launch_spec()?;
    let shortcuts_path = resolve_steam_shortcuts_path()?;

    if shortcut_exists_on_host(&shortcuts_path, &spec.exe, &name, &spec.launch_options)? {
        let app_id = shortcuts_vdf::generate_shortcut_app_id(&name, &spec.exe);
        let steam_input = steam_input_install::install_nexusdeck_steam_input(&name, app_id).ok();
        return Ok(NexusDeckSteamShortcutResult {
            display_name: name,
            executable: spec.exe,
            launch_options: spec.launch_options,
            shortcuts_path: shortcuts_path.display().to_string(),
            app_id_generated: app_id,
            already_existed: true,
            launch_method: spec.launch_method,
            steam_input,
        });
    }

    append_shortcut_on_host(
        &shortcuts_path,
        &name,
        &spec.exe,
        &spec.launch_options,
        &spec.start_dir,
    )?;
    let app_id = shortcuts_vdf::generate_shortcut_app_id(&name, &spec.exe);
    let steam_input = steam_input_install::install_nexusdeck_steam_input(&name, app_id).ok();

    Ok(NexusDeckSteamShortcutResult {
        display_name: name,
        executable: spec.exe,
        launch_options: spec.launch_options,
        shortcuts_path: shortcuts_path.display().to_string(),
        app_id_generated: app_id,
        already_existed: false,
        launch_method: spec.launch_method,
        steam_input,
    })
}

pub fn install_nexusdeck_steam_input_layout(
    display_name: Option<String>,
) -> Result<SteamInputInstallResult> {
    let name = display_name.unwrap_or_else(|| "NexusDeck".to_string());
    let spec = resolve_nexusdeck_launch_spec()?;
    let app_id = shortcuts_vdf::generate_shortcut_app_id(&name, &spec.exe);
    steam_input_install::install_nexusdeck_steam_input(&name, app_id)
}

fn running_as_flatpak() -> bool {
    platform::is_flatpak_sandbox()
        || std::env::current_exe()
            .map(|p| p.starts_with("/app"))
            .unwrap_or(false)
}

fn resolve_nexusdeck_launch_spec() -> Result<NexusDeckLaunchSpec> {
    let home = home_dir().ok_or_else(|| NexusDeckError::Other("HOME not set".into()))?;

    if running_as_flatpak() || which::which("flatpak").is_ok() {
        // Match the install script and Steam Deck community guidance: flatpak as exe,
        // run com.nexusdeck.app as launch options. Works from native and Flatpak Steam.
        return Ok(NexusDeckLaunchSpec {
            exe: resolve_flatpak_bin(),
            launch_options: format!("run {NEXUSDECK_APP_ID}"),
            start_dir: home,
            launch_method: "flatpak".to_string(),
        });
    }

    let exe = std::env::current_exe()
        .map_err(|e| NexusDeckError::Other(e.to_string()))?
        .display()
        .to_string();
    let start_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.display().to_string()))
        .unwrap_or_else(|| home.clone());

    Ok(NexusDeckLaunchSpec {
        exe,
        launch_options: String::new(),
        start_dir,
        launch_method: "native".to_string(),
    })
}

fn resolve_flatpak_bin() -> String {
    if Path::new(FLATPAK_BIN).is_file() {
        return FLATPAK_BIN.to_string();
    }
    which::which("flatpak")
        .ok()
        .map(|p| p.display().to_string())
        .unwrap_or_else(|| "flatpak".to_string())
}

fn resolve_steam_shortcuts_path() -> Result<PathBuf> {
    let script = r#"
for root in \
  "$HOME/.steam/steam" \
  "$HOME/.local/share/Steam" \
  "$HOME/.var/app/com.valvesoftware.Steam/data/Steam"; do
  ud="$root/userdata"
  [ -d "$ud" ] || continue
  for entry in "$ud"/*; do
    [ -d "$entry/config" ] || continue
    echo "$entry/config/shortcuts.vdf"
    exit 0
  done
done
exit 1
"#;
    let output = run_host_bash(script)?;
    if !output.status.success() {
        return Err(NexusDeckError::SteamNotFound(
            "Steam userdata folder not found. Launch Steam once while signed in, then try again."
                .into(),
        ));
    }
    let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if path.is_empty() {
        return Err(NexusDeckError::SteamNotFound(
            "Steam shortcuts.vdf path not found".into(),
        ));
    }
    Ok(PathBuf::from(path))
}

fn shortcut_exists_on_host(
    path: &Path,
    exe: &str,
    name: &str,
    launch_options: &str,
) -> Result<bool> {
    if !path.is_file() && !shortcuts_vdf::host_file_exists(path).unwrap_or(false) {
        return Ok(false);
    }
    let upsert = ShortcutUpsert {
        app_name: name.to_string(),
        exe: exe.to_string(),
        start_dir: String::new(),
        launch_options: launch_options.to_string(),
    };
    match shortcuts_vdf::load_shortcuts(path) {
        Ok(entries) => Ok(shortcuts_vdf::shortcut_exists(&entries, &upsert)),
        Err(_) => {
            // Legacy text format — fall back to grep for existence check only.
            let path_s = shell_escape(path.display().to_string());
            let exe_s = shell_escape(exe.to_string());
            let name_s = shell_escape(name.to_string());
            let opts_s = shell_escape(launch_options.to_string());
            let script = format!(
                r#"p={path_s}
if [ ! -f "$p" ]; then exit 1; fi
grep -Fq "\"Exe\"\t\t\"{exe_s}\"" "$p" && exit 0
grep -Fq "\"AppName\"\t\t\"{name_s}\"" "$p" && exit 0
grep -Fq "com.nexusdeck.app" "$p" && exit 0
grep -Fq "{opts_s}" "$p" && exit 0
exit 1"#
            );
            Ok(run_host_bash(&script)?.status.success())
        }
    }
}

fn append_shortcut_on_host(
    path: &Path,
    name: &str,
    exe: &str,
    launch_options: &str,
    start_dir: &str,
) -> Result<()> {
    let upsert = ShortcutUpsert {
        app_name: name.to_string(),
        exe: exe.to_string(),
        start_dir: start_dir.to_string(),
        launch_options: launch_options.to_string(),
    };
    shortcuts_vdf::upsert_shortcut(path, &upsert).map(|_| ())
}

fn shell_escape(value: String) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}

fn home_dir() -> Option<String> {
    if let Ok(home) = std::env::var("HOME") {
        if !home.is_empty() {
            return Some(home);
        }
    }
    dirs::home_dir().map(|p| p.display().to_string())
}

fn steam_is_flatpak(steam_path: Option<&str>) -> bool {
    let Some(path) = steam_path else {
        return host_steam_is_flatpak();
    };
    path.contains("com.valvesoftware.Steam") || path.contains(".var/app/com.valvesoftware.Steam")
}

fn host_steam_is_flatpak() -> bool {
    if !platform::is_flatpak_sandbox() {
        return false;
    }
    run_host_bash("[ -d \"$HOME/.var/app/com.valvesoftware.Steam\" ] && echo yes")
        .map(|o| o.status.success() && String::from_utf8_lossy(&o.stdout).contains("yes"))
        .unwrap_or(false)
}

fn resolve_steam_userdata(steam_path: Option<&str>) -> Result<PathBuf> {
    if let Some(path) = steam_path {
        if let Ok(userdata) = find_steam_userdata(path) {
            return Ok(userdata);
        }
    }

    if let Some(steam) = crate::services::steam::detect_steam()? {
        if let Ok(userdata) = find_steam_userdata(&steam.steam_path) {
            return Ok(userdata);
        }
    }

    find_steam_userdata_host()
}

fn find_steam_userdata_host() -> Result<PathBuf> {
    let script = r#"
for root in "$HOME/.steam/steam" "$HOME/.local/share/Steam"; do
  ud="$root/userdata"
  [ -d "$ud" ] || continue
  for entry in "$ud"/*; do
    [ -d "$entry/config" ] || continue
    echo "$entry"
    exit 0
  done
done
exit 1
"#;
    let output = run_host_bash(script)?;
    if !output.status.success() {
        return Err(NexusDeckError::SteamNotFound(
            "Steam userdata folder not found. Launch Steam once while signed in, then try again."
                .into(),
        ));
    }
    let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if path.is_empty() {
        return Err(NexusDeckError::SteamNotFound(
            "Steam userdata folder not found".into(),
        ));
    }
    Ok(PathBuf::from(path))
}

fn shortcut_exists(path: &Path, exe: &str, name: &str) -> bool {
    let Ok(existing) = std::fs::read_to_string(path) else {
        return false;
    };
    existing.contains(&format!("\"Exe\"\t\t\"{exe}\""))
        || existing.contains(&format!("\"AppName\"\t\t\"{name}\""))
}

/// True when the Steam client is running on the host (native or Flatpak).
pub fn is_steam_client_running() -> Result<bool> {
    if cfg!(target_os = "windows") {
        return Ok(false);
    }
    let script = r#"
if pgrep -x steam >/dev/null 2>&1; then exit 0; fi
if pgrep -f '[s]team.sh' >/dev/null 2>&1; then exit 0; fi
if pgrep -f 'com.valvesoftware.Steam' >/dev/null 2>&1; then exit 0; fi
if command -v flatpak >/dev/null 2>&1 && flatpak ps 2>/dev/null | grep -q com.valvesoftware.Steam; then exit 0; fi
exit 1
"#;
    Ok(run_host_bash(script)?.status.success())
}

/// Ask Steam to shut down gracefully (works for native and Flatpak Steam on Deck).
pub fn request_steam_shutdown() -> Result<()> {
    if cfg!(target_os = "windows") {
        return Ok(());
    }
    let script = r#"
if command -v flatpak >/dev/null 2>&1 && flatpak info com.valvesoftware.Steam >/dev/null 2>&1; then
  flatpak run com.valvesoftware.Steam -shutdown >/dev/null 2>&1 || true
fi
if command -v steam >/dev/null 2>&1; then
  steam -shutdown >/dev/null 2>&1 || true
fi
exit 0
"#;
    let _ = run_host_bash(script)?;
    Ok(())
}

/// Wait until Steam exits, then write the NexusDeck shortcut.
pub async fn add_nexusdeck_to_steam_when_ready(
    display_name: Option<String>,
    timeout_secs: u64,
) -> Result<NexusDeckSteamShortcutResult> {
    let deadline =
        std::time::Instant::now() + std::time::Duration::from_secs(timeout_secs.max(10));
    while is_steam_client_running()? {
        if std::time::Instant::now() >= deadline {
            return Err(NexusDeckError::Other(
                "Steam is still running. Use the Steam menu → Exit (or Power → Exit on Deck), then try again.".into(),
            ));
        }
        tokio::time::sleep(std::time::Duration::from_millis(1500)).await;
    }
    add_nexusdeck_to_steam(display_name)
}

pub fn create_steam_shortcut(
    profile: &Profile,
    config: &LaunchConfig,
    display_name: Option<String>,
) -> Result<SteamShortcutInfo> {
    let plugin = GameRegistry::get(&profile.game_domain)?;
    let app_id = plugin.steam_app_id().unwrap_or(377160);
    let name = display_name.unwrap_or_else(|| format!("{} - {}", profile.name, config.name));

    let exe_path = resolve_launch_executable(profile, config)?;
    let generated_id = shortcuts_vdf::generate_shortcut_app_id(&name, &exe_path);

    let steam_info = detect_steam_launch_info(app_id)?;

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

fn resolve_launch_executable(profile: &Profile, config: &LaunchConfig) -> Result<String> {
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
    Ok(exe.executable.clone())
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

pub fn write_shortcut_to_steam_vdf(
    profile: &Profile,
    config: &LaunchConfig,
    display_name: &str,
) -> Result<String> {
    let _steam = crate::services::steam::detect_steam()?
        .ok_or_else(|| NexusDeckError::SteamNotFound("Steam not found".into()))?;

    let exe_path = resolve_launch_executable(profile, config)?;
    let userdata = resolve_steam_shortcuts_path()?;
    let args: Vec<String> = serde_json::from_str(&config.args_json).unwrap_or_default();
    let launch_options = args.join(" ");

    append_shortcut_on_host(
        &userdata,
        display_name,
        &exe_path,
        &launch_options,
        &profile.game_path,
    )?;

    Ok(userdata.display().to_string())
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

/// Remove NexusDeck entries from the host Steam `shortcuts.vdf` (Flatpak or native Steam).
pub fn remove_nexusdeck_from_steam_library() -> Result<bool> {
    if cfg!(target_os = "windows") {
        return Ok(false);
    }

    let path = match resolve_steam_shortcuts_path() {
        Ok(p) => p,
        Err(_) => return Ok(false),
    };

    let needles = [
        "NexusDeck",
        "com.nexusdeck.app",
        "nexusdeck-launch.sh",
        "NexusDeck.AppImage",
        ".local/share/nexusdeck",
    ];
    shortcuts_vdf::remove_shortcuts_matching(&path, &needles)
}

/// Repair corrupted Steam shortcuts (text format / parse errors) via backup restore.
pub fn repair_steam_shortcuts() -> Result<crate::services::protontricks_health::ProtontricksFixResult> {
    crate::services::protontricks_health::fix_protontricks_shortcuts(None)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn flatpak_launch_spec_uses_flatpak_binary() {
        let spec = resolve_nexusdeck_launch_spec().unwrap();
        if which::which("flatpak").is_ok() || running_as_flatpak() {
            assert!(spec.exe.contains("flatpak"));
            assert!(spec.launch_options.contains("com.nexusdeck.app"));
            assert!(!spec.exe.contains("/app/bin"));
        }
    }
}

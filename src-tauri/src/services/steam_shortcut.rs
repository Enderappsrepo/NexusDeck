use std::path::{Path, PathBuf};
use std::process::Command;

use serde::{Deserialize, Serialize};

use crate::db::{self, LaunchConfig, Profile, SteamShortcutRecord};
use crate::error::{NexusDeckError, Result};
use crate::games::GameRegistry;
use crate::services::platform;
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
}

pub fn add_nexusdeck_to_steam(display_name: Option<String>) -> Result<NexusDeckSteamShortcutResult> {
    let name = display_name.unwrap_or_else(|| "NexusDeck".to_string());
    let spec = resolve_nexusdeck_launch_spec()?;
    let shortcuts_path = resolve_steam_shortcuts_path()?;

    if shortcut_exists_on_host(&shortcuts_path, &spec.exe, &name, &spec.launch_options)? {
        let app_id = generate_shortcut_app_id(&name, &spec.exe);
        return Ok(NexusDeckSteamShortcutResult {
            display_name: name,
            executable: spec.exe,
            launch_options: spec.launch_options,
            shortcuts_path: shortcuts_path.display().to_string(),
            app_id_generated: app_id,
            already_existed: true,
            launch_method: spec.launch_method,
        });
    }

    append_shortcut_on_host(
        &shortcuts_path,
        &name,
        &spec.exe,
        &spec.launch_options,
        &spec.start_dir,
    )?;
    let app_id = generate_shortcut_app_id(&name, &spec.exe);

    Ok(NexusDeckSteamShortcutResult {
        display_name: name,
        executable: spec.exe,
        launch_options: spec.launch_options,
        shortcuts_path: shortcuts_path.display().to_string(),
        app_id_generated: app_id,
        already_existed: false,
        launch_method: spec.launch_method,
    })
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
    let output = run_host_bash(&script)?;
    Ok(output.status.success())
}

fn append_shortcut_on_host(
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

    let path_s = shell_escape(path.display().to_string());
    let exe_s = shell_escape(exe.to_string());
    let block_b64 = base64_encode(block.as_bytes());
    let script = format!(
        r#"set -e
python3 - <<'PY'
import base64, pathlib, sys
path = pathlib.Path({path_s})
exe = {exe_s}
block = base64.b64decode("{block_b64}").decode("utf-8")
backup = path.parent / (path.name + ".nexusdeck_backup")
path.parent.mkdir(parents=True, exist_ok=True)
if path.is_file() and not backup.is_file():
    backup.write_bytes(path.read_bytes())
needle = '"Exe"\t\t"' + exe + '"'
if path.is_file():
    text = path.read_text(encoding="utf-8", errors="replace")
    if needle in text:
        print("ok")
        sys.exit(0)
    if '"Shortcuts"' in text:
        stripped = text.rstrip()
        if stripped.endswith("}}"):
            text = stripped[:-1] + block + "\n}}\n"
        else:
            text = text + block + "\n"
    else:
        text = '"Shortcuts"\n{{\n' + block + "\n}}\n"
else:
    text = '"Shortcuts"\n{{\n' + block + "\n}}\n"
path.write_text(text, encoding="utf-8")
print("ok")
PY"#
    );
    let output = run_host_bash(&script)?;
    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        return Err(NexusDeckError::Other(format!(
            "Could not write Steam shortcut on host: {}",
            err.trim()
        )));
    }
    Ok(())
}

fn base64_encode(bytes: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::new();
    for chunk in bytes.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = if chunk.len() > 1 { chunk[1] as u32 } else { 0 };
        let b2 = if chunk.len() > 2 { chunk[2] as u32 } else { 0 };
        let n = (b0 << 16) | (b1 << 8) | b2;
        out.push(TABLE[((n >> 18) & 63) as usize] as char);
        out.push(TABLE[((n >> 12) & 63) as usize] as char);
        out.push(if chunk.len() > 1 {
            TABLE[((n >> 6) & 63) as usize] as char
        } else {
            '='
        });
        out.push(if chunk.len() > 2 {
            TABLE[(n & 63) as usize] as char
        } else {
            '='
        });
    }
    out
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

fn run_host_bash(script: &str) -> Result<std::process::Output> {
    let output = if platform::is_flatpak_sandbox() {
        Command::new("flatpak-spawn")
            .args(["--host", "bash", "-lc", script])
            .output()
    } else {
        Command::new("bash").args(["-lc", script]).output()
    }
    .map_err(|e| NexusDeckError::Other(format!("Host command failed: {e}")))?;
    Ok(output)
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
    let _steam = crate::services::steam::detect_steam()?
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

    let userdata = resolve_steam_shortcuts_path()?;
    let args: Vec<String> = serde_json::from_str(&config.args_json).unwrap_or_default();
    let launch_options = args.join(" ");

    append_shortcut_on_host(
        &userdata,
        display_name,
        &exe.executable,
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

/// Remove NexusDeck entries from the host Steam `shortcuts.vdf` (Flatpak or native Steam).
pub fn remove_nexusdeck_from_steam_library() -> Result<bool> {
    if cfg!(target_os = "windows") {
        return Ok(false);
    }

    let script = r#"
set -euo pipefail
APP_NAME="NexusDeck"
APP_ID="com.nexusdeck.app"
FLATPAK_CMD="flatpak run ${APP_ID}"
LEGACY_INSTALL_DIR="${NEXUSDECK_INSTALL_DIR:-$HOME/.local/share/nexusdeck}"
LEGACY_LAUNCHER="${LEGACY_INSTALL_DIR}/nexusdeck-launch.sh"
LEGACY_APPIMAGE="${LEGACY_INSTALL_DIR}/NexusDeck.AppImage"

find_steam_path() {
  local candidates=(
    "${STEAM_COMPAT_CLIENT_INSTALL_PATH:-}"
    "${HOME}/.steam/steam"
    "${HOME}/.local/share/Steam"
    "/usr/share/steam"
    "/home/deck/.steam/steam"
    "${HOME}/.var/app/com.valvesoftware.Steam/data/Steam"
  )
  for path in "${candidates[@]}"; do
    [[ -n "$path" && -d "$path" ]] && { echo "$path"; return 0; }
  done
  return 1
}

find_steam_userdata() {
  local steam_path="$1"
  local userdata="${steam_path}/userdata"
  [[ -d "$userdata" ]] || return 1
  local entry
  for entry in "$userdata"/*; do
    [[ -d "$entry/config" ]] && { echo "$entry"; return 0; }
  done
  return 1
}

steam_path="$(find_steam_path)" || { echo "no_steam"; exit 0; }
userdata="$(find_steam_userdata "$steam_path")" || { echo "no_userdata"; exit 0; }
shortcuts_path="${userdata}/config/shortcuts.vdf"
[[ -f "$shortcuts_path" ]] || { echo "no_file"; exit 0; }

if [[ -f "${shortcuts_path}.nexusdeck_backup" ]]; then
  cp "${shortcuts_path}.nexusdeck_backup" "$shortcuts_path"
  echo "restored_backup"
  exit 0
fi

python3 - "$shortcuts_path" "$APP_NAME" "$FLATPAK_CMD" "$LEGACY_LAUNCHER" "$LEGACY_APPIMAGE" "$LEGACY_INSTALL_DIR" <<'PY'
import sys
from pathlib import Path

path = Path(sys.argv[1])
needles = [n for n in sys.argv[2:] if n]
text = path.read_text(encoding="utf-8", errors="replace")
if '"Shortcuts"' not in text:
    print("missing")
    sys.exit(0)

lines = text.splitlines(keepends=True)
result = []
removed = False
i = 0

while i < len(lines):
    line = lines[i]
    if line.strip().startswith('"AppName"'):
        block = []
        j = i
        while j < len(lines):
            block.append(lines[j])
            if j > i and lines[j].strip().startswith('"AppName"'):
                block.pop()
                break
            if lines[j].strip() == "}" and j > i:
                break
            j += 1

        block_text = "".join(block)
        if any(needle in block_text for needle in needles):
            removed = True
            i = j
            continue

        result.extend(block)
        i = j
        continue

    result.append(line)
    i += 1

if removed:
    path.write_text("".join(result), encoding="utf-8")
    print("removed")
else:
    print("not_found")
PY
"#;

    let output = run_host_bash(script)?;
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Ok(matches!(stdout.as_str(), "removed" | "restored_backup"))
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

use std::path::{Path, PathBuf};
use std::process::{Command, Output};

use serde::{Deserialize, Serialize};
use steamlocate::SteamDir;

use crate::error::{NexusDeckError, Result};
use crate::services::host_command::{self, call_with_timeout};
use crate::services::platform;

const STEAMLOCATE_TIMEOUT_SECS: u64 = 8;
const STEAM_HOST_DETECT_TIMEOUT_SECS: u64 = 25;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SteamInstallInfo {
    pub steam_path: String,
    pub library_folders: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GameCandidate {
    pub app_id: u32,
    pub name: String,
    pub install_path: String,
    pub library_path: String,
    pub proton_prefix_path: Option<String>,
}

pub fn detect_steam() -> Result<Option<SteamInstallInfo>> {
    if let Some(info) = call_with_timeout(STEAMLOCATE_TIMEOUT_SECS, detect_steam_local).flatten() {
        return Ok(Some(info));
    }
    if cfg!(target_os = "linux") {
        return detect_steam_on_host();
    }
    Ok(None)
}

fn detect_steam_local() -> Option<SteamInstallInfo> {
    let steam_dir = SteamDir::locate().ok()?;
    let steam_path = steam_dir.path().display().to_string();
    let libraries: Vec<String> = steam_dir
        .libraries()
        .ok()?
        .filter_map(|lib| lib.ok())
        .map(|lib| lib.path().display().to_string())
        .collect();
    Some(SteamInstallInfo {
        steam_path,
        library_folders: libraries,
    })
}

fn detect_steam_on_host() -> Result<Option<SteamInstallInfo>> {
    if cfg!(target_os = "windows") {
        return Ok(None);
    }
    let script = r#"set -e
for base in \
  "$HOME/.local/share/Steam" \
  "$HOME/.steam/steam" \
  "$HOME/.var/app/com.valvesoftware.Steam/data/Steam"
do
  if [ -d "$base/steamapps" ]; then
    echo "$base"
    exit 0
  fi
done
exit 1"#;
    let output = run_host_script(script)?;
    if !output.status.success() {
        return Ok(None);
    }
    let steam_path = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if steam_path.is_empty() {
        return Ok(None);
    }
    let libraries = list_host_library_folders(&steam_path)?;
    Ok(Some(SteamInstallInfo {
        steam_path,
        library_folders: libraries,
    }))
}

fn list_host_library_folders(steam_path: &str) -> Result<Vec<String>> {
    let mut folders = vec![steam_path.to_string()];
    let vdf = Path::new(steam_path).join("steamapps/libraryfolders.vdf");
    let script = format!(
        r#"VDF='{}'
[ -f "$VDF" ] || exit 0
grep -oE '"/[^"]+"' "$VDF" 2>/dev/null | tr -d '"' | sort -u"#,
        vdf.display().to_string().replace('\'', "'\\''")
    );
    let output = run_host_script(&script)?;
    if output.status.success() {
        for line in String::from_utf8_lossy(&output.stdout).lines() {
            let path = line.trim();
            if !path.is_empty() && !folders.iter().any(|f| f == path) {
                folders.push(path.to_string());
            }
        }
    }
    Ok(folders)
}

pub fn find_game_by_app_id(app_id: u32) -> Result<Vec<GameCandidate>> {
    let local = call_with_timeout(STEAMLOCATE_TIMEOUT_SECS, move || {
        find_game_by_app_id_local(app_id).unwrap_or_default()
    })
    .unwrap_or_default();
    if !local.is_empty() {
        return Ok(local);
    }
    if cfg!(target_os = "linux") {
        return find_game_by_app_id_on_host(app_id);
    }
    Ok(vec![])
}

fn find_game_by_app_id_local(app_id: u32) -> Result<Vec<GameCandidate>> {
    let steam_dir = match SteamDir::locate() {
        Err(_) => return Ok(vec![]),
        Ok(dir) => dir,
    };
    let mut candidates = Vec::new();

    let libraries = steam_dir
        .libraries()
        .map_err(|e| NexusDeckError::Other(e.to_string()))?;

    for library in libraries.filter_map(|l| l.ok()) {
        if let Some(app_result) = library.app(app_id) {
            if let Ok(app) = app_result {
                let install_path = app.install_dir.clone();
                let library_path = library.path().display().to_string();
                let proton_prefix = proton_prefix_path(&library_path, app_id);

                candidates.push(GameCandidate {
                    app_id,
                    name: app.name.clone().unwrap_or_else(|| "Unknown".to_string()),
                    install_path,
                    library_path,
                    proton_prefix_path: proton_prefix.map(|p| p.display().to_string()),
                });
            }
        }
    }

    Ok(candidates)
}

fn find_game_by_app_id_on_host(app_id: u32) -> Result<Vec<GameCandidate>> {
    if cfg!(target_os = "windows") {
        return Ok(vec![]);
    }
    let script = format!(
        r#"APP_ID={app_id}
emit() {{
  local install_path="$1"
  local library_path="$2"
  local name="$3"
  [ -d "$install_path" ] || return 0
  printf '%s|%s|%s\n' "$install_path" "$library_path" "$name"
}}

parse_acf() {{
  local acf="$1"
  local lib
  lib=$(dirname "$(dirname "$acf")")
  local installdir name
  installdir=$(grep -m1 '"installdir"' "$acf" | sed -E 's/.*"installdir"[[:space:]]+"([^"]+)".*/\1/')
  name=$(grep -m1 '"name"' "$acf" | sed -E 's/.*"name"[[:space:]]+"([^"]+)".*/\1/')
  [ -n "$installdir" ] || return 0
  emit "$lib/steamapps/common/$installdir" "$lib" "${{name:-Game}}"
}}

for acf in \
  "$HOME/.local/share/Steam/steamapps/appmanifest_${{APP_ID}}.acf" \
  "$HOME/.steam/steam/steamapps/appmanifest_${{APP_ID}}.acf" \
  "$HOME/.var/app/com.valvesoftware.Steam/data/Steam/steamapps/appmanifest_${{APP_ID}}.acf"
do
  [ -f "$acf" ] && parse_acf "$acf"
done

for acf in /run/media/*/*/steamapps/appmanifest_${{APP_ID}}.acf \
           /var/mnt/*/*/steamapps/appmanifest_${{APP_ID}}.acf \
           /mnt/*/*/steamapps/appmanifest_${{APP_ID}}.acf
do
  [ -f "$acf" ] || continue
  parse_acf "$acf"
done
"#
    );
    let output = run_host_script(&script)?;
    Ok(parse_host_game_lines(&output.stdout, app_id))
}

fn parse_host_game_lines(stdout: &[u8], app_id: u32) -> Vec<GameCandidate> {
    let mut candidates = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for line in String::from_utf8_lossy(stdout).lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let parts: Vec<&str> = line.split('|').collect();
        if parts.len() < 3 {
            continue;
        }
        let install_path = parts[0].trim();
        let library_path = parts[1].trim();
        let name = parts[2].trim();
        if install_path.is_empty() || library_path.is_empty() {
            continue;
        }
        let key = install_path.to_lowercase();
        if !seen.insert(key) {
            continue;
        }
        let proton_prefix = proton_prefix_path(library_path, app_id);
        candidates.push(GameCandidate {
            app_id,
            name: name.to_string(),
            install_path: install_path.to_string(),
            library_path: library_path.to_string(),
            proton_prefix_path: proton_prefix.map(|p| p.display().to_string()),
        });
    }
    candidates
}

fn run_host_script(script: &str) -> Result<Output> {
    if platform::is_flatpak_sandbox() {
        host_command::run_bash(script, STEAM_HOST_DETECT_TIMEOUT_SECS)
    } else {
        Command::new("bash")
            .args(["-lc", script])
            .output()
            .map_err(|e| NexusDeckError::Other(format!("Host script failed: {e}")))
    }
}

pub fn proton_prefix_path(library_path: &str, app_id: u32) -> Option<PathBuf> {
    let prefix = Path::new(library_path)
        .join("steamapps")
        .join("compatdata")
        .join(app_id.to_string())
        .join("pfx");

    if prefix.exists() {
        Some(prefix)
    } else {
        None
    }
}

pub fn find_game_in_path(path: &Path, executable: &str) -> bool {
    path.join(executable).exists()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_host_game_line() {
        let stdout = b"/home/deck/.local/share/Steam/steamapps/common/Skyrim Special Edition|/home/deck/.local/share/Steam|The Elder Scrolls V: Skyrim Special Edition\n";
        let games = parse_host_game_lines(stdout, 489830);
        assert_eq!(games.len(), 1);
        assert!(games[0].install_path.contains("Skyrim Special Edition"));
    }
}

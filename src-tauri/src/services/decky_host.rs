//! Install and detect the NexusDeck Host Decky plugin on Steam Deck.
//!
//! The Flatpak app cannot write to `~/homebrew/plugins` directly; we stage files
//! under `~/NexusDeck/.decky-host-staging` then copy on the host via
//! `flatpak-spawn --host`.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use serde::{Deserialize, Serialize};
use tauri::Manager;

use crate::error::{NexusDeckError, Result};
use crate::services::paths::{default_staging_root, ensure_dir};
use crate::services::platform;

pub const PLUGIN_DIR_NAME: &str = "nexusdeck-host";
pub const PLUGIN_VERSION: &str = env!("CARGO_PKG_VERSION");
const FLATPAK_DECKY_PLUGIN_DIR: &str = "/app/share/nexusdeck/decky/nexusdeck-host";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeckyHostStatus {
    pub available: bool,
    pub decky_installed: bool,
    pub decky_home: Option<String>,
    pub plugin_installed: bool,
    pub plugin_version: Option<String>,
    pub plugin_loader_active: bool,
    pub bundled_plugin_present: bool,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeckyHostInstallResult {
    pub success: bool,
    pub message: String,
    pub needs_decky_restart: bool,
    pub manual_steps: Vec<String>,
}

pub fn get_decky_host_status(bundled_plugin_dir: Option<&Path>) -> DeckyHostStatus {
    let bundled_plugin_present = bundled_plugin_dir
        .map(|p| p.join("plugin.json").is_file())
        .unwrap_or(false);

    if !cfg!(target_os = "linux") {
        return DeckyHostStatus {
            available: false,
            decky_installed: false,
            decky_home: None,
            plugin_installed: false,
            plugin_version: None,
            plugin_loader_active: false,
            bundled_plugin_present,
            message: "Decky Host is only available on Linux / Steam Deck.".into(),
        };
    }

    let decky_home = detect_decky_home_host();
    let decky_installed = decky_home.is_some();
    let plugin_installed = decky_home
        .as_ref()
        .map(|h| host_path_is_file(&format!("{h}/plugins/{PLUGIN_DIR_NAME}/plugin.json")))
        .unwrap_or(false);
    let plugin_version = if plugin_installed {
        read_host_plugin_version(decky_home.as_deref())
    } else {
        None
    };
    let plugin_loader_active = host_service_active("plugin_loader.service")
        || host_service_active("plugin_loader");

    let message = if !decky_installed {
        "Decky Loader is not installed. Install Decky first, then return here.".into()
    } else if !bundled_plugin_present {
        "Plugin bundle missing from this build — reinstall NexusDeck from a full release.".into()
    } else if plugin_installed {
        format!(
            "NexusDeck Host is installed{}.",
            plugin_version
                .as_ref()
                .map(|v| format!(" (v{v})"))
                .unwrap_or_default()
        )
    } else {
        "Ready to install NexusDeck Host from Settings.".into()
    };

    DeckyHostStatus {
        available: true,
        decky_installed,
        decky_home,
        plugin_installed,
        plugin_version,
        plugin_loader_active,
        bundled_plugin_present,
        message,
    }
}

pub fn install_decky_host_plugin(bundled_plugin_dir: &Path) -> Result<DeckyHostInstallResult> {
    if !cfg!(target_os = "linux") {
        return Err(NexusDeckError::Other(
            "Decky Host install is only supported on Linux.".into(),
        ));
    }

    if !bundled_plugin_dir.join("plugin.json").is_file() {
        return Err(NexusDeckError::NotFound(
            "Bundled Decky plugin files not found in this install.".into(),
        ));
    }

    let decky_home = detect_decky_home_host().ok_or_else(|| {
        NexusDeckError::NotFound(
            "Decky Loader not found. Install Decky from https://github.com/SteamDeckHomebrew/decky-loader first.".into(),
        )
    })?;

    let staging = stage_bundled_plugin(bundled_plugin_dir)?;
    let host_staging = host_path_for_staging(&staging)?;

    let install_script = format!(
        r#"set -euo pipefail
DECKY_HOME="{decky_home}"
PLUGIN_DIR="$DECKY_HOME/plugins/{PLUGIN_DIR_NAME}"
STAGING="{host_staging}"
if [ ! -f "$STAGING/plugin.json" ]; then
  echo "Staging folder missing plugin.json" >&2
  exit 1
fi
mkdir -p "$DECKY_HOME/plugins"
if [ -d "$PLUGIN_DIR" ] && [ ! -w "$DECKY_HOME/plugins" ]; then
  if command -v sudo >/dev/null 2>&1; then
    sudo rm -rf "$PLUGIN_DIR"
    sudo cp -a "$STAGING" "$PLUGIN_DIR"
    sudo chown -R root:root "$PLUGIN_DIR" 2>/dev/null || true
  else
    echo "plugins directory is read-only and sudo is unavailable" >&2
    exit 2
  fi
else
  rm -rf "$PLUGIN_DIR"
  cp -a "$STAGING" "$PLUGIN_DIR"
fi
RESTARTED=0
if command -v systemctl >/dev/null 2>&1; then
  if systemctl is-active --quiet plugin_loader.service 2>/dev/null; then
    if sudo systemctl restart plugin_loader.service 2>/dev/null; then
      RESTARTED=1
    fi
  fi
fi
echo "OK:$RESTARTED"
"#,
    );

    let output = run_host_bash(&install_script)?;
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();

    if !output.status.success() {
        if output.status.code() == Some(2) || stderr.contains("read-only") {
            return Ok(fallback_manual_install(&staging));
        }
        let detail = if stderr.is_empty() { stdout } else { stderr };
        return Err(NexusDeckError::Other(format!(
            "Decky plugin install failed: {detail}"
        )));
    }

    let restarted = stdout.contains("OK:1");
    let mut manual_steps = Vec::new();
    if !restarted {
        manual_steps.push(
            "Open Quick Access → Decky → Settings → Developer → Reload plugins.".into(),
        );
        manual_steps
            .push("Or run in Konsole: sudo systemctl restart plugin_loader.service".into());
    }

    Ok(DeckyHostInstallResult {
        success: true,
        message: if restarted {
            "NexusDeck Host installed and Decky reloaded.".into()
        } else {
            "NexusDeck Host installed. Reload Decky to see it in Quick Access.".into()
        },
        needs_decky_restart: !restarted,
        manual_steps,
    })
}

fn fallback_manual_install(staging: &Path) -> DeckyHostInstallResult {
    let zip_path = staging
        .parent()
        .unwrap_or(staging)
        .join("NexusDeck-Host-decky.zip");
    let _ = create_zip_from_dir(staging, &zip_path);

    DeckyHostInstallResult {
        success: false,
        message: format!(
            "Could not write to ~/homebrew/plugins automatically. A zip was saved to {} — install it manually in Decky.",
            zip_path.display()
        ),
        needs_decky_restart: true,
        manual_steps: vec![
            "Open Quick Access → Decky → Settings → Developer.".into(),
            "Tap \"Install plugin from ZIP\".".into(),
            format!("Select {}", zip_path.display()),
            "Reload Decky when prompted.".into(),
        ],
    }
}

fn stage_bundled_plugin(bundled: &Path) -> Result<PathBuf> {
    let root = default_staging_root();
    ensure_dir(&root)?;
    let staging = root.join(".decky-host-staging");
    if staging.exists() {
        fs::remove_dir_all(&staging)?;
    }
    copy_dir_recursive(bundled, &staging)?;
    Ok(staging)
}

fn host_path_for_staging(staging: &Path) -> Result<String> {
    Ok(staging.display().to_string())
}

fn detect_decky_home_host() -> Option<String> {
    for candidate in ["$HOME/homebrew", "~/homebrew"] {
        let script = format!(
            "d=$(eval echo {candidate}); [ -d \"$d/plugins\" ] || [ -d \"$d\" ] && echo \"$d\""
        );
        if let Ok(out) = run_host_bash(&script) {
            if out.status.success() {
                let path = String::from_utf8_lossy(&out.stdout).trim().to_string();
                if !path.is_empty() {
                    return Some(path);
                }
            }
        }
    }
    None
}

fn read_host_plugin_version(decky_home: Option<&str>) -> Option<String> {
    let home = decky_home?;
    let script = format!(
        r#"python3 - <<'PY'
import json, pathlib
p = pathlib.Path("{home}/plugins/{PLUGIN_DIR_NAME}/plugin.json")
if p.is_file():
    data = json.loads(p.read_text())
    print(data.get("version", ""))
PY"#
    );
    let out = run_host_bash(&script).ok()?;
    if !out.status.success() {
        return None;
    }
    let v = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if v.is_empty() { None } else { Some(v) }
}

fn host_path_is_file(path: &str) -> bool {
    let script = format!("[ -f \"{path}\" ] && echo yes");
    run_host_bash(&script)
        .map(|o| o.status.success() && String::from_utf8_lossy(&o.stdout).contains("yes"))
        .unwrap_or(false)
}

fn host_service_active(unit: &str) -> bool {
    let script = format!("systemctl is-active --quiet {unit} 2>/dev/null && echo yes");
    run_host_bash(&script)
        .map(|o| o.status.success() && String::from_utf8_lossy(&o.stdout).contains("yes"))
        .unwrap_or(false)
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

fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<()> {
    ensure_dir(dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let ty = entry.file_type()?;
        let to = dst.join(entry.file_name());
        if ty.is_dir() {
            copy_dir_recursive(&entry.path(), &to)?;
        } else if ty.is_file() {
            fs::copy(entry.path(), &to)?;
        }
    }
    Ok(())
}

fn create_zip_from_dir(src: &Path, zip_path: &Path) -> Result<()> {
    let output = Command::new("python3")
        .args([
            "-c",
            r#"
import sys, zipfile
from pathlib import Path
src, dest = Path(sys.argv[1]), Path(sys.argv[2])
with zipfile.ZipFile(dest, 'w', zipfile.ZIP_DEFLATED) as zf:
    for path in src.rglob('*'):
        if path.is_file():
            zf.write(path, path.relative_to(src.parent).as_posix())
"#,
            &src.display().to_string(),
            &zip_path.display().to_string(),
        ])
        .output()
        .map_err(|e| NexusDeckError::Other(format!("Could not create plugin zip: {e}")))?;
    if !output.status.success() {
        return Err(NexusDeckError::Other(
            String::from_utf8_lossy(&output.stderr).to_string(),
        ));
    }
    Ok(())
}

pub fn resolve_bundled_plugin_dir(app: &tauri::AppHandle) -> Option<PathBuf> {
    let mut candidates: Vec<PathBuf> = Vec::new();

    if let Ok(path) = app.path().resolve(
        format!("decky/{PLUGIN_DIR_NAME}"),
        tauri::path::BaseDirectory::Resource,
    ) {
        candidates.push(path);
    }

    if platform::is_flatpak_sandbox() {
        candidates.push(PathBuf::from(FLATPAK_DECKY_PLUGIN_DIR));
    }

    candidates
        .into_iter()
        .find(|p| p.join("plugin.json").is_file())
}

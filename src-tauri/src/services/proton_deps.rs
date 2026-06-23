use std::process::{Command, Output, Stdio};

use serde::{Deserialize, Serialize};

use crate::error::{NexusDeckError, Result};
use crate::services::platform;

pub const PROTONTRICKS_FLATPAK_ID: &str = "com.github.Matoking.protontricks";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProtontricksInfo {
    pub available: bool,
    pub command: String,
    pub message: String,
    /// "native", "flatpak", or "none"
    pub kind: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProtonDepsResult {
    pub success: bool,
    pub installed: Vec<String>,
    pub skipped: Vec<String>,
    pub failed: Vec<String>,
    pub message: String,
}

#[derive(Debug, Deserialize)]
struct DepsConfig {
    app_id: u32,
    packages: Vec<String>,
}

pub fn detect_protontricks() -> ProtontricksInfo {
    if cfg!(target_os = "windows") {
        return ProtontricksInfo {
            available: false,
            command: String::new(),
            message: "protontricks is Linux-only (Proton prefixes).".to_string(),
            kind: "none".into(),
        };
    }

    if platform::is_flatpak_sandbox() {
        detect_protontricks_host().unwrap_or_else(protontricks_missing)
    } else {
        detect_protontricks_local()
    }
}

fn protontricks_missing() -> ProtontricksInfo {
    ProtontricksInfo {
        available: false,
        command: String::new(),
        message: "Install Protontricks from Discover (search \"Protontricks\") or run: flatpak install flathub com.github.Matoking.protontricks".into(),
        kind: "none".into(),
    }
}

fn detect_protontricks_local() -> ProtontricksInfo {
    if which::which("protontricks").is_ok() {
        return ProtontricksInfo {
            available: true,
            command: "protontricks".to_string(),
            message: "Protontricks found on PATH.".to_string(),
            kind: "native".into(),
        };
    }

    if flatpak_app_installed(PROTONTRICKS_FLATPAK_ID) {
        return ProtontricksInfo {
            available: true,
            command: format!("flatpak run {PROTONTRICKS_FLATPAK_ID}"),
            message: "Protontricks Flatpak detected.".to_string(),
            kind: "flatpak".into(),
        };
    }

    protontricks_missing()
}

fn detect_protontricks_host() -> Option<ProtontricksInfo> {
    let script = format!(
        r#"set -e
if command -v protontricks >/dev/null 2>&1; then
  echo "native|$(command -v protontricks)"
  exit 0
fi
if flatpak info {PROTONTRICKS_FLATPAK_ID} >/dev/null 2>&1; then
  echo "flatpak|{PROTONTRICKS_FLATPAK_ID}"
  exit 0
fi
if flatpak list --app --columns=application 2>/dev/null | grep -qx '{PROTONTRICKS_FLATPAK_ID}'; then
  echo "flatpak|{PROTONTRICKS_FLATPAK_ID}"
  exit 0
fi
exit 1"#
    );
    let output = run_host_bash(&script).ok()?;
    if !output.status.success() {
        return None;
    }
    parse_protontricks_detection(&output)
}

fn parse_protontricks_detection(output: &Output) -> Option<ProtontricksInfo> {
    let line = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let (kind, detail) = line.split_once('|')?;
    match kind {
        "native" if !detail.is_empty() => Some(ProtontricksInfo {
            available: true,
            command: detail.to_string(),
            message: format!("Protontricks found on the host at {detail}."),
            kind: "native".into(),
        }),
        "flatpak" => Some(ProtontricksInfo {
            available: true,
            command: format!("flatpak run {PROTONTRICKS_FLATPAK_ID}"),
            message: "Protontricks Flatpak detected on the host.".to_string(),
            kind: "flatpak".into(),
        }),
        _ => None,
    }
}

fn flatpak_app_installed(app_id: &str) -> bool {
    Command::new("flatpak")
        .args(["info", app_id])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

fn run_host_bash(script: &str) -> Result<Output> {
    Command::new("flatpak-spawn")
        .args(["--host", "bash", "-lc", script])
        .output()
        .map_err(|e| NexusDeckError::Other(format!("Host command failed: {e}")))
}

fn run_protontricks_shell(script: &str) -> Result<Output> {
    let output = if platform::is_flatpak_sandbox() {
        run_host_bash(script)?
    } else {
        Command::new("bash")
            .args(["-lc", script])
            .output()
            .map_err(|e| NexusDeckError::Other(format!("Failed to run protontricks: {e}")))?
    };
    Ok(output)
}

pub fn list_game_deps(game_domain: &str) -> Result<Vec<String>> {
    let config = load_deps_config(game_domain)?;
    Ok(config.packages)
}

pub fn install_packages_for_app(app_id: u32, packages: &[&str]) -> Result<ProtonDepsResult> {
    if cfg!(target_os = "windows") {
        return Ok(ProtonDepsResult {
            success: true,
            installed: vec![],
            skipped: packages.iter().map(|p| (*p).to_string()).collect(),
            failed: vec![],
            message: "Proton dependencies are not required on Windows.".to_string(),
        });
    }

    let pt = detect_protontricks();
    if !pt.available {
        return Ok(ProtonDepsResult {
            success: false,
            installed: vec![],
            skipped: vec![],
            failed: packages.iter().map(|p| (*p).to_string()).collect(),
            message: pt.message,
        });
    }

    let mut installed = Vec::new();
    let mut skipped = Vec::new();
    let mut failed = Vec::new();

    for pkg in packages {
        match run_protontricks(app_id, pkg, &pt) {
            Ok(()) => installed.push((*pkg).to_string()),
            Err(e) => {
                log::warn!("protontricks {pkg} failed: {e}");
                failed.push((*pkg).to_string());
            }
        }
    }

    let installed_count = installed.len();
    let failed_list = failed.join(", ");
    let success = failed.is_empty();
    Ok(ProtonDepsResult {
        success,
        installed,
        skipped,
        failed,
        message: if success {
            format!("Installed {installed_count} package(s) via protontricks.")
        } else {
            format!("Some packages failed: {failed_list}.")
        },
    })
}

pub fn install_game_deps(game_domain: &str, dry_run: bool) -> Result<ProtonDepsResult> {
    if cfg!(target_os = "windows") {
        return Ok(ProtonDepsResult {
            success: true,
            installed: vec![],
            skipped: vec!["all".to_string()],
            failed: vec![],
            message: "Proton dependencies are not required on Windows.".to_string(),
        });
    }

    let config = load_deps_config(game_domain)?;
    let pt = detect_protontricks();
    if !pt.available {
        return Ok(ProtonDepsResult {
            success: false,
            installed: vec![],
            skipped: vec![],
            failed: config.packages.clone(),
            message: pt.message,
        });
    }

    if dry_run {
        return Ok(ProtonDepsResult {
            success: true,
            installed: vec![],
            skipped: config.packages.clone(),
            failed: vec![],
            message: format!(
                "Would install {} packages via protontricks for app {}.",
                config.packages.len(),
                config.app_id
            ),
        });
    }

    let mut installed = Vec::new();
    let mut skipped = Vec::new();
    let mut failed = Vec::new();

    for pkg in &config.packages {
        if prefix_has_package_marker(config.app_id, pkg) {
            skipped.push(pkg.clone());
            continue;
        }
        match run_protontricks(config.app_id, pkg, &pt) {
            Ok(()) => installed.push(pkg.clone()),
            Err(e) => {
                log::warn!("protontricks {pkg} failed: {e}");
                failed.push(pkg.clone());
            }
        }
    }

    if !installed.is_empty() {
        let _ = mark_deps_installed(config.app_id);
    }

    let success = failed.is_empty();
    let message = if success {
        format!(
            "Installed {} Proton dependencies ({} skipped).",
            installed.len(),
            skipped.len()
        )
    } else {
        format!(
            "Some dependencies failed: {}. Installed: {}, skipped: {}.",
            failed.join(", "),
            installed.len(),
            skipped.len()
        )
    };

    Ok(ProtonDepsResult {
        success,
        installed,
        skipped,
        failed,
        message,
    })
}

fn load_deps_config(game_domain: &str) -> Result<DepsConfig> {
    let raw = match game_domain {
        "skyrimspecialedition" => {
            include_str!("../games/rules/skyrimspecialedition_proton_deps.json")
        }
        "fallout4" => {
            r#"{"app_id":377160,"packages":["vcrun2019","dotnet48","d3dx9_43","xact","xact_64","xinput"]}"#
        }
        other => {
            return Err(NexusDeckError::Other(format!(
                "No Proton dependency list for {other}"
            )));
        }
    };
    serde_json::from_str(raw).map_err(|e| NexusDeckError::Other(e.to_string()))
}

fn run_protontricks(app_id: u32, package: &str, pt: &ProtontricksInfo) -> Result<()> {
    let script = if pt.kind == "flatpak" {
        format!(
            "flatpak run -y {PROTONTRICKS_FLATPAK_ID} {app_id} -q {package}"
        )
    } else {
        let cmd = if pt.command.is_empty() {
            "protontricks".to_string()
        } else {
            pt.command.clone()
        };
        format!("{cmd} {app_id} -q {package}")
    };

    let output = run_protontricks_shell(&script)?;

    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        let detail = if stderr.trim().is_empty() {
            stdout.trim().to_string()
        } else {
            stderr.trim().to_string()
        };
        Err(NexusDeckError::Other(format!(
            "protontricks {package}: {detail}"
        )))
    }
}

fn prefix_has_package_marker(app_id: u32, _package: &str) -> bool {
    let prefix = default_prefix_path(app_id);
    prefix.join("drive_c").exists() && prefix.join(".deckmodfix_deps").exists()
}

fn default_prefix_path(app_id: u32) -> std::path::PathBuf {
    if let Ok(steam) = steamlocate::SteamDir::locate() {
        if let Ok(libraries) = steam.libraries() {
            for lib in libraries.filter_map(|l| l.ok()) {
                let prefix = lib
                    .path()
                    .join("steamapps")
                    .join("compatdata")
                    .join(app_id.to_string())
                    .join("pfx");
                if prefix.exists() {
                    return prefix;
                }
            }
        }
    }
    dirs::home_dir()
        .unwrap_or_default()
        .join(".local/share/Steam/steamapps/compatdata")
        .join(app_id.to_string())
        .join("pfx")
}

pub fn mark_deps_installed(app_id: u32) -> Result<()> {
    let marker = default_prefix_path(app_id).join(".deckmodfix_deps");
    if let Some(parent) = marker.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(&marker, chrono::Utc::now().to_rfc3339())?;
    Ok(())
}

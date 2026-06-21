use std::process::{Command, Stdio};

use serde::{Deserialize, Serialize};

use crate::error::{NexusDeckError, Result};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProtontricksInfo {
    pub available: bool,
    pub command: String,
    pub message: String,
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
        };
    }

    if which::which("protontricks").is_ok() {
        return ProtontricksInfo {
            available: true,
            command: "protontricks".to_string(),
            message: "protontricks found on PATH.".to_string(),
        };
    }

    if which::which("flatpak").is_ok() {
        let check = Command::new("flatpak")
            .args(["info", "com.github.Matoking.protontricks"])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
        if check.map(|s| s.success()).unwrap_or(false) {
            return ProtontricksInfo {
                available: true,
                command: "flatpak run com.github.Matoking.protontricks".to_string(),
                message: "Protontricks Flatpak detected.".to_string(),
            };
        }
    }

    ProtontricksInfo {
        available: false,
        command: String::new(),
        message: "Install protontricks: pacman -S protontricks or Flatpak com.github.Matoking.protontricks".to_string(),
    }
}

pub fn list_game_deps(game_domain: &str) -> Result<Vec<String>> {
    let config = load_deps_config(game_domain)?;
    Ok(config.packages)
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
        match run_protontricks(config.app_id, pkg, &pt.command) {
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
            r#"{"app_id":377160,"packages":["vcrun2019","dotnet48","d3dx9_43","xact","xinput"]}"#
        }
        other => {
            return Err(NexusDeckError::Other(format!(
                "No Proton dependency list for {other}"
            )));
        }
    };
    serde_json::from_str(raw).map_err(|e| NexusDeckError::Other(e.to_string()))
}

fn run_protontricks(app_id: u32, package: &str, command: &str) -> Result<()> {
    let mut cmd = if command.starts_with("flatpak run") {
        let mut c = Command::new("flatpak");
        c.args(["run", "com.github.Matoking.protontricks"]);
        c
    } else {
        Command::new(command)
    };

    let status = cmd
        .arg(app_id.to_string())
        .arg("-q")
        .arg(package)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| NexusDeckError::Other(format!("Failed to run protontricks: {e}")))?
        .wait_with_output()
        .map_err(|e| NexusDeckError::Other(format!("protontricks wait failed: {e}")))?;

    if status.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&status.stderr);
        Err(NexusDeckError::Other(format!(
            "protontricks {package}: {stderr}"
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

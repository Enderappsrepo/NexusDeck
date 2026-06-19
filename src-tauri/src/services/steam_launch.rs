use std::path::{Path, PathBuf};
use std::process::Command;

use serde::{Deserialize, Serialize};

use crate::error::{NexusDeckError, Result};
use crate::services::steam::detect_steam;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SteamLaunchInfo {
    pub kind: String,
    pub steam_path: String,
    pub steam_uri: String,
}

pub fn detect_steam_launch_info(app_id: u32) -> Result<SteamLaunchInfo> {
    if cfg!(target_os = "linux") {
        if which::which("flatpak").is_ok() {
            let output = Command::new("flatpak")
                .args(["info", "com.valvesoftware.Steam"])
                .output();
            if output.map(|o| o.status.success()).unwrap_or(false) {
                return Ok(SteamLaunchInfo {
                    kind: "flatpak".to_string(),
                    steam_path: "flatpak".to_string(),
                    steam_uri: format!("steam://rungameid/{app_id}"),
                });
            }
        }
        if let Ok(path) = which::which("steam") {
            return Ok(SteamLaunchInfo {
                kind: "native".to_string(),
                steam_path: path.display().to_string(),
                steam_uri: format!("steam://rungameid/{app_id}"),
            });
        }
        return Err(NexusDeckError::SteamNotFound(
            "Steam not found. Install Steam or use direct executable launch.".into(),
        ));
    }

    let steam = detect_steam()?.ok_or_else(|| {
        NexusDeckError::SteamNotFound(
            "Steam installation not detected. Use direct executable launch.".into(),
        )
    })?;

    let steam_exe = if cfg!(target_os = "windows") {
        PathBuf::from(&steam.steam_path).join("steam.exe")
    } else {
        PathBuf::from(&steam.steam_path).join("steam.sh")
    };

    Ok(SteamLaunchInfo {
        kind: "native".to_string(),
        steam_path: steam_exe.display().to_string(),
        steam_uri: format!("steam://rungameid/{app_id}"),
    })
}

pub fn launch_via_steam_uri(app_id: u32) -> Result<()> {
    let uri = format!("steam://rungameid/{app_id}");
    open_uri(&uri)
}

pub fn launch_via_steam_cli(
    app_id: u32,
    args: &[String],
    compat_data_path: Option<&Path>,
) -> Result<()> {
    let info = detect_steam_launch_info(app_id)?;

    if info.kind == "flatpak" {
        let mut cmd = Command::new("flatpak");
        cmd.args(["run", "com.valvesoftware.Steam", "-applaunch", &app_id.to_string()]);
        if !args.is_empty() {
            cmd.arg("--").args(args);
        }
        apply_proton_env(&mut cmd, compat_data_path);
        return run_command(cmd);
    }

    let mut cmd = if Path::new(&info.steam_path).exists() {
        let mut c = Command::new(&info.steam_path);
        c.arg("-applaunch").arg(app_id.to_string());
        if !args.is_empty() {
            c.arg("--").args(args);
        }
        c
    } else if which::which("steam").is_ok() {
        let mut c = Command::new("steam");
        c.arg("-applaunch").arg(app_id.to_string());
        if !args.is_empty() {
            c.arg("--").args(args);
        }
        c
    } else {
        return launch_via_steam_uri(app_id);
    };

    apply_proton_env(&mut cmd, compat_data_path);
    run_command(cmd)
}

fn apply_proton_env(cmd: &mut Command, compat_data_path: Option<&Path>) {
    if let Some(path) = compat_data_path {
        cmd.env("STEAM_COMPAT_DATA_PATH", path);
        if let Some(parent) = path.parent() {
            if let Some(grand) = parent.parent() {
                cmd.env("STEAM_COMPAT_CLIENT_INSTALL_PATH", grand);
            }
        }
    }
}

pub fn launch_direct_executable(exe_path: &Path, game_root: &Path, args: &[String]) -> Result<u32> {
    if !exe_path.exists() {
        return Err(NexusDeckError::LaunchFailed(format!(
            "Executable not found: {}",
            exe_path.display()
        )));
    }

    let mut cmd = Command::new(exe_path);
    cmd.current_dir(game_root).args(args);
    let child = cmd
        .spawn()
        .map_err(|e| NexusDeckError::LaunchFailed(e.to_string()))?;
    Ok(child.id())
}

fn run_command(mut cmd: Command) -> Result<()> {
    cmd.spawn()
        .map_err(|e| NexusDeckError::LaunchFailed(e.to_string()))?;
    Ok(())
}

fn open_uri(uri: &str) -> Result<()> {
    #[cfg(target_os = "windows")]
    {
        Command::new("cmd")
            .args(["/C", "start", "", uri])
            .spawn()
            .map_err(|e| NexusDeckError::LaunchFailed(e.to_string()))?;
    }
    #[cfg(target_os = "linux")]
    {
        if Command::new("xdg-open")
            .arg(uri)
            .spawn()
            .is_err()
        {
            return Err(NexusDeckError::LaunchFailed(
                "Could not open Steam URI".into(),
            ));
        }
    }
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(uri)
            .spawn()
            .map_err(|e| NexusDeckError::LaunchFailed(e.to_string()))?;
    }
    Ok(())
}

pub fn proton_compat_data_path(library_path: &str, app_id: u32) -> PathBuf {
    Path::new(library_path)
        .join("steamapps")
        .join("compatdata")
        .join(app_id.to_string())
}

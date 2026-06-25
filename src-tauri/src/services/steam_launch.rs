use std::path::{Path, PathBuf};
use std::process::Command;
#[cfg(target_os = "linux")]
use std::process::Stdio;

use serde::{Deserialize, Serialize};

use crate::db::Profile;
use crate::error::{NexusDeckError, Result};
use crate::games::GameRegistry;
#[cfg(target_os = "linux")]
use crate::services::platform;
use crate::services::proton_audio::apply_bethesda_audio_env;
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

/// Launch a game through Steam, picking a strategy that works in Gaming Mode.
/// Returns the method label used (`steam_host_applaunch`, `steam_cli`, etc.).
pub fn launch_steam_game(
    app_id: u32,
    args: &[String],
    compat_data_path: Option<&Path>,
) -> Result<String> {
    #[cfg(target_os = "linux")]
    if platform::is_flatpak_sandbox() {
        if let Ok(method) = launch_via_steam_host(app_id, args, compat_data_path) {
            return Ok(method);
        }
    }

    if launch_via_steam_cli(app_id, args, compat_data_path).is_ok() {
        return Ok("steam_cli".to_string());
    }

    launch_via_steam_uri(app_id)?;
    Ok("steam_uri".to_string())
}

pub fn launch_via_steam_cli(
    app_id: u32,
    args: &[String],
    compat_data_path: Option<&Path>,
) -> Result<()> {
    #[cfg(target_os = "linux")]
    if platform::is_flatpak_sandbox() {
        let method = launch_via_steam_host(app_id, args, compat_data_path)?;
        let _ = method;
        return Ok(());
    }

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

#[cfg(target_os = "linux")]
fn launch_via_steam_host(
    app_id: u32,
    args: &[String],
    compat_data_path: Option<&Path>,
) -> Result<String> {
    let app_id_str = app_id.to_string();
    let extra = if args.is_empty() {
        String::new()
    } else {
        format!(" -- {}", shell_join_args(args))
    };

    let applaunch_script = format!(
        "if command -v steam >/dev/null 2>&1; then \
           exec steam -applaunch {app_id_str}{extra}; \
         elif [ -x /usr/bin/steam ]; then \
           exec /usr/bin/steam -applaunch {app_id_str}{extra}; \
         elif command -v flatpak >/dev/null 2>&1 && flatpak info com.valvesoftware.Steam >/dev/null 2>&1; then \
           exec flatpak run com.valvesoftware.Steam -applaunch {app_id_str}{extra}; \
         else \
           exit 127; \
         fi"
    );

    if spawn_host_bash(&applaunch_script, compat_data_path).is_ok() {
        return Ok("steam_host_applaunch".to_string());
    }

    let uri_script = format!("xdg-open 'steam://rungameid/{app_id_str}'");
    spawn_host_bash(&uri_script, compat_data_path).map_err(|e| {
        NexusDeckError::LaunchFailed(format!(
            "Could not launch game through host Steam from Gaming Mode: {e}. \
             Try launching Fallout 4 once from Steam directly, then retry."
        ))
    })?;
    Ok("steam_host_uri".to_string())
}

#[cfg(not(target_os = "linux"))]
fn launch_via_steam_host(
    _app_id: u32,
    _args: &[String],
    _compat_data_path: Option<&Path>,
) -> Result<String> {
    Err(NexusDeckError::LaunchFailed(
        "Host Steam launch is Linux-only".into(),
    ))
}

#[cfg(target_os = "linux")]
fn shell_join_args(args: &[String]) -> String {
    args.iter()
        .map(|a| format!("'{}'", a.replace('\'', "'\\''")))
        .collect::<Vec<_>>()
        .join(" ")
}

#[cfg(target_os = "linux")]
fn spawn_host_bash(script: &str, compat_data_path: Option<&Path>) -> Result<()> {
    let mut cmd = Command::new("flatpak-spawn");
    cmd.arg("--host");
    apply_proton_env_flatpak_spawn(&mut cmd, compat_data_path);
    cmd.arg("bash").args(["-lc", script]);
    cmd.stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    cmd.spawn()
        .map_err(|e| NexusDeckError::LaunchFailed(format!("flatpak-spawn failed: {e}")))?;
    Ok(())
}

#[cfg(target_os = "linux")]
fn apply_proton_env_flatpak_spawn(cmd: &mut Command, compat_data_path: Option<&Path>) {
    if let Some(path) = compat_data_path {
        cmd.arg(format!(
            "--env=STEAM_COMPAT_DATA_PATH={}",
            path.display()
        ));
        if let Some(parent) = path.parent() {
            if let Some(grand) = parent.parent() {
                cmd.arg(format!(
                    "--env=STEAM_COMPAT_CLIENT_INSTALL_PATH={}",
                    grand.display()
                ));
            }
        }
    }
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

/// Launch a Windows executable through Proton (Linux/Deck). Used for F4SE/SKSE
/// and external tools when Steam's default shortcut would start the vanilla exe.
pub fn launch_through_proton(
    profile: &Profile,
    exe: &Path,
    cwd: &Path,
    args: &[String],
) -> Result<u32> {
    let plugin = GameRegistry::get(&profile.game_domain)?;
    let app_id = plugin.steam_app_id().unwrap_or(377160);

    let compat = compat_data_dir(profile, app_id).ok_or_else(|| {
        NexusDeckError::Other(
            "Couldn't find the game's Proton prefix. Launch the game once through Steam so Proton creates it, then try again.".into(),
        )
    })?;

    let steam_root = steam_root_dir().ok_or_else(|| {
        NexusDeckError::Other("Couldn't locate your Steam install.".into())
    })?;

    let proton = find_proton(&steam_root).ok_or_else(|| {
        NexusDeckError::Other(
            "Couldn't find a Proton version. Open the game's Properties in Steam, force a Proton version under Compatibility, then try again.".into(),
        )
    })?;

    let mut cmd = if Path::new("/.flatpak-info").exists() {
        let mut c = Command::new("flatpak-spawn");
        c.arg("--host");
        c.arg(format!("--directory={}", cwd.display()));
        c.arg(format!("--env=STEAM_COMPAT_DATA_PATH={}", compat.display()));
        c.arg(format!(
            "--env=STEAM_COMPAT_CLIENT_INSTALL_PATH={}",
            steam_root.display()
        ));
        c.arg(format!("--env=STEAM_COMPAT_INSTALL_PATH={}", profile.game_path));
        apply_bethesda_audio_env(&mut c, &profile.game_domain, true);
        c.arg(proton.display().to_string());
        c.arg("run");
        c.arg(exe.display().to_string());
        c.args(args);
        c
    } else {
        let mut c = Command::new(&proton);
        c.arg("run").arg(exe).current_dir(cwd).args(args);
        c.env("STEAM_COMPAT_DATA_PATH", &compat);
        c.env("STEAM_COMPAT_CLIENT_INSTALL_PATH", &steam_root);
        c.env("STEAM_COMPAT_INSTALL_PATH", &profile.game_path);
        apply_bethesda_audio_env(&mut c, &profile.game_domain, false);
        c
    };

    let child = cmd.spawn().map_err(|e| {
        NexusDeckError::LaunchFailed(format!("Failed to start game through Proton: {e}"))
    })?;
    Ok(child.id())
}

fn compat_data_dir(profile: &Profile, app_id: u32) -> Option<PathBuf> {
    if let Some(ref prefix) = profile.proton_prefix_path {
        return Path::new(prefix).parent().map(Path::to_path_buf);
    }
    let steam = detect_steam().ok().flatten()?;
    steam.library_folders.into_iter().find_map(|lib| {
        let candidate = Path::new(&lib)
            .join("steamapps")
            .join("compatdata")
            .join(app_id.to_string());
        candidate.exists().then_some(candidate)
    })
}

fn steam_root_dir() -> Option<PathBuf> {
    if let Ok(Some(steam)) = detect_steam() {
        let p = PathBuf::from(&steam.steam_path);
        if p.exists() {
            return Some(p);
        }
    }
    let home = std::env::var("HOME").ok()?;
    [
        format!("{home}/.steam/steam"),
        format!("{home}/.local/share/Steam"),
        format!("{home}/.var/app/com.valvesoftware.Steam/data/Steam"),
    ]
    .into_iter()
    .map(PathBuf::from)
    .find(|p| p.exists())
}

fn find_proton(steam_root: &Path) -> Option<PathBuf> {
    let mut roots = vec![
        steam_root.join("steamapps").join("common"),
        steam_root.join("compatibilitytools.d"),
    ];
    if let Ok(Some(steam)) = detect_steam() {
        for lib in steam.library_folders {
            roots.push(Path::new(&lib).join("steamapps").join("common"));
        }
    }

    let mut best: Option<(i64, PathBuf)> = None;
    for root in roots {
        let Ok(entries) = std::fs::read_dir(&root) else {
            continue;
        };
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if !name.to_lowercase().contains("proton") {
                continue;
            }
            let proton_bin = entry.path().join("proton");
            if !proton_bin.exists() {
                continue;
            }
            let score = proton_score(&name);
            if best.as_ref().map(|(s, _)| score > *s).unwrap_or(true) {
                best = Some((score, proton_bin));
            }
        }
    }
    best.map(|(_, p)| p)
}

fn proton_score(name: &str) -> i64 {
    let lower = name.to_lowercase();
    if lower.contains("experimental") {
        return 100_000;
    }
    let digits: String = name
        .chars()
        .map(|c| if c.is_ascii_digit() { c } else { ' ' })
        .collect();
    digits
        .split_whitespace()
        .take(2)
        .collect::<String>()
        .parse::<i64>()
        .unwrap_or(0)
}

use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::OnceLock;

use serde::{Deserialize, Serialize};

use crate::services::platform;

static BUNDLED_PATH: OnceLock<Option<PathBuf>> = OnceLock::new();
static HOST_COMMAND: OnceLock<Option<String>> = OnceLock::new();

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SevenZipSource {
    System,
    Bundled,
    Host,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SevenZipInfo {
    pub available: bool,
    pub source: Option<SevenZipSource>,
    pub path: Option<String>,
    pub message: String,
}

#[derive(Debug, Clone)]
struct SevenZipExec {
    source: SevenZipSource,
    program: String,
    use_host_spawn: bool,
}

pub fn init_bundled_path(path: Option<PathBuf>) {
    let _ = BUNDLED_PATH.set(path);
}

pub fn probe_host_7z() {
    if !platform::is_flatpak_sandbox() {
        return;
    }
    let host = detect_host_7z();
    let _ = HOST_COMMAND.set(host);
}

pub fn get_info() -> SevenZipInfo {
    match resolve_7z() {
        Some(exec) => {
            let (message, path) = match exec.source {
                SevenZipSource::System => (
                    "Using system 7-Zip".to_string(),
                    Some(exec.program.clone()),
                ),
                SevenZipSource::Bundled => (
                    "Using NexusDeck bundled 7-Zip".to_string(),
                    Some(exec.program.clone()),
                ),
                SevenZipSource::Host => (
                    "Using SteamOS host 7-Zip".to_string(),
                    Some(exec.program.clone()),
                ),
            };
            SevenZipInfo {
                available: true,
                source: Some(exec.source),
                path,
                message,
            }
        }
        None => SevenZipInfo {
            available: false,
            source: None,
            path: None,
            message: "7-Zip not found — using built-in decompressor".to_string(),
        },
    }
}

pub fn has_7z_executable() -> bool {
    resolve_7z().is_some()
}

fn resolve_7z() -> Option<SevenZipExec> {
    if let Some(exec) = find_system_7z() {
        return Some(exec);
    }
    if let Some(path) = bundled_path().filter(|p| p.is_file()) {
        return Some(SevenZipExec {
            source: SevenZipSource::Bundled,
            program: path.display().to_string(),
            use_host_spawn: false,
        });
    }
    if let Some(cmd) = host_command() {
        return Some(SevenZipExec {
            source: SevenZipSource::Host,
            program: cmd,
            use_host_spawn: true,
        });
    }
    None
}

pub fn spawn_7z<I, S>(args: I) -> std::io::Result<Command>
where
    I: IntoIterator<Item = S>,
    S: AsRef<std::ffi::OsStr>,
{
    let exec = resolve_7z().ok_or_else(|| {
        std::io::Error::new(std::io::ErrorKind::NotFound, "7-Zip executable not found")
    })?;

    let mut cmd = if exec.use_host_spawn {
        let mut c = Command::new("flatpak-spawn");
        c.arg("--host");
        c.arg(&exec.program);
        c
    } else {
        Command::new(&exec.program)
    };

    cmd.args(args);
    crate::services::proc::hide_console(&mut cmd);
    Ok(cmd)
}

fn bundled_path() -> Option<PathBuf> {
    BUNDLED_PATH.get().and_then(|p| p.clone())
}

fn host_command() -> Option<String> {
    HOST_COMMAND.get().and_then(|c| c.clone())
}

fn find_system_7z() -> Option<SevenZipExec> {
    for name in ["7z", "7za", "7zz"] {
        if let Ok(path) = which::which(name) {
            return Some(SevenZipExec {
                source: SevenZipSource::System,
                program: path.display().to_string(),
                use_host_spawn: false,
            });
        }
    }

    #[cfg(windows)]
    {
        for candidate in [
            r"C:\Program Files\7-Zip\7z.exe",
            r"C:\Program Files (x86)\7-Zip\7z.exe",
        ] {
            let path = PathBuf::from(candidate);
            if path.is_file() {
                return Some(SevenZipExec {
                    source: SevenZipSource::System,
                    program: path.display().to_string(),
                    use_host_spawn: false,
                });
            }
        }
    }

    #[cfg(target_os = "linux")]
    {
        for candidate in [
            "/app/bin/7z",
            "/app/bin/7za",
            "/app/bin/7zz",
            "/usr/bin/7z",
            "/usr/bin/7za",
            "/usr/bin/7zz",
        ] {
            let path = PathBuf::from(candidate);
            if path.is_file() {
                return Some(SevenZipExec {
                    source: SevenZipSource::System,
                    program: path.display().to_string(),
                    use_host_spawn: false,
                });
            }
        }
    }

    None
}

fn detect_host_7z() -> Option<String> {
    for candidate in [
        "7z",
        "7za",
        "7zz",
        "/usr/bin/7z",
        "/usr/bin/7za",
        "/usr/bin/7zz",
    ] {
        if host_path_exists(candidate) {
            return Some(candidate.to_string());
        }
    }

    let output = Command::new("flatpak-spawn")
        .arg("--host")
        .arg("sh")
        .arg("-c")
        .arg("command -v 7z 2>/dev/null || command -v 7za 2>/dev/null || command -v 7zz 2>/dev/null")
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }

    let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if path.is_empty() {
        None
    } else {
        Some(path)
    }
}

fn host_path_exists(path: &str) -> bool {
    Command::new("flatpak-spawn")
        .arg("--host")
        .arg("test")
        .arg("-x")
        .arg(path)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

pub fn discover_bundled_in_resource_dir(resource_dir: &Path) -> Option<PathBuf> {
    for name in ["7z.exe", "7z", "7za", "7zz"] {
        let path = resource_dir.join("7zip").join(name);
        if path.is_file() {
            return Some(path);
        }
    }
    None
}

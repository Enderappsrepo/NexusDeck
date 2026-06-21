use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use serde::{Deserialize, Serialize};
use walkdir::WalkDir;
use zip::write::SimpleFileOptions;
use zip::ZipWriter;

use crate::error::{NexusDeckError, Result};
use crate::services::steam::{detect_steam, proton_prefix_path};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrefixStatus {
    pub exists: bool,
    pub my_games_exists: bool,
    pub prefix_path: Option<String>,
    pub size_mb: u64,
    pub writable: bool,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BootstrapResult {
    pub launched: bool,
    pub prefix_exists: bool,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProtonVersionInfo {
    pub compatible: bool,
    pub proton_version: Option<String>,
    pub recommended: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrefixBackupResult {
    pub backup_path: String,
    pub size_mb: u64,
    pub message: String,
}

pub fn prefix_status(proton_prefix: Option<&str>, my_games_folder: &str) -> PrefixStatus {
    let Some(prefix_str) = proton_prefix.filter(|s| !s.is_empty()) else {
        return PrefixStatus {
            exists: false,
            my_games_exists: false,
            prefix_path: None,
            size_mb: 0,
            writable: false,
            message: "Proton prefix not set. Launch the game once via Steam to create it.".to_string(),
        };
    };

    let prefix = PathBuf::from(prefix_str);
    let exists = prefix.exists();
    let my_games = prefix
        .join("drive_c/users/steamuser/Documents/My Games")
        .join(my_games_folder);
    let my_games_exists = my_games.exists();
    let size_mb = if exists {
        dir_size_mb(&prefix)
    } else {
        0
    };
    let writable = path_writable(&prefix);

    let message = if !exists {
        "Prefix folder missing — run a vanilla launch from Steam first.".to_string()
    } else if !my_games_exists {
        "Prefix exists but My Games folder not found — launch Skyrim once to generate INIs.".to_string()
    } else if !writable {
        "Prefix is not writable — check permissions or SD card mount options.".to_string()
    } else if size_mb > 8192 {
        format!(
            "Prefix is large ({size_mb} MB). Consider backup and cleanup if performance suffers."
        )
    } else {
        "Proton prefix looks healthy.".to_string()
    };

    PrefixStatus {
        exists,
        my_games_exists,
        prefix_path: Some(prefix_str.to_string()),
        size_mb,
        writable,
        message,
    }
}

pub fn bootstrap_vanilla_launch(app_id: u32) -> Result<BootstrapResult> {
    let prefix = find_prefix_for_app(app_id);
    if let Some(ref p) = prefix {
        if p.exists() {
            return Ok(BootstrapResult {
                launched: false,
                prefix_exists: true,
                message: format!(
                    "Proton prefix already exists at {}. Launch Skyrim from Steam if My Games is empty.",
                    p.display()
                ),
            });
        }
    }

    if cfg!(target_os = "windows") {
        return Ok(BootstrapResult {
            launched: false,
            prefix_exists: false,
            message: "On Windows, launch the game from Steam to initialize folders.".to_string(),
        });
    }

    let launched = launch_via_steam(app_id);
    Ok(BootstrapResult {
        launched,
        prefix_exists: find_prefix_for_app(app_id)
            .map(|p| p.exists())
            .unwrap_or(false),
        message: if launched {
            "Steam launch triggered. Wait for the game to reach the main menu, then close it.".to_string()
        } else {
            "Could not auto-launch Steam. Open Steam and run Skyrim once manually.".to_string()
        },
    })
}

pub fn check_proton_version(app_id: u32) -> Result<ProtonVersionInfo> {
    let recommended = "Proton GE 9.0+ or Steam Proton Experimental".to_string();

    if cfg!(target_os = "windows") {
        return Ok(ProtonVersionInfo {
            compatible: true,
            proton_version: None,
            recommended: recommended.clone(),
            message: "Proton version checks apply on Linux/Steam Deck only.".to_string(),
        });
    }

    let version_file = find_prefix_for_app(app_id)
        .map(|p| p.join("version"))
        .filter(|p| p.exists());

    let proton_version = version_file.and_then(|p| fs::read_to_string(p).ok());
    let version_display = proton_version
        .as_ref()
        .map(|v| v.trim().to_string())
        .unwrap_or_default();

    let compatible = proton_version
        .as_ref()
        .map(|v| !v.trim().is_empty())
        .unwrap_or(false);

    Ok(ProtonVersionInfo {
        compatible,
        proton_version: proton_version.map(|v| v.trim().to_string()),
        recommended: recommended.clone(),
        message: if compatible {
            format!(
                "Proton prefix version: {version_display}. {recommended} recommended for modded Skyrim."
            )
        } else {
            format!(
                "Could not read Proton version. Set Proton compatibility to {recommended} in Steam game properties."
            )
        },
    })
}

pub fn backup_prefix(proton_prefix: &str, dest_zip: &str) -> Result<PrefixBackupResult> {
    let prefix = Path::new(proton_prefix);
    if !prefix.exists() {
        return Err(NexusDeckError::NotFound(format!(
            "Prefix not found: {proton_prefix}"
        )));
    }

    let file = fs::File::create(dest_zip)?;
    let mut zip = ZipWriter::new(file);
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    for entry in WalkDir::new(prefix).into_iter().filter_map(|e| e.ok()) {
        let path = entry.path();
        let name = path
            .strip_prefix(prefix)
            .map_err(|e| NexusDeckError::Other(e.to_string()))?;
        let name_str = name.to_string_lossy().replace('\\', "/");
        if name_str.is_empty() {
            continue;
        }
        if path.is_dir() {
            zip.add_directory(name_str, options)
                .map_err(|e| NexusDeckError::Other(e.to_string()))?;
        } else {
            zip.start_file(name_str, options)
                .map_err(|e| NexusDeckError::Other(e.to_string()))?;
            let mut f = fs::File::open(path)?;
            let mut buf = Vec::new();
            f.read_to_end(&mut buf)?;
            zip.write_all(&buf)
                .map_err(|e| NexusDeckError::Other(e.to_string()))?;
        }
    }

    zip.finish()
        .map_err(|e| NexusDeckError::Other(e.to_string()))?;

    let size_mb = fs::metadata(dest_zip).map(|m| m.len() / 1_048_576).unwrap_or(0);
    Ok(PrefixBackupResult {
        backup_path: dest_zip.to_string(),
        size_mb,
        message: format!("Prefix backed up to {dest_zip} ({size_mb} MB)."),
    })
}

pub fn restore_prefix(proton_prefix: &str, src_zip: &str) -> Result<String> {
    if !Path::new(src_zip).exists() {
        return Err(NexusDeckError::NotFound(format!(
            "Backup not found: {src_zip}"
        )));
    }
    let prefix = Path::new(proton_prefix);
    if prefix.exists() {
        fs::remove_dir_all(prefix)?;
    }
    fs::create_dir_all(prefix)?;

    let file = fs::File::open(src_zip)?;
    let mut archive = zip::ZipArchive::new(file)
        .map_err(|e| NexusDeckError::Other(format!("Invalid backup zip: {e}")))?;

    for i in 0..archive.len() {
        let mut entry = archive
            .by_index(i)
            .map_err(|e| NexusDeckError::Other(e.to_string()))?;
        let outpath = prefix.join(entry.name().replace('/', std::path::MAIN_SEPARATOR_STR));
        if entry.name().ends_with('/') {
            fs::create_dir_all(&outpath)?;
        } else {
            if let Some(p) = outpath.parent() {
                fs::create_dir_all(p)?;
            }
            let mut outfile = fs::File::create(&outpath)?;
            std::io::copy(&mut entry, &mut outfile)?;
        }
    }

    Ok(format!("Prefix restored to {}", prefix.display()))
}

pub fn is_likely_removable_drive(library_path: &str) -> bool {
    let lower = library_path.to_lowercase();
    lower.contains("/run/media/")
        || lower.contains("/media/")
        || lower.starts_with("/mnt/")
        || (cfg!(windows) && (lower.starts_with("e:") || lower.starts_with("f:")))
}

fn find_prefix_for_app(app_id: u32) -> Option<PathBuf> {
    if let Ok(Some(steam)) = detect_steam() {
        for lib in steam.library_folders {
            if let Some(p) = proton_prefix_path(&lib, app_id) {
                if p.exists() {
                    return Some(p);
                }
            }
        }
    }
    None
}

fn launch_via_steam(app_id: u32) -> bool {
    if Command::new("steam")
        .args(["-applaunch", &app_id.to_string()])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
    {
        return true;
    }

    Command::new("flatpak")
        .args([
            "run",
            "com.valvesoftware.Steam",
            "-applaunch",
            &app_id.to_string(),
        ])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

fn dir_size_mb(path: &Path) -> u64 {
    WalkDir::new(path)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter_map(|e| e.metadata().ok())
        .map(|m| m.len())
        .sum::<u64>()
        / 1_048_576
}

fn path_writable(path: &Path) -> bool {
    if !path.exists() {
        return false;
    }
    let test = path.join(".nexusdeck_write_test");
    match fs::write(&test, b"ok") {
        Ok(()) => {
            let _ = fs::remove_file(test);
            true
        }
        Err(_) => false,
    }
}

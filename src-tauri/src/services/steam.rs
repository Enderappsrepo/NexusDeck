use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use steamlocate::SteamDir;

use crate::error::{NexusDeckError, Result};

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
    let steam_dir = match SteamDir::locate() {
        Ok(dir) => dir,
        Err(_) => return Ok(None),
    };

    let steam_path = steam_dir.path().display().to_string();
    let libraries: Vec<String> = steam_dir
        .libraries()
        .map_err(|e| NexusDeckError::Other(e.to_string()))?
        .filter_map(|lib| lib.ok())
        .map(|lib| lib.path().display().to_string())
        .collect();

    Ok(Some(SteamInstallInfo {
        steam_path,
        library_folders: libraries,
    }))
}

pub fn find_game_by_app_id(app_id: u32) -> Result<Vec<GameCandidate>> {
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

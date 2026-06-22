use std::path::{Path, PathBuf};

pub fn config_dir() -> PathBuf {
    dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("nexusdeck")
}

pub fn data_dir() -> PathBuf {
    dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("nexusdeck")
}

pub fn db_path() -> PathBuf {
    config_dir().join("nexusdeck.db")
}

pub fn default_staging_root() -> PathBuf {
    if cfg!(target_os = "windows") {
        dirs::document_dir()
            .unwrap_or_else(|| PathBuf::from("C:\\Users\\Public\\Documents"))
            .join("NexusDeck")
    } else {
        dirs::home_dir()
            .unwrap_or_else(|| PathBuf::from("/tmp"))
            .join("NexusDeck")
    }
}

pub fn default_staging_path(game_domain: &str) -> PathBuf {
    default_staging_root().join(game_domain)
}

pub fn ensure_dir(path: &Path) -> crate::error::Result<()> {
    if !path.exists() {
        std::fs::create_dir_all(path)?;
    }
    Ok(())
}

pub fn platform_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "Windows"
    } else if cfg!(target_os = "macos") {
        "macOS"
    } else {
        "Linux"
    }
}

pub fn preview_cache_dir() -> crate::error::Result<PathBuf> {
    Ok(data_dir().join("preview_cache"))
}

/// Writable scratch space for archive extraction during mod install (Flatpak-safe).
pub fn install_work_dir() -> crate::error::Result<PathBuf> {
    let dir = data_dir().join("install_work");
    ensure_dir(&dir)?;
    Ok(dir)
}

/// Extraction work dir on the SAME filesystem as the game, so deploy can hard
/// link extracted files into `Data/` instead of copying them. On Steam Deck the
/// game often lives on the SD card while the app data dir is on the internal
/// SSD; extracting there forces a cross-device copy of every file. Falls back to
/// the app data dir when a game-local work dir can't be created (e.g. a
/// read-only library).
pub fn game_work_dir(game_path: &str) -> crate::error::Result<PathBuf> {
    let game = Path::new(game_path);
    let base = game.parent().unwrap_or(game);
    let dir = base.join(".nexusdeck-work");
    match ensure_dir(&dir) {
        Ok(()) => Ok(dir),
        Err(_) => install_work_dir(),
    }
}

/// User-visible logs folder: ~/NexusDeck/Logs or Documents/NexusDeck/Logs.
pub fn logs_dir() -> crate::error::Result<PathBuf> {
    let dir = default_staging_root().join("Logs");
    ensure_dir(&dir)?;
    Ok(dir)
}

pub fn session_log_path() -> crate::error::Result<PathBuf> {
    Ok(logs_dir()?.join("session.log"))
}

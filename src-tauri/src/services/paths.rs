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

/// User-visible logs folder: ~/NexusDeck/Logs or Documents/NexusDeck/Logs.
pub fn logs_dir() -> crate::error::Result<PathBuf> {
    let dir = default_staging_root().join("Logs");
    ensure_dir(&dir)?;
    Ok(dir)
}

pub fn session_log_path() -> crate::error::Result<PathBuf> {
    Ok(logs_dir()?.join("session.log"))
}

use std::fs;
use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::db;
use crate::error::Result;
use crate::services::credentials;
use crate::services::host_command;
use crate::services::paths::{config_dir, data_dir, db_path, ensure_dir, preview_cache_dir};
use crate::services::platform;
use crate::services::steam_shortcut;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppResetResult {
    pub database_cleared: bool,
    pub api_key_cleared: bool,
    pub cache_cleared: bool,
    pub onboarding_reset: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppUninstallResult {
    pub data_cleared: bool,
    pub staging_cleared: bool,
    pub cache_cleared: bool,
    pub steam_shortcut_removed: bool,
    pub uninstall_scheduled: bool,
    pub message: String,
}

pub fn reset_app_data(clear_cache: bool) -> Result<AppResetResult> {
    let db_file = db_path();
    let database_cleared = if db_file.exists() {
        fs::remove_file(&db_file)?;
        true
    } else {
        false
    };

    init_fresh_db()?;

    credentials::delete_api_key()?;

    let mut cache_cleared = false;
    if clear_cache {
        cache_cleared = clear_app_cache_dirs();
    }

    Ok(AppResetResult {
        database_cleared,
        api_key_cleared: true,
        cache_cleared,
        onboarding_reset: true,
    })
}

pub fn prepare_uninstall(
    clear_all_data: bool,
    clear_staging: bool,
    clear_cache: bool,
) -> Result<AppUninstallResult> {
    let staging_paths: Vec<String> = if clear_staging {
        db::list_profiles()?
            .into_iter()
            .map(|p| p.staging_path)
            .filter(|p| !p.is_empty())
            .collect()
    } else {
        Vec::new()
    };

    let mut data_cleared = false;
    let mut cache_cleared = false;
    let mut staging_cleared = false;

    if clear_all_data {
        data_cleared = remove_dir_if_exists(&config_dir());
        cache_cleared = remove_dir_if_exists(&data_dir());
        credentials::delete_api_key()?;
    } else if clear_cache {
        cache_cleared = clear_app_cache_dirs();
    }

    if clear_staging {
        for path in staging_paths {
            if remove_dir_if_exists(Path::new(&path)) {
                staging_cleared = true;
            }
        }
    }

    let steam_shortcut_removed = steam_shortcut::remove_nexusdeck_from_steam_library().unwrap_or(false);
    let uninstall_scheduled = schedule_app_removal()?;

    let message = if uninstall_scheduled {
        if cfg!(target_os = "linux") {
            "NexusDeck will close and uninstall shortly. Restart Steam if the shortcut still appears."
                .into()
        } else {
            "NexusDeck data cleared. Remove the app from Windows Settings → Apps.".into()
        }
    } else if clear_all_data {
        "NexusDeck data cleared. Remove the app from your system settings.".into()
    } else {
        "NexusDeck will close. Your settings and mod library were kept.".into()
    };

    Ok(AppUninstallResult {
        data_cleared,
        staging_cleared,
        cache_cleared,
        steam_shortcut_removed,
        uninstall_scheduled,
        message,
    })
}

fn init_fresh_db() -> Result<()> {
    db::init_db()?;
    db::set_setting("onboarding_complete", "false")?;
    Ok(())
}

fn clear_app_cache_dirs() -> bool {
    let mut cleared = false;
    let mut dirs = vec![data_dir().join("install_work")];
    if let Ok(cache) = preview_cache_dir() {
        dirs.push(cache);
    }

    for dir in dirs {
        if dir.exists() {
            let _ = fs::remove_dir_all(&dir);
            cleared = true;
        }
        let _ = ensure_dir(&dir);
    }
    cleared
}

fn remove_dir_if_exists(path: &Path) -> bool {
    if path.exists() {
        let _ = fs::remove_dir_all(path);
        true
    } else {
        false
    }
}

fn schedule_app_removal() -> Result<bool> {
    if cfg!(target_os = "linux") {
        let script = if platform::is_flatpak_sandbox() {
            r#"nohup bash -lc 'sleep 2; flatpak uninstall -y --user com.nexusdeck.app 2>/dev/null || flatpak uninstall -y --user com.nexusdeck.app --delete-data 2>/dev/null; rm -rf "$HOME/.local/share/nexusdeck" 2>/dev/null; rm -f "$HOME/.local/bin/nexusdeck" 2>/dev/null; rm -f "$HOME/.local/share/applications/nexusdeck.desktop" 2>/dev/null' >/dev/null 2>&1 & echo scheduled"#
        } else {
            r#"nohup bash -lc 'sleep 2; flatpak uninstall -y --user com.nexusdeck.app 2>/dev/null || true; rm -rf "$HOME/.local/share/nexusdeck" 2>/dev/null; rm -f "$HOME/.local/bin/nexusdeck" 2>/dev/null' >/dev/null 2>&1 & echo scheduled"#
        };
        let output = host_command::run_bash(script, 10)?;
        return Ok(String::from_utf8_lossy(&output.stdout).contains("scheduled"));
    }

    if cfg!(target_os = "windows") {
        return Ok(false);
    }

    Ok(false)
}

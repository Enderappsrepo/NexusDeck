use std::fs;

use serde::{Deserialize, Serialize};

use crate::db;
use crate::error::Result;
use crate::services::credentials;
use crate::services::paths::{data_dir, db_path, ensure_dir, preview_cache_dir};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppResetResult {
    pub database_cleared: bool,
    pub api_key_cleared: bool,
    pub cache_cleared: bool,
    pub onboarding_reset: bool,
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

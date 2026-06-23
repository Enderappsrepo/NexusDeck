use tauri::AppHandle;

use crate::error::Result;
use crate::services::decky_host::{
    self, DeckyHostInstallResult, DeckyHostStatus, resolve_bundled_plugin_dir,
};

#[tauri::command]
pub async fn get_decky_host_status(app: AppHandle) -> Result<DeckyHostStatus> {
    let bundled = resolve_bundled_plugin_dir(&app);
    Ok(decky_host::get_decky_host_status(bundled.as_deref()))
}

#[tauri::command]
pub async fn install_decky_host_plugin(app: AppHandle) -> Result<DeckyHostInstallResult> {
    let bundled = resolve_bundled_plugin_dir(&app).ok_or_else(|| {
        crate::error::NexusDeckError::NotFound(
            "Bundled Decky plugin not found. Reinstall NexusDeck from a release build.".into(),
        )
    })?;
    tokio::task::spawn_blocking(move || decky_host::install_decky_host_plugin(&bundled))
        .await
        .map_err(|e| crate::error::NexusDeckError::Other(format!("Install failed: {e}")))?
}

use std::sync::Arc;

use tauri::{AppHandle, State};

use crate::error::Result;
use crate::services::app_reset::{self, AppResetResult, AppUninstallResult};
use crate::services::nexus_client::NexusClient;

#[tauri::command]
pub fn reset_app(
    clear_cache: bool,
    nexus: State<'_, Arc<NexusClient>>,
) -> Result<AppResetResult> {
    let result = app_reset::reset_app_data(clear_cache)?;
    nexus.set_api_key(None);
    Ok(result)
}

#[tauri::command]
pub fn uninstall_nexusdeck(
    clear_all_data: bool,
    clear_staging: bool,
    clear_cache: bool,
    nexus: State<'_, Arc<NexusClient>>,
) -> Result<AppUninstallResult> {
    let result = app_reset::prepare_uninstall(clear_all_data, clear_staging, clear_cache)?;
    nexus.set_api_key(None);
    Ok(result)
}

#[tauri::command]
pub fn exit_app(app: AppHandle) {
    app.exit(0);
}

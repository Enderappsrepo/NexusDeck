use std::sync::Arc;

use tauri::State;

use crate::error::Result;
use crate::services::app_reset::{self, AppResetResult};
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

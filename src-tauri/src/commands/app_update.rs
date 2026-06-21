use crate::error::Result;
use crate::services::app_update::{self, AppUpdateInfo};

#[tauri::command]
pub fn check_app_update() -> Result<AppUpdateInfo> {
    app_update::check_app_update()
}

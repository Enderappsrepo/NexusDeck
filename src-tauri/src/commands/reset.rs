use crate::error::Result;
use crate::services::profile_reset::{self, ResetProfileOptions};

#[tauri::command]
pub fn reset_profile_mods(
    profile_id: String,
    backup_before: bool,
    clear_staging: bool,
    clear_downloads: bool,
    reset_plugins_txt: bool,
) -> Result<profile_reset::ResetProfileResult> {
    profile_reset::reset_profile_mods(
        &profile_id,
        ResetProfileOptions {
            backup_before,
            clear_staging,
            clear_downloads,
            reset_plugins_txt,
        },
    )
}

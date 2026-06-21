use crate::error::Result;
use crate::services::mo2;

#[tauri::command]
pub fn detect_mo2() -> mo2::Mo2Status {
    mo2::detect_mo2()
}

#[tauri::command]
pub fn get_mo2_status(profile_id: String) -> Result<mo2::Mo2Status> {
    mo2::get_status(&profile_id)
}

#[tauri::command]
pub fn install_mo2(profile_id: String) -> Result<mo2::Mo2Status> {
    mo2::run_installer(&profile_id)
}

#[tauri::command]
pub fn configure_mo2_instance(
    profile_id: String,
    mods_path: Option<String>,
) -> Result<mo2::Mo2Status> {
    mo2::configure_instance(&profile_id, mods_path)
}

#[tauri::command]
pub fn get_mo2_skse_hint() -> String {
    crate::services::mo2::instance::skse_mo2_executable_hint()
}

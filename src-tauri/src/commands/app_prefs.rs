use crate::error::Result;
use crate::services::app_prefs::{self, AppPrefs, HardwareAccelerationMode};

#[tauri::command]
pub fn get_app_prefs() -> AppPrefs {
    app_prefs::load_app_prefs()
}

#[tauri::command]
pub fn set_hardware_acceleration(mode: HardwareAccelerationMode) -> Result<AppPrefs> {
    let mut prefs = app_prefs::load_app_prefs();
    prefs.hardware_acceleration = mode;
    app_prefs::save_app_prefs(&prefs)?;
    Ok(prefs)
}

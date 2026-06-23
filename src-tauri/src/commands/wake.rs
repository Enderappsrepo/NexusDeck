use crate::error::Result;
use crate::services::wake_lock;

#[tauri::command]
pub fn acquire_wake_lock(reason: String) -> Result<()> {
    wake_lock::acquire(&reason)
}

#[tauri::command]
pub fn release_wake_lock() -> Result<()> {
    wake_lock::release();
    Ok(())
}

#[tauri::command]
pub fn is_wake_lock_active() -> bool {
    wake_lock::is_active()
}

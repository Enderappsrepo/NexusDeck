use crate::services::platform;

#[tauri::command]
pub fn trigger_haptic(event: String) -> Result<(), String> {
    if !platform::is_steam_deck() {
        return Ok(());
    }
    log::info!("haptic event: {event}");
    Ok(())
}

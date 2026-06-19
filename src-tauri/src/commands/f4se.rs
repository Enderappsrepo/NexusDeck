use std::path::Path;

use crate::error::Result;
use crate::games::{script_extender_install_info, GameRegistry, ScriptExtenderInstallInfo, ScriptExtenderStatus};
use crate::games::script_extender_meta::ScriptExtenderMeta;
use crate::services::script_extender;

#[tauri::command]
pub fn detect_f4se(game_path: String) -> Result<ScriptExtenderStatus> {
    detect_script_extender("fallout4".to_string(), game_path)
}

#[tauri::command]
pub fn detect_script_extender(domain: String, game_path: String) -> Result<ScriptExtenderStatus> {
    if let Some(meta) = ScriptExtenderMeta::get(&domain) {
        return Ok(script_extender::detect_status(meta, Path::new(&game_path)));
    }
    let plugin = GameRegistry::get(&domain)?;
    Ok(plugin.detect_script_extender(Path::new(&game_path)))
}

#[tauri::command]
pub fn install_f4se(game_path: String, configure_steam_launcher: bool) -> Result<ScriptExtenderStatus> {
    install_script_extender("fallout4".to_string(), game_path, configure_steam_launcher)
}

#[tauri::command]
pub fn install_script_extender(
    domain: String,
    game_path: String,
    configure_steam_launcher: bool,
) -> Result<ScriptExtenderStatus> {
    script_extender::install(&domain, Path::new(&game_path), configure_steam_launcher)
}

#[tauri::command]
pub fn install_f4se_from_archive(
    game_path: String,
    archive_path: String,
    configure_steam_launcher: bool,
) -> Result<ScriptExtenderStatus> {
    install_script_extender_from_archive(
        "fallout4".to_string(),
        game_path,
        archive_path,
        configure_steam_launcher,
    )
}

#[tauri::command]
pub fn install_script_extender_from_archive(
    domain: String,
    game_path: String,
    archive_path: String,
    configure_steam_launcher: bool,
) -> Result<ScriptExtenderStatus> {
    script_extender::install_from_archive(
        &domain,
        Path::new(&game_path),
        Path::new(&archive_path),
        configure_steam_launcher,
    )
}

#[tauri::command]
pub fn get_f4se_install_info() -> Result<ScriptExtenderInstallInfo> {
    get_script_extender_install_info("fallout4".to_string())
}

#[tauri::command]
pub fn get_script_extender_install_info(domain: String) -> Result<ScriptExtenderInstallInfo> {
    script_extender_install_info(&domain)
        .ok_or_else(|| crate::error::NexusDeckError::GameNotFound(domain))
}

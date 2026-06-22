use crate::error::Result;
use crate::services::prefix_manager;
use crate::services::proton_audio;
use crate::services::proton_deps;

fn load_profile(profile_id: &str) -> Result<crate::db::Profile> {
    crate::db::get_profile(profile_id)?
        .ok_or_else(|| crate::error::NexusDeckError::NotFound("Profile not found".into()))
}

#[tauri::command]
pub fn get_protontricks_info() -> proton_deps::ProtontricksInfo {
    proton_deps::detect_protontricks()
}

#[tauri::command]
pub fn check_prefix_status(
    proton_prefix_path: Option<String>,
    my_games_folder: String,
) -> prefix_manager::PrefixStatus {
    prefix_manager::prefix_status(proton_prefix_path.as_deref(), &my_games_folder)
}

#[tauri::command]
pub fn bootstrap_vanilla_launch(app_id: u32) -> Result<prefix_manager::BootstrapResult> {
    prefix_manager::bootstrap_vanilla_launch(app_id)
}

#[tauri::command]
pub fn check_proton_version(app_id: u32) -> Result<prefix_manager::ProtonVersionInfo> {
    prefix_manager::check_proton_version(app_id)
}

#[tauri::command]
pub fn backup_proton_prefix(proton_prefix: String, dest_zip: String) -> Result<prefix_manager::PrefixBackupResult> {
    prefix_manager::backup_prefix(&proton_prefix, &dest_zip)
}

#[tauri::command]
pub fn restore_proton_prefix(proton_prefix: String, src_zip: String) -> Result<String> {
    prefix_manager::restore_prefix(&proton_prefix, &src_zip)
}

#[tauri::command]
pub fn detect_protontricks() -> proton_deps::ProtontricksInfo {
    proton_deps::detect_protontricks()
}

#[tauri::command]
pub fn install_proton_deps(game_domain: String, dry_run: bool) -> Result<proton_deps::ProtonDepsResult> {
    proton_deps::install_game_deps(&game_domain, dry_run)
}

#[tauri::command]
pub async fn get_bethesda_audio_status(profile_id: String) -> Result<proton_audio::BethesdaAudioStatus> {
    let profile_id = profile_id;
    tokio::task::spawn_blocking(move || {
        let profile = load_profile(&profile_id)?;
        proton_audio::get_bethesda_audio_status(&profile)
    })
    .await
    .map_err(|e| crate::error::NexusDeckError::Other(format!("Audio status failed: {e}")))?
}

#[tauri::command]
pub async fn fix_bethesda_audio(profile_id: String) -> Result<proton_audio::BethesdaAudioStatus> {
    tokio::task::spawn_blocking(move || {
        let profile = load_profile(&profile_id)?;
        proton_audio::ensure_bethesda_audio(&profile)
    })
    .await
    .map_err(|e| crate::error::NexusDeckError::Other(format!("Audio fix failed: {e}")))?
}

#[tauri::command]
pub fn backup_profile_prefix(profile_id: String, dest_zip: String) -> Result<prefix_manager::PrefixBackupResult> {
    crate::services::autofix::applicator::backup_prefix_to(&profile_id, &dest_zip)
}

#[tauri::command]
pub fn restore_profile_prefix(profile_id: String, src_zip: String) -> Result<String> {
    crate::services::autofix::applicator::restore_prefix_from(&profile_id, &src_zip)
}

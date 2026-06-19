use crate::db::{self, Profile};
use crate::error::Result;
use crate::games::{self, SupportedGameInfo, WizardStepResult};
use crate::services::paths::ensure_dir;
use crate::services::steam::{detect_steam, find_game_by_app_id, GameCandidate, SteamInstallInfo};

#[tauri::command]
pub fn detect_steam_install() -> Result<Option<SteamInstallInfo>> {
    detect_steam()
}

#[tauri::command]
pub fn find_steam_game(app_id: u32) -> Result<Vec<GameCandidate>> {
    find_game_by_app_id(app_id)
}

#[tauri::command]
pub fn detect_game(domain: String) -> Result<Vec<GameCandidate>> {
    games::detect_game(&domain)
}

#[tauri::command]
pub fn validate_game_path(domain: String, path: String) -> Result<()> {
    games::validate_game_path(&domain, &path)
}

#[tauri::command]
pub fn run_wizard_step(
    domain: String,
    step: String,
    payload: serde_json::Value,
) -> Result<WizardStepResult> {
    games::run_wizard_step(&domain, &step, payload)
}

#[tauri::command]
pub fn create_profile(
    game_domain: String,
    name: String,
    game_path: String,
    staging_path: String,
    proton_prefix_path: Option<String>,
) -> Result<Profile> {
    ensure_dir(std::path::Path::new(&staging_path))?;
    let profile = Profile {
        id: uuid::Uuid::new_v4().to_string(),
        game_domain,
        name,
        game_path,
        staging_path,
        proton_prefix_path,
        created_at: chrono::Utc::now().timestamp(),
    };
    db::save_profile(&profile)?;
    db::set_setting("onboarding_complete", "true")?;
    let _ = crate::services::launch_config::ensure_configs_for_profile(&profile.id, &profile.game_domain);
    Ok(profile)
}

#[tauri::command]
pub fn list_profiles() -> Result<Vec<Profile>> {
    db::list_profiles()
}

#[tauri::command]
pub fn get_profile(domain: String) -> Result<Option<Profile>> {
    db::get_profile_by_domain(&domain)
}

#[tauri::command]
pub fn is_onboarding_complete() -> Result<bool> {
    Ok(db::get_setting("onboarding_complete")?.as_deref() == Some("true"))
}

#[tauri::command]
pub fn list_supported_games() -> Result<Vec<SupportedGameInfo>> {
    Ok(games::GameRegistry::supported_games())
}

use std::collections::HashMap;

use crate::services::game_settings::{
    apply_game_settings as run_apply, apply_game_settings_preset as run_apply_preset,
    get_game_settings_schema as run_schema, get_game_settings_values as run_values,
    ApplyGameSettingsResult, GameSettingsSchema, GameSettingsValues,
};

#[tauri::command]
pub fn get_game_settings_schema(profile_id: String) -> Result<GameSettingsSchema, String> {
    run_schema(&profile_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_game_settings_values(profile_id: String) -> Result<GameSettingsValues, String> {
    run_values(&profile_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn apply_game_settings(
    profile_id: String,
    values: HashMap<String, String>,
) -> Result<ApplyGameSettingsResult, String> {
    run_apply(&profile_id, values).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn apply_game_settings_preset(
    profile_id: String,
    preset_id: String,
) -> Result<ApplyGameSettingsResult, String> {
    run_apply_preset(&profile_id, &preset_id).map_err(|e| e.to_string())
}

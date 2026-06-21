use crate::error::Result;
use crate::services::autofix;

#[tauri::command]
pub fn run_diagnostic_scan(profile_id: String) -> Result<autofix::DiagnosticScanResult> {
    autofix::run_scan(&profile_id)
}

#[tauri::command]
pub fn apply_autofix(profile_id: String, remedy_id: String) -> Result<autofix::ApplyFixesResult> {
    autofix::apply_fix(&profile_id, &remedy_id)
}

#[tauri::command]
pub fn apply_safe_autofixes(profile_id: String) -> Result<autofix::ApplyFixesResult> {
    autofix::apply_safe_fixes(&profile_id)
}

#[tauri::command]
pub fn list_autofix_remedies(game_domain: String) -> Result<Vec<autofix::rules::RemedyDefinition>> {
    autofix::list_remedies(&game_domain)
}

#[tauri::command]
pub fn export_diagnostic_markdown(profile_id: String) -> Result<String> {
    crate::services::autofix::applicator::export_diagnostic_markdown(&profile_id)
}

#[tauri::command]
pub fn get_game_manifest(domain: String) -> Result<crate::services::game_manifest::GameManifestEntry> {
    crate::services::game_manifest::get_game_manifest(&domain)
}

#[tauri::command]
pub fn list_game_manifests() -> Result<Vec<crate::services::game_manifest::GameManifestEntry>> {
    crate::services::game_manifest::load_manifest()
}

#[tauri::command]
pub fn get_wabbajack_checklist() -> Vec<String> {
    crate::services::mo2::wabbajack_checklist()
}

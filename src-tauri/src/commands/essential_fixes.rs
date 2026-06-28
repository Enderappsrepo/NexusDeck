use tauri::AppHandle;

use crate::error::Result;
use crate::services::essential_fixes::{
    self, EssentialFixesManifest, EssentialFixesResult,
};

#[tauri::command]
pub fn get_essential_fixes_manifest(domain: String) -> Result<EssentialFixesManifest> {
    essential_fixes::get_essential_fixes_manifest(&domain)
}

#[tauri::command]
pub async fn apply_essential_fixes(
    app: AppHandle,
    profile_id: String,
) -> Result<EssentialFixesResult> {
    let app = app.clone();
    let profile_id = profile_id.clone();
    tokio::task::spawn_blocking(move || essential_fixes::apply_essential_fixes(&app, &profile_id))
        .await
        .map_err(|e| crate::error::NexusDeckError::Other(format!("Essential fixes failed: {e}")))?
}

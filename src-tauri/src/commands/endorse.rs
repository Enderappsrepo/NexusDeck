use std::sync::Arc;

use tauri::State;

use crate::error::Result;
use crate::services::nexus_client::{NexusClient, TrackedMod, UserEndorsement};

#[tauri::command]
pub async fn endorse_mod(
    game_domain: String,
    mod_id: u64,
    version: String,
    nexus: State<'_, Arc<NexusClient>>,
) -> Result<()> {
    nexus.endorse_mod(&game_domain, mod_id, &version).await
}

#[tauri::command]
pub async fn abstain_mod(
    game_domain: String,
    mod_id: u64,
    nexus: State<'_, Arc<NexusClient>>,
) -> Result<()> {
    nexus.abstain_mod(&game_domain, mod_id).await
}

#[tauri::command]
pub async fn get_user_endorsements(
    nexus: State<'_, Arc<NexusClient>>,
) -> Result<Vec<UserEndorsement>> {
    nexus.get_user_endorsements().await
}

#[tauri::command]
pub async fn track_mod(
    game_domain: String,
    mod_id: u64,
    nexus: State<'_, Arc<NexusClient>>,
) -> Result<()> {
    nexus.track_mod(&game_domain, mod_id).await
}

#[tauri::command]
pub async fn list_tracked_mods(
    nexus: State<'_, Arc<NexusClient>>,
) -> Result<Vec<TrackedMod>> {
    nexus.list_tracked_mods().await
}

#[tauri::command]
pub async fn analyze_deck_profile(profile_id: String) -> Result<Vec<crate::services::deck_advisor::AdvisorFinding>> {
    crate::services::deck_advisor::analyze_profile(&profile_id)
}

#[tauri::command]
pub async fn export_modlist(
    profile_id: String,
    format: String,
) -> Result<crate::services::modlist_export::ModlistExport> {
    let mods = crate::db::list_installed_mods(&profile_id)?;
    Ok(crate::services::modlist_export::export_modlist(&mods, &format))
}

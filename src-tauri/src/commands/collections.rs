use std::sync::Arc;

use tauri::State;

use crate::error::Result;
use crate::services::collections;
use crate::services::nexus_client::{CollectionDetail, CollectionSummary, NexusClient};

#[tauri::command]
pub async fn list_collections(
    game_domain: String,
    offset: u32,
    count: u32,
    nexus: State<'_, Arc<NexusClient>>,
) -> Result<Vec<CollectionSummary>> {
    collections::list_collections(&nexus, &game_domain, offset, count).await
}

#[tauri::command]
pub async fn get_collection_detail(
    game_domain: String,
    slug: String,
    nexus: State<'_, Arc<NexusClient>>,
) -> Result<CollectionDetail> {
    collections::get_collection_detail(&nexus, &game_domain, &slug).await
}

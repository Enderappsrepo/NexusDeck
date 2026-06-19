use std::sync::Arc;

use tauri::State;

use crate::error::Result;
use crate::services::credentials::{delete_api_key, retrieve_api_key, store_api_key};
use crate::services::nexus_client::{NexusClient, NexusUser};

#[tauri::command]
pub async fn validate_and_store_api_key(
    key: String,
    nexus: State<'_, Arc<NexusClient>>,
) -> Result<NexusUser> {
    nexus.set_api_key(Some(key.clone()));
    let user = nexus.validate_api_key().await?;
    store_api_key(&key)?;
    Ok(user)
}

#[tauri::command]
pub async fn load_stored_api_key(nexus: State<'_, Arc<NexusClient>>) -> Result<Option<NexusUser>> {
    if let Some(key) = retrieve_api_key()? {
        nexus.set_api_key(Some(key));
        match nexus.validate_api_key().await {
            Ok(user) => Ok(Some(user)),
            Err(_) => {
                delete_api_key()?;
                nexus.set_api_key(None);
                Ok(None)
            }
        }
    } else {
        Ok(None)
    }
}

#[tauri::command]
pub fn check_has_api_key() -> Result<bool> {
    Ok(retrieve_api_key()?.is_some())
}

#[tauri::command]
pub fn clear_api_key(nexus: State<'_, Arc<NexusClient>>) -> Result<()> {
    delete_api_key()?;
    nexus.set_api_key(None);
    Ok(())
}

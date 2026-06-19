use std::sync::Arc;

use keyring::Entry;
use tauri::State;

use crate::error::{NexusDeckError, Result};
use crate::services::nexus_client::{NexusClient, NexusUser};

const SERVICE: &str = "com.nexusdeck.app";
const ACCOUNT: &str = "nexus_api_key";

fn store_api_key(key: &str) -> Result<()> {
    let entry = Entry::new(SERVICE, ACCOUNT)
        .map_err(|e| NexusDeckError::Keyring(e.to_string()))?;
    entry
        .set_password(key)
        .map_err(|e| NexusDeckError::Keyring(e.to_string()))?;
    Ok(())
}

fn retrieve_api_key() -> Result<Option<String>> {
    let entry = Entry::new(SERVICE, ACCOUNT)
        .map_err(|e| NexusDeckError::Keyring(e.to_string()))?;
    match entry.get_password() {
        Ok(key) => Ok(Some(key)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(NexusDeckError::Keyring(e.to_string())),
    }
}

fn delete_api_key() -> Result<()> {
    let entry = Entry::new(SERVICE, ACCOUNT)
        .map_err(|e| NexusDeckError::Keyring(e.to_string()))?;
    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(NexusDeckError::Keyring(e.to_string())),
    }
}

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

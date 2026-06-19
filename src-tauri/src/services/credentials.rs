use std::fs;
use std::path::Path;

use keyring::Entry;

use crate::error::{NexusDeckError, Result};
use crate::services::paths::{config_dir, ensure_dir};

const SERVICE: &str = "com.nexusdeck.app";
const ACCOUNT: &str = "nexus_api_key";
const FILE_NAME: &str = "api_key";

fn api_key_file_path() -> std::path::PathBuf {
    config_dir().join(FILE_NAME)
}

#[cfg(unix)]
fn restrict_permissions(path: &Path) -> Result<()> {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(path, fs::Permissions::from_mode(0o600))?;
    Ok(())
}

#[cfg(not(unix))]
fn restrict_permissions(_path: &Path) -> Result<()> {
    Ok(())
}

fn store_api_key_file(key: &str) -> Result<()> {
    ensure_dir(&config_dir())?;
    let path = api_key_file_path();
    fs::write(&path, key)?;
    restrict_permissions(&path)?;
    Ok(())
}

fn retrieve_api_key_file() -> Result<Option<String>> {
    let path = api_key_file_path();
    if !path.exists() {
        return Ok(None);
    }
    let key = fs::read_to_string(&path)?.trim().to_string();
    if key.is_empty() {
        Ok(None)
    } else {
        Ok(Some(key))
    }
}

fn delete_api_key_file() -> Result<()> {
    let path = api_key_file_path();
    if path.exists() {
        fs::remove_file(path)?;
    }
    Ok(())
}

fn store_api_key_keyring(key: &str) -> Result<()> {
    let entry = Entry::new(SERVICE, ACCOUNT)
        .map_err(|e| NexusDeckError::Keyring(e.to_string()))?;
    entry
        .set_password(key)
        .map_err(|e| NexusDeckError::Keyring(e.to_string()))
}

fn retrieve_api_key_keyring() -> Result<Option<String>> {
    let entry = Entry::new(SERVICE, ACCOUNT)
        .map_err(|e| NexusDeckError::Keyring(e.to_string()))?;
    match entry.get_password() {
        Ok(key) => Ok(Some(key)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(NexusDeckError::Keyring(e.to_string())),
    }
}

fn delete_api_key_keyring() -> Result<()> {
    let entry = Entry::new(SERVICE, ACCOUNT)
        .map_err(|e| NexusDeckError::Keyring(e.to_string()))?;
    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(NexusDeckError::Keyring(e.to_string())),
    }
}

/// Store the API key in the OS keyring, falling back to a local config file on Flatpak/SteamOS.
pub fn store_api_key(key: &str) -> Result<()> {
    match store_api_key_keyring(key) {
        Ok(()) => {
            let _ = delete_api_key_file();
            Ok(())
        }
        Err(e) => {
            log::warn!("OS keyring unavailable ({e}), storing API key in app config");
            store_api_key_file(key)
        }
    }
}

/// Load the API key from the OS keyring or local config fallback.
pub fn retrieve_api_key() -> Result<Option<String>> {
    match retrieve_api_key_keyring() {
        Ok(Some(key)) => Ok(Some(key)),
        Ok(None) => retrieve_api_key_file(),
        Err(e) => {
            log::warn!("OS keyring unavailable ({e}), loading API key from app config");
            retrieve_api_key_file()
        }
    }
}

/// Remove the API key from all storage backends.
pub fn delete_api_key() -> Result<()> {
    let _ = delete_api_key_keyring();
    delete_api_key_file()
}

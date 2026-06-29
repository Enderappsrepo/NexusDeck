use std::sync::Arc;

use tauri::{AppHandle, State};

use crate::error::Result;
use crate::services::install_manager::InstallManager;
use crate::services::remote_sync::{
    self, DiscoveredDeck, ReceiverStatus, RemoteModInstallMeta, RemoteTransferResult,
};

// --- Receiver (run on the Deck: "let my PC send mods here") -----------------

#[tauri::command]
pub fn start_remote_receiver(
    device_name: String,
    app: AppHandle,
    installs: State<'_, Arc<InstallManager>>,
) -> Result<ReceiverStatus> {
    remote_sync::set_receiver_context(app, installs.inner().clone());
    remote_sync::start_receiver(&device_name)
}

#[tauri::command]
pub fn stop_remote_receiver() -> ReceiverStatus {
    remote_sync::stop_receiver()
}

#[tauri::command]
pub fn get_remote_receiver_status() -> ReceiverStatus {
    remote_sync::receiver_status()
}

// --- Sender (run on the PC: "send to my Deck") ------------------------------

#[tauri::command]
pub fn discover_decks() -> Result<Vec<DiscoveredDeck>> {
    remote_sync::discover_decks(2500)
}

#[tauri::command]
pub fn pair_with_deck(host: String, port: u16, code: String) -> Result<String> {
    remote_sync::pair_with_deck(&host, port, &code)
}

#[tauri::command]
pub fn ping_deck(host: String, port: u16) -> Result<DiscoveredDeck> {
    remote_sync::ping_deck(&host, port)
}

#[tauri::command]
pub fn send_mod_to_deck(
    host: String,
    port: u16,
    token: String,
    archive_path: String,
    meta: RemoteModInstallMeta,
) -> Result<RemoteTransferResult> {
    remote_sync::send_mod_to_deck(&host, port, &token, &archive_path, meta)
}

#[tauri::command]
pub fn send_presets_to_deck(
    host: String,
    port: u16,
    token: String,
    profile_id: String,
) -> Result<RemoteTransferResult> {
    remote_sync::send_presets_to_deck(&host, port, &token, &profile_id)
}

#[tauri::command]
pub fn send_load_order_to_deck(
    host: String,
    port: u16,
    token: String,
    profile_id: String,
) -> Result<RemoteTransferResult> {
    let payload = remote_sync::build_load_order_payload(&profile_id)?;
    remote_sync::send_load_order_to_deck(&host, port, &token, payload)
}

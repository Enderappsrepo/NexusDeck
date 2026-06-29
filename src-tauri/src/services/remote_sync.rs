//! Remote PC↔Deck install — LAN discovery, pairing, and content transfer.
//!
//! Phase 1: UDP discovery + HTTP pairing on TCP 8731.
//! Phase 2: Authenticated transfers (mods, BodySlide presets, load order) over the
//! paired connection, reusing the existing install pipeline on the Deck receiver.

use std::collections::HashMap;
use std::net::UdpSocket;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tauri::{async_runtime, AppHandle, Manager};
use walkdir::WalkDir;

use crate::commands::deploy::{self, InstallOptions};
use crate::db::{self, Profile};
use crate::error::{NexusDeckError, Result};
use crate::services::install_manager::InstallManager;
use crate::services::mod_state::apply_mod_enabled_state;
use crate::services::paths;
use crate::services::plugins_txt;
use crate::services::credentials;
use crate::services::tools;

/// UDP port the receiver answers discovery probes on.
const DISCOVERY_PORT: u16 = 8732;
/// TCP port the receiver's HTTP API listens on.
const HTTP_PORT: u16 = 8731;
/// Probe payload a sender broadcasts; the receiver replies with its info JSON.
const DISCOVERY_MAGIC: &str = "NEXUSDECK_DISCOVER_V1";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiscoveredDeck {
    pub name: String,
    pub host: String,
    pub http_port: u16,
    pub version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReceiverStatus {
    pub running: bool,
    pub pair_code: String,
    pub http_port: u16,
    pub paired: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemoteTransferResult {
    pub ok: bool,
    pub message: String,
    #[serde(default)]
    pub mod_id: Option<String>,
    #[serde(default)]
    pub files_sent: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemoteModInstallMeta {
    pub game_domain: String,
    pub mod_name: String,
    pub nexus_mod_id: i64,
    pub nexus_file_id: i64,
    pub filename: String,
    #[serde(default)]
    pub options: InstallOptions,
    #[serde(default)]
    pub category: Option<String>,
    #[serde(default)]
    pub tags: Option<Vec<String>>,
    #[serde(default)]
    pub file_version: Option<String>,
    #[serde(default)]
    pub replace_mod_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemoteLoadOrderEntry {
    pub nexus_mod_id: i64,
    pub enabled: bool,
    pub sort_order: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemoteLoadOrderPayload {
    pub game_domain: String,
    pub mods: Vec<RemoteLoadOrderEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemotePresetMeta {
    pub game_domain: String,
}

/// Ask the Deck to download + install a mod from Nexus (no archive upload).
/// Ideal for phone/tablet companions on the same Wi-Fi.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemoteNexusInstallMeta {
    pub game_domain: String,
    pub nexus_mod_id: i64,
    pub nexus_file_id: i64,
    pub mod_name: String,
    pub file_name: String,
    pub expected_size_kb: u64,
    #[serde(default)]
    pub file_version: Option<String>,
}

struct Receiver {
    running: Arc<AtomicBool>,
    pair_code: String,
    token: Arc<Mutex<Option<String>>>,
    http_port: u16,
    http_thread: std::thread::JoinHandle<()>,
    udp_thread: std::thread::JoinHandle<()>,
}

pub struct ReceiverContext {
    pub app: AppHandle,
    pub installs: Arc<InstallManager>,
    pub downloads: Arc<crate::services::download_manager::DownloadManager>,
    pub nexus: Arc<crate::services::nexus_client::NexusClient>,
}

struct MultipartField {
    name: String,
    filename: Option<String>,
    data: Vec<u8>,
}

fn slot() -> &'static Mutex<Option<Receiver>> {
    static RECEIVER: OnceLock<Mutex<Option<Receiver>>> = OnceLock::new();
    RECEIVER.get_or_init(|| Mutex::new(None))
}

fn context_slot() -> &'static Mutex<Option<ReceiverContext>> {
    static CTX: OnceLock<Mutex<Option<ReceiverContext>>> = OnceLock::new();
    CTX.get_or_init(|| Mutex::new(None))
}

pub fn set_receiver_context(
    app: AppHandle,
    installs: Arc<InstallManager>,
    downloads: Arc<crate::services::download_manager::DownloadManager>,
    nexus: Arc<crate::services::nexus_client::NexusClient>,
) {
    *context_slot().lock().unwrap() = Some(ReceiverContext {
        app,
        installs,
        downloads,
        nexus,
    });
}

pub fn receiver_context() -> Option<ReceiverContext> {
    context_slot()
        .lock()
        .unwrap()
        .as_ref()
        .map(|c| ReceiverContext {
            app: c.app.clone(),
            installs: c.installs.clone(),
            downloads: c.downloads.clone(),
            nexus: c.nexus.clone(),
        })
}

fn idle_status() -> ReceiverStatus {
    ReceiverStatus {
        running: false,
        pair_code: String::new(),
        http_port: HTTP_PORT,
        paired: false,
    }
}

fn gen_code() -> String {
    let b = uuid::Uuid::new_v4().into_bytes();
    let n = u32::from_le_bytes([b[0], b[1], b[2], b[3]]) % 1_000_000;
    format!("{n:06}")
}

fn json_response(status: u16, body: String) -> tiny_http::Response<std::io::Cursor<Vec<u8>>> {
    let header =
        tiny_http::Header::from_bytes(&b"Content-Type"[..], &b"application/json"[..]).unwrap();
    let cors = tiny_http::Header::from_bytes(&b"Access-Control-Allow-Origin"[..], &b"*"[..]).unwrap();
    let cors_headers = tiny_http::Header::from_bytes(
        &b"Access-Control-Allow-Headers"[..],
        &b"Authorization, Content-Type"[..],
    )
    .unwrap();
    tiny_http::Response::from_string(body)
        .with_status_code(status)
        .with_header(header)
        .with_header(cors)
        .with_header(cors_headers)
}

fn bearer_token(req: &tiny_http::Request) -> Option<String> {
    req.headers()
        .iter()
        .find(|h| h.field.equiv("Authorization"))
        .and_then(|h| {
            h.value
                .as_str()
                .strip_prefix("Bearer ")
                .map(str::trim)
                .filter(|t| !t.is_empty())
                .map(String::from)
        })
}

fn authorized(req: &tiny_http::Request, token: &Arc<Mutex<Option<String>>>) -> bool {
    let Some(expected) = token.lock().ok().and_then(|t| t.clone()) else {
        return false;
    };
    bearer_token(req).as_deref() == Some(expected.as_str())
}

fn unauthorized(req: tiny_http::Request) {
    let _ = req.respond(json_response(
        401,
        serde_json::json!({ "error": "Unauthorized — pair with this device first." }).to_string(),
    ));
}

fn query_params(url: &str) -> HashMap<String, String> {
    let Some(query) = url.split('?').nth(1) else {
        return HashMap::new();
    };
    query
        .split('&')
        .filter_map(|pair| {
            let (key, value) = pair.split_once('=')?;
            let key = urlencoding::decode(key).ok()?.into_owned();
            let value = urlencoding::decode(value).ok()?.into_owned();
            Some((key, value))
        })
        .collect()
}

fn nexus_configured() -> bool {
    credentials::retrieve_api_key()
        .ok()
        .flatten()
        .is_some()
}

fn receiver_games() -> Vec<serde_json::Value> {
    db::list_profiles()
        .unwrap_or_default()
        .into_iter()
        .map(|p| {
            serde_json::json!({
                "domain": p.game_domain,
                "name": p.name,
            })
        })
        .collect()
}

fn mime_for(path: &str) -> &'static str {
    if path.ends_with(".js") {
        "application/javascript; charset=utf-8"
    } else if path.ends_with(".css") {
        "text/css; charset=utf-8"
    } else if path.ends_with(".svg") {
        "image/svg+xml"
    } else if path.ends_with(".png") {
        "image/png"
    } else if path.ends_with(".ico") {
        "image/x-icon"
    } else {
        "text/html; charset=utf-8"
    }
}

fn bytes_response(status: u16, content_type: &str, body: Vec<u8>) -> tiny_http::Response<std::io::Cursor<Vec<u8>>> {
    let header =
        tiny_http::Header::from_bytes(&b"Content-Type"[..], content_type.as_bytes()).unwrap();
    let cors = tiny_http::Header::from_bytes(&b"Access-Control-Allow-Origin"[..], &b"*"[..]).unwrap();
    tiny_http::Response::from_data(body)
        .with_status_code(status)
        .with_header(header)
        .with_header(cors)
}

fn respond_json_result(mut req: tiny_http::Request, result: Result<String>) {
    match result {
        Ok(body) => {
            let _ = req.respond(json_response(200, body));
        }
        Err(e) => {
            let _ = req.respond(json_response(
                400,
                serde_json::json!({ "error": e.to_string() }).to_string(),
            ));
        }
    }
}

fn respond_install_session_start(mut req: tiny_http::Request) {
    let mut body = String::new();
    if req.as_reader().read_to_string(&mut body).is_err() {
        let _ = req.respond(json_response(
            400,
            serde_json::json!({ "error": "Couldn't read request body." }).to_string(),
        ));
        return;
    }
    match serde_json::from_str::<crate::services::remote_companion::StartInstallSessionBody>(&body) {
        Ok(payload) => match crate::services::remote_companion::start_install_session(payload) {
            Ok(status) => {
                let _ = req.respond(json_response(
                    200,
                    serde_json::to_string(&status).unwrap_or_else(|_| "{}".to_string()),
                ));
            }
            Err(e) => {
                let _ = req.respond(json_response(
                    400,
                    serde_json::json!({ "error": e.to_string() }).to_string(),
                ));
            }
        },
        Err(e) => {
            let _ = req.respond(json_response(
                400,
                serde_json::json!({ "error": format!("Invalid JSON: {e}") }).to_string(),
            ));
        }
    }
}

fn respond_install_session_confirm(mut req: tiny_http::Request, url: &str) {
    let session_id = url
        .strip_prefix("/install/session/")
        .and_then(|rest| rest.strip_suffix("/confirm"))
        .unwrap_or("")
        .split('?')
        .next()
        .unwrap_or("")
        .to_string();
    let mut body = String::new();
    if req.as_reader().read_to_string(&mut body).is_err() {
        let _ = req.respond(json_response(
            400,
            serde_json::json!({ "error": "Couldn't read request body." }).to_string(),
        ));
        return;
    }
    let confirm: crate::services::remote_companion::ConfirmInstallSessionBody =
        serde_json::from_str(&body).unwrap_or_default();
    match crate::services::remote_companion::confirm_install_session(&session_id, confirm) {
        Ok(status) => {
            let _ = req.respond(json_response(
                200,
                serde_json::to_string(&status).unwrap_or_else(|_| "{}".to_string()),
            ));
        }
        Err(e) => {
            let _ = req.respond(json_response(
                400,
                serde_json::json!({ "error": e.to_string() }).to_string(),
            ));
        }
    }
}

fn serve_companion_app(mut req: tiny_http::Request) {
    let Some(ctx) = receiver_context() else {
        let _ = req.respond(json_response(
            503,
            serde_json::json!({ "error": "Remote receiver isn't fully initialized." }).to_string(),
        ));
        return;
    };
    let url_path = req.url().split('?').next().unwrap_or("/app/");
    match crate::services::remote_companion::serve_companion_file(&ctx.app, url_path) {
        Ok((bytes, mime)) => {
            let _ = req.respond(bytes_response(200, mime, bytes));
        }
        Err(e) => {
            let _ = req.respond(json_response(
                404,
                serde_json::json!({ "error": e.to_string() }).to_string(),
            ));
        }
    }
}

fn handle_search_mods(domain: &str, query: &str) -> Result<String> {
    let ctx = receiver_context().ok_or_else(|| {
        NexusDeckError::Other("Remote receiver isn't fully initialized.".into())
    })?;
    if !nexus_configured() {
        return Err(NexusDeckError::Other(
            "Sign in with your Nexus API key in NexusDeck Settings on this device first.".into(),
        ));
    }
    let _profile = profile_for_domain(domain)?;
    let mods = async_runtime::block_on(ctx.nexus.search_mods(domain, query, "downloads", 0, 20))?;
    Ok(serde_json::to_string(&mods).unwrap_or_else(|_| "[]".to_string()))
}

fn handle_mod_files(domain: &str, mod_id: u64) -> Result<String> {
    let ctx = receiver_context().ok_or_else(|| {
        NexusDeckError::Other("Remote receiver isn't fully initialized.".into())
    })?;
    if !nexus_configured() {
        return Err(NexusDeckError::Other(
            "Sign in with your Nexus API key in NexusDeck Settings on this device first.".into(),
        ));
    }
    let _profile = profile_for_domain(domain)?;
    let files = async_runtime::block_on(ctx.nexus.get_mod_files(domain, mod_id))?;
    Ok(serde_json::to_string(&files).unwrap_or_else(|_| "[]".to_string()))
}

fn enqueue_nexus_install(meta: RemoteNexusInstallMeta) -> Result<RemoteTransferResult> {
    let ctx = receiver_context().ok_or_else(|| {
        NexusDeckError::Other("Remote receiver isn't fully initialized.".into())
    })?;
    let profile = profile_for_domain(&meta.game_domain)?;
    let mod_name = meta.mod_name.clone();

    let app = ctx.app.clone();
    let downloads = ctx.downloads.clone();
    let nexus = ctx.nexus.clone();
    let staging = std::path::PathBuf::from(&profile.staging_path);
    let profile_id = profile.id.clone();
    let game_domain = meta.game_domain.clone();
    let file_name = meta.file_name.clone();
    let mod_name_task = mod_name.clone();

    async_runtime::spawn(async move {
        match downloads
            .enqueue_download(
                app,
                nexus,
                &game_domain,
                meta.nexus_mod_id as u64,
                meta.nexus_file_id as u64,
                &file_name,
                staging.as_path(),
                meta.expected_size_kb,
                &mod_name_task,
                &profile_id,
                None,
                0,
            )
            .await
        {
            Ok(progress) => {
                downloads.mark_auto_install(&progress.id);
            }
            Err(e) => {
                log::warn!("[remote_sync] nexus install enqueue failed: {e}");
            }
        }
    });

    Ok(RemoteTransferResult {
        ok: true,
        message: format!(
            "Downloading \"{mod_name}\" on this device — it will install automatically when the download finishes."
        ),
        mod_id: None,
        files_sent: 1,
    })
}

fn profile_for_domain(domain: &str) -> Result<Profile> {
    db::list_profiles()?
        .into_iter()
        .find(|p| p.game_domain == domain)
        .ok_or_else(|| {
            NexusDeckError::NotFound(format!(
                "No game profile for \"{domain}\" on this device. Set up the game on the Deck first."
            ))
        })
}

fn bodyslide_dir_for_profile(profile: &Profile) -> Result<PathBuf> {
    let info = tools::detect_bodyslide(&profile.id)?;
    let dir = info
        .found_at
        .or(info.working_dir)
        .ok_or_else(|| {
            NexusDeckError::NotFound(
                "BodySlide isn't installed on this device. Deploy BodySlide to the game first."
                    .into(),
            )
        })?;
    Ok(PathBuf::from(dir))
}

fn collect_preset_files(bodyslide_dir: &Path) -> Result<Vec<(String, Vec<u8>)>> {
    let mut out = Vec::new();
    for sub in ["SliderGroups", "SliderSets", "SliderPresets"] {
        let base = bodyslide_dir.join(sub);
        if !base.is_dir() {
            continue;
        }
        for entry in WalkDir::new(&base).max_depth(4).into_iter().filter_map(|e| e.ok()) {
            if !entry.file_type().is_file() {
                continue;
            }
            let path = entry.path();
            let ext = path
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("")
                .to_ascii_lowercase();
            if ext != "xml" && ext != "osp" {
                continue;
            }
            let rel = path
                .strip_prefix(bodyslide_dir)
                .map_err(|e| NexusDeckError::Other(e.to_string()))?;
            let rel_s = rel.to_string_lossy().replace('\\', "/");
            let data = std::fs::read(path)?;
            out.push((rel_s, data));
        }
    }
    Ok(out)
}

fn install_presets(profile: &Profile, files: &[(String, Vec<u8>)]) -> Result<usize> {
    if files.is_empty() {
        return Err(NexusDeckError::Other(
            "No preset files were included in the transfer.".into(),
        ));
    }
    let bodyslide_dir = bodyslide_dir_for_profile(profile)?;
    for (rel, data) in files {
        let dest = bodyslide_dir.join(rel);
        if let Some(parent) = dest.parent() {
            paths::ensure_dir(parent)?;
        }
        std::fs::write(&dest, data)?;
    }
    Ok(files.len())
}

fn apply_remote_load_order(payload: &RemoteLoadOrderPayload) -> Result<RemoteTransferResult> {
    let profile = profile_for_domain(&payload.game_domain)?;
    let installed = db::list_installed_mods(&profile.id)?;
    if installed.is_empty() {
        return Err(NexusDeckError::Other(
            "No installed mods on the Deck to reorder.".into(),
        ));
    }

    let mut by_nexus: HashMap<i64, db::InstalledMod> = HashMap::new();
    for m in installed {
        if m.nexus_mod_id > 0 {
            by_nexus.entry(m.nexus_mod_id).or_insert(m);
        }
    }

    let mut ordered_ids: Vec<String> = Vec::new();
    let mut unmatched = 0u32;
    let mut payload_sorted = payload.mods.clone();
    payload_sorted.sort_by_key(|e| e.sort_order);

    for entry in &payload_sorted {
        if let Some(m) = by_nexus.get(&entry.nexus_mod_id) {
            ordered_ids.push(m.id.clone());
        } else {
            unmatched += 1;
        }
    }

    for m in db::list_installed_mods(&profile.id)? {
        if !ordered_ids.iter().any(|id| id == &m.id) {
            ordered_ids.push(m.id.clone());
        }
    }

    if ordered_ids.is_empty() {
        return Err(NexusDeckError::Other(
            "None of the PC load-order mods match mods installed on the Deck.".into(),
        ));
    }

    db::set_mod_sort_orders(&profile.id, &ordered_ids)?;

    for entry in &payload_sorted {
        let Some(m) = by_nexus.get(&entry.nexus_mod_id) else {
            continue;
        };
        if m.enabled == entry.enabled {
            continue;
        }
        apply_mod_enabled_state(&profile, m, entry.enabled)?;
        db::set_mod_enabled(&m.id, entry.enabled)?;
    }

    plugins_txt::sync_plugins_txt(&profile)?;

    let mut message = format!("Applied load order for {} mod(s).", ordered_ids.len());
    if unmatched > 0 {
        message.push_str(&format!(" {unmatched} PC mod(s) weren't on the Deck and were skipped."));
    }

    Ok(RemoteTransferResult {
        ok: true,
        message,
        mod_id: None,
        files_sent: ordered_ids.len() as u32,
    })
}

fn parse_multipart(content_type: &str, body: &[u8]) -> Result<Vec<MultipartField>> {
    let boundary = content_type
        .split("boundary=")
        .nth(1)
        .ok_or_else(|| NexusDeckError::Other("Missing multipart boundary.".into()))?
        .trim()
        .trim_matches('"')
        .trim_matches('\'');
    let marker = format!("--{boundary}");
    let body_str = String::from_utf8_lossy(body);
    let mut parts = Vec::new();

    for chunk in body_str.split(&marker).skip(1) {
        let chunk = chunk.trim_start_matches("\r\n").trim_start_matches('\n');
        if chunk.is_empty() || chunk.starts_with("--") {
            continue;
        }
        let (headers, data) = chunk
            .split_once("\r\n\r\n")
            .or_else(|| chunk.split_once("\n\n"))
            .ok_or_else(|| NexusDeckError::Other("Invalid multipart part.".into()))?;
        let data = data
            .trim_end_matches("\r\n--")
            .trim_end_matches("\n--")
            .trim_end_matches("\r\n")
            .trim_end_matches('\n');
        let mut name = String::new();
        let mut filename = None;
        for line in headers.lines() {
            let lower = line.to_ascii_lowercase();
            if lower.starts_with("content-disposition:") {
                for segment in line.split(';') {
                    let segment = segment.trim();
                    if let Some(n) = segment.strip_prefix("name=") {
                        name = n.trim_matches('"').to_string();
                    } else if let Some(f) = segment.strip_prefix("filename=") {
                        filename = Some(f.trim_matches('"').to_string());
                    }
                }
            }
        }
        if name.is_empty() {
            continue;
        }
        parts.push(MultipartField {
            name,
            filename,
            data: data.as_bytes().to_vec(),
        });
    }
    Ok(parts)
}

// ---- Receiver (the Deck) ---------------------------------------------------

pub fn start_receiver(device_name: &str) -> Result<ReceiverStatus> {
    let mut guard = slot().lock().unwrap();
    if let Some(r) = guard.as_ref() {
        if r.running.load(Ordering::SeqCst) {
            return Ok(r.status());
        }
    }
    // Prior instance may still hold the ports until its threads exit — wait for them.
    if let Some(r) = guard.take() {
        r.shutdown();
    }

    let server = tiny_http::Server::http(("0.0.0.0", HTTP_PORT)).map_err(|e| {
        NexusDeckError::Other(format!(
            "Couldn't start the remote-install server (port {HTTP_PORT} may still be in use — wait a moment and try again): {e}"
        ))
    })?;

    let running = Arc::new(AtomicBool::new(true));
    let token: Arc<Mutex<Option<String>>> = Arc::new(Mutex::new(None));
    let code = gen_code();
    let name = if device_name.trim().is_empty() {
        "Steam Deck".to_string()
    } else {
        device_name.trim().to_string()
    };

    let http_running = running.clone();
    let http_token = token.clone();
    let http_code = code.clone();
    let http_name = name.clone();
    let http_thread = std::thread::spawn(move || {
        http_loop(server, http_running, http_token, http_code, http_name);
    });

    let udp_running = running.clone();
    let udp_name = name.clone();
    let udp_thread = std::thread::spawn(move || udp_loop(udp_running, udp_name));

    let receiver = Receiver {
        running,
        pair_code: code,
        token,
        http_port: HTTP_PORT,
        http_thread,
        udp_thread,
    };
    let status = receiver.status();
    *guard = Some(receiver);
    Ok(status)
}

pub fn stop_receiver() -> ReceiverStatus {
    let mut guard = slot().lock().unwrap();
    if let Some(r) = guard.take() {
        r.shutdown();
    }
    idle_status()
}

pub fn receiver_status() -> ReceiverStatus {
    slot()
        .lock()
        .unwrap()
        .as_ref()
        .map(Receiver::status)
        .unwrap_or_else(idle_status)
}

impl Receiver {
    fn status(&self) -> ReceiverStatus {
        ReceiverStatus {
            running: self.running.load(Ordering::SeqCst),
            pair_code: self.pair_code.clone(),
            http_port: self.http_port,
            paired: self.token.lock().map(|t| t.is_some()).unwrap_or(false),
        }
    }

    /// Stop listener threads and release TCP/UDP ports before returning.
    fn shutdown(self) {
        self.running.store(false, Ordering::SeqCst);
        let _ = self.http_thread.join();
        let _ = self.udp_thread.join();
    }
}

fn http_loop(
    server: tiny_http::Server,
    running: Arc<AtomicBool>,
    token: Arc<Mutex<Option<String>>>,
    code: String,
    name: String,
) {
    while running.load(Ordering::SeqCst) {
        match server.recv_timeout(Duration::from_millis(500)) {
            Ok(Some(req)) => handle_request(req, &token, &code, &name),
            Ok(None) => continue,
            Err(_) => break,
        }
    }
}

fn handle_request(
    mut req: tiny_http::Request,
    token: &Arc<Mutex<Option<String>>>,
    code: &str,
    name: &str,
) {
    let url = req.url().to_string();
    let is_get = req.method() == &tiny_http::Method::Get;
    let is_post = req.method() == &tiny_http::Method::Post;
    let is_options = req.method() == &tiny_http::Method::Options;

    if is_options {
        let cors_methods =
            tiny_http::Header::from_bytes(&b"Access-Control-Allow-Methods"[..], &b"GET, POST, OPTIONS"[..])
                .unwrap();
        let _ = req.respond(
            tiny_http::Response::empty(204)
                .with_header(tiny_http::Header::from_bytes(&b"Access-Control-Allow-Origin"[..], &b"*"[..]).unwrap())
                .with_header(
                    tiny_http::Header::from_bytes(
                        &b"Access-Control-Allow-Headers"[..],
                        &b"Authorization, Content-Type"[..],
                    )
                    .unwrap(),
                )
                .with_header(cors_methods),
        );
        return;
    }

    if is_get && url.starts_with("/ping") {
        let paired = token.lock().map(|t| t.is_some()).unwrap_or(false);
        let body = serde_json::json!({
            "name": name,
            "version": env!("CARGO_PKG_VERSION"),
            "paired": paired,
            "nexus_configured": nexus_configured(),
            "games": crate::services::remote_companion::list_companion_games()
                .unwrap_or_default(),
            "companion_url": "/app/",
        })
        .to_string();
        let _ = req.respond(json_response(200, body));
        return;
    }

    if is_get && (url == "/app" || url.starts_with("/app?")) {
        let location =
            tiny_http::Header::from_bytes(&b"Location"[..], &b"/app/"[..]).unwrap();
        let _ = req.respond(tiny_http::Response::empty(302).with_header(location));
        return;
    }

    if is_get && url.starts_with("/app/") {
        serve_companion_app(req);
        return;
    }

    if is_get && url.starts_with("/games/list") {
        match crate::services::remote_companion::list_companion_games() {
            Ok(games) => {
                let _ = req.respond(json_response(
                    200,
                    serde_json::to_string(&games).unwrap_or_else(|_| "[]".to_string()),
                ));
            }
            Err(e) => {
                let _ = req.respond(json_response(
                    400,
                    serde_json::json!({ "error": e.to_string() }).to_string(),
                ));
            }
        }
        return;
    }

    if is_get && url.starts_with("/search/mods") {
        if !authorized(&req, token) {
            unauthorized(req);
            return;
        }
        let params = query_params(&url);
        let domain = params.get("domain").cloned().unwrap_or_default();
        let query = params.get("q").cloned().unwrap_or_default();
        match handle_search_mods(&domain, &query) {
            Ok(body) => {
                let _ = req.respond(json_response(200, body));
            }
            Err(e) => {
                let _ = req.respond(json_response(
                    400,
                    serde_json::json!({ "error": e.to_string() }).to_string(),
                ));
            }
        }
        return;
    }

    if is_get && url.starts_with("/browse/trending") {
        if !authorized(&req, token) {
            unauthorized(req);
            return;
        }
        let params = query_params(&url);
        let domain = params.get("domain").cloned().unwrap_or_default();
        respond_json_result(req, crate::services::remote_companion::browse_trending(&domain));
        return;
    }

    if is_get && url.starts_with("/browse/latest") {
        if !authorized(&req, token) {
            unauthorized(req);
            return;
        }
        let params = query_params(&url);
        let domain = params.get("domain").cloned().unwrap_or_default();
        let offset = params
            .get("offset")
            .and_then(|v| v.parse().ok())
            .unwrap_or(0);
        respond_json_result(req, crate::services::remote_companion::browse_latest(&domain, offset));
        return;
    }

    if is_get && url.starts_with("/mods/detail") {
        if !authorized(&req, token) {
            unauthorized(req);
            return;
        }
        let params = query_params(&url);
        let domain = params.get("domain").cloned().unwrap_or_default();
        let mod_id = params
            .get("mod_id")
            .and_then(|v| v.parse().ok())
            .unwrap_or(0);
        respond_json_result(req, crate::services::remote_companion::mod_detail(&domain, mod_id));
        return;
    }

    if is_get && url.starts_with("/install/session/") {
        if !authorized(&req, token) {
            unauthorized(req);
            return;
        }
        let session_id = url
            .trim_start_matches("/install/session/")
            .split('?')
            .next()
            .unwrap_or("")
            .to_string();
        match crate::services::remote_companion::get_install_session(&session_id) {
            Ok(status) => {
                let _ = req.respond(json_response(
                    200,
                    serde_json::to_string(&status).unwrap_or_else(|_| "{}".to_string()),
                ));
            }
            Err(e) => {
                let _ = req.respond(json_response(
                    404,
                    serde_json::json!({ "error": e.to_string() }).to_string(),
                ));
            }
        }
        return;
    }

    if is_post && url.starts_with("/install/session/start") {
        if !authorized(&req, token) {
            unauthorized(req);
            return;
        }
        respond_install_session_start(req);
        return;
    }

    if is_post && url.contains("/install/session/") && url.ends_with("/confirm") {
        if !authorized(&req, token) {
            unauthorized(req);
            return;
        }
        respond_install_session_confirm(req, &url);
        return;
    }

    if is_get && url.starts_with("/mods/files") {
        if !authorized(&req, token) {
            unauthorized(req);
            return;
        }
        let params = query_params(&url);
        let domain = params.get("domain").cloned().unwrap_or_default();
        let mod_id = params
            .get("mod_id")
            .and_then(|v| v.parse::<u64>().ok())
            .unwrap_or(0);
        match handle_mod_files(&domain, mod_id) {
            Ok(body) => {
                let _ = req.respond(json_response(200, body));
            }
            Err(e) => {
                let _ = req.respond(json_response(
                    400,
                    serde_json::json!({ "error": e.to_string() }).to_string(),
                ));
            }
        }
        return;
    }

    if is_post && url.starts_with("/pair") {
        let mut body = String::new();
        let _ = req.as_reader().read_to_string(&mut body);
        let provided = serde_json::from_str::<serde_json::Value>(&body)
            .ok()
            .and_then(|v| v.get("code").and_then(|c| c.as_str()).map(String::from))
            .unwrap_or_default();
        if provided == code {
            let new_token = uuid::Uuid::new_v4().to_string();
            if let Ok(mut t) = token.lock() {
                *t = Some(new_token.clone());
            }
            let _ = req.respond(json_response(
                200,
                serde_json::json!({ "token": new_token }).to_string(),
            ));
        } else {
            let _ = req.respond(json_response(
                403,
                serde_json::json!({ "error": "Incorrect pairing code" }).to_string(),
            ));
        }
        return;
    }

    if is_post && url.starts_with("/install/mod") {
        if !authorized(&req, token) {
            unauthorized(req);
            return;
        }
        respond_transfer(req, handle_install_mod);
        return;
    }

    if is_post && url.starts_with("/install/nexus/mod") {
        if !authorized(&req, token) {
            unauthorized(req);
            return;
        }
        respond_transfer(req, handle_install_nexus_mod);
        return;
    }

    if is_post && url.starts_with("/install/nexus") {
        if !authorized(&req, token) {
            unauthorized(req);
            return;
        }
        respond_transfer(req, handle_install_nexus);
        return;
    }

    if is_post && url.starts_with("/install/preset") {
        if !authorized(&req, token) {
            unauthorized(req);
            return;
        }
        respond_transfer(req, handle_install_preset);
        return;
    }

    if is_post && url.starts_with("/sync/loadorder") {
        if !authorized(&req, token) {
            unauthorized(req);
            return;
        }
        respond_transfer(req, handle_sync_loadorder);
        return;
    }

    let _ = req.respond(json_response(
        404,
        serde_json::json!({ "error": "Not found" }).to_string(),
    ));
}

fn respond_transfer(mut req: tiny_http::Request, handler: fn(Vec<u8>, &str) -> Result<RemoteTransferResult>) {
    let content_type = req
        .headers()
        .iter()
        .find(|h| h.field.equiv("Content-Type"))
        .map(|h| h.value.as_str())
        .unwrap_or("")
        .to_string();
    let mut body = Vec::new();
    if let Err(e) = req.as_reader().read_to_end(&mut body) {
        let _ = req.respond(json_response(
            400,
            serde_json::json!({ "error": format!("Couldn't read request body: {e}") }).to_string(),
        ));
        return;
    }
    match handler(body, &content_type) {
        Ok(result) => {
            let status = if result.ok { 200 } else { 500 };
            let _ = req.respond(json_response(
                status,
                serde_json::to_string(&result).unwrap_or_else(|_| {
                    serde_json::json!({ "ok": result.ok, "message": result.message }).to_string()
                }),
            ));
        }
        Err(e) => {
            let _ = req.respond(json_response(
                400,
                serde_json::json!({ "ok": false, "message": e.to_string() }).to_string(),
            ));
        }
    }
}

fn handle_install_mod(body: Vec<u8>, content_type: &str) -> Result<RemoteTransferResult> {
    let ctx = receiver_context().ok_or_else(|| {
        NexusDeckError::Other("Remote receiver isn't fully initialized.".into())
    })?;
    let parts = parse_multipart(content_type, &body)?;
    let meta_raw = parts
        .iter()
        .find(|p| p.name == "meta")
        .map(|p| String::from_utf8_lossy(&p.data).to_string())
        .ok_or_else(|| NexusDeckError::Other("Missing meta field.".into()))?;
    let meta: RemoteModInstallMeta = serde_json::from_str(&meta_raw)
        .map_err(|e| NexusDeckError::Other(format!("Invalid install meta JSON: {e}")))?;
    let archive_part = parts
        .iter()
        .find(|p| p.name == "archive")
        .ok_or_else(|| NexusDeckError::Other("Missing archive field.".into()))?;

    let profile = profile_for_domain(&meta.game_domain)?;
    let staging = paths::default_staging_path(&meta.game_domain);
    paths::ensure_dir(&staging)?;
    let safe_name = meta
        .filename
        .replace(['/', '\\'], "_")
        .replace("..", "_");
    let archive_path = staging.join(format!("remote-{}-{safe_name}", uuid::Uuid::new_v4()));
    std::fs::write(&archive_path, &archive_part.data)?;

    let options = if meta.options.strategy.is_empty() {
        InstallOptions::default()
    } else {
        meta.options
    };

    let profile_id = profile.id.clone();
    let mod_name = meta.mod_name.clone();
    let archive_s = archive_path.display().to_string();
    let result: serde_json::Value = async_runtime::block_on(deploy::install_mod_from_archive_impl(
        ctx.app,
        profile_id,
        mod_name.clone(),
        meta.nexus_mod_id,
        meta.nexus_file_id,
        archive_s,
        options,
        meta.category,
        meta.tags,
        meta.file_version,
        meta.replace_mod_id,
        ctx.installs,
    ))?;

    let mod_id = result
        .get("mod_id")
        .and_then(|v| v.as_str())
        .map(String::from);

    Ok(RemoteTransferResult {
        ok: true,
        message: format!("Installed \"{mod_name}\" on the Deck."),
        mod_id,
        files_sent: 1,
    })
}

fn handle_install_nexus(body: Vec<u8>, content_type: &str) -> Result<RemoteTransferResult> {
    let meta: RemoteNexusInstallMeta = if content_type.contains("multipart/form-data") {
        let parts = parse_multipart(content_type, &body)?;
        let meta_raw = parts
            .iter()
            .find(|p| p.name == "meta")
            .map(|p| String::from_utf8_lossy(&p.data).to_string())
            .ok_or_else(|| NexusDeckError::Other("Missing meta field.".into()))?;
        serde_json::from_str(&meta_raw)
            .map_err(|e| NexusDeckError::Other(format!("Invalid nexus install meta JSON: {e}")))?
    } else {
        serde_json::from_slice(&body)
            .map_err(|e| NexusDeckError::Other(format!("Invalid nexus install JSON: {e}")))?
    };

    enqueue_nexus_install(meta)
}

#[derive(Debug, Deserialize)]
struct NexusModOnlyInstall {
    game_domain: String,
    nexus_mod_id: i64,
    mod_name: String,
}

fn handle_install_nexus_mod(body: Vec<u8>, _content_type: &str) -> Result<RemoteTransferResult> {
    let req: NexusModOnlyInstall = serde_json::from_slice(&body)
        .map_err(|e| NexusDeckError::Other(format!("Invalid install JSON: {e}")))?;
    let ctx = receiver_context().ok_or_else(|| {
        NexusDeckError::Other("Remote receiver isn't fully initialized.".into())
    })?;
    if !nexus_configured() {
        return Err(NexusDeckError::Other(
            "Sign in with your Nexus API key in NexusDeck Settings on this device first.".into(),
        ));
    }
    let _profile = profile_for_domain(&req.game_domain)?;
    let files = async_runtime::block_on(
        ctx.nexus
            .get_mod_files(&req.game_domain, req.nexus_mod_id as u64),
    )?;
    let file = files
        .iter()
        .find(|f| f.is_primary)
        .or_else(|| files.first())
        .ok_or_else(|| NexusDeckError::NotFound("No downloadable file for this mod.".into()))?;

    enqueue_nexus_install(RemoteNexusInstallMeta {
        game_domain: req.game_domain,
        nexus_mod_id: req.nexus_mod_id,
        nexus_file_id: file.file_id as i64,
        mod_name: req.mod_name,
        file_name: if file.file_name.is_empty() {
            file.name.clone()
        } else {
            file.file_name.clone()
        },
        expected_size_kb: file.size_kb,
        file_version: Some(file.version.clone()),
    })
}

fn handle_install_preset(body: Vec<u8>, content_type: &str) -> Result<RemoteTransferResult> {
    let parts = parse_multipart(content_type, &body)?;
    let meta_raw = parts
        .iter()
        .find(|p| p.name == "meta")
        .map(|p| String::from_utf8_lossy(&p.data).to_string())
        .ok_or_else(|| NexusDeckError::Other("Missing meta field.".into()))?;
    let meta: RemotePresetMeta = serde_json::from_str(&meta_raw)
        .map_err(|e| NexusDeckError::Other(format!("Invalid preset meta JSON: {e}")))?;

    let profile = profile_for_domain(&meta.game_domain)?;
    let mut files: Vec<(String, Vec<u8>)> = Vec::new();
    for part in &parts {
        if part.name == "meta" {
            continue;
        }
        if part.name.starts_with("file:") {
            let rel = part.name.trim_start_matches("file:").to_string();
            files.push((rel, part.data.clone()));
        } else if let Some(filename) = &part.filename {
            files.push((filename.clone(), part.data.clone()));
        }
    }

    let count = install_presets(&profile, &files)?;
    Ok(RemoteTransferResult {
        ok: true,
        message: format!("Installed {count} BodySlide preset file(s) on the Deck."),
        mod_id: None,
        files_sent: count as u32,
    })
}

fn handle_sync_loadorder(body: Vec<u8>, content_type: &str) -> Result<RemoteTransferResult> {
    if content_type.contains("multipart/form-data") {
        let parts = parse_multipart(content_type, &body)?;
        let meta_raw = parts
            .iter()
            .find(|p| p.name == "meta" || p.name == "payload")
            .map(|p| String::from_utf8_lossy(&p.data).to_string())
            .ok_or_else(|| NexusDeckError::Other("Missing load-order payload.".into()))?;
        let payload: RemoteLoadOrderPayload = serde_json::from_str(&meta_raw)
            .map_err(|e| NexusDeckError::Other(format!("Invalid load-order JSON: {e}")))?;
        apply_remote_load_order(&payload)
    } else {
        let payload: RemoteLoadOrderPayload = serde_json::from_slice(&body)
            .map_err(|e| NexusDeckError::Other(format!("Invalid load-order JSON: {e}")))?;
        apply_remote_load_order(&payload)
    }
}

fn udp_loop(running: Arc<AtomicBool>, name: String) {
    let socket = match UdpSocket::bind(("0.0.0.0", DISCOVERY_PORT)) {
        Ok(s) => s,
        Err(e) => {
            log::warn!("[remote_sync] discovery responder bind failed: {e}");
            return;
        }
    };
    let _ = socket.set_read_timeout(Some(Duration::from_millis(500)));
    let mut buf = [0u8; 256];
    while running.load(Ordering::SeqCst) {
        if let Ok((n, src)) = socket.recv_from(&mut buf) {
            if &buf[..n] == DISCOVERY_MAGIC.as_bytes() {
                let reply = serde_json::json!({
                    "name": name,
                    "http_port": HTTP_PORT,
                    "version": env!("CARGO_PKG_VERSION"),
                })
                .to_string();
                let _ = socket.send_to(reply.as_bytes(), src);
            }
        }
    }
}

// ---- Sender (the PC) -------------------------------------------------------

pub fn discover_decks(timeout_ms: u64) -> Result<Vec<DiscoveredDeck>> {
    let socket = UdpSocket::bind(("0.0.0.0", 0))
        .map_err(|e| NexusDeckError::Other(format!("Couldn't open a discovery socket: {e}")))?;
    socket.set_broadcast(true).ok();
    socket.set_read_timeout(Some(Duration::from_millis(300))).ok();
    let _ = socket.send_to(
        DISCOVERY_MAGIC.as_bytes(),
        ("255.255.255.255", DISCOVERY_PORT),
    );

    let deadline = Instant::now() + Duration::from_millis(timeout_ms.max(500));
    let mut found: Vec<DiscoveredDeck> = Vec::new();
    let mut buf = [0u8; 512];
    while Instant::now() < deadline {
        match socket.recv_from(&mut buf) {
            Ok((n, src)) => {
                if let Ok(v) = serde_json::from_slice::<serde_json::Value>(&buf[..n]) {
                    let host = src.ip().to_string();
                    if found.iter().any(|d| d.host == host) {
                        continue;
                    }
                    found.push(DiscoveredDeck {
                        name: v
                            .get("name")
                            .and_then(|x| x.as_str())
                            .unwrap_or("Steam Deck")
                            .to_string(),
                        host,
                        http_port: v
                            .get("http_port")
                            .and_then(|x| x.as_u64())
                            .unwrap_or(HTTP_PORT as u64) as u16,
                        version: v
                            .get("version")
                            .and_then(|x| x.as_str())
                            .unwrap_or("")
                            .to_string(),
                    });
                }
            }
            Err(_) => continue,
        }
    }
    Ok(found)
}

fn blocking_client(timeout_secs: u64) -> Result<reqwest::blocking::Client> {
    reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(timeout_secs))
        .build()
        .map_err(|e| NexusDeckError::Other(e.to_string()))
}

fn auth_header(token: &str) -> String {
    format!("Bearer {token}")
}

pub fn ping_deck(host: &str, port: u16) -> Result<DiscoveredDeck> {
    let resp = blocking_client(5)?
        .get(format!("http://{host}:{port}/ping"))
        .send()
        .map_err(|e| NexusDeckError::Other(format!("Couldn't reach the Deck: {e}")))?;
    let v: serde_json::Value = resp
        .json()
        .map_err(|e| NexusDeckError::Other(e.to_string()))?;
    Ok(DiscoveredDeck {
        name: v
            .get("name")
            .and_then(|x| x.as_str())
            .unwrap_or("Steam Deck")
            .to_string(),
        host: host.to_string(),
        http_port: port,
        version: v
            .get("version")
            .and_then(|x| x.as_str())
            .unwrap_or("")
            .to_string(),
    })
}

/// Pair with a Deck using the one-time code it shows; returns a session token.
pub fn pair_with_deck(host: &str, port: u16, code: &str) -> Result<String> {
    let resp = blocking_client(8)?
        .post(format!("http://{host}:{port}/pair"))
        .json(&serde_json::json!({ "code": code }))
        .send()
        .map_err(|e| NexusDeckError::Other(format!("Couldn't reach the Deck: {e}")))?;
    if !resp.status().is_success() {
        return Err(NexusDeckError::Other(
            "The Deck rejected that code. Double-check the 6-digit code shown on the Deck.".into(),
        ));
    }
    let v: serde_json::Value = resp
        .json()
        .map_err(|e| NexusDeckError::Other(e.to_string()))?;
    v.get("token")
        .and_then(|t| t.as_str())
        .map(String::from)
        .ok_or_else(|| NexusDeckError::Other("The Deck didn't return a pairing token.".into()))
}

pub fn send_mod_to_deck(
    host: &str,
    port: u16,
    token: &str,
    archive_path: &str,
    meta: RemoteModInstallMeta,
) -> Result<RemoteTransferResult> {
    let path = PathBuf::from(archive_path);
    if !path.is_file() {
        return Err(NexusDeckError::NotFound(format!(
            "Archive not found: {archive_path}"
        )));
    }
    let meta_json = serde_json::to_string(&meta)
        .map_err(|e| NexusDeckError::Other(format!("Couldn't serialize install meta: {e}")))?;
    let filename = meta.filename.clone();
    let file_part = reqwest::blocking::multipart::Part::file(&path)
        .map_err(|e| NexusDeckError::Other(format!("Couldn't read archive: {e}")))?
        .file_name(filename)
        .mime_str("application/octet-stream")
        .map_err(|e| NexusDeckError::Other(e.to_string()))?;
    let form = reqwest::blocking::multipart::Form::new()
        .text("meta", meta_json)
        .part("archive", file_part);

    let resp = blocking_client(600)?
        .post(format!("http://{host}:{port}/install/mod"))
        .header("Authorization", auth_header(token))
        .multipart(form)
        .send()
        .map_err(|e| NexusDeckError::Other(format!("Couldn't send mod to the Deck: {e}")))?;

    parse_transfer_response(resp)
}

pub fn send_nexus_mod_to_deck(
    host: &str,
    port: u16,
    token: &str,
    meta: RemoteNexusInstallMeta,
) -> Result<RemoteTransferResult> {
    let resp = blocking_client(30)?
        .post(format!("http://{host}:{port}/install/nexus"))
        .header("Authorization", auth_header(token))
        .json(&meta)
        .send()
        .map_err(|e| NexusDeckError::Other(format!("Couldn't reach the Deck: {e}")))?;

    parse_transfer_response(resp)
}

pub fn send_presets_to_deck(
    host: &str,
    port: u16,
    token: &str,
    profile_id: &str,
) -> Result<RemoteTransferResult> {
    let profile = db::get_profile(profile_id)?
        .ok_or_else(|| NexusDeckError::NotFound("Profile not found".into()))?;
    let bodyslide_dir = bodyslide_dir_for_profile(&profile)?;
    let files = collect_preset_files(&bodyslide_dir)?;
    if files.is_empty() {
        return Err(NexusDeckError::Other(
            "No BodySlide preset files found on this PC (SliderGroups/SliderSets).".into(),
        ));
    }

    let meta = RemotePresetMeta {
        game_domain: profile.game_domain.clone(),
    };
    let meta_json = serde_json::to_string(&meta)
        .map_err(|e| NexusDeckError::Other(format!("Couldn't serialize preset meta: {e}")))?;

    let mut form = reqwest::blocking::multipart::Form::new().text("meta", meta_json);
    for (rel, data) in &files {
        let part = reqwest::blocking::multipart::Part::bytes(data.clone())
            .file_name(rel.clone())
            .mime_str("application/octet-stream")
            .map_err(|e| NexusDeckError::Other(e.to_string()))?;
        form = form.part(format!("file:{rel}"), part);
    }

    let resp = blocking_client(120)?
        .post(format!("http://{host}:{port}/install/preset"))
        .header("Authorization", auth_header(token))
        .multipart(form)
        .send()
        .map_err(|e| NexusDeckError::Other(format!("Couldn't send presets to the Deck: {e}")))?;

    parse_transfer_response(resp)
}

pub fn send_load_order_to_deck(
    host: &str,
    port: u16,
    token: &str,
    payload: RemoteLoadOrderPayload,
) -> Result<RemoteTransferResult> {
    let resp = blocking_client(60)?
        .post(format!("http://{host}:{port}/sync/loadorder"))
        .header("Authorization", auth_header(token))
        .json(&payload)
        .send()
        .map_err(|e| NexusDeckError::Other(format!("Couldn't send load order to the Deck: {e}")))?;

    parse_transfer_response(resp)
}

fn parse_transfer_response(resp: reqwest::blocking::Response) -> Result<RemoteTransferResult> {
    let status = resp.status();
    let body = resp
        .text()
        .map_err(|e| NexusDeckError::Other(format!("Couldn't read Deck response: {e}")))?;
    if let Ok(result) = serde_json::from_str::<RemoteTransferResult>(&body) {
        if status.is_success() && result.ok {
            return Ok(result);
        }
        if !result.message.is_empty() {
            return Err(NexusDeckError::Other(result.message));
        }
    }
    if let Ok(v) = serde_json::from_str::<serde_json::Value>(&body) {
        if let Some(msg) = v.get("message").and_then(|m| m.as_str()) {
            return Err(NexusDeckError::Other(msg.to_string()));
        }
        if let Some(err) = v.get("error").and_then(|m| m.as_str()) {
            return Err(NexusDeckError::Other(err.to_string()));
        }
    }
    if status.is_success() {
        return Ok(RemoteTransferResult {
            ok: true,
            message: "Transfer completed.".into(),
            mod_id: None,
            files_sent: 0,
        });
    }
    Err(NexusDeckError::Other(format!(
        "Deck returned HTTP {} — {body}",
        status.as_u16()
    )))
}

pub fn build_load_order_payload(profile_id: &str) -> Result<RemoteLoadOrderPayload> {
    let profile = db::get_profile(profile_id)?
        .ok_or_else(|| NexusDeckError::NotFound("Profile not found".into()))?;
    let state = crate::services::load_order::get_load_order_state(profile_id)?;
    let mods = state
        .mods
        .iter()
        .filter_map(|entry| {
            db::get_installed_mod(&entry.id).ok().flatten().map(|m| {
                RemoteLoadOrderEntry {
                    nexus_mod_id: m.nexus_mod_id,
                    enabled: entry.enabled,
                    sort_order: entry.sort_order,
                }
            })
        })
        .filter(|e| e.nexus_mod_id > 0)
        .collect();
    Ok(RemoteLoadOrderPayload {
        game_domain: profile.game_domain,
        mods,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_multipart_meta_and_archive() {
        let body = concat!(
            "--boundary\r\n",
            "Content-Disposition: form-data; name=\"meta\"\r\n\r\n",
            "{\"game_domain\":\"fallout4\"}\r\n",
            "--boundary\r\n",
            "Content-Disposition: form-data; name=\"archive\"; filename=\"mod.7z\"\r\n\r\n",
            "PK\x03\x04fake\r\n",
            "--boundary--\r\n"
        );
        let parts = parse_multipart("multipart/form-data; boundary=boundary", body.as_bytes()).unwrap();
        assert_eq!(parts.len(), 2);
        assert_eq!(parts[0].name, "meta");
        assert_eq!(parts[1].name, "archive");
    }
}

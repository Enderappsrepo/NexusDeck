//! HTTP companion API: browse, install sessions (download → FOMOD → deploy).

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tauri::{async_runtime, AppHandle, Manager};

use crate::commands::deploy::{self, InstallOptions, InstallPrepareResult};
use crate::db::{self, Profile};
use crate::error::{NexusDeckError, Result};
use crate::services::credentials;
use crate::services::mod_uninstall;
use crate::services::nexus_client::{ModSearchFilters, ModSummary};
use crate::services::remote_sync::{receiver_context, RemoteNexusInstallMeta};

/// Bump when companion HTTP API adds routes (browse/discovery, library, etc.).
pub const COMPANION_API_VERSION: u32 = 2;

#[derive(Debug, Clone, Serialize)]
pub struct CompanionGame {
    pub domain: String,
    pub name: String,
    pub can_install: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct InstallDownloadProgress {
    pub progress_pct: u8,
    pub bytes_done: i64,
    pub bytes_total: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub eta_seconds: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct InstallSessionStatus {
    pub session_id: String,
    pub status: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub progress: Option<InstallDownloadProgress>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub prepare: Option<CompanionPreparePayload>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct CompanionPreparePayload {
    pub option_groups: Vec<crate::services::install_options::InstallOptionGroup>,
    pub default_selections: Vec<crate::services::install_options::SelectedInstallOption>,
    pub install_wizard: Option<crate::services::install_options::InstallWizard>,
    pub install_wizard_required: bool,
    pub strategies: Vec<deploy::StrategyOption>,
}

#[derive(Debug, Clone)]
struct RemoteInstallSession {
    status: String,
    message: String,
    profile: Profile,
    meta: RemoteNexusInstallMeta,
    download_id: Option<String>,
    download_started_at: Option<Instant>,
    progress_pct: u8,
    bytes_done: i64,
    bytes_total: i64,
    eta_seconds: Option<u64>,
    archive_path: Option<PathBuf>,
    prepared_extract_dir: Option<String>,
    prepare: Option<CompanionPreparePayload>,
    error: Option<String>,
}

fn sessions() -> &'static Mutex<HashMap<String, RemoteInstallSession>> {
    static SESSIONS: OnceLock<Mutex<HashMap<String, RemoteInstallSession>>> = OnceLock::new();
    SESSIONS.get_or_init(|| Mutex::new(HashMap::new()))
}

pub fn companion_web_roots(app: &AppHandle) -> Vec<PathBuf> {
    let mut roots = Vec::new();
    if let Ok(dir) = app.path().resource_dir() {
        roots.push(dir.join("companion-web"));
    }
    roots.push(PathBuf::from("/app/share/nexusdeck/companion-web"));
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            roots.push(parent.join("companion-web"));
            roots.push(parent.join("resources/companion-web"));
        }
    }
    roots
}

pub fn companion_web_root(app: &AppHandle) -> Option<PathBuf> {
    companion_web_roots(app)
        .into_iter()
        .find(|p| p.is_dir() && p.join("index.html").exists())
}

fn nexus_configured() -> bool {
    credentials::retrieve_api_key()
        .ok()
        .flatten()
        .is_some()
}

fn require_nexus() -> Result<()> {
    if nexus_configured() {
        Ok(())
    } else {
        Err(NexusDeckError::Other(
            "Sign in with your Nexus API key in NexusDeck Settings on this device first.".into(),
        ))
    }
}

fn profile_for_domain(domain: &str) -> Result<Profile> {
    db::list_profiles()?
        .into_iter()
        .find(|p| p.game_domain == domain)
        .ok_or_else(|| {
            NexusDeckError::NotFound(format!(
                "No profile for \"{domain}\" on this device. Add the game in NexusDeck first."
            ))
        })
}

pub fn list_companion_games() -> Result<Vec<CompanionGame>> {
    let profiles: HashMap<String, String> = db::list_profiles()?
        .into_iter()
        .map(|p| (p.game_domain.clone(), p.name.clone()))
        .collect();

    let ctx = receiver_context().ok_or_else(|| {
        NexusDeckError::Other("Remote receiver isn't fully initialized.".into())
    })?;

    let mut games = Vec::new();
    if nexus_configured() {
        if let Ok(page) = async_runtime::block_on(ctx.nexus.list_games("", 40, 0)) {
            for g in page.games {
                let can_install = profiles.contains_key(&g.domain_name);
                games.push(CompanionGame {
                    domain: g.domain_name,
                    name: g.name,
                    can_install,
                });
            }
        }
    }

    if games.is_empty() {
        for (domain, name) in profiles {
            games.push(CompanionGame {
                domain,
                name,
                can_install: true,
            });
        }
    } else {
        for (domain, name) in profiles {
            if !games.iter().any(|g| g.domain == domain) {
                games.push(CompanionGame {
                    domain,
                    name,
                    can_install: true,
                });
            }
        }
    }

    games.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(games)
}

pub fn browse_trending(domain: &str) -> Result<String> {
    require_nexus()?;
    let ctx = receiver_context().ok_or_else(|| {
        NexusDeckError::Other("Remote receiver isn't fully initialized.".into())
    })?;
    let mods = async_runtime::block_on(ctx.nexus.get_trending_mods(domain, 24))?;
    Ok(serde_json::to_string(&mods).unwrap_or_else(|_| "[]".to_string()))
}

pub fn browse_latest(domain: &str, offset: u32) -> Result<String> {
    require_nexus()?;
    let ctx = receiver_context().ok_or_else(|| {
        NexusDeckError::Other("Remote receiver isn't fully initialized.".into())
    })?;
    let mods = async_runtime::block_on(
        ctx.nexus.search_mods(domain, "", "updated", offset, 24),
    )?;
    Ok(serde_json::to_string(&mods).unwrap_or_else(|_| "[]".to_string()))
}

const DISCOVERY_FEED_COUNT: u32 = 12;

#[derive(Debug, Clone, Serialize)]
pub struct DiscoveryFeeds {
    pub featured: Vec<ModSummary>,
    pub top_endorsed: Vec<ModSummary>,
    pub most_downloaded: Vec<ModSummary>,
    pub trending: Vec<ModSummary>,
    pub newly_added: Vec<ModSummary>,
    pub recently_updated: Vec<ModSummary>,
    pub hot_this_week: Vec<ModSummary>,
}

struct DiscoveryFeedSpec {
    sort: &'static str,
    updated_since_days: Option<u32>,
}

const DISCOVERY_FEEDS: [(&str, DiscoveryFeedSpec); 6] = [
    (
        "top_endorsed",
        DiscoveryFeedSpec {
            sort: "endorsements",
            updated_since_days: None,
        },
    ),
    (
        "most_downloaded",
        DiscoveryFeedSpec {
            sort: "downloads",
            updated_since_days: None,
        },
    ),
    (
        "trending",
        DiscoveryFeedSpec {
            sort: "trending",
            updated_since_days: Some(30),
        },
    ),
    (
        "newly_added",
        DiscoveryFeedSpec {
            sort: "created",
            updated_since_days: None,
        },
    ),
    (
        "recently_updated",
        DiscoveryFeedSpec {
            sort: "updated",
            updated_since_days: None,
        },
    ),
    (
        "hot_this_week",
        DiscoveryFeedSpec {
            sort: "endorsements",
            updated_since_days: Some(7),
        },
    ),
];

fn fetch_discovery_feed(
    domain: &str,
    spec: &DiscoveryFeedSpec,
) -> Result<Vec<ModSummary>> {
    require_nexus()?;
    let ctx = receiver_context().ok_or_else(|| {
        NexusDeckError::Other("Remote receiver isn't fully initialized.".into())
    })?;
    let mut filters = ModSearchFilters::default();
    filters.updated_since_days = spec.updated_since_days;
    let result = async_runtime::block_on(ctx.nexus.search_mods_with_filters(
        domain,
        "",
        spec.sort,
        0,
        DISCOVERY_FEED_COUNT,
        &filters,
    ))?;
    Ok(result.mods)
}

pub fn browse_shelf(
    domain: &str,
    sort: &str,
    offset: u32,
    updated_since_days: Option<u32>,
) -> Result<String> {
    require_nexus()?;
    let ctx = receiver_context().ok_or_else(|| {
        NexusDeckError::Other("Remote receiver isn't fully initialized.".into())
    })?;
    let mut filters = ModSearchFilters::default();
    filters.updated_since_days = updated_since_days;
    let result = async_runtime::block_on(ctx.nexus.search_mods_with_filters(
        domain,
        "",
        sort,
        offset,
        24,
        &filters,
    ))?;
    Ok(serde_json::to_string(&result.mods).unwrap_or_else(|_| "[]".to_string()))
}

pub fn browse_discovery(domain: &str) -> Result<String> {
    let mut feeds = DiscoveryFeeds {
        featured: Vec::new(),
        top_endorsed: fetch_discovery_feed(domain, &DISCOVERY_FEEDS[0].1).unwrap_or_default(),
        most_downloaded: fetch_discovery_feed(domain, &DISCOVERY_FEEDS[1].1).unwrap_or_default(),
        trending: fetch_discovery_feed(domain, &DISCOVERY_FEEDS[2].1).unwrap_or_default(),
        newly_added: fetch_discovery_feed(domain, &DISCOVERY_FEEDS[3].1).unwrap_or_default(),
        recently_updated: fetch_discovery_feed(domain, &DISCOVERY_FEEDS[4].1).unwrap_or_default(),
        hot_this_week: fetch_discovery_feed(domain, &DISCOVERY_FEEDS[5].1).unwrap_or_default(),
    };
    feeds.featured = feeds.top_endorsed.iter().take(6).cloned().collect();

    let any = !feeds.top_endorsed.is_empty()
        || !feeds.most_downloaded.is_empty()
        || !feeds.trending.is_empty()
        || !feeds.newly_added.is_empty()
        || !feeds.recently_updated.is_empty()
        || !feeds.hot_this_week.is_empty();

    if !any {
        require_nexus()?;
    }

    Ok(serde_json::to_string(&feeds).unwrap_or_else(|_| "{}".to_string()))
}

#[derive(Debug, Clone, Serialize)]
pub struct CompanionInstalledMod {
    pub id: String,
    pub nexus_mod_id: i64,
    pub name: String,
    pub version: Option<String>,
    pub enabled: bool,
    pub sort_order: i32,
    pub installed_at: i64,
}

pub fn list_library_mods(domain: &str) -> Result<String> {
    let profile = profile_for_domain(domain)?;
    let mods: Vec<CompanionInstalledMod> = db::list_installed_mods(&profile.id)?
        .into_iter()
        .map(|m| CompanionInstalledMod {
            id: m.id,
            nexus_mod_id: m.nexus_mod_id,
            name: m.name,
            version: m.version,
            enabled: m.enabled,
            sort_order: m.sort_order,
            installed_at: m.installed_at,
        })
        .collect();
    Ok(serde_json::to_string(&mods).unwrap_or_else(|_| "[]".to_string()))
}

#[derive(Debug, Deserialize)]
pub struct ToggleModBody {
    pub mod_id: String,
    pub enabled: bool,
}

pub fn toggle_library_mod(body: ToggleModBody) -> Result<String> {
    deploy::set_mod_enabled(body.mod_id, body.enabled)?;
    Ok(serde_json::json!({ "ok": true }).to_string())
}

#[derive(Debug, Deserialize)]
pub struct UninstallModBody {
    pub mod_id: String,
}

pub fn uninstall_library_mod(body: UninstallModBody) -> Result<String> {
    let result = mod_uninstall::uninstall_mod(&body.mod_id)?;
    Ok(serde_json::to_string(&result).unwrap_or_else(|_| "{}".to_string()))
}

pub fn essentials_manifest(domain: &str) -> Result<String> {
    let manifest = crate::services::game_essentials::get_game_essentials_manifest(domain)?;
    Ok(serde_json::to_string(&manifest).unwrap_or_else(|_| "{}".to_string()))
}

pub fn essentials_status_for_domain(game_domain: &str) -> Result<String> {
    let profile = db::get_profile_by_domain(game_domain)?.ok_or_else(|| {
        NexusDeckError::NotFound(format!(
            "No profile for \"{game_domain}\" on this device. Add the game in NexusDeck first."
        ))
    })?;
    let status = crate::services::game_essentials::get_game_essentials_status(&profile.id)?;
    Ok(serde_json::to_string(&status).unwrap_or_else(|_| "[]".to_string()))
}

#[derive(Debug, Deserialize)]
pub struct StartEssentialsBody {
    pub game_domain: String,
    #[serde(default)]
    pub mod_ids: Vec<String>,
    #[serde(default = "default_true")]
    pub include_setup: bool,
}

pub fn start_essentials(body: StartEssentialsBody) -> Result<String> {
    require_nexus()?;
    let profile = profile_for_domain(&body.game_domain)?;
    let ctx = receiver_context().ok_or_else(|| {
        NexusDeckError::Other("Remote receiver isn't fully initialized.".into())
    })?;

    if body.include_setup {
        let app = ctx.app.clone();
        let pid = profile.id.clone();
        async_runtime::block_on(async move {
            tokio::task::spawn_blocking(move || {
                crate::services::essential_fixes::apply_essential_fixes(&app, &pid)
            })
            .await
            .map_err(|e| NexusDeckError::Other(format!("Setup failed: {e}")))??;
            Ok::<(), NexusDeckError>(())
        })?;
    }

    let queued = async_runtime::block_on(crate::services::game_essentials::queue_game_essential_mods(
        ctx.app.clone(),
        ctx.nexus.clone(),
        ctx.downloads.clone(),
        &profile.id,
        body.mod_ids,
    ))?;

    Ok(serde_json::to_string(&queued).unwrap_or_else(|_| "[]".to_string()))
}

fn default_true() -> bool {
    true
}

pub fn mod_detail(domain: &str, mod_id: u64) -> Result<String> {
    require_nexus()?;
    let ctx = receiver_context().ok_or_else(|| {
        NexusDeckError::Other("Remote receiver isn't fully initialized.".into())
    })?;
    let detail = async_runtime::block_on(ctx.nexus.get_mod_detail(domain, mod_id))?;
    Ok(serde_json::to_string(&detail).unwrap_or_else(|_| "{}".to_string()))
}

#[derive(Debug, Deserialize)]
pub struct StartInstallSessionBody {
    pub game_domain: String,
    pub nexus_mod_id: i64,
    pub nexus_file_id: i64,
    pub mod_name: String,
    pub file_name: String,
    pub expected_size_kb: u64,
    #[serde(default)]
    pub file_version: Option<String>,
}

pub fn start_install_session(body: StartInstallSessionBody) -> Result<InstallSessionStatus> {
    require_nexus()?;
    let profile = profile_for_domain(&body.game_domain)?;
    let session_id = uuid::Uuid::new_v4().to_string();
    let meta = RemoteNexusInstallMeta {
        game_domain: body.game_domain,
        nexus_mod_id: body.nexus_mod_id,
        nexus_file_id: body.nexus_file_id,
        mod_name: body.mod_name,
        file_name: body.file_name,
        expected_size_kb: body.expected_size_kb,
        file_version: body.file_version,
    };

    {
        let mut map = sessions().lock().unwrap();
        map.insert(
            session_id.clone(),
            RemoteInstallSession {
                status: "downloading".into(),
                message: "Starting download on your device…".into(),
                profile: profile.clone(),
                meta: meta.clone(),
                download_id: None,
                download_started_at: None,
                progress_pct: 0,
                bytes_done: 0,
                bytes_total: (meta.expected_size_kb.saturating_mul(1024)) as i64,
                eta_seconds: None,
                archive_path: None,
                prepared_extract_dir: None,
                prepare: None,
                error: None,
            },
        );
    }

    let sid = session_id.clone();
    async_runtime::spawn(async move {
        if let Err(e) = run_install_session(&sid, profile, meta).await {
            let mut map = sessions().lock().unwrap();
            if let Some(s) = map.get_mut(&sid) {
                s.status = "error".into();
                s.error = Some(e.to_string());
                s.message = e.to_string();
            }
        }
    });

    Ok(build_session_status(
        &session_id,
        sessions()
            .lock()
            .unwrap()
            .get(&session_id)
            .expect("session just inserted"),
    ))
}

async fn run_install_session(
    session_id: &str,
    profile: Profile,
    meta: RemoteNexusInstallMeta,
) -> Result<()> {
    let ctx = receiver_context().ok_or_else(|| {
        NexusDeckError::Other("Remote receiver isn't fully initialized.".into())
    })?;

    update_session(session_id, "downloading", "Downloading from Nexus…", None, None);

    let staging = PathBuf::from(&profile.staging_path);
    let progress = ctx
        .downloads
        .enqueue_download(
            ctx.app.clone(),
            ctx.nexus.clone(),
            &meta.game_domain,
            meta.nexus_mod_id as u64,
            meta.nexus_file_id as u64,
            &meta.file_name,
            staging.as_path(),
            meta.expected_size_kb,
            &meta.mod_name,
            &profile.id,
            None,
            0,
        )
        .await?;

    {
        let mut map = sessions().lock().unwrap();
        if let Some(s) = map.get_mut(session_id) {
            s.download_id = Some(progress.id.clone());
            s.download_started_at = Some(Instant::now());
        }
    }

    let archive_path = wait_for_download(&progress.id).await?;
    {
        let mut map = sessions().lock().unwrap();
        if let Some(s) = map.get_mut(session_id) {
            s.archive_path = Some(archive_path.clone());
        }
    }

    update_session(session_id, "extracting", "Extracting mod archive…", None, None);

    let prepare: InstallPrepareResult = deploy::prepare_mod_install_managed(
        ctx.app.clone(),
        profile.id.clone(),
        archive_path.display().to_string(),
        meta.mod_name.clone(),
        ctx.installs.clone(),
    )
    .await?;

    let wizard_required = prepare.install_wizard.is_some();
    let payload = CompanionPreparePayload {
        option_groups: prepare.option_groups.clone(),
        default_selections: prepare.default_selections.clone(),
        install_wizard: prepare.install_wizard.clone(),
        install_wizard_required: wizard_required,
        strategies: deploy::get_install_strategies()?,
    };

    {
        let mut map = sessions().lock().unwrap();
        if let Some(s) = map.get_mut(session_id) {
            s.prepared_extract_dir = Some(prepare.prepared_extract_dir.clone());
            s.prepare = Some(payload.clone());
            s.status = "ready".into();
            s.message = if wizard_required {
                "Choose install options on your phone.".into()
            } else if !prepare.option_groups.is_empty() {
                "Review install options.".into()
            } else {
                "Ready to install.".into()
            };
        }
    }

    Ok(())
}

async fn wait_for_download(download_id: &str) -> Result<PathBuf> {
    for _ in 0..3600 {
        if let Some(record) = db::get_download(download_id)? {
            match record.status.as_str() {
                "complete" => return Ok(PathBuf::from(record.dest_path)),
                "error" | "cancelled" => {
                    return Err(NexusDeckError::Other(format!(
                        "Download failed ({})",
                        record.status
                    )));
                }
                _ => {
                    let mut map = sessions().lock().unwrap();
                    for s in map.values_mut() {
                        if s.download_id.as_deref() != Some(download_id) {
                            continue;
                        }
                        let bytes_total = if record.bytes_total > 0 {
                            record.bytes_total
                        } else {
                            s.bytes_total
                        };
                        let bytes_done = record.bytes_done.max(0);
                        let pct = if bytes_total > 0 {
                            ((bytes_done * 100) / bytes_total).clamp(0, 99) as u8
                        } else {
                            0
                        };
                        let eta_seconds = s.download_started_at.and_then(|started| {
                            let elapsed = started.elapsed().as_secs_f64().max(0.5);
                            let rate = bytes_done as f64 / elapsed;
                            if rate > 0.0 && bytes_total > bytes_done {
                                Some(((bytes_total - bytes_done) as f64 / rate).ceil() as u64)
                            } else {
                                None
                            }
                        });
                        s.bytes_done = bytes_done;
                        s.bytes_total = bytes_total;
                        s.progress_pct = pct;
                        s.eta_seconds = eta_seconds;
                        s.message = if bytes_total > 0 {
                            format!("Downloading… {pct}%")
                        } else {
                            "Downloading…".into()
                        };
                        break;
                    }
                }
            }
        }
        tokio::time::sleep(Duration::from_secs(1)).await;
    }
    Err(NexusDeckError::Other("Download timed out.".into()))
}

fn update_session(
    session_id: &str,
    status: &str,
    message: &str,
    prepare: Option<CompanionPreparePayload>,
    error: Option<String>,
) {
    let mut map = sessions().lock().unwrap();
    if let Some(s) = map.get_mut(session_id) {
        s.status = status.to_string();
        s.message = message.to_string();
        if prepare.is_some() {
            s.prepare = prepare;
        }
        if error.is_some() {
            s.error = error;
        }
    }
}

fn build_session_status(session_id: &str, s: &RemoteInstallSession) -> InstallSessionStatus {
    let progress = if s.status == "downloading" {
        Some(InstallDownloadProgress {
            progress_pct: s.progress_pct,
            bytes_done: s.bytes_done,
            bytes_total: s.bytes_total,
            eta_seconds: s.eta_seconds,
        })
    } else {
        None
    };
    InstallSessionStatus {
        session_id: session_id.to_string(),
        status: s.status.clone(),
        message: s.message.clone(),
        progress,
        prepare: s.prepare.clone(),
        error: s.error.clone(),
    }
}

pub fn get_install_session(session_id: &str) -> Result<InstallSessionStatus> {
    let map = sessions().lock().unwrap();
    let s = map.get(session_id).ok_or_else(|| {
        NexusDeckError::NotFound("Install session not found or expired.".into())
    })?;
    Ok(build_session_status(session_id, s))
}

#[derive(Debug, Deserialize, Default)]
pub struct ConfirmInstallSessionBody {
    pub strategy: Option<String>,
    pub enable_mod: Option<bool>,
    pub overwrite_files: Option<bool>,
    pub selected_options: Option<Vec<crate::services::install_options::SelectedInstallOption>>,
}

pub fn confirm_install_session(
    session_id: &str,
    body: ConfirmInstallSessionBody,
) -> Result<InstallSessionStatus> {
    let (profile, meta, archive_path, prepared_extract_dir, prepare) = {
        let map = sessions().lock().unwrap();
        let s = map.get(session_id).ok_or_else(|| {
            NexusDeckError::NotFound("Install session not found.".into())
        })?;
        if s.status != "ready" {
            return Err(NexusDeckError::Other(format!(
                "Install session isn't ready (status: {}).",
                s.status
            )));
        }
        let archive = s.archive_path.clone().ok_or_else(|| {
            NexusDeckError::Other("Download path missing for session.".into())
        })?;
        let extract = s.prepared_extract_dir.clone().ok_or_else(|| {
            NexusDeckError::Other("Extract dir missing for session.".into())
        })?;
        (
            s.profile.clone(),
            s.meta.clone(),
            archive,
            extract,
            s.prepare.clone(),
        )
    };

    update_session(session_id, "installing", "Installing mod…", None, None);

    let default_selections = prepare
        .as_ref()
        .map(|p| p.default_selections.clone())
        .unwrap_or_default();
    let options = InstallOptions {
        strategy: body.strategy.unwrap_or_else(|| "auto".to_string()),
        enable_mod: body.enable_mod.unwrap_or(true),
        overwrite_files: body.overwrite_files.unwrap_or(false),
        selected_options: body
            .selected_options
            .unwrap_or(default_selections),
        prepared_extract_dir: Some(prepared_extract_dir),
        wizard_hash: None,
        dry_run: false,
    };

    let ctx = receiver_context().ok_or_else(|| {
        NexusDeckError::Other("Remote receiver isn't fully initialized.".into())
    })?;

    let mod_name = meta.mod_name.clone();
    async_runtime::block_on(deploy::install_mod_from_archive_impl(
        ctx.app.clone(),
        profile.id,
        meta.mod_name,
        meta.nexus_mod_id,
        meta.nexus_file_id,
        archive_path.display().to_string(),
        options,
        None,
        None,
        meta.file_version,
        None,
        ctx.installs.clone(),
    ))?;

    {
        let mut map = sessions().lock().unwrap();
        if let Some(s) = map.get_mut(session_id) {
            s.status = "done".into();
            s.message = format!("Installed \"{mod_name}\".");
        }
    }

    get_install_session(session_id)
}

pub fn serve_companion_file(app: &AppHandle, url_path: &str) -> Result<(Vec<u8>, &'static str)> {
    let root = companion_web_root(app).ok_or_else(|| {
        NexusDeckError::NotFound(
            "Companion web app isn't bundled with this build. Update NexusDeck or use the release zip.".into(),
        )
    })?;

    let rel = url_path
        .strip_prefix("/app")
        .unwrap_or(url_path)
        .trim_start_matches('/');
    let rel = if rel.is_empty() { "index.html" } else { rel };

    let mut file_path = root.join(rel);
    if file_path.is_dir() {
        file_path = file_path.join("index.html");
    }
    if !file_path.exists() {
        file_path = root.join("index.html");
    }
    if !file_path.starts_with(&root) {
        return Err(NexusDeckError::Other("Forbidden".into()));
    }

    let bytes = std::fs::read(&file_path).map_err(|e| {
        NexusDeckError::Other(format!("Couldn't read companion file: {e}"))
    })?;
    Ok((bytes, mime_for(file_path.as_path())))
}

fn mime_for(path: &Path) -> &'static str {
    let s = path.to_string_lossy();
    if s.ends_with(".js") {
        "application/javascript; charset=utf-8"
    } else if s.ends_with(".css") {
        "text/css; charset=utf-8"
    } else if s.ends_with(".svg") {
        "image/svg+xml"
    } else if s.ends_with(".png") {
        "image/png"
    } else if s.ends_with(".woff2") {
        "font/woff2"
    } else {
        "text/html; charset=utf-8"
    }
}

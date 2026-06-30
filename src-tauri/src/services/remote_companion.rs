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
pub const COMPANION_API_VERSION: u32 = 3;

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
    /// What "Automatic" resolved to for this archive, so the phone can show
    /// where files will actually land instead of a bare strategy list.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detected: Option<DetectedDeployPlan>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub conflicts: Vec<crate::services::conflict::FileConflict>,
}

#[derive(Debug, Clone, Serialize)]
pub struct DetectedDeployPlan {
    /// Strategy id the auto-detector chose (merge_data, merge_root, …).
    pub strategy: String,
    /// Friendly strategy name (matches the `strategies` list label).
    pub label: String,
    /// Plain-language explanation of why this layout was chosen.
    pub description: String,
    /// Friendly install location ("Data folder", "Game folder", …).
    pub target: String,
}

/// Friendly install location for a resolved strategy id.
fn friendly_target(strategy: &str) -> &'static str {
    match strategy {
        "merge_data" | "merge_loose_to_data" | "copy_loose_to_data" => "Data folder",
        "merge_root" => "Game folder (root)",
        "staging_only" => "Staging only — game files untouched",
        _ => "Game folder",
    }
}

/// Run the auto-detector over the already-extracted files so the companion can
/// preview where the mod will install before the user confirms.
fn detect_plan_for_session(
    domain: &str,
    game_path: &str,
    prepared_extract_dir: &str,
    strategies: &[deploy::StrategyOption],
) -> Option<DetectedDeployPlan> {
    let entries =
        crate::services::archive::list_extracted_entries(Path::new(prepared_extract_dir)).ok()?;
    let plan = crate::games::build_plan_for_strategy(
        domain,
        Path::new(game_path),
        &entries,
        "auto",
    )
    .ok()?;
    let label = strategies
        .iter()
        .find(|s| s.id == plan.strategy)
        .map(|s| s.label.clone())
        .unwrap_or_else(|| plan.strategy.clone());
    Some(DetectedDeployPlan {
        target: friendly_target(&plan.strategy).to_string(),
        label,
        strategy: plan.strategy,
        description: plan.description,
    })
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

fn to_companion_mod(m: db::InstalledMod) -> CompanionInstalledMod {
    CompanionInstalledMod {
        id: m.id,
        nexus_mod_id: m.nexus_mod_id,
        name: m.name,
        version: m.version,
        enabled: m.enabled,
        sort_order: m.sort_order,
        installed_at: m.installed_at,
    }
}

pub fn list_library_mods(domain: &str) -> Result<String> {
    let profile = profile_for_domain(domain)?;
    let mods: Vec<CompanionInstalledMod> = db::list_installed_mods(&profile.id)?
        .into_iter()
        .map(to_companion_mod)
        .collect();
    Ok(serde_json::to_string(&mods).unwrap_or_else(|_| "[]".to_string()))
}

#[derive(Debug, Deserialize)]
pub struct ReorderModBody {
    pub game_domain: String,
    pub mod_id: String,
    /// "up" or "down".
    pub direction: String,
}

/// Move a mod up/down in load order, then return the refreshed library list so
/// the phone can re-render without a second round-trip.
pub fn reorder_library_mod(body: ReorderModBody) -> Result<String> {
    let profile = profile_for_domain(&body.game_domain)?;
    let updated = db::reorder_mod(&profile.id, &body.mod_id, &body.direction)?;
    let _ = crate::services::plugins_txt::sync_plugins_txt(&profile);
    let mods: Vec<CompanionInstalledMod> =
        updated.into_iter().map(to_companion_mod).collect();
    Ok(serde_json::to_string(&mods).unwrap_or_else(|_| "[]".to_string()))
}

#[derive(Debug, Deserialize)]
pub struct ToggleModBody {
    pub game_domain: String,
    pub mod_id: String,
    pub enabled: bool,
}

pub fn toggle_library_mod(body: ToggleModBody) -> Result<String> {
    let profile = profile_for_domain(&body.game_domain)?;
    deploy::set_mod_enabled(body.mod_id, body.enabled)?;
    let _ = crate::services::plugins_txt::sync_plugins_txt(&profile);
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
    ctx.downloads.mark_companion_managed(&progress.id);

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
    let strategies = deploy::get_install_strategies()?;
    let detected = detect_plan_for_session(
        &meta.game_domain,
        &profile.game_path,
        &prepare.prepared_extract_dir,
        &strategies,
    );
    let conflicts = preview_conflicts_for_extract(
        &profile.id,
        &prepare.prepared_extract_dir,
        &meta.mod_name,
    );
    let payload = CompanionPreparePayload {
        option_groups: prepare.option_groups.clone(),
        default_selections: prepare.default_selections.clone(),
        install_wizard: prepare.install_wizard.clone(),
        install_wizard_required: wizard_required,
        strategies,
        detected,
        conflicts,
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

/// Compact view of an in-flight companion install, for the device's
/// "connected to companion" overlay. Returns the first non-terminal session.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompanionInstallSummary {
    pub mod_name: String,
    pub status: String,
    pub message: String,
    pub progress_pct: u8,
}

pub fn latest_install_summary() -> Option<CompanionInstallSummary> {
    let map = sessions().lock().unwrap();
    map.values()
        .find(|s| {
            matches!(
                s.status.as_str(),
                "downloading" | "extracting" | "installing" | "ready"
            )
        })
        .map(|s| CompanionInstallSummary {
            mod_name: s.meta.mod_name.clone(),
            status: s.status.clone(),
            message: s.message.clone(),
            progress_pct: s.progress_pct,
        })
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

    // Deploy on the async runtime instead of blocking this HTTP handler thread.
    // The companion server is single-threaded, so a synchronous multi-thousand-
    // file deploy would freeze every other request (status polls, pings) until
    // it finished. Spawn it and let the phone poll the session to "done"/"error".
    let sid = session_id.to_string();
    async_runtime::spawn(async move {
        let mod_name = meta.mod_name.clone();
        let result = deploy::install_mod_from_archive_impl(
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
        )
        .await;

        let mut map = sessions().lock().unwrap();
        if let Some(s) = map.get_mut(&sid) {
            match result {
                Ok(_) => {
                    s.status = "done".into();
                    s.message = format!("Installed \"{mod_name}\".");
                    s.error = None;
                }
                Err(e) => {
                    s.status = "error".into();
                    s.message = e.to_string();
                    s.error = Some(e.to_string());
                }
            }
        }
    });

    get_install_session(session_id)
}

fn preview_conflicts_for_extract(
    profile_id: &str,
    extract_dir: &str,
    mod_name: &str,
) -> Vec<crate::services::conflict::FileConflict> {
    let entries = match crate::services::archive::list_extracted_entries(Path::new(extract_dir)) {
        Ok(e) => e,
        Err(_) => return vec![],
    };
    let deploy_files: Vec<String> = entries.into_iter().map(|e| e.path).collect();
    let existing: Vec<(String, Vec<String>)> = db::list_installed_mods(profile_id)
        .unwrap_or_default()
        .into_iter()
        .map(|m| {
            let files: Vec<String> =
                serde_json::from_str(&m.installed_files_json).unwrap_or_default();
            (m.name, files)
        })
        .collect();
    crate::services::conflict::detect_conflicts(&existing, &deploy_files, mod_name)
}

// ---- Companion API v3: load order, downloads, collections, settings ----

#[derive(Debug, Deserialize)]
pub struct GameDomainBody {
    pub game_domain: String,
}

pub fn get_load_order_state(domain: &str) -> Result<String> {
    let profile = profile_for_domain(domain)?;
    let state = crate::services::load_order::get_load_order_state(&profile.id)?;
    Ok(serde_json::to_string(&state).unwrap_or_else(|_| "{}".to_string()))
}

pub fn sort_load_order(body: GameDomainBody) -> Result<String> {
    let profile = profile_for_domain(&body.game_domain)?;
    let _ = crate::services::load_order::auto_sort_load_order(&profile.id)?;
    let _ = crate::services::plugins_txt::sync_plugins_txt(&profile)?;
    get_load_order_state(&body.game_domain)
}

pub fn sync_plugins_for_game(body: GameDomainBody) -> Result<String> {
    let profile = profile_for_domain(&body.game_domain)?;
    let result = crate::services::plugins_txt::sync_plugins_txt(&profile)?;
    Ok(serde_json::to_string(&result).unwrap_or_else(|_| "{}".to_string()))
}

#[derive(Debug, Clone, Serialize)]
pub struct CompanionDownloadRecord {
    pub id: String,
    pub game_domain: String,
    pub mod_id: i64,
    pub file_id: i64,
    pub mod_name: String,
    pub bytes_done: i64,
    pub bytes_total: i64,
    pub status: String,
    pub progress_pct: u8,
}

pub fn list_companion_downloads(domain: &str) -> Result<String> {
    let profile = profile_for_domain(domain)?;
    let ctx = receiver_context().ok_or_else(|| {
        NexusDeckError::Other("Remote receiver isn't fully initialized.".into())
    })?;
    let all = ctx.downloads.list_downloads()?;
    let records: Vec<CompanionDownloadRecord> = all
        .into_iter()
        .filter(|d| d.profile_id == profile.id || d.game_domain == domain)
        .map(|d| {
            let progress_pct = if d.bytes_total > 0 {
                ((d.bytes_done * 100) / d.bytes_total).clamp(0, 100) as u8
            } else {
                0
            };
            CompanionDownloadRecord {
                id: d.id,
                game_domain: d.game_domain,
                mod_id: d.mod_id,
                file_id: d.file_id,
                mod_name: d.mod_name,
                bytes_done: d.bytes_done,
                bytes_total: d.bytes_total,
                status: d.status,
                progress_pct,
            }
        })
        .collect();
    Ok(serde_json::to_string(&records).unwrap_or_else(|_| "[]".to_string()))
}

pub fn list_library_updates(domain: &str) -> Result<String> {
    require_nexus()?;
    let profile = profile_for_domain(domain)?;
    let ctx = receiver_context().ok_or_else(|| {
        NexusDeckError::Other("Remote receiver isn't fully initialized.".into())
    })?;
    let updates = async_runtime::block_on(
        crate::services::update_checker::check_profile_updates(&ctx.nexus, &profile.id),
    )?;
    Ok(serde_json::to_string(&updates).unwrap_or_else(|_| "[]".to_string()))
}

pub fn list_collections_for_game(domain: &str, offset: u32) -> Result<String> {
    require_nexus()?;
    let ctx = receiver_context().ok_or_else(|| {
        NexusDeckError::Other("Remote receiver isn't fully initialized.".into())
    })?;
    let list = async_runtime::block_on(crate::services::collections::list_collections(
        &ctx.nexus,
        domain,
        offset,
        24,
    ))?;
    Ok(serde_json::to_string(&list).unwrap_or_else(|_| "[]".to_string()))
}

#[derive(Debug, Clone, Serialize)]
pub struct CompanionCollectionDetail {
    pub detail: crate::services::nexus_client::CollectionDetail,
    pub diff: crate::services::profile_insights::CollectionDiffResult,
}

pub fn collection_detail_with_diff(domain: &str, slug: &str) -> Result<String> {
    require_nexus()?;
    let profile = profile_for_domain(domain)?;
    let ctx = receiver_context().ok_or_else(|| {
        NexusDeckError::Other("Remote receiver isn't fully initialized.".into())
    })?;
    let detail = async_runtime::block_on(crate::services::collections::get_collection_detail(
        &ctx.nexus,
        domain,
        slug,
    ))?;
    let inputs: Vec<crate::services::profile_insights::CollectionModInput> = detail
        .mods
        .iter()
        .map(|m| crate::services::profile_insights::CollectionModInput {
            mod_id: m.mod_id,
            file_id: m.file_id,
            name: m.name.clone(),
            optional: m.optional,
            version: m.version.clone(),
        })
        .collect();
    let diff = crate::services::profile_insights::diff_collection(&profile.id, &inputs)?;
    let payload = CompanionCollectionDetail { detail, diff };
    Ok(serde_json::to_string(&payload).unwrap_or_else(|_| "{}".to_string()))
}

#[derive(Debug, Deserialize)]
pub struct StartCollectionInstallBody {
    pub game_domain: String,
    pub slug: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct CollectionInstallQueued {
    pub mod_id: u64,
    pub mod_name: String,
    pub download_id: String,
}

pub fn start_collection_install(body: StartCollectionInstallBody) -> Result<String> {
    require_nexus()?;
    let profile = profile_for_domain(&body.game_domain)?;
    let ctx = receiver_context().ok_or_else(|| {
        NexusDeckError::Other("Remote receiver isn't fully initialized.".into())
    })?;
    let detail = async_runtime::block_on(crate::services::collections::get_collection_detail(
        &ctx.nexus,
        &body.game_domain,
        &body.slug,
    ))?;
    let inputs: Vec<crate::services::profile_insights::CollectionModInput> = detail
        .mods
        .iter()
        .map(|m| crate::services::profile_insights::CollectionModInput {
            mod_id: m.mod_id,
            file_id: m.file_id,
            name: m.name.clone(),
            optional: m.optional,
            version: m.version.clone(),
        })
        .collect();
    let diff = crate::services::profile_insights::diff_collection(&profile.id, &inputs)?;
    let mut queued = Vec::new();
    for entry in diff.mods {
        if entry.status == "installed" {
            continue;
        }
        if entry.optional && entry.status != "missing" {
            continue;
        }
        let progress = async_runtime::block_on(
            crate::services::game_essentials::queue_mod_for_install(
                ctx.app.clone(),
                ctx.nexus.clone(),
                ctx.downloads.clone(),
                profile.id.clone(),
                entry.mod_id,
                entry.collection_file_id,
                entry.name.clone(),
            ),
        )?;
        ctx.downloads.mark_auto_install(&progress.id);
        queued.push(CollectionInstallQueued {
            mod_id: entry.mod_id,
            mod_name: entry.name,
            download_id: progress.id,
        });
    }
    Ok(serde_json::to_string(&queued).unwrap_or_else(|_| "[]".to_string()))
}

#[derive(Debug, Clone, Serialize)]
pub struct CompanionDeviceSettings {
    pub app_version: String,
    pub nexus_configured: bool,
    pub receive_enabled: bool,
    pub download_settings: crate::services::download_manager::DownloadSettings,
    pub auto_sort_after_install: bool,
    pub companion_api: u32,
}

pub fn device_settings_snapshot() -> Result<String> {
    let ctx = receiver_context().ok_or_else(|| {
        NexusDeckError::Other("Remote receiver isn't fully initialized.".into())
    })?;
    let download_settings = ctx.downloads.get_download_settings().unwrap_or_default();
    let payload = CompanionDeviceSettings {
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        nexus_configured: nexus_configured(),
        receive_enabled: true,
        download_settings,
        auto_sort_after_install: false,
        companion_api: COMPANION_API_VERSION,
    };
    Ok(serde_json::to_string(&payload).unwrap_or_else(|_| "{}".to_string()))
}

pub fn sync_presets_on_device(body: GameDomainBody) -> Result<String> {
    let profile = profile_for_domain(&body.game_domain)?;
    if crate::services::tools::game_supports_body_setup(&profile.game_domain) {
        crate::services::tools::configure_bodyslide_paths(&profile.id)?;
        Ok(serde_json::json!({ "ok": true, "message": "BodySlide paths configured." }).to_string())
    } else {
        Err(NexusDeckError::Other(
            "BodySlide is not supported for this game.".into(),
        ))
    }
}

pub fn apply_load_order_on_device(body: GameDomainBody) -> Result<String> {
    let profile = profile_for_domain(&body.game_domain)?;
    let _ = crate::services::load_order::auto_sort_load_order(&profile.id)?;
    let sync = crate::services::plugins_txt::sync_plugins_txt(&profile)?;
    Ok(serde_json::json!({
        "ok": true,
        "message": format!("LOOT sort applied; {} plugin(s) in plugins.txt.", sync.plugin_count),
    })
    .to_string())
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

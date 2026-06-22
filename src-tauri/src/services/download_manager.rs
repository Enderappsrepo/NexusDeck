use std::collections::{HashMap, VecDeque};
use std::io::{Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use futures_util::StreamExt;
use parking_lot::Mutex;
use reqwest::header::{HeaderMap, HeaderValue, ACCEPT, RANGE, USER_AGENT};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use tauri::{async_runtime::spawn, AppHandle, Emitter};
use tokio::sync::watch;
use uuid::Uuid;

use crate::db::{self, DownloadRecord};
use crate::error::{NexusDeckError, Result};
use crate::services::archive::{ensure_archive_extension, looks_like_archive};
use crate::services::nexus_client::{DownloadLink, NexusClient};
use crate::services::paths::platform_name;

const SETTINGS_KEY: &str = "download_settings";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadProgress {
    pub id: String,
    pub game_domain: String,
    pub mod_id: u64,
    pub file_id: u64,
    pub file_name: String,
    pub bytes_done: u64,
    pub bytes_total: u64,
    pub status: String,
    pub dest_path: String,
    #[serde(default)]
    pub mod_name: String,
    #[serde(default)]
    pub profile_id: String,
    #[serde(default)]
    pub update_target_mod_id: String,
    #[serde(default)]
    pub auto_install: bool,
    #[serde(default)]
    pub queue_position: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadSettings {
    pub max_concurrent: u32,
    pub speed_limit_kbps: u32,
    #[serde(default)]
    pub auto_install_after_download: bool,
    #[serde(default)]
    pub pause_on_battery: bool,
    #[serde(default)]
    pub bandwidth_saver: bool,
}

impl Default for DownloadSettings {
    fn default() -> Self {
        Self {
            max_concurrent: 2,
            speed_limit_kbps: 0,
            auto_install_after_download: false,
            pause_on_battery: false,
            bandwidth_saver: false,
        }
    }
}

struct QueuedDownload {
    id: String,
    app: AppHandle,
    nexus: Arc<NexusClient>,
    game_domain: String,
    mod_id: u64,
    file_id: u64,
    file_name: String,
    dest_dir: PathBuf,
    expected_size_kb: u64,
    mod_name: String,
    profile_id: String,
    update_target_mod_id: String,
    resume_uri: Option<String>,
    resume_bytes: u64,
}

struct ActiveDownload {
    cancel_tx: watch::Sender<bool>,
}

pub struct DownloadManager {
    client: Client,
    queue: Arc<Mutex<VecDeque<QueuedDownload>>>,
    active: Arc<Mutex<HashMap<String, ActiveDownload>>>,
    running_count: Arc<AtomicUsize>,
    processing: Arc<Mutex<bool>>,
    auto_install_ids: Arc<Mutex<std::collections::HashSet<String>>>,
}

impl DownloadManager {
    pub fn new() -> Self {
        let ua = format!(
            "NexusDeck/{} ({})",
            env!("CARGO_PKG_VERSION"),
            platform_name()
        );
        Self {
            client: Client::builder()
                .timeout(Duration::from_secs(300))
                .redirect(reqwest::redirect::Policy::limited(10))
                .user_agent(ua)
                .build()
                .expect("download client"),
            queue: Arc::new(Mutex::new(VecDeque::new())),
            active: Arc::new(Mutex::new(HashMap::new())),
            running_count: Arc::new(AtomicUsize::new(0)),
            processing: Arc::new(Mutex::new(false)),
            auto_install_ids: Arc::new(Mutex::new(std::collections::HashSet::new())),
        }
    }

    pub fn mark_auto_install(&self, download_id: &str) {
        self.auto_install_ids.lock().insert(download_id.to_string());
    }

    pub fn consume_auto_install(&self, download_id: &str) -> bool {
        self.auto_install_ids.lock().remove(download_id)
    }

    fn progress_auto_install(&self, download_id: &str) -> bool {
        self.auto_install_ids.lock().contains(download_id)
    }

    pub fn get_download_settings(&self) -> Result<DownloadSettings> {
        match db::get_setting(SETTINGS_KEY)? {
            Some(json) => Ok(serde_json::from_str(&json).unwrap_or_default()),
            None => Ok(DownloadSettings::default()),
        }
    }

    pub fn set_download_settings(&self, settings: DownloadSettings) -> Result<()> {
        db::set_setting(SETTINGS_KEY, &serde_json::to_string(&settings)?)
    }

    pub async fn start_download(
        &self,
        app: AppHandle,
        nexus: Arc<NexusClient>,
        game_domain: &str,
        mod_id: u64,
        file_id: u64,
        file_name: &str,
        dest_dir: &Path,
        expected_size_kb: u64,
    ) -> Result<DownloadProgress> {
        self.enqueue_download_inner(
            app,
            nexus,
            game_domain,
            mod_id,
            file_id,
            file_name,
            dest_dir,
            expected_size_kb,
            "",
            "",
            "",
            None,
            0,
        )
        .await
    }

    pub async fn enqueue_update_download(
        &self,
        app: AppHandle,
        nexus: Arc<NexusClient>,
        game_domain: &str,
        mod_id: u64,
        file_id: u64,
        file_name: &str,
        dest_dir: &Path,
        expected_size_kb: u64,
        mod_name: &str,
        profile_id: &str,
        update_target_mod_id: &str,
    ) -> Result<DownloadProgress> {
        self.enqueue_download_inner(
            app,
            nexus,
            game_domain,
            mod_id,
            file_id,
            file_name,
            dest_dir,
            expected_size_kb,
            mod_name,
            profile_id,
            update_target_mod_id,
            None,
            0,
        )
        .await
    }

    pub async fn enqueue_download(
        &self,
        app: AppHandle,
        nexus: Arc<NexusClient>,
        game_domain: &str,
        mod_id: u64,
        file_id: u64,
        file_name: &str,
        dest_dir: &Path,
        expected_size_kb: u64,
        mod_name: &str,
        profile_id: &str,
        resume_uri: Option<String>,
        resume_bytes: u64,
    ) -> Result<DownloadProgress> {
        self.enqueue_download_inner(
            app,
            nexus,
            game_domain,
            mod_id,
            file_id,
            file_name,
            dest_dir,
            expected_size_kb,
            mod_name,
            profile_id,
            "",
            resume_uri,
            resume_bytes,
        )
        .await
    }

    async fn enqueue_download_inner(
        &self,
        app: AppHandle,
        nexus: Arc<NexusClient>,
        game_domain: &str,
        mod_id: u64,
        file_id: u64,
        file_name: &str,
        dest_dir: &Path,
        expected_size_kb: u64,
        mod_name: &str,
        profile_id: &str,
        update_target_mod_id: &str,
        resume_uri: Option<String>,
        resume_bytes: u64,
    ) -> Result<DownloadProgress> {
        std::fs::create_dir_all(dest_dir)?;

        let uri = if let Some(uri) = resume_uri {
            uri
        } else {
            let links = nexus
                .get_download_links(game_domain, mod_id, file_id)
                .await?;
            pick_download_link(&links)
                .ok_or_else(|| NexusDeckError::Download("No download link returned".into()))?
                .uri
                .clone()
        };

        let safe_name = sanitize_filename(file_name);
        let dest_path = dest_dir.join(&safe_name);
        let id = Uuid::new_v4().to_string();
        let expected_bytes = expected_size_kb.saturating_mul(1024);

        let record = DownloadRecord {
            id: id.clone(),
            game_domain: game_domain.to_string(),
            mod_id: mod_id as i64,
            file_id: file_id as i64,
            url: uri.clone(),
            dest_path: dest_path.display().to_string(),
            bytes_done: resume_bytes as i64,
            bytes_total: expected_bytes as i64,
            status: "queued".to_string(),
            created_at: chrono::Utc::now().timestamp(),
            mod_name: mod_name.to_string(),
            profile_id: profile_id.to_string(),
            update_target_mod_id: update_target_mod_id.to_string(),
        };
        db::insert_download(&record)?;

        let queue_position = self.queue.lock().len() as u32 + 1;
        let progress = DownloadProgress {
            id: id.clone(),
            game_domain: game_domain.to_string(),
            mod_id,
            file_id,
            file_name: safe_name.clone(),
            bytes_done: resume_bytes,
            bytes_total: expected_bytes,
            status: "queued".to_string(),
            dest_path: dest_path.display().to_string(),
            mod_name: mod_name.to_string(),
            profile_id: profile_id.to_string(),
            update_target_mod_id: update_target_mod_id.to_string(),
            auto_install: self.auto_install_ids.lock().contains(&id),
            queue_position,
        };

        let _ = app.emit("download-progress", &progress);

        self.queue.lock().push_back(QueuedDownload {
            id,
            app,
            nexus,
            game_domain: game_domain.to_string(),
            mod_id,
            file_id,
            file_name: safe_name,
            dest_dir: dest_dir.to_path_buf(),
            expected_size_kb,
            mod_name: mod_name.to_string(),
            profile_id: profile_id.to_string(),
            update_target_mod_id: update_target_mod_id.to_string(),
            resume_uri: Some(uri),
            resume_bytes,
        });

        self.process_queue();
        Ok(progress)
    }

    pub fn cancel_download(&self, id: &str) -> Result<()> {
        if let Some(active) = self.active.lock().remove(id) {
            let _ = active.cancel_tx.send(true);
        }

        self.queue.lock().retain(|q| q.id != id);

        if let Some(record) = db::get_download(id)? {
            let dest = PathBuf::from(&record.dest_path);
            let part = part_path(&dest);
            if part.exists() {
                let _ = std::fs::remove_file(&part);
            }
            db::update_download_status(id, "cancelled", record.bytes_done, record.bytes_total)?;
        }

        Ok(())
    }

    pub async fn retry_download(
        &self,
        app: AppHandle,
        nexus: Arc<NexusClient>,
        id: &str,
    ) -> Result<DownloadProgress> {
        let record = db::get_download(id)?
            .ok_or_else(|| NexusDeckError::NotFound(format!("Download {id} not found")))?;

        let dest = PathBuf::from(&record.dest_path);
        let part = part_path(&dest);
        let resume_bytes = if part.exists() {
            part.metadata().map(|m| m.len()).unwrap_or(0)
        } else {
            0
        };

        db::delete_download(id)?;

        let file_name = dest
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("download");

        self.enqueue_download_inner(
            app,
            nexus,
            &record.game_domain,
            record.mod_id as u64,
            record.file_id as u64,
            file_name,
            dest.parent().unwrap_or(Path::new(".")),
            (record.bytes_total as u64).saturating_div(1024).max(1),
            &record.mod_name,
            &record.profile_id,
            &record.update_target_mod_id,
            Some(record.url),
            resume_bytes,
        )
        .await
    }

    pub fn clear_completed(&self) -> Result<u64> {
        db::clear_completed_downloads()
    }

    pub fn dismiss_download(&self, id: &str) -> Result<()> {
        db::delete_download(id)
    }

    pub fn clear_failed(&self) -> Result<u64> {
        db::clear_failed_downloads()
    }

    pub fn resume_incomplete_downloads(&self, app: AppHandle, nexus: Arc<NexusClient>) {
        let records = db::list_incomplete_downloads().unwrap_or_default();
        for record in records {
            let dest = PathBuf::from(&record.dest_path);
            let part = part_path(&dest);
            let resume_bytes = if part.exists() {
                part.metadata().map(|m| m.len()).unwrap_or(0)
            } else {
                record.bytes_done as u64
            };

            let file_name = dest
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("download");

            let dest_dir = dest.parent().unwrap_or(Path::new(".")).to_path_buf();
            let _ = db::update_download_status(&record.id, "queued", resume_bytes as i64, record.bytes_total);
            let _ = self.queue.lock().push_back(QueuedDownload {
                id: record.id.clone(),
                app: app.clone(),
                nexus: Arc::clone(&nexus),
                game_domain: record.game_domain.clone(),
                mod_id: record.mod_id as u64,
                file_id: record.file_id as u64,
                file_name: file_name.to_string(),
                dest_dir,
                expected_size_kb: (record.bytes_total as u64).saturating_div(1024).max(1),
                mod_name: record.mod_name.clone(),
                profile_id: record.profile_id.clone(),
                update_target_mod_id: record.update_target_mod_id.clone(),
                resume_uri: Some(record.url.clone()),
                resume_bytes,
            });
        }
        self.process_queue();
    }

    fn process_queue(&self) {
        let mut processing = self.processing.lock();
        if *processing {
            return;
        }
        *processing = true;
        drop(processing);

        let manager = self.clone_inner();
        spawn(async move {
            loop {
                let settings = manager.get_download_settings().unwrap_or_default();
                if settings.pause_on_battery && on_battery_power() {
                    tokio::time::sleep(Duration::from_secs(5)).await;
                    continue;
                }

                let (max_concurrent, _) = effective_download_limits(&settings);
                let max = max_concurrent.max(1) as usize;
                let running = manager.running_count.load(Ordering::SeqCst);

                if running >= max {
                    tokio::time::sleep(Duration::from_millis(200)).await;
                    continue;
                }

                let item = manager.queue.lock().pop_front();
                let Some(item) = item else {
                    *manager.processing.lock() = false;
                    break;
                };

                manager.running_count.fetch_add(1, Ordering::SeqCst);
                let inner = manager.clone_inner();
                spawn(async move {
                    let result = inner.run_download(item).await;
                    inner.running_count.fetch_sub(1, Ordering::SeqCst);
                    inner.process_queue();
                    let _ = result;
                });
            }
        });
    }

    async fn run_download(&self, item: QueuedDownload) -> Result<()> {
        let uri = item
            .resume_uri
            .clone()
            .ok_or_else(|| NexusDeckError::Download("Missing download URI".into()))?;

        let dest_path = item.dest_dir.join(&item.file_name);
        let expected_bytes = item.expected_size_kb.saturating_mul(1024);
        let (cancel_tx, cancel_rx) = watch::channel(false);

        self.active
            .lock()
            .insert(item.id.clone(), ActiveDownload { cancel_tx });

        db::update_download_status(
            &item.id,
            "downloading",
            item.resume_bytes as i64,
            expected_bytes as i64,
        )?;

        let settings = self.get_download_settings().unwrap_or_default();
        let (_, speed_limit_kbps) = effective_download_limits(&settings);
        let result = self
            .download_file(
                &item.app,
                &item.id,
                &uri,
                &dest_path,
                &item.game_domain,
                item.mod_id,
                item.file_id,
                &item.file_name,
                expected_bytes,
                item.resume_bytes,
                cancel_rx,
                speed_limit_kbps,
                &item.mod_name,
                &item.profile_id,
                &item.update_target_mod_id,
            )
            .await;

        self.active.lock().remove(&item.id);

        if let Err(e) = result {
            let status = if e.to_string().contains("cancelled") {
                "cancelled"
            } else {
                "failed"
            };
            let part = part_path(&dest_path);
            let bytes_preserved = if part.exists() {
                part.metadata().map(|m| m.len()).unwrap_or(item.resume_bytes)
            } else {
                item.resume_bytes
            };
            let _ = db::update_download_status(
                &item.id,
                status,
                bytes_preserved as i64,
                expected_bytes as i64,
            );
            let _ = item.app.emit(
                "download-error",
                serde_json::json!({ "id": item.id, "error": e.to_string() }),
            );
            return Err(e);
        }

        Ok(())
    }

    async fn download_file(
        &self,
        app: &AppHandle,
        id: &str,
        uri: &str,
        dest_path: &Path,
        game_domain: &str,
        mod_id: u64,
        file_id: u64,
        file_name: &str,
        expected_bytes: u64,
        resume_from: u64,
        cancel_rx: watch::Receiver<bool>,
        speed_limit_kbps: u32,
        mod_name: &str,
        profile_id: &str,
        update_target_mod_id: &str,
    ) -> Result<()> {
        let temp_path = part_path(dest_path);
        let mut headers = download_headers()?;

        if resume_from > 0 {
            headers.insert(
                RANGE,
                HeaderValue::from_str(&format!("bytes={resume_from}-"))
                    .map_err(|e| NexusDeckError::Download(e.to_string()))?,
            );
        }

        let response = self
            .client
            .get(uri)
            .headers(headers)
            .send()
            .await
            .map_err(|e| NexusDeckError::Download(e.to_string()))?;

        if !response.status().is_success() && response.status().as_u16() != 206 {
            return Err(NexusDeckError::Download(format!(
                "HTTP {} from download server",
                response.status()
            )));
        }

        let content_length = response
            .headers()
            .get("content-length")
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.parse::<u64>().ok())
            .unwrap_or(0);

        let bytes_total = if resume_from > 0 {
            resume_from.saturating_add(content_length)
        } else if content_length > 0 {
            content_length
        } else {
            expected_bytes
        };

        let mut file = if resume_from > 0 && temp_path.exists() {
            let mut f = std::fs::OpenOptions::new()
                .write(true)
                .open(&temp_path)?;
            f.seek(SeekFrom::End(0))?;
            f
        } else {
            std::fs::File::create(&temp_path)?
        };

        let mut stream = response.bytes_stream();
        let mut bytes_done = resume_from;
        let mut last_emit = Instant::now();
        let mut chunk_start = Instant::now();
        let mut chunk_bytes: u64 = 0;

        while let Some(chunk) = stream.next().await {
            if *cancel_rx.borrow() {
                return Err(NexusDeckError::Download("Download cancelled".into()));
            }

            let chunk = chunk.map_err(|e| NexusDeckError::Download(e.to_string()))?;
            file.write_all(&chunk)?;
            bytes_done += chunk.len() as u64;
            chunk_bytes += chunk.len() as u64;

            if speed_limit_kbps > 0 {
                let target_duration = Duration::from_secs_f64(
                    chunk_bytes as f64 / (speed_limit_kbps as f64 * 1024.0),
                );
                let elapsed = chunk_start.elapsed();
                if target_duration > elapsed {
                    tokio::time::sleep(target_duration - elapsed).await;
                }
                if chunk_start.elapsed() >= Duration::from_secs(1) {
                    chunk_start = Instant::now();
                    chunk_bytes = 0;
                }
            }

            if last_emit.elapsed() >= Duration::from_millis(250) {
                db::update_download_status(id, "downloading", bytes_done as i64, bytes_total as i64)?;
                let progress = DownloadProgress {
                    id: id.to_string(),
                    game_domain: game_domain.to_string(),
                    mod_id,
                    file_id,
                    file_name: file_name.to_string(),
                    bytes_done,
                    bytes_total,
                    status: "downloading".to_string(),
                    dest_path: dest_path.display().to_string(),
                    mod_name: mod_name.to_string(),
                    profile_id: profile_id.to_string(),
                    update_target_mod_id: update_target_mod_id.to_string(),
                    auto_install: self.progress_auto_install(id),
                    queue_position: 0,
                };
                let _ = app.emit("download-progress", &progress);
                last_emit = Instant::now();
            }
        }

        file.sync_all()?;
        validate_download(&temp_path, bytes_done, expected_bytes)?;

        if dest_path.exists() {
            std::fs::remove_file(dest_path)?;
        }
        std::fs::rename(&temp_path, dest_path)?;

        let final_path = ensure_archive_extension(dest_path)?;
        let final_name = final_path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or(file_name)
            .to_string();

        db::update_download_status(id, "complete", bytes_done as i64, bytes_total as i64)?;

        let auto_install = self.consume_auto_install(id)
            || (!update_target_mod_id.is_empty() && update_target_mod_id != "");

        let progress = DownloadProgress {
            id: id.to_string(),
            game_domain: game_domain.to_string(),
            mod_id,
            file_id,
            file_name: final_name,
            bytes_done,
            bytes_total: bytes_done,
            status: "complete".to_string(),
            dest_path: final_path.display().to_string(),
            mod_name: mod_name.to_string(),
            profile_id: profile_id.to_string(),
            update_target_mod_id: update_target_mod_id.to_string(),
            auto_install,
            queue_position: 0,
        };
        let _ = app.emit("download-complete", &progress);
        Ok(())
    }

    pub fn list_downloads(&self) -> Result<Vec<DownloadRecord>> {
        db::list_downloads()
    }

    fn clone_inner(&self) -> Self {
        Self {
            client: self.client.clone(),
            queue: Arc::clone(&self.queue),
            active: Arc::clone(&self.active),
            running_count: Arc::clone(&self.running_count),
            processing: Arc::clone(&self.processing),
            auto_install_ids: Arc::clone(&self.auto_install_ids),
        }
    }
}

fn part_path(dest_path: &Path) -> PathBuf {
    dest_path.with_extension("nexusdeck.part")
}

fn pick_download_link(links: &[DownloadLink]) -> Option<&DownloadLink> {
    links
        .iter()
        .find(|l| l.name.eq_ignore_ascii_case("premium"))
        .or_else(|| links.iter().find(|l| l.name.to_lowercase().contains("cdn")))
        .or_else(|| links.iter().find(|l| l.uri.starts_with("https://")))
        .or_else(|| links.first())
}

fn download_headers() -> Result<HeaderMap> {
    let mut headers = HeaderMap::new();
    headers.insert(ACCEPT, HeaderValue::from_static("*/*"));
    headers.insert(
        USER_AGENT,
        HeaderValue::from_str(&format!(
            "NexusDeck/{} ({})",
            env!("CARGO_PKG_VERSION"),
            platform_name()
        ))
        .map_err(|e| NexusDeckError::Download(e.to_string()))?,
    );
    Ok(headers)
}

fn sanitize_filename(name: &str) -> String {
    let sanitized: String = name
        .chars()
        .map(|c| {
            if r#"<>:"/\|?*"#.contains(c) {
                '_'
            } else {
                c
            }
        })
        .collect();
    sanitized.trim().to_string()
}

fn validate_download(path: &Path, bytes_done: u64, expected_bytes: u64) -> Result<()> {
    if bytes_done == 0 {
        return Err(NexusDeckError::Download(
            "Downloaded file is empty — check Premium status and API key".into(),
        ));
    }

    if expected_bytes > 0 && bytes_done < expected_bytes.saturating_mul(8) / 10 {
        return Err(NexusDeckError::Download(format!(
            "Download incomplete: got {} bytes, expected about {}",
            bytes_done, expected_bytes
        )));
    }

    if !looks_like_archive(path)? {
        return Err(NexusDeckError::Download(
            "Downloaded file is not a valid archive — the server may have returned an error page"
                .into(),
        ));
    }

    Ok(())
}

fn on_battery_power() -> bool {
    #[cfg(target_os = "linux")]
    {
        if let Ok(entries) = std::fs::read_dir("/sys/class/power_supply") {
            for entry in entries.flatten() {
                let path = entry.path();
                if let Ok(kind) = std::fs::read_to_string(path.join("type")) {
                    if kind.trim() == "Battery" {
                        if let Ok(status) = std::fs::read_to_string(path.join("status")) {
                            match status.trim() {
                                "Discharging" | "Not charging" => return true,
                                _ => {}
                            }
                        }
                    }
                }
            }
        }
    }
    false
}

fn effective_download_limits(settings: &DownloadSettings) -> (u32, u32) {
    let mut max_concurrent = settings.max_concurrent;
    let mut speed_limit_kbps = settings.speed_limit_kbps;
    if settings.bandwidth_saver {
        max_concurrent = max_concurrent.min(1);
        if speed_limit_kbps == 0 {
            speed_limit_kbps = 512;
        }
    }
    (max_concurrent, speed_limit_kbps)
}

impl Default for DownloadManager {
    fn default() -> Self {
        Self::new()
    }
}

use std::fs::{File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

use crate::db;
use crate::error::Result;
use crate::services::paths::{ensure_dir, logs_dir, session_log_path};

pub const VERBOSE_LOGGING_KEY: &str = "verbose_logging";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum LogLevel {
    Debug,
    Info,
    Warn,
    Error,
}

impl LogLevel {
    fn as_str(self) -> &'static str {
        match self {
            LogLevel::Debug => "DEBUG",
            LogLevel::Info => "INFO",
            LogLevel::Warn => "WARN",
            LogLevel::Error => "ERROR",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstallLogEvent {
    pub session_id: String,
    pub ts: String,
    pub level: LogLevel,
    pub phase: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub context: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogFileInfo {
    pub path: String,
    pub name: String,
    pub size_bytes: u64,
    pub modified_at: String,
    pub kind: String,
}

pub fn is_verbose_logging_enabled() -> bool {
    db::get_setting(VERBOSE_LOGGING_KEY)
        .ok()
        .flatten()
        .map(|v| v == "true" || v == "1")
        .unwrap_or(false)
}

pub fn set_verbose_logging(enabled: bool) -> Result<()> {
    db::set_setting(VERBOSE_LOGGING_KEY, if enabled { "true" } else { "false" })
}

fn timestamp() -> String {
    chrono::Utc::now().to_rfc3339()
}

fn sanitize_mod_name(name: &str) -> String {
    name.chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect::<String>()
        .chars()
        .take(48)
        .collect()
}

pub fn install_log_filename(mod_name: &str, session_id: &str) -> String {
    let now = chrono::Utc::now().format("%Y%m%d_%H%M%S");
    format!(
        "install_mod_{}_{}_{}.log",
        sanitize_mod_name(mod_name),
        now,
        &session_id[..8.min(session_id.len())]
    )
}

pub struct InstallLogger {
    session_id: String,
    log_path: PathBuf,
    jsonl_path: Option<PathBuf>,
    verbose: bool,
    file: Arc<Mutex<File>>,
    jsonl_file: Arc<Mutex<Option<File>>>,
    app: Option<AppHandle>,
}

impl InstallLogger {
    pub fn new(session_id: String, mod_name: &str, app: Option<AppHandle>) -> Result<Self> {
        let log_dir = logs_dir()?;
        let log_path = log_dir.join(install_log_filename(mod_name, &session_id));
        let verbose = is_verbose_logging_enabled();
        let jsonl_path = if verbose {
            Some(log_path.with_extension("jsonl"))
        } else {
            None
        };

        let file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&log_path)?;

        let jsonl_file = if let Some(ref jp) = jsonl_path {
            Some(
                OpenOptions::new()
                    .create(true)
                    .append(true)
                    .open(jp)?,
            )
        } else {
            None
        };

        Ok(Self {
            session_id,
            log_path,
            jsonl_path,
            verbose,
            file: Arc::new(Mutex::new(file)),
            jsonl_file: Arc::new(Mutex::new(jsonl_file)),
            app,
        })
    }

    pub fn log_path(&self) -> &Path {
        &self.log_path
    }

    pub fn session_id(&self) -> &str {
        &self.session_id
    }

    pub fn write_header(&self, header: &str) -> Result<()> {
        let mut file = self.file.lock().expect("install log mutex poisoned");
        writeln!(file, "{header}")?;
        Ok(())
    }

    pub fn log(&self, level: LogLevel, phase: &str, message: &str) {
        self.log_with_context(level, phase, message, None);
    }

    pub fn log_with_context(
        &self,
        level: LogLevel,
        phase: &str,
        message: &str,
        context: Option<serde_json::Value>,
    ) {
        let ts = timestamp();
        let line = format!(
            "[{ts}] {} [{phase}] {message}\n",
            level.as_str()
        );

        if matches!(level, LogLevel::Error) {
            eprintln!("NexusDeck install [{phase}]: {message}");
        } else if self.verbose || !matches!(level, LogLevel::Debug) {
            eprintln!("NexusDeck install [{phase}]: {message}");
        }

        if let Ok(mut file) = self.file.lock() {
            let _ = file.write_all(line.as_bytes());
        }

        if self.verbose {
            if let Ok(mut guard) = self.jsonl_file.lock() {
                if let Some(ref mut jf) = *guard {
                    let event = InstallLogEvent {
                        session_id: self.session_id.clone(),
                        ts: ts.clone(),
                        level,
                        phase: phase.to_string(),
                        message: message.to_string(),
                        context: context.clone(),
                    };
                    if let Ok(json) = serde_json::to_string(&event) {
                        let _ = writeln!(jf, "{json}");
                    }
                }
            }
        }

        if let Some(ref app) = self.app {
            let _ = app.emit(
                "install:log",
                InstallLogEvent {
                    session_id: self.session_id.clone(),
                    ts,
                    level,
                    phase: phase.to_string(),
                    message: message.to_string(),
                    context,
                },
            );
        }
    }

    pub fn debug(&self, phase: &str, message: &str) {
        if self.verbose {
            self.log(LogLevel::Debug, phase, message);
        }
    }

    pub fn info(&self, phase: &str, message: &str) {
        self.log(LogLevel::Info, phase, message);
    }

    pub fn warn(&self, phase: &str, message: &str) {
        self.log(LogLevel::Warn, phase, message);
    }

    pub fn error(&self, phase: &str, message: &str) {
        self.log(LogLevel::Error, phase, message);
    }
}

pub fn append_session_log(step: &str, detail: &str) {
    let line = format!("[{}] {step}: {detail}\n", timestamp());
    eprintln!("NexusDeck: {step}: {detail}");

    if let Ok(path) = session_log_path() {
        if let Some(parent) = path.parent() {
            let _ = ensure_dir(parent);
        }
        if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(&path) {
            let _ = file.write_all(line.as_bytes());
        }
    }
}

pub fn list_recent_logs(limit: usize) -> Result<Vec<LogFileInfo>> {
    let dir = logs_dir()?;
    let mut files: Vec<LogFileInfo> = Vec::new();

    if let Ok(read_dir) = std::fs::read_dir(&dir) {
        for entry in read_dir.flatten() {
            let path = entry.path();
            if !path.is_file() {
                continue;
            }
            let name = path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("")
                .to_string();
            if name == "session.log" || name.starts_with("install_mod_") {
                let meta = entry.metadata().ok();
                let kind = if name.ends_with(".jsonl") {
                    "jsonl".to_string()
                } else if name == "session.log" {
                    "session".to_string()
                } else {
                    "install".to_string()
                };
                files.push(LogFileInfo {
                    path: path.display().to_string(),
                    name,
                    size_bytes: meta.as_ref().map(|m| m.len()).unwrap_or(0),
                    modified_at: meta
                        .and_then(|m| m.modified().ok())
                        .map(|t| {
                            chrono::DateTime::<chrono::Utc>::from(t).to_rfc3339()
                        })
                        .unwrap_or_default(),
                    kind,
                });
            }
        }
    }

    files.sort_by(|a, b| b.modified_at.cmp(&a.modified_at));
    files.truncate(limit);
    Ok(files)
}

pub fn read_log_file(path: &str, max_bytes: usize) -> Result<String> {
    let path = PathBuf::from(path);
    let logs = logs_dir()?;
    if !path.starts_with(&logs) {
        return Err(crate::error::NexusDeckError::Other(
            "Log path outside logs directory".into(),
        ));
    }
    let meta = std::fs::metadata(&path)?;
    if meta.len() == 0 {
        return Ok(String::new());
    }
    let bytes = std::fs::read(&path)?;
    let start = bytes.len().saturating_sub(max_bytes);
    Ok(String::from_utf8_lossy(&bytes[start..]).to_string())
}

const EXPORT_ARCHIVE_SIZE_CAP: u64 = 50 * 1024 * 1024;

pub fn export_install_logs_zip(
    last_n: usize,
    include_archive: Option<&Path>,
) -> Result<PathBuf> {
    let dir = logs_dir()?;
    let temp = std::env::temp_dir().join(format!(
        "nexusdeck-logs-{}.zip",
        chrono::Utc::now().format("%Y%m%d_%H%M%S")
    ));

    let recent = list_recent_logs(last_n)?;
    let mut paths: Vec<PathBuf> = recent
        .iter()
        .filter(|f| f.kind != "jsonl" || is_verbose_logging_enabled())
        .map(|f| PathBuf::from(&f.path))
        .collect();

    let session = dir.join("session.log");
    if session.exists() && !paths.iter().any(|p| p == &session) {
        paths.push(session);
    }

    let diagnostics = dir.join(format!(
        "diagnostics_{}.json",
        chrono::Utc::now().format("%Y%m%d_%H%M%S")
    ));
    let diag_json = crate::services::startup_log::collect_diagnostics();
    std::fs::write(&diagnostics, serde_json::to_string_pretty(&diag_json)?)?;
    paths.push(diagnostics.clone());

    if let Some(archive) = include_archive {
        if archive.is_file() {
            if let Ok(meta) = std::fs::metadata(archive) {
                if meta.len() <= EXPORT_ARCHIVE_SIZE_CAP {
                    paths.push(archive.to_path_buf());
                }
            }
        }
    }

    write_zip(&temp, &paths)?;

    let _ = std::fs::remove_file(&diagnostics);

    Ok(temp)
}

fn write_zip(dest: &Path, files: &[PathBuf]) -> Result<()> {
    use std::io::Read;
    use zip::write::SimpleFileOptions;
    use zip::ZipWriter;

    let file = File::create(dest)?;
    let mut zip = ZipWriter::new(file);
    let options = SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);

    for path in files {
        if !path.is_file() {
            continue;
        }
        let name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("file");
        zip.start_file(name, options)
            .map_err(|e| crate::error::NexusDeckError::Other(format!("Zip error: {e}")))?;
        let mut f = File::open(path)?;
        let mut buffer = Vec::new();
        f.read_to_end(&mut buffer)?;
        zip.write_all(&buffer)?;
    }

    zip.finish()
        .map_err(|e| crate::error::NexusDeckError::Other(format!("Zip error: {e}")))?;
    Ok(())
}

pub fn build_install_header(
    mod_name: &str,
    nexus_mod_id: i64,
    nexus_file_id: i64,
    archive_path: &Path,
    profile: &db::Profile,
) -> String {
    let platform = crate::services::platform::detect_platform();
    let has_7z = crate::services::archive::has_7z_executable();
    let archive_size = std::fs::metadata(archive_path)
        .map(|m| format!("{} bytes", m.len()))
        .unwrap_or_else(|_| "unknown".into());

    let prefix = profile
        .proton_prefix_path
        .as_deref()
        .filter(|p| !p.is_empty())
        .unwrap_or("(none)");

    format!(
        "=== NexusDeck Install Log ===\n\
         App version: {}\n\
         OS: {} (Steam Deck: {}, Flatpak: {})\n\
         Game: {} @ {}\n\
         Proton prefix: {}\n\
         7-Zip available: {}\n\
         Verbose logging: {}\n\
         Mod: {mod_name} (nexus_mod_id={nexus_mod_id}, file_id={nexus_file_id})\n\
         Archive: {} ({archive_size})\n\
         =============================",
        env!("CARGO_PKG_VERSION"),
        platform.os,
        platform.is_steam_deck,
        platform.is_flatpak,
        profile.game_domain,
        profile.game_path,
        prefix,
        has_7z,
        is_verbose_logging_enabled(),
        archive_path.display(),
    )
}

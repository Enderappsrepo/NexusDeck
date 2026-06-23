//! Structured logging for Protontricks, dependency installs, audio fixes, and related ops.

use std::fs::{File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

use crate::error::Result;
use crate::services::install_log::{self, is_verbose_logging_enabled, LogFileInfo, LogLevel};
use crate::services::paths::{ensure_dir, logs_dir};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProtonLogEvent {
    pub session_id: String,
    pub category: String,
    pub ts: String,
    pub level: LogLevel,
    pub phase: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub context: Option<serde_json::Value>,
}

pub struct ProtonLogger {
    session_id: String,
    category: String,
    log_path: PathBuf,
    master_path: PathBuf,
    verbose: bool,
    file: Arc<Mutex<File>>,
    jsonl_file: Arc<Mutex<Option<File>>>,
    app: Option<AppHandle>,
}

fn timestamp() -> String {
    chrono::Utc::now().to_rfc3339()
}

fn new_session_id() -> String {
    uuid::Uuid::new_v4().to_string()[..8].to_string()
}

pub fn master_log_path() -> Result<PathBuf> {
    Ok(logs_dir()?.join("proton.log"))
}

pub fn session_log_filename(category: &str, session_id: &str) -> String {
    format!("proton_{category}_{session_id}.log")
}

impl ProtonLogger {
    pub fn new(category: &str, app: Option<AppHandle>) -> Result<Self> {
        let session_id = new_session_id();
        let log_dir = logs_dir()?;
        let log_path = log_dir.join(session_log_filename(category, &session_id));
        let master_path = master_log_path()?;
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
            category: category.to_string(),
            log_path,
            master_path,
            verbose,
            file: Arc::new(Mutex::new(file)),
            jsonl_file: Arc::new(Mutex::new(jsonl_file)),
            app,
        })
    }

    pub fn log_path(&self) -> &Path {
        &self.log_path
    }

    pub fn log_path_string(&self) -> String {
        self.log_path.display().to_string()
    }

    pub fn session_id(&self) -> &str {
        &self.session_id
    }

    pub fn category(&self) -> &str {
        &self.category
    }

    pub fn write_header(&self, title: &str, details: &str) -> Result<()> {
        let header = format!(
            "=== NexusDeck Proton Log ===\n\
             {title}\n\
             App version: {}\n\
             Category: {}\n\
             Session: {}\n\
             Verbose: {}\n\
             {details}\n\
             ============================",
            env!("CARGO_PKG_VERSION"),
            self.category,
            self.session_id,
            self.verbose,
        );
        {
            let mut file = self.file.lock().expect("proton log mutex poisoned");
            writeln!(file, "{header}")?;
            let _ = file.flush();
        }
        // Must not call info/log while holding `file` — they take the same mutex (deadlock).
        self.info("session", "Proton operation started");
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
            "[{ts}] {} [{}] [{phase}] {message}\n",
            level.as_str(),
            self.category
        );

        eprintln!(
            "NexusDeck proton [{}]: [{phase}] {message}",
            self.category
        );

        if let Ok(mut file) = self.file.lock() {
            let _ = file.write_all(line.as_bytes());
            let _ = file.flush();
        }

        if let Some(parent) = self.master_path.parent() {
            let _ = ensure_dir(parent);
        }
        if let Ok(mut master) = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.master_path)
        {
            let _ = writeln!(
                master,
                "[{ts}] {} [{}] [{phase}] {message}",
                level.as_str(),
                self.category
            );
        }

        let _ = install_log::append_session_log(
            &format!("proton_{}", self.category),
            &format!("[{phase}] {message}"),
        );

        if self.verbose {
            if let Ok(mut guard) = self.jsonl_file.lock() {
                if let Some(ref mut jf) = *guard {
                    let event = ProtonLogEvent {
                        session_id: self.session_id.clone(),
                        category: self.category.clone(),
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
                "proton:log",
                ProtonLogEvent {
                    session_id: self.session_id.clone(),
                    category: self.category.clone(),
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

    pub fn log_command(
        &self,
        phase: &str,
        command: &str,
        stdout: &str,
        stderr: &str,
        success: bool,
    ) {
        let summary = if success {
            format!("Command succeeded: {command}")
        } else {
            format!("Command failed: {command}")
        };
        let level = if success {
            LogLevel::Info
        } else {
            LogLevel::Warn
        };
        let mut context = serde_json::json!({
            "command": command,
            "success": success,
        });
        if !stdout.is_empty() {
            context["stdout"] = serde_json::Value::String(truncate_output(stdout, 4000));
        }
        if !stderr.is_empty() {
            context["stderr"] = serde_json::Value::String(truncate_output(stderr, 4000));
        }
        self.log_with_context(level, phase, &summary, Some(context));

        if self.verbose {
            if !stdout.is_empty() {
                self.debug(phase, &format!("stdout:\n{}", truncate_output(stdout, 8000)));
            }
            if !stderr.is_empty() {
                self.debug(phase, &format!("stderr:\n{}", truncate_output(stderr, 8000)));
            }
        }
    }
}

fn truncate_output(text: &str, max: usize) -> String {
    if text.len() <= max {
        text.to_string()
    } else {
        format!("{}… [truncated {} chars]", &text[..max], text.len() - max)
    }
}

pub fn list_proton_logs(limit: usize) -> Result<Vec<LogFileInfo>> {
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
            if name == "proton.log" || name.starts_with("proton_") {
                let meta = entry.metadata().ok();
                let kind = if name.ends_with(".jsonl") {
                    "proton_jsonl".to_string()
                } else if name == "proton.log" {
                    "proton_master".to_string()
                } else {
                    "proton".to_string()
                };
                files.push(LogFileInfo {
                    path: path.display().to_string(),
                    name,
                    size_bytes: meta.as_ref().map(|m| m.len()).unwrap_or(0),
                    modified_at: meta
                        .and_then(|m| m.modified().ok())
                        .map(|t| chrono::DateTime::<chrono::Utc>::from(t).to_rfc3339())
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

pub fn read_tail(path: &str, max_bytes: usize) -> Result<String> {
    install_log::read_log_file(path, max_bytes)
}

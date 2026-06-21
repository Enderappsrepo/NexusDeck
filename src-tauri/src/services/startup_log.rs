use std::fs::OpenOptions;
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;

use crate::error::Result;
use crate::services::install_log::append_session_log;
use crate::services::paths::{config_dir, ensure_dir, session_log_path};
use crate::services::platform::detect_platform;

static LOG_PATH: Mutex<Option<PathBuf>> = Mutex::new(None);

fn timestamp() -> String {
    chrono::Utc::now().to_rfc3339()
}

pub fn init() -> Result<PathBuf> {
    let log_dir = config_dir().join("logs");
    ensure_dir(&log_dir)?;
    let path = log_dir.join("startup.log");

    // Also ensure unified ~/NexusDeck/Logs/session.log exists.
    let _ = session_log_path();

    {
        let mut guard = LOG_PATH.lock().expect("startup log mutex poisoned");
        *guard = Some(path.clone());
    }

    log_step(
        "session_start",
        &format!("NexusDeck {} starting", env!("CARGO_PKG_VERSION")),
    );
    Ok(path)
}

pub fn log_path() -> PathBuf {
    LOG_PATH
        .lock()
        .expect("startup log mutex poisoned")
        .clone()
        .unwrap_or_else(|| config_dir().join("logs").join("startup.log"))
}

pub fn log_step(step: &str, detail: &str) {
    let line = format!("[{}] {step}: {detail}\n", timestamp());
    eprintln!("NexusDeck: {step}: {detail}");

    append_session_log(step, detail);

    let path = log_path();
    if let Some(parent) = path.parent() {
        let _ = ensure_dir(parent);
    }

    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(&path) {
        let _ = file.write_all(line.as_bytes());
    }
}

pub fn read_tail(max_bytes: usize) -> String {
    let path = log_path();
    let Ok(meta) = std::fs::metadata(&path) else {
        return String::new();
    };
    if meta.len() == 0 {
        return String::new();
    }

    let read_from = meta.len().saturating_sub(max_bytes as u64) as usize;
    let Ok(bytes) = std::fs::read(&path) else {
        return String::new();
    };

    String::from_utf8_lossy(&bytes[read_from..]).to_string()
}

pub fn collect_diagnostics() -> serde_json::Value {
    let platform = detect_platform();
    let logs_dir = crate::services::paths::logs_dir()
        .map(|p| p.display().to_string())
        .unwrap_or_default();
    serde_json::json!({
        "version": env!("CARGO_PKG_VERSION"),
        "log_path": log_path().display().to_string(),
        "logs_dir": logs_dir,
        "config_dir": config_dir().display().to_string(),
        "platform": platform,
        "verbose_logging": crate::services::install_log::is_verbose_logging_enabled(),
        "recent_log": read_tail(16_384),
    })
}

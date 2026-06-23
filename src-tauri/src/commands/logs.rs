use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::error::Result;
use crate::services::install_log::{
    self, export_install_logs_zip, list_recent_logs, read_log_file, LogFileInfo,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportLogsResult {
    pub zip_path: String,
    pub files_included: usize,
}

#[tauri::command]
pub fn get_logs_dir() -> Result<String> {
    Ok(crate::services::paths::logs_dir()?.display().to_string())
}

#[tauri::command]
pub fn list_recent_install_logs(limit: Option<usize>) -> Result<Vec<LogFileInfo>> {
    list_recent_logs(limit.unwrap_or(20))
}

#[tauri::command]
pub fn read_install_log(path: String, max_bytes: Option<usize>) -> Result<String> {
    read_log_file(&path, max_bytes.unwrap_or(256_000))
}

#[tauri::command]
pub fn get_verbose_logging() -> Result<bool> {
    Ok(install_log::is_verbose_logging_enabled())
}

#[tauri::command]
pub fn set_verbose_logging(enabled: bool) -> Result<()> {
    install_log::set_verbose_logging(enabled)
}

#[tauri::command]
pub fn export_install_logs(
    last_n: Option<usize>,
    include_archive: Option<String>,
) -> Result<ExportLogsResult> {
    let archive = include_archive.as_deref().map(std::path::Path::new);
    let zip = export_install_logs_zip(last_n.unwrap_or(10), archive)?;
    let files_included = last_n.unwrap_or(10) + 2;
    Ok(ExportLogsResult {
        zip_path: zip.display().to_string(),
        files_included,
    })
}

#[tauri::command]
pub fn export_install_logs_to(
    dest_path: String,
    last_n: Option<usize>,
    include_archive: Option<String>,
) -> Result<String> {
    let archive = include_archive.as_deref().map(std::path::Path::new);
    let zip = export_install_logs_zip(last_n.unwrap_or(10), archive)?;
    std::fs::copy(&zip, &dest_path)?;
    let _ = std::fs::remove_file(&zip);
    Ok(dest_path)
}

#[tauri::command]
pub fn list_proton_logs(limit: Option<usize>) -> Result<Vec<LogFileInfo>> {
    crate::services::proton_log::list_proton_logs(limit.unwrap_or(20))
}

#[tauri::command]
pub fn read_proton_log(path: String, max_bytes: Option<usize>) -> Result<String> {
    crate::services::proton_log::read_tail(&path, max_bytes.unwrap_or(256_000))
}

#[tauri::command]
pub fn get_proton_master_log_path() -> Result<String> {
    Ok(crate::services::proton_log::master_log_path()?.display().to_string())
}

#[tauri::command]
pub fn get_install_log_path_for_session(session_log_hint: String) -> Result<String> {
    let dir = crate::services::paths::logs_dir()?;
    if PathBuf::from(&session_log_hint).is_absolute() {
        return Ok(session_log_hint);
    }
    Ok(dir.join(session_log_hint).display().to_string())
}

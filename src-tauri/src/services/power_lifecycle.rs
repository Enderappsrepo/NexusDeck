//! System suspend/resume handling for Steam Deck sleep cycles.

use std::io::{BufRead, BufReader};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;

use tauri::{AppHandle, Emitter, Manager};

use crate::services::download_manager::DownloadManager;
use crate::services::nexus_client::NexusClient;
use crate::services::startup_log;
use crate::services::wake_lock;

static MONITOR_STARTED: AtomicBool = AtomicBool::new(false);

pub fn start_monitor(
    app: AppHandle,
    download_manager: Arc<DownloadManager>,
    nexus_client: Arc<NexusClient>,
) {
    if MONITOR_STARTED.swap(true, Ordering::SeqCst) {
        return;
    }

    #[cfg(not(target_os = "linux"))]
    {
        let _ = (app, download_manager, nexus_client);
        return;
    }

    #[cfg(target_os = "linux")]
    thread::Builder::new()
        .name("nexusdeck-power-monitor".into())
        .spawn(move || {
            if let Err(e) = run_logind_monitor(app, download_manager, nexus_client) {
                startup_log::log_step("power_lifecycle", &format!("monitor ended: {e}"));
            }
        })
        .ok();
}

#[cfg(target_os = "linux")]
fn run_logind_monitor(
    app: AppHandle,
    download_manager: Arc<DownloadManager>,
    nexus_client: Arc<NexusClient>,
) -> Result<(), String> {
    use crate::services::host_command;
    use crate::services::platform;

    let script = r#"dbus-monitor --system "type='signal',interface='org.freedesktop.login1.Manager',member='PrepareForSleep'" 2>/dev/null || \
busctl monitor org.freedesktop.login1 --match "type='signal',interface='org.freedesktop.login1.Manager',member='PrepareForSleep'" 2>/dev/null"#;

    let mut child = if platform::is_flatpak_sandbox() {
        Command::new("flatpak-spawn")
            .args(["--host", "bash", "-lc", script])
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
    } else {
        Command::new("bash")
            .args(["-lc", script])
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
    }
    .map_err(|e| format!("Could not start power monitor: {e}"))?;

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Power monitor missing stdout".to_string())?;
    let reader = BufReader::new(stdout);

    startup_log::log_step("power_lifecycle", "logind monitor started");

    for line in reader.lines().map_while(Result::ok) {
        if !line.contains("PrepareForSleep") {
            continue;
        }
        let sleeping = line.contains("boolean true") || line.contains("true;");
        if sleeping {
            on_prepare_for_sleep(&app, &download_manager);
        } else {
            on_resume_from_sleep(app.clone(), download_manager.clone(), nexus_client.clone());
        }
    }

    Ok(())
}

#[cfg(target_os = "linux")]
fn on_prepare_for_sleep(app: &AppHandle, download_manager: &Arc<DownloadManager>) {
    startup_log::log_step("power_lifecycle", "PrepareForSleep(true)");
    download_manager.pause_active_for_suspend();
    let _ = wake_lock::release();
    checkpoint_database();
    let _ = app.emit("power:suspend", ());
}

#[cfg(target_os = "linux")]
fn on_resume_from_sleep(
    app: AppHandle,
    download_manager: Arc<DownloadManager>,
    nexus_client: Arc<NexusClient>,
) {
    startup_log::log_step("power_lifecycle", "PrepareForSleep(false)");
    let _ = app.emit("power:resume", ());

    let app_for_gamescope = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        let _ = crate::services::gamescope::claim_gamescope_focus_for_window();
        let _ = app_for_gamescope.emit("power:resume:ready", ());
    });

    let app_for_downloads = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_secs(1)).await;
        download_manager.resume_after_suspend(app_for_downloads, nexus_client);
    });
}

fn checkpoint_database() {
    let _ = crate::db::wal_checkpoint();
}

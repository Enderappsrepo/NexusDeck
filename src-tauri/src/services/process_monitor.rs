use std::collections::HashMap;
use std::sync::Arc;
use std::thread;
use std::time::Duration;

use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use sysinfo::{Pid, ProcessesToUpdate, System};
use tauri::{AppHandle, Emitter};

use crate::db;
use crate::error::Result;
use crate::games::GameRegistry;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GameRunningState {
    pub running: bool,
    /// Launch was initiated but the game process has not appeared yet.
    pub waiting: bool,
    pub profile_id: String,
    pub pid: Option<u32>,
    pub started_at: Option<i64>,
    pub config_id: Option<String>,
}

struct TrackedGame {
    profile_id: String,
    config_id: Option<String>,
    process_names: Vec<String>,
    started_at: i64,
    history_id: String,
    known_pids: Vec<u32>,
    process_seen: bool,
    started_event_emitted: bool,
}

/// How long to keep waiting for the game process before giving up.
const LAUNCH_GRACE_SECS: i64 = 120;

pub struct ProcessMonitor {
    inner: Arc<Mutex<MonitorInner>>,
}

struct MonitorInner {
    tracked: HashMap<String, TrackedGame>,
    app_handle: Option<AppHandle>,
}

impl ProcessMonitor {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(MonitorInner {
                tracked: HashMap::new(),
                app_handle: None,
            })),
        }
    }

    pub fn set_app_handle(&self, handle: AppHandle) {
        self.inner.lock().app_handle = Some(handle);
    }

    pub fn start_polling(self: &Arc<Self>) {
        let monitor = Arc::clone(self);
        thread::Builder::new()
            .name("nexusdeck-process-monitor".into())
            .spawn(move || {
                loop {
                    thread::sleep(Duration::from_secs(2));
                    monitor.poll_once();
                }
            })
            .ok();
    }

    pub fn is_running(&self, profile_id: &str) -> bool {
        self.inner
            .lock()
            .tracked
            .get(profile_id)
            .is_some_and(|t| t.process_seen)
    }

    pub fn is_waiting(&self, profile_id: &str) -> bool {
        self.inner
            .lock()
            .tracked
            .get(profile_id)
            .is_some_and(|t| !t.process_seen)
    }

    pub fn any_running(&self) -> bool {
        self.inner
            .lock()
            .tracked
            .values()
            .any(|t| t.process_seen)
    }

    pub fn any_active(&self) -> bool {
        !self.inner.lock().tracked.is_empty()
    }

    pub fn active_profile_id(&self) -> Option<String> {
        self.inner
            .lock()
            .tracked
            .iter()
            .find(|(_, t)| t.process_seen)
            .map(|(id, _)| id.clone())
    }

    pub fn clear_tracking(&self, profile_id: &str) -> Result<()> {
        self.finish_tracking(profile_id, false);
        Ok(())
    }

    pub fn get_state(&self, profile_id: &str) -> GameRunningState {
        let inner = self.inner.lock();
        if let Some(tracked) = inner.tracked.get(profile_id) {
            GameRunningState {
                running: tracked.process_seen,
                waiting: !tracked.process_seen,
                profile_id: profile_id.to_string(),
                pid: tracked.known_pids.first().copied(),
                started_at: Some(tracked.started_at),
                config_id: tracked.config_id.clone(),
            }
        } else {
            GameRunningState {
                running: false,
                waiting: false,
                profile_id: profile_id.to_string(),
                pid: None,
                started_at: None,
                config_id: None,
            }
        }
    }

    pub fn begin_tracking(
        &self,
        profile_id: &str,
        game_domain: &str,
        config_id: Option<String>,
        history_id: String,
        direct_pid: Option<u32>,
    ) -> Result<()> {
        let plugin = GameRegistry::get(game_domain)?;
        let process_names: Vec<String> = plugin
            .process_names()
            .into_iter()
            .map(|s| s.to_string())
            .collect();

        let mut known_pids = Vec::new();
        let mut process_seen = false;
        if let Some(pid) = direct_pid {
            known_pids.push(pid);
            process_seen = true;
        }

        self.inner.lock().tracked.insert(
            profile_id.to_string(),
            TrackedGame {
                profile_id: profile_id.to_string(),
                config_id,
                process_names,
                started_at: chrono::Utc::now().timestamp(),
                history_id,
                known_pids,
                process_seen,
                started_event_emitted: process_seen,
            },
        );

        if process_seen {
            self.emit_game_started(profile_id);
        }
        Ok(())
    }

    pub fn stop_game(&self, profile_id: &str, graceful: bool) -> Result<()> {
        let (process_names, known_pids) = {
            let inner = self.inner.lock();
            let Some(tracked) = inner.tracked.get(profile_id) else {
                return Ok(());
            };
            (tracked.process_names.clone(), tracked.known_pids.clone())
        };

        let mut system = System::new();
        refresh_processes_for_names(&mut system, &process_names, &known_pids);

        let mut killed = false;
        for (pid, process) in system.processes() {
            let name = process.name().to_string_lossy().to_lowercase();
            if process_names.iter().any(|n| name == n.to_lowercase()) {
                if graceful {
                    #[cfg(unix)]
                    {
                        let _ = std::process::Command::new("kill")
                            .arg("-TERM")
                            .arg(pid.as_u32().to_string())
                            .spawn();
                    }
                    #[cfg(windows)]
                    {
                        let _ = std::process::Command::new("taskkill")
                            .args(["/PID", &pid.as_u32().to_string()])
                            .spawn();
                    }
                } else {
                    let _ = process.kill();
                }
                killed = true;
            }
        }

        if !killed && !known_pids.is_empty() {
            for pid in &known_pids {
                if let Some(process) = system.process(Pid::from_u32(*pid)) {
                    let _ = process.kill();
                }
            }
        }

        self.finish_tracking(profile_id, true);
        Ok(())
    }

    fn poll_once(&self) {
        let profile_ids: Vec<String> = self
            .inner
            .lock()
            .tracked
            .keys()
            .cloned()
            .collect();

        if profile_ids.is_empty() {
            return;
        }

        let (process_names, known_pids): (Vec<Vec<String>>, Vec<Vec<u32>>) = {
            let inner = self.inner.lock();
            profile_ids
                .iter()
                .map(|id| {
                    inner.tracked.get(id).map(|t| {
                        (t.process_names.clone(), t.known_pids.clone())
                    })
                })
                .collect::<Option<Vec<_>>>()
                .unwrap_or_default()
                .into_iter()
                .unzip()
        };

        let all_names: Vec<String> = process_names.iter().flatten().cloned().collect();
        let all_pids: Vec<u32> = known_pids.iter().flatten().copied().collect();

        let mut system = System::new();
        refresh_processes_for_names(&mut system, &all_names, &all_pids);
        let now = chrono::Utc::now().timestamp();

        for profile_id in profile_ids {
            let (process_alive, was_seen, emit_start, started_at) = {
                let mut inner = self.inner.lock();
                let Some(tracked) = inner.tracked.get_mut(&profile_id) else {
                    continue;
                };

                let alive = system.processes().iter().any(|(_, process)| {
                    let name = process.name().to_string_lossy().to_lowercase();
                    tracked
                        .process_names
                        .iter()
                        .any(|n| name == n.to_lowercase())
                }) || tracked.known_pids.iter().any(|pid| {
                    system.process(Pid::from_u32(*pid)).is_some()
                });

                let was_seen = tracked.process_seen;
                if alive {
                    tracked.process_seen = true;
                }

                let emit_start = alive && !tracked.started_event_emitted;
                if emit_start {
                    tracked.started_event_emitted = true;
                }

                (alive, was_seen, emit_start, tracked.started_at)
            };

            if emit_start {
                self.emit_game_started(&profile_id);
            }

            if process_alive {
                continue;
            }

            if !was_seen {
                if now - started_at < LAUNCH_GRACE_SECS {
                    continue;
                }
                self.finish_tracking(&profile_id, false);
                continue;
            }

            self.finish_tracking(&profile_id, true);
        }
    }

    fn finish_tracking(&self, profile_id: &str, success: bool) {
        let tracked = self.inner.lock().tracked.remove(profile_id);
        if let Some(tracked) = tracked {
            let ended_at = chrono::Utc::now().timestamp();
            let duration = ended_at - tracked.started_at;
            let _ = db::update_launch_history_end(&tracked.history_id, ended_at, duration, success);
            if tracked.started_event_emitted {
                self.emit_game_exited(profile_id);
            }
        }
    }

    fn emit_game_started(&self, profile_id: &str) {
        if let Some(handle) = self.inner.lock().app_handle.clone() {
            let state = self.get_state(profile_id);
            let _ = handle.emit("game:started", state);
        }
    }

    fn emit_game_exited(&self, profile_id: &str) {
        if let Some(handle) = self.inner.lock().app_handle.clone() {
            let state = self.get_state(profile_id);
            let _ = handle.emit("game:exited", state.clone());
            let settings = crate::services::launch_config::LaunchSettings::load().unwrap_or_default();
            if settings.hide_on_launch && !settings.close_app_after_launch {
                let _ = crate::services::gamescope::restore_after_game_session(&handle);
            }
        }
    }
}

fn refresh_processes_for_names(system: &mut System, process_names: &[String], known_pids: &[u32]) {
    if known_pids.is_empty() && process_names.is_empty() {
        return;
    }

    if !known_pids.is_empty() {
        let pids: Vec<Pid> = known_pids.iter().map(|p| Pid::from_u32(*p)).collect();
        system.refresh_processes(ProcessesToUpdate::Some(&pids), true);
    }

    if !process_names.is_empty() {
        system.refresh_processes(ProcessesToUpdate::All, true);
    }
}

impl Default for ProcessMonitor {
    fn default() -> Self {
        Self::new()
    }
}

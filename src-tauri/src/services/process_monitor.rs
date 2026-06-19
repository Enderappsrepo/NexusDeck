use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use sysinfo::{Pid, System};
use tauri::{async_runtime::spawn, AppHandle, Emitter};

use crate::db;
use crate::error::Result;
use crate::games::GameRegistry;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GameRunningState {
    pub running: bool,
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
}

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
        spawn(async move {
            loop {
                tokio::time::sleep(Duration::from_secs(2)).await;
                monitor.poll_once();
            }
        });
    }

    pub fn is_running(&self, profile_id: &str) -> bool {
        self.inner.lock().tracked.contains_key(profile_id)
    }

    pub fn get_state(&self, profile_id: &str) -> GameRunningState {
        let inner = self.inner.lock();
        if let Some(tracked) = inner.tracked.get(profile_id) {
            GameRunningState {
                running: true,
                profile_id: profile_id.to_string(),
                pid: tracked.known_pids.first().copied(),
                started_at: Some(tracked.started_at),
                config_id: tracked.config_id.clone(),
            }
        } else {
            GameRunningState {
                running: false,
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
        if let Some(pid) = direct_pid {
            known_pids.push(pid);
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
            },
        );

        self.emit_game_started(profile_id);
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

        let mut system = System::new_all();
        system.refresh_all();

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

        let mut system = System::new_all();
        system.refresh_all();

        for profile_id in profile_ids {
            let still_running = {
                let inner = self.inner.lock();
                let Some(tracked) = inner.tracked.get(&profile_id) else {
                    continue;
                };

                system.processes().iter().any(|(_, process)| {
                    let name = process.name().to_string_lossy().to_lowercase();
                    tracked
                        .process_names
                        .iter()
                        .any(|n| name == n.to_lowercase())
                }) || tracked.known_pids.iter().any(|pid| {
                    system.process(Pid::from_u32(*pid)).is_some()
                })
            };

            if !still_running {
                self.finish_tracking(&profile_id, true);
            }
        }
    }

    fn finish_tracking(&self, profile_id: &str, success: bool) {
        let tracked = self.inner.lock().tracked.remove(profile_id);
        if let Some(tracked) = tracked {
            let ended_at = chrono::Utc::now().timestamp();
            let duration = ended_at - tracked.started_at;
            let _ = db::update_launch_history_end(&tracked.history_id, ended_at, duration, success);
            self.emit_game_exited(profile_id);
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
            let _ = handle.emit("game:exited", state);
        }
    }
}

impl Default for ProcessMonitor {
    fn default() -> Self {
        Self::new()
    }
}

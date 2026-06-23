//! Run commands on the Flatpak host with optional timeouts so Protontricks probes
//! cannot hang the UI indefinitely.

use std::process::{Command, Output};
use std::sync::mpsc;
use std::time::Duration;

use crate::error::{NexusDeckError, Result};
use crate::services::platform;

pub const DEFAULT_HOST_TIMEOUT_SECS: u64 = 30;
pub const PROTONTRICKS_PROBE_TIMEOUT_SECS: u64 = 12;
pub const PROTONTRICKS_INSTALL_TIMEOUT_SECS: u64 = 900;
/// Extra wall-clock grace for flatpak-spawn startup before we abandon a host call.
const HOST_SPAWN_GRACE_SECS: u64 = 5;

fn shell_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\\''"))
}

fn spawn_host(program: &str, args: &[&str], env: &[(&str, &str)]) -> Result<Output> {
    let output = if platform::is_flatpak_sandbox() {
        let mut cmd = Command::new("flatpak-spawn");
        cmd.arg("--host");
        for (key, value) in env {
            cmd.arg(format!("--env={key}={value}"));
        }
        cmd.arg(program).args(args);
        cmd.output()
    } else {
        let mut cmd = Command::new(program);
        for (key, value) in env {
            cmd.env(key, value);
        }
        cmd.args(args).output()
    }
    .map_err(|e| NexusDeckError::Other(format!("Host command failed: {e}")))?;
    Ok(output)
}

/// Run `f` on a worker thread and return `None` if it exceeds `timeout_secs`.
pub fn call_with_timeout<T, F>(timeout_secs: u64, f: F) -> Option<T>
where
    T: Send + 'static,
    F: FnOnce() -> T + Send + 'static,
{
    let (tx, rx) = mpsc::channel();
    std::thread::spawn(move || {
        let _ = tx.send(f());
    });
    rx.recv_timeout(Duration::from_secs(timeout_secs.max(1))).ok()
}

/// Run a bash script on the host, capped at `timeout_secs` (GNU `timeout` when available,
/// plus a Rust wall-clock guard so flatpak-spawn cannot block forever).
pub fn run_bash(script: &str, timeout_secs: u64) -> Result<Output> {
    let script = script.to_string();
    let timeout_secs = timeout_secs.max(1);
    let wall = timeout_secs.saturating_add(HOST_SPAWN_GRACE_SECS);
    let (tx, rx) = mpsc::channel();
    std::thread::spawn(move || {
        let quoted = shell_quote(&script);
        let inner = format!(
            "if command -v timeout >/dev/null 2>&1; then \
               timeout --foreground {timeout_secs}s bash -lc {quoted}; \
             else \
               bash -lc {quoted}; \
             fi"
        );
        let _ = tx.send(spawn_host("bash", &["-lc", &inner], &[]));
    });
    rx.recv_timeout(Duration::from_secs(wall))
        .map_err(|_| {
            NexusDeckError::Other(format!(
                "Host command timed out after {timeout_secs}s. \
                 If Protontricks is installed, try: flatpak info com.github.Matoking.protontricks"
            ))
        })?
}

/// Run a program on the host with env vars, capped at `timeout_secs`.
pub fn run_program(
    program: &str,
    args: &[&str],
    env: &[(&str, &str)],
    timeout_secs: u64,
) -> Result<Output> {
    let timeout_secs = timeout_secs.max(1);
    let wall = timeout_secs.saturating_add(HOST_SPAWN_GRACE_SECS);
    let program = program.to_string();
    let args: Vec<String> = args.iter().map(|s| s.to_string()).collect();
    let env_owned: Vec<(String, String)> = env
        .iter()
        .map(|(k, v)| (k.to_string(), v.to_string()))
        .collect();
    let (tx, rx) = mpsc::channel();
    std::thread::spawn(move || {
        let mut timed_args: Vec<String> = vec![
            "--foreground".into(),
            format!("{timeout_secs}s"),
            program,
        ];
        timed_args.extend(args);
        let arg_refs: Vec<&str> = timed_args.iter().map(String::as_str).collect();
        let env_refs: Vec<(&str, &str)> = env_owned
            .iter()
            .map(|(k, v)| (k.as_str(), v.as_str()))
            .collect();
        let _ = tx.send(spawn_host("timeout", &arg_refs, &env_refs));
    });
    rx.recv_timeout(Duration::from_secs(wall))
        .map_err(|_| {
            NexusDeckError::Other(format!(
                "Host program timed out after {timeout_secs}s"
            ))
        })?
}

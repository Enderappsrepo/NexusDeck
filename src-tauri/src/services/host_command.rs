//! Run commands on the Flatpak host with optional timeouts so Protontricks probes
//! cannot hang the UI indefinitely.

use std::process::{Command, Output};
use std::sync::mpsc;
use std::time::{Duration, Instant};

use crate::error::{NexusDeckError, Result};
use crate::services::platform;

pub const DEFAULT_HOST_TIMEOUT_SECS: u64 = 30;
pub const PROTONTRICKS_PROBE_TIMEOUT_SECS: u64 = 12;
pub const PROTONTRICKS_INSTALL_TIMEOUT_SECS: u64 = 900;
/// Extra wall-clock grace for flatpak-spawn startup before we abandon a host call.
const HOST_SPAWN_GRACE_SECS: u64 = 5;
/// How often [`run_program_redirected`] fires its heartbeat callback while waiting.
const HEARTBEAT_INTERVAL_SECS: u64 = 5;

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
        crate::services::proc::hide_console(cmd.args(args)).output()
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

/// Run `program args` on the host like [`run_program`], but with two hardenings aimed at
/// long Protontricks installs:
///
/// 1. **No pipe-hold.** The command runs inside a host shell wrapper that redirects its
///    stdout/stderr to a host-side temp file; only the short final `cat` of that file flows
///    back over our capture pipe. Without this, daemonized grandchildren (notably
///    `wineserver`) inherit the capture pipe and keep it open after `timeout` kills
///    Protontricks, so `.output()` blocks until the wall-clock guard fires — a finished
///    install then looks hung for minutes.
/// 2. **Heartbeat.** `heartbeat(elapsed_secs)` fires roughly every few seconds while waiting,
///    so the UI can show live elapsed time instead of freezing on one "installing" line.
pub fn run_program_redirected(
    program: &str,
    args: &[&str],
    env: &[(&str, &str)],
    timeout_secs: u64,
    mut heartbeat: impl FnMut(u64),
) -> Result<Output> {
    let timeout_secs = timeout_secs.max(1);
    let wall = timeout_secs.saturating_add(HOST_SPAWN_GRACE_SECS);

    let mut parts = Vec::with_capacity(args.len() + 1);
    parts.push(shell_quote(program));
    parts.extend(args.iter().map(|a| shell_quote(a)));
    let cmd_line = parts.join(" ");

    // Redirect to a host temp file so only the short final `cat` touches our capture pipe;
    // `wineserver` & friends end up holding the file fd, never the pipe.
    let script = format!(
        "out=$(mktemp 2>/dev/null || echo \"/tmp/nexusdeck_pt.$$\"); \
         if command -v timeout >/dev/null 2>&1; then \
           timeout --foreground {timeout_secs}s {cmd_line} </dev/null >\"$out\" 2>&1; \
         else \
           {cmd_line} </dev/null >\"$out\" 2>&1; \
         fi; \
         rc=$?; cat \"$out\" 2>/dev/null; rm -f \"$out\" 2>/dev/null; exit $rc"
    );

    let env_owned: Vec<(String, String)> = env
        .iter()
        .map(|(k, v)| (k.to_string(), v.to_string()))
        .collect();
    let (tx, rx) = mpsc::channel();
    std::thread::spawn(move || {
        let env_refs: Vec<(&str, &str)> = env_owned
            .iter()
            .map(|(k, v)| (k.as_str(), v.as_str()))
            .collect();
        let _ = tx.send(spawn_host("bash", &["-lc", &script], &env_refs));
    });

    let start = Instant::now();
    loop {
        match rx.recv_timeout(Duration::from_secs(HEARTBEAT_INTERVAL_SECS)) {
            Ok(result) => return result,
            Err(mpsc::RecvTimeoutError::Timeout) => {
                let elapsed = start.elapsed().as_secs();
                if elapsed >= wall {
                    return Err(NexusDeckError::Other(format!(
                        "Host program timed out after {timeout_secs}s"
                    )));
                }
                heartbeat(elapsed);
            }
            Err(mpsc::RecvTimeoutError::Disconnected) => {
                return Err(NexusDeckError::Other(
                    "Host program worker thread stopped unexpectedly".into(),
                ));
            }
        }
    }
}

// These exercise the real host-shell path (local `bash`), so they only make sense on Linux —
// which is also the only place the install path runs. Run them in the Deck build env / Linux CI.
#[cfg(all(test, target_os = "linux"))]
mod tests {
    use super::*;

    /// The core pipe-hold fix: a *finished* command must return promptly even when a
    /// daemonized grandchild keeps the inherited stdout open. This is the `wineserver`
    /// behaviour that made completed installs look frozen for minutes.
    #[test]
    fn redirected_returns_promptly_despite_lingering_grandchild() {
        let start = Instant::now();
        let out = run_program_redirected(
            "bash",
            // foreground exits immediately; the backgrounded `sleep` lingers holding stdout
            &["-c", "echo seeded; sleep 20 & exit 0"],
            &[],
            10,
            |_| {},
        )
        .expect("redirected run should return Ok");
        let elapsed = start.elapsed();

        assert!(out.status.success(), "wrapper should exit 0");
        let stdout = String::from_utf8_lossy(&out.stdout);
        assert!(stdout.contains("seeded"), "captured stdout was: {stdout:?}");
        // Without the temp-file redirect, the lingering `sleep 20` holds the capture pipe and
        // this blocks ~20s (until the wall guard aborts). The redirect must keep it fast.
        assert!(
            elapsed < Duration::from_secs(8),
            "returned in {elapsed:?}; expected a prompt return"
        );
    }

    /// The heartbeat must fire while a genuinely long command runs, so the UI ticks live
    /// instead of freezing on a single line.
    #[test]
    fn heartbeat_fires_during_long_command() {
        let mut beats = 0u32;
        let out = run_program_redirected("sleep", &["8"], &[], 30, |_elapsed| beats += 1)
            .expect("sleep should run");
        assert!(out.status.success());
        assert!(
            beats >= 1,
            "expected >=1 heartbeat during an 8s command, got {beats}"
        );
    }
}

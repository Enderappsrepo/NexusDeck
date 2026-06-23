//! Run commands on the Flatpak host with optional timeouts so Protontricks probes
//! cannot hang the UI indefinitely.

use std::process::{Command, Output};

use crate::error::{NexusDeckError, Result};
use crate::services::platform;

pub const DEFAULT_HOST_TIMEOUT_SECS: u64 = 30;
pub const PROTONTRICKS_PROBE_TIMEOUT_SECS: u64 = 12;
pub const PROTONTRICKS_INSTALL_TIMEOUT_SECS: u64 = 900;

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

/// Run a bash script on the host, capped at `timeout_secs` (GNU `timeout`).
pub fn run_bash(script: &str, timeout_secs: u64) -> Result<Output> {
    let wrapped = format!(
        "timeout --foreground {}s bash -lc {}",
        timeout_secs.max(1),
        shell_quote(script)
    );
    spawn_host("bash", &["-lc", &wrapped], &[])
}

/// Run a program on the host with env vars, capped at `timeout_secs`.
pub fn run_program(
    program: &str,
    args: &[&str],
    env: &[(&str, &str)],
    timeout_secs: u64,
) -> Result<Output> {
    let mut timed_args: Vec<String> = vec![
        "--foreground".into(),
        format!("{}s", timeout_secs.max(1)),
        program.into(),
    ];
    timed_args.extend(args.iter().map(|s| (*s).to_string()));
    let arg_refs: Vec<&str> = timed_args.iter().map(String::as_str).collect();
    spawn_host("timeout", &arg_refs, env)
}

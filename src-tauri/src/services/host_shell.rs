use std::process::Command;

use crate::error::{NexusDeckError, Result};
use crate::services::platform;

pub fn run_host_bash(script: &str) -> Result<std::process::Output> {
    let output = if platform::is_flatpak_sandbox() {
        Command::new("flatpak-spawn")
            .args(["--host", "bash", "-lc", script])
            .output()
    } else {
        Command::new("bash").args(["-lc", script]).output()
    }
    .map_err(|e| NexusDeckError::Other(format!("Host command failed: {e}")))?;
    Ok(output)
}

//! Prevent the display from sleeping during long Proton / install operations.

use std::process::{Child, Command, Stdio};
use std::sync::Mutex;

use crate::error::{NexusDeckError, Result};
use crate::services::platform;

static WAKE_LOCK: Mutex<Option<Child>> = Mutex::new(None);

pub fn acquire(reason: &str) -> Result<()> {
    if cfg!(not(target_os = "linux")) {
        return Ok(());
    }

    let mut guard = WAKE_LOCK
        .lock()
        .map_err(|_| NexusDeckError::Other("Wake lock mutex poisoned".into()))?;
    if guard.is_some() {
        return Ok(());
    }

    let reason_escaped = reason.replace('"', "\\\"");
    let script = format!(
        r#"if command -v systemd-inhibit >/dev/null 2>&1; then
  exec systemd-inhibit --what=idle:sleep --who=NexusDeck --why="{reason_escaped}" --mode=block sleep infinity
fi
if command -v loginctl >/dev/null 2>&1; then
  token=$(loginctl show-session "$(loginctl | awk '/tty/ {{print $1; exit}}')" -p InhibitDelayMaxUSec 2>/dev/null || true)
  exec bash -c 'while true; do sleep 3600; done'
fi
exec sleep infinity"#
    );

    let child = if platform::is_flatpak_sandbox() {
        Command::new("flatpak-spawn")
            .args(["--host", "bash", "-lc", &script])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
    } else {
        Command::new("bash")
            .args(["-lc", &script])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
    }
    .map_err(|e| NexusDeckError::Other(format!("Could not keep screen awake: {e}")))?;

    *guard = Some(child);
    Ok(())
}

pub fn release() {
    if let Ok(mut guard) = WAKE_LOCK.lock() {
        if let Some(mut child) = guard.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

pub fn is_active() -> bool {
    WAKE_LOCK
        .lock()
        .map(|g| g.is_some())
        .unwrap_or(false)
}

use std::sync::{Arc, Mutex};

use tokio::sync::watch;

use crate::error::{NexusDeckError, Result};

pub struct InstallManager {
    active: Mutex<Option<ActiveInstall>>,
}

struct ActiveInstall {
    cancel_tx: watch::Sender<bool>,
    profile_id: String,
}

impl InstallManager {
    pub fn new() -> Self {
        Self {
            active: Mutex::new(None),
        }
    }

    pub fn begin(&self, profile_id: String) -> watch::Receiver<bool> {
        let (cancel_tx, cancel_rx) = watch::channel(false);
        *self.active.lock().unwrap() = Some(ActiveInstall {
            cancel_tx,
            profile_id,
        });
        cancel_rx
    }

    pub fn end(&self, profile_id: &str) {
        let mut guard = self.active.lock().unwrap();
        if guard
            .as_ref()
            .is_some_and(|active| active.profile_id == profile_id)
        {
            *guard = None;
        }
    }

    pub fn cancel(&self, profile_id: &str) -> Result<()> {
        let guard = self.active.lock().unwrap();
        if let Some(active) = guard.as_ref() {
            if active.profile_id == profile_id {
                let _ = active.cancel_tx.send(true);
                return Ok(());
            }
        }
        Ok(())
    }
}

pub struct InstallGuard {
    manager: Arc<InstallManager>,
    profile_id: String,
}

impl InstallGuard {
    pub fn new(manager: Arc<InstallManager>, profile_id: String) -> Self {
        Self {
            manager,
            profile_id,
        }
    }
}

impl Drop for InstallGuard {
    fn drop(&mut self) {
        self.manager.end(&self.profile_id);
    }
}

pub fn install_cancel_check(
    cancel_rx: watch::Receiver<bool>,
) -> crate::services::archive_options::CancelCheckFn {
    Arc::new(move || {
        if *cancel_rx.borrow() {
            Err(NexusDeckError::Other("Install cancelled".into()))
        } else {
            Ok(())
        }
    })
}

pub fn check_install_cancelled(cancel_rx: &watch::Receiver<bool>) -> Result<()> {
    if *cancel_rx.borrow() {
        Err(NexusDeckError::Other("Install cancelled".into()))
    } else {
        Ok(())
    }
}

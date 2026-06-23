//! Rebuild the SQLite mod library from the durable on-disk ledger, so installed
//! mods can't permanently vanish if the DB is reset, corrupted, or a profile id
//! churns. See [`crate::db::ledger`] for the on-disk format.

use std::collections::HashSet;
use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::db::{self, InstalledMod};
use crate::error::{NexusDeckError, Result};
use crate::services::mod_state::installed_file_paths;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LibraryReconcileResult {
    pub restored: usize,
    pub mirrored: usize,
    pub message: String,
}

/// True if at least one of the mod's deployed files still exists on disk — so we
/// don't resurrect a ledger entry whose files were actually removed.
fn files_present(m: &InstalledMod) -> bool {
    installed_file_paths(m)
        .map(|files| files.iter().any(|f| Path::new(f).exists()))
        .unwrap_or(false)
}

/// Rebuild the DB from the on-disk ledger and back-fill any DB mods missing a
/// ledger entry. Adopts ledger entries from a churned profile id into the current
/// profile (single-profile-per-game model), so a recreated profile keeps its mods.
pub fn reconcile_library(profile_id: &str) -> Result<LibraryReconcileResult> {
    let profile = db::get_profile(profile_id)?
        .ok_or_else(|| NexusDeckError::NotFound("Profile not found".into()))?;
    let game_path = &profile.game_path;

    let db_mods = db::list_installed_mods(profile_id)?;
    let db_ids: HashSet<String> = db_mods.iter().map(|m| m.id.clone()).collect();

    let ledger_mods = db::ledger::read_all(game_path);
    let ledger_ids: HashSet<String> = ledger_mods.iter().map(|m| m.id.clone()).collect();

    // 1. Restore mods the ledger knows about but the DB has lost.
    let mut restored = 0usize;
    for m in &ledger_mods {
        if db_ids.contains(&m.id) || !files_present(m) {
            continue;
        }
        let mut record = m.clone();
        record.profile_id = profile_id.to_string(); // adopt (handles id churn)
        db::save_installed_mod(&record)?;
        restored += 1;
    }

    // 2. Back-fill the ledger for DB mods not yet mirrored (first run after this
    //    ships, or after a manual ledger wipe).
    let mut mirrored = 0usize;
    for m in &db_mods {
        if !ledger_ids.contains(&m.id) {
            db::ledger::write_mod(game_path, m);
            mirrored += 1;
        }
    }

    let message = if restored > 0 {
        format!("Recovered {restored} mod(s) from disk that were missing from the library.")
    } else if mirrored > 0 {
        "Mod library backed up to disk.".to_string()
    } else {
        "Mod library is in sync with disk.".to_string()
    };

    Ok(LibraryReconcileResult {
        restored,
        mirrored,
        message,
    })
}

/// Cheap guard so this is safe to call on every load-order/library view: only run
/// the full reconcile when the ledger and DB disagree on how many mods exist (the
/// "mods disappeared" and "first run" cases).
pub fn reconcile_if_diverged(profile_id: &str) -> Result<Option<LibraryReconcileResult>> {
    let Some(profile) = db::get_profile(profile_id)? else {
        return Ok(None);
    };
    if db::ledger::count(&profile.game_path) == db::count_installed_mods(profile_id)? {
        return Ok(None);
    }
    Ok(Some(reconcile_library(profile_id)?))
}

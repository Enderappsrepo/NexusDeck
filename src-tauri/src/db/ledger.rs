//! Durable on-disk mirror of the installed-mod records.
//!
//! The SQLite library is treated as a cache: every mod is also written as a JSON
//! file under `<game>/.nexusdeck/ledger/`. Because it lives in the game folder
//! (not app data) it survives a DB reset, corruption, an app reinstall, or a
//! profile-id churn — and `services::mod_ledger::reconcile_library` can rebuild
//! the DB from it. All writes are best-effort: a ledger failure must never break
//! the underlying DB operation.

use std::path::{Path, PathBuf};

use super::InstalledMod;

fn ledger_dir(game_path: &str) -> PathBuf {
    Path::new(game_path).join(".nexusdeck").join("ledger")
}

fn mod_file(game_path: &str, id: &str) -> PathBuf {
    ledger_dir(game_path).join(format!("{id}.json"))
}

/// Mirror one mod record to disk (atomic temp+rename). Best-effort.
pub fn write_mod(game_path: &str, m: &InstalledMod) {
    let dir = ledger_dir(game_path);
    if std::fs::create_dir_all(&dir).is_err() {
        return;
    }
    let Ok(json) = serde_json::to_string_pretty(m) else {
        return;
    };
    let tmp = dir.join(format!(".{}.tmp", m.id));
    if std::fs::write(&tmp, json.as_bytes()).is_ok() {
        let _ = std::fs::rename(&tmp, dir.join(format!("{}.json", m.id)));
    }
}

/// Remove a mod's ledger entry (on uninstall). Best-effort.
pub fn remove_mod(game_path: &str, id: &str) {
    let _ = std::fs::remove_file(mod_file(game_path, id));
}

/// Parse every mod record currently on disk for this game.
pub fn read_all(game_path: &str) -> Vec<InstalledMod> {
    let mut out = Vec::new();
    let Ok(entries) = std::fs::read_dir(ledger_dir(game_path)) else {
        return out;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        if let Ok(text) = std::fs::read_to_string(&path) {
            if let Ok(m) = serde_json::from_str::<InstalledMod>(&text) {
                out.push(m);
            }
        }
    }
    out
}

/// Cheap count of ledger entries without parsing them — used to detect divergence
/// from the DB before doing the heavier reconcile.
pub fn count(game_path: &str) -> usize {
    std::fs::read_dir(ledger_dir(game_path))
        .map(|entries| {
            entries
                .flatten()
                .filter(|e| e.path().extension().and_then(|x| x.to_str()) == Some("json"))
                .count()
        })
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::InstalledMod;

    fn sample(id: &str) -> InstalledMod {
        InstalledMod {
            id: id.to_string(),
            profile_id: "p1".into(),
            nexus_mod_id: 42,
            nexus_file_id: None,
            name: "Test Mod".into(),
            version: None,
            enabled: true,
            sort_order: 3,
            installed_files_json: "[]".into(),
            installed_at: 0,
            category: String::new(),
            tags_json: "[]".into(),
            plugins_json: "[]".into(),
            install_options_json: "{}".into(),
        }
    }

    #[test]
    fn write_read_remove_round_trip() {
        let dir = std::env::temp_dir().join(format!("nd-ledger-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let game = dir.to_string_lossy().to_string();

        assert_eq!(count(&game), 0);
        write_mod(&game, &sample("a"));
        write_mod(&game, &sample("b"));
        assert_eq!(count(&game), 2);

        let all = read_all(&game);
        assert_eq!(all.len(), 2);
        assert!(all
            .iter()
            .any(|m| m.id == "a" && m.name == "Test Mod" && m.sort_order == 3));

        remove_mod(&game, "a");
        assert_eq!(count(&game), 1);
        assert!(read_all(&game).iter().all(|m| m.id != "a"));

        let _ = std::fs::remove_dir_all(&dir);
    }
}

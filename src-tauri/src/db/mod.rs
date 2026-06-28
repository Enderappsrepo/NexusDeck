use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

use crate::error::Result;
use crate::services::paths::{db_path, ensure_dir};

pub mod ledger;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Profile {
    pub id: String,
    pub game_domain: String,
    pub name: String,
    pub game_path: String,
    pub staging_path: String,
    pub proton_prefix_path: Option<String>,
    #[serde(default)]
    pub mod_manager: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstalledMod {
    pub id: String,
    pub profile_id: String,
    pub nexus_mod_id: i64,
    pub nexus_file_id: Option<i64>,
    pub name: String,
    pub version: Option<String>,
    pub enabled: bool,
    #[serde(default)]
    pub sort_order: i32,
    pub installed_files_json: String,
    pub installed_at: i64,
    #[serde(default)]
    pub category: String,
    #[serde(default = "default_tags_json")]
    pub tags_json: String,
    #[serde(default = "default_plugins_json")]
    pub plugins_json: String,
    #[serde(default = "default_install_options_json")]
    pub install_options_json: String,
}

fn default_tags_json() -> String {
    "[]".to_string()
}

fn default_plugins_json() -> String {
    "[]".to_string()
}

fn default_install_options_json() -> String {
    "{}".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadRecord {
    pub id: String,
    pub game_domain: String,
    pub mod_id: i64,
    pub file_id: i64,
    pub url: String,
    pub dest_path: String,
    pub bytes_done: i64,
    pub bytes_total: i64,
    pub status: String,
    pub created_at: i64,
    #[serde(default)]
    pub mod_name: String,
    #[serde(default)]
    pub profile_id: String,
    #[serde(default)]
    pub update_target_mod_id: String,
}

fn connection() -> Result<Connection> {
    let path = db_path();
    if let Some(parent) = path.parent() {
        ensure_dir(parent)?;
    }
    let conn = Connection::open(path)?;
    // WAL survives power loss far better than the default rollback journal (the
    // Deck loses power often); best-effort in case the filesystem can't do WAL.
    let _ = conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;");
    conn.execute_batch(include_str!("schema.sql"))?;
    migrate_downloads_table(&conn)?;
    migrate_installed_mods_table(&conn)?;
    migrate_profiles_table(&conn)?;
    Ok(conn)
}

pub fn wal_checkpoint() -> Result<()> {
    let conn = connection()?;
    conn.execute_batch("PRAGMA wal_checkpoint(PASSIVE);")?;
    Ok(())
}

fn migrate_profiles_table(conn: &Connection) -> Result<()> {
    let columns: Vec<String> = conn
        .prepare("PRAGMA table_info(profiles)")?
        .query_map([], |row| row.get::<_, String>(1))?
        .filter_map(|r| r.ok())
        .collect();

    if !columns.iter().any(|c| c == "mod_manager") {
        conn.execute(
            "ALTER TABLE profiles ADD COLUMN mod_manager TEXT DEFAULT 'direct'",
            [],
        )?;
    }
    Ok(())
}

fn migrate_installed_mods_table(conn: &Connection) -> Result<()> {
    let columns: Vec<String> = conn
        .prepare("PRAGMA table_info(installed_mods)")?
        .query_map([], |row| row.get::<_, String>(1))?
        .filter_map(|r| r.ok())
        .collect();

    if !columns.iter().any(|c| c == "sort_order") {
        conn.execute(
            "ALTER TABLE installed_mods ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0",
            [],
        )?;
        conn.execute(
            "UPDATE installed_mods SET sort_order = installed_at WHERE sort_order = 0",
            [],
        )?;
    }
    for (col, default) in [
        ("category", "''"),
        ("tags_json", "'[]'"),
        ("plugins_json", "'[]'"),
        ("install_options_json", "'{}'"),
    ] {
        if !columns.iter().any(|c| c == col) {
            conn.execute(
                &format!("ALTER TABLE installed_mods ADD COLUMN {col} TEXT NOT NULL DEFAULT {default}"),
                [],
            )?;
        }
    }
    Ok(())
}

fn migrate_downloads_table(conn: &Connection) -> Result<()> {
    let mut columns: Vec<String> = conn
        .prepare("PRAGMA table_info(downloads)")?
        .query_map([], |row| row.get::<_, String>(1))?
        .filter_map(|r| r.ok())
        .collect();

    if !columns.iter().any(|c| c == "mod_name") {
        conn.execute(
            "ALTER TABLE downloads ADD COLUMN mod_name TEXT DEFAULT ''",
            [],
        )?;
        columns.push("mod_name".to_string());
    }
    if !columns.iter().any(|c| c == "profile_id") {
        conn.execute(
            "ALTER TABLE downloads ADD COLUMN profile_id TEXT DEFAULT ''",
            [],
        )?;
    }
    if !columns.iter().any(|c| c == "update_target_mod_id") {
        conn.execute(
            "ALTER TABLE downloads ADD COLUMN update_target_mod_id TEXT DEFAULT ''",
            [],
        )?;
    }
    Ok(())
}

pub fn init_db() -> Result<()> {
    let _ = connection()?;
    Ok(())
}

pub fn save_profile(profile: &Profile) -> Result<()> {
    let conn = connection()?;
    // Upsert, NOT INSERT OR REPLACE: REPLACE deletes the row first, which (with
    // foreign keys on) would CASCADE-delete every installed_mods row for this
    // profile. ON CONFLICT DO UPDATE preserves the row, its id, and its mods.
    conn.execute(
        "INSERT INTO profiles (id, game_domain, name, game_path, staging_path, proton_prefix_path, mod_manager, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
         ON CONFLICT(id) DO UPDATE SET
           game_domain = excluded.game_domain,
           name = excluded.name,
           game_path = excluded.game_path,
           staging_path = excluded.staging_path,
           proton_prefix_path = excluded.proton_prefix_path,
           mod_manager = excluded.mod_manager",
        params![
            profile.id,
            profile.game_domain,
            profile.name,
            profile.game_path,
            profile.staging_path,
            profile.proton_prefix_path,
            profile.mod_manager.as_deref().unwrap_or("direct"),
            profile.created_at,
        ],
    )?;
    Ok(())
}

pub fn list_profiles() -> Result<Vec<Profile>> {
    let conn = connection()?;
    let mut stmt = conn.prepare(
        "SELECT id, game_domain, name, game_path, staging_path, proton_prefix_path, mod_manager, created_at FROM profiles ORDER BY created_at DESC",
    )?;
    let profiles = stmt
        .query_map([], map_profile_row)?
        .filter_map(|r| r.ok())
        .collect();
    Ok(profiles)
}

pub fn get_profile(id: &str) -> Result<Option<Profile>> {
    let conn = connection()?;
    let mut stmt = conn.prepare(
        "SELECT id, game_domain, name, game_path, staging_path, proton_prefix_path, mod_manager, created_at FROM profiles WHERE id = ?1",
    )?;
    let mut rows = stmt.query(params![id])?;
    if let Some(row) = rows.next()? {
        Ok(Some(map_profile_row(&row)?))
    } else {
        Ok(None)
    }
}

pub fn get_profile_by_domain(domain: &str) -> Result<Option<Profile>> {
    let conn = connection()?;
    let mut stmt = conn.prepare(
        "SELECT id, game_domain, name, game_path, staging_path, proton_prefix_path, mod_manager, created_at FROM profiles WHERE game_domain = ?1 LIMIT 1",
    )?;
    let mut rows = stmt.query(params![domain])?;
    if let Some(row) = rows.next()? {
        Ok(Some(map_profile_row(&row)?))
    } else {
        Ok(None)
    }
}

pub fn set_profile_mod_manager(profile_id: &str, mod_manager: &str) -> Result<()> {
    let conn = connection()?;
    conn.execute(
        "UPDATE profiles SET mod_manager = ?1 WHERE id = ?2",
        params![mod_manager, profile_id],
    )?;
    Ok(())
}

fn map_profile_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Profile> {
    let mod_manager: Option<String> = row.get(6)?;
    Ok(Profile {
        id: row.get(0)?,
        game_domain: row.get(1)?,
        name: row.get(2)?,
        game_path: row.get(3)?,
        staging_path: row.get(4)?,
        proton_prefix_path: row.get(5)?,
        mod_manager: mod_manager.filter(|s| !s.is_empty()),
        created_at: row.get(7)?,
    })
}

/// Resolve a profile's game folder, where the durable on-disk ledger lives.
fn ledger_game_path(profile_id: &str) -> Option<String> {
    get_profile(profile_id).ok().flatten().map(|p| p.game_path)
}

/// Mirror a batch of mods to the on-disk ledger (best-effort).
fn mirror_all(profile_id: &str, mods: &[InstalledMod]) {
    if let Some(game_path) = ledger_game_path(profile_id) {
        for m in mods {
            ledger::write_mod(&game_path, m);
        }
    }
}

pub fn save_installed_mod(mod_record: &InstalledMod) -> Result<()> {
    let conn = connection()?;
    conn.execute(
        "INSERT OR REPLACE INTO installed_mods (id, profile_id, nexus_mod_id, nexus_file_id, name, version, enabled, sort_order, installed_files_json, installed_at, category, tags_json, plugins_json, install_options_json)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
        params![
            mod_record.id,
            mod_record.profile_id,
            mod_record.nexus_mod_id,
            mod_record.nexus_file_id,
            mod_record.name,
            mod_record.version,
            mod_record.enabled as i32,
            mod_record.sort_order,
            mod_record.installed_files_json,
            mod_record.installed_at,
            mod_record.category,
            mod_record.tags_json,
            mod_record.plugins_json,
            mod_record.install_options_json,
        ],
    )?;
    if let Some(game_path) = ledger_game_path(&mod_record.profile_id) {
        ledger::write_mod(&game_path, mod_record);
    }
    Ok(())
}

fn row_to_installed_mod(row: &rusqlite::Row<'_>) -> rusqlite::Result<InstalledMod> {
    Ok(InstalledMod {
        id: row.get(0)?,
        profile_id: row.get(1)?,
        nexus_mod_id: row.get(2)?,
        nexus_file_id: row.get(3)?,
        name: row.get(4)?,
        version: row.get(5)?,
        enabled: row.get::<_, i32>(6)? != 0,
        sort_order: row.get(7)?,
        installed_files_json: row.get(8)?,
        installed_at: row.get(9)?,
        category: row.get(10).unwrap_or_default(),
        tags_json: row.get(11).unwrap_or_else(|_| "[]".to_string()),
        plugins_json: row.get(12).unwrap_or_else(|_| "[]".to_string()),
        install_options_json: row.get(13).unwrap_or_else(|_| "{}".to_string()),
    })
}

const INSTALLED_MOD_SELECT: &str = "SELECT id, profile_id, nexus_mod_id, nexus_file_id, name, version, enabled, sort_order, installed_files_json, installed_at, category, tags_json, plugins_json, install_options_json";

pub fn list_installed_mods(profile_id: &str) -> Result<Vec<InstalledMod>> {
    let conn = connection()?;
    let sql = format!(
        "{INSTALLED_MOD_SELECT} FROM installed_mods WHERE profile_id = ?1 ORDER BY sort_order ASC, installed_at DESC"
    );
    let mut stmt = conn.prepare(&sql)?;
    let mods = stmt
        .query_map(params![profile_id], row_to_installed_mod)?
        .filter_map(|r| r.ok())
        .collect();
    Ok(mods)
}

pub fn count_installed_mods(profile_id: &str) -> Result<usize> {
    let conn = connection()?;
    let n: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM installed_mods WHERE profile_id = ?1",
            params![profile_id],
            |row| row.get(0),
        )
        .unwrap_or(0);
    Ok(n as usize)
}

pub fn get_installed_mod(id: &str) -> Result<Option<InstalledMod>> {
    let conn = connection()?;
    let sql = format!("{INSTALLED_MOD_SELECT} FROM installed_mods WHERE id = ?1");
    let mut stmt = conn.prepare(&sql)?;
    let mut rows = stmt.query(params![id])?;
    if let Some(row) = rows.next()? {
        Ok(Some(row_to_installed_mod(&row)?))
    } else {
        Ok(None)
    }
}

pub fn delete_installed_mod(id: &str) -> Result<()> {
    if let Ok(Some(m)) = get_installed_mod(id) {
        if let Some(game_path) = ledger_game_path(&m.profile_id) {
            ledger::remove_mod(&game_path, id);
        }
    }
    let conn = connection()?;
    conn.execute("DELETE FROM installed_mods WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn set_mod_sort_orders(profile_id: &str, ordered_ids: &[String]) -> Result<Vec<InstalledMod>> {
    let conn = connection()?;
    for (order, mod_id) in ordered_ids.iter().enumerate() {
        conn.execute(
            "UPDATE installed_mods SET sort_order = ?1 WHERE id = ?2 AND profile_id = ?3",
            params![order as i32, mod_id, profile_id],
        )?;
    }
    let updated = list_installed_mods(profile_id)?;
    mirror_all(profile_id, &updated);
    Ok(updated)
}

pub fn renumber_sort_orders(profile_id: &str) -> Result<()> {
    let mods = list_installed_mods(profile_id)?;
    let conn = connection()?;
    for (order, m) in mods.iter().enumerate() {
        conn.execute(
            "UPDATE installed_mods SET sort_order = ?1 WHERE id = ?2",
            params![order as i32, m.id],
        )?;
    }
    drop(conn);
    mirror_all(profile_id, &list_installed_mods(profile_id)?);
    Ok(())
}

pub fn set_mod_enabled(id: &str, enabled: bool) -> Result<()> {
    let conn = connection()?;
    conn.execute(
        "UPDATE installed_mods SET enabled = ?1 WHERE id = ?2",
        params![enabled as i32, id],
    )?;
    drop(conn);
    if let Ok(Some(m)) = get_installed_mod(id) {
        if let Some(game_path) = ledger_game_path(&m.profile_id) {
            ledger::write_mod(&game_path, &m);
        }
    }
    Ok(())
}

pub fn next_sort_order(profile_id: &str) -> Result<i32> {
    let conn = connection()?;
    let max: i32 = conn
        .query_row(
            "SELECT COALESCE(MAX(sort_order), 0) FROM installed_mods WHERE profile_id = ?1",
            params![profile_id],
            |row| row.get(0),
        )
        .unwrap_or(0);
    Ok(max + 1)
}

pub fn reorder_mod(profile_id: &str, mod_id: &str, direction: &str) -> Result<Vec<InstalledMod>> {
    let mut mods = list_installed_mods(profile_id)?;
    let idx = mods
        .iter()
        .position(|m| m.id == mod_id)
        .ok_or_else(|| crate::error::NexusDeckError::NotFound("Mod not found".into()))?;

    let swap_idx = if direction == "up" {
        if idx == 0 {
            return Ok(mods);
        }
        idx - 1
    } else if direction == "down" {
        if idx >= mods.len() - 1 {
            return Ok(mods);
        }
        idx + 1
    } else {
        return Err(crate::error::NexusDeckError::Other(
            "direction must be 'up' or 'down'".into(),
        ));
    };

    mods.swap(idx, swap_idx);

    let conn = connection()?;
    for (order, m) in mods.iter().enumerate() {
        conn.execute(
            "UPDATE installed_mods SET sort_order = ?1 WHERE id = ?2",
            params![order as i32, m.id],
        )?;
    }

    let updated = list_installed_mods(profile_id)?;
    mirror_all(profile_id, &updated);
    Ok(updated)
}

pub fn insert_download(record: &DownloadRecord) -> Result<()> {
    let conn = connection()?;
    conn.execute(
        "INSERT INTO downloads (id, game_domain, mod_id, file_id, url, dest_path, bytes_done, bytes_total, status, created_at, mod_name, profile_id, update_target_mod_id)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
        params![
            record.id,
            record.game_domain,
            record.mod_id,
            record.file_id,
            record.url,
            record.dest_path,
            record.bytes_done,
            record.bytes_total,
            record.status,
            record.created_at,
            record.mod_name,
            record.profile_id,
            record.update_target_mod_id,
        ],
    )?;
    Ok(())
}

pub fn update_download_status(
    id: &str,
    status: &str,
    bytes_done: i64,
    bytes_total: i64,
) -> Result<()> {
    let conn = connection()?;
    conn.execute(
        "UPDATE downloads SET status = ?1, bytes_done = ?2, bytes_total = ?3 WHERE id = ?4",
        params![status, bytes_done, bytes_total, id],
    )?;
    Ok(())
}

fn row_to_download_record(row: &rusqlite::Row<'_>) -> rusqlite::Result<DownloadRecord> {
    Ok(DownloadRecord {
        id: row.get(0)?,
        game_domain: row.get(1)?,
        mod_id: row.get(2)?,
        file_id: row.get(3)?,
        url: row.get(4)?,
        dest_path: row.get(5)?,
        bytes_done: row.get(6)?,
        bytes_total: row.get(7)?,
        status: row.get(8)?,
        created_at: row.get(9)?,
        mod_name: row.get(10).unwrap_or_default(),
        profile_id: row.get(11).unwrap_or_default(),
        update_target_mod_id: row.get(12).unwrap_or_default(),
    })
}

const DOWNLOAD_SELECT: &str =
    "SELECT id, game_domain, mod_id, file_id, url, dest_path, bytes_done, bytes_total, status, created_at, mod_name, profile_id, update_target_mod_id";

pub fn get_download(id: &str) -> Result<Option<DownloadRecord>> {
    let conn = connection()?;
    let sql = format!("{DOWNLOAD_SELECT} FROM downloads WHERE id = ?1");
    let mut stmt = conn.prepare(&sql)?;
    let mut rows = stmt.query(params![id])?;
    if let Some(row) = rows.next()? {
        Ok(Some(row_to_download_record(&row)?))
    } else {
        Ok(None)
    }
}

pub fn list_downloads() -> Result<Vec<DownloadRecord>> {
    let conn = connection()?;
    let sql = format!("{DOWNLOAD_SELECT} FROM downloads ORDER BY created_at DESC");
    let mut stmt = conn.prepare(&sql)?;
    let downloads = stmt
        .query_map([], row_to_download_record)?
        .filter_map(|r| r.ok())
        .collect();
    Ok(downloads)
}

pub fn list_incomplete_downloads() -> Result<Vec<DownloadRecord>> {
    let conn = connection()?;
    let sql = format!(
        "{DOWNLOAD_SELECT} FROM downloads WHERE status IN ('queued', 'downloading', 'paused') ORDER BY created_at ASC"
    );
    let mut stmt = conn.prepare(&sql)?;
    let downloads = stmt
        .query_map([], row_to_download_record)?
        .filter_map(|r| r.ok())
        .collect();
    Ok(downloads)
}

pub fn delete_download(id: &str) -> Result<()> {
    let conn = connection()?;
    conn.execute("DELETE FROM downloads WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn clear_completed_downloads() -> Result<u64> {
    let conn = connection()?;
    let count = conn.execute(
        "DELETE FROM downloads WHERE status = 'complete'",
        [],
    )?;
    Ok(count as u64)
}

pub fn clear_failed_downloads() -> Result<u64> {
    let conn = connection()?;
    let count = conn.execute(
        "DELETE FROM downloads WHERE status IN ('failed', 'cancelled')",
        [],
    )?;
    Ok(count as u64)
}

pub fn get_setting(key: &str) -> Result<Option<String>> {
    let conn = connection()?;
    let mut stmt = conn.prepare("SELECT value FROM app_settings WHERE key = ?1")?;
    let mut rows = stmt.query(params![key])?;
    if let Some(row) = rows.next()? {
        Ok(Some(row.get(0)?))
    } else {
        Ok(None)
    }
}

pub fn set_setting(key: &str, value: &str) -> Result<()> {
    let conn = connection()?;
    conn.execute(
        "INSERT OR REPLACE INTO app_settings (key, value) VALUES (?1, ?2)",
        params![key, value],
    )?;
    Ok(())
}

pub fn export_diagnostics() -> Result<String> {
    let profiles = list_profiles()?;
    let downloads = list_downloads()?;
    Ok(serde_json::json!({
        "version": env!("CARGO_PKG_VERSION"),
        "platform": crate::services::paths::platform_name(),
        "profiles": profiles,
        "downloads": downloads,
        "timestamp": chrono::Utc::now().to_rfc3339(),
    })
    .to_string())
}

pub fn backup_profile(profile_id: &str, dest_zip: &str) -> Result<()> {
    let profile = get_profile(profile_id)?
        .ok_or_else(|| crate::error::NexusDeckError::NotFound("Profile not found".into()))?;
    let mods = list_installed_mods(profile_id)?;

    let backup_data = serde_json::json!({
        "profile": profile,
        "mods": mods,
        "exported_at": chrono::Utc::now().to_rfc3339(),
    });

    std::fs::write(dest_zip, serde_json::to_string_pretty(&backup_data)?)?;
    Ok(())
}

pub fn restore_profile(src_path: &str) -> Result<Profile> {
    let content = std::fs::read_to_string(src_path)?;
    let data: serde_json::Value = serde_json::from_str(&content)?;
    let profile: Profile = serde_json::from_value(data["profile"].clone())?;
    save_profile(&profile)?;

    if let Some(mods) = data["mods"].as_array() {
        for m in mods {
            let mod_record: InstalledMod = serde_json::from_value(m.clone())?;
            save_installed_mod(&mod_record)?;
        }
    }

    Ok(profile)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LaunchConfig {
    pub id: String,
    pub profile_id: String,
    pub name: String,
    pub use_f4se: bool,
    pub launch_method: String,
    pub custom_executable: Option<String>,
    pub args_json: String,
    pub pre_launch_actions_json: String,
    pub is_default: bool,
    pub last_used_at: Option<i64>,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LaunchHistoryEntry {
    pub id: String,
    pub profile_id: String,
    pub config_id: Option<String>,
    pub started_at: i64,
    pub ended_at: Option<i64>,
    pub duration_secs: Option<i64>,
    pub success: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SteamShortcutRecord {
    pub id: String,
    pub profile_id: String,
    pub config_id: String,
    pub display_name: String,
    pub app_id_generated: Option<i64>,
    pub created_at: i64,
}

fn row_to_launch_config(row: &rusqlite::Row<'_>) -> rusqlite::Result<LaunchConfig> {
    Ok(LaunchConfig {
        id: row.get(0)?,
        profile_id: row.get(1)?,
        name: row.get(2)?,
        use_f4se: row.get::<_, i32>(3)? != 0,
        launch_method: row.get(4)?,
        custom_executable: row.get(5)?,
        args_json: row.get(6)?,
        pre_launch_actions_json: row.get(7)?,
        is_default: row.get::<_, i32>(8)? != 0,
        last_used_at: row.get(9)?,
        created_at: row.get(10)?,
    })
}

pub fn save_launch_config(config: &LaunchConfig) -> Result<()> {
    let conn = connection()?;
    if config.is_default {
        conn.execute(
            "UPDATE launch_configs SET is_default = 0 WHERE profile_id = ?1",
            params![config.profile_id],
        )?;
    }
    conn.execute(
        "INSERT OR REPLACE INTO launch_configs (id, profile_id, name, use_f4se, launch_method, custom_executable, args_json, pre_launch_actions_json, is_default, last_used_at, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        params![
            config.id,
            config.profile_id,
            config.name,
            config.use_f4se as i32,
            config.launch_method,
            config.custom_executable,
            config.args_json,
            config.pre_launch_actions_json,
            config.is_default as i32,
            config.last_used_at,
            config.created_at,
        ],
    )?;
    Ok(())
}

pub fn list_launch_configs(profile_id: &str) -> Result<Vec<LaunchConfig>> {
    let conn = connection()?;
    let mut stmt = conn.prepare(
        "SELECT id, profile_id, name, use_f4se, launch_method, custom_executable, args_json, pre_launch_actions_json, is_default, last_used_at, created_at
         FROM launch_configs WHERE profile_id = ?1 ORDER BY is_default DESC, last_used_at DESC, created_at ASC",
    )?;
    let configs = stmt
        .query_map(params![profile_id], row_to_launch_config)?
        .filter_map(|r| r.ok())
        .collect();
    Ok(configs)
}

pub fn get_launch_config(id: &str) -> Result<Option<LaunchConfig>> {
    let conn = connection()?;
    let mut stmt = conn.prepare(
        "SELECT id, profile_id, name, use_f4se, launch_method, custom_executable, args_json, pre_launch_actions_json, is_default, last_used_at, created_at
         FROM launch_configs WHERE id = ?1",
    )?;
    let mut rows = stmt.query(params![id])?;
    if let Some(row) = rows.next()? {
        Ok(Some(row_to_launch_config(&row)?))
    } else {
        Ok(None)
    }
}

pub fn get_default_launch_config(profile_id: &str) -> Result<Option<LaunchConfig>> {
    let conn = connection()?;
    let mut stmt = conn.prepare(
        "SELECT id, profile_id, name, use_f4se, launch_method, custom_executable, args_json, pre_launch_actions_json, is_default, last_used_at, created_at
         FROM launch_configs WHERE profile_id = ?1 AND is_default = 1 LIMIT 1",
    )?;
    let mut rows = stmt.query(params![profile_id])?;
    if let Some(row) = rows.next()? {
        Ok(Some(row_to_launch_config(&row)?))
    } else {
        Ok(None)
    }
}

pub fn delete_launch_config(id: &str) -> Result<()> {
    let conn = connection()?;
    conn.execute("DELETE FROM launch_configs WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn get_recent_launch_configs(profile_id: &str, limit: i64) -> Result<Vec<LaunchConfig>> {
    let conn = connection()?;
    let mut stmt = conn.prepare(
        "SELECT id, profile_id, name, use_f4se, launch_method, custom_executable, args_json, pre_launch_actions_json, is_default, last_used_at, created_at
         FROM launch_configs WHERE profile_id = ?1 AND last_used_at IS NOT NULL
         ORDER BY last_used_at DESC LIMIT ?2",
    )?;
    let configs = stmt
        .query_map(params![profile_id, limit], row_to_launch_config)?
        .filter_map(|r| r.ok())
        .collect();
    Ok(configs)
}

pub fn touch_launch_config(id: &str) -> Result<()> {
    let conn = connection()?;
    conn.execute(
        "UPDATE launch_configs SET last_used_at = ?1 WHERE id = ?2",
        params![chrono::Utc::now().timestamp(), id],
    )?;
    Ok(())
}

pub fn seed_default_launch_configs(profile_id: &str, game_domain: &str) -> Result<()> {
    if !list_launch_configs(profile_id)?.is_empty() {
        return Ok(());
    }
    let now = chrono::Utc::now().timestamp();
    let extender_label = crate::games::GameRegistry::supported_games()
        .into_iter()
        .find(|g| g.domain == game_domain)
        .and_then(|g| g.script_extender_label);
    let deck_args = if game_domain == "fallout4" {
        serde_json::json!(["-high"])
    } else {
        serde_json::json!([])
    };
    let default_name = extender_label
        .as_ref()
        .map(|label| format!("Default ({label})"))
        .unwrap_or_else(|| "Default".to_string());
    let use_extender = extender_label.is_some();
    let pre_launch = r#"["sync_plugins","ensure_archive_invalidation","repair_loose_files"]"#.to_string();
    let defaults = vec![
        LaunchConfig {
            id: uuid::Uuid::new_v4().to_string(),
            profile_id: profile_id.to_string(),
            name: default_name,
            use_f4se: use_extender,
            launch_method: "steam".to_string(),
            custom_executable: None,
            args_json: "[]".to_string(),
            pre_launch_actions_json: pre_launch.clone(),
            is_default: true,
            last_used_at: None,
            created_at: now,
        },
        LaunchConfig {
            id: uuid::Uuid::new_v4().to_string(),
            profile_id: profile_id.to_string(),
            name: "Vanilla".to_string(),
            use_f4se: false,
            launch_method: "steam".to_string(),
            custom_executable: None,
            args_json: "[]".to_string(),
            pre_launch_actions_json: pre_launch.clone(),
            is_default: false,
            last_used_at: None,
            created_at: now,
        },
        LaunchConfig {
            id: uuid::Uuid::new_v4().to_string(),
            profile_id: profile_id.to_string(),
            name: "Steam Deck Performance".to_string(),
            use_f4se: use_extender,
            launch_method: "steam".to_string(),
            custom_executable: None,
            args_json: deck_args.to_string(),
            pre_launch_actions_json: pre_launch,
            is_default: false,
            last_used_at: None,
            created_at: now,
        },
    ];
    for config in defaults {
        save_launch_config(&config)?;
    }
    Ok(())
}

pub fn insert_launch_history(entry: &LaunchHistoryEntry) -> Result<()> {
    let conn = connection()?;
    conn.execute(
        "INSERT INTO launch_history (id, profile_id, config_id, started_at, ended_at, duration_secs, success)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            entry.id,
            entry.profile_id,
            entry.config_id,
            entry.started_at,
            entry.ended_at,
            entry.duration_secs,
            entry.success.map(|s| s as i32),
        ],
    )?;
    Ok(())
}

pub fn update_launch_history_end(
    id: &str,
    ended_at: i64,
    duration_secs: i64,
    success: bool,
) -> Result<()> {
    let conn = connection()?;
    conn.execute(
        "UPDATE launch_history SET ended_at = ?1, duration_secs = ?2, success = ?3 WHERE id = ?4",
        params![ended_at, duration_secs, success as i32, id],
    )?;
    Ok(())
}

pub fn get_playtime_stats(profile_id: &str) -> Result<serde_json::Value> {
    let conn = connection()?;
    let total_secs: i64 = conn.query_row(
        "SELECT COALESCE(SUM(duration_secs), 0) FROM launch_history WHERE profile_id = ?1 AND success = 1",
        params![profile_id],
        |row| row.get(0),
    )?;
    let last_played: Option<i64> = conn.query_row(
        "SELECT MAX(started_at) FROM launch_history WHERE profile_id = ?1",
        params![profile_id],
        |row| row.get(0),
    )?;
    let session_count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM launch_history WHERE profile_id = ?1",
        params![profile_id],
        |row| row.get(0),
    )?;
    Ok(serde_json::json!({
        "total_secs": total_secs,
        "last_played_at": last_played,
        "session_count": session_count,
    }))
}

pub fn save_steam_shortcut(record: &SteamShortcutRecord) -> Result<()> {
    let conn = connection()?;
    conn.execute(
        "INSERT OR REPLACE INTO steam_shortcuts (id, profile_id, config_id, display_name, app_id_generated, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            record.id,
            record.profile_id,
            record.config_id,
            record.display_name,
            record.app_id_generated,
            record.created_at,
        ],
    )?;
    Ok(())
}

pub fn list_steam_shortcuts(profile_id: &str) -> Result<Vec<SteamShortcutRecord>> {
    let conn = connection()?;
    let mut stmt = conn.prepare(
        "SELECT id, profile_id, config_id, display_name, app_id_generated, created_at
         FROM steam_shortcuts WHERE profile_id = ?1 ORDER BY created_at DESC",
    )?;
    let records = stmt
        .query_map(params![profile_id], |row| {
            Ok(SteamShortcutRecord {
                id: row.get(0)?,
                profile_id: row.get(1)?,
                config_id: row.get(2)?,
                display_name: row.get(3)?,
                app_id_generated: row.get(4)?,
                created_at: row.get(5)?,
            })
        })?
        .filter_map(|r| r.ok())
        .collect();
    Ok(records)
}

pub fn delete_steam_shortcut(id: &str) -> Result<()> {
    let conn = connection()?;
    conn.execute("DELETE FROM steam_shortcuts WHERE id = ?1", params![id])?;
    Ok(())
}

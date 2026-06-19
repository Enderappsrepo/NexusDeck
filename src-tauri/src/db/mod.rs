use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

use crate::error::Result;
use crate::services::paths::{db_path, ensure_dir};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Profile {
    pub id: String,
    pub game_domain: String,
    pub name: String,
    pub game_path: String,
    pub staging_path: String,
    pub proton_prefix_path: Option<String>,
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
    pub installed_files_json: String,
    pub installed_at: i64,
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
}

fn connection() -> Result<Connection> {
    let path = db_path();
    if let Some(parent) = path.parent() {
        ensure_dir(parent)?;
    }
    let conn = Connection::open(path)?;
    conn.execute_batch(include_str!("schema.sql"))?;
    migrate_downloads_table(&conn)?;
    Ok(conn)
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
    Ok(())
}

pub fn init_db() -> Result<()> {
    let _ = connection()?;
    Ok(())
}

pub fn save_profile(profile: &Profile) -> Result<()> {
    let conn = connection()?;
    conn.execute(
        "INSERT OR REPLACE INTO profiles (id, game_domain, name, game_path, staging_path, proton_prefix_path, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            profile.id,
            profile.game_domain,
            profile.name,
            profile.game_path,
            profile.staging_path,
            profile.proton_prefix_path,
            profile.created_at,
        ],
    )?;
    Ok(())
}

pub fn list_profiles() -> Result<Vec<Profile>> {
    let conn = connection()?;
    let mut stmt = conn.prepare(
        "SELECT id, game_domain, name, game_path, staging_path, proton_prefix_path, created_at FROM profiles ORDER BY created_at DESC",
    )?;
    let profiles = stmt
        .query_map([], |row| {
            Ok(Profile {
                id: row.get(0)?,
                game_domain: row.get(1)?,
                name: row.get(2)?,
                game_path: row.get(3)?,
                staging_path: row.get(4)?,
                proton_prefix_path: row.get(5)?,
                created_at: row.get(6)?,
            })
        })?
        .filter_map(|r| r.ok())
        .collect();
    Ok(profiles)
}

pub fn get_profile(id: &str) -> Result<Option<Profile>> {
    let conn = connection()?;
    let mut stmt = conn.prepare(
        "SELECT id, game_domain, name, game_path, staging_path, proton_prefix_path, created_at FROM profiles WHERE id = ?1",
    )?;
    let mut rows = stmt.query(params![id])?;
    if let Some(row) = rows.next()? {
        Ok(Some(Profile {
            id: row.get(0)?,
            game_domain: row.get(1)?,
            name: row.get(2)?,
            game_path: row.get(3)?,
            staging_path: row.get(4)?,
            proton_prefix_path: row.get(5)?,
            created_at: row.get(6)?,
        }))
    } else {
        Ok(None)
    }
}

pub fn get_profile_by_domain(domain: &str) -> Result<Option<Profile>> {
    let conn = connection()?;
    let mut stmt = conn.prepare(
        "SELECT id, game_domain, name, game_path, staging_path, proton_prefix_path, created_at FROM profiles WHERE game_domain = ?1 LIMIT 1",
    )?;
    let mut rows = stmt.query(params![domain])?;
    if let Some(row) = rows.next()? {
        Ok(Some(Profile {
            id: row.get(0)?,
            game_domain: row.get(1)?,
            name: row.get(2)?,
            game_path: row.get(3)?,
            staging_path: row.get(4)?,
            proton_prefix_path: row.get(5)?,
            created_at: row.get(6)?,
        }))
    } else {
        Ok(None)
    }
}

pub fn save_installed_mod(mod_record: &InstalledMod) -> Result<()> {
    let conn = connection()?;
    conn.execute(
        "INSERT OR REPLACE INTO installed_mods (id, profile_id, nexus_mod_id, nexus_file_id, name, version, enabled, installed_files_json, installed_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            mod_record.id,
            mod_record.profile_id,
            mod_record.nexus_mod_id,
            mod_record.nexus_file_id,
            mod_record.name,
            mod_record.version,
            mod_record.enabled as i32,
            mod_record.installed_files_json,
            mod_record.installed_at,
        ],
    )?;
    Ok(())
}

pub fn list_installed_mods(profile_id: &str) -> Result<Vec<InstalledMod>> {
    let conn = connection()?;
    let mut stmt = conn.prepare(
        "SELECT id, profile_id, nexus_mod_id, nexus_file_id, name, version, enabled, installed_files_json, installed_at
         FROM installed_mods WHERE profile_id = ?1 ORDER BY installed_at DESC",
    )?;
    let mods = stmt
        .query_map(params![profile_id], |row| {
            Ok(InstalledMod {
                id: row.get(0)?,
                profile_id: row.get(1)?,
                nexus_mod_id: row.get(2)?,
                nexus_file_id: row.get(3)?,
                name: row.get(4)?,
                version: row.get(5)?,
                enabled: row.get::<_, i32>(6)? != 0,
                installed_files_json: row.get(7)?,
                installed_at: row.get(8)?,
            })
        })?
        .filter_map(|r| r.ok())
        .collect();
    Ok(mods)
}

pub fn get_installed_mod(id: &str) -> Result<Option<InstalledMod>> {
    let conn = connection()?;
    let mut stmt = conn.prepare(
        "SELECT id, profile_id, nexus_mod_id, nexus_file_id, name, version, enabled, installed_files_json, installed_at
         FROM installed_mods WHERE id = ?1",
    )?;
    let mut rows = stmt.query(params![id])?;
    if let Some(row) = rows.next()? {
        Ok(Some(InstalledMod {
            id: row.get(0)?,
            profile_id: row.get(1)?,
            nexus_mod_id: row.get(2)?,
            nexus_file_id: row.get(3)?,
            name: row.get(4)?,
            version: row.get(5)?,
            enabled: row.get::<_, i32>(6)? != 0,
            installed_files_json: row.get(7)?,
            installed_at: row.get(8)?,
        }))
    } else {
        Ok(None)
    }
}

pub fn set_mod_enabled(id: &str, enabled: bool) -> Result<()> {
    let conn = connection()?;
    conn.execute(
        "UPDATE installed_mods SET enabled = ?1 WHERE id = ?2",
        params![enabled as i32, id],
    )?;
    Ok(())
}

pub fn insert_download(record: &DownloadRecord) -> Result<()> {
    let conn = connection()?;
    conn.execute(
        "INSERT INTO downloads (id, game_domain, mod_id, file_id, url, dest_path, bytes_done, bytes_total, status, created_at, mod_name, profile_id)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
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
    })
}

pub fn get_download(id: &str) -> Result<Option<DownloadRecord>> {
    let conn = connection()?;
    let mut stmt = conn.prepare(
        "SELECT id, game_domain, mod_id, file_id, url, dest_path, bytes_done, bytes_total, status, created_at, mod_name, profile_id FROM downloads WHERE id = ?1",
    )?;
    let mut rows = stmt.query(params![id])?;
    if let Some(row) = rows.next()? {
        Ok(Some(row_to_download_record(&row)?))
    } else {
        Ok(None)
    }
}

pub fn list_downloads() -> Result<Vec<DownloadRecord>> {
    let conn = connection()?;
    let mut stmt = conn.prepare(
        "SELECT id, game_domain, mod_id, file_id, url, dest_path, bytes_done, bytes_total, status, created_at, mod_name, profile_id FROM downloads ORDER BY created_at DESC",
    )?;
    let downloads = stmt
        .query_map([], row_to_download_record)?
        .filter_map(|r| r.ok())
        .collect();
    Ok(downloads)
}

pub fn list_incomplete_downloads() -> Result<Vec<DownloadRecord>> {
    let conn = connection()?;
    let mut stmt = conn.prepare(
        "SELECT id, game_domain, mod_id, file_id, url, dest_path, bytes_done, bytes_total, status, created_at, mod_name, profile_id
         FROM downloads WHERE status IN ('queued', 'downloading', 'paused') ORDER BY created_at ASC",
    )?;
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
    let defaults = vec![
        LaunchConfig {
            id: uuid::Uuid::new_v4().to_string(),
            profile_id: profile_id.to_string(),
            name: default_name,
            use_f4se: use_extender,
            launch_method: "steam".to_string(),
            custom_executable: None,
            args_json: "[]".to_string(),
            pre_launch_actions_json: serde_json::json!(["sync_plugins"]).to_string(),
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
            pre_launch_actions_json: serde_json::json!(["sync_plugins"]).to_string(),
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
            pre_launch_actions_json: serde_json::json!(["sync_plugins"]).to_string(),
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

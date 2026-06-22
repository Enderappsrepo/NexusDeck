use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::db;
use crate::error::{NexusDeckError, Result};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModLoadout {
    pub id: String,
    pub name: String,
    pub enabled_mod_ids: Vec<String>,
    pub sort_orders: HashMap<String, i32>,
    pub created_at: i64,
}

fn storage_key(profile_id: &str) -> String {
    format!("loadouts:{profile_id}")
}

pub fn list_loadouts(profile_id: &str) -> Result<Vec<ModLoadout>> {
    let key = storage_key(profile_id);
    match db::get_setting(&key)? {
        Some(raw) => Ok(serde_json::from_str(&raw).unwrap_or_default()),
        None => Ok(Vec::new()),
    }
}

pub fn save_loadout(profile_id: &str, name: &str) -> Result<ModLoadout> {
    let mods = db::list_installed_mods(profile_id)?;
    let enabled_mod_ids: Vec<String> = mods.iter().filter(|m| m.enabled).map(|m| m.id.clone()).collect();
    let sort_orders: HashMap<String, i32> = mods
        .iter()
        .map(|m| (m.id.clone(), m.sort_order))
        .collect();

    let loadout = ModLoadout {
        id: Uuid::new_v4().to_string(),
        name: name.to_string(),
        enabled_mod_ids,
        sort_orders,
        created_at: chrono::Utc::now().timestamp(),
    };

    let mut all = list_loadouts(profile_id)?;
    all.push(loadout.clone());
    db::set_setting(&storage_key(profile_id), &serde_json::to_string(&all)?)?;
    Ok(loadout)
}

pub fn apply_loadout(profile_id: &str, loadout_id: &str) -> Result<()> {
    let loadouts = list_loadouts(profile_id)?;
    let loadout = loadouts
        .into_iter()
        .find(|l| l.id == loadout_id)
        .ok_or_else(|| NexusDeckError::NotFound("Loadout not found".into()))?;

    let enabled_set: std::collections::HashSet<&str> =
        loadout.enabled_mod_ids.iter().map(|s| s.as_str()).collect();

    let mut mods = db::list_installed_mods(profile_id)?;
    for m in &mods {
        let should_enable = enabled_set.contains(m.id.as_str());
        if m.enabled != should_enable {
            db::set_mod_enabled(&m.id, should_enable)?;
        }
    }

    mods.sort_by_key(|m| loadout.sort_orders.get(&m.id).copied().unwrap_or(m.sort_order));
    let ordered_ids: Vec<String> = mods.iter().map(|m| m.id.clone()).collect();
    db::set_mod_sort_orders(profile_id, &ordered_ids)?;
    Ok(())
}

pub fn delete_loadout(profile_id: &str, loadout_id: &str) -> Result<()> {
    let mut all = list_loadouts(profile_id)?;
    let before = all.len();
    all.retain(|l| l.id != loadout_id);
    if all.len() == before {
        return Err(NexusDeckError::NotFound("Loadout not found".into()));
    }
    db::set_setting(&storage_key(profile_id), &serde_json::to_string(&all)?)?;
    Ok(())
}

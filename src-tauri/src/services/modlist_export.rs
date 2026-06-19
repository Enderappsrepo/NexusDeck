use serde::{Deserialize, Serialize};

use crate::db::InstalledMod;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModlistExport {
    pub format: String,
    pub content: String,
}

pub fn export_modlist(mods: &[InstalledMod], format: &str) -> ModlistExport {
    let enabled: Vec<&InstalledMod> = mods.iter().filter(|m| m.enabled).collect();
    let content = match format {
        "loot" => export_loot(&enabled),
        "mo2" => export_mo2(&enabled),
        "vortex" => export_vortex(&enabled),
        _ => export_markdown(&enabled),
    };
    ModlistExport {
        format: format.to_string(),
        content,
    }
}

fn export_loot(mods: &[&InstalledMod]) -> String {
    mods.iter()
        .map(|m| format!("*{}", m.name))
        .collect::<Vec<_>>()
        .join("\n")
}

fn export_mo2(mods: &[&InstalledMod]) -> String {
    let mut lines = vec!["Mod Name,Version,Enabled".to_string()];
    for m in mods {
        lines.push(format!(
            "{},{},{}",
            escape_csv(&m.name),
            m.version.as_deref().unwrap_or(""),
            if m.enabled { "true" } else { "false" }
        ));
    }
    lines.join("\n")
}

fn export_vortex(mods: &[&InstalledMod]) -> String {
    let entries: Vec<serde_json::Value> = mods
        .iter()
        .map(|m| {
            serde_json::json!({
                "name": m.name,
                "version": m.version,
                "enabled": m.enabled,
                "nexusModId": m.nexus_mod_id,
            })
        })
        .collect();
    serde_json::to_string_pretty(&entries).unwrap_or_else(|_| "[]".to_string())
}

fn export_markdown(mods: &[&InstalledMod]) -> String {
    let mut lines = vec!["# Mod List".to_string(), String::new()];
    for m in mods {
        let version = m.version.as_deref().unwrap_or("unknown");
        lines.push(format!("- **{}** ({})", m.name, version));
    }
    lines.join("\n")
}

fn escape_csv(value: &str) -> String {
    if value.contains(',') || value.contains('"') {
        format!("\"{}\"", value.replace('"', "\"\""))
    } else {
        value.to_string()
    }
}

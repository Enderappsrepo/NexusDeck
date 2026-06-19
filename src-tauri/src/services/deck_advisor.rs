use serde::{Deserialize, Serialize};

use crate::db::{self, InstalledMod, Profile};
use crate::error::Result;
use crate::games;
use crate::services::paths::platform_name;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdvisorFinding {
    pub rule_id: String,
    pub severity: String,
    pub message: String,
    pub deck_tip: Option<String>,
    pub affected_mods: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct RulesFile {
    rules: Vec<RuleDefinition>,
}

#[derive(Debug, Deserialize)]
struct RuleDefinition {
    id: String,
    severity: String,
    condition: serde_json::Value,
    message: String,
    deck_tip: Option<String>,
}

pub fn analyze_profile(profile_id: &str) -> Result<Vec<AdvisorFinding>> {
    let profile = db::get_profile(profile_id)?
        .ok_or_else(|| crate::error::NexusDeckError::NotFound("Profile not found".into()))?;
    let installed = db::list_installed_mods(profile_id)?;
    let rules = load_rules(&profile.game_domain)?;
    Ok(evaluate_rules(&profile, &installed, &rules))
}

fn load_rules(game_domain: &str) -> Result<Vec<RuleDefinition>> {
    let path = format!("src/games/rules/{game_domain}_deck.json");
    let embedded = match game_domain {
        "fallout4" => include_str!("../games/rules/fallout4_deck.json"),
        _ => return Ok(Vec::new()),
    };
    let _ = path;
    let file: RulesFile = serde_json::from_str(embedded)?;
    Ok(file.rules)
}

fn evaluate_rules(
    profile: &Profile,
    installed: &[InstalledMod],
    rules: &[RuleDefinition],
) -> Vec<AdvisorFinding> {
    let mut findings = Vec::new();
    let platform = platform_name().to_lowercase();
    let f4se = games::run_wizard_step(
        &profile.game_domain,
        "detect_f4se",
        serde_json::json!({ "game_path": profile.game_path }),
    )
    .map(|r| r.success)
    .unwrap_or(false);

    for rule in rules {
        if let Some(finding) = evaluate_rule(rule, installed, &platform, f4se) {
            findings.push(finding);
        }
    }
    findings
}

fn evaluate_rule(
    rule: &RuleDefinition,
    installed: &[InstalledMod],
    platform: &str,
    f4se_installed: bool,
) -> Option<AdvisorFinding> {
    let condition = &rule.condition;

    if let Some(cat_rule) = condition.get("category_count") {
        let gte = cat_rule.get("gte")?.as_u64()?;
        let count = if let Some(category) = cat_rule.get("category").and_then(|v| v.as_str()) {
            if category.is_empty() {
                installed.len() as u64
            } else {
                installed
                    .iter()
                    .filter(|m| m.name.to_lowercase().contains(&category.to_lowercase()))
                    .count() as u64
            }
        } else {
            installed.len() as u64
        };
        if count >= gte {
            return Some(build_finding(rule, installed, None));
        }
    }

    if let Some(name_contains) = condition.get("installed_name_contains").and_then(|v| v.as_array())
    {
        let needles: Vec<String> = name_contains
            .iter()
            .filter_map(|v| v.as_str().map(|s| s.to_lowercase()))
            .collect();
        let affected: Vec<String> = installed
            .iter()
            .filter(|m| {
                let lower = m.name.to_lowercase();
                needles.iter().any(|n| lower.contains(n))
            })
            .map(|m| m.name.clone())
            .collect();

        if affected.is_empty() {
            return None;
        }

        if condition.get("f4se_missing").and_then(|v| v.as_bool()) == Some(true) && f4se_installed {
            return None;
        }

        if let Some(expected_platform) = condition.get("platform").and_then(|v| v.as_str()) {
            if expected_platform != platform {
                return None;
            }
        }

        return Some(build_finding(rule, installed, Some(affected)));
    }

    None
}

fn build_finding(
    rule: &RuleDefinition,
    installed: &[InstalledMod],
    affected: Option<Vec<String>>,
) -> AdvisorFinding {
    AdvisorFinding {
        rule_id: rule.id.clone(),
        severity: rule.severity.clone(),
        message: rule.message.clone(),
        deck_tip: rule.deck_tip.clone(),
        affected_mods: affected.unwrap_or_else(|| installed.iter().map(|m| m.name.clone()).collect()),
    }
}

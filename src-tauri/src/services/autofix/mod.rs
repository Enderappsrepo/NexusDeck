pub mod scanner;
pub mod applicator;
pub mod rules;

use serde::{Deserialize, Serialize};

use crate::error::Result;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiagnosticFinding {
    pub id: String,
    pub severity: String,
    pub message: String,
    pub remedy_id: Option<String>,
    pub auto_fixable: bool,
    pub deck_tip: Option<String>,
    pub context: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiagnosticScanResult {
    pub profile_id: String,
    pub game_domain: String,
    pub findings: Vec<DiagnosticFinding>,
    pub scanned_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FixResult {
    pub remedy_id: String,
    pub applied: bool,
    pub skipped: bool,
    pub message: String,
    pub backup_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApplyFixesResult {
    pub results: Vec<FixResult>,
    pub backup_dir: Option<String>,
}

pub fn run_scan(profile_id: &str) -> Result<DiagnosticScanResult> {
    scanner::scan_profile(profile_id)
}

pub fn apply_fix(profile_id: &str, remedy_id: &str) -> Result<ApplyFixesResult> {
    applicator::apply_remedy(profile_id, remedy_id)
}

pub fn apply_safe_fixes(profile_id: &str) -> Result<ApplyFixesResult> {
    let scan = scanner::scan_profile(profile_id)?;
    let mut results = Vec::new();
    let mut backup_dir = None;

    for finding in scan.findings {
        if !finding.auto_fixable {
            continue;
        }
        let Some(remedy_id) = finding.remedy_id else {
            continue;
        };
        let result = applicator::apply_remedy(profile_id, &remedy_id)?;
        if backup_dir.is_none() {
            backup_dir = result.backup_dir.clone();
        }
        results.extend(result.results);
    }

    Ok(ApplyFixesResult {
        results,
        backup_dir,
    })
}

pub fn list_remedies(game_domain: &str) -> Result<Vec<rules::RemedyDefinition>> {
    rules::list_remedies(game_domain)
}

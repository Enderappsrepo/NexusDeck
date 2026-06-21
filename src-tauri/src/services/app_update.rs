use serde::{Deserialize, Serialize};

use crate::error::{NexusDeckError, Result};

/// GitHub repo hosting releases and docs/updates.json (owner/name).
const DEFAULT_GITHUB_REPO: &str = "Enderappsrepo/NexusDeck";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppUpdateInfo {
    pub current_version: String,
    pub latest_version: String,
    pub minimum_version: Option<String>,
    pub update_available: bool,
    pub update_required: bool,
    pub message: String,
    pub release_url: String,
    pub release_notes: Option<String>,
}

#[derive(Debug, Deserialize)]
struct UpdatesManifest {
    minimum_version: Option<String>,
    latest_version: Option<String>,
    message: Option<String>,
    release_url: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GithubRelease {
    tag_name: String,
    html_url: String,
    body: Option<String>,
}

pub fn check_app_update() -> Result<AppUpdateInfo> {
    let current = env!("CARGO_PKG_VERSION").to_string();
    let repo = std::env::var("NEXUSDECK_GITHUB_REPO").unwrap_or_else(|_| DEFAULT_GITHUB_REPO.to_string());

    let manifest = fetch_updates_manifest(&repo).ok();
    let release = fetch_latest_release(&repo).ok();

    let latest = manifest
        .as_ref()
        .and_then(|m| m.latest_version.clone())
        .or_else(|| {
            release
                .as_ref()
                .map(|r| r.tag_name.trim_start_matches('v').to_string())
        })
        .unwrap_or_else(|| current.clone());

    let minimum = manifest.as_ref().and_then(|m| m.minimum_version.clone());

    let update_available = version_gt(&latest, &current);
    let update_required = minimum
        .as_ref()
        .map(|min| version_gt(min, &current))
        .unwrap_or(false);

    let manifest_message = manifest.as_ref().and_then(|m| m.message.clone());
    let manifest_url = manifest.as_ref().and_then(|m| m.release_url.clone());

    let message = manifest_message
        .or_else(|| {
            release.as_ref().and_then(|r| {
                r.body.as_ref().map(|b| truncate_message(b, 280))
            })
        })
        .unwrap_or_else(|| {
            if update_required {
                format!("NexusDeck {latest} is required. Please update to continue.")
            } else if update_available {
                format!("NexusDeck {latest} is available. Update for the latest fixes and features.")
            } else {
                "You are on the latest version.".to_string()
            }
        });

    let release_url = manifest_url
        .or_else(|| release.as_ref().map(|r| r.html_url.clone()))
        .unwrap_or_else(|| format!("https://github.com/{repo}/releases/latest"));

    Ok(AppUpdateInfo {
        current_version: current,
        latest_version: latest,
        minimum_version: minimum,
        update_available,
        update_required,
        message,
        release_url,
        release_notes: release.and_then(|r| r.body),
    })
}

fn fetch_updates_manifest(repo: &str) -> Result<UpdatesManifest> {
    let url = format!("https://raw.githubusercontent.com/{repo}/main/docs/updates.json");
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .user_agent("NexusDeck-Updater")
        .build()
        .map_err(|e| NexusDeckError::Other(e.to_string()))?;

    let response = client
        .get(&url)
        .send()
        .map_err(|e| NexusDeckError::Other(format!("Update check failed: {e}")))?;

    if !response.status().is_success() {
        return Err(NexusDeckError::Other(format!(
            "Update manifest HTTP {}",
            response.status()
        )));
    }

    response
        .json()
        .map_err(|e| NexusDeckError::Other(format!("Invalid update manifest: {e}")))
}

fn fetch_latest_release(repo: &str) -> Result<GithubRelease> {
    let url = format!("https://api.github.com/repos/{repo}/releases/latest");
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .user_agent("NexusDeck-Updater")
        .build()
        .map_err(|e| NexusDeckError::Other(e.to_string()))?;

    let response = client
        .get(&url)
        .send()
        .map_err(|e| NexusDeckError::Other(format!("GitHub release lookup failed: {e}")))?;

    if !response.status().is_success() {
        return Err(NexusDeckError::Other(format!(
            "GitHub release HTTP {}",
            response.status()
        )));
    }

    response
        .json()
        .map_err(|e| NexusDeckError::Other(format!("Invalid GitHub release JSON: {e}")))
}

pub fn version_gt(a: &str, b: &str) -> bool {
    parse_version(a) > parse_version(b)
}

fn parse_version(version: &str) -> Vec<u64> {
    version
        .trim()
        .trim_start_matches('v')
        .split('.')
        .take(4)
        .map(|part| {
            part.split('-')
                .next()
                .unwrap_or(part)
                .parse::<u64>()
                .unwrap_or(0)
        })
        .collect()
}

fn truncate_message(text: &str, max: usize) -> String {
    let trimmed = text.trim();
    if trimmed.len() <= max {
        return trimmed.to_string();
    }
    format!("{}…", &trimmed[..max.saturating_sub(1)])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn version_compare() {
        assert!(version_gt("0.6.0", "0.5.1"));
        assert!(version_gt("1.0.0", "0.9.9"));
        assert!(!version_gt("0.5.1", "0.5.1"));
        assert!(!version_gt("0.5.0", "0.5.1"));
    }
}

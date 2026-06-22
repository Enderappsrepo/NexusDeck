use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Copy)]
pub struct ScriptExtenderMeta {
    pub domain: &'static str,
    pub label: &'static str,
    pub loader: &'static str,
    pub dll_prefix: Option<&'static str>,
    pub launcher_exe: Option<&'static str>,
    pub download_url: Option<&'static str>,
    pub github_repo: Option<&'static str>,
    pub github_asset_prefix: Option<&'static str>,
    pub website_url: &'static str,
    pub runtime: &'static str,
    pub notes: &'static str,
}

impl ScriptExtenderMeta {
    pub const FALLOUT4: ScriptExtenderMeta = ScriptExtenderMeta {
        domain: "fallout4",
        label: "F4SE",
        loader: "f4se_loader.exe",
        dll_prefix: Some("f4se_"),
        launcher_exe: Some("Fallout4Launcher.exe"),
        download_url: Some("https://f4se.silverlock.org/beta/f4se_0_06_23.7z"),
        github_repo: None,
        github_asset_prefix: None,
        website_url: "https://f4se.silverlock.org/",
        runtime: "Fallout 4 1.10.163",
        notes: "Required for most Fallout 4 mods. NexusDeck can download and install F4SE, or use Install from file with a .7z from the website.",
    };

    pub const SKYRIM_SE: ScriptExtenderMeta = ScriptExtenderMeta {
        domain: "skyrimspecialedition",
        label: "SKSE",
        loader: "skse64_loader.exe",
        dll_prefix: Some("skse64_"),
        launcher_exe: Some("SkyrimSELauncher.exe"),
        download_url: Some("https://skse.silverlock.org/beta/skse64_2_02_06.7z"),
        github_repo: None,
        github_asset_prefix: None,
        website_url: "https://skse.silverlock.org/",
        runtime: "Skyrim SE 1.6.1170 (Steam AE)",
        notes: "Match the SKSE build to your game version. If auto-download fails, grab the correct .7z from skse.silverlock.org and use Install from file.",
    };

    pub const SKYRIM_LE: ScriptExtenderMeta = ScriptExtenderMeta {
        domain: "skyrim",
        label: "SKSE",
        loader: "skse_loader.exe",
        dll_prefix: Some("skse_"),
        launcher_exe: Some("SkyrimLauncher.exe"),
        download_url: Some("https://skse.silverlock.org/beta/skse_1_07_03.7z"),
        github_repo: None,
        github_asset_prefix: None,
        website_url: "https://skse.silverlock.org/",
        runtime: "Skyrim LE 1.9.32",
        notes: "Classic SKSE for Skyrim Legendary Edition. Extract into the folder containing TESV.exe.",
    };

    pub const FALLOUT_NV: ScriptExtenderMeta = ScriptExtenderMeta {
        domain: "falloutnv",
        label: "xNVSE",
        loader: "nvse_loader.exe",
        dll_prefix: Some("nvse_"),
        launcher_exe: Some("FalloutNVLauncher.exe"),
        download_url: None,
        github_repo: Some("xNVSE/NVSE"),
        github_asset_prefix: Some("nvse_"),
        website_url: "https://github.com/xNVSE/NVSE/releases",
        runtime: "Latest xNVSE (GitHub releases)",
        notes: "Uses the community xNVSE fork. NexusDeck downloads the latest release from GitHub, or use Install from file.",
    };

    pub const FALLOUT3: ScriptExtenderMeta = ScriptExtenderMeta {
        domain: "fallout3",
        label: "FOSE",
        loader: "fose_loader.exe",
        dll_prefix: Some("fose_"),
        launcher_exe: Some("Fallout3Launcher.exe"),
        download_url: Some("http://fose.silverlock.org/beta/fose_v1_3_beta.7z"),
        github_repo: None,
        github_asset_prefix: None,
        website_url: "http://fose.silverlock.org/",
        runtime: "Fallout 3 1.7.0.3 (downgrade may be required for latest Steam)",
        notes: "FOSE may require downgrading Fallout 3 on newer Steam builds. Download from fose.silverlock.org if auto-install fails.",
    };

    pub const STARFIELD: ScriptExtenderMeta = ScriptExtenderMeta {
        domain: "starfield",
        label: "SFSE",
        loader: "sfse_loader.exe",
        dll_prefix: Some("sfse_"),
        launcher_exe: None,
        download_url: None,
        github_repo: None,
        github_asset_prefix: None,
        website_url: "https://sfse.silverlock.org/",
        runtime: "Latest Starfield on Steam",
        notes: "SFSE is distributed via Nexus Mods. Download the archive from sfse.silverlock.org or Nexus, then use Install from file.",
    };

    pub const OBLIVION: ScriptExtenderMeta = ScriptExtenderMeta {
        domain: "oblivion",
        label: "OBSE",
        loader: "obse_loader.exe",
        dll_prefix: Some("obse_"),
        launcher_exe: Some("OblivionLauncher.exe"),
        download_url: Some("http://obse.silverlock.org/download/obse_0021.zip"),
        github_repo: None,
        github_asset_prefix: None,
        website_url: "http://obse.silverlock.org/",
        runtime: "Oblivion 1.2.0.416",
        notes: "GOG users may need obse_loader.zip from the OBSE site. Use Install from file if the auto-download package does not match your copy.",
    };

    pub const ALL: &'static [ScriptExtenderMeta] = &[
        Self::FALLOUT4,
        Self::SKYRIM_SE,
        Self::SKYRIM_LE,
        Self::FALLOUT_NV,
        Self::FALLOUT3,
        Self::STARFIELD,
        Self::OBLIVION,
    ];

    pub fn get(domain: &str) -> Option<&'static ScriptExtenderMeta> {
        Self::ALL.iter().find(|m| m.domain == domain)
    }

    pub fn supports_auto_download(&self) -> bool {
        self.download_url.is_some() || self.github_repo.is_some()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScriptExtenderInstallInfo {
    pub domain: String,
    pub label: String,
    pub download_url: Option<String>,
    pub website_url: String,
    pub runtime: String,
    pub notes: String,
    pub supports_auto_download: bool,
    pub supports_steam_launcher_patch: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub game_version: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub recommended_extender_version: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub installed_extender_game_version: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub version_compatible: Option<bool>,
}

pub fn install_info(domain: &str, game_root: Option<&Path>) -> Option<ScriptExtenderInstallInfo> {
    let meta = ScriptExtenderMeta::get(domain)?;
    let version_report = game_root
        .and_then(|root| {
            crate::services::script_extender_version::resolve_build_for_game(domain, root).ok()
        });

    let recommended = version_report.as_ref().and_then(|r| r.recommended.as_ref());
    let download_url = recommended
        .map(|b| b.download_url.clone())
        .or_else(|| meta.download_url.map(|s| s.to_string()));

    let runtime = recommended
        .map(|b| format!("{} game {}", meta.label, b.game_version))
        .unwrap_or_else(|| meta.runtime.to_string());

    Some(ScriptExtenderInstallInfo {
        domain: meta.domain.to_string(),
        label: meta.label.to_string(),
        download_url,
        website_url: meta.website_url.to_string(),
        runtime,
        notes: meta.notes.to_string(),
        supports_auto_download: meta.supports_auto_download() || recommended.is_some(),
        supports_steam_launcher_patch: meta.launcher_exe.is_some(),
        game_version: version_report.as_ref().and_then(|r| r.game_version.clone()),
        recommended_extender_version: recommended.map(|b| b.extender_version.clone()),
        installed_extender_game_version: version_report
            .as_ref()
            .and_then(|r| r.installed_extender_game_version.clone()),
        version_compatible: version_report.as_ref().and_then(|r| r.compatible),
    })
}

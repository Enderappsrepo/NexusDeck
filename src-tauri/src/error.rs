use thiserror::Error;

#[derive(Error, Debug)]
pub enum NexusDeckError {
    #[error("Database error: {0}")]
    Database(#[from] rusqlite::Error),

    #[error("HTTP error: {0}")]
    Http(#[from] reqwest::Error),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Keyring error: {0}")]
    Keyring(String),

    #[error("Nexus API error ({status}): {message}")]
    NexusApi { status: u16, message: String },

    #[error("Rate limited until {reset_at}")]
    RateLimited { reset_at: String },

    #[error("Premium subscription required for API downloads")]
    PremiumRequired,

    #[error("Invalid API key")]
    InvalidApiKey,

    #[error("Game not found: {0}")]
    GameNotFound(String),

    #[error("Invalid game path: {0}")]
    InvalidGamePath(String),

    #[error("Archive error: {0}")]
    Archive(String),

    #[error("Download error: {0}")]
    Download(String),

    #[error("Not found: {0}")]
    NotFound(String),

    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("Steam not found: {0}")]
    SteamNotFound(String),

    #[error("Proton prefix missing: {0}")]
    ProtonPrefixMissing(String),

    #[error("F4SE not installed: {0}")]
    F4seNotInstalled(String),

    #[error("Game already running")]
    GameAlreadyRunning,

    #[error("Launch failed: {0}")]
    LaunchFailed(String),

    #[error("{0}")]
    Other(String),
}

impl serde::Serialize for NexusDeckError {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

pub type Result<T> = std::result::Result<T, NexusDeckError>;

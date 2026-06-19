#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct MergeOptions {
    pub overwrite: bool,
    pub dry_run: bool,
}

impl Default for MergeOptions {
    fn default() -> Self {
        Self {
            overwrite: false,
            dry_run: false,
        }
    }
}

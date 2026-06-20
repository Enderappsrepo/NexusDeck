use std::sync::Arc;

#[derive(Clone)]
pub struct MergeProgressEvent {
    pub files_done: usize,
    pub files_total: usize,
    pub current_file: String,
}

pub type MergeProgressFn = Arc<dyn Fn(MergeProgressEvent) + Send + Sync>;

#[derive(Clone)]
pub struct ExtractProgressEvent {
    pub percent: u8,
    pub files_done: u32,
    pub files_total: u32,
    pub current_file: Option<String>,
}

pub type ExtractProgressFn = Arc<dyn Fn(ExtractProgressEvent) + Send + Sync>;

#[derive(Clone)]
pub struct MergeOptions {
    pub overwrite: bool,
    pub dry_run: bool,
    pub on_progress: Option<MergeProgressFn>,
}

impl Default for MergeOptions {
    fn default() -> Self {
        Self {
            overwrite: false,
            dry_run: false,
            on_progress: None,
        }
    }
}

impl std::fmt::Debug for MergeOptions {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("MergeOptions")
            .field("overwrite", &self.overwrite)
            .field("dry_run", &self.dry_run)
            .field("on_progress", &self.on_progress.is_some())
            .finish()
    }
}

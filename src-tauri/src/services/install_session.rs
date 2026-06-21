use std::path::{Path, PathBuf};

use tauri::AppHandle;
use uuid::Uuid;

use crate::db::Profile;
use crate::error::Result;
use crate::services::install_log::{self, InstallLogger, LogLevel};

pub struct InstallSession {
    pub id: String,
    pub mod_name: String,
    pub nexus_mod_id: i64,
    pub nexus_file_id: i64,
    pub archive_path: PathBuf,
    pub profile: Profile,
    pub logger: InstallLogger,
    pub log_path: PathBuf,
    pub phase: String,
}

impl InstallSession {
    pub fn new(
        app: Option<AppHandle>,
        mod_name: String,
        nexus_mod_id: i64,
        nexus_file_id: i64,
        archive_path: PathBuf,
        profile: Profile,
    ) -> Result<Self> {
        let id = Uuid::new_v4().to_string();
        let logger = InstallLogger::new(id.clone(), &mod_name, app)?;
        let log_path = logger.log_path().to_path_buf();

        let header = install_log::build_install_header(
            &mod_name,
            nexus_mod_id,
            nexus_file_id,
            &archive_path,
            &profile,
        );
        logger.write_header(&header)?;
        logger.info("session", &format!("Install session started: {id}"));

        Ok(Self {
            id,
            mod_name,
            nexus_mod_id,
            nexus_file_id,
            archive_path,
            profile,
            logger,
            log_path,
            phase: "init".into(),
        })
    }

    pub fn set_phase(&mut self, phase: &str) {
        self.phase = phase.to_string();
        self.logger
            .debug("session", &format!("Phase → {phase}"));
    }

    pub fn info(&self, phase: &str, message: &str) {
        self.logger.info(phase, message);
    }

    pub fn warn(&self, phase: &str, message: &str) {
        self.logger.warn(phase, message);
    }

    pub fn error(&self, phase: &str, message: &str) {
        self.logger.error(phase, message);
    }

    pub fn debug(&self, phase: &str, message: &str) {
        self.logger.debug(phase, message);
    }

    pub fn log_ctx(
        &self,
        level: LogLevel,
        phase: &str,
        message: &str,
        context: serde_json::Value,
    ) {
        self.logger
            .log_with_context(level, phase, message, Some(context));
    }

    pub fn log_error_with_path(&self, phase: &str, err: &crate::error::NexusDeckError) {
        self.error(
            phase,
            &format!("{err} (log: {})", self.log_path.display()),
        );
    }

    pub fn archive_path(&self) -> &Path {
        &self.archive_path
    }
}

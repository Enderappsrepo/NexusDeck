use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::db::Profile;
use crate::error::{NexusDeckError, Result};
use crate::services::install_session::InstallSession;
use crate::services::mod_state::mod_backup_root;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum RollbackAction {
    Created,
    Overwritten,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RollbackEntry {
    pub dest: String,
    pub backup_path: Option<String>,
    pub action: RollbackAction,
}

pub struct RollbackJournal {
    mod_id: String,
    profile: Profile,
    pre_backup_root: PathBuf,
    entries: Vec<RollbackEntry>,
}

impl RollbackJournal {
    pub fn new(profile: &Profile, mod_id: &str) -> Self {
        Self {
            mod_id: mod_id.to_string(),
            profile: profile.clone(),
            pre_backup_root: mod_backup_root(profile, mod_id).join("pre_install"),
            entries: Vec::new(),
        }
    }

    pub fn pre_backup_overwrites(
        &mut self,
        deploy_paths: &[String],
        session: &mut InstallSession,
    ) -> Result<()> {
        session.set_phase("rollback");
        fs::create_dir_all(&self.pre_backup_root)?;

        for dest_str in deploy_paths {
            let dest = Path::new(dest_str);
            if !dest.is_file() {
                continue;
            }
            let rel = dest
                .strip_prefix(&self.profile.game_path)
                .or_else(|_| {
                    dest.strip_prefix(
                        Path::new(&self.profile.game_path).join("Data"),
                    )
                })
                .unwrap_or(dest.file_name().map(Path::new).unwrap_or(dest));

            let backup = self.pre_backup_root.join(rel);
            if let Some(parent) = backup.parent() {
                fs::create_dir_all(parent)?;
            }
            fs::copy(dest, &backup)?;
            session.info(
                "rollback",
                &format!(
                    "Pre-backup: {} → {}",
                    dest.display(),
                    backup.display()
                ),
            );
            self.entries.push(RollbackEntry {
                dest: dest_str.clone(),
                backup_path: Some(backup.display().to_string()),
                action: RollbackAction::Overwritten,
            });
        }
        Ok(())
    }

    pub fn record_created(&mut self, dest: &str) {
        self.entries.push(RollbackEntry {
            dest: dest.to_string(),
            backup_path: None,
            action: RollbackAction::Created,
        });
    }

    pub fn sync_from_manifest(&mut self, manifest_files: &[String]) {
        let overwrite_dests: std::collections::HashSet<String> = self
            .entries
            .iter()
            .map(|e| e.dest.clone())
            .collect();
        for file in manifest_files {
            if !overwrite_dests.contains(file) {
                self.record_created(file);
            }
        }
    }

    pub fn rollback(&self, session: &mut InstallSession) -> Result<()> {
        session.warn("rollback", "Rolling back partial install…");
        for entry in self.entries.iter().rev() {
            let dest = Path::new(&entry.dest);
            match entry.action {
                RollbackAction::Created => {
                    if dest.is_file() {
                        let _ = fs::remove_file(dest);
                        session.info(
                            "rollback",
                            &format!("Removed created file: {}", dest.display()),
                        );
                    }
                }
                RollbackAction::Overwritten => {
                    if let Some(ref backup) = entry.backup_path {
                        let backup_path = Path::new(backup);
                        if backup_path.is_file() {
                            if let Some(parent) = dest.parent() {
                                fs::create_dir_all(parent)?;
                            }
                            fs::copy(backup_path, dest)?;
                            session.info(
                                "rollback",
                                &format!("Restored: {}", dest.display()),
                            );
                        }
                    }
                }
            }
        }
        let _ = fs::remove_dir_all(&self.pre_backup_root);
        Ok(())
    }

    pub fn finalize_backups(&self, session: &mut InstallSession) -> Result<()> {
        let final_root = mod_backup_root(&self.profile, &self.mod_id);
        fs::create_dir_all(&final_root)?;

        for entry in &self.entries {
            if let RollbackAction::Overwritten = entry.action {
                if let Some(ref backup) = entry.backup_path {
                    let backup_path = Path::new(backup);
                    if !backup_path.is_file() {
                        continue;
                    }
                    let dest = Path::new(&entry.dest);
                    let rel = backup_path
                        .strip_prefix(&self.pre_backup_root)
                        .unwrap_or(backup_path.file_name().map(Path::new).unwrap_or(backup_path));
                    let final_backup = final_root.join(rel);
                    if let Some(parent) = final_backup.parent() {
                        fs::create_dir_all(parent)?;
                    }
                    if !final_backup.exists() {
                        fs::copy(backup_path, &final_backup)?;
                    }
                    session.debug(
                        "rollback",
                        &format!(
                            "Finalized backup: {} for {}",
                            final_backup.display(),
                            dest.display()
                        ),
                    );
                }
            }
        }

        let _ = fs::remove_dir_all(&self.pre_backup_root);
        Ok(())
    }
}

pub fn deploy_with_rollback<F>(
    session: &mut InstallSession,
    profile: &Profile,
    mod_id: &str,
    deploy_paths: &[String],
    deploy_fn: F,
) -> Result<(Vec<String>, crate::games::DeployPlan, Vec<crate::services::conflict::FileConflict>)>
where
    F: FnOnce() -> Result<(
        crate::games::InstallManifest,
        crate::games::DeployPlan,
        Vec<crate::services::conflict::FileConflict>,
    )>,
{
    let mut journal = RollbackJournal::new(profile, mod_id);
    journal.pre_backup_overwrites(deploy_paths, session)?;

    match deploy_fn() {
        Ok((manifest, plan, conflicts)) => {
            journal.sync_from_manifest(&manifest.files);
            journal.finalize_backups(session)?;
            Ok((manifest.files, plan, conflicts))
        }
        Err(e) => {
            session.error("deploy", &format!("Deploy failed: {e}"));
            if let Err(rb_err) = journal.rollback(session) {
                session.error(
                    "rollback",
                    &format!("Rollback also failed: {rb_err}"),
                );
            }
            Err(e)
        }
    }
}

pub fn compute_overwrite_targets(deploy_paths: &[String]) -> Vec<String> {
    deploy_paths
        .iter()
        .filter(|p| Path::new(p).is_file())
        .cloned()
        .collect()
}

pub fn ensure_deploy_not_empty(
    files: &[String],
    option_groups_len: usize,
    has_fomod: bool,
) -> Result<()> {
    if !files.is_empty() {
        return Ok(());
    }
    let message = if option_groups_len > 0 || has_fomod {
        "FOMOD selections did not match any files to install. Review your install options and try again.".into()
    } else {
        "No files were found to install from this archive.".into()
    };
    Err(NexusDeckError::Other(message))
}

export interface CompanionGame {
  domain: string;
  name: string;
  can_install: boolean;
}

export interface ModSummary {
  mod_id: number;
  name: string;
  author: string;
  summary?: string;
  picture_url?: string | null;
  endorsements?: number;
  mod_downloads?: number;
}

export interface ModFileInfo {
  file_id: number;
  name: string;
  file_name: string;
  version: string;
  is_primary: boolean;
  size_kb: number;
  category_name?: string;
}

export interface ModDetail extends ModSummary {
  description_html?: string;
  category?: string;
  version?: string;
  updated_timestamp?: number;
  tags?: string[];
  hero_image_url?: string | null;
}

export interface FomodFlag {
  name: string;
  value: string;
}

export interface FomodCondition {
  operator?: string;
  flags: FomodFlag[];
}

export interface InstallOptionChoice {
  id: string;
  label: string;
  description?: string | null;
  default: boolean;
  condition_flags?: FomodFlag[];
}

export interface InstallOptionGroup {
  id: string;
  name: string;
  selection_type: string;
  options: InstallOptionChoice[];
  condition?: FomodCondition | null;
}

export interface InstallWizardStep {
  id: string;
  name: string;
  description?: string | null;
  groups: InstallOptionGroup[];
  condition?: FomodCondition | null;
}

export interface InstallWizard {
  module_name?: string | null;
  steps: InstallWizardStep[];
}

export interface SelectedInstallOption {
  group_id: string;
  option_ids: string[];
}

export interface StrategyOption {
  id: string;
  label: string;
  description: string;
}

/** What "Automatic" resolved to for this archive (where files will land). */
export interface DetectedDeployPlan {
  strategy: string;
  label: string;
  description: string;
  target: string;
}

export interface CompanionPreparePayload {
  option_groups: InstallOptionGroup[];
  default_selections: SelectedInstallOption[];
  install_wizard: InstallWizard | null;
  install_wizard_required: boolean;
  strategies: StrategyOption[];
  detected?: DetectedDeployPlan | null;
}

export interface InstallDownloadProgress {
  progress_pct: number;
  bytes_done: number;
  bytes_total: number;
  eta_seconds?: number | null;
}

export interface InstallSessionStatus {
  session_id: string;
  status: string;
  message: string;
  progress?: InstallDownloadProgress | null;
  prepare?: CompanionPreparePayload;
  error?: string;
}

export interface GameEssentialsManifest {
  id: string;
  domain: string;
  display_name: string;
  description: string;
  setup_steps: { id: string; label: string }[];
  mods: {
    id: string;
    name: string;
    nexus_mod_id: number;
    required: boolean;
    optional: boolean;
    description?: string | null;
  }[];
}

export interface GameEssentialModStatus {
  id: string;
  name: string;
  installed: boolean;
  downloading: boolean;
  optional: boolean;
}

export interface QueuedEssentialMod {
  essential_id: string;
  download: { id: string; mod_name: string; status: string };
}

export interface DiscoveryFeeds {
  featured: ModSummary[];
  top_endorsed: ModSummary[];
  most_downloaded: ModSummary[];
  trending: ModSummary[];
  newly_added: ModSummary[];
  recently_updated: ModSummary[];
  hot_this_week: ModSummary[];
}

export interface CompanionInstalledMod {
  id: string;
  nexus_mod_id: number;
  name: string;
  version?: string | null;
  enabled: boolean;
  sort_order: number;
  installed_at: number;
}

export interface UninstallResult {
  removed_files: number;
  restored_shared_files: number;
  warnings: string[];
}

export const EMPTY_DISCOVERY: DiscoveryFeeds = {
  featured: [],
  top_endorsed: [],
  most_downloaded: [],
  trending: [],
  newly_added: [],
  recently_updated: [],
  hot_this_week: [],
};

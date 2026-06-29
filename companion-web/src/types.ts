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

export interface CompanionPreparePayload {
  option_groups: InstallOptionGroup[];
  default_selections: SelectedInstallOption[];
  install_wizard: InstallWizard | null;
  install_wizard_required: boolean;
  strategies: StrategyOption[];
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

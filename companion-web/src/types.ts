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

export interface ModSearchFilters {
  category?: string | null;
  tags: string[];
  min_endorsements?: number | null;
  hide_adult: boolean;
  updated_since_days?: number | null;
  author?: string | null;
}

export interface ModSearchResult {
  mods: ModSummary[];
  total_count: number;
}

export interface ModCategory {
  category_id: number;
  name: string;
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
  image_path?: string | null;
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
  module_image_path?: string | null;
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
  conflicts?: FileConflict[];
}

export interface InstallDownloadProgress {
  progress_pct: number;
  bytes_done: number;
  bytes_total: number;
  eta_seconds?: number | null;
  /** Current phase: downloading, extracting, deploying, etc. */
  stage?: string;
  files_done?: number;
  files_total?: number;
  current_file?: string | null;
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
  rising_stars: ModSummary[];
  newly_added: ModSummary[];
  recently_updated: ModSummary[];
  hot_this_week: ModSummary[];
  community_favorites: ModSummary[];
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
  rising_stars: [],
  newly_added: [],
  recently_updated: [],
  hot_this_week: [],
  community_favorites: [],
};

export interface FileConflict {
  path: string;
  existing_mod: string;
  new_mod: string;
}

export interface LootPluginIssue {
  code: string;
  plugin?: string | null;
  message: string;
  severity: string;
}

export interface LoadOrderModEntry {
  id: string;
  name: string;
  enabled: boolean;
  sort_order: number;
  plugins: string[];
}

export interface LoadOrderPluginEntry {
  name: string;
  kind: string;
  enabled: boolean;
  mod_id?: string | null;
  mod_name?: string | null;
}

export interface LoadOrderState {
  mods: LoadOrderModEntry[];
  plugins: LoadOrderPluginEntry[];
  plugins_txt_path?: string | null;
  plugins_txt_ready: boolean;
  active_plugin_count: number;
  message: string;
  loot_issues: LootPluginIssue[];
}

export interface CompanionDownloadRecord {
  id: string;
  game_domain: string;
  mod_id: number;
  file_id: number;
  mod_name: string;
  bytes_done: number;
  bytes_total: number;
  status: string;
  progress_pct: number;
}

export interface ModUpdateInfo {
  installed_mod_id: string;
  nexus_mod_id: number;
  name: string;
  installed_version?: string | null;
  latest_version: string;
  latest_file_id: number;
  changelog_available: boolean;
}

export interface UpdateJob {
  download_id: string;
  installed_mod_id: string;
}

export interface UpdateBatchResult {
  queued: string[];
  skipped: string[];
  errors: string[];
}

export interface CollectionSummary {
  name: string;
  slug: string;
  summary?: string | null;
  mod_count: number;
  author: string;
  revision_number: number;
}

export interface CollectionModEntry {
  mod_id: number;
  file_id?: number | null;
  name: string;
  optional: boolean;
  version: string;
}

export interface CollectionDetail {
  name: string;
  slug: string;
  author: string;
  mod_count: number;
  mods: CollectionModEntry[];
}

export interface CollectionModDiffEntry {
  mod_id: number;
  name: string;
  optional: boolean;
  status: string;
  collection_version: string;
  installed_version?: string | null;
  installed_mod_id?: string | null;
  collection_file_id?: number | null;
  installed_file_id?: number | null;
}

export interface CollectionDiffResult {
  installed_count: number;
  total_count: number;
  missing_count: number;
  outdated_count: number;
  wrong_file_count: number;
  mods: CollectionModDiffEntry[];
}

export interface CompanionCollectionDetail {
  detail: CollectionDetail;
  diff: CollectionDiffResult;
}

export interface CollectionInstallQueued {
  mod_id: number;
  mod_name: string;
  download_id: string;
}

export interface CompanionDeviceSettings {
  app_version: string;
  nexus_configured: boolean;
  receive_enabled: boolean;
  download_settings: {
    max_concurrent: number;
    speed_limit_kbps: number;
    auto_install_after_download?: boolean;
  };
  auto_sort_after_install: boolean;
  companion_api: number;
}

export interface SyncActionResult {
  ok: boolean;
  message: string;
}

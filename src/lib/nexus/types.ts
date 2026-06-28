export interface FileConflict {
  path: string;
  existing_mod: string;
  new_mod: string;
}

export interface DeployPlan {
  strategy: string;
  source_subpath?: string | null;
  target: string;
  requires_confirmation: boolean;
  description: string;
}

export interface ArchiveEntry {
  path: string;
  is_dir: boolean;
  size: number;
}

export interface StrategyOption {
  id: string;
  label: string;
  description: string;
}

export type InstallOptionSelectionType =
  | "select_one"
  | "select_at_most_one"
  | "select_any"
  | "select_at_least_one";

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
  folder_prefixes: string[];
  image_path?: string | null;
  default: boolean;
  condition_flags?: FomodFlag[];
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

export interface InstallOptionGroup {
  id: string;
  name: string;
  selection_type: InstallOptionSelectionType;
  options: InstallOptionChoice[];
  condition?: FomodCondition | null;
}

export interface SelectedInstallOption {
  group_id: string;
  option_ids: string[];
}

export interface InstallOptions {
  strategy: string;
  enable_mod: boolean;
  overwrite_files: boolean;
  selected_options?: SelectedInstallOption[];
  prepared_extract_dir?: string | null;
  wizard_hash?: string | null;
  dry_run?: boolean;
}

export interface InstallLogEvent {
  session_id: string;
  ts: string;
  level: "DEBUG" | "INFO" | "WARN" | "ERROR";
  phase: string;
  message: string;
}

export interface LogFileInfo {
  path: string;
  name: string;
  size_bytes: number;
  modified_at: string;
  kind: string;
}

export interface FomodWizardState {
  wizard: InstallWizard;
  active_flags: Record<string, string>;
}

export interface InstallPreview {
  entries: ArchiveEntry[];
  deploy_files: string[];
  plan: DeployPlan;
  conflicts: FileConflict[];
  file_count: number;
  skipped_existing: number;
  strategies: StrategyOption[];
  archive_folders: string[];
  option_groups: InstallOptionGroup[];
  default_selections: SelectedInstallOption[];
  install_wizard_required?: boolean;
  install_wizard?: InstallWizard | null;
  option_file_counts?: Record<string, number>;
}

export interface InstallPrepareResult {
  prepared_extract_dir: string;
  option_groups: InstallOptionGroup[];
  default_selections: SelectedInstallOption[];
  entry_count: number;
  archive_folders: string[];
  install_wizard?: InstallWizard | null;
}

export interface InstallProgress {
  profile_id: string;
  mod_name: string;
  phase: "preview" | "install" | string;
  stage: string;
  message: string;
  files_done: number;
  files_total: number;
  current_file?: string | null;
}

export interface StagingFile {
  name: string;
  path: string;
  size: number;
  modified_at: number;
}

export interface NexusBrowserUrls {
  mod_page: string;
  files_tab: string;
  file_page?: string | null;
  premium_info_url: string;
  notes: string;
}

export interface ScriptExtenderInstallInfo {
  domain: string;
  label: string;
  download_url?: string | null;
  website_url: string;
  runtime: string;
  notes: string;
  supports_auto_download: boolean;
  supports_steam_launcher_patch: boolean;
  game_version?: string | null;
  recommended_extender_version?: string | null;
  installed_extender_game_version?: string | null;
  version_compatible?: boolean | null;
}

/** @deprecated Use ScriptExtenderInstallInfo */
export type F4seInstallInfo = Pick<
  ScriptExtenderInstallInfo,
  "download_url" | "website_url" | "runtime" | "notes"
>;

export interface NexusUser {
  user_id: number;
  name: string;
  is_premium: boolean;
  is_supporter: boolean;
}

export interface Profile {
  id: string;
  game_domain: string;
  name: string;
  game_path: string;
  staging_path: string;
  proton_prefix_path?: string | null;
  mod_manager?: string | null;
  created_at: number;
}

export interface GameCandidate {
  app_id: number;
  name: string;
  install_path: string;
  library_path: string;
  proton_prefix_path?: string | null;
}

export interface GameSummary {
  id: number;
  name: string;
  domain_name: string;
  mod_count?: number | null;
  genre?: string | null;
  tile_url?: string | null;
  hero_url?: string | null;
}

export interface GameListPage {
  games: GameSummary[];
  total_count: number;
}

export interface ModSummary {
  mod_id: number;
  name: string;
  summary: string;
  picture_url?: string | null;
  author: string;
  endorsements: number;
  mod_downloads: number;
  updated_timestamp: number;
  version: string;
  adult_content?: boolean;
}

export interface ModDetail {
  mod_id: number;
  name: string;
  summary: string;
  description_html: string;
  author: string;
  uploader: string;
  category: string;
  endorsements: number;
  mod_downloads: number;
  updated_timestamp: number;
  version: string;
  picture_url?: string | null;
  hero_image_url?: string | null;
  tags: string[];
  screenshots: string[];
  adult_content: boolean;
  game_id: number;
  game_domain: string;
  viewer_endorsed: boolean;
  viewer_tracked: boolean;
}

export interface ModFileInfo {
  file_id: number;
  name: string;
  file_name: string;
  version: string;
  category_name: string;
  is_primary: boolean;
  size_kb: number;
}

/** Actual on-disk archive name from Nexus (includes .7z / .zip). */
export function modFileDownloadName(file: ModFileInfo): string {
  const archive = file.file_name?.trim();
  return archive || file.name;
}

export interface InstalledMod {
  id: string;
  profile_id: string;
  nexus_mod_id: number;
  nexus_file_id?: number | null;
  name: string;
  version?: string | null;
  enabled: boolean;
  sort_order?: number;
  installed_files_json: string;
  installed_at: number;
  category?: string;
  tags_json?: string;
  plugins_json?: string;
  install_options_json?: string;
}

export interface UninstallResult {
  removed_files: number;
  restored_shared_files: number;
  warnings: string[];
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

export interface ModUpdateProgress {
  installed_mod_id: string;
  phase: string;
  message: string;
}

export interface DownloadProgress {
  id: string;
  game_domain: string;
  mod_id: number;
  file_id: number;
  file_name: string;
  bytes_done: number;
  bytes_total: number;
  status: string;
  dest_path: string;
  mod_name?: string;
  profile_id?: string;
  update_target_mod_id?: string;
  auto_install?: boolean;
  queue_position?: number;
}

export interface DownloadRecord {
  id: string;
  game_domain: string;
  mod_id: number;
  file_id: number;
  url: string;
  dest_path: string;
  bytes_done: number;
  bytes_total: number;
  status: string;
  created_at: number;
  mod_name: string;
  profile_id: string;
  update_target_mod_id?: string;
}

export function downloadRecordToProgress(record: DownloadRecord): DownloadProgress {
  const fileName =
    (record.dest_path.split(/[/\\]/).pop() ?? record.mod_name) || "download";
  return {
    id: record.id,
    game_domain: record.game_domain,
    mod_id: record.mod_id,
    file_id: record.file_id,
    file_name: fileName,
    bytes_done: record.bytes_done,
    bytes_total: record.bytes_total,
    status: record.status,
    dest_path: record.dest_path,
    mod_name: record.mod_name,
    profile_id: record.profile_id,
    update_target_mod_id: record.update_target_mod_id,
  };
}

export interface DownloadSettings {
  max_concurrent: number;
  speed_limit_kbps: number;
  auto_install_after_download?: boolean;
  pause_on_battery?: boolean;
  bandwidth_saver?: boolean;
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

export interface ModCompareSide {
  name: string;
  source: string;
  file_count: number;
  plugin_count: number;
}

export interface OverlapEntry {
  path: string;
  severity: string;
  is_plugin: boolean;
}

export interface ModCompareResult {
  mod_a: ModCompareSide;
  mod_b: ModCompareSide;
  overlapping_paths: OverlapEntry[];
  conflicts_with_installed: FileConflict[];
  unique_to_a: number;
  unique_to_b: number;
}

export interface RawRequirement {
  mod_id: number;
  name: string;
  game_domain: string;
  optional: boolean;
}

export interface ModRequirement {
  mod_id: number;
  name: string;
  game_domain: string;
  optional: boolean;
  installed: boolean;
  downloaded: boolean;
}

export interface DependencyNode {
  mod_id: number;
  parent_mod_id: number | null;
  depth: number;
  installed: boolean;
  downloaded: boolean;
  requirements: RawRequirement[];
}

export interface DependencyGraph {
  root_mod_id: number;
  nodes: DependencyNode[];
  missing_required: ModRequirement[];
  cycles: number[][];
}

export interface PreviewNode {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
  children: PreviewNode[];
  previewable: boolean;
}

export interface PreviewFileResult {
  path: string;
  mime_type: string;
  data: number[];
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
  file_id: number | null;
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

export interface CollectionModInput {
  mod_id: number;
  file_id?: number | null;
  name: string;
  optional: boolean;
  version: string;
}

export interface CollectionModDiffEntry {
  mod_id: number;
  name: string;
  optional: boolean;
  status: "missing" | "installed" | "outdated" | "wrong_file" | string;
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

export interface ModSafetyReport {
  safe: boolean;
  severity: string;
  warnings: string[];
  plugin_count: number;
  has_scripts: boolean;
}

export interface OrphanFileEntry {
  path: string;
  size_bytes: number;
}

export interface DuplicateFileEntry {
  path: string;
  mods: string[];
}

export interface DeployScanResult {
  orphan_files: OrphanFileEntry[];
  duplicate_files: DuplicateFileEntry[];
  orphan_count: number;
  duplicate_count: number;
}

export interface ProfileConflictSummary {
  total_conflicts: number;
  affected_mods: string[];
  conflicts: FileConflict[];
}

export interface TextureBudgetReport {
  loose_file_count: number;
  loose_bytes: number;
  texture_count: number;
  mesh_count: number;
  estimated_vram_mb: number;
  recommendation: string;
}

export interface ModLoadout {
  id: string;
  name: string;
  enabled_mod_ids: string[];
  sort_orders: Record<string, number>;
  created_at: number;
}

export interface ModUpdateInfo {
  installed_mod_id: string;
  nexus_mod_id: number;
  name: string;
  installed_version: string | null;
  latest_version: string;
  latest_file_id: number;
  changelog_available: boolean;
}

export interface UpdatedModEntry {
  mod_id: number;
  name: string;
  updated_timestamp: number;
}

export interface AdvisorFinding {
  rule_id: string;
  severity: string;
  message: string;
  deck_tip: string | null;
  affected_mods: string[];
}

export interface ModlistExport {
  format: string;
  content: string;
}

export interface UserEndorsement {
  game_domain: string;
  mod_id: number;
  version: string;
}

export interface TrackedMod {
  game_domain: string;
  mod_id: number;
  name: string;
}

export interface WizardStepResult {
  step: string;
  success: boolean;
  data: unknown;
  message: string;
}

export interface ScriptExtenderStatus {
  installed: boolean;
  version?: string | null;
  loader_path?: string | null;
  message: string;
  game_version?: string | null;
  extender_game_version?: string | null;
  recommended_extender_version?: string | null;
  version_compatible?: boolean | null;
  scripts_installed?: boolean | null;
}

export interface BethesdaAudioStatus {
  applicable: boolean;
  ready: boolean;
  dll_override_applied: boolean;
  xact_installed: boolean;
  message?: string | null;
  log_path?: string | null;
}

export interface SupportedGameInfo {
  domain: string;
  display_name: string;
  script_extender_label?: string | null;
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

export interface LootPluginIssue {
  code: string;
  plugin?: string | null;
  message: string;
  severity: string;
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

export interface LibraryRescanResult {
  mods_added: number;
  plugins_found: number;
  message: string;
}

export interface LibraryReconcileResult {
  restored: number;
  mirrored: number;
  message: string;
}

export interface PluginsSyncResult {
  path: string;
  plugin_count: number;
  plugins: string[];
}

export interface InstallResult {
  mod?: InstalledMod;
  plan: DeployPlan;
  conflicts: FileConflict[];
  files_installed: number;
  log_path?: string;
  session_id?: string;
  dry_run?: boolean;
  files_planned?: number;
  archive_invalidation?: boolean;
}

export interface LaunchConfig {
  id: string;
  profile_id: string;
  name: string;
  use_f4se: boolean;
  launch_method: string;
  custom_executable?: string | null;
  args_json: string;
  pre_launch_actions_json: string;
  is_default: boolean;
  last_used_at?: number | null;
  created_at: number;
}

export interface LaunchCheckItem {
  code: string;
  message: string;
  severity: string;
}

export interface LaunchValidationResult {
  blockers: LaunchCheckItem[];
  warnings: LaunchCheckItem[];
}

export interface GameRunningState {
  running: boolean;
  waiting?: boolean;
  profile_id: string;
  pid?: number | null;
  started_at?: number | null;
  config_id?: string | null;
}

export interface LaunchOptions {
  skip_validation?: boolean;
  safe_launch?: boolean;
  sync_plugins?: boolean;
  extra_args?: string[];
}

export interface LaunchResult {
  success: boolean;
  message: string;
  method: string;
  history_id: string;
}

export interface LaunchSettings {
  always_ask_before_launch: boolean;
  close_app_after_launch: boolean;
  hide_on_launch: boolean;
  gamescope_handoff: boolean;
  safe_launch_default: boolean;
  default_deck_args: boolean;
  global_launch_hotkey?: string | null;
}

export interface PlaytimeStats {
  total_secs: number;
  last_played_at?: number | null;
  session_count: number;
}

export interface EssentialFixStep {
  id: string;
  label: string;
  remedy_id?: string | null;
}

export interface EssentialFixesManifest {
  id: string;
  domain: string;
  display_name: string;
  steps: EssentialFixStep[];
}

export interface EssentialFixStepResult {
  id: string;
  label: string;
  success: boolean;
  skipped: boolean;
  message: string;
}

export interface EssentialFixesResult {
  steps: EssentialFixStepResult[];
}

export interface BodySlideInfo {
  installed: boolean;
  exe_path?: string | null;
  working_dir?: string | null;
  expected_path?: string | null;
  found_at?: string | null;
}

export interface BodySetupStep {
  id: string;
  label: string;
  status: string;
  description?: string | null;
}

export interface BodySetupStatus {
  applicable: boolean;
  cbbe_installed: boolean;
  bodyslide_installed: boolean;
  bodyslide_exe?: string | null;
  presets_built: boolean;
  steps: BodySetupStep[];
  nexus_bodyslide_url?: string | null;
  nexus_mod_id?: number | null;
  mod_name?: string | null;
  can_one_click_install?: boolean;
  outfit_studio_available?: boolean;
  nexus_cbbe_url?: string | null;
  cbbe_mod_id?: number | null;
  cbbe_mod_name?: string | null;
  can_one_click_cbbe?: boolean;
  bodyslide_game_data_path?: string | null;
  bodyslide_linux_data_path?: string | null;
  bodyslide_config_ready?: boolean;
  bodyslide_browse_hint?: string | null;
  bodyslide_preset_file_count?: number;
  bodyslide_uses_z_drive?: boolean;
  bodyslide_path_warning?: string | null;
}

export interface InstallPreset {
  strategy: string;
  autoConfirm?: boolean;
  fomodPreset?: "cbbe_deck";
}

export interface RepairResult {
  mods_processed: number;
  files_relocated: number;
  warnings: string[];
}

export interface DeployMode {
  hardlink: boolean;
  work_dir: string;
}

export interface SteamShortcutInfo {
  id: string;
  profile_id: string;
  config_id: string;
  display_name: string;
  steam_uri: string;
  app_id_generated?: number | null;
  created_at: number;
}

export interface SteamInputInstallResult {
  installed: boolean;
  template_path: string | null;
  configset_path: string | null;
  message: string;
}

export interface NexusDeckSteamShortcutResult {
  display_name: string;
  executable: string;
  launch_options: string;
  shortcuts_path: string;
  app_id_generated: number;
  already_existed: boolean;
  launch_method: string;
  steam_input?: SteamInputInstallResult | null;
}

export interface PlatformInfo {
  os: string;
  is_linux: boolean;
  is_steam_deck: boolean;
  is_flatpak: boolean;
  steamos_version: string | null;
  app_version: string;
}

export type HardwareAccelerationMode = "on" | "off";

export interface AppPrefs {
  hardware_acceleration: HardwareAccelerationMode;
}

export type SevenZipSource = "system" | "bundled" | "host";

export interface SevenZipInfo {
  available: boolean;
  source: SevenZipSource | null;
  path: string | null;
  message: string;
}

export interface DeckyHostStatus {
  available: boolean;
  decky_installed: boolean;
  decky_home: string | null;
  plugin_installed: boolean;
  plugin_version: string | null;
  plugin_loader_active: boolean;
  bundled_plugin_present: boolean;
  message: string;
}

export interface DeckyHostInstallResult {
  success: boolean;
  message: string;
  needs_decky_restart: boolean;
  manual_steps: string[];
}

export interface GameSettingOption {
  value: string;
  label: string;
}

export interface GameSettingRange {
  min: number;
  max: number;
  step: number;
  unit?: string | null;
}

export interface GameSettingDefinition {
  id: string;
  label: string;
  description: string;
  file_kind: string;
  section: string;
  key: string;
  kind: string;
  category: string;
  options?: GameSettingOption[] | null;
  range?: GameSettingRange | null;
}

export interface GameSettingsPreset {
  id: string;
  label: string;
  description: string;
}

export interface GameSettingsSchema {
  config_dir: string;
  settings: GameSettingDefinition[];
  presets: GameSettingsPreset[];
}

export interface GameSettingsValues {
  config_dir: string;
  values: Record<string, string>;
}

export interface ApplyGameSettingsResult {
  config_dir: string;
  backup_dir: string;
  applied: string[];
}

export interface ResetProfileResult {
  mods_removed: number;
  downloads_cleared: number;
  staging_cleared: boolean;
  plugins_txt_reset: boolean;
  backup_path: string | null;
  warnings: string[];
}

export interface AppResetResult {
  database_cleared: boolean;
  api_key_cleared: boolean;
  cache_cleared: boolean;
  onboarding_reset: boolean;
}

export interface AppUninstallResult {
  data_cleared: boolean;
  staging_cleared: boolean;
  cache_cleared: boolean;
  steam_shortcut_removed: boolean;
  uninstall_scheduled: boolean;
  message: string;
}

export interface AppUpdateInfo {
  current_version: string;
  latest_version: string;
  minimum_version: string | null;
  update_available: boolean;
  update_required: boolean;
  message: string;
  release_url: string;
  release_notes: string | null;
}

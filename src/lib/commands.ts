import { invoke } from "@tauri-apps/api/core";
import type {
  AdvisorFinding,
  CollectionDetail,
  CollectionSummary,
  DependencyGraph,
  DownloadProgress,
  DownloadRecord,
  DownloadSettings,
  F4seInstallInfo,
  ScriptExtenderInstallInfo,
  GameCandidate,
  GameSummary,
  InstallOptions,
  InstallPreview,
  InstallResult,
  InstalledMod,
  LaunchConfig,
  LaunchOptions,
  LaunchResult,
  LaunchSettings,
  GameRunningState,
  LaunchValidationResult,
  PlaytimeStats,
  SteamShortcutInfo,
  NexusDeckSteamShortcutResult,
  GameSettingsSchema,
  GameSettingsValues,
  ApplyGameSettingsResult,
  ModCategory,
  ModCompareResult,
  ModDetail,
  ModFileInfo,
  ModlistExport,
  ModSearchFilters,
  ModSearchResult,
  ModSummary,
  ModUpdateInfo,
  NexusBrowserUrls,
  NexusUser,
  PlatformInfo,
  PreviewFileResult,
  PreviewNode,
  Profile,
  ScriptExtenderStatus,
  SupportedGameInfo,
  StagingFile,
  StrategyOption,
  TrackedMod,
  UpdatedModEntry,
  UserEndorsement,
  WizardStepResult,
} from "@/lib/nexus/types";

export const api = {
  validateAndStoreApiKey: (key: string) =>
    invoke<NexusUser>("validate_and_store_api_key", { key }),

  loadStoredApiKey: () => invoke<NexusUser | null>("load_stored_api_key"),

  checkHasApiKey: () => invoke<boolean>("check_has_api_key"),

  clearApiKey: () => invoke<void>("clear_api_key"),

  detectSteamInstall: () =>
    invoke<{ steam_path: string; library_folders: string[] } | null>(
      "detect_steam_install"
    ),

  detectGame: (domain: string) =>
    invoke<GameCandidate[]>("detect_game", { domain }),

  validateGamePath: (domain: string, path: string) =>
    invoke<void>("validate_game_path", { domain, path }),

  runWizardStep: (domain: string, step: string, payload: unknown) =>
    invoke<WizardStepResult>("run_wizard_step", { domain, step, payload }),

  createProfile: (params: {
    gameDomain: string;
    name: string;
    gamePath: string;
    stagingPath: string;
    protonPrefixPath?: string | null;
  }) =>
    invoke<Profile>("create_profile", {
      gameDomain: params.gameDomain,
      name: params.name,
      gamePath: params.gamePath,
      stagingPath: params.stagingPath,
      protonPrefixPath: params.protonPrefixPath ?? null,
    }),

  listProfiles: () => invoke<Profile[]>("list_profiles"),

  getProfile: (domain: string) =>
    invoke<Profile | null>("get_profile", { domain }),

  isOnboardingComplete: () => invoke<boolean>("is_onboarding_complete"),

  completeOnboarding: () => invoke<void>("complete_onboarding"),

  getPlatformInfo: () => invoke<PlatformInfo>("get_platform_info"),

  searchMods: (
    gameDomain: string,
    query: string,
    sort: string,
    offset: number,
    count: number
  ) =>
    invoke<ModSummary[]>("search_mods", {
      gameDomain,
      query,
      sort,
      offset,
      count,
    }),

  searchModsFiltered: (
    gameDomain: string,
    query: string,
    sort: string,
    offset: number,
    count: number,
    filters: ModSearchFilters
  ) =>
    invoke<ModSearchResult>("search_mods_filtered", {
      gameDomain,
      query,
      sort,
      offset,
      count,
      filters,
    }),

  listModCategories: (gameDomain: string) =>
    invoke<ModCategory[]>("list_mod_categories", { gameDomain }),

  getTrendingMods: (gameDomain: string, count: number) =>
    invoke<ModSummary[]>("get_trending_mods", { gameDomain, count }),

  getModDetail: (gameDomain: string, modId: number) =>
    invoke<ModDetail>("get_mod_detail", { gameDomain, modId }),

  getModFiles: (gameDomain: string, modId: number) =>
    invoke<ModFileInfo[]>("get_mod_files", { gameDomain, modId }),

  listNexusGames: (query: string, count: number) =>
    invoke<GameSummary[]>("list_nexus_games", { query, count }),

  startModDownload: (params: {
    gameDomain: string;
    modId: number;
    fileId: number;
    fileName: string;
    stagingPath: string;
    expectedSizeKb: number;
    modName?: string;
    profileId?: string;
  }) =>
    invoke<DownloadProgress>("start_mod_download", {
      gameDomain: params.gameDomain,
      modId: params.modId,
      fileId: params.fileId,
      fileName: params.fileName,
      stagingPath: params.stagingPath,
      expectedSizeKb: params.expectedSizeKb,
      modName: params.modName ?? null,
      profileId: params.profileId ?? null,
    }),

  listDownloads: () => invoke<DownloadRecord[]>("list_downloads"),

  cancelDownload: (downloadId: string) =>
    invoke<void>("cancel_download", { downloadId }),

  retryDownload: (downloadId: string) =>
    invoke<DownloadProgress>("retry_download", { downloadId }),

  clearCompletedDownloads: () =>
    invoke<number>("clear_completed_downloads"),

  dismissDownload: (downloadId: string) =>
    invoke<void>("dismiss_download", { downloadId }),

  clearFailedDownloads: () =>
    invoke<number>("clear_failed_downloads"),

  getDownloadSettings: () =>
    invoke<DownloadSettings>("get_download_settings"),

  setDownloadSettings: (settings: DownloadSettings) =>
    invoke<void>("set_download_settings", { settings }),

  compareStagingArchives: (
    profileId: string,
    archiveA: string,
    archiveB: string
  ) =>
    invoke<ModCompareResult>("compare_staging_archives", {
      profileId,
      archiveA,
      archiveB,
    }),

  compareInstalledMods: (profileId: string, modAId: string, modBId: string) =>
    invoke<ModCompareResult>("compare_installed_mods", {
      profileId,
      modAId,
      modBId,
    }),

  compareModWithInstalled: (
    profileId: string,
    stagingArchive: string,
    installedModId: string
  ) =>
    invoke<ModCompareResult>("compare_mod_with_installed", {
      profileId,
      stagingArchive,
      installedModId,
    }),

  resolveModDependencies: (profileId: string, modId: number) =>
    invoke<DependencyGraph>("resolve_mod_dependencies", { profileId, modId }),

  queueMissingDependencies: (profileId: string, modId: number) =>
    invoke<string[]>("queue_missing_dependencies", { profileId, modId }),

  getArchiveFileTree: (profileId: string, archiveName: string) =>
    invoke<PreviewNode[]>("get_archive_file_tree", { profileId, archiveName }),

  previewArchiveFile: (
    profileId: string,
    archiveName: string,
    innerPath: string
  ) =>
    invoke<PreviewFileResult>("preview_archive_file", {
      profileId,
      archiveName,
      innerPath,
    }),

  listCollections: (gameDomain: string, offset: number, count: number) =>
    invoke<CollectionSummary[]>("list_collections", {
      gameDomain,
      offset,
      count,
    }),

  getCollectionDetail: (gameDomain: string, slug: string) =>
    invoke<CollectionDetail>("get_collection_detail", { gameDomain, slug }),

  checkProfileUpdates: (profileId: string) =>
    invoke<ModUpdateInfo[]>("check_profile_updates", { profileId }),

  updateModSafe: (profileId: string, installedModId: string) =>
    invoke<void>("update_mod_safe", { profileId, installedModId }),

  getUpdatedModsFeed: (gameDomain: string, period: string) =>
    invoke<UpdatedModEntry[]>("get_updated_mods_feed", { gameDomain, period }),

  endorseMod: (gameDomain: string, modId: number, version: string) =>
    invoke<void>("endorse_mod", { gameDomain, modId, version }),

  abstainMod: (gameDomain: string, modId: number) =>
    invoke<void>("abstain_mod", { gameDomain, modId }),

  getUserEndorsements: () =>
    invoke<UserEndorsement[]>("get_user_endorsements"),

  trackMod: (gameDomain: string, modId: number) =>
    invoke<void>("track_mod", { gameDomain, modId }),

  listTrackedMods: () => invoke<TrackedMod[]>("list_tracked_mods"),

  analyzeDeckProfile: (profileId: string) =>
    invoke<AdvisorFinding[]>("analyze_deck_profile", { profileId }),

  exportModlist: (profileId: string, format: string) =>
    invoke<ModlistExport>("export_modlist", { profileId, format }),

  installModFromArchive: (params: {
    profileId: string;
    modName: string;
    nexusModId: number;
    nexusFileId: number;
    archivePath: string;
    options: InstallOptions;
  }) =>
    invoke<InstallResult>("install_mod_from_archive", {
      profileId: params.profileId,
      modName: params.modName,
      nexusModId: params.nexusModId,
      nexusFileId: params.nexusFileId,
      archivePath: params.archivePath,
      options: params.options,
    }),

  previewModInstall: (params: {
    profileId: string;
    archivePath: string;
    modName: string;
    strategy: string;
  }) =>
    invoke<InstallPreview>("preview_mod_install", {
      profileId: params.profileId,
      archivePath: params.archivePath,
      modName: params.modName,
      strategy: params.strategy,
    }),

  getInstallStrategies: () => invoke<StrategyOption[]>("get_install_strategies"),

  detectF4se: (gamePath: string) =>
    invoke<ScriptExtenderStatus>("detect_f4se", { gamePath }),

  detectScriptExtender: (domain: string, gamePath: string) =>
    invoke<ScriptExtenderStatus>("detect_script_extender", { domain, gamePath }),

  listSupportedGames: () =>
    invoke<SupportedGameInfo[]>("list_supported_games"),

  installScriptExtender: (
    domain: string,
    gamePath: string,
    configureSteamLauncher: boolean
  ) =>
    invoke<ScriptExtenderStatus>("install_script_extender", {
      domain,
      gamePath,
      configureSteamLauncher,
    }),

  installScriptExtenderFromArchive: (
    domain: string,
    gamePath: string,
    archivePath: string,
    configureSteamLauncher: boolean
  ) =>
    invoke<ScriptExtenderStatus>("install_script_extender_from_archive", {
      domain,
      gamePath,
      archivePath,
      configureSteamLauncher,
    }),

  getScriptExtenderInstallInfo: (domain: string) =>
    invoke<ScriptExtenderInstallInfo>("get_script_extender_install_info", { domain }),

  installF4se: (gamePath: string, configureSteamLauncher: boolean) =>
    invoke<ScriptExtenderStatus>("install_f4se", {
      gamePath,
      configureSteamLauncher,
    }),

  installF4seFromArchive: (
    gamePath: string,
    archivePath: string,
    configureSteamLauncher: boolean
  ) =>
    invoke<ScriptExtenderStatus>("install_f4se_from_archive", {
      gamePath,
      archivePath,
      configureSteamLauncher,
    }),

  getF4seInstallInfo: () => invoke<F4seInstallInfo>("get_f4se_install_info"),

  resolveModArchivePath: (stagingPath: string, fileName: string) =>
    invoke<StagingFile>("resolve_mod_archive_path", { stagingPath, fileName }),

  listStagingArchives: (stagingPath: string) =>
    invoke<StagingFile[]>("list_staging_archives", { stagingPath }),

  createPracticeMod: (profileId: string) =>
    invoke<StagingFile>("create_practice_mod", { profileId }),

  getNexusBrowserUrls: (gameDomain: string, modId: number, fileId?: number) =>
    invoke<NexusBrowserUrls>("get_nexus_browser_urls", {
      gameDomain,
      modId,
      fileId: fileId ?? null,
    }),

  watchStagingReady: (stagingPath: string, fileName: string) =>
    invoke<boolean>("watch_staging_ready", { stagingPath, fileName }),

  listInstalledMods: (profileId: string) =>
    invoke<InstalledMod[]>("list_installed_mods", { profileId }),

  setModEnabled: (modId: string, enabled: boolean) =>
    invoke<void>("set_mod_enabled", { modId, enabled }),

  handleNxmUrl: (url: string) =>
    invoke<unknown>("handle_nxm_url", { url }),

  exportDiagnostics: () => invoke<string>("export_diagnostics"),

  backupProfile: (profileId: string, destPath: string) =>
    invoke<void>("backup_profile", { profileId, destPath }),

  restoreProfile: (srcPath: string) =>
    invoke<Profile>("restore_profile", { srcPath }),

  getAppPaths: () => invoke<{ config_dir: string; data_dir: string }>("get_app_paths"),

  listLaunchConfigs: (profileId: string) =>
    invoke<LaunchConfig[]>("list_launch_configs", { profileId }),

  saveLaunchConfig: (config: LaunchConfig) =>
    invoke<LaunchConfig>("save_launch_config", { config }),

  deleteLaunchConfig: (id: string) =>
    invoke<void>("delete_launch_config", { id }),

  getRecentLaunchConfigs: (profileId: string, limit = 5) =>
    invoke<LaunchConfig[]>("get_recent_launch_configs", { profileId, limit }),

  validateLaunch: (profileId: string, configId?: string | null) =>
    invoke<LaunchValidationResult>("validate_launch", {
      profileId,
      configId: configId ?? null,
    }),

  launchGame: (
    profileId: string,
    configId?: string | null,
    options?: LaunchOptions
  ) =>
    invoke<LaunchResult>("launch_game", {
      profileId,
      configId: configId ?? null,
      options: options ?? null,
    }),

  getGameRunningState: (profileId: string) =>
    invoke<GameRunningState>("get_game_running_state", { profileId }),

  stopGame: (profileId: string, graceful = true) =>
    invoke<void>("stop_game", { profileId, graceful }),

  syncPluginsTxt: (profileId: string) =>
    invoke<string>("sync_plugins_txt", { profileId }),

  createSafeLaunchBackup: (profileId: string) =>
    invoke<string[]>("create_safe_launch_backup", { profileId }),

  getLaunchSettings: () => invoke<LaunchSettings>("get_launch_settings"),

  setLaunchSettings: (settings: LaunchSettings) =>
    invoke<void>("set_launch_settings", { settings }),

  getPlaytimeStats: (profileId: string) =>
    invoke<PlaytimeStats>("get_playtime_stats", { profileId }),

  createSteamShortcut: (
    profileId: string,
    configId: string,
    name?: string,
    writeVdf?: boolean
  ) =>
    invoke<SteamShortcutInfo>("create_steam_shortcut", {
      profileId,
      configId,
      name: name ?? null,
      writeVdf: writeVdf ?? false,
    }),

  listSteamShortcuts: (profileId: string) =>
    invoke<SteamShortcutInfo[]>("list_steam_shortcuts", { profileId }),

  deleteSteamShortcut: (id: string) =>
    invoke<void>("delete_steam_shortcut", { id }),

  addNexusDeckToSteam: (name?: string) =>
    invoke<NexusDeckSteamShortcutResult>("add_nexusdeck_to_steam", { name: name ?? null }),

  getGameSettingsSchema: (profileId: string) =>
    invoke<GameSettingsSchema>("get_game_settings_schema", { profileId }),

  getGameSettingsValues: (profileId: string) =>
    invoke<GameSettingsValues>("get_game_settings_values", { profileId }),

  applyGameSettings: (profileId: string, values: Record<string, string>) =>
    invoke<ApplyGameSettingsResult>("apply_game_settings", { profileId, values }),

  applyGameSettingsPreset: (profileId: string, presetId: string) =>
    invoke<ApplyGameSettingsResult>("apply_game_settings_preset", {
      profileId,
      presetId,
    }),

  batchLaunchTools: (profileId: string, toolIds: string[]) =>
    invoke<string[]>("batch_launch_tools", { profileId, toolIds }),
};

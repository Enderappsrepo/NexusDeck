export interface DiagnosticFinding {
  id: string;
  severity: string;
  message: string;
  remedy_id: string | null;
  auto_fixable: boolean;
  deck_tip: string | null;
  context: Record<string, unknown>;
}

export interface DiagnosticScanResult {
  profile_id: string;
  game_domain: string;
  findings: DiagnosticFinding[];
  scanned_at: string;
}

export interface FixResult {
  remedy_id: string;
  applied: boolean;
  skipped: boolean;
  message: string;
  backup_path: string | null;
}

export interface ApplyFixesResult {
  results: FixResult[];
  backup_dir: string | null;
}

export interface RemedyDefinition {
  id: string;
  title: string;
  description: string;
  symptoms: string[];
  deck_tip: string | null;
  destructive: boolean;
  safe_auto: boolean;
}

export interface Mo2Status {
  installed: boolean;
  install_path: string | null;
  instance_path: string | null;
  message: string;
}

export interface PrefixStatus {
  exists: boolean;
  my_games_exists: boolean;
  prefix_path: string | null;
  size_mb: number;
  writable: boolean;
  message: string;
}

export interface ProtontricksInfo {
  available: boolean;
  command: string;
  message: string;
  kind: string;
}

export interface ProtonDepsResult {
  success: boolean;
  installed: string[];
  skipped: string[];
  failed: string[];
  message: string;
  failure_details: [string, string][];
  log_path?: string | null;
}

export interface DepsVerification {
  satisfied: boolean;
  present: string[];
  missing: string[];
  protontricks_available: boolean;
  checked_against_prefix: boolean;
}

export interface ProtonDepProgress {
  package: string;
  index: number;
  total: number;
  /** preparing | installing | done | failed | skipped */
  status: string;
  /** Human-readable step detail during preparing/installing */
  detail?: string | null;
}

export interface ProtontricksHealth {
  healthy: boolean;
  shortcuts_path: string | null;
  shortcuts_corrupted: boolean;
  backup_available: boolean;
  protontricks_responds: boolean;
  message: string;
}

export interface ProtontricksFixResult {
  success: boolean;
  action: string;
  message: string;
  shortcuts_path: string | null;
  log_path?: string | null;
}

export interface RepairStep {
  name: string;
  status: "ok" | "skipped" | "failed";
  detail: string;
}

export interface ProtontricksRepairResult {
  success: boolean;
  steps: RepairStep[];
  health: ProtontricksHealth;
  message: string;
  log_path?: string | null;
}

export interface ProtonLogLine {
  session_id: string;
  category: string;
  ts: string;
  level: "DEBUG" | "INFO" | "WARN" | "ERROR";
  phase: string;
  message: string;
}

export const PROTON_DEPS_PACKAGES: Record<string, string[]> = {
  skyrimspecialedition: ["vcrun2019", "dotnet48", "d3dx9_43", "xact", "xact_64", "xinput"],
  fallout4: ["vcrun2019", "dotnet48", "d3dx9_43", "xact", "xact_64", "xinput"],
};

export interface GameManifestEntry {
  domain: string;
  display_name: string;
  steam_app_id: number;
  knowledge_pack: string;
  proton_deps: string;
  deck_rules: string;
  load_order_rules: string;
  ini_presets: string | null;
  mod_managers: string[];
}

export interface SseEditInfo {
  installed: boolean;
  exe_path: string | null;
  working_dir: string | null;
}

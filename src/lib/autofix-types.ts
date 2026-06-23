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
}

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

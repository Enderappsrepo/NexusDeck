CREATE TABLE IF NOT EXISTS profiles (
    id TEXT PRIMARY KEY,
    game_domain TEXT NOT NULL,
    name TEXT NOT NULL,
    game_path TEXT NOT NULL,
    staging_path TEXT NOT NULL,
    proton_prefix_path TEXT,
    created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS installed_mods (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    nexus_mod_id INTEGER NOT NULL,
    nexus_file_id INTEGER,
    name TEXT NOT NULL,
    version TEXT,
    enabled INTEGER DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0,
    installed_files_json TEXT NOT NULL DEFAULT '[]',
    installed_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS downloads (
    id TEXT PRIMARY KEY,
    game_domain TEXT NOT NULL,
    mod_id INTEGER NOT NULL,
    file_id INTEGER NOT NULL,
    url TEXT NOT NULL,
    dest_path TEXT NOT NULL,
    bytes_done INTEGER DEFAULT 0,
    bytes_total INTEGER DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'queued',
    created_at INTEGER NOT NULL,
    mod_name TEXT DEFAULT '',
    profile_id TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS launch_configs (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    use_f4se INTEGER DEFAULT 1,
    launch_method TEXT DEFAULT 'steam',
    custom_executable TEXT,
    args_json TEXT DEFAULT '[]',
    pre_launch_actions_json TEXT DEFAULT '[]',
    is_default INTEGER DEFAULT 0,
    last_used_at INTEGER,
    created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS launch_history (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    config_id TEXT,
    started_at INTEGER NOT NULL,
    ended_at INTEGER,
    duration_secs INTEGER,
    success INTEGER
);

CREATE TABLE IF NOT EXISTS steam_shortcuts (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    config_id TEXT NOT NULL,
    display_name TEXT NOT NULL,
    app_id_generated INTEGER,
    created_at INTEGER NOT NULL
);

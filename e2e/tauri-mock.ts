export type MockHandler = (cmd: string, args: Record<string, unknown>) => unknown;

const defaultHandlers: Record<string, MockHandler> = {
  list_installed_mods: () => [
    {
      id: "mod-1",
      profile_id: "profile-1",
      nexus_mod_id: 123,
      name: "Test Mod Alpha",
      enabled: true,
      version: "1.0",
      installed_files_json: "[]",
      sort_order: 0,
    },
    {
      id: "mod-2",
      profile_id: "profile-1",
      nexus_mod_id: 456,
      name: "Test Mod Beta",
      enabled: false,
      version: "2.0",
      installed_files_json: "[]",
      sort_order: 1,
    },
  ],
  check_profile_updates: () => [],
  start_mod_download: () => ({
    id: "dl-1",
    game_domain: "skyrimspecialedition",
    mod_id: 789,
    file_id: 1,
    file_name: "test.7z",
    bytes_done: 0,
    bytes_total: 1024,
    status: "queued",
    dest_path: "/tmp/test.7z",
    mod_name: "Queued Mod",
    profile_id: "profile-1",
    update_target_mod_id: "",
    auto_install: false,
    queue_position: 1,
  }),
  is_onboarding_complete: () => true,
  list_downloads: () => [],
  get_download_settings: () => ({
    max_concurrent: 2,
    speed_limit_kbps: 0,
    auto_install_after_download: true,
  }),
};

export function createTauriInvokeMock(
  overrides: Record<string, MockHandler> = {}
): (cmd: string, args?: Record<string, unknown>) => Promise<unknown> {
  const handlers = { ...defaultHandlers, ...overrides };
  return async (cmd: string, args: Record<string, unknown> = {}) => {
    const handler = handlers[cmd];
    if (!handler) {
      throw new Error(`Unhandled invoke: ${cmd}`);
    }
    return handler(cmd, args);
  };
}

export function installTauriMock(pageHandlers?: Record<string, MockHandler>) {
  const invoke = createTauriInvokeMock(pageHandlers);
  (window as Window & { __TAURI_INTERNALS__?: { invoke: typeof invoke } }).__TAURI_INTERNALS__ =
    { invoke };
}

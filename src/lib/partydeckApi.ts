// Typed callable bindings for the backend. Shapes mirror the Rust DTOs in
// partydeck/src/cli.rs — keep them in sync.

import { callable } from "@decky/api";

export interface Profile {
  name: string;
}

export interface Handler {
  name: string;
  author: string;
  version: string;
  win: boolean;
  steam_appid: number | null;
}

export interface Device {
  path: string; // stable identity; scan order isn't hotplug-stable
  name: string;
  type: "gamepad" | "keyboard" | "mouse" | "other";
  // XInput slot for Steam Input virtual pads (== Steam Input nXInputIndex);
  // absent for physical devices.
  xinput_slot?: number;
}

// One player in a headless launch — array order is split order (player 1 = top).
export interface LaunchPlayer {
  profile: string;
  xinput: number; // Steam Input XInput slot (ties to Device.xinput_slot)
}

export interface LauncherInfo {
  exe: string;
  directory: string;
  log_dir: string;
}

export interface PartydeckStatus {
  binary_installed: boolean;
  setup_running: boolean;
  setup_error: string | null;
}

export type DeviceFilter = "all" | "no-steam-input" | "only-steam-input";

// Mirrors PartyConfig in partydeck/src/app/config.rs — field names are the serde
// wire names; set_config round-trips the whole object, so keep all fields.
export interface PartyConfig {
  gamescope_fix_lowres: boolean;
  layout_preset: string;
  gamescope_force_grab_cursor: boolean;
  kbm_support: boolean;
  proton_version: string;
  proton_separate_pfxs: boolean;
  proton_wow64: boolean;
  pad_filter_type: "All" | "NoSteamInput" | "OnlySteamInput";
  allow_multiple_instances_on_same_device: boolean;
  profile_unique_dirs: boolean;
  disable_mount_gamedirs: boolean;
  check_for_updates: boolean;
}

export const listProfiles = callable<[], Profile[]>("list_profiles");
export const listHandlers = callable<[], Handler[]>("list_handlers");
export const listDevices = callable<[filter: DeviceFilter], Device[]>(
  "list_devices",
);
export const createProfile = callable<[name: string], Profile[]>(
  "create_profile",
);
export const deleteProfile = callable<[name: string], Profile[]>(
  "delete_profile",
);

export const getConfig = callable<[], PartyConfig>("get_config");
export const setConfig = callable<[config: PartyConfig], PartyConfig>(
  "set_config",
);
export const erasePrefixes = callable<[], void>("erase_prefixes");

// Launch lifecycle. setup downloads/installs the binary (poll status); prepare
// writes the launcher script for a given game + player assignment and returns
// its path so the frontend can register + RunGame a Steam shortcut.
export const partydeckStatus = callable<[], PartydeckStatus>("partydeck_status");
export const setupPartydeck = callable<
  [],
  { started: boolean; reason?: string }
>("setup_partydeck");
export const preparePartydeck = callable<
  [appid: number, handler: string, players: LaunchPlayer[]],
  LauncherInfo
>("prepare_partydeck");

// A Proton runner umu can launch with. "custom" = compatibilitytools.d entry,
// written to config as a bare name (offline lookup); "valve" = a Steam-installed
// Proton from steamapps/common, written as an absolute path.
export interface ProtonRunner {
  name: string;
  value: string;
  kind: "custom" | "valve";
}

// What the next win-handler launch needs. The null states on the update fields
// mean "check unavailable" (offline) and never set needs_download on their own.
export interface ProtonStatus {
  configured: string;
  mode: "auto-ge" | "named" | "path";
  runner_installed: boolean;
  runtime_installed: boolean;
  latest_ge: string | null;
  ge_update_available: boolean | null;
  needs_download: boolean;
  download_running: boolean;
  download_error: string | null;
}

export const listProtonRunners = callable<[], ProtonRunner[]>(
  "list_proton_runners",
);

// An installed GE-Proton runner on disk (newest first), with its size so the
// UI can show what cleanup would reclaim.
export interface InstalledGeRuntime {
  name: string;
  path: string;
  size_bytes: number;
}
export const installedGeRuntimes = callable<[], InstalledGeRuntime[]>(
  "installed_ge_runtimes",
);
export const deleteGeRuntime = callable<[name: string], void>(
  "delete_ge_runtime",
);
export const deleteAllGeRuntimes = callable<[], number>(
  "delete_all_ge_runtimes",
);
export const protonStatus = callable<[], ProtonStatus>("proton_status");
export const downloadProton = callable<
  [update_ge: boolean],
  { started: boolean; reason?: string }
>("download_proton");

// One per-session launcher run log. timestamp = session start (epoch seconds,
// parsed from the filename); appid/handler are present when the run was
// prepared for a specific game (absent for GUI-fallback runs).
export interface RunLog {
  filename: string;
  timestamp: number;
  size_bytes: number;
  appid: number | null;
  handler: string | null;
}

export const listRunLogs = callable<[], RunLog[]>("list_run_logs");

// Uploads go through the backend (the CEF origin can't POST to dpaste.com).
// Anonymous dpaste pastes are unlisted and expire after a month; no API key.
export const uploadRunLog = callable<[filename: string], { url: string }>(
  "upload_run_log",
);

// Library artwork for the PartyDeck shortcut: base64 PNGs for
// SetCustomArtworkForApp, plus an on-device path for SetShortcutIcon. Any
// piece may be absent if its file is missing from the deploy.
export interface ShortcutArtwork {
  capsule?: string;
  hero?: string;
  logo?: string;
  header?: string;
  icon_path: string | null;
}

export const getShortcutArtwork = callable<[], ShortcutArtwork>(
  "get_shortcut_artwork",
);

// Autonomous session lifecycle — agentPrepareLaunch emits the agent_launch
// event handled by lib/agentControl.ts.

export interface AgentRunStatus {
  exists: boolean;
  filename?: string;
  mtime?: number;
  crashed?: boolean;
  running?: boolean;
  tail?: string;
  timed_out?: boolean;
}

export const agentPrepareLaunch = callable<
  [appid: number, handler: string, players: LaunchPlayer[]],
  { exe: string; directory: string; launch_requested: boolean }
>("agent_prepare_launch");

export const agentStopSession = callable<
  [force: boolean],
  { killed: Record<string, number[]> }
>("agent_stop_session");

export const agentWaitForRun = callable<
  [since_mtime: number, timeout_s: number, tail_lines: number],
  AgentRunStatus
>("agent_wait_for_run");

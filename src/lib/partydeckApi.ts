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
  log: string;
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
  enable_kwin_script: boolean;
  gamescope_fix_lowres: boolean;
  gamescope_sdl_backend: boolean;
  gamescope_force_grab_cursor: boolean;
  kbm_support: boolean;
  proton_version: string;
  proton_separate_pfxs: boolean;
  proton_wow64: boolean;
  vertical_two_player: boolean;
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

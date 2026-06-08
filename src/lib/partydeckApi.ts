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
}

export type DeviceFilter = "all" | "no-steam-input" | "only-steam-input";

export interface InputEvent {
  path: string;
  button: string;
}

export const listProfiles = callable<[], Profile[]>("list_profiles");
export const listHandlers = callable<[], Handler[]>("list_handlers");
export const listDevices = callable<[filter: DeviceFilter], Device[]>(
  "list_devices",
);
export const createProfile = callable<[name: string], Profile[]>(
  "create_profile",
);

export const startInputMonitor = callable<
  [filter: DeviceFilter],
  { started: boolean; reason?: string }
>("start_input_monitor");
export const stopInputMonitor = callable<
  [],
  { stopped: boolean; reason?: string }
>("stop_input_monitor");

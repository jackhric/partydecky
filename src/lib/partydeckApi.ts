// Typed bindings for PartyDeck's headless query callables (see main.py Plugin
// and the Rust DTOs in partydeck/src/cli.rs). The backend shells out to the
// `partydeck` binary's display-free subcommands and returns parsed JSON.
//
// Keep these shapes in sync with the Rust DTOs — they are the wire contract.

import { callable } from "@decky/api";

/** A PartyDeck profile (account). Mirrors ProfileDto. */
export interface Profile {
  name: string;
}

/** An installed handler (game config). Mirrors HandlerDto. */
export interface Handler {
  name: string;
  author: string;
  version: string;
  /** True if the handler runs a Windows executable (via Proton/umu). */
  win: boolean;
  steam_appid: number | null;
}

/** A connected input device. Mirrors DeviceDto. */
export interface Device {
  /** Stable identity (evdev node path). Reference devices by THIS, not by
   * array position — scan order is not stable across hotplugs. */
  path: string;
  name: string;
  type: "gamepad" | "keyboard" | "mouse" | "other";
}

export const listProfiles = callable<[], Profile[]>("list_profiles");
export const listHandlers = callable<[], Handler[]>("list_handlers");
export const listDevices = callable<[], Device[]>("list_devices");
export const createProfile = callable<[name: string], Profile[]>(
  "create_profile",
);

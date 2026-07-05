// Gaming Mode's per-app "Game Resolution" property doesn't reach PartyDeck's
// Wayland-native compositor via gamescope, so we read Steam's stored override
// and mirror it into PARTYDECK_SCREEN_WIDTH/HEIGHT via the backend's launch-env
// file before each launch.

import { setSessionResolution } from "./partydeckApi";

const RESOLUTION_RE = /^(\d+)x(\d+)$/;

/** Best-effort: a failure must never block a launch. */
export async function syncSessionResolution(appId: number): Promise<void> {
  try {
    const override = await SteamClient.Apps.GetResolutionOverrideForApp(appId);
    const match = RESOLUTION_RE.exec(override ?? "");
    if (match) {
      await setSessionResolution(parseInt(match[1], 10), parseInt(match[2], 10));
    } else {
      // "Default" / "Native" / anything unparseable = no override.
      await setSessionResolution(null, null);
    }
  } catch (e) {
    console.warn("PartyDeck: syncing session resolution failed", e);
  }
}

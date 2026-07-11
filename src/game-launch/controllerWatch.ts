// Forwards controller connect/disconnect transitions to the running session's
// compositor (set_controller_connected via the backend). Polls getControllers()
// rather than reacting to Steam's mobx — the same accepted idiom as
// usePlayerLobby, and it avoids depending on Steam's bundled mobx internals.
// Each player adopts the xinput slot their pad already sat at when the launch
// was requested. PartyDeck never reorders controllers: an in-session
// SwapControllerOrder updates Steam's displayed order but not its persisted
// order, which poisons the next launch's pad materialization. Mid-session
// disconnect/reconnect is handled by Steam and the Rust proxy layer; this
// watch only forwards serial presence to the compositor overlay.

import { Router } from "@decky/ui";
import { setControllerConnected } from "../lib/partydeckApi";
import { getControllers } from "./steamInput";

export interface WatchedPlayer {
  slot: number; // 0-based cell index (players array order at launch)
  serial: string;
}

const POLL_MS = 2000;
const SESSION_CHECK_MS = 5000;
// A launch can take a while to show up in RunningApps; don't self-stop before
// the session was ever seen running unless this much time has passed.
const LAUNCH_GRACE_MS = 120_000;

let stopCurrent: (() => void) | null = null;

// Maps 0-based cell index -> serial by matching each xinput slot against the
// live controller list (for launch paths that only know xinput).
export function resolvePlayerSerials(xinputSlots: number[]): WatchedPlayer[] {
  const live = getControllers();
  return xinputSlots.map((xinput, slot) => ({
    slot,
    serial: live.find((c) => c.xinput === xinput)?.serial ?? "",
  }));
}

function isAppRunning(appId: number): boolean {
  try {
    return Router.RunningApps.some((a) => String(a.appid) === String(appId));
  } catch {
    return true; // can't tell — keep watching rather than kill a live session's watch
  }
}

export function startControllerWatch(
  players: WatchedPlayer[],
  appId: number,
): () => void {
  stopCurrent?.();

  const watched = players.filter((p) => p.serial !== "");
  const present = new Map(watched.map((p) => [p.slot, true]));
  const inFlight = new Set<number>();
  const startedAt = Date.now();
  let seenRunning = false;

  console.info(
    `[partydeck] controller watch start players=${JSON.stringify(players)}`,
  );

  const stop = () => {
    console.info("[partydeck] controller watch stop");
    clearInterval(poll);
    clearInterval(sessionCheck);
    if (stopCurrent === stop) stopCurrent = null;
  };

  const poll = setInterval(() => {
    const live = getControllers();
    const serials = new Set(
      live.map((c) => c.serial).filter((s) => s !== ""),
    );
    for (const p of watched) {
      const connected = serials.has(p.serial);
      if (connected === present.get(p.slot) || inFlight.has(p.slot)) continue;
      inFlight.add(p.slot);
      // Commit only on success so a failed send (e.g. the compositor socket
      // isn't up yet during the launch window) retries on the next poll.
      setControllerConnected(p.slot, connected)
        .then((r) => {
          if (r.ok) {
            present.set(p.slot, connected);
          } else if (r.error?.includes("no PartyDeck session is running")) {
            console.debug(
              `[partydeck] set_controller_connected(${p.slot}, ${connected}) deferred: session not up yet`,
            );
          } else {
            console.warn(
              `[partydeck] set_controller_connected(${p.slot}, ${connected}) failed:`,
              r.error,
            );
          }
        })
        .catch((e) =>
          console.warn("[partydeck] set_controller_connected error", e),
        )
        .finally(() => inFlight.delete(p.slot));
    }
  }, POLL_MS);

  const sessionCheck = setInterval(() => {
    if (isAppRunning(appId)) {
      if (!seenRunning) {
        seenRunning = true;
        console.info(
          `[partydeck] app ${appId} seen running ${Date.now() - startedAt}ms after watch start`,
        );
      }
      return;
    }
    if (seenRunning || Date.now() - startedAt > LAUNCH_GRACE_MS) stop();
  }, SESSION_CHECK_MS);

  stopCurrent = stop;
  return stop;
}

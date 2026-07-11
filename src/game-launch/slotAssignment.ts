// Keeps the session's XInput slot layout matching the launch-time intent:
// verifyAndCorrectSlots swaps misplaced (still-present) pads back, and the
// rebind policy binds replacement pads to vacated player slots.

import {
  BUTTON_A,
  getControllers,
  registerInput,
  swapControllerOrder,
  type SteamController,
} from "./steamInput";
import type { WatchedPlayer } from "./controllerWatch";

export type VerifyResult = "ok" | "corrected" | "failed";

async function waitForSerialAtSlot(
  serial: string,
  xinput: number,
  timeoutMs = 5000,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const at = getControllers().some(
      (c) => c.serial === serial && c.xinput === xinput,
    );
    if (at) return true;
    if (Date.now() >= deadline) return false;
    await new Promise((r) => setTimeout(r, 500));
  }
}

// Converges because intended slots are unique: a swap can't displace a pad
// that already sits at its player's intended slot.
export async function verifyAndCorrectSlots(
  players: WatchedPlayer[],
): Promise<VerifyResult> {
  let swapped = false;
  for (let pass = 0; pass <= players.length; pass++) {
    const live = getControllers();
    const misplaced = players
      .map((p) => ({
        player: p,
        pad:
          p.serial === ""
            ? undefined
            : live.find((c) => c.serial === p.serial),
      }))
      .find(({ player, pad }) => pad !== undefined && pad.xinput !== player.xinput);
    if (!misplaced) return swapped ? "corrected" : "ok";
    const { player, pad } = misplaced;
    swapControllerOrder(pad!.xinput, player.xinput);
    swapped = true;
    if (!(await waitForSerialAtSlot(player.serial, player.xinput)))
      return "failed";
  }
  return "failed";
}

export interface RebindPolicy {
  tick(live: SteamController[]): void;
  busy(): boolean;
  stop(): void;
}

export function createRebindPolicy(
  players: WatchedPlayer[],
  onRebound: (p: WatchedPlayer) => void,
): RebindPolicy {
  let swapping = false;
  let unregisterClaim: (() => void) | null = null;

  const vacantPlayers = (presentSerials: Set<string>) =>
    players
      .filter((p) => p.serial !== "" && !presentSerials.has(p.serial))
      .sort((a, b) => a.slot - b.slot);

  const freshPads = (live: SteamController[]) => {
    const bound = new Set(players.map((p) => p.serial));
    return live.filter(
      (c) => c.serial !== "" && !bound.has(c.serial) && c.xinput >= 0,
    );
  };

  const claim = async (pad: SteamController, player: WatchedPlayer) => {
    swapping = true;
    try {
      if (pad.xinput !== player.xinput)
        swapControllerOrder(pad.xinput, player.xinput);
      if (!(await waitForSerialAtSlot(pad.serial, player.xinput))) return;
      player.serial = pad.serial;
      onRebound(player);
    } finally {
      swapping = false;
    }
  };

  const stopClaimListener = () => {
    unregisterClaim?.();
    unregisterClaim = null;
  };

  const startClaimListener = () => {
    if (unregisterClaim) return;
    unregisterClaim = registerInput((controllerIndex, button, isDown) => {
      if (button !== BUTTON_A || !isDown || swapping) return;
      const live = getControllers();
      const pad = live.find((c) => c.index === controllerIndex);
      if (!pad || !freshPads(live).some((c) => c.serial === pad.serial)) return;
      const present = new Set(live.map((c) => c.serial));
      const vacant = vacantPlayers(present);
      if (vacant.length === 0) return;
      void claim(pad, vacant[0]);
    });
  };

  return {
    tick(live) {
      if (swapping) return;
      const present = new Set(
        live.map((c) => c.serial).filter((s) => s !== ""),
      );
      const vacant = vacantPlayers(present);
      const fresh = freshPads(live);
      if (vacant.length === 0 || fresh.length === 0) {
        stopClaimListener();
        return;
      }
      if (vacant.length === 1 && fresh.length === 1) {
        stopClaimListener();
        void claim(fresh[0], vacant[0]);
        return;
      }
      // Ambiguous: multiple candidates — let a pad claim the lowest vacant
      // slot by pressing A.
      startClaimListener();
    },
    busy: () => swapping,
    stop: stopClaimListener,
  };
}

import { useQuickAccessVisible } from "@decky/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { getControllers, registerInput } from "../lib/steamInput";
import { playJoinSound, playLeaveSound } from "../lib/navSound";
import { useSteamMenuVisible } from "./useSteamMenuVisible";

export interface Player {
  controllerIndex: number;
  controllerName: string;
  controllerType: number;
  // Steam Input XInput slot — the launch key that ties this player to a
  // PartyDeck Steam Input pad (see steamInput.ts).
  xinput: number;
  profile: string | null;
}

const BUTTON_A = 0;
const BUTTON_B = 1;
const ARMING_DELAY_MS = 500;
const LEAVE_HOLD_MS = 250;

// Lobby state machine: press A on an unjoined controller to add a player cell,
// HOLD B on a joined controller (~0.5s) to remove it — a tap won't leave, so an
// accidental B doesn't kick a player. Profiles are auto-assigned in order from
// the available pool and can be changed per cell afterward.
export function usePlayerLobby(profiles: string[]) {
  const [players, setPlayers] = useState<Player[]>([]);

  // Steam's XInput slot assignment collapses after sleep/wake (a known Steam
  // Deck bug): two controllers report the same nXInputIndex, which would make
  // both split-screen instances bind the same pad. We can't fix Steam's state,
  // but we can DETECT it (duplicate/invalid xinput across connected gamepads)
  // and refuse to let players join until SteamOS is restarted. Polled because
  // the collapse can happen while the lobby is already open.
  const [controllerOrderBroken, setControllerOrderBroken] = useState(false);
  useEffect(() => {
    const check = () => {
      const slots = getControllers().map((c) => c.xinput);
      const broken =
        slots.some((s) => s < 0) || new Set(slots).size !== slots.length;
      setControllerOrderBroken(broken);
    };
    check();
    const id = setInterval(check, 1000);
    return () => clearInterval(id);
  }, []);
  const orderBrokenRef = useRef(controllerOrderBroken);
  orderBrokenRef.current = controllerOrderBroken;

  // Latest profiles in a ref so the input callback (registered once) always
  // sees the current pool without re-subscribing on every profile change.
  const profilesRef = useRef(profiles);
  profilesRef.current = profiles;

  // The SteamClient.Input stream fires regardless of UI focus, so we gate it
  // ourselves: ignore input whenever the Quick Access or Steam menu overlay is
  // open (these render over the page but don't unmount it). A short arming delay
  // after an overlay closes swallows the A that dismissed it so it can't leak
  // into a join.
  const quickAccessOpen = useQuickAccessVisible();
  const steamMenuOpen = useSteamMenuVisible();
  const overlayOpen = quickAccessOpen || steamMenuOpen;

  const overlayOpenRef = useRef(overlayOpen);
  const armedAtRef = useRef(0);
  // Per-controller B-hold timers: a held B must survive ~0.5s to leave.
  const leaveTimersRef = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const cancelLeave = useCallback((controllerIndex: number) => {
    const timers = leaveTimersRef.current;
    const t = timers.get(controllerIndex);
    if (t !== undefined) {
      clearTimeout(t);
      timers.delete(controllerIndex);
    }
  }, []);

  const cancelAllLeaves = useCallback(() => {
    leaveTimersRef.current.forEach((t) => clearTimeout(t));
    leaveTimersRef.current.clear();
  }, []);

  useEffect(() => {
    overlayOpenRef.current = overlayOpen;
    if (!overlayOpen) {
      // When an overlay closes, re-arm the grace period before joins resume.
      armedAtRef.current = Date.now() + ARMING_DELAY_MS;
    } else {
      // An overlay stealing focus mid-hold should not complete a leave.
      cancelAllLeaves();
    }
  }, [overlayOpen, cancelAllLeaves]);

  useEffect(() => {
    armedAtRef.current = Date.now() + ARMING_DELAY_MS;

    const unregister = registerInput((controllerIndex, button, isDown) => {
      if (overlayOpenRef.current) return;

      if (button === BUTTON_B) {
        if (isDown) {
          if (Date.now() < armedAtRef.current) return;
          if (leaveTimersRef.current.has(controllerIndex)) return;
          const timer = setTimeout(() => {
            leaveTimersRef.current.delete(controllerIndex);
            setPlayers((prev) => {
              const next = prev.filter(
                (p) => p.controllerIndex !== controllerIndex,
              );
              if (next.length !== prev.length) playLeaveSound();
              return next;
            });
          }, LEAVE_HOLD_MS);
          leaveTimersRef.current.set(controllerIndex, timer);
        } else {
          cancelLeave(controllerIndex); // released before the hold completed
        }
        return;
      }

      if (!isDown) return;
      if (Date.now() < armedAtRef.current) return;

      if (button === BUTTON_A) {
        if (orderBrokenRef.current) return; // Steam slot collapse -> joins disabled
        if (profilesRef.current.length === 0) return; // no profiles -> can't join
        setPlayers((prev) => {
          if (prev.some((p) => p.controllerIndex === controllerIndex)) return prev;
          const ctrl = getControllers().find((c) => c.index === controllerIndex);
          if (!ctrl) return prev;
          // The XInput slot is the launch key (it picks the Steam Input pad each
          // instance binds). Reject a join whose slot is invalid or already
          // taken — otherwise two pads share a slot and one player's input drives
          // both instances while the other is dead. This happens after a
          // controller reconnect, when Steam Input transiently reports a stale
          // or duplicate nXInputIndex.
          if (ctrl.xinput < 0) return prev;
          if (prev.some((p) => p.xinput === ctrl.xinput)) return prev;
          const taken = new Set(prev.map((p) => p.profile));
          const nextProfile =
            profilesRef.current.find((p) => !taken.has(p)) ??
            profilesRef.current[0] ??
            null;
          playJoinSound();
          return [
            ...prev,
            {
              controllerIndex,
              controllerName: ctrl.name,
              controllerType: ctrl.type,
              xinput: ctrl.xinput,
              profile: nextProfile,
            },
          ];
        });
      }
    });
    return () => {
      cancelAllLeaves();
      unregister();
    };
  }, [cancelLeave, cancelAllLeaves]);

  const setProfile = useCallback((controllerIndex: number, profile: string) => {
    setPlayers((prev) =>
      prev.map((p) =>
        p.controllerIndex === controllerIndex ? { ...p, profile } : p,
      ),
    );
  }, []);

  // If the slot collapse happens while players are already joined, drop them —
  // their captured slots are now unreliable, and the warning state replaces the
  // grid entirely.
  useEffect(() => {
    if (controllerOrderBroken) setPlayers([]);
  }, [controllerOrderBroken]);

  return { players, setProfile, controllerOrderBroken };
}

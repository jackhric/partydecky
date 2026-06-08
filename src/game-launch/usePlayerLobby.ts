import { useQuickAccessVisible } from "@decky/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { getControllers, registerInput } from "../lib/steamInput";
import { playJoinSound, playLeaveSound } from "../lib/navSound";
import { useSteamMenuVisible } from "./useSteamMenuVisible";

export interface Player {
  controllerIndex: number;
  controllerName: string;
  controllerType: number;
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
        if (profilesRef.current.length === 0) return; // no profiles -> can't join
        setPlayers((prev) => {
          if (prev.some((p) => p.controllerIndex === controllerIndex)) return prev;
          const ctrl = getControllers().find((c) => c.index === controllerIndex);
          if (!ctrl) return prev;
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

  return { players, setProfile };
}

import { useQuickAccessVisible } from "@decky/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { getControllers, registerInput } from "./steamInput";
import { playJoinSound, playLeaveSound } from "./navSound";
import { useSteamMenuVisible } from "./useSteamMenuVisible";

export interface Player {
  controllerIndex: number;
  controllerName: string;
  controllerType: number;
  // Steam Input XInput slot — the launch key that ties this player to a
  // PartyDeck Steam Input pad (see steamInput.ts).
  xinput: number;
  profile: string | null;
  // Bumped on every LB/RB press; PlayerCell turns each change into a spring
  // impulse on the glyph, kicked toward shakeDir (-1 = left/LB, 1 = right/RB).
  shakeTick: number;
  shakeDir: -1 | 1;
}

const BUTTON_A = 0;
const BUTTON_B = 1;
const BUTTON_L1 = 30;
const BUTTON_R1 = 31;
const ARMING_DELAY_MS = 500;
// Exported so PlayerCell's hold indicator animates over the same duration.
export const LEAVE_HOLD_MS = 250;
const EXIT_HOLD_MS = 2000;
const EXIT_TICK_MS = 100;
// A tick gap this large means the CEF context was throttled/suspended mid-hold;
// cancel rather than fire a stale exit on resume.
const STALE_TICK_MS = 500;

// Lobby state machine: press A on an unjoined controller to add a player cell,
// HOLD B on a joined controller (~0.5s) to remove it — a tap won't leave, so an
// accidental B doesn't kick a player. Profiles are auto-assigned in order from
// the available pool and can be changed per cell afterward.
//
// Exiting the page is also handled here: holding B for EXIT_HOLD_MS fires
// onExit. It rides this same SteamClient.Input stream (not Focusable gamepad
// events) on purpose — the stream delivers every physical press/release per
// controller regardless of where Steam's UI focus is, so a focus move mid-hold
// can't strand a running timer (the old useHoldToExit bug).
// `joinsBlocked` covers every non-lobby state the page can be in (loading, no
// handler, Proton-runtime gate, …). The SteamClient.Input stream runs whenever
// this page is mounted, regardless of what's rendered, so without this a player
// could press A and silently "join" behind an error screen. Sleep-mode is
// gated separately below (controllerOrderBroken) since it's detected here.
export function usePlayerLobby(
  profiles: string[],
  onExit: () => void,
  joinsBlocked = false,
) {
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

  const joinsBlockedRef = useRef(joinsBlocked);
  joinsBlockedRef.current = joinsBlocked;

  // Latest profiles in a ref so the input callback (registered once) always
  // sees the current pool without re-subscribing on every profile change.
  const profilesRef = useRef(profiles);
  profilesRef.current = profiles;

  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;

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
  // Mirrors the timer map as state so each card can show its hold indicator.
  const [leavingControllers, setLeavingControllers] = useState<Set<number>>(
    new Set(),
  );

  const clearLeaving = useCallback((controllerIndex: number) => {
    setLeavingControllers((prev) => {
      if (!prev.has(controllerIndex)) return prev;
      const next = new Set(prev);
      next.delete(controllerIndex);
      return next;
    });
  }, []);

  const cancelLeave = useCallback(
    (controllerIndex: number) => {
      const timers = leaveTimersRef.current;
      const t = timers.get(controllerIndex);
      if (t !== undefined) {
        clearTimeout(t);
        timers.delete(controllerIndex);
      }
      clearLeaving(controllerIndex);
    },
    [clearLeaving],
  );

  const cancelAllLeaves = useCallback(() => {
    leaveTimersRef.current.forEach((t) => clearTimeout(t));
    leaveTimersRef.current.clear();
    setLeavingControllers((prev) => (prev.size > 0 ? new Set() : prev));
  }, []);

  // Exit hold: per-controller B press timestamps plus one shared ticker that
  // only runs while at least one hold is active. Keyed by controllerIndex so
  // one pad's release can't cancel another pad's hold.
  const exitHoldsRef = useRef(new Map<number, number>());
  const exitTickerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastTickAtRef = useRef(0);
  // Ms left until the exit fires, or null when no B is held. Drives the
  // "Exiting in X.X..." countdown on the page.
  const [exitRemainingMs, setExitRemainingMs] = useState<number | null>(null);

  const cancelExitHolds = useCallback(() => {
    exitHoldsRef.current.clear();
    if (exitTickerRef.current !== null) {
      clearInterval(exitTickerRef.current);
      exitTickerRef.current = null;
    }
    setExitRemainingMs(null);
  }, []);

  const startExitHold = useCallback(
    (controllerIndex: number) => {
      const holds = exitHoldsRef.current;
      if (holds.has(controllerIndex)) return;
      holds.set(controllerIndex, Date.now());
      setExitRemainingMs((prev) => prev ?? EXIT_HOLD_MS);
      if (exitTickerRef.current !== null) return;
      lastTickAtRef.current = Date.now();
      exitTickerRef.current = setInterval(() => {
        const now = Date.now();
        if (now - lastTickAtRef.current > STALE_TICK_MS) {
          cancelExitHolds();
          return;
        }
        lastTickAtRef.current = now;
        let oldest = now;
        exitHoldsRef.current.forEach((at) => {
          if (at < oldest) oldest = at;
        });
        const remaining = EXIT_HOLD_MS - (now - oldest);
        if (remaining <= 0) {
          cancelExitHolds();
          onExitRef.current();
        } else {
          setExitRemainingMs(remaining);
        }
      }, EXIT_TICK_MS);
    },
    [cancelExitHolds],
  );

  useEffect(() => {
    overlayOpenRef.current = overlayOpen;
    if (!overlayOpen) {
      // When an overlay closes, re-arm the grace period before joins resume.
      armedAtRef.current = Date.now() + ARMING_DELAY_MS;
    } else {
      // An overlay stealing focus mid-hold should not complete a leave or an
      // exit (the B-up may never reach us while the overlay is open).
      cancelAllLeaves();
      cancelExitHolds();
    }
  }, [overlayOpen, cancelAllLeaves, cancelExitHolds]);

  useEffect(() => {
    armedAtRef.current = Date.now() + ARMING_DELAY_MS;

    const unregister = registerInput((controllerIndex, button, isDown) => {
      if (overlayOpenRef.current) return;

      if (button === BUTTON_B) {
        if (isDown) {
          if (Date.now() < armedAtRef.current) return;
          // Any controller's held B counts toward the page exit; a joined
          // controller's hold ALSO runs its (shorter) leave timer below.
          startExitHold(controllerIndex);
          if (leaveTimersRef.current.has(controllerIndex)) return;
          const timer = setTimeout(() => {
            leaveTimersRef.current.delete(controllerIndex);
            clearLeaving(controllerIndex);
            setPlayers((prev) => {
              const next = prev.filter(
                (p) => p.controllerIndex !== controllerIndex,
              );
              if (next.length !== prev.length) playLeaveSound();
              return next;
            });
          }, LEAVE_HOLD_MS);
          leaveTimersRef.current.set(controllerIndex, timer);
          setLeavingControllers((prev) => new Set(prev).add(controllerIndex));
        } else {
          cancelLeave(controllerIndex); // released before the hold completed
          exitHoldsRef.current.delete(controllerIndex);
          if (exitHoldsRef.current.size === 0) cancelExitHolds();
        }
        return;
      }

      if (!isDown) return;

      // Cosmetic: a joined player's LB/RB knocks their card's glyph left/right.
      // No arming gate — it can't change lobby state, and an unjoined
      // controller is a natural no-op (no matching player).
      if (button === BUTTON_L1 || button === BUTTON_R1) {
        const dir = button === BUTTON_L1 ? -1 : 1;
        setPlayers((prev) =>
          prev.map((p) =>
            p.controllerIndex === controllerIndex
              ? { ...p, shakeTick: p.shakeTick + 1, shakeDir: dir as -1 | 1 }
              : p,
          ),
        );
        return;
      }

      if (Date.now() < armedAtRef.current) return;

      if (button === BUTTON_A) {
        if (joinsBlockedRef.current) return; // error gate (Proton, loading, …) -> no joins
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
          // Assign the first unused profile. If every profile is already taken,
          // join with no profile (null) rather than duplicating one — the cell
          // shows "No profile" and Start stays disabled until it's resolved.
          const taken = new Set(prev.map((p) => p.profile));
          const nextProfile =
            profilesRef.current.find((p) => !taken.has(p)) ?? null;
          playJoinSound();
          return [
            ...prev,
            {
              controllerIndex,
              controllerName: ctrl.name,
              controllerType: ctrl.type,
              xinput: ctrl.xinput,
              profile: nextProfile,
              shakeTick: 0,
              shakeDir: 1,
            },
          ];
        });
      }
    });
    return () => {
      cancelAllLeaves();
      cancelExitHolds();
      unregister();
    };
  }, [cancelLeave, cancelAllLeaves, cancelExitHolds, startExitHold]);

  // `profile === null` clears it (lets a player temporarily free their profile
  // so someone else can take it). A non-null profile already held by ANOTHER
  // player is rejected — the picker disables those, but guard here too so the
  // invariant (no two players share a profile) holds regardless of caller.
  const setProfile = useCallback(
    (controllerIndex: number, profile: string | null) => {
      setPlayers((prev) => {
        if (
          profile !== null &&
          prev.some(
            (p) => p.controllerIndex !== controllerIndex && p.profile === profile,
          )
        ) {
          return prev;
        }
        return prev.map((p) =>
          p.controllerIndex === controllerIndex ? { ...p, profile } : p,
        );
      });
    },
    [],
  );

  // If the slot collapse happens while players are already joined, drop them —
  // their captured slots are now unreliable, and the warning state replaces the
  // grid entirely.
  useEffect(() => {
    if (controllerOrderBroken) setPlayers([]);
  }, [controllerOrderBroken]);

  // Entering any error/non-lobby state hides the grid; drop joined players so a
  // stale lobby doesn't reappear when the block clears (e.g. after a download
  // finishes the user re-joins fresh).
  useEffect(() => {
    if (joinsBlocked) setPlayers([]);
  }, [joinsBlocked]);

  return {
    players,
    setProfile,
    controllerOrderBroken,
    leavingControllers,
    exitRemainingMs,
    cancelExitHolds,
  };
}

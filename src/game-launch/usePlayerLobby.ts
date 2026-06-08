import { useCallback, useEffect, useRef, useState } from "react";
import { getControllers, registerInput } from "../lib/steamInput";

export interface Player {
  controllerIndex: number;
  controllerName: string;
  controllerType: number;
  profile: string | null;
}

const BUTTON_A = 0;
const BUTTON_B = 1;
const ARMING_DELAY_MS = 500;

// Lobby state machine: press A on an unjoined controller to add a player cell,
// press B on a joined controller to remove it. Profiles are auto-assigned in
// order from the available pool and can be changed per cell afterward.
export function usePlayerLobby(profiles: string[]) {
  const [players, setPlayers] = useState<Player[]>([]);

  // Latest profiles in a ref so the input callback (registered once) always
  // sees the current pool without re-subscribing on every profile change.
  const profilesRef = useRef(profiles);
  profilesRef.current = profiles;

  // Joining is gated two ways: a grace period after (re)gaining focus — the
  // A-press that navigated here (or that dismissed an overlay) would otherwise
  // immediately join — and a hard pause whenever the page isn't focused/visible.
  const armedAtRef = useRef(0);
  const pausedRef = useRef(false);

  useEffect(() => {
    const arm = () => {
      pausedRef.current = false;
      armedAtRef.current = Date.now() + ARMING_DELAY_MS;
    };
    const pause = () => {
      pausedRef.current = true;
    };
    arm();

    const onVisibility = () => {
      if (document.visibilityState === "visible") arm();
      else pause();
    };
    window.addEventListener("focus", arm);
    window.addEventListener("blur", pause);
    document.addEventListener("visibilitychange", onVisibility);

    const unregister = registerInput((controllerIndex, button, isDown) => {
      if (!isDown) return;
      if (pausedRef.current || Date.now() < armedAtRef.current) return;

      if (button === BUTTON_A) {
        setPlayers((prev) => {
          if (prev.some((p) => p.controllerIndex === controllerIndex)) return prev;
          const ctrl = getControllers().find((c) => c.index === controllerIndex);
          if (!ctrl) return prev;
          const taken = new Set(prev.map((p) => p.profile));
          const nextProfile =
            profilesRef.current.find((p) => !taken.has(p)) ??
            profilesRef.current[0] ??
            null;
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
      } else if (button === BUTTON_B) {
        setPlayers((prev) =>
          prev.filter((p) => p.controllerIndex !== controllerIndex),
        );
      }
    });
    return () => {
      window.removeEventListener("focus", arm);
      window.removeEventListener("blur", pause);
      document.removeEventListener("visibilitychange", onVisibility);
      unregister();
    };
  }, []);

  const setProfile = useCallback((controllerIndex: number, profile: string) => {
    setPlayers((prev) =>
      prev.map((p) =>
        p.controllerIndex === controllerIndex ? { ...p, profile } : p,
      ),
    );
  }, []);

  return { players, setProfile };
}

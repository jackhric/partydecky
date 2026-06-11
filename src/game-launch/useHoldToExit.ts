import { Navigation } from "@decky/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { playExitMenuSound } from "./navSound";

const HOLD_MS = 2000;
const TICK_MS = 100;
// GamepadButton.CANCEL from @decky/ui's FooterLegend enum (the B / back button).
// Inlined to avoid a deep-import of the enum from @decky/ui/dist internals.
const GAMEPAD_CANCEL = 2;

// Decky's GamepadEvent shape (CustomEvent with button info in detail).
type GamepadEvent = CustomEvent<{ button: number; is_repeat?: boolean }>;

// Steam treats a B tap as instant "back". On this page B is overloaded: a tap is
// a per-player leave (handled by the lobby input listener), so exiting must be a
// deliberate HOLD. We intercept Cancel via Focusable's onCancel (consuming the
// tap so Steam doesn't navigate) and time the hold via onButtonDown/Up.
export function useHoldToExit() {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const deadlineRef = useRef(0);
  // Milliseconds left in the hold, or null when B isn't held. Drives the
  // "Exiting in X.X..." countdown in the lobby.
  const [remainingMs, setRemainingMs] = useState<number | null>(null);

  const clear = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setRemainingMs(null);
  }, []);

  useEffect(() => clear, [clear]);

  // Consume the Cancel press so Steam's default back-navigation never fires.
  const onCancel = useCallback((e: CustomEvent) => {
    e.stopPropagation?.();
  }, []);

  const onButtonDown = useCallback(
    (e: GamepadEvent) => {
      if (e.detail.button !== GAMEPAD_CANCEL) return;
      if (e.detail.is_repeat) return;
      if (intervalRef.current !== null) return;
      deadlineRef.current = Date.now() + HOLD_MS;
      setRemainingMs(HOLD_MS);
      intervalRef.current = setInterval(() => {
        const left = deadlineRef.current - Date.now();
        if (left <= 0) {
          clear();
          playExitMenuSound();
          Navigation.NavigateBack();
        } else {
          setRemainingMs(left);
        }
      }, TICK_MS);
    },
    [clear],
  );

  const onButtonUp = useCallback(
    (e: GamepadEvent) => {
      if (e.detail.button !== GAMEPAD_CANCEL) return;
      clear();
    },
    [clear],
  );

  return { onCancel, onButtonDown, onButtonUp, remainingMs };
}

import { Navigation } from "@decky/ui";
import { useCallback, useRef } from "react";

const HOLD_MS = 2000;
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
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Consume the Cancel press so Steam's default back-navigation never fires.
  const onCancel = useCallback((e: CustomEvent) => {
    e.stopPropagation?.();
  }, []);

  const onButtonDown = useCallback(
    (e: GamepadEvent) => {
      if (e.detail.button !== GAMEPAD_CANCEL) return;
      if (e.detail.is_repeat) return;
      if (timerRef.current !== null) return;
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        Navigation.NavigateBack();
      }, HOLD_MS);
    },
    [],
  );

  const onButtonUp = useCallback(
    (e: GamepadEvent) => {
      if (e.detail.button !== GAMEPAD_CANCEL) return;
      clear();
    },
    [clear],
  );

  return { onCancel, onButtonDown, onButtonUp };
}

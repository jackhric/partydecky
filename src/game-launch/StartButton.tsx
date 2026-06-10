import { DialogButton } from "@decky/ui";
import { FC, useState } from "react";
import { FaPlay } from "react-icons/fa";
import { HOLD_TOTAL_MS, useHoldToStart } from "./useHoldToStart";

// GamepadButton.OK (the A button) from @decky/ui's FooterLegend enum, inlined to
// avoid a deep-import of the enum from @decky/ui/dist internals.
const GAMEPAD_OK = 1;

// Steam's library play-button greens. Inline gradients also override the solid
// white Steam paints on focused DialogButtons, so the button stays green and we
// signal focus by brightening instead.
const GREEN = "linear-gradient(to right, #75b022, #588a1b)";
const GREEN_FOCUSED = "linear-gradient(to right, #8ed629, #6cab21)";

interface Props {
  canStart: boolean;
  onStart: () => void;
}

export const StartButton: FC<Props> = ({ canStart, onStart }) => {
  const { count, start, stop } = useHoldToStart(onStart, canStart);
  const [focused, setFocused] = useState(false);

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const onButtonDown = (e: any) => {
    if (e?.detail?.button === GAMEPAD_OK) start();
  };
  const onButtonUp = (e: any) => {
    if (e?.detail?.button === GAMEPAD_OK) stop();
  };

  return (
    <DialogButton
      disabled={!canStart}
      // Hold-to-confirm: a tap does nothing; the launch only fires after holding
      // through the countdown. onClick is intentionally omitted.
      onButtonDown={onButtonDown}
      onButtonUp={onButtonUp}
      onGamepadFocus={() => setFocused(true)}
      onGamepadBlur={() => {
        setFocused(false);
        stop();
      }}
      onPointerDown={start}
      onPointerUp={stop}
      onPointerCancel={stop}
      style={{
        flexShrink: 0,
        width: "auto",
        minWidth: 0,
        height: "24px",
        padding: "0 1rem",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "0.5rem",
        fontSize: "0.9rem",
        fontWeight: 600,
        position: "relative",
        overflow: "hidden",
        // Disabled keeps the default grey so it doesn't read as launchable.
        background: canStart ? (focused ? GREEN_FOCUSED : GREEN) : undefined,
        color: canStart ? "#fff" : undefined,
      }}
    >
      {/* Fill sweeps across over the full hold; releasing early snaps it back
          instantly (no transition on the way out). */}
      <span
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(255, 255, 255, 0.35)",
          transformOrigin: "left",
          transform: count !== null ? "scaleX(1)" : "scaleX(0)",
          transition:
            count !== null ? `transform ${HOLD_TOTAL_MS}ms linear` : "none",
        }}
      />
      <FaPlay size={12} style={{ position: "relative" }} />
      <span style={{ position: "relative" }}>Start</span>
    </DialogButton>
  );
};

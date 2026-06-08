import { DialogButton } from "@decky/ui";
import { FC } from "react";
import { FaPlay } from "react-icons/fa";
import { useHoldToStart } from "./useHoldToStart";

// GamepadButton.OK (the A button) from @decky/ui's FooterLegend enum, inlined to
// avoid a deep-import of the enum from @decky/ui/dist internals.
const GAMEPAD_OK = 1;

interface Props {
  playerCount: number;
  canStart: boolean;
  onStart: () => void;
}

export const StartButton: FC<Props> = ({ playerCount, canStart, onStart }) => {
  const { count, start, stop } = useHoldToStart(onStart, canStart);

  const label =
    count !== null
      ? `Starting in ${count}…`
      : playerCount > 0
        ? `Hold to start ${playerCount} player${playerCount > 1 ? "s" : ""}`
        : "Start";

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
      onPointerDown={start}
      onPointerUp={stop}
      onPointerCancel={stop}
      style={{
        flexShrink: 0,
        width: "auto",
        minWidth: 0,
        padding: "0 1.25rem",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "0.5rem",
      }}
    >
      <FaPlay size={14} />
      {label}
    </DialogButton>
  );
};

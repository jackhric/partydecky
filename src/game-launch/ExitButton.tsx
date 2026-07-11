import { FC } from "react";
import { EXIT_HOLD_MS } from "./usePlayerLobby";

// Steam's own controller-button glyph, served at the loopback origin (same place
// its footer legends pull from). Resolution-independent SVG.
const B_BUTTON_GLYPH =
  "https://steamloopback.host/steaminputglyphs/shared_button_b.svg";

interface Props {
  /** True while B is held (any controller); drives the progress-fill sweep. */
  holding: boolean;
}

// Header indicator sitting right of the Start button: "{B glyph} EXIT" with a
// red fill that sweeps over the hold duration. Display-only — the actual B-hold
// exit logic lives in usePlayerLobby's SteamClient.Input stream.
export const ExitButton: FC<Props> = ({ holding }) => (
  <span
    style={{
      position: "relative",
      display: "flex",
      alignItems: "center",
      height: "24px",
      gap: "0.4rem",
      fontSize: "0.85rem",
      fontWeight: 600,
      opacity: holding ? 1 : 0.7,
      padding: "0 0.6rem",
      borderRadius: "4px",
      overflow: "hidden",
      whiteSpace: "nowrap",
    }}
  >
    {/* Fill sweeps across over the full hold; releasing B snaps it back
        instantly (no transition on the way out). */}
    <span
      style={{
        position: "absolute",
        inset: 0,
        background: "rgba(255, 80, 80, 0.4)",
        transformOrigin: "left",
        transform: holding ? "scaleX(1)" : "scaleX(0)",
        transition: holding ? `transform ${EXIT_HOLD_MS}ms linear` : "none",
      }}
    />
    <img
      src={B_BUTTON_GLYPH}
      alt="B"
      style={{ height: "1.25em", width: "1.25em", position: "relative" }}
    />
    <span style={{ position: "relative" }}>EXIT</span>
  </span>
);

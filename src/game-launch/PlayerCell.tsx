import {
  DialogButton,
  Focusable,
  Menu,
  MenuItem,
  showContextMenu,
} from "@decky/ui";
import { FC, useCallback, useEffect, useRef, useState } from "react";
import { FaGamepad, FaSearch, FaUser } from "react-icons/fa";
import { controllerTypeName } from "./controllerType";
import { identifyController } from "./steamInput";
import { LEAVE_HOLD_MS, type Player } from "./usePlayerLobby";

// Steam's own controller-button glyph, served at the loopback origin (the same
// place its footer legends pull from). Resolution-independent SVG.
const B_BUTTON_GLYPH =
  "https://steamloopback.host/steaminputglyphs/shared_button_b.svg";

// GamepadButton.OK from @decky/ui's FooterLegend enum (the A button), same
// inlining rationale as GAMEPAD_CANCEL in useHoldToExit.
const GAMEPAD_OK = 1;
const HOLD_OPEN_MS = 500;

type GamepadEvent = CustomEvent<{ button: number; is_repeat?: boolean }>;

// Hold-to-activate: `start` arms a timer, `cancel` (release/blur) disarms it,
// and only a full hold fires the action. `holding` drives the fill indicator.
function useHoldAction(ms: number, action: () => void) {
  const [holding, setHolding] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const actionRef = useRef(action);
  actionRef.current = action;

  const cancel = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setHolding(false);
  }, []);

  const start = useCallback(() => {
    if (timerRef.current !== null) return;
    setHolding(true);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setHolding(false);
      actionRef.current();
    }, ms);
  }, [ms]);

  useEffect(() => cancel, [cancel]);

  return { holding, start, cancel };
}

// Underdamped spring (c well below critical ~2*sqrt(k)) so the glyph
// overshoots and wobbles a couple of times before settling.
const SPRING_K = 600; // stiffness: pull toward rest, per second^2
const SPRING_C = 14; // damping: velocity decay, per second
const IMPULSE = 260; // px/s kick per bumper press

// Damped spring on translateX. Each shakeTick change kicks the velocity toward
// shakeDir; presses during motion add to it instead of restarting, so drumming
// the bumpers builds up a bigger wobble.
function useGlyphSpring(tick: number, dir: -1 | 1): number {
  const [x, setX] = useState(0);
  const spring = useRef({ x: 0, v: 0 });
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef(0);
  const prevTickRef = useRef(tick);

  useEffect(() => {
    if (tick === prevTickRef.current) return; // mount, not a press
    prevTickRef.current = tick;
    spring.current.v += dir * IMPULSE;

    if (rafRef.current !== null) return; // integrator already running
    lastRef.current = performance.now();
    const step = (now: number) => {
      const s = spring.current;
      // Clamp dt so a dropped frame integrates stably instead of exploding.
      const dt = Math.min((now - lastRef.current) / 1000, 1 / 30);
      lastRef.current = now;
      s.v += (-SPRING_K * s.x - SPRING_C * s.v) * dt;
      s.x += s.v * dt;
      if (Math.abs(s.x) < 0.1 && Math.abs(s.v) < 2) {
        s.x = 0;
        s.v = 0;
        rafRef.current = null;
        setX(0);
        return;
      }
      setX(s.x);
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
  }, [tick, dir]);

  useEffect(
    () => () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    },
    [],
  );

  return x;
}

interface Props {
  player: Player;
  index: number;
  profiles: string[];
  /** True while this player's controller is mid B-hold to leave. */
  leaving: boolean;
  /** Glyph-left row layout for 3+ players, where stacked cards overflow. */
  compact: boolean;
  onProfileChange: (profile: string) => void;
}

export const PlayerCell: FC<Props> = ({
  player,
  index,
  profiles,
  leaving,
  compact,
  onProfileChange,
}) => {
  const glyphX = useGlyphSpring(player.shakeTick, player.shakeDir);

  const openProfileMenu = () =>
    showContextMenu(
      <Menu label={`Player ${index + 1} profile`}>
        {profiles.map((p) => (
          <MenuItem
            key={p}
            selected={p === player.profile}
            onSelected={() => onProfileChange(p)}
          >
            {p}
          </MenuItem>
        ))}
      </Menu>,
    );

  const holdOpen = useHoldAction(HOLD_OPEN_MS, openProfileMenu);

  return (
    <Focusable
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0.75rem",
        padding: "1rem",
        borderRadius: "8px",
        background: "rgba(255,255,255,0.06)",
        border: "1px solid rgba(255,255,255,0.1)",
        // Grid items default to min-height:auto, which lets content push the
        // row taller than its 1fr track and overflow the page. minHeight:0
        // keeps every card inside its track.
        minHeight: 0,
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span style={{ fontSize: "0.85em", opacity: 0.6, fontWeight: 600 }}>
          PLAYER {index + 1}
        </span>
        <span
          style={{
            position: "relative",
            display: "flex",
            alignItems: "center",
            gap: "0.35rem",
            fontSize: "0.75em",
            opacity: leaving ? 1 : 0.6,
            fontWeight: 600,
            padding: "0.2rem 0.45rem",
            margin: "-0.2rem -0.45rem",
            borderRadius: "4px",
            overflow: "hidden",
          }}
        >
          {/* Fill sweeps across over the hold duration; releasing B snaps it
              back instantly (no transition on the way out). */}
          <span
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(255, 80, 80, 0.4)",
              transformOrigin: "left",
              transform: leaving ? "scaleX(1)" : "scaleX(0)",
              transition: leaving
                ? `transform ${LEAVE_HOLD_MS}ms linear`
                : "none",
            }}
          />
          <img
            src={B_BUTTON_GLYPH}
            alt="B"
            style={{ height: "1.25em", width: "1.25em", position: "relative" }}
          />
          <span style={{ position: "relative" }}>HOLD TO LEAVE</span>
        </span>
      </div>

      {/* 1-2 players: roomy centered stack. 3+: glyph-left row, short enough
          for the 2x2 grid to fit the page where the stack overflowed. */}
      <div
        style={
          compact
            ? {
                flex: 1,
                display: "flex",
                alignItems: "center",
                gap: "0.85rem",
                minHeight: 0,
              }
            : {
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.5rem",
                minHeight: 0,
              }
        }
      >
        <span
          style={{
            display: "inline-flex",
            flexShrink: 0,
            // Slight lean into the motion sells the spring.
            transform: `translateX(${glyphX}px) rotate(${glyphX * 0.6}deg)`,
          }}
        >
          <FaGamepad size={compact ? 40 : 48} />
        </span>
        <div
          style={
            compact ? { minWidth: 0 } : { textAlign: "center", maxWidth: "100%" }
          }
        >
          <div style={{ fontWeight: 600 }}>
            {controllerTypeName(player.controllerType)}
          </div>
          <div
            style={{
              fontSize: "0.8em",
              opacity: 0.55,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {player.controllerName}
          </div>
        </div>
      </div>

      <Focusable
        style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}
      >
        {/* Read-only: changing the profile goes through the hold-to-open
            selector button. */}
        <div
          style={{
            flexGrow: 1,
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            fontWeight: 600,
            opacity: player.profile ? 1 : 0.5,
          }}
        >
          {player.profile ?? "No profile"}
        </div>
        {/* DialogButtonProps doesn't expose pointer handlers, so touch/mouse
            hold lives on this no-box wrapper; gamepad hold is on the button. */}
        <span
          style={{ display: "contents" }}
          onPointerDown={holdOpen.start}
          onPointerUp={holdOpen.cancel}
          onPointerLeave={holdOpen.cancel}
        >
        <DialogButton
          // Hold-to-open profile selector: no onClick on purpose — a tap does
          // nothing, only a full hold fires.
          onButtonDown={(e: GamepadEvent) => {
            if (e.detail.button !== GAMEPAD_OK || e.detail.is_repeat) return;
            holdOpen.start();
          }}
          onButtonUp={(e: GamepadEvent) => {
            if (e.detail.button !== GAMEPAD_OK) return;
            holdOpen.cancel();
          }}
          onGamepadBlur={holdOpen.cancel}
          style={{
            flexShrink: 0,
            minWidth: 0,
            width: "40px",
            height: "40px",
            padding: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
            overflow: "hidden",
          }}
        >
          {/* Steam accent blue — the focused button is solid white, so a white
              fill would be invisible while holding. */}
          <span
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(26, 159, 255, 0.55)",
              transformOrigin: "left",
              transform: holdOpen.holding ? "scaleX(1)" : "scaleX(0)",
              transition: holdOpen.holding
                ? `transform ${HOLD_OPEN_MS}ms linear`
                : "none",
            }}
          />
          <FaUser size={14} style={{ position: "relative" }} />
        </DialogButton>
        </span>
        <DialogButton
          onClick={() => identifyController(player.controllerIndex)}
          style={{
            flexShrink: 0,
            minWidth: 0,
            width: "40px",
            height: "40px",
            padding: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <FaSearch size={14} />
        </DialogButton>
      </Focusable>
    </Focusable>
  );
};

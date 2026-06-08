// Test panel for the headless query callables + live controller input. Remove
// once the real assignment UI replaces it.

import {
  PanelSection,
  PanelSectionRow,
  ButtonItem,
  ToggleField,
} from "@decky/ui";
import { addEventListener, removeEventListener } from "@decky/api";
import { useState, useEffect } from "react";
import {
  listHandlers,
  listDevices,
  startInputMonitor,
  stopInputMonitor,
  type Handler,
  type Device,
  type DeviceFilter,
  type InputEvent,
} from "../lib/partydeckApi";
import {
  getControllers,
  registerInput,
  identifyController,
  GAMEPAD_BUTTON_NAMES,
  type SteamController,
} from "../lib/steamInput";

export function HeadlessQueryPanel() {
  const [steamInput, setSteamInput] = useState(true);
  const [handlers, setHandlers] = useState<Handler[] | null>(null);
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [monitoring, setMonitoring] = useState(false);
  const [lastPress, setLastPress] = useState<Record<string, number>>({});
  const [lastButton, setLastButton] = useState<string | null>(null);

  const [controllers, setControllers] = useState<SteamController[]>([]);
  const [scPress, setScPress] = useState<Record<number, number>>({});
  const [scButton, setScButton] = useState<string | null>(null);

  const filter: DeviceFilter = steamInput ? "only-steam-input" : "no-steam-input";

  const refresh = async () => {
    setError(null);
    try {
      const [h, d] = await Promise.all([listHandlers(), listDevices(filter)]);
      setHandlers(h);
      setDevices(d);
    } catch (e) {
      setError(String(e));
    }
  };

  useEffect(() => {
    const onInput = (evt: InputEvent) => {
      setLastButton(evt.button);
      setLastPress((prev) => ({ ...prev, [evt.path]: Date.now() }));
    };
    addEventListener<[InputEvent]>("partydeck_input", onInput);
    return () => removeEventListener("partydeck_input", onInput);
  }, []);

  const [, force] = useState(0);
  useEffect(() => {
    if (!monitoring) return;
    const id = setInterval(() => force((n) => n + 1), 150);
    return () => clearInterval(id);
  }, [monitoring]);

  useEffect(() => {
    setControllers(getControllers());
    const unsub = registerInput((idx, button, isDown) => {
      if (!isDown) return;
      setScButton(`${GAMEPAD_BUTTON_NAMES[button] ?? `btn${button}`} (ctrl ${idx})`);
      setScPress((prev) => ({ ...prev, [idx]: Date.now() }));
      setControllers(getControllers());
    });
    const id = setInterval(() => {
      setControllers(getControllers());
      force((n) => n + 1);
    }, 200);
    return () => {
      unsub();
      clearInterval(id);
    };
  }, []);

  const scFlashing = (idx: number) =>
    scPress[idx] && Date.now() - scPress[idx] < 400;

  const toggleMonitor = async () => {
    setError(null);
    try {
      if (monitoring) {
        await stopInputMonitor();
        setMonitoring(false);
      } else {
        await refresh();
        const r = await startInputMonitor(filter);
        if (r.started || r.reason === "already running") setMonitoring(true);
      }
    } catch (e) {
      setError(String(e));
    }
  };

  const isFlashing = (path: string) =>
    lastPress[path] && Date.now() - lastPress[path] < 400;

  return (
    <>
    <PanelSection title="Steam controllers (live)">
      <PanelSectionRow>
        <div style={{ fontSize: "0.8em", opacity: 0.7 }}>
          Reads the Deck + pads via SteamClient.Input. Press a button — its row
          flashes. Last: <b>{scButton ?? "—"}</b>
        </div>
      </PanelSectionRow>
      {controllers.length === 0 && (
        <PanelSectionRow>
          <div style={{ fontSize: "0.85em", opacity: 0.6 }}>
            No controllers reported by Steam.
          </div>
        </PanelSectionRow>
      )}
      {controllers.map((c) => (
        <PanelSectionRow key={c.index}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontSize: "0.85em",
              padding: "2px 6px",
              borderRadius: 4,
              background: scFlashing(c.index) ? "#50fa7b" : "transparent",
              color: scFlashing(c.index) ? "#000" : undefined,
            }}
          >
            <span>
              🎮 {c.name}{" "}
              <span style={{ opacity: 0.6 }}>#{c.index}</span>
            </span>
            <ButtonItem
              layout="inline"
              onClick={() => identifyController(c.index)}
            >
              Identify
            </ButtonItem>
          </div>
        </PanelSectionRow>
      ))}
    </PanelSection>

    <PanelSection title="Headless query (test)">
      <PanelSectionRow>
        <ToggleField
          label="Steam Input devices"
          description="On: assignable virtual pads. Off: raw physical devices."
          checked={steamInput}
          onChange={setSteamInput}
        />
      </PanelSectionRow>

      <PanelSectionRow>
        <ButtonItem layout="below" onClick={refresh}>
          Query handlers + devices
        </ButtonItem>
      </PanelSectionRow>

      <PanelSectionRow>
        <ButtonItem layout="below" onClick={toggleMonitor}>
          {monitoring ? "Stop input monitor" : "Start input monitor (press a button!)"}
        </ButtonItem>
      </PanelSectionRow>

      {error && (
        <PanelSectionRow>
          <div style={{ color: "#ff6b6b", fontSize: "0.8em" }}>{error}</div>
        </PanelSectionRow>
      )}

      {monitoring && (
        <PanelSectionRow>
          <div style={{ fontSize: "0.85em", color: "#8be9fd" }}>
            Listening… last button: <b>{lastButton ?? "—"}</b>
          </div>
        </PanelSectionRow>
      )}

      {handlers && (
        <PanelSectionRow>
          <div style={{ fontSize: "0.85em" }}>
            <b>Handlers ({handlers.length}):</b>{" "}
            {handlers.map((h) => h.name).join(", ") || "none"}
          </div>
        </PanelSectionRow>
      )}

      {devices &&
        devices.map((d) => (
          <PanelSectionRow key={d.path}>
            <div
              style={{
                fontSize: "0.85em",
                padding: "2px 6px",
                borderRadius: 4,
                transition: "background 0.1s",
                background: isFlashing(d.path) ? "#50fa7b" : "transparent",
                color: isFlashing(d.path) ? "#000" : undefined,
              }}
            >
              {d.type === "gamepad" ? "🎮" : d.type === "keyboard" ? "⌨️" : d.type === "mouse" ? "🖱️" : "❓"}{" "}
              {d.name} <span style={{ opacity: 0.6 }}>({d.type})</span>
            </div>
          </PanelSectionRow>
        ))}
    </PanelSection>
    </>
  );
}

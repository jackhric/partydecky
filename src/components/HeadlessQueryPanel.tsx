// Test panel: exercises the headless query callables end-to-end (Decky ->
// Python -> partydeck binary -> JSON) and renders the live result. This proves
// the full round-trip on-device; it can be removed once the real assignment UI
// replaces it.

import { PanelSection, PanelSectionRow, ButtonItem } from "@decky/ui";
import { useState } from "react";
import {
  listProfiles,
  listHandlers,
  listDevices,
  type Handler,
  type Device,
  type Profile,
} from "../lib/partydeckApi";

export function HeadlessQueryPanel() {
  const [profiles, setProfiles] = useState<Profile[] | null>(null);
  const [handlers, setHandlers] = useState<Handler[] | null>(null);
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setError(null);
    try {
      // Run the three queries concurrently — each is an independent shell-out.
      const [p, h, d] = await Promise.all([
        listProfiles(),
        listHandlers(),
        listDevices(),
      ]);
      setProfiles(p);
      setHandlers(h);
      setDevices(d);
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <PanelSection title="Headless query (test)">
      <PanelSectionRow>
        <ButtonItem layout="below" onClick={refresh}>
          Query PartyDeck binary
        </ButtonItem>
      </PanelSectionRow>

      {error && (
        <PanelSectionRow>
          <div style={{ color: "#ff6b6b", fontSize: "0.8em" }}>{error}</div>
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

      {profiles && (
        <PanelSectionRow>
          <div style={{ fontSize: "0.85em" }}>
            <b>Profiles ({profiles.length}):</b>{" "}
            {profiles.map((p) => p.name).join(", ") || "none"}
          </div>
        </PanelSectionRow>
      )}

      {devices && (
        <PanelSectionRow>
          <div style={{ fontSize: "0.85em" }}>
            <b>Gamepads:</b>{" "}
            {devices.filter((d) => d.type === "gamepad").length} /{" "}
            {devices.length} input devices
          </div>
        </PanelSectionRow>
      )}
    </PanelSection>
  );
}

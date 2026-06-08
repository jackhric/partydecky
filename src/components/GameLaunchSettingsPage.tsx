// Full-page PartyDeck split-screen co-op launch screen for a single game.
// Reached from the floating button on /library/app/:appid, which navigates to
// /partydeck/game/:appid (see patches/GameButtonPatch.tsx and the route
// registration in index.tsx).
//
// Step 4a (GUI-launch milestone): a one-time Setup step downloads the PartyDeck
// runtime + installs handlers; the Launch button then registers a Steam shortcut
// and asks Steam to run PartyDeck's GUI (so Steam provides the display session).
//
// Setup is split OUT of launch on purpose: the ~46MB download is slow and must
// not block the launch callable (a long blocking callable round-trip surfaces as
// a frontend error). Setup has its own button + spinner; launch is then fast.

import { DialogButton, Focusable, PanelSection, PanelSectionRow, Spinner } from "@decky/ui";
import { callable, toaster } from "@decky/api";
import { FC, useEffect, useState } from "react";
import { FaDownload, FaUsers } from "react-icons/fa";
import { launchViaShortcut } from "../lib/steamShortcut";

// Backend callables (see main.py Plugin). Setup runs in the background (the
// ~46MB download is too slow for one callable round-trip); we poll status.
const setupPartyDeck = callable<[], { started: boolean; reason?: string }>(
  "setup_partydeck"
);
const preparePartyDeck = callable<
  [appid: number],
  { exe: string; directory: string; log: string }
>("prepare_partydeck");
const partyDeckStatus = callable<
  [],
  { binary_installed: boolean; setup_running: boolean; setup_error: string | null }
>("partydeck_status");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Reads the :appid out of the current /partydeck/game/:appid URL. We parse the
// URL rather than threading react-router params because routerHook.addRoute
// renders a bare ComponentType. Returns 0 if it can't be found.
function useRouteAppId(): number {
  return (
    Number(window.location?.href?.match?.(/\/partydeck\/game\/(\d+)/)?.[1]) || 0
  );
}

export const GameLaunchSettingsPage: FC = () => {
  const appId = useRouteAppId();
  const [installed, setInstalled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState<"setup" | "launch" | null>(null);

  useEffect(() => {
    partyDeckStatus()
      .then((s) => setInstalled(s.binary_installed))
      .catch(() => setInstalled(null));
  }, []);

  const onSetup = async () => {
    setBusy("setup");
    try {
      await setupPartyDeck(); // fire-and-forget; runs in the background
      // Poll until installed or an error surfaces (download can take a while).
      for (;;) {
        await sleep(1500);
        const s = await partyDeckStatus();
        if (s.setup_error) {
          throw new Error(s.setup_error);
        }
        if (s.binary_installed) {
          setInstalled(true);
          toaster.toast({ title: "PartyDeck", body: "Runtime installed." });
          break;
        }
        if (!s.setup_running) {
          // Not running and not installed and no error — shouldn't happen, but
          // avoid an infinite loop.
          throw new Error("Setup ended without installing the runtime");
        }
      }
    } catch (e) {
      toaster.toast({ title: "PartyDeck — setup failed", body: String(e) });
    } finally {
      setBusy(null);
    }
  };

  const onLaunch = async () => {
    setBusy("launch");
    try {
      // Backend just verifies install + returns the launcher path (fast now
      // that setup is done). Then Steam runs the shortcut inside the session.
      const info = await preparePartyDeck(appId);
      const shortcutAppId = await launchViaShortcut(info.exe, info.directory);
      if (shortcutAppId === null) {
        throw new Error("Could not create/launch the PartyDeck Steam shortcut");
      }
      toaster.toast({ title: "PartyDeck", body: "Launching co-op…" });
    } catch (e) {
      toaster.toast({ title: "PartyDeck — launch failed", body: String(e) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div style={{ padding: "1rem", height: "100%" }}>
      <PanelSection title="PartyDeck Split-Screen Co-op">
        <PanelSectionRow>
          <div style={{ opacity: 0.8, fontSize: "0.9rem", marginBottom: "0.5rem" }}>
            Launches PartyDeck for this game. You'll pick players and assign
            controllers in PartyDeck's setup screen.
          </div>
        </PanelSectionRow>

        {installed === false && (
          <PanelSectionRow>
            <div style={{ marginBottom: "0.5rem", color: "#e0c060", fontSize: "0.9rem" }}>
              The PartyDeck runtime (~46&nbsp;MB) isn't installed yet. Install it
              once before launching.
            </div>
            <Focusable>
              <DialogButton
                disabled={busy !== null}
                onClick={onSetup}
                style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
              >
                {busy === "setup" ? <Spinner width={20} height={20} /> : <FaDownload />}
                {busy === "setup" ? "Installing…" : "Install PartyDeck runtime"}
              </DialogButton>
            </Focusable>
          </PanelSectionRow>
        )}

        <PanelSectionRow>
          <Focusable>
            <DialogButton
              disabled={busy !== null || installed === false}
              onClick={onLaunch}
              style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
            >
              {busy === "launch" ? <Spinner width={20} height={20} /> : <FaUsers />}
              {busy === "launch" ? "Launching…" : "Launch Co-op"}
            </DialogButton>
          </Focusable>
        </PanelSectionRow>
      </PanelSection>
    </div>
  );
};

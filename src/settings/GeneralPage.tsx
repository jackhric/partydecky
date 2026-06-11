import {
  DialogBody,
  DialogButton,
  DialogControlsSection,
  DialogControlsSectionHeader,
  Field,
  Spinner,
  ToggleField,
} from "@decky/ui";
import { toaster } from "@decky/api";
import { FC, useState } from "react";
import { useConfig } from "./useConfig";
import {
  partydeckStatus,
  preparePartydeck,
  setupPartydeck,
} from "../lib/partydeckApi";
import {
  launchViaShortcut,
  removePartyDeckShortcut,
} from "../lib/steamShortcut";

export const GeneralPage: FC = () => {
  const { config, busy, error, patch } = useConfig();
  const [launching, setLaunching] = useState(false);
  const [resetting, setResetting] = useState(false);

  // Delete the PartyDeck Steam shortcut so the next launch recreates it fresh.
  // Fixes a shortcut left pointing at a stale launcher path (instant-crash on
  // launch). The next Launch / Start will register a new one with the right exe.
  const onResetShortcut = async () => {
    if (resetting) return;
    setResetting(true);
    try {
      const removed = await removePartyDeckShortcut();
      toaster.toast({
        title: "PartyDeck",
        body: removed
          ? "Shortcut removed — it'll be recreated on next launch."
          : "No PartyDeck shortcut found.",
      });
    } catch (e) {
      console.error("[partydeck] reset shortcut failed", e);
      toaster.toast({ title: "PartyDeck", body: `Reset failed: ${e}` });
    } finally {
      setResetting(false);
    }
  };

  // Launch PartyDeck's own GUI via the Steam shortcut (empty handler/players =>
  // the launcher script's GUI fallback). Used to validate the KWin/gamescope
  // launch chain independently of the per-game headless flow.
  const onLaunchGui = async () => {
    if (launching) return;
    setLaunching(true);
    try {
      const status = await partydeckStatus();
      if (!status.binary_installed) {
        if (!status.setup_running) await setupPartydeck();
        toaster.toast({
          title: "PartyDeck",
          body: "Installing PartyDeck — try again in a moment.",
        });
        return;
      }
      const { exe, directory } = await preparePartydeck(0, "", []);
      const appId = await launchViaShortcut(exe, directory);
      if (appId === null) {
        toaster.toast({ title: "PartyDeck", body: "Failed to launch GUI." });
      }
    } catch (e) {
      console.error("[partydeck] GUI launch failed", e);
      toaster.toast({ title: "PartyDeck", body: `Launch failed: ${e}` });
    } finally {
      setLaunching(false);
    }
  };

  if (config === null) {
    return (
      <DialogBody>
        <DialogControlsSection>
          <Field label={<Spinner width={24} height={24} />} />
        </DialogControlsSection>
      </DialogBody>
    );
  }

  return (
    <DialogBody>
      {error && (
        <DialogControlsSection>
          <Field description={<span style={{ color: "#ff6b6b" }}>{error}</span>} />
        </DialogControlsSection>
      )}
      <DialogControlsSection>
        <DialogControlsSectionHeader>General</DialogControlsSectionHeader>
        <ToggleField
          label="Unique per-profile environments"
          description="Gives each profile its own data directories (C:\\Users\\steamuser for Windows games, HOME for Linux native). Disabling this means PartyDeck instances may modify your game's actual save data on disk."
          checked={config.profile_unique_dirs}
          disabled={busy}
          onChange={(v) => patch("profile_unique_dirs", v)}
        />
        <ToggleField
          label="Vertical splitscreen"
          description="Split the screen side-by-side instead of top/bottom when playing with two players. Has no effect with three or more players (always a quarter grid)."
          checked={config.vertical_two_player}
          disabled={busy}
          onChange={(v) => patch("vertical_two_player", v)}
        />
      </DialogControlsSection>

      <DialogControlsSection>
        <DialogControlsSectionHeader>Debug</DialogControlsSectionHeader>
        <Field
          label="Launch PartyDeck GUI"
          description="Launch PartyDeck's own GUI via its Steam shortcut (no preselected game). For testing the launch chain."
        >
          <DialogButton disabled={launching} onClick={onLaunchGui}>
            {launching ? "Launching…" : "Launch"}
          </DialogButton>
        </Field>
        <Field
          label="Reset PartyDeck Shortcut"
          description="Delete and recreate the hidden PartyDeck Steam shortcut. Fixes an instant crash on launch caused by a shortcut pointing at a stale path."
        >
          <DialogButton disabled={resetting} onClick={onResetShortcut}>
            {resetting ? "Resetting…" : "Reset"}
          </DialogButton>
        </Field>
      </DialogControlsSection>
    </DialogBody>
  );
};

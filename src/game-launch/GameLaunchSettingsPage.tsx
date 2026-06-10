// PartyDeck per-game launch screen at /partydeck/game/:appid (reached from the
// floating button on /library/app/:appid). A "press A to join" lobby grid: each
// controller that joins gets a player cell with a profile picker; Start launches
// the assigned instances.

import { Focusable, Navigation, Spinner } from "@decky/ui";
import { toaster } from "@decky/api";
import { SETTINGS_ROUTE } from "../settings/SettingsRoute";
import { FC, useEffect, useMemo, useState } from "react";
import {
  listHandlers,
  listProfiles,
  partydeckStatus,
  preparePartydeck,
  setupPartydeck,
  type Handler,
} from "../lib/partydeckApi";
import { launchViaShortcut } from "../shortcut/steamShortcut";
import { playLaunchGameSound } from "../lib/navSound";
import { getControllers } from "../lib/steamInput";
import { FaExclamationTriangle } from "react-icons/fa";
import { PlayerGrid } from "./PlayerGrid";
import { StartButton } from "./StartButton";
import { usePlayerLobby } from "./usePlayerLobby";
import { useHoldToExit } from "./useHoldToExit";

// Reads the :appid out of the URL — routerHook.addRoute renders a bare
// ComponentType, so there are no react-router params to thread.
function useRouteAppId(): number {
  return (
    Number(window.location?.href?.match?.(/\/partydeck\/game\/(\d+)/)?.[1]) || 0
  );
}

function gameTitle(appId: number): string {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  try {
    return (
      (window as any).appStore?.GetAppOverviewByAppID?.(appId)?.display_name ||
      `App ${appId}`
    );
  } catch {
    return `App ${appId}`;
  }
}

export const GameLaunchSettingsPage: FC = () => {
  const appId = useRouteAppId();
  const title = gameTitle(appId);

  const [handlers, setHandlers] = useState<Handler[] | null>(null);
  const [profiles, setProfiles] = useState<string[] | null>(null);

  useEffect(() => {
    listHandlers()
      .then(setHandlers)
      .catch(() => setHandlers([]));
    listProfiles()
      .then((ps) => setProfiles(ps.map((p) => p.name)))
      .catch(() => setProfiles([]));
  }, []);

  const handler = useMemo(
    () => handlers?.find((h) => h.steam_appid === appId) ?? null,
    [handlers, appId],
  );

  const { players, setProfile, controllerOrderBroken, leavingControllers } =
    usePlayerLobby(profiles ?? []);
  const { onCancel, onButtonDown, onButtonUp, remainingMs } = useHoldToExit();

  const canStart =
    !controllerOrderBroken &&
    players.length > 0 &&
    players.every((p) => p.profile !== null);

  const onStart = async () => {
    if (!canStart || handler === null) return;

    try {
      const status = await partydeckStatus();
      if (!status.binary_installed) {
        // First run: kick off setup and tell the user to retry once it's done.
        if (!status.setup_running) await setupPartydeck();
        toaster.toast({
          title: "PartyDeck",
          body: "Installing PartyDeck — try Start again in a moment.",
        });
        return;
      }

      // Re-resolve each player's XInput slot FRESH at launch from the stable
      // controllerIndex — a reconnect between join and Start can change the slot,
      // and the join-time value would be stale. Array order = split order.
      const live = getControllers();
      const payload = players.map((p) => {
        const cur = live.find((c) => c.index === p.controllerIndex);
        return {
          profile: p.profile as string,
          xinput: cur ? cur.xinput : p.xinput,
        };
      });

      // Guard: every slot must be valid and unique, or two instances bind the
      // same pad (one player drives both, the other is dead). Abort loudly
      // rather than launch a broken session.
      const slots = payload.map((p) => p.xinput);
      if (slots.some((s) => s < 0) || new Set(slots).size !== slots.length) {
        toaster.toast({
          title: "PartyDeck",
          body: "Controller assignment is stale — re-join the controllers and try again.",
        });
        return;
      }

      // All guards passed — the launch is committed from here.
      playLaunchGameSound();

      const { exe, directory } = await preparePartydeck(
        appId,
        handler.name,
        payload,
      );
      // launchOptions stays empty — the game + players live in the sidecar file
      // the launcher script references. ShortcutRedirectPatch handles the UI.
      const shortcutAppId = await launchViaShortcut(exe, directory);
      if (shortcutAppId === null) {
        toaster.toast({ title: "PartyDeck", body: "Failed to launch." });
      }
    } catch (e) {
      console.error("[partydeck] launch failed", e);
      toaster.toast({ title: "PartyDeck", body: `Launch failed: ${e}` });
    }
  };

  const loading = handlers === null || profiles === null;

  return (
    <Focusable
      // Intercept B/Cancel here so a tap doesn't trigger Steam's instant back;
      // exiting requires holding B (see useHoldToExit). The per-player tap-B
      // leave is handled separately by the lobby input listener.
      onCancel={onCancel}
      onButtonDown={onButtonDown}
      onButtonUp={onButtonUp}
      style={{
        // Reserve Steam's top status bar AND bottom button bar (each ~40px) so
        // the page isn't clipped under either. --basicui-header-height is Steam's
        // own top value; the bottom bar has no exposed var, so reserve 40px.
        height: "100%",
        display: "flex",
        flexDirection: "column",
        boxSizing: "border-box",
        paddingTop: "calc(var(--basicui-header-height, 40px) + 1rem)",
        paddingLeft: "1rem",
        paddingRight: "1rem",
        paddingBottom: "calc(40px + 1rem)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1rem",
          borderBottom: "1px solid rgba(255,255,255,0.1)",
          paddingBottom: "0.5rem",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: "0.75rem",
            minWidth: 0,
          }}
        >
          <span
            style={{
              fontSize: "1.3rem",
              fontWeight: 600,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {title}
          </span>
          {handler && (
            <span
              style={{
                fontSize: "0.9rem",
                opacity: 0.6,
                whiteSpace: "nowrap",
              }}
            >
              {handler.win ? "Proton" : "Native"}
              {handler.version ? ` · v${handler.version}` : ""}
            </span>
          )}
        </div>
        {handler ? (
          <StartButton canStart={canStart} onStart={onStart} />
        ) : (
          <span style={{ fontSize: "1.1rem", opacity: 0.7, fontWeight: 600 }}>
            PartyDeck
          </span>
        )}
      </div>

      {loading ? (
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Spinner width={32} height={32} />
        </div>
      ) : !handler ? (
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.5rem",
            opacity: 0.6,
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: "1.1rem", fontWeight: 600 }}>
            No PartyDeck handler for this game
          </div>
          <div style={{ fontSize: "0.9rem" }}>
            PartyDeck doesn't have split-screen support set up for {title}.
          </div>
        </div>
      ) : controllerOrderBroken ? (
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.75rem",
            textAlign: "center",
          }}
        >
          <FaExclamationTriangle size={48} color="#f0c000" />
          <div style={{ fontSize: "1.2rem", fontWeight: 600 }}>
            Sleep mode detected
          </div>
          <div style={{ fontSize: "0.95rem", maxWidth: "32rem" }}>
            Restart SteamOS to allow splitscreen play. Waking from sleep scrambles
            Steam's controller assignment, so players can't be matched to screens
            until you restart.
          </div>
        </div>
      ) : (
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
            paddingTop: "1rem",
          }}
        >
          <PlayerGrid
            players={players}
            profiles={profiles}
            exitRemainingMs={remainingMs}
            leavingControllers={leavingControllers}
            onProfileChange={setProfile}
            onOpenSettings={() =>
              Navigation.Navigate(`${SETTINGS_ROUTE}/profiles`)
            }
          />
        </div>
      )}
    </Focusable>
  );
};

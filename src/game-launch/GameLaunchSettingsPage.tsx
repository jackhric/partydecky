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
  type Handler,
} from "../lib/partydeckApi";
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

  const { players, setProfile } = usePlayerLobby(profiles ?? []);
  const { onCancel, onButtonDown, onButtonUp } = useHoldToExit();

  const canStart =
    players.length > 0 && players.every((p) => p.profile !== null);

  const onStart = () => {
    if (!canStart) return;
    // Backend `launch --players` is not wired yet; surface the assignment so the
    // flow is testable end-to-end on-device until it lands.
    const payload = players.map((p) => ({
      controllerIndex: p.controllerIndex,
      profile: p.profile,
    }));
    console.log("[partydeck] launch payload", { appId, players: payload });
    toaster.toast({
      title: "PartyDeck",
      body: `Launch not wired yet — ${players.length} player(s) ready.`,
    });
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
          <StartButton
            playerCount={players.length}
            canStart={canStart}
            onStart={onStart}
          />
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

// PartyDeck per-game launch screen at /partydeck/game/:appid (reached from the
// floating button on /library/app/:appid). A "press A to join" lobby grid: each
// controller that joins gets a player cell with a profile picker; Start launches
// the assigned instances.

import {
  DialogButton,
  Focusable,
  Navigation,
  ProgressBar,
  Spinner,
} from "@decky/ui";
import { toaster } from "@decky/api";
import { SETTINGS_ROUTE } from "../lib/routes";
import { FC, useCallback, useEffect, useMemo, useState } from "react";
import {
  avatarSrc,
  downloadProton,
  listHandlers,
  listProfiles,
  partydeckStatus,
  preparePartydeck,
  protonStatus,
  setupPartydeck,
  type Handler,
  type ProtonStatus,
} from "../lib/partydeckApi";
import { launchViaShortcut } from "../lib/steamShortcut";
import { startControllerWatch } from "./controllerWatch";
import { playExitMenuSound, playLaunchGameSound } from "./navSound";
import { getControllers } from "./steamInput";
import { FaDownload, FaExclamationTriangle } from "react-icons/fa";
import { PartyDeckHeader } from "../lib/PartyDeckHeader";
import { PlayerGrid } from "./PlayerGrid";
import { StartButton } from "./StartButton";
import { usePlayerLobby } from "./usePlayerLobby";

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
  const [avatars, setAvatars] = useState<Map<string, string>>(new Map());

  // Not folded into `loading`: the status includes a best-effort network check
  // that can take a few seconds cold — render the lobby immediately and swap in
  // the download gate when the status lands.
  const [proton, setProton] = useState<ProtonStatus | null>(null);

  useEffect(() => {
    listHandlers()
      .then(setHandlers)
      .catch(() => setHandlers([]));
    listProfiles()
      .then((ps) => {
        setProfiles(ps.map((p) => p.name));
        setAvatars(
          new Map(
            ps.flatMap((p) => {
              const src = avatarSrc(p);
              return src ? [[p.name, src] as [string, string]] : [];
            }),
          ),
        );
      })
      .catch(() => setProfiles([]));
    protonStatus()
      .then(setProton)
      .catch(() => setProton(null));
  }, []);

  const handler = useMemo(
    () => handlers?.find((h) => h.steam_appid === appId) ?? null,
    [handlers, appId],
  );

  // Proton games can't launch until umu has its runtime + runner on disk —
  // otherwise the launch sits on a black screen downloading gigabytes.
  const protonGate = handler?.win === true && proton?.needs_download === true;
  const protonDownloading = proton?.download_running === true;

  // Poll while gated OR while a download runs. The download is a backend
  // background task that outlives this page, so re-mounting (back out / return)
  // re-reads its live state via the mount effect above; this keeps it ticking
  // so progress and gate-clearing update without a manual refresh.
  useEffect(() => {
    if (!protonGate && !protonDownloading) return undefined;
    const t = setInterval(
      () => protonStatus().then(setProton).catch(() => {}),
      1500,
    );
    return () => clearInterval(t);
  }, [protonGate, protonDownloading]);

  const onExit = useCallback(() => {
    playExitMenuSound();
    Navigation.NavigateBack();
  }, []);

  // Kick off the latest-GE download from the gate. The backend runs it as a
  // background task that outlives this page; we optimistically flip the local
  // status to download_running so the bar shows immediately, then let the poll
  // take over (and reconcile on the next mount if the user backs out).
  const onInstallProton = useCallback(async () => {
    try {
      const res = await downloadProton(true);
      if (res.started === false) return; // already running — poll will show it
      setProton((p) => (p ? { ...p, download_running: true, download_error: null } : p));
    } catch (e) {
      console.error("[partydeck] proton install failed to start", e);
      toaster.toast({ title: "PartyDeck", body: `Install failed: ${e}` });
    }
  }, []);
  // Any non-lobby screen blocks joins (sleep-mode is gated inside the hook).
  // protonGate covers both "needs download" and the in-progress download state,
  // since needs_download stays true until the runtime lands.
  const joinsBlocked =
    handlers === null || profiles === null || handler === null || protonGate;

  const {
    players,
    setProfile,
    controllerOrderBroken,
    leavingControllers,
    exitRemainingMs,
    cancelExitHolds,
  } = usePlayerLobby(profiles ?? [], onExit, joinsBlocked);

  const canStart =
    !controllerOrderBroken &&
    players.length > 0 &&
    players.every((p) => p.profile !== null) &&
    // No two players may share a profile.
    new Set(players.map((p) => p.profile)).size === players.length;

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

      // Stale-state guard: players may have joined before the Proton status
      // arrived; the gate screen handles the steady-state case.
      if (handler.win && proton?.needs_download) {
        toaster.toast({
          title: "PartyDeck",
          body: "Proton runtime needs to be downloaded — see PartyDeck Proton settings.",
        });
        return;
      }

      // Re-resolve each player's XInput slot FRESH at launch from the stable
      // controllerIndex — a reconnect between join and Start can change the slot,
      // and the join-time value would be stale. Array order = split order.
      const live = getControllers();
      const resolved = players.map((p, slot) => {
        const cur = live.find((c) => c.index === p.controllerIndex);
        return {
          slot,
          profile: p.profile as string,
          xinput: cur ? cur.xinput : p.xinput,
          serial: cur?.serial ?? "",
        };
      });
      const payload = resolved.map((p) => ({
        profile: p.profile,
        xinput: p.xinput,
      }));
      const watchPlayers = resolved.map(({ slot, xinput, serial }) => ({
        slot,
        xinput,
        serial,
      }));

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

      // Guard: profiles must be present and distinct. canStart already enforces
      // this so the button is disabled, but re-check in case state changed
      // between render and click (e.g. a player cleared their profile).
      const profileNames = payload.map((p) => p.profile);
      if (
        profileNames.some((p) => !p) ||
        new Set(profileNames).size !== profileNames.length
      ) {
        toaster.toast({
          title: "PartyDeck",
          body: "Each player needs a unique profile — two players can't share one.",
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
      } else {
        startControllerWatch(watchPlayers, shortcutAppId);
      }
    } catch (e) {
      console.error("[partydeck] launch failed", e);
      toaster.toast({ title: "PartyDeck", body: `Launch failed: ${e}` });
    }
  };

  const loading = handlers === null || profiles === null;

  return (
    <Focusable
      // Consume B/Cancel so a tap never triggers Steam's instant back; exiting
      // requires holding B, timed by the lobby's SteamClient.Input listener
      // (see usePlayerLobby), which also handles the per-player tap-B leave.
      onCancel={(e: CustomEvent) => e.stopPropagation?.()}
      // Focus leaving the page (context menu, modal) can swallow the B-up, so
      // treat it as a release.
      onGamepadBlur={cancelExitHolds}
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
      <PartyDeckHeader
        title={title}
        subtitle={
          handler
            ? `${handler.win ? "Proton" : "Native"}${
                handler.version ? ` · v${handler.version}` : ""
              }`
            : undefined
        }
        right={
          handler ? (
            <StartButton canStart={canStart} onStart={onStart} />
          ) : (
            <span style={{ fontSize: "1.1rem", opacity: 0.7, fontWeight: 600 }}>
              PartyDeck
            </span>
          )
        }
      />

      {loading ? (
        // These informational branches have no buttons, but they must still
        // contain something focusable: if gamepad focus sits outside the page,
        // a B press bypasses our onCancel shield and Steam's default instant
        // back-navigation fires. A Focusable with onActivate is itself
        // focusable, so it anchors focus inside the page.
        <Focusable
          onActivate={() => {}}
          noFocusRing
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Spinner width={32} height={32} />
        </Focusable>
      ) : !handler ? (
        <Focusable
          onActivate={() => {}}
          noFocusRing
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
        </Focusable>
      ) : controllerOrderBroken ? (
        <Focusable
          onActivate={() => {}}
          noFocusRing
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
        </Focusable>
      ) : protonGate ? (
        <Focusable
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "1rem",
            textAlign: "center",
          }}
        >
          <FaDownload size={48} style={{ opacity: 0.4 }} />
          <div style={{ fontSize: "1.1rem", fontWeight: 600 }}>
            {protonDownloading
              ? "Installing Proton-GE…"
              : "Proton runtime needed"}
          </div>
          {protonDownloading ? (
            <div style={{ width: "min(28rem, 80%)", marginTop: "0.5rem" }}>
              {/* Steam's ProgressBar only enters indeterminate mode when
                  `indeterminate && nProgress == 0` — and it uses loose `==`,
                  so an undefined nProgress fails the check and it renders an
                  empty 0% bar. Pass an explicit 0. */}
              <ProgressBar indeterminate nProgress={0} nTransitionSec={1} />
              <div
                style={{
                  fontSize: "0.85rem",
                  opacity: 0.6,
                  marginTop: "0.5rem",
                }}
              >
                Downloading the latest Proton-GE runtime. This may take a few
                minutes — you can leave this screen; it keeps going.
              </div>
            </div>
          ) : (
            <>
              <div
                style={{ fontSize: "0.9rem", opacity: 0.6, maxWidth: "32rem" }}
              >
                {proton?.download_error
                  ? `Last attempt failed: ${proton.download_error}`
                  : "PartyDeck's Proton runtime must be downloaded before launching."}
              </div>
              <DialogButton
                onClick={onInstallProton}
                style={{
                  marginTop: "0.5rem",
                  width: "auto",
                  minWidth: 0,
                  height: "48px",
                  flexShrink: 0,
                  padding: "0 2rem",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "0.5rem",
                }}
              >
                <FaDownload size={16} />{" "}
                {proton?.download_error
                  ? "Retry install"
                  : "Install Latest Proton-GE Runtime"}
              </DialogButton>
            </>
          )}
        </Focusable>
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
            avatars={avatars}
            exitRemainingMs={exitRemainingMs}
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

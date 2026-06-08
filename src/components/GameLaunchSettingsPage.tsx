// PartyDeck setup screen for a single game, at /partydeck/game/:appid (reached
// from the floating button on /library/app/:appid). Header + a body that will
// hold the setup steps.

import { FC } from "react";

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

  return (
    <div
      style={{
        // Reserve Steam's top system-bar height so the page isn't clipped under
        // it. --basicui-header-height is Steam's own value (adapts per display);
        // 40px is a fallback if it's ever unset.
        height: "100%",
        display: "flex",
        flexDirection: "column",
        boxSizing: "border-box",
        paddingTop: "calc(var(--basicui-header-height, 40px) + 1rem)",
        paddingLeft: "1rem",
        paddingRight: "1rem",
        paddingBottom: "1rem",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          borderBottom: "1px solid rgba(255,255,255,0.1)",
          paddingBottom: "0.5rem",
        }}
      >
        <span style={{ fontSize: "1.3rem", fontWeight: 600 }}>{title}</span>
        <span style={{ fontSize: "1.1rem", opacity: 0.7, fontWeight: 600 }}>
          PartyDeck
        </span>
      </div>

      <div style={{ flex: 1 }} />
    </div>
  );
};

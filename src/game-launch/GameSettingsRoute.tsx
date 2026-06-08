// Registers the full-page PartyDeck per-game launch-settings route at
// /partydeck/game/:appid. The floating button on the game detail page navigates
// here (see game-launch/GameButtonPatch.tsx).

import { routerHook } from "@decky/api";
import { GameLaunchSettingsPage } from "./GameLaunchSettingsPage";

export const GAME_SETTINGS_ROUTE = "/partydeck/game/:appid";

export function registerGameSettingsRoute(): () => void {
  routerHook.addRoute(GAME_SETTINGS_ROUTE, GameLaunchSettingsPage, {
    exact: true,
  });
  return () => {
    routerHook.removeRoute(GAME_SETTINGS_ROUTE);
  };
}

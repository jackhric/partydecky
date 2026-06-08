/* eslint-disable @typescript-eslint/no-explicit-any */
// Bounces the user away from the PartyDeck shortcut's game-details page.
//
// SteamClient.Apps.RunGame navigates to the launched shortcut's details page (the
// "PartyDeck / Play" menu) on launch AND on game exit; Steam also restores that
// page at boot. Since our shortcut is hidden and plugin-managed, the user never
// wants to see that page.
//
// To avoid even a one-frame flash of the menu, when the page is our shortcut we
// BLANK the rendered content (return null instead of the details page) AND kick
// off a NavigateBack. So even on the frame before navigation completes there's
// nothing to see — not the PartyDeck Play menu. A debounce (in
// shouldRedirectAwayFrom) prevents the navigate-back's re-render from looping.

import { Navigation, afterPatch, findInReactTree } from "@decky/ui";
import { RoutePatch, routerHook } from "@decky/api";
import {
  getPartyDeckShortcutAppId,
  shouldRedirectAwayFrom,
} from "../lib/steamShortcut";

const APP_ROUTE = "/library/app/:appid";

function appIdFromRender(ret: any): number | undefined {
  const overviewNode = findInReactTree(
    ret,
    (x: any) => x?.props?.children?.props?.overview
  );
  return overviewNode?.props?.children?.props?.overview?.appid;
}

function patchRoute(route: string): RoutePatch {
  return routerHook.addPatch(route, (tree: any) => {
    const routeProps = findInReactTree(tree, (x: any) => x?.renderFunc);
    if (!routeProps) {
      return tree;
    }
    afterPatch(routeProps, "renderFunc", (_args: any[], ret: any) => {
      const appId = appIdFromRender(ret);

      // Is this our hidden shortcut's page? (getPartyDeckShortcutAppId lazily
      // resolves the shortcut by name, so this works at boot too.)
      const ourAppId = getPartyDeckShortcutAppId();
      const isOurPage = typeof appId === "number" && appId === ourAppId;
      if (!isOurPage) {
        return ret;
      }

      // Trigger the bounce (debounced one-shot per visit).
      if (shouldRedirectAwayFrom(appId)) {
        // Immediate, not setTimeout(…,0): navigate as early as possible.
        Promise.resolve().then(() => Navigation.NavigateBack());
      }

      // Blank the content so the PartyDeck menu never paints, even for one frame
      // while NavigateBack is in flight.
      return null;
    });
    return tree;
  });
}

export function patchShortcutRedirect(): RoutePatch {
  return patchRoute(APP_ROUTE);
}

export function unpatchShortcutRedirect(patch: RoutePatch): void {
  routerHook.removePatch(APP_ROUTE, patch);
}

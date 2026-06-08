/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-explicit-any */
// Injects PartyDeck's floating launch-settings button onto the game detail page
// (/library/app/:appid). Clicking it navigates to the full-page per-game co-op
// settings screen at /partydeck/game/:appid.
//
// The injection technique (route patch -> walk to the `overview` object ->
// splice a React element into the appDetailsClasses.InnerContainer children) is
// documented in CLAUDE.md under "Injecting UI into Steam's own pages".

import {
  Navigation,
  afterPatch,
  appDetailsClasses,
  createReactTreePatcher,
  findInReactTree,
} from "@decky/ui";
import { RoutePatch, routerHook } from "@decky/api";
import { ReactElement } from "react";
import { PartyDeckLaunchSettingsButtonAnchor } from "../components/PartyDeckLaunchSettingsButton";

const APP_ROUTE = "/library/app/:appid";

function patchLibraryApp(route: string): RoutePatch {
  return routerHook.addPatch(route, (tree: any) => {
    const routeProps = findInReactTree(tree, (x: any) => x?.renderFunc);
    if (routeProps) {
      let appType: number | undefined;
      let appId: number | undefined;
      let appName: string | undefined;

      const patchHandler = createReactTreePatcher(
        [
          (tree: any) => {
            const children = findInReactTree(
              tree,
              (x: any) => x?.props?.children?.props?.overview
            )?.props?.children;
            if (typeof children !== "object") {
              console.debug(`[partydeck] Failed to patch ${route}, @children!`);
              return null;
            }

            const overview = children.props?.overview;
            if (typeof overview !== "object") {
              console.error(`[partydeck] Failed to patch ${route}, @overview!`);
              return null;
            }

            if (typeof overview.app_type !== "number") {
              console.error(`[partydeck] Failed to patch ${route}, @app_type!`);
              return null;
            }

            if (typeof overview.appid !== "number") {
              console.error(`[partydeck] Failed to patch ${route}, @appid!`);
              return null;
            }

            if (typeof overview.display_name !== "string") {
              console.error(
                `[partydeck] Failed to patch ${route}, @display_name!`
              );
              return null;
            }

            ({
              app_type: appType,
              appid: appId,
              display_name: appName,
            } = overview);
            return children;
          },
        ],
        (_: Array<Record<string, unknown>>, ret?: ReactElement) => {
          type ParentElement = ReactElement<{
            children: Array<
              ReactElement<{
                id?: string;
                overview?: unknown;
                onShowLaunchingDetails?: unknown;
              }>
            >;
            className: string;
          }>;
          const parent = findInReactTree(
            ret,
            (x: ParentElement) =>
              Array.isArray(x?.props?.children) &&
              x?.props?.className?.includes(appDetailsClasses.InnerContainer)
          ) as ParentElement;
          if (typeof parent !== "object") {
            console.error(
              `[partydeck] Failed to patch ${route} - parent element not found!`
            );
            return ret;
          }

          if (
            typeof appType !== "number" ||
            typeof appId !== "number" ||
            typeof appName !== "string"
          ) {
            console.error(
              `[partydeck] Failed to patch ${route} - undefined data!`
            );
            return ret;
          }

          const hltbIndex = parent.props.children.findIndex(
            (x) => x.props.id === "hltb-for-deck"
          );
          const appPanelIndex = parent.props.children.findIndex(
            (x) => x.props.overview && x.props.onShowLaunchingDetails
          );
          const targetAppId = appId;
          parent.props.children.splice(
            hltbIndex < 0
              ? appPanelIndex < 0
                ? -1
                : appPanelIndex - 1
              : hltbIndex,
            0,
            <PartyDeckLaunchSettingsButtonAnchor
              appId={appId}
              appName={appName}
              appType={appType}
              onClick={(onDone) => {
                Navigation.Navigate(`/partydeck/game/${targetAppId}`);
                onDone();
              }}
            />
          );

          return ret;
        }
      );

      afterPatch(routeProps, "renderFunc", patchHandler);
    }

    return tree;
  });
}

export function patchGameButton(): RoutePatch {
  return patchLibraryApp(APP_ROUTE);
}

export function unpatchGameButton(patch: RoutePatch): void {
  routerHook.removePatch(APP_ROUTE, patch);
}

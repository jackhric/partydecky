// Registers the full-page avatar picker at /partydeck/profiles/avatar/:name.
// The "Set picture" button on the profiles page navigates here (see
// profiles/ProfilesManagePage.tsx).

import { routerHook } from "@decky/api";
import { AvatarPickerPage } from "./AvatarPickerPage";
import { PROFILE_AVATAR_ROUTE } from "../lib/routes";

export function registerProfileAvatarRoute(): () => void {
  routerHook.addRoute(`${PROFILE_AVATAR_ROUTE}/:name`, AvatarPickerPage, {
    exact: true,
  });
  return () => {
    routerHook.removeRoute(`${PROFILE_AVATAR_ROUTE}/:name`);
  };
}

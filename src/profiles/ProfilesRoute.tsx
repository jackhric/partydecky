import { routerHook } from "@decky/api";
import { ProfilesManagePage } from "./ProfilesManagePage";
import { PROFILES_ROUTE } from "../lib/routes";

export function registerProfilesRoute(): () => void {
  routerHook.addRoute(PROFILES_ROUTE, ProfilesManagePage, { exact: true });
  return () => routerHook.removeRoute(PROFILES_ROUTE);
}

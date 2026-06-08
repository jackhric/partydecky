import { SidebarNavigation } from "@decky/ui";
import { routerHook } from "@decky/api";
import { FC } from "react";
import { FaUser } from "react-icons/fa";
import { ProfilesPage } from "../components/ProfileSettings";

export const SETTINGS_ROUTE = "/partydeck/settings";

const SettingsRouter: FC = () => (
  <SidebarNavigation
    title="PartyDeck Settings"
    pages={[
      {
        title: "Profiles",
        icon: <FaUser />,
        content: <ProfilesPage />,
        route: `${SETTINGS_ROUTE}/profiles`,
      },
    ]}
  />
);

export function registerSettingsRoute(): () => void {
  routerHook.addRoute(SETTINGS_ROUTE, SettingsRouter, { exact: false });
  return () => routerHook.removeRoute(SETTINGS_ROUTE);
}

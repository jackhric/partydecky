import { SidebarNavigation } from "@decky/ui";
import { routerHook } from "@decky/api";
import { FC } from "react";
import { FaUser } from "react-icons/fa";
import { ProfilesManagePage } from "./ProfilesManagePage";
import { PROFILES_ROUTE } from "../lib/routes";

const ProfilesRouter: FC = () => (
  <SidebarNavigation
    pages={[
      {
        title: "Profiles",
        icon: <FaUser />,
        content: <ProfilesManagePage />,
        route: `${PROFILES_ROUTE}/manage`,
        visible: true,
      },
    ]}
  />
);

export function registerProfilesRoute(): () => void {
  routerHook.addRoute(PROFILES_ROUTE, () => <ProfilesRouter />);
  return () => routerHook.removeRoute(PROFILES_ROUTE);
}

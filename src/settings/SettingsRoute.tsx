import { SidebarNavigation } from "@decky/ui";
import { routerHook } from "@decky/api";
import { FC } from "react";
import { FaCog, FaFileAlt, FaUser, FaWindows } from "react-icons/fa";
import { ProfilesPage } from "./ProfilesPage";
import { GeneralPage } from "./GeneralPage";
import { ProtonPage } from "./ProtonPage";
import { LogsPage } from "./LogsPage";
import { SETTINGS_ROUTE } from "../lib/routes";

const SettingsRouter: FC = () => (
  <SidebarNavigation
    pages={[
      {
        title: "Profiles",
        icon: <FaUser />,
        content: <ProfilesPage />,
        route: `${SETTINGS_ROUTE}/profiles`,
        visible: true,
      },
      "separator",
      {
        title: "General",
        icon: <FaCog />,
        content: <GeneralPage />,
        route: `${SETTINGS_ROUTE}/general`,
        visible: true,
      },
      {
        title: "Proton",
        icon: <FaWindows />,
        content: <ProtonPage />,
        route: `${SETTINGS_ROUTE}/proton`,
        visible: true,
      },
      "separator",
      {
        title: "Logs",
        icon: <FaFileAlt />,
        content: <LogsPage />,
        route: `${SETTINGS_ROUTE}/logs`,
        // visible is REQUIRED on every real page — omitting it misaligns the
        // sidebar's DPAD focus indices past the separators.
        visible: true,
      },
    ]}
  />
);

export function registerSettingsRoute(): () => void {
  routerHook.addRoute(SETTINGS_ROUTE, () => <SettingsRouter />);
  return () => routerHook.removeRoute(SETTINGS_ROUTE);
}

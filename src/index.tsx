import {
  ButtonItem,
  Navigation,
  PanelSection,
  PanelSectionRow,
  staticClasses,
} from "@decky/ui";
import { definePlugin } from "@decky/api";
import { FaUsers, FaCog } from "react-icons/fa";
import { patchGameButton, unpatchGameButton } from "./game-launch/GameButtonPatch";
import {
  patchShortcutRedirect,
  unpatchShortcutRedirect,
} from "./shortcut/ShortcutRedirectPatch";
import { registerGameSettingsRoute } from "./game-launch/GameSettingsRoute";
import {
  registerSettingsRoute,
  SETTINGS_ROUTE,
} from "./settings/SettingsRoute";

function Content() {
  const openSettings = () => {
    Navigation.CloseSideMenus();
    Navigation.Navigate(SETTINGS_ROUTE);
  };
  return (
    <PanelSection title="PartyDeck">
      <PanelSectionRow>
        <ButtonItem layout="below" onClick={openSettings} icon={<FaCog />}>
          Settings
        </ButtonItem>
      </PanelSectionRow>
    </PanelSection>
  );
}

export default definePlugin(() => {
  const unregisterGameSettingsRoute = registerGameSettingsRoute();
  const unregisterSettingsRoute = registerSettingsRoute();
  const gameButtonPatch = patchGameButton();
  const shortcutRedirectPatch = patchShortcutRedirect();

  return {
    name: "PartyDeck",
    titleView: <div className={staticClasses.Title}>PartyDeck</div>,
    content: <Content />,
    icon: <FaUsers />,
    onDismount() {
      unpatchGameButton(gameButtonPatch);
      unpatchShortcutRedirect(shortcutRedirectPatch);
      unregisterGameSettingsRoute();
      unregisterSettingsRoute();
    },
  };
});

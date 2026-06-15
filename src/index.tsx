import {
  ButtonItem,
  Navigation,
  PanelSection,
  PanelSectionRow,
  staticClasses,
} from "@decky/ui";
import { definePlugin } from "@decky/api";
import { FaCog } from "react-icons/fa";
import { PartyDeckIcon } from "./lib/PartyDeckIcon";
import { patchGameButton, unpatchGameButton } from "./game-launch/GameButtonPatch";
import {
  patchShortcutRedirect,
  unpatchShortcutRedirect,
} from "./shortcut/ShortcutRedirectPatch";
import { registerGameSettingsRoute } from "./game-launch/GameSettingsRoute";
import { registerSettingsRoute } from "./settings/SettingsRoute";
import { SETTINGS_ROUTE } from "./lib/routes";

function Content() {
  const openSettings = () => {
    Navigation.CloseSideMenus();
    Navigation.Navigate(SETTINGS_ROUTE);
  };
  return (
    <PanelSection title="PartyDeck">
      <PanelSectionRow>
        {/* icon lives in the children, not the icon prop — with layout="below"
            the icon prop renders in the label slot ABOVE the button. */}
        <ButtonItem layout="below" onClick={openSettings}>
          <span
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.5rem",
            }}
          >
            <FaCog /> Settings
          </span>
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
    icon: <PartyDeckIcon />,
    onDismount() {
      unpatchGameButton(gameButtonPatch);
      unpatchShortcutRedirect(shortcutRedirectPatch);
      unregisterGameSettingsRoute();
      unregisterSettingsRoute();
    },
  };
});

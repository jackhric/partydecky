import {
  ButtonItem,
  Navigation,
  PanelSection,
  PanelSectionRow,
  staticClasses,
} from "@decky/ui";
import { definePlugin } from "@decky/api";
import { toaster } from "@decky/api";
import { setActiveLayout } from "./lib/partydeckApi";
import { FaCog, FaUser } from "react-icons/fa";
import { PartyDeckIcon } from "./lib/PartyDeckIcon";
import { patchGameButton, unpatchGameButton } from "./game-launch/GameButtonPatch";
import {
  patchShortcutRedirect,
  unpatchShortcutRedirect,
} from "./shortcut/ShortcutRedirectPatch";
import { registerGameSettingsRoute } from "./game-launch/GameSettingsRoute";
import { registerSettingsRoute } from "./settings/SettingsRoute";
import { registerProfilesRoute } from "./profiles/ProfilesRoute";
import { registerProfileAvatarRoute } from "./profiles/AvatarPickerRoute";
import { registerAgentControl } from "./lib/agentControl";
import { SETTINGS_ROUTE, PROFILES_ROUTE } from "./lib/routes";

function Content() {
  const openSettings = () => {
    Navigation.CloseSideMenus();
    Navigation.Navigate(SETTINGS_ROUTE);
  };
  const openProfiles = () => {
    Navigation.CloseSideMenus();
    Navigation.Navigate(PROFILES_ROUTE);
  };
  const applyLayout = async (preset: string, label: string) => {
    const res = await setActiveLayout({ preset });
    toaster.toast({
      title: "PartyDeck",
      body: res.ok ? `Layout: ${label}` : res.error ?? "Layout change failed",
    });
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
      <PanelSectionRow>
        <ButtonItem layout="below" onClick={openProfiles}>
          <span
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.5rem",
            }}
          >
            <FaUser /> Profiles
          </span>
        </ButtonItem>
      </PanelSectionRow>
      <PanelSectionRow>
        <ButtonItem layout="below" onClick={() => applyLayout("horizontal", "stacked")}>
          Layout: stacked
        </ButtonItem>
      </PanelSectionRow>
      <PanelSectionRow>
        <ButtonItem layout="below" onClick={() => applyLayout("vertical", "side by side")}>
          Layout: side by side
        </ButtonItem>
      </PanelSectionRow>
      <PanelSectionRow>
        <ButtonItem layout="below" onClick={() => applyLayout("grid", "grid")}>
          Layout: grid
        </ButtonItem>
      </PanelSectionRow>
      <PanelSectionRow>
        <ButtonItem layout="below" onClick={() => applyLayout("priority", "focus player 1")}>
          Layout: focus player 1
        </ButtonItem>
      </PanelSectionRow>
    </PanelSection>
  );
}

export default definePlugin(() => {
  const unregisterGameSettingsRoute = registerGameSettingsRoute();
  const unregisterSettingsRoute = registerSettingsRoute();
  const unregisterProfilesRoute = registerProfilesRoute();
  const unregisterProfileAvatarRoute = registerProfileAvatarRoute();
  const gameButtonPatch = patchGameButton();
  const shortcutRedirectPatch = patchShortcutRedirect();
  const unregisterAgentControl = registerAgentControl();

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
      unregisterProfilesRoute();
      unregisterProfileAvatarRoute();
      unregisterAgentControl();
    },
  };
});

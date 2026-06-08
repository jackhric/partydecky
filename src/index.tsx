import {
  ButtonItem,
  PanelSection,
  PanelSectionRow,
  staticClasses,
} from "@decky/ui";
import {
  addEventListener,
  removeEventListener,
  callable,
  definePlugin,
  toaster,
} from "@decky/api";
import { useState } from "react";
import { FaRegSmile } from "react-icons/fa";
import { patchGameButton, unpatchGameButton } from "./patches/GameButtonPatch";
import {
  patchShortcutRedirect,
  unpatchShortcutRedirect,
} from "./patches/ShortcutRedirectPatch";
import { registerGameSettingsRoute } from "./routes/GameSettingsRoute";
import { HeadlessQueryPanel } from "./components/HeadlessQueryPanel";

// Calls the Python method `say_hello(name)` on the backend and returns its
// string result. The first type arg is the argument tuple, the second is the
// return type.
const sayHello = callable<[name: string], string>("say_hello");

// Calls the Python method `ping_later()`. It takes no args, returns nothing,
// and eventually emits a "pong" event back to the frontend.
const pingLater = callable<[], void>("ping_later");

function Content() {
  const [greeting, setGreeting] = useState<string | undefined>();

  const onSayHello = async () => {
    // Ask the backend to greet us.
    const message = await sayHello("Steam Deck");
    setGreeting(message);
  };

  return (
    <PanelSection title="PartyDeck">
      <PanelSectionRow>
        <ButtonItem layout="below" onClick={onSayHello}>
          {greeting ?? "Say hello (via Python)"}
        </ButtonItem>
      </PanelSectionRow>
      <PanelSectionRow>
        <ButtonItem layout="below" onClick={() => pingLater()}>
          Ping me in 3s (backend event)
        </ButtonItem>
      </PanelSectionRow>
      <HeadlessQueryPanel />
    </PanelSection>
  );
}

export default definePlugin(() => {
  console.log("PartyDeck plugin initializing — runs once on frontend startup.");

  // Register the full-page per-game co-op settings route (/partydeck/game/:appid)
  // and inject the floating button on the game detail page that navigates to it.
  const unregisterGameSettingsRoute = registerGameSettingsRoute();
  const gameButtonPatch = patchGameButton();

  // Bounce the user off the hidden PartyDeck shortcut's details page (Steam
  // navigates there on launch/exit/boot).
  const shortcutRedirectPatch = patchShortcutRedirect();

  // Listen for the "pong" event emitted by the Python backend.
  const pongListener = addEventListener<[message: string]>(
    "pong",
    (message) => {
      console.log("PartyDeck got pong:", message);
      toaster.toast({
        title: "PartyDeck",
        body: message,
      });
    }
  );

  return {
    // The name shown in various decky menus.
    name: "PartyDeck",
    // The element displayed at the top of your plugin's menu.
    titleView: <div className={staticClasses.Title}>PartyDeck</div>,
    // The content of your plugin's menu.
    content: <Content />,
    // The icon displayed in the plugin list.
    icon: <FaRegSmile />,
    // Called when the plugin unloads — clean up listeners here.
    onDismount() {
      console.log("Unloading PartyDeck plugin.");
      removeEventListener("pong", pongListener);
      unpatchGameButton(gameButtonPatch);
      unpatchShortcutRedirect(shortcutRedirectPatch);
      unregisterGameSettingsRoute();
    },
  };
});

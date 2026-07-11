// EControllerType codes from Steam (window.ControllerStore m_controllerList).
// Only the ones we expect on a Deck are named; everything else falls back to
// "Controller". Codes documented in decky-frontend-lib's steam-client types.

const CONTROLLER_TYPE_NAMES: Record<number, string> = {
  4: "Steam Deck",
  31: "Xbox 360",
  32: "Xbox One",
  45: "PS5",
  34: "PS4",
  40: "Switch Pro",
  400: "Keyboard",
  800: "Mouse",
};

export function controllerTypeName(type: number): string {
  return CONTROLLER_TYPE_NAMES[type] ?? "Controller";
}

// Steam's own full-controller renders, served at the loopback origin (the
// controller-config screen pulls from the same place). Maps EControllerType to
// the matching device art; unknown types fall back to the generic pad.
const CONTROLLER_IMAGE_BASE =
  "https://steamloopback.host/images/controller/controller_config_controller_";

const CONTROLLER_TYPE_IMAGE: Record<number, string> = {
  4: "steam_deck.svg",
  31: "x360.png",
  32: "xboxone.png",
  45: "ps5.png",
  34: "ps4.png",
  40: "switch_pro.png",
};

export function controllerTypeImage(type: number): string {
  return CONTROLLER_IMAGE_BASE + (CONTROLLER_TYPE_IMAGE[type] ?? "generic.png");
}

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

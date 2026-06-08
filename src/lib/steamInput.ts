// Steam's controller APIs (window.SteamClient.Input / window.ControllerStore).
// These read the Deck's built-in controls AND external pads by index, which
// evdev can't do from an overlay (Steam Input only routes to the focused app).
// Runtime globals, not exported by @decky/api, so reached defensively.

export interface SteamController {
  index: number;
  name: string;
  type: number;
  vendorId: number;
}

// Subset of the ControllerInputGamepadButton enum (full range 0..50).
export const GAMEPAD_BUTTON_NAMES: Record<number, string> = {
  0: "A",
  1: "B",
  2: "X",
  3: "Y",
  4: "Dpad Up",
  5: "Dpad Right",
  6: "Dpad Down",
  7: "Dpad Left",
  8: "Menu",
  9: "View",
  30: "L1",
  31: "R1",
  28: "L2",
  29: "R2",
  35: "Select",
  36: "Start",
  34: "Guide",
};

/* eslint-disable @typescript-eslint/no-explicit-any */
const sc = () => (window as any).SteamClient?.Input;
const store = () => (window as any).ControllerStore;

export function getControllers(): SteamController[] {
  try {
    const list = store()?.m_controllerList ?? [];
    return list.map((c: any) => ({
      index: c.nControllerIndex,
      name: c.strName ?? `Controller ${c.nControllerIndex}`,
      type: c.eControllerType ?? 0,
      vendorId: c.unVendorID ?? 0,
    }));
  } catch {
    return [];
  }
}

export function registerInput(
  cb: (controllerIndex: number, button: number, isDown: boolean) => void,
): () => void {
  const input = sc();
  if (!input?.RegisterForControllerInputMessages) return () => {};
  // Without enabling analog input first, the input callback never fires.
  try {
    input.EnableControllerAnalogInputMessages?.(true);
  } catch {
    /* best effort */
  }
  const reg = input.RegisterForControllerInputMessages(
    (controllerIndex: number, button: number, isDown: boolean) => {
      cb(controllerIndex, button, isDown);
    },
  );
  return () => {
    try {
      reg?.unregister?.();
    } catch {
      /* ignore */
    }
  };
}

// Rumble/LED the physical pad so the user can tell which index it is.
export function identifyController(index: number): void {
  try {
    sc()?.IdentifyController?.(index);
  } catch {
    /* ignore */
  }
}

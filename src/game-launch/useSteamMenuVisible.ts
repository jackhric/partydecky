import { getGamepadNavigationTrees } from "@decky/ui";
import { useEffect, useState } from "react";

// There's no @decky/ui hook for the Steam (main) menu overlay, so this mirrors
// useQuickAccessVisible's implementation against the menu's nav tree. The menu
// renders in its own window whose document.hidden flips as it opens/closes.
const MENU_TREE_ID = "MainNavMenuContainer";

/* eslint-disable @typescript-eslint/no-explicit-any */
function getMenuWindow(): Window | null {
  const trees = getGamepadNavigationTrees() as any[];
  return (
    trees?.find((t) => t?.id === MENU_TREE_ID)?.m_Root?.m_element?.ownerDocument
      ?.defaultView ?? null
  );
}

export function useSteamMenuVisible(): boolean {
  const [isHidden, setIsHidden] = useState(
    getMenuWindow()?.document.hidden ?? true,
  );

  useEffect(() => {
    const menuWindow = getMenuWindow();
    if (menuWindow === null) return;
    const onVisibilityChange = () => setIsHidden(menuWindow.document.hidden);
    menuWindow.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      menuWindow.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  return !isHidden;
}

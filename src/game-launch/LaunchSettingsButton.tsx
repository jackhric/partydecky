// PartyDeck's floating launch-settings button — a circular icon button anchored
// over the game's top capsule / hero image on the /library/app/:appid page.
// Clicking it opens the per-game PartyDeck split-screen co-op settings page.
//
// The injection technique (PLAY-section classes for native styling, CSS-custom-
// property positioning, and a MutationObserver to hide during Steam's fullscreen-
// hero animation) is documented in CLAUDE.md under "Injecting UI into Steam's own
// pages".

import {
  Button,
  Focusable,
  appDetailsClasses,
  appDetailsHeaderClasses,
  basicAppDetailsSectionStylerClasses,
  joinClassNames,
  playSectionClasses,
} from "@decky/ui";
import {
  CSSProperties,
  FC,
  ReactElement,
  useEffect,
  useRef,
  useState,
} from "react";
import { PartyDeckIcon } from "../lib/PartyDeckIcon";

// ---------------------------------------------------------------------------
// Position + style config. (`verticalAlignment` is the horizontal left/right
// edge; `horizontalAlignment` is top/bottom — see CLAUDE.md.)
// ---------------------------------------------------------------------------

export interface ButtonPositionSettings {
  horizontalAlignment: "top" | "bottom";
  verticalAlignment: "left" | "right";
  offsetX: string;
  offsetY: string;
  offsetForHltb: boolean;
  zIndex: string;
}

export interface ButtonStyleSettings {
  showFocusRing: boolean;
  theme: "Default" | "HighContrast" | "Clean";
}

// Bottom-right of the hero, no extra offsets.
const BUTTON_POSITION: ButtonPositionSettings = {
  horizontalAlignment: "bottom",
  verticalAlignment: "right",
  offsetX: "0px",
  offsetY: "0px",
  offsetForHltb: false,
  zIndex: "auto",
};

const BUTTON_STYLE: ButtonStyleSettings = {
  showFocusRing: true,
  theme: "Clean",
};

// ---------------------------------------------------------------------------
// OffsetStyle — :root CSS custom properties driving the anchor position.
// ---------------------------------------------------------------------------

export const achorPositionName = "--partydeck-anchor-pos";
export const xOffsetName = "--partydeck-x-offset";
export const yOffsetName = "--partydeck-y-offset";
export const ySpecialOffsetName = "--partydeck-y-special-offset";

const OffsetStyle: FC<{ buttonPosition?: ButtonPositionSettings }> = ({
  buttonPosition,
}) => {
  if (!buttonPosition) {
    return null;
  }
  return (
    <style>
      {`
        :root {
          ${achorPositionName}: ${
        buttonPosition.horizontalAlignment === "top" ? "static" : "relative"
      };
          ${xOffsetName}: ${buttonPosition.offsetX || "0px"};
          ${yOffsetName}: ${buttonPosition.offsetY || "0px"};
          ${ySpecialOffsetName}: ${buttonPosition.offsetForHltb ? "85px" : "0px"};
        }
      `}
    </style>
  );
};

// ---------------------------------------------------------------------------
// ContainerStyle — absolutely positions the button container over the header.
// ---------------------------------------------------------------------------

const ContainerStyle: FC<{ buttonPosition?: ButtonPositionSettings }> = ({
  buttonPosition,
}) => {
  if (!buttonPosition) {
    return null;
  }

  const defaultVerticalOffset = "2.8vw";
  const defaultHorizontalOffset =
    buttonPosition.horizontalAlignment === "top"
      ? "56px"
      : `16px + var(${ySpecialOffsetName})`;

  return (
    <style>
      {`
        .partydeck-container {
          position: absolute;
          z-index: ${buttonPosition.zIndex || "auto"};
          ${buttonPosition.verticalAlignment}: calc(${defaultVerticalOffset} + var(${xOffsetName}));
          ${buttonPosition.horizontalAlignment}: calc(${defaultHorizontalOffset} + var(${yOffsetName}));
        }
      `}
    </style>
  );
};

// ---------------------------------------------------------------------------
// ButtonStyle — theme variants + shared button rules.
// ---------------------------------------------------------------------------

const HighContrastStyle = (
  <style>
    {`
      .partydeck-button {
        background: #222;
      }

      .partydeck-button:hover {
        background: #50555D;
      }

      .partydeck-button:focus {
        background: #fff;
      }
    `}
  </style>
);

const CleanStyle = (
  <style>
    {`
      .partydeck-button {
        background: rgba(14, 20, 27, 0.5);
      }

      .partydeck-button:hover {
        background: rgba(14, 20, 27, 0.75);
      }
    `}
  </style>
);

function getThemeElement(
  theme: ButtonStyleSettings["theme"]
): ReactElement | null {
  switch (theme) {
    case "HighContrast":
      return HighContrastStyle;
    case "Clean":
      return CleanStyle;
    default:
      return null;
  }
}

const ButtonStyle: FC<{ theme: ButtonStyleSettings["theme"] }> = ({ theme }) => {
  return (
    <>
      {getThemeElement(theme)}
      <style>
        {`
          .partydeck-button {
            margin: 0 !important;
          }

          .partydeck-button svg path {
            fill: currentcolor;
          }
        `}
      </style>
    </>
  );
};

// ---------------------------------------------------------------------------
// Shell — the actual focusable Button with native PLAY-section styling.
// ---------------------------------------------------------------------------

interface ShellProps {
  buttonPosition?: ButtonPositionSettings;
  buttonStyle: ButtonStyleSettings;
  onClick?: (onDone: () => void) => void;
}

export const PartyDeckLaunchSettingsButtonShell: FC<ShellProps> = ({
  onClick,
  buttonPosition,
  buttonStyle,
}) => {
  const [clickPending, setClickPending] = useState(false);
  const handleClick = (() => {
    if (onClick) {
      return () => {
        setClickPending(true);
        onClick(() => setClickPending(false));
      };
    }
    return undefined;
  })();

  return (
    <Focusable
      className={joinClassNames(
        basicAppDetailsSectionStylerClasses.AppButtons,
        "partydeck-container"
      )}
    >
      <OffsetStyle buttonPosition={buttonPosition} />
      <ContainerStyle buttonPosition={buttonPosition} />
      <ButtonStyle theme={buttonStyle.theme} />
      <Focusable>
        <Button
          disabled={clickPending}
          noFocusRing={!buttonStyle.showFocusRing}
          className={joinClassNames(playSectionClasses.MenuButton, "partydeck-button")}
          onClick={handleClick}
        >
          <PartyDeckIcon />
        </Button>
      </Focusable>
    </Focusable>
  );
};

// ---------------------------------------------------------------------------
// Inner — wires the static config into the Shell.
// ---------------------------------------------------------------------------

interface Props {
  appId: number;
  appName: string;
  appType: number;
  onClick?: (onDone: () => void) => void;
}

const PartyDeckLaunchSettingsButtonInner: FC<Props> = ({ onClick }) => {
  return (
    <PartyDeckLaunchSettingsButtonShell
      buttonPosition={BUTTON_POSITION}
      buttonStyle={BUTTON_STYLE}
      onClick={onClick}
    />
  );
};

// ---------------------------------------------------------------------------
// Anchor — zero-height host element that locates the TopCapsule and hides the
// button during Steam's fullscreen-hero enter/exit animation.
// ---------------------------------------------------------------------------

function findTopCapsuleParent(ref: HTMLDivElement | null): Element | null {
  const children = ref?.parentElement?.children;
  if (!children) {
    return null;
  }

  let headerContainer: Element | undefined;
  for (const child of children) {
    if (child.className.includes(appDetailsClasses.Header)) {
      headerContainer = child;
      break;
    }
  }

  if (!headerContainer) {
    return null;
  }

  let topCapsule: Element | null = null;
  for (const child of headerContainer.children) {
    if (child.className.includes(appDetailsHeaderClasses.TopCapsule)) {
      topCapsule = child;
      break;
    }
  }

  return topCapsule;
}

export const PartyDeckLaunchSettingsButtonAnchor: FC<Props> = (props) => {
  // There will be no mutation when the page is loaded (either from exiting the
  // game or just newly opening the page), therefore it's visible by default.
  const [show, setShow] = useState<boolean>(true);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const topCapsule = findTopCapsuleParent(ref?.current);
    if (!topCapsule) {
      console.error("[partydeck] TopCapsule container not found!");
      return;
    }

    const mutationObserver = new MutationObserver((entries) => {
      for (const entry of entries) {
        if (entry.type !== "attributes" || entry.attributeName !== "class") {
          continue;
        }

        const className = (entry.target as Element).className;
        const fullscreenMode =
          className.includes(appDetailsHeaderClasses.FullscreenEnterStart) ||
          className.includes(appDetailsHeaderClasses.FullscreenEnterActive) ||
          className.includes(appDetailsHeaderClasses.FullscreenEnterDone) ||
          className.includes(appDetailsHeaderClasses.FullscreenExitStart) ||
          className.includes(appDetailsHeaderClasses.FullscreenExitActive);
        const fullscreenAborted = className.includes(
          appDetailsHeaderClasses.FullscreenExitDone
        );

        setShow(!fullscreenMode || fullscreenAborted);
      }
    });
    mutationObserver.observe(topCapsule, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => {
      mutationObserver.disconnect();
    };
  }, []);

  return (
    <div
      id="partydeck-launch-settings-anchor"
      ref={ref}
      style={{
        position: `var(${achorPositionName}, relative)` as CSSProperties["position"],
        height: 0,
      }}
    >
      {show && <PartyDeckLaunchSettingsButtonInner {...props} />}
    </div>
  );
};

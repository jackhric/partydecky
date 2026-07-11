import { CSSProperties, FC, ReactNode } from "react";
import { PartyDeckIcon } from "./PartyDeckIcon";

// Shared page header used by the game-launch and profiles full-page routes:
// PartyDeck icon + title on the left, optional subtitle, optional right-slot
// (an action button or status text), with a bottom rule.
export const PartyDeckHeader: FC<{
  title: ReactNode;
  subtitle?: ReactNode;
  // Rendered before the icon (e.g. a Back button on the avatar picker).
  left?: ReactNode;
  right?: ReactNode;
  titleStyle?: CSSProperties;
}> = ({ title, subtitle, left, right, titleStyle }) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: "1rem",
      borderBottom: "1px solid rgba(255,255,255,0.1)",
      paddingBottom: "0.5rem",
    }}
  >
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.75rem",
        minWidth: 0,
      }}
    >
      {left}
      {/* Icon + title + subtitle share a baseline so the icon sits on the text
          line; the group as a whole is center-aligned in the row (above) so it
          stays vertically centered next to a taller left/right slot. */}
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: "0.75rem",
          minWidth: 0,
        }}
      >
        {/* fontSize (not width/height) so the 1em icon tracks the title size.
            translateY compensates the square viewBox's vertical letterbox
            ((1 - 39.3/48.9)/2 ≈ 0.1em) so the glyph bottom hits the baseline. */}
        <PartyDeckIcon
          style={{
            fontSize: "1.3rem",
            flexShrink: 0,
            transform: "translateY(0.1em)",
          }}
        />
        <span
          style={{
            fontSize: "1.3rem",
            fontWeight: 600,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            ...titleStyle,
          }}
        >
          {title}
        </span>
        {subtitle && (
          <span
            style={{
              fontSize: "0.9rem",
              opacity: 0.6,
              whiteSpace: "nowrap",
            }}
          >
            {subtitle}
          </span>
        )}
      </div>
    </div>
    {right}
  </div>
);

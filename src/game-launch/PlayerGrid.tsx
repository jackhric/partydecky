import { DialogButton, Focusable } from "@decky/ui";
import { FC } from "react";
import { FaCog, FaGamepad } from "react-icons/fa";
import { NO_PROFILE_STYLE, PlayerCell } from "./PlayerCell";
import type { Player } from "./usePlayerLobby";

// Steam's own A-button glyph, served at the loopback origin (same place its
// footer legends pull from). Resolution-independent SVG.
const A_BUTTON_GLYPH =
  "https://steamloopback.host/steaminputglyphs/shared_button_a.svg";

interface Props {
  players: Player[];
  profiles: string[];
  /** Profile name -> avatar data-URL, for profiles that have one. */
  avatars: Map<string, string>;
  /** Controllers currently mid B-hold to leave (drives the cell indicator). */
  leavingControllers: Set<number>;
  onProfileChange: (controllerIndex: number, profile: string | null) => void;
  onOpenSettings: () => void;
}

// Columns: 1 player -> 1 col, otherwise 2 cols (so 3 = 2+1, 4 = 2x2). Beyond 4
// it keeps wrapping at 2 wide, matching the "couch grid" feel.
function columnsFor(count: number): number {
  return count <= 1 ? 1 : 2;
}

export const PlayerGrid: FC<Props> = ({
  players,
  profiles,
  avatars,
  leavingControllers,
  onProfileChange,
  onOpenSettings,
}) => {
  // No profiles means nobody can join — point the user at settings to make one.
  if (profiles.length === 0) {
    return (
      <Focusable
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          textAlign: "center",
        }}
      >
        <FaGamepad size={48} style={{ opacity: 0.4 }} />
        <div style={{ fontSize: "1.1rem", fontWeight: 600 }}>
          No profiles exist!
        </div>
        <div style={{ fontSize: "0.9rem", opacity: 0.6 }}>
          Create them in the PartyDeck settings menu
        </div>
        <DialogButton
          onClick={onOpenSettings}
          style={{
            marginTop: "0.5rem",
            width: "auto",
            minWidth: 0,
            height: "48px",
            flexShrink: 0,
            padding: "0 2rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.5rem",
          }}
        >
          <FaCog size={16} /> Settings
        </DialogButton>
      </Focusable>
    );
  }

  if (players.length === 0) {
    return (
      // Must be focusable itself (onActivate, no focusable children): if
      // gamepad focus ever sits outside the page, a B press bypasses the
      // page's onCancel shield and Steam's default instant back fires.
      <Focusable
        onActivate={() => {}}
        noFocusRing
        preferredFocus
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          opacity: 0.5,
        }}
      >
        <FaGamepad size={48} />
        <div
          style={{
            fontSize: "1.1rem",
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: "0.4rem",
          }}
        >
          Press
          <img
            src={A_BUTTON_GLYPH}
            alt="A"
            style={{ height: "1.25em", width: "1.25em" }}
          />
          on a controller to join
        </div>
      </Focusable>
    );
  }

  const cols = columnsFor(players.length);
  const rows = Math.ceil(players.length / cols);

  return (
    <Focusable
      // Fills the space between header and footer; cards divide it evenly so the
      // grid never overflows the page.
      style={{
        flex: 1,
        minHeight: 0,
        display: "grid",
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gridTemplateRows: `repeat(${rows}, 1fr)`,
        gap: "1rem",
      }}
    >
      {NO_PROFILE_STYLE}
      {players.map((p, i) => (
        <PlayerCell
          key={p.controllerIndex}
          player={p}
          index={i}
          profiles={profiles}
          avatars={avatars}
          // Profiles held by OTHER players — disabled in this cell's picker so
          // two players can't share one.
          takenProfiles={
            new Set(
              players
                .filter(
                  (o) =>
                    o.controllerIndex !== p.controllerIndex && o.profile !== null,
                )
                .map((o) => o.profile as string),
            )
          }
          leaving={leavingControllers.has(p.controllerIndex)}
          compact={players.length >= 3}
          onProfileChange={(profile) => onProfileChange(p.controllerIndex, profile)}
        />
      ))}
    </Focusable>
  );
};

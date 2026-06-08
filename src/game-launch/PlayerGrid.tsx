import { Focusable } from "@decky/ui";
import { FC } from "react";
import { FaGamepad } from "react-icons/fa";
import { PlayerCell } from "./PlayerCell";
import type { Player } from "./usePlayerLobby";

interface Props {
  players: Player[];
  profiles: string[];
  onProfileChange: (controllerIndex: number, profile: string) => void;
}

// Columns: 1 player -> 1 col, otherwise 2 cols (so 3 = 2+1, 4 = 2x2). Beyond 4
// it keeps wrapping at 2 wide, matching the "couch grid" feel.
function columnsFor(count: number): number {
  return count <= 1 ? 1 : 2;
}

export const PlayerGrid: FC<Props> = ({ players, profiles, onProfileChange }) => {
  if (players.length === 0) {
    return (
      <div
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
        <div style={{ fontSize: "1.1rem", fontWeight: 600 }}>
          Press A on a controller to join
        </div>
        <div style={{ fontSize: "0.9rem" }}>Press B to leave.</div>
      </div>
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
      {players.map((p, i) => (
        <PlayerCell
          key={p.controllerIndex}
          player={p}
          index={i}
          profiles={profiles}
          onProfileChange={(profile) => onProfileChange(p.controllerIndex, profile)}
        />
      ))}
    </Focusable>
  );
};

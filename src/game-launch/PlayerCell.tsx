import { Dropdown, DialogButton, Focusable } from "@decky/ui";
import { FC } from "react";
import { FaGamepad, FaSearch } from "react-icons/fa";
import { controllerTypeName } from "../lib/controllerType";
import { identifyController } from "../lib/steamInput";
import type { Player } from "./usePlayerLobby";

interface Props {
  player: Player;
  index: number;
  profiles: string[];
  onProfileChange: (profile: string) => void;
}

export const PlayerCell: FC<Props> = ({
  player,
  index,
  profiles,
  onProfileChange,
}) => {
  const options = profiles.map((p) => ({ data: p, label: p }));

  return (
    <Focusable
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0.75rem",
        padding: "1rem",
        borderRadius: "8px",
        background: "rgba(255,255,255,0.06)",
        border: "1px solid rgba(255,255,255,0.1)",
        height: "100%",
        boxSizing: "border-box",
      }}
    >
      <div style={{ fontSize: "0.85em", opacity: 0.6, fontWeight: 600 }}>
        PLAYER {index + 1}
      </div>

      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "0.5rem",
          minHeight: 0,
        }}
      >
        <FaGamepad size={48} />
        <div style={{ textAlign: "center", maxWidth: "100%" }}>
          <div style={{ fontWeight: 600 }}>
            {controllerTypeName(player.controllerType)}
          </div>
          <div
            style={{
              fontSize: "0.8em",
              opacity: 0.55,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {player.controllerName}
          </div>
        </div>
      </div>

      <Focusable
        style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}
      >
        <div style={{ flexGrow: 1, minWidth: 0 }}>
          <Dropdown
            rgOptions={options}
            selectedOption={player.profile}
            onChange={(o) => onProfileChange(o.data as string)}
            strDefaultLabel="Select a profile"
          />
        </div>
        <DialogButton
          onClick={() => identifyController(player.controllerIndex)}
          style={{
            flexShrink: 0,
            minWidth: 0,
            width: "40px",
            height: "40px",
            padding: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <FaSearch size={14} />
        </DialogButton>
      </Focusable>

      <div style={{ fontSize: "0.75em", opacity: 0.4, textAlign: "center" }}>
        Press B to leave
      </div>
    </Focusable>
  );
};

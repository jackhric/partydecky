import {
  DialogBody,
  DialogControlsSection,
  DialogControlsSectionHeader,
  DropdownItem,
  Field,
  Spinner,
  ToggleField,
} from "@decky/ui";
import { FC } from "react";
import { useConfig } from "./useConfig";
import type { PartyConfig } from "../lib/partydeckApi";

type BorderStrength = Exclude<PartyConfig["border_style"], "off">;

const STRENGTH_OPTIONS: { data: BorderStrength; label: string }[] = [
  { data: "faint", label: "Faint" },
  { data: "medium", label: "Medium" },
  { data: "strong", label: "Strong" },
];

export const GeneralPage: FC = () => {
  const { config, busy, patch } = useConfig();

  if (config === null) {
    return (
      <DialogBody>
        <DialogControlsSection>
          <Field label={<Spinner width={24} height={24} />} />
        </DialogControlsSection>
      </DialogBody>
    );
  }

  const bordersEnabled = config.border_style !== "off";
  const strength: BorderStrength =
    config.border_style === "off" ? "faint" : config.border_style;

  return (
    <DialogBody>
      <DialogControlsSection>
        <DialogControlsSectionHeader>Borders</DialogControlsSectionHeader>
        <ToggleField
          label="Borders between screens"
          description="Draw split lines along the shared edges between player screens."
          checked={bordersEnabled}
          disabled={busy}
          onChange={(v) => patch("border_style", v ? strength : "off")}
        />
        {bordersEnabled && (
          <DropdownItem
            label="Border strength"
            description="How prominent the split lines are."
            rgOptions={STRENGTH_OPTIONS}
            selectedOption={strength}
            disabled={busy}
            onChange={(o) => patch("border_style", o.data as BorderStrength)}
          />
        )}
      </DialogControlsSection>
    </DialogBody>
  );
};

import {
  DialogBody,
  DialogControlsSection,
  DialogControlsSectionHeader,
  Field,
  Spinner,
  ToggleField,
} from "@decky/ui";
import { FC } from "react";
import { useConfig } from "./useConfig";

export const GeneralSettingsPage: FC = () => {
  const { config, busy, error, patch } = useConfig();

  if (config === null) {
    return (
      <DialogBody>
        <DialogControlsSection>
          <Field label={<Spinner width={24} height={24} />} />
        </DialogControlsSection>
      </DialogBody>
    );
  }

  return (
    <DialogBody>
      {error && (
        <DialogControlsSection>
          <Field description={<span style={{ color: "#ff6b6b" }}>{error}</span>} />
        </DialogControlsSection>
      )}
      <DialogControlsSection>
        <DialogControlsSectionHeader>General</DialogControlsSectionHeader>
        <ToggleField
          label="Unique per-profile environments"
          description="Gives each profile its own data directories (C:\\Users\\steamuser for Windows games, HOME for Linux native). Disabling this means PartyDeck instances may modify your game's actual save data on disk."
          checked={config.profile_unique_dirs}
          disabled={busy}
          onChange={(v) => patch("profile_unique_dirs", v)}
        />
      </DialogControlsSection>
    </DialogBody>
  );
};

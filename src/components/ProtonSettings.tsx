import {
  ConfirmModal,
  DialogBody,
  DialogButton,
  DialogControlsSection,
  DialogControlsSectionHeader,
  Field,
  Spinner,
  TextField,
  ToggleField,
  showModal,
} from "@decky/ui";
import { FC, useEffect, useState } from "react";
import { FaTrash } from "react-icons/fa";
import { erasePrefixes } from "../lib/partydeckApi";
import { useConfig } from "./useConfig";

export const ProtonSettingsPage: FC = () => {
  const { config, busy, error, setError, patch } = useConfig();

  // Local buffer so typing doesn't fire a backend write per keystroke; commit
  // on blur. Seeded from config once it loads.
  const [version, setVersion] = useState("");
  useEffect(() => {
    if (config) setVersion(config.proton_version);
  }, [config?.proton_version]);

  const commitVersion = () => {
    if (config && version !== config.proton_version) {
      patch("proton_version", version);
    }
  };

  const onErase = () => {
    showModal(
      <ConfirmModal
        strTitle="Erase all Proton prefix data?"
        strDescription="Deletes all Proton prefixes used by PartyDeck. Profile/game-specific data is not erased, but use caution. This can't be undone."
        strOKButtonText="Erase"
        bDestructiveWarning
        onOK={async () => {
          setError(null);
          try {
            await erasePrefixes();
          } catch (e) {
            setError(String(e));
          }
        }}
      />,
    );
  };

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
        <DialogControlsSectionHeader>Proton</DialogControlsSectionHeader>
        <Field
          label="Proton version"
          description="A Proton version name (e.g. GE-Proton for the latest Proton-GE) or an absolute path. Leave blank for GE-Proton."
          childrenContainerWidth="fixed"
        >
          <TextField
            value={version}
            disabled={busy}
            onChange={(e) => setVersion(e.target.value)}
            onBlur={commitVersion}
          />
        </Field>
        <ToggleField
          label="Run instances in separate Proton prefixes"
          description="Each instance gets its own Proton prefix. Uses more disk but generally better compatibility. Leave on if unsure."
          checked={config.proton_separate_pfxs}
          disabled={busy}
          onChange={(v) => patch("proton_separate_pfxs", v)}
        />
        <ToggleField
          label="Run Proton in WoW64 mode"
          description="Runs Proton games in the new Wine WoW64 mode. Leave on if unsure."
          checked={config.proton_wow64}
          disabled={busy}
          onChange={(v) => patch("proton_wow64", v)}
        />
      </DialogControlsSection>
      <DialogControlsSection>
        <DialogControlsSectionHeader>Maintenance</DialogControlsSectionHeader>
        <Field
          label="Erase Proton prefix data"
          description="Deletes all Proton prefixes used by PartyDeck. Profile/game-specific data is not erased, but use caution."
          childrenContainerWidth="fixed"
        >
          <DialogButton
            onClick={onErase}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.5rem",
            }}
          >
            <FaTrash size={16} /> Erase
          </DialogButton>
        </Field>
      </DialogControlsSection>
    </DialogBody>
  );
};

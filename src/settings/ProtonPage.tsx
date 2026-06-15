import {
  ConfirmModal,
  DialogBody,
  DialogButton,
  DialogControlsSection,
  DialogControlsSectionHeader,
  Dropdown,
  Field,
  Spinner,
  ToggleField,
  showModal,
} from "@decky/ui";
import { toaster } from "@decky/api";
import { FC, useEffect, useRef, useState } from "react";
import { FaDownload, FaTrash } from "react-icons/fa";
import {
  ProtonRunner,
  ProtonStatus,
  downloadProton,
  erasePrefixes,
  listProtonRunners,
  protonStatus,
} from "../lib/partydeckApi";
import { useConfig } from "./useConfig";

const AUTO_GE = "GE-Proton"; // umu codename: resolve latest GE, downloading if needed

export const ProtonPage: FC = () => {
  const { config, busy, error, setError, patch } = useConfig();

  const [runners, setRunners] = useState<ProtonRunner[] | null>(null);
  const [status, setStatus] = useState<ProtonStatus | null>(null);
  const wasDownloading = useRef(false);

  const refresh = () => {
    listProtonRunners()
      .then(setRunners)
      .catch(() => setRunners([]));
    protonStatus()
      .then(setStatus)
      .catch(() => setStatus(null));
  };

  useEffect(() => {
    refresh();
  }, []);

  // Poll while a download runs; toast once when it finishes.
  useEffect(() => {
    if (status?.download_running) {
      wasDownloading.current = true;
      const t = setInterval(
        () => protonStatus().then(setStatus).catch(() => {}),
        2000,
      );
      return () => clearInterval(t);
    }
    if (wasDownloading.current && status) {
      wasDownloading.current = false;
      toaster.toast({
        title: "PartyDeck",
        body: status.download_error
          ? `Proton download failed: ${status.download_error}`
          : "Proton runtime ready.",
      });
      listProtonRunners()
        .then(setRunners)
        .catch(() => {});
    }
    return undefined;
  }, [status?.download_running]);

  const onDownload = async () => {
    setError(null);
    try {
      await downloadProton(status?.ge_update_available === true);
      const s = await protonStatus();
      setStatus(s);
    } catch (e) {
      setError(String(e));
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

  // Blank config gets pinned backend-side on the first status call; until the
  // next config fetch the pinned value only exists in `status`.
  const selected = config.proton_version || status?.configured || AUTO_GE;

  const options = [
    ...(runners ?? []).map((r) => ({
      data: r.value,
      label: r.kind === "valve" ? `${r.name} (Valve)` : r.name,
    })),
    { data: AUTO_GE, label: "Always latest GE (auto-download at launch)" },
  ];
  if (selected && !options.some((o) => o.data === selected)) {
    options.push({ data: selected, label: `Current: ${selected}` });
  }

  const downloading = status?.download_running === true;
  const updateAvailable = status?.ge_update_available === true;
  const needsDownload = status?.needs_download === true;
  const canDownload = !downloading && (needsDownload || updateAvailable);

  const statusLines: string[] = [];
  if (status) {
    statusLines.push(
      `steamrt3 runtime: ${status.runtime_installed ? "installed" : "not downloaded"}`,
    );
    statusLines.push(
      `Runner ${status.configured || AUTO_GE}: ${status.runner_installed ? "installed" : "not downloaded"}`,
    );
    if (updateAvailable && status.latest_ge) {
      statusLines.push(`${status.latest_ge} is available`);
    }
    if (status.ge_update_available === null) {
      statusLines.push("(update check unavailable — offline?)");
    }
  }

  return (
    <DialogBody>
      {(error || status?.download_error) && (
        <DialogControlsSection>
          <Field
            description={
              <span style={{ color: "#ff6b6b" }}>
                {error || status?.download_error}
              </span>
            }
          />
        </DialogControlsSection>
      )}
      <DialogControlsSection>
        <DialogControlsSectionHeader>Proton</DialogControlsSectionHeader>
        <Field
          label="Proton runner"
          description="Runners already on this Deck (compatibility tools and Valve Protons). PartyDeck pins a specific version so launches never download unexpectedly."
          childrenContainerWidth="fixed"
        >
          <Dropdown
            rgOptions={options}
            selectedOption={selected}
            disabled={busy || runners === null}
            onChange={(opt) => {
              if (opt.data !== config.proton_version) {
                patch("proton_version", opt.data).then(() =>
                  protonStatus().then(setStatus).catch(() => {}),
                );
              }
            }}
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
        <DialogControlsSectionHeader>
          Runtime &amp; Downloads
        </DialogControlsSectionHeader>
        <Field
          label="Status"
          description={
            status === null ? "Checking…" : statusLines.join(" · ")
          }
          childrenContainerWidth="fixed"
        >
          <DialogButton
            disabled={!canDownload}
            onClick={onDownload}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.5rem",
            }}
          >
            {downloading ? (
              <>
                <Spinner width={16} height={16} /> Downloading…
              </>
            ) : (
              <>
                <FaDownload size={16} />{" "}
                {needsDownload
                  ? "Download"
                  : updateAvailable
                    ? "Update GE"
                    : "Up to date"}
              </>
            )}
          </DialogButton>
        </Field>
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

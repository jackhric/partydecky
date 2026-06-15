import {
  ConfirmModal,
  DialogBody,
  DialogButton,
  DialogControlsSection,
  DialogControlsSectionHeader,
  Field,
  Spinner,
  showModal,
} from "@decky/ui";
import { FC, useEffect, useState } from "react";
import { FaFileAlt, FaSyncAlt, FaUpload } from "react-icons/fa";
import { QRCode } from "react-qrcode-logo";
import { listRunLogs, uploadRunLog, type RunLog } from "../lib/partydeckApi";

const formatSize = (bytes: number): string =>
  bytes < 1024
    ? `${bytes} B`
    : bytes < 1024 * 1024
      ? `${(bytes / 1024).toFixed(1)} KB`
      : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

// Resolve the run's appid to a display name + icon via Steam's global appStore
// (works for non-Steam shortcuts too). Falls back to the handler name baked
// into the log filename, then to a generic label for GUI-fallback runs.
const RunTitle: FC<{ run: RunLog }> = ({ run }) => {
  const [iconBroken, setIconBroken] = useState(false);
  const appStore = (window as any).appStore;
  const overview =
    run.appid !== null ? appStore?.GetAppOverviewByAppID?.(run.appid) : null;
  const name =
    (typeof overview?.display_name === "string" && overview.display_name) ||
    run.handler ||
    "PartyDeck (GUI)";
  const iconUrl = overview ? appStore?.GetIconURLForApp?.(overview) : null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
      <span>{name}</span>
      {iconUrl && !iconBroken && (
        <img
          src={iconUrl}
          onError={() => setIconBroken(true)}
          style={{
            width: "1.4em",
            height: "1.4em",
            borderRadius: "2px",
            objectFit: "cover",
          }}
        />
      )}
    </div>
  );
};

const UploadedModal: FC<{ url: string; closeModal?: () => void }> = ({
  url,
  closeModal,
}) => (
  <ConfirmModal
    strTitle="Log uploaded"
    strOKButtonText="Close"
    bAlertDialog
    closeModal={closeModal}
  >
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "0.75rem",
      }}
    >
      <QRCode value={url} size={160} quietZone={8} />
      <span style={{ fontSize: "1.1rem", userSelect: "text" }}>{url}</span>
      <span style={{ fontSize: "0.8rem", opacity: 0.7 }}>
        Unlisted paste, expires in 1 month.
      </span>
    </div>
  </ConfirmModal>
);

export const LogsPage: FC = () => {
  const [runs, setRuns] = useState<RunLog[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);

  const refresh = () =>
    listRunLogs()
      .then(setRuns)
      .catch((e) => setError(String(e)));

  useEffect(() => {
    refresh();
  }, []);

  const onUpload = async (filename: string) => {
    setUploading(filename);
    setError(null);
    try {
      const { url } = await uploadRunLog(filename);
      showModal(<UploadedModal url={url} />);
    } catch (e) {
      setError(String(e));
    } finally {
      setUploading(null);
    }
  };

  const canUpload = uploading === null;

  return (
    <DialogBody>
      {error && (
        <DialogControlsSection>
          <Field description={<span style={{ color: "#ff6b6b" }}>{error}</span>} />
        </DialogControlsSection>
      )}

      <DialogControlsSection>
        <DialogControlsSectionHeader>Run Logs</DialogControlsSectionHeader>
        <DialogButton
          onClick={refresh}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.5rem",
          }}
        >
          <FaSyncAlt size={16} /> Refresh
        </DialogButton>
        {runs === null ? (
          <Field label={<Spinner width={24} height={24} />} />
        ) : runs.length === 0 ? (
          <Field description="No runs yet. Launch a game to create one." />
        ) : (
          runs.map((r) => (
            <Field
              key={r.filename}
              label={<RunTitle run={r} />}
              icon={<FaFileAlt />}
              description={`${new Date(r.timestamp * 1000).toLocaleString()} — ${formatSize(r.size_bytes)}`}
              childrenContainerWidth="fixed"
            >
              <DialogButton
                disabled={!canUpload}
                onClick={() => onUpload(r.filename)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "0.5rem",
                }}
              >
                {uploading === r.filename ? (
                  <Spinner width={16} height={16} />
                ) : (
                  <FaUpload size={16} />
                )}{" "}
                Upload
              </DialogButton>
            </Field>
          ))
        )}
      </DialogControlsSection>
    </DialogBody>
  );
};

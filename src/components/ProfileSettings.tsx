import {
  ConfirmModal,
  DialogButton,
  Field,
  Focusable,
  PanelSection,
  PanelSectionRow,
  Spinner,
  TextField,
  showModal,
} from "@decky/ui";
import { FC, useEffect, useMemo, useState } from "react";
import { FaDice, FaTrash, FaUser, FaUserPlus } from "react-icons/fa";
import {
  listProfiles,
  createProfile,
  deleteProfile,
  type Profile,
} from "../lib/partydeckApi";

// PartyDeck's built-in guest-name pool (src/profiles.rs GUEST_NAMES), used for
// the random-name suggestion.
const GUEST_NAMES = [
  "Blinky", "Pinky", "Inky", "Clyde", "Beatrice", "Battler", "Miyao", "Rena",
  "Ellie", "Joel", "Leon", "Ada", "Madeline", "Theo", "Yokatta", "Wyrm",
  "Brodiee", "Supreme", "Conk", "Gort", "Lich", "Smores", "Canary", "Trico",
  "Yorda", "Wander", "Agro", "Jak", "Daxter", "Soap", "Ghost", "Tomi", "Masaki",
];

const isAlphanumeric = (s: string) => /^[A-Za-z0-9]+$/.test(s);

export const ProfilesPage: FC = () => {
  const [profiles, setProfiles] = useState<Profile[] | null>(null);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = () =>
    listProfiles()
      .then(setProfiles)
      .catch((e) => setError(String(e)));

  useEffect(() => {
    refresh();
  }, []);

  const taken = useMemo(
    () => new Set((profiles ?? []).map((p) => p.name.toLowerCase())),
    [profiles],
  );

  // Live validation for the name field. null = ok, string = reason it's invalid.
  const nameProblem = useMemo<string | null>(() => {
    const n = newName.trim();
    if (!n) return null; // empty: just disable Add, no error shown
    if (!isAlphanumeric(n)) return "Letters and numbers only.";
    if (taken.has(n.toLowerCase())) return "A profile with that name exists.";
    return null;
  }, [newName, taken]);

  const canAdd = !busy && newName.trim().length > 0 && nameProblem === null;

  const onRandom = () => {
    const pool = GUEST_NAMES.filter((n) => !taken.has(n.toLowerCase()));
    const from = pool.length ? pool : GUEST_NAMES;
    setNewName(from[Math.floor(Math.random() * from.length)]);
  };

  const onAdd = async () => {
    if (!canAdd) return;
    setBusy(true);
    setError(null);
    try {
      setProfiles(await createProfile(newName.trim()));
      setNewName("");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const onDelete = (name: string) => {
    showModal(
      <ConfirmModal
        strTitle={`Delete profile "${name}"?`}
        strDescription="This removes the profile and its saved game data. This can't be undone."
        strOKButtonText="Delete"
        bDestructiveWarning
        onOK={async () => {
          setBusy(true);
          setError(null);
          try {
            setProfiles(await deleteProfile(name));
          } catch (e) {
            setError(String(e));
          } finally {
            setBusy(false);
          }
        }}
      />,
    );
  };

  return (
    <>
      <PanelSection title="Add profile">
        <PanelSectionRow>
          <div
            style={{
              fontSize: "0.75em",
              color: "rgba(255,255,255,0.5)",
              marginBottom: "0.25rem",
            }}
          >
            NAME
          </div>
          <Focusable style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <div style={{ flex: 1 }}>
              <TextField
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>
            <DialogButton
              onClick={onRandom}
              disabled={busy}
              style={{
                minWidth: 0,
                width: "40px",
                height: "40px",
                padding: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <FaDice size={18} />
            </DialogButton>
          </Focusable>
        </PanelSectionRow>
        <PanelSectionRow>
          <div
            style={{
              fontSize: "0.8em",
              color: nameProblem ? "#ff6b6b" : "rgba(255,255,255,0.5)",
              minHeight: "1.2em",
              marginBottom: "0.5rem",
            }}
          >
            {nameProblem ?? "Letters and numbers, used as the in-game account name."}
          </div>
        </PanelSectionRow>
        <PanelSectionRow>
          <DialogButton
            disabled={!canAdd}
            onClick={onAdd}
            style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem" }}
          >
            <FaUserPlus size={16} /> Add profile
          </DialogButton>
        </PanelSectionRow>
      </PanelSection>

      <PanelSection title="Profiles">
        {error && (
          <PanelSectionRow>
            <div style={{ color: "#ff6b6b", fontSize: "0.85em" }}>{error}</div>
          </PanelSectionRow>
        )}
        {profiles === null ? (
          <PanelSectionRow>
            <Spinner width={24} height={24} />
          </PanelSectionRow>
        ) : profiles.length === 0 ? (
          <PanelSectionRow>
            <div style={{ opacity: 0.6 }}>No profiles yet.</div>
          </PanelSectionRow>
        ) : (
          profiles.map((p) => (
            <PanelSectionRow key={p.name}>
              <div style={{ marginBottom: "0.5rem" }}>
                <Field
                  label={p.name}
                  icon={<FaUser />}
                  childrenLayout="inline"
                  bottomSeparator="standard"
                >
                <DialogButton
                  disabled={busy}
                  onClick={() => onDelete(p.name)}
                  style={{
                    minWidth: 0,
                    width: "40px",
                    height: "40px",
                    padding: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <FaTrash size={16} />
                </DialogButton>
                </Field>
              </div>
            </PanelSectionRow>
          ))
        )}
      </PanelSection>
    </>
  );
};

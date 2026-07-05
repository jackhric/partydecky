import {
  ConfirmModal,
  DialogBody,
  DialogButton,
  DialogControlsSection,
  DialogControlsSectionHeader,
  Field,
  Focusable,
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

export const ProfilesManagePage: FC = () => {
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
    <DialogBody>
      {error && (
        <DialogControlsSection>
          <Field description={<span style={{ color: "#ff6b6b" }}>{error}</span>} />
        </DialogControlsSection>
      )}

      <DialogControlsSection>
        <DialogControlsSectionHeader>Add Profile</DialogControlsSectionHeader>
        <Field
          label="Name"
          description={
            nameProblem ? (
              <span style={{ color: "#ff6b6b" }}>{nameProblem}</span>
            ) : (
              "Letters and numbers, used as the in-game account name."
            )
          }
          childrenContainerWidth="max"
          childrenLayout="below"
        >
          <Focusable
            style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}
          >
            <div style={{ flexGrow: 1 }}>
              <TextField
                value={newName}
                disabled={busy}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>
            <DialogButton
              onClick={onRandom}
              disabled={busy}
              style={{
                flexShrink: 0,
                width: "44px",
                minWidth: 0,
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
        </Field>
        <DialogButton
          disabled={!canAdd}
          onClick={onAdd}
          style={{
            width: "100%",
            marginTop: "0.5rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.5rem",
          }}
        >
          <FaUserPlus size={16} /> Add profile
        </DialogButton>
      </DialogControlsSection>

      <DialogControlsSection>
        <DialogControlsSectionHeader>Profiles</DialogControlsSectionHeader>
        {profiles === null ? (
          <Field label={<Spinner width={24} height={24} />} />
        ) : profiles.length === 0 ? (
          <Field description="No profiles yet." />
        ) : (
          profiles.map((p) => (
            <Field
              key={p.name}
              label={p.name}
              icon={<FaUser />}
              childrenContainerWidth="fixed"
            >
              <DialogButton
                disabled={busy}
                onClick={() => onDelete(p.name)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "0.5rem",
                }}
              >
                <FaTrash size={16} /> Delete
              </DialogButton>
            </Field>
          ))
        )}
      </DialogControlsSection>
    </DialogBody>
  );
};

import {
  ConfirmModal,
  DialogBody,
  DialogButton,
  DialogControlsSection,
  DialogControlsSectionHeader,
  Field,
  Focusable,
  Navigation,
  Spinner,
  TextField,
  showModal,
} from "@decky/ui";
import { FC, useEffect, useMemo, useState } from "react";
import { FaDice, FaImage, FaTrash, FaUser, FaUserPlus } from "react-icons/fa";
import {
  listProfiles,
  createProfile,
  deleteProfile,
  avatarSrc,
  type Profile,
} from "../lib/partydeckApi";
import { PROFILE_AVATAR_ROUTE } from "../lib/routes";
import { PartyDeckHeader } from "../lib/PartyDeckHeader";

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

  // Re-list after returning from the avatar picker route so a changed picture
  // shows without a manual reload.
  useEffect(() => {
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
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

  const onSetPicture = (profile: Profile) => {
    Navigation.Navigate(
      `${PROFILE_AVATAR_ROUTE}/${encodeURIComponent(profile.name)}`,
    );
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
    <Focusable
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        boxSizing: "border-box",
        paddingTop: "calc(var(--basicui-header-height, 40px) + 1rem)",
        paddingLeft: "1rem",
        paddingRight: "1rem",
        paddingBottom: "calc(40px + 1rem)",
      }}
    >
      <PartyDeckHeader title="Profiles" />
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", paddingTop: "1rem" }}>
      <DialogBody>
      {error && (
        <DialogControlsSection>
          <Field description={<span style={{ color: "#ff6b6b" }}>{error}</span>} />
        </DialogControlsSection>
      )}

      <Focusable style={{ display: "flex", gap: "1rem", alignItems: "flex-start" }}>
        <DialogControlsSection style={{ flex: "1 1 0", minWidth: 0 }}>
          <DialogControlsSectionHeader>Add Profile</DialogControlsSectionHeader>
          <Focusable
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "0.5rem",
              marginTop: "0.5rem",
            }}
          >
            <div style={{ fontWeight: 600 }}>Name</div>
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
            <div
              style={{
                fontSize: "0.85rem",
                opacity: 0.6,
                ...(nameProblem ? { color: "#ff6b6b", opacity: 1 } : {}),
              }}
            >
              {nameProblem ?? "Letters and numbers, used as the in-game account name."}
            </div>
          </Focusable>
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

        <DialogControlsSection style={{ flex: "1 1 0", minWidth: 0 }}>
          <DialogControlsSectionHeader>Profiles</DialogControlsSectionHeader>
          {profiles === null ? (
            <Field label={<Spinner width={24} height={24} />} />
          ) : profiles.length === 0 ? (
            <Field description="No profiles yet." />
          ) : (
            <Focusable
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.75rem",
                marginTop:"0.5rem"
              }}
            >
              {profiles.map((p) => {
                const src = avatarSrc(p);
                return (
                  <Focusable
                    key={p.name}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.75rem",
                      padding: "0.5rem",
                      background: "rgba(255,255,255,0.05)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      borderRadius:"2px"
                    }}
                  >
                    <div
                      style={{
                        flexShrink: 0,
                        width: "72px",
                        height: "72px",
                        padding: "4px",
                        boxSizing: "border-box",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: "rgba(255,255,255,0.08)",
                      }}
                    >
                      {src ? (
                        <img
                          src={src}
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                          }}
                        />
                      ) : (
                        <FaUser size={48} style={{ opacity: 0.6 }} />
                      )}
                    </div>
                    <div
                      style={{
                        flexGrow: 1,
                        minWidth: 0,
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.5rem",
                      }}
                    >
                      <div
                        style={{
                          fontWeight: 600,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {p.name}
                      </div>
                      <Focusable
                        style={{ display: "flex", gap: "0.5rem", alignItems: "stretch" }}
                      >
                        <DialogButton
                          disabled={busy}
                          onClick={() => onSetPicture(p)}
                          style={{
                            flexGrow: 1,
                            minWidth: 0,
                            height: "40px",
                            padding: "0 0.5rem",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "0.5rem",
                          }}
                        >
                          <FaImage size={16} /> Set picture
                        </DialogButton>
                        <DialogButton
                          disabled={busy}
                          onClick={() => onDelete(p.name)}
                          style={{
                            flexShrink: 0,
                            width: "36px",
                            minWidth: 0,
                            height: "40px",
                            padding: 0,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <FaTrash size={14} />
                        </DialogButton>
                      </Focusable>
                    </div>
                  </Focusable>
                );
              })}
            </Focusable>
          )}
        </DialogControlsSection>
      </Focusable>
      </DialogBody>
      </div>
    </Focusable>
  );
};

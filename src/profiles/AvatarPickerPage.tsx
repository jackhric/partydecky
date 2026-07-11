// Full-page avatar picker at /partydeck/profiles/avatar/:name, reached from the
// "Set picture" button on the profiles page. Picks a built-in or file avatar
// for one profile, then NavigateBack.

import {
  DialogButton,
  Field,
  Focusable,
  Navigation,
  Spinner,
} from "@decky/ui";
import { FileSelectionType, openFilePicker } from "@decky/api";
import { FC, useEffect, useState } from "react";
import { FaArrowLeft, FaUser } from "react-icons/fa";
import {
  avatarSrc,
  b64Src,
  clearProfileAvatar,
  listBuiltinAvatars,
  listProfiles,
  setProfileAvatar,
  setProfileAvatarBuiltin,
  type BuiltinAvatar,
  type Profile,
} from "../lib/partydeckApi";
import { PartyDeckHeader } from "../lib/PartyDeckHeader";

function useRouteProfileName(): string {
  const m = window.location?.href?.match?.(
    /\/partydeck\/profiles\/avatar\/([^/?#]+)/,
  );
  return m ? decodeURIComponent(m[1]) : "";
}

export const AvatarPickerPage: FC = () => {
  const name = useRouteProfileName();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [builtins, setBuiltins] = useState<BuiltinAvatar[] | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listProfiles()
      .then((ps) => setProfile(ps.find((p) => p.name === name) ?? null))
      .catch((e) => setError(String(e)))
      .finally(() => setLoaded(true));
    listBuiltinAvatars()
      .then(setBuiltins)
      .catch((e) => setError(String(e)));
  }, [name]);

  const onBack = () => Navigation.NavigateBack();

  const apply = async (fn: () => Promise<Profile[]>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      Navigation.NavigateBack();
    } catch (e) {
      setError(String(e));
      setBusy(false);
    }
  };

  const onPickFile = async () => {
    let res;
    try {
      res = await openFilePicker(
        FileSelectionType.FILE,
        "/home/deck",
        true,
        false,
        undefined,
        ["png"],
      );
    } catch {
      return; // user cancelled the picker
    }
    if (res) await apply(() => setProfileAvatar(name, res.realpath));
  };

  const header = (
    <PartyDeckHeader
      title="Set Avatar"
      left={
        <DialogButton
          onClick={onBack}
          style={{
            alignSelf: "center",
            width: "44px",
            minWidth: 0,
            height: "40px",
            padding: 0,
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <FaArrowLeft size={16} />
        </DialogButton>
      }
      right={
        <div
          style={{ display: "flex", alignItems: "center", gap: "0.75rem", minWidth: 0 }}
        >
          <span
            style={{
              fontWeight: 600,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {name}
          </span>
          <div
            style={{
              flexShrink: 0,
              width: "44px",
              height: "44px",
              padding: "4px",
              boxSizing: "border-box",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(255,255,255,0.08)",
            }}
          >
            {profile && avatarSrc(profile) ? (
              <img
                src={avatarSrc(profile)!}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              <FaUser size={28} style={{ opacity: 0.6 }} />
            )}
          </div>
        </div>
      }
    />
  );

  const notFound = loaded && (!name || profile === null);

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
      {header}

      {error && (
        <Field description={<span style={{ color: "#ff6b6b" }}>{error}</span>} />
      )}

      {notFound ? (
        <Focusable
          onActivate={() => {}}
          noFocusRing
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.5rem",
            opacity: 0.6,
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: "1.1rem", fontWeight: 600 }}>
            Profile not found
          </div>
          <DialogButton onClick={onBack} style={{ marginTop: "0.5rem" }}>
            Back
          </DialogButton>
        </Focusable>
      ) : !loaded || builtins === null ? (
        <Focusable
          onActivate={() => {}}
          noFocusRing
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Spinner width={32} height={32} />
        </Focusable>
      ) : (
        <Focusable
          flow-children="horizontal"
          style={{
            paddingTop: "1rem",
            display: "flex",
            gap: "1rem",
            minHeight: 0,
            flex: 1,
          }}
        >
          <Focusable
            style={{
              flex: "0 0 30%",
              display: "flex",
              flexDirection: "column",
              gap: "0.5rem",
            }}
          >
            <DialogButton disabled={busy} onClick={onPickFile}>
              Choose file…
            </DialogButton>
            {profile && avatarSrc(profile) && (
              <DialogButton
                disabled={busy}
                onClick={() => apply(() => clearProfileAvatar(name))}
              >
                Remove picture
              </DialogButton>
            )}
          </Focusable>
          <Focusable
            style={{
              flex: "1 1 70%",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(64px, 1fr))",
              gap: "0.75rem",
              padding: "0.25rem 0",
              alignContent: "start",
              overflowY: "auto",
            }}
          >
            {builtins.map((a) => (
              <DialogButton
                key={a.id}
                disabled={busy}
                onClick={() => apply(() => setProfileAvatarBuiltin(name, a.id))}
                style={{
                  padding: "4px",
                  minWidth: 0,
                  aspectRatio: "1 / 1",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <img
                  src={b64Src(a.b64)}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              </DialogButton>
            ))}
          </Focusable>
        </Focusable>
      )}
    </Focusable>
  );
};

// Steam non-Steam-shortcut helpers for launching PartyDeck.
//
// Why a shortcut + RunGame (not a backend subprocess): the Decky plugin_loader
// process has no display session, so spawning the nested KWin GUI from Python
// fails to attach to Gaming Mode's compositor. Letting STEAM launch a registered
// shortcut means Steam provides the real session (compositor, focus, input).
// We keep a single PERSISTENT shortcut and
// reuse it (create-once), avoiding the per-launch churn that can corrupt Steam's
// shortcut state.

import { sleep } from "@decky/ui";
import { getShortcutArtwork, type ShortcutArtwork } from "./partydeckApi";
import { syncSessionResolution } from "./sessionResolution";

const SHORTCUT_NAME = "PartyDeck";

// ── Redirect-suppression state ───────────────────────────────────────
// RunGame makes Steam navigate to the shortcut's game-details page (the "Play"
// menu) on launch AND on game exit; Steam also restores that page at boot. The
// user has no reason to be on our HIDDEN, plugin-managed shortcut's page, so the
// route patch (shortcut/ShortcutRedirectPatch.tsx) bounces away from it whenever
// it's shown. We expose the appId so the patch knows which page is "ours", plus
// a short re-entrancy debounce so NavigateBack's re-render doesn't loop.
let partyDeckShortcutAppId: number | null = null;
let lastRedirectAt = 0;

export function getPartyDeckShortcutAppId(): number | null {
  return partyDeckShortcutAppId;
}

/** True if the patch should NavigateBack now. Debounced so the NavigateBack's
 *  own re-render doesn't immediately re-trigger (which would fight the user).
 *  Lazily resolves our shortcut appId so this also works at boot, before any
 *  launch has run this session. */
export function shouldRedirectAwayFrom(appId: number): boolean {
  if (partyDeckShortcutAppId === null) {
    findExistingShortcut(); // populates partyDeckShortcutAppId if the shortcut exists
  }
  if (partyDeckShortcutAppId === null || appId !== partyDeckShortcutAppId) {
    return false;
  }
  const now = Date.now();
  if (now - lastRedirectAt < 1500) {
    return false;
  }
  lastRedirectAt = now;
  return true;
}

// AppStore overview accessor — Steam exposes a global appStore at runtime; it's
// not in @decky/ui's typings, so we reach it loosely.
function getOverview(appId: number): any {
  return (window as any)?.appStore?.GetAppOverviewByAppID?.(appId) ?? null;
}

// collectionStore is the runtime global that owns library visibility. There is
// no SteamClient method to hide an app — hiding is collectionStore-only.
// Reached loosely like appStore.
function getCollectionStore(): any {
  return (window as any)?.collectionStore ?? null;
}

// Hide the shortcut from the library/collections so it doesn't clutter the user's
// games. A hidden shortcut still launches normally via RunGame. Note: hiding
// removes it from any other collections too — fine, since this is a
// plugin-managed launcher entry.
async function hideShortcut(appId: number): Promise<void> {
  const store = getCollectionStore();
  if (!store?.SetAppsAsHidden) {
    return; // collectionStore shape changed; non-fatal, shortcut just stays visible
  }
  if (store.BIsHidden?.(appId) === true) {
    return; // already hidden
  }
  store.SetAppsAsHidden([appId], true);
  // Confirm it took (Steam applies it asynchronously).
  const start = Date.now();
  while (Date.now() - start < 3000) {
    if (store.BIsHidden?.(appId) === true) return;
    await sleep(250);
  }
}

// Wait until predicate(overview) holds (or timeout) — shortcut creation is
// async inside Steam.
async function waitForOverview(
  appId: number,
  predicate: (o: any) => boolean,
  timeoutMs = 5000
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate(getOverview(appId))) return true;
    await sleep(100);
  }
  return predicate(getOverview(appId));
}

// EAppType.Shortcut — non-Steam shortcuts carry this app_type (verified in
// @decky/ui's App.d.ts: EAppType.Shortcut = 1073741824).
const APP_TYPE_SHORTCUT = 1073741824;

// ELibraryAssetType values (per @decky/ui's App.d.ts — it's a declared ambient
// enum, so the values can't be imported at runtime). The hero never shows on
// our (redirected-away-from) app page, but Steam also uses it in the main-menu
// overlay header while the shortcut is running.
const ARTWORK_ASSET_TYPES: ReadonlyArray<
  [keyof ShortcutArtwork, number]
> = [
  ["capsule", 0], // portrait grid
  ["hero", 1],
  ["logo", 2],
  ["header", 3], // wide capsule (horizontal rows, main-menu entry)
];

// Give the shortcut its library artwork + icon so it looks like a real app in
// Steam's overlays (main menu, "now playing") instead of a blank grey tile.
// Purely cosmetic: every step is best-effort and failures are swallowed.
// Re-applied on each launch — idempotent, and it repairs art lost to Steam's
// grid cache being cleared or the plugin being reinstalled.
async function applyShortcutArtwork(appId: number): Promise<void> {
  try {
    const art = await getShortcutArtwork();
    for (const [key, assetType] of ARTWORK_ASSET_TYPES) {
      const base64 = art[key];
      if (typeof base64 === "string" && base64.length > 0) {
        await SteamClient.Apps.SetCustomArtworkForApp(
          appId,
          base64,
          "png",
          assetType
        );
      }
    }
    if (art.icon_path) {
      SteamClient.Apps.SetShortcutIcon(appId, art.icon_path);
    }
  } catch (e) {
    console.warn("PartyDeck: applying shortcut artwork failed", e);
  }
}

// Find our existing PartyDeck shortcut so we reuse one entry instead of creating
// duplicates. Matches on our display name + the shortcut app_type. Hidden apps
// remain in appStore.allApps (hiding is a collection attribute, not removal), so
// this still finds the shortcut after we've hidden it. Also caches the appId in
// partyDeckShortcutAppId so the redirect patch knows our page even at boot (when
// no launch has happened this session).
export function findExistingShortcut(_exe = ""): number | null {
  const appStore = (window as any)?.appStore;
  const apps: any[] = appStore?.allApps ?? [];
  for (const app of apps) {
    if (app?.display_name === SHORTCUT_NAME && app?.app_type === APP_TYPE_SHORTCUT) {
      partyDeckShortcutAppId = app.appid;
      return app.appid;
    }
  }
  return null;
}

/**
 * Ensure a persistent "PartyDeck" non-Steam shortcut exists for the given
 * launcher script, then launch it via Steam. Returns the shortcut appId.
 *
 * @param exe absolute path to the launcher script (from the backend).
 * @param directory working directory for the shortcut.
 * @param launchOptions optional launch options (e.g. appid passthrough later).
 */
export async function launchViaShortcut(
  exe: string,
  directory: string,
  launchOptions = ""
): Promise<number | null> {
  let appId = findExistingShortcut(exe);

  if (appId === null) {
    appId = await SteamClient.Apps.AddShortcut(
      SHORTCUT_NAME,
      exe,
      directory,
      launchOptions
    );
    if (typeof appId !== "number") {
      return null;
    }
    // Wait for Steam to register the overview before we can run it.
    if (!(await waitForOverview(appId, (o) => o !== null))) {
      return null;
    }
    // AddShortcut no longer reliably sets the name; set it explicitly.
    try {
      SteamClient.Apps.SetShortcutName(appId, SHORTCUT_NAME);
    } catch {
      /* non-fatal */
    }
    // Hide it from the library so it doesn't clutter the user's games. Only on
    // creation — once hidden it stays hidden across reuses.
    await hideShortcut(appId);
  } else {
    // Reusing an existing shortcut: REFRESH the exe + start dir to the current
    // launcher path. A shortcut created in an older session can point at a stale
    // path (e.g. before the runtime dir was flattened); without this it would
    // RunGame a dead exe and "launch" into an instant crash. Then keep launch
    // options current and ensure it's hidden. All idempotent.
    try {
      SteamClient.Apps.SetShortcutExe(appId, exe);
      SteamClient.Apps.SetShortcutStartDir(appId, directory);
    } catch {
      /* non-fatal */
    }
    try {
      SteamClient.Apps.SetAppLaunchOptions(appId, launchOptions);
    } catch {
      /* non-fatal */
    }
    // Not awaited: hideShortcut polls BIsHidden for up to 3s, which swallowed
    // the launch when called from the agent_launch event callback. RunGame must
    // not wait on cosmetics. Already hidden at creation; this just re-asserts.
    void hideShortcut(appId);
  }

  const overview = getOverview(appId);
  const gameId: string | undefined = overview?.gameid;
  if (!gameId) {
    return null;
  }

  // Record our shortcut's appId so the route patch knows which details page to
  // bounce away from (on launch + on game exit).
  partyDeckShortcutAppId = appId;

  // Awaited so the launch-env file is in place before the launcher script runs;
  // best-effort internally, so it can't block the launch.
  await syncSessionResolution(appId);

  // 100 = ELaunchSource._2ftLibraryDetails (see @decky/ui App.d.ts ELaunchSource).
  SteamClient.Apps.RunGame(gameId, "", -1, 100);
  // After RunGame so the (backend roundtrip + art writes) never delay the launch.
  void applyShortcutArtwork(appId);
  return appId;
}

/**
 * Delete the persistent PartyDeck shortcut (if any) and clear cached state, so
 * the next launch recreates it fresh with the current exe/dir. A repair hatch
 * for when a shortcut is left pointing at a stale launcher path. Returns true if
 * a shortcut was found and removed.
 */
export async function removePartyDeckShortcut(): Promise<boolean> {
  const appId = findExistingShortcut();
  if (appId === null) {
    return false;
  }
  try {
    SteamClient.Apps.RemoveShortcut(appId);
  } catch {
    return false;
  }
  partyDeckShortcutAppId = null;
  // Give Steam a moment to drop it from appStore before any recreate.
  await sleep(250);
  return true;
}

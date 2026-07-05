"""PartyDeck launcher orchestration."""

import base64
import hashlib
import json
import os
import re
import shutil
import subprocess
import tarfile
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path

import decky

# Decky Loader is a PyInstaller bundle whose embedded OpenSSL can't find
# SteamOS's CA store, so bare urlopen() fails CERTIFICATE_VERIFY_FAILED.
# Every HTTPS call must pass the loader's certifi-backed context (the
# standard pattern across plugins, e.g. decky-steamgriddb).
from helpers import get_ssl_context  # type: ignore[import-not-found]

# ── Upstream binary bundle (pinned) ──────────────────────────────────
# v0.8.5 "Steamed Hams" — verified to run on the Deck (glibc <= 2.39).
# Do NOT bump to 0.8.6+ without re-checking glibc: 0.8.6 needs 2.43, the Deck
# has 2.41. See the partydeck-binary-and-launch-status project note.
PARTYDECK_VERSION = "v0.8.5"
PARTYDECK_URL = (
    "https://github.com/partydeck/partydeck/releases/download/"
    "v0.8.5/PartyDeck-0.8.5.tar.gz"
)
PARTYDECK_SHA256 = "e4537d2093239ca94f1f4905ea17920cfb661fbcfb40d57ffb7686031c5a66cf"
PARTYDECK_SIZE = 49965097

# A known-good settings.json (mirrors what the GUI wrote during the verified
# manual L4D2 launch). PartyDeck regenerates missing keys with its own defaults,
# so this only needs to set the ones we care about.
DEFAULT_SETTINGS = {
    "gamescope_fix_lowres": True,
    "layout_preset": "auto",
    "gamescope_force_grab_cursor": False,
    "kbm_support": True,
    "proton_version": "",
    "proton_separate_pfxs": True,
    "pad_filter_type": "All",
    "allow_multiple_instances_on_same_device": False,
    "disable_mount_gamedirs": False,
}


def _home() -> Path:
    return Path(os.environ.get("HOME", "/home/deck"))


def _deinjected_env() -> dict:
    """os.environ with Decky's PyInstaller linker injection stripped.

    PluginLoader is a PyInstaller bundle: its bootloader prepends its own
    extraction dir (/tmp/_MEIxxxx) to LD_LIBRARY_PATH, which ships an OpenSSL
    3.0 libcrypto. That leaks into any child we spawn — and umu-run is itself a
    PyInstaller app, so its bundled libcrypto loses to the leaked one and its
    `import ssl` dies with `OPENSSL_3.x not found`, breaking every download.
    PyInstaller stashes the pre-launch value in <VAR>_ORIG; restore it (or drop
    the var) so the child links against its own / the system libraries.
    """
    env = dict(os.environ)
    for var in ("LD_LIBRARY_PATH", "LD_PRELOAD"):
        orig = env.pop(f"{var}_ORIG", None)
        if orig is not None:
            env[var] = orig
        else:
            env.pop(var, None)
    return env


def _plugin_dir() -> Path:
    return Path(os.environ.get("DECKY_PLUGIN_DIR", Path(__file__).resolve().parent.parent))


def _runtime_dir() -> Path:
    """Where we install the PartyDeck binary bundle on-device.

    DECKY_PLUGIN_RUNTIME_DIR is Decky's per-plugin writable data dir (e.g.
    ~/homebrew/data/PartyDeck) — the bundle goes straight in it, no subfolder.
    Note _install_binary() wipes this dir before extracting, so nothing else
    should be stored here. Fall back to ~/.local/share/partydeck-plugin when
    running outside Decky.
    """
    base = os.environ.get("DECKY_PLUGIN_RUNTIME_DIR")
    if base:
        return Path(base)
    return _home() / ".local/share/partydeck-plugin"


def _party_data_dir() -> Path:
    """PartyDeck's own data dir (handlers/profiles/settings) — fixed by the
    upstream binary at $XDG_DATA_HOME/partydeck or ~/.local/share/partydeck."""
    xdg = os.environ.get("XDG_DATA_HOME")
    if xdg:
        return Path(xdg) / "partydeck"
    return _home() / ".local/share/partydeck"


def _log_dir() -> Path:
    """Decky's per-plugin log dir (e.g. ~/homebrew/logs/PartyDeck). Unlike the
    runtime dir, nothing ever wipes this, so run history is safe here."""
    base = os.environ.get("DECKY_PLUGIN_LOG_DIR")
    if base:
        return Path(base)
    return _home() / ".local/share/partydeck-plugin/logs"


def _runs_dir() -> Path:
    """Per-session run logs. A subfolder so they never mix with decky's own
    backend logs at the top level of the log dir."""
    return _log_dir() / "runs"


def _binary_path() -> Path:
    return _runtime_dir() / "partydeck"


def is_binary_installed() -> bool:
    return _binary_path().is_file() and os.access(_binary_path(), os.X_OK)


def _gamescope_display() -> str | None:
    """An X display the binary can open, discovered from gamescope's live X
    sockets (/tmp/.X11-unix/X<n>). Lowest number first — gamescope's primary
    Xwayland is :0. Returns None if no socket exists (session not up)."""
    socket_dir = Path("/tmp/.X11-unix")
    nums = []
    try:
        for sock in socket_dir.glob("X*"):
            suffix = sock.name[1:]
            if suffix.isdigit():
                nums.append(int(suffix))
    except OSError:
        return None
    return f":{min(nums)}" if nums else None


def _binary_env() -> dict:
    """Environment for shelling out to the PartyDeck binary.

    HOME is set explicitly: the binary finds its data dir via $HOME, which the
    Decky backend env may not carry.

    DISPLAY is injected when absent: the binary spins up eframe/winit even for
    headless subcommands (config show / profile list), so it needs a display. We
    used to rely on the backend inheriting DISPLAY from the gamescope session,
    but the Decky plugin_loader service environment doesn't reliably carry it
    (e.g. after a service restart), so config reads crash with "neither
    WAYLAND_DISPLAY nor WAYLAND_SOCKET nor DISPLAY is set". Discover a live
    gamescope X socket and point DISPLAY at it. Don't override an existing
    DISPLAY/WAYLAND_DISPLAY that's already working.
    """
    env = {**os.environ, "HOME": str(_home())}
    if not env.get("DISPLAY") and not env.get("WAYLAND_DISPLAY"):
        display = _gamescope_display()
        if display:
            env["DISPLAY"] = display
    return env


# Headless queries — shell out to PartyDeck's subcommands and parse their JSON.


def _run_partydeck_json(*args: str) -> object:
    binary = _binary_path()
    if not is_binary_installed():
        raise RuntimeError(f"PartyDeck binary not installed at {binary}")

    proc = subprocess.run(  # noqa: S603 (fixed binary, no shell)
        [str(binary), *args],
        capture_output=True,
        text=True,
        env=_binary_env(),
        check=False,
    )
    if proc.returncode != 0:
        msg = proc.stderr.strip() or f"exit {proc.returncode}"
        decky.logger.error("partydeck %s failed: %s", " ".join(args), msg)
        raise RuntimeError(f"partydeck {' '.join(args)} failed: {msg}")
    return json.loads(proc.stdout)


def list_profiles() -> list[dict]:
    return _run_partydeck_json("profile", "list")


def list_handlers() -> list[dict]:
    return _run_partydeck_json("handler", "list")


def list_devices(filter: str = "all") -> list[dict]:
    # filter: "all" | "no-steam-input" | "only-steam-input"
    return _run_partydeck_json("devices", "--filter", filter)


def _run_partydeck(*args: str) -> None:
    binary = _binary_path()
    if not is_binary_installed():
        raise RuntimeError(f"PartyDeck binary not installed at {binary}")
    proc = subprocess.run(  # noqa: S603 (fixed binary, no shell)
        [str(binary), *args],
        capture_output=True,
        text=True,
        env=_binary_env(),
        check=False,
    )
    if proc.returncode != 0:
        msg = proc.stderr.strip() or f"exit {proc.returncode}"
        decky.logger.error("partydeck %s failed: %s", " ".join(args), msg)
        raise RuntimeError(f"partydeck {' '.join(args)} failed: {msg}")


def create_profile(name: str) -> list[dict]:
    _run_partydeck("profile", "create", name)
    return list_profiles()


def delete_profile(name: str) -> list[dict]:
    _run_partydeck("profile", "delete", name)
    return list_profiles()


def get_config() -> dict:
    return _run_partydeck_json("config", "show")


def set_config(config: dict) -> dict:
    _run_partydeck("config", "set-json", json.dumps(config))
    return get_config()


def erase_prefixes() -> None:
    _run_partydeck("config", "erase-prefixes")


# ── Proton / umu management ──────────────────────────────────────────
# umu (bundled at bin/umu-run) resolves a bare PROTONPATH name against
# ~/.local/share/umu/compatibilitytools then Steam's compatibilitytools.d with
# no network; "GE-Proton" means "latest GE" and hits GitHub at every launch.
# These helpers give the frontend visibility into that state so downloads
# happen via an explicit button instead of behind a black screen mid-launch.


def _compat_dirs() -> list[Path]:
    return [
        _home() / ".local/share/umu/compatibilitytools",
        _home() / ".local/share/Steam/compatibilitytools.d",
    ]


def _steamrt3_dir() -> Path:
    return _home() / ".local/share/umu/steamrt3"


def _is_proton_runner(d: Path) -> bool:
    # Filters non-runner compat tools (e.g. SteamTinkerLaunch).
    return d.is_dir() and (d / "proton").is_file()


def _version_key(name: str) -> list:
    # Natural sort so GE-Proton10-34 > GE-Proton9-20. Tagged tuples keep the
    # elements mutually comparable (never str-vs-int).
    return [(1, int(t), "") if t.isdigit() else (0, 0, t) for t in re.split(r"(\d+)", name)]


def list_proton_runners() -> list[dict]:
    """Runners umu can use: compat-tools dirs (bare-name lookup, offline) and
    Valve Protons from steamapps/common (absolute path; not name-resolvable)."""
    runners: dict[str, dict] = {}
    # Steam's dir scanned last so it wins a name collision (umu prefers it too).
    for base in _compat_dirs():
        if base.is_dir():
            for d in base.iterdir():
                if _is_proton_runner(d):
                    runners[d.name] = {"name": d.name, "value": d.name, "kind": "custom"}
    common = _home() / ".local/share/Steam/steamapps/common"
    if common.is_dir():
        for d in common.glob("Proton*"):
            if _is_proton_runner(d) and d.name not in runners:
                runners[d.name] = {"name": d.name, "value": str(d), "kind": "valve"}
    # GE runners first (newest on top — it's the default pin), other custom
    # tools after, also newest-first.
    custom = sorted(
        (r for r in runners.values() if r["kind"] == "custom"),
        key=lambda r: (r["name"].startswith("GE-Proton"), _version_key(r["name"])),
        reverse=True,
    )
    valve = sorted(
        (r for r in runners.values() if r["kind"] == "valve"),
        key=lambda r: r["name"],
    )
    return custom + valve


def _installed_ge_names() -> list[str]:
    names = {
        d.name
        for base in _compat_dirs()
        if base.is_dir()
        for d in base.glob("GE-Proton*")
        if _is_proton_runner(d)
    }
    return sorted(names, key=_version_key, reverse=True)


def _ge_runtime_dir(name: str) -> Path:
    """Resolve an installed GE runner dir by name, guarding against traversal.
    Returns the first compat dir that holds it; raises if the name is unsafe or
    no such GE runner exists."""
    if not name.startswith("GE-Proton") or "/" in name or name in (".", ".."):
        raise ValueError(f"Invalid GE runtime name: {name!r}")
    for base in _compat_dirs():
        d = base / name
        if _is_proton_runner(d):
            return d
    raise FileNotFoundError(f"GE runtime not installed: {name}")


def _dir_size_bytes(path: Path) -> int:
    total = 0
    for root, _dirs, files in os.walk(path):
        for f in files:
            fp = Path(root) / f
            try:
                total += fp.lstat().st_size  # don't follow symlinks (count the link)
            except OSError:
                pass
    return total


def installed_ge_runtimes() -> list[dict]:
    """Installed GE-Proton runners with on-disk size, newest first."""
    out = []
    for name in _installed_ge_names():
        try:
            d = _ge_runtime_dir(name)
        except (ValueError, FileNotFoundError):
            continue
        out.append({"name": name, "path": str(d), "size_bytes": _dir_size_bytes(d)})
    return out


def _unpin_if(name: str) -> None:
    """Clear proton_version if it points at the named runner, so proton_status()
    re-pins to the next newest installed GE (its default-pin policy)."""
    try:
        cfg = get_config()
        if cfg.get("proton_version", "") == name:
            cfg["proton_version"] = ""
            set_config(cfg)
            decky.logger.info("Unpinned proton_version (deleted %s)", name)
    except Exception as e:  # noqa: BLE001 — deletion already succeeded; pin is best-effort
        decky.logger.warning("Could not unpin %s: %s", name, e)


def delete_ge_runtime(name: str) -> None:
    """Delete one installed GE-Proton runner from disk."""
    d = _ge_runtime_dir(name)
    decky.logger.info("Deleting GE runtime %s (%s)", name, d)
    shutil.rmtree(d)
    _unpin_if(name)


def delete_all_ge_runtimes() -> int:
    """Delete every installed GE-Proton runner. Returns how many were removed."""
    removed = 0
    for name in _installed_ge_names():
        try:
            d = _ge_runtime_dir(name)
        except (ValueError, FileNotFoundError):
            continue
        shutil.rmtree(d, ignore_errors=True)
        _unpin_if(name)
        removed += 1
    decky.logger.info("Deleted %d GE runtime(s)", removed)
    return removed


_GE_LATEST_CACHE: tuple[float, str | None] | None = None
_GE_CACHE_TTL = 15 * 60


def _ge_latest(force: bool = False) -> str | None:
    """Latest GE-Proton release tag from GitHub (== its install dir name), or
    None when the check fails. Cached so lobby/page polls don't hammer the API;
    pass force=True to skip the cache (e.g. a user-initiated install/retry, where
    a stale 'offline' from an earlier outage shouldn't block a fresh attempt)."""
    global _GE_LATEST_CACHE
    now = time.monotonic()
    if (
        not force
        and _GE_LATEST_CACHE is not None
        and now - _GE_LATEST_CACHE[0] < _GE_CACHE_TTL
    ):
        return _GE_LATEST_CACHE[1]
    tag = None
    try:
        # Use the releases LIST (newest-first), not /releases/latest. GitHub's
        # gateway intermittently 504s on /releases/latest for repos with a huge
        # release history (proton-ge-custom is one); the list endpoint is served
        # by a different path and stays up. First element == newest release.
        req = urllib.request.Request(
            "https://api.github.com/repos/GloriousEggroll/proton-ge-custom/releases?per_page=1",
            headers={"User-Agent": _PASTE_USER_AGENT},
        )
        with urllib.request.urlopen(  # noqa: S310 (fixed https URL)
            req, timeout=5, context=get_ssl_context()
        ) as resp:
            releases = json.load(resp)
            if isinstance(releases, list) and releases:
                tag = releases[0].get("tag_name") or None
    except Exception as e:
        decky.logger.warning("GE latest-release check failed: %s", e)
    _GE_LATEST_CACHE = (now, tag)
    return tag


def _runtime_installed() -> bool:
    rt = _steamrt3_dir()
    return (rt / "VERSIONS.txt").is_file() and any(rt.glob("sniper_platform_*"))


def _runner_installed(configured: str, mode: str, latest_ge: str | None) -> bool:
    if mode == "path":
        return _is_proton_runner(Path(configured))
    if mode == "named":
        return any(_is_proton_runner(base / configured) for base in _compat_dirs())
    # auto-ge: umu downloads unless the *latest* release is already installed.
    if latest_ge is not None:
        return latest_ge in _installed_ge_names()
    return bool(_installed_ge_names())


def proton_status() -> dict:
    """Filesystem + best-effort network view of what a win-handler launch needs.
    Never raises (the lobby gate polls this). Also applies the default-pin
    policy: a blank proton_version is pinned to the newest installed GE so
    launches stay offline-deterministic."""
    configured = ""
    try:
        cfg = get_config()
        configured = cfg.get("proton_version", "") or ""
        ge_names = _installed_ge_names()
        if not configured and ge_names:
            cfg["proton_version"] = ge_names[0]
            set_config(cfg)
            configured = ge_names[0]
            decky.logger.info("Pinned proton_version to %s", configured)
    except Exception as e:
        decky.logger.warning("proton_status: config unavailable: %s", e)

    if configured in ("", "GE-Proton", "GE-Latest"):
        mode = "auto-ge"
    elif configured.startswith("/"):
        mode = "path"
    else:
        mode = "named"

    latest_ge = _ge_latest()
    runner_installed = _runner_installed(configured, mode, latest_ge)
    runtime_installed = _runtime_installed()
    ge_update = None if latest_ge is None else latest_ge not in _installed_ge_names()
    return {
        "configured": configured,
        "mode": mode,
        "runner_installed": runner_installed,
        "runtime_installed": runtime_installed,
        "latest_ge": latest_ge,
        "ge_update_available": ge_update,
        # Offline (ge_update None) never gates a launch.
        "needs_download": not runner_installed
        or not runtime_installed
        or (mode == "auto-ge" and ge_update is True),
    }


def prefetch_proton(update_ge: bool = False) -> None:
    """Download whatever the next launch would: the steamrt3 runtime and the
    configured runner (latest GE when update_ge or in auto mode). Runs umu
    headlessly against a no-op exe — all downloads happen before exec."""
    status = proton_status()
    protonpath = (
        "GE-Proton" if update_ge or status["mode"] == "auto-ge" else status["configured"]
    )
    umu_run = _runtime_dir() / "bin" / "umu-run"
    if not umu_run.is_file():
        raise RuntimeError("PartyDeck not installed yet — run setup first")

    # Resolving the "GE-Proton" codename means fetching the latest release from
    # GitHub. If that API is unreachable (offline, or a GitHub outage) and no GE
    # is already on disk to fall back to, umu fails deep inside with a cryptic
    # "PROTONPATH not set or is empty". Catch it here and surface a clear cause.
    if protonpath == "GE-Proton" and not _installed_ge_names():
        # Live probe (skip the cache): a user clicking install/retry deserves a
        # fresh check, not a stale "offline" cached during an earlier outage.
        if _ge_latest(force=True) is None:
            raise RuntimeError(
                "Can't reach GitHub to download Proton-GE — check your internet "
                "connection and try again (GitHub may also be temporarily down)."
            )

    pfx = _runtime_dir() / "prefetch-pfx"
    env = {
        **_deinjected_env(),
        "HOME": str(_home()),
        "PROTONPATH": protonpath,
        "PROTON_VERB": "run",
        "WINEPREFIX": str(pfx),
    }
    decky.logger.info("Prefetching Proton (PROTONPATH=%s)", protonpath)
    try:
        proc = subprocess.run(  # noqa: S603 (fixed binary, no shell)
            [str(umu_run), "/bin/true"],
            capture_output=True,
            text=True,
            env=env,
            timeout=1800,
            check=False,
        )
        decky.logger.info("umu prefetch rc=%s\n%s", proc.returncode, proc.stderr[-2000:])
    finally:
        shutil.rmtree(pfx, ignore_errors=True)

    # umu may exit nonzero running the no-op exe; judge by what's on disk.
    after = proton_status()
    if not after["runtime_installed"] or not after["runner_installed"]:
        raise RuntimeError(f"Proton download incomplete: {proc.stderr.strip()[-500:]}")

    # Pin to the version that just downloaded. A GE install fired from the gate
    # (or an explicit "install latest") should leave proton_version pointing at
    # the freshly-installed newest GE, unless the user has deliberately pinned a
    # *different specific* runner (a named non-GE tool or an absolute path) we
    # shouldn't override.
    cfg_pin = status["configured"]
    pin_to_latest = (
        update_ge
        or status["mode"] == "auto-ge"
        or cfg_pin in ("", "GE-Proton", "GE-Latest")
        or cfg_pin.startswith("GE-Proton")
    )
    if pin_to_latest:
        try:
            cfg = get_config()
            ge_names = _installed_ge_names()
            if ge_names and cfg.get("proton_version") != ge_names[0]:
                cfg["proton_version"] = ge_names[0]
                set_config(cfg)
                decky.logger.info("Pinned proton_version to %s", ge_names[0])
        except Exception as e:
            decky.logger.warning("pin after download failed: %s", e)


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def install_binary(force: bool = False) -> Path:
    """Download + extract the PartyDeck release bundle into the runtime dir.

    Idempotent: skips the download if the binary is already present (unless
    force). Verifies size + sha256 before extracting. Returns the binary path.
    """
    runtime = _runtime_dir()
    if is_binary_installed() and not force:
        decky.logger.info("PartyDeck binary already installed at %s", _binary_path())
        return _binary_path()

    runtime.mkdir(parents=True, exist_ok=True)
    tarball = runtime.parent / f"PartyDeck-{PARTYDECK_VERSION}.tar.gz"

    decky.logger.info("Downloading PartyDeck %s from %s", PARTYDECK_VERSION, PARTYDECK_URL)
    with urllib.request.urlopen(  # noqa: S310 (pinned URL)
        PARTYDECK_URL, timeout=30, context=get_ssl_context()
    ) as resp, tarball.open("wb") as out:
        shutil.copyfileobj(resp, out)

    actual_size = tarball.stat().st_size
    if actual_size != PARTYDECK_SIZE:
        tarball.unlink(missing_ok=True)
        raise RuntimeError(
            f"PartyDeck download size mismatch: got {actual_size}, want {PARTYDECK_SIZE}"
        )
    actual_hash = _sha256(tarball)
    if actual_hash != PARTYDECK_SHA256:
        tarball.unlink(missing_ok=True)
        raise RuntimeError(
            f"PartyDeck download hash mismatch: got {actual_hash}, want {PARTYDECK_SHA256}"
        )

    decky.logger.info("Verified bundle; extracting into %s", runtime)
    # Clean any partial prior extraction, then unpack (tarball root is flat:
    # partydeck, bin/, res/, GamingModeLauncher.sh, ...).
    for child in runtime.iterdir():
        if child.is_dir():
            shutil.rmtree(child, ignore_errors=True)
        else:
            child.unlink(missing_ok=True)
    with tarfile.open(tarball, "r:gz") as tf:
        tf.extractall(runtime)  # noqa: S202 (trusted, hash-verified archive)
    tarball.unlink(missing_ok=True)

    # Ensure the binaries are executable (tar should preserve, but be safe).
    for exe in [_binary_path(), runtime / "GamingModeLauncher.sh"]:
        if exe.is_file():
            exe.chmod(0o755)
    bin_dir = runtime / "bin"
    if bin_dir.is_dir():
        for exe in bin_dir.iterdir():
            exe.chmod(0o755)

    if not is_binary_installed():
        raise RuntimeError("PartyDeck binary missing after extraction")
    decky.logger.info("PartyDeck binary installed: %s", _binary_path())
    return _binary_path()


def install_bundled_handlers() -> list[str]:
    """Extract every .pd2 shipped in the plugin's handlers/ dir into PartyDeck's
    handlers dir. A .pd2 is a zip whose root contains handler.json. Returns the
    list of installed handler names."""
    import zipfile

    src_dir = _plugin_dir() / "handlers"
    dst_root = _party_data_dir() / "handlers"
    dst_root.mkdir(parents=True, exist_ok=True)

    installed: list[str] = []
    if not src_dir.is_dir():
        decky.logger.warning("No bundled handlers dir at %s", src_dir)
        return installed

    for pd2 in sorted(src_dir.glob("*.pd2")):
        name = pd2.stem  # e.g. "Left 4 Dead 2"
        dst = dst_root / name
        if (dst / "handler.json").exists():
            decky.logger.info("Handler already installed: %s", name)
            installed.append(name)
            continue
        decky.logger.info("Installing handler %s -> %s", pd2.name, dst)
        dst.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(pd2) as zf:
            zf.extractall(dst)  # noqa: S202 (bundled, trusted)
        if (dst / "handler.json").exists():
            installed.append(name)
        else:
            decky.logger.error("handler.json missing after extracting %s", pd2.name)
    return installed


def write_default_settings(overwrite: bool = False) -> Path:
    """Write settings.json into PartyDeck's data dir if absent (or overwrite)."""
    import json

    data_dir = _party_data_dir()
    data_dir.mkdir(parents=True, exist_ok=True)
    settings_path = data_dir / "settings.json"
    if settings_path.exists() and not overwrite:
        return settings_path
    settings_path.write_text(json.dumps(DEFAULT_SETTINGS, indent=2))
    decky.logger.info("Wrote settings.json -> %s", settings_path)
    return settings_path


def ensure_setup() -> dict:
    """Idempotent first-run setup: binary + handlers + settings. Returns a
    status dict the frontend can show."""
    install_binary()
    handlers = install_bundled_handlers()
    write_default_settings()
    script = write_launcher_script()
    return {
        "binary": str(_binary_path()),
        "binary_installed": is_binary_installed(),
        "handlers": handlers,
        "launcher": str(script),
    }

def _preset_rects(preset: str, players: int) -> list[dict] | None:
    """Mirror partydeck-comp's presets::by_name — fractional slot rects."""
    def r(x, y, w, h):
        return {"rect": {"x": x, "y": y, "w": w, "h": h}}

    full = [r(0, 0, 1, 1)]
    stacked = [r(0, 0, 1, 0.5), r(0, 0.5, 1, 0.5)]
    side = [r(0, 0, 0.5, 1), r(0.5, 0, 0.5, 1)]
    quads = [r(0, 0, 0.5, 0.5), r(0.5, 0, 0.5, 0.5), r(0, 0.5, 0.5, 0.5), r(0.5, 0.5, 0.5, 0.5)]

    if players <= 1:
        return full
    if preset in ("auto", "horizontal", "grid"):
        return stacked if (players == 2 and preset != "grid") else quads[:players]
    if preset == "vertical":
        return side if players == 2 else quads[:players]
    if preset == "priority":
        side_h = 1.0 / (players - 1)
        return [r(0, 0, 0.7, 1)] + [r(0.7, i * side_h, 0.3, side_h) for i in range(players - 1)]
    return None


def _active_session_sockets() -> tuple[Path, int] | None:
    """Find the live compositor's control socket and its player count."""
    run_dir = Path(f"/run/user/{os.getuid()}")
    for ctl in sorted(run_dir.glob("partydeck-*.ctl"), reverse=True):
        pid = ctl.name.removeprefix("partydeck-").removesuffix(".ctl")
        if not (pid.isdigit() and Path(f"/proc/{pid}").exists()):
            continue
        players = len(list(run_dir.glob(f"partydeck-{pid}-p*"))) - len(
            list(run_dir.glob(f"partydeck-{pid}-p*.lock"))
        )
        return ctl, max(players, 1)
    return None


def set_active_layout(layout: dict) -> dict:
    """Re-tile the running session. layout = {"preset": name} or a full
    layout document (slots/focus/background) forwarded verbatim."""
    import socket as unix_socket

    active = _active_session_sockets()
    if not active:
        return {"ok": False, "error": "no PartyDeck session is running"}
    ctl, players = active

    if "preset" in layout and "slots" not in layout:
        rects = _preset_rects(str(layout["preset"]), players)
        if rects is None:
            return {"ok": False, "error": f"unknown preset {layout['preset']!r}"}
        doc = {"slots": rects, "focus": int(layout.get("focus", 0))}
    else:
        doc = layout

    try:
        with unix_socket.socket(unix_socket.AF_UNIX) as s:
            s.settimeout(3)
            s.connect(str(ctl))
            s.sendall((json.dumps({"cmd": "set_layout", "layout": doc}) + "\n").encode())
            reply = s.recv(4096).decode().strip()
        return json.loads(reply) if reply else {"ok": False, "error": "empty reply"}
    except (OSError, json.JSONDecodeError) as e:
        return {"ok": False, "error": f"compositor IPC failed: {e}"}


LAUNCHER_NAME = "partydeck-launch.sh"
PLAYERS_NAME = "launch-players.json"
LAYOUT_NAME = "launch-layout.json"
LAUNCH_ENV_NAME = "launch-env.sh"


def set_session_resolution(width: int | None = None, height: int | None = None) -> dict:
    """Sync Gaming Mode's per-app resolution override into the launch env file
    the launcher script sources. Both None = no override: remove the file."""
    env_file = _runtime_dir() / LAUNCH_ENV_NAME
    if width and height:
        env_file.parent.mkdir(parents=True, exist_ok=True)
        env_file.write_text(
            f"export PARTYDECK_SCREEN_WIDTH={int(width)}\n"
            f"export PARTYDECK_SCREEN_HEIGHT={int(height)}\n"
        )
        decky.logger.info("Session resolution override: %dx%d", width, height)
    else:
        env_file.unlink(missing_ok=True)
        decky.logger.info("Session resolution override cleared")
    return {"width": width, "height": height}


def write_launcher_script(
    handler: str = "", players: list | None = None, appid: int = 0,
    layout: dict | None = None,
) -> Path:
    """Write the wrapper script Steam will execute, and return its path.

    With a handler + players, the script launches that game headlessly inside
    partydeck-comp (the bundled tiling compositor), binding each player to a
    Steam Input pad by XInput slot. The players payload goes to a sidecar JSON
    file (passed by path) so Steam launch options never carry inline JSON.
    `layout` ({"preset": ...} or a full layout document) is optional; without
    it the binary tiles per the settings.json layout_preset. Without a handler,
    it falls back to the plain GUI (upstream behaviour)."""
    import shlex

    runtime = _runtime_dir()
    runtime.mkdir(parents=True, exist_ok=True)
    script = runtime / LAUNCHER_NAME
    binary = _binary_path()

    if handler and players:
        # Authoritative duplicate-profile guard: two instances sharing a profile
        # would fight over the same on-disk save/config dir. The frontend already
        # prevents this, but never trust the payload — a stale/buggy caller can't
        # launch a broken session.
        profiles = [p.get("profile") for p in players]
        if any(not name for name in profiles):
            raise ValueError("Every player must have a profile assigned.")
        if len(set(profiles)) != len(profiles):
            raise ValueError("Two players cannot share the same profile.")
        players_file = runtime / PLAYERS_NAME
        players_file.write_text(json.dumps(players))
        invocation = (
            f'"{binary}" launch '
            f"--handler {shlex.quote(handler)} "
            f'--players "{players_file}"'
        )
        if layout:
            layout_file = runtime / LAYOUT_NAME
            layout_file.write_text(json.dumps(layout))
            invocation += f' --layout "{layout_file}"'
    else:
        # cd into the runtime dir so partydeck finds its sibling bin/ and res/.
        invocation = f'"{binary}" --fullscreen'

    # One per-session log file, wrapper trace and binary output merged. The
    # --kwin re-exec detaches the nested session, so binary output can escape
    # the file — but PARTYDECK_SESSION_LOG_DIR survives the re-exec, so
    # per-instance output still lands in the session dir, and the wrapper
    # trace + exit code always survive here.
    safe_handler = re.sub(r"[^A-Za-z0-9._-]", "_", handler) if handler else ""
    suffix = (f"_SteamID-{appid}" if appid else "") + (
        f"_Handler-{safe_handler}" if safe_handler else ""
    )
    script.write_text(
        "#!/bin/bash\n"
        f'[ -f "{runtime / LAUNCH_ENV_NAME}" ] && . "{runtime / LAUNCH_ENV_NAME}"\n'
        f'RUNS_DIR="{_runs_dir()}"\n'
        'mkdir -p "$RUNS_DIR"\n'
        "# Prune BEFORE creating this run's log: keep the 19 newest so this run\n"
        "# makes 20. In-script (not in Python) so it fires even when the shortcut\n"
        "# is relaunched without prepare; at start (not exit) so it survives\n"
        "# Steam killing the wrapper mid-run.\n"
        'ls -1t "$RUNS_DIR"/run-*.log 2>/dev/null | tail -n +20 | xargs -r rm -f --\n'
        'ls -1dt "$RUNS_DIR"/run-*/ 2>/dev/null | tail -n +20 | xargs -r rm -rf --\n'
        "# Timestamp at RUN time, not prepare time: the Steam shortcut can be\n"
        "# relaunched from the library without rewriting this script.\n"
        'TS="$(date +%Y-%m-%d_%H-%M-%S)"\n'
        f'RUN_LOG="$RUNS_DIR/run-${{TS}}{suffix}.log"\n'
        "# Session dir shares the run log's stem; the binary creates it itself,\n"
        "# so no dir appears for runs that never reach the binary.\n"
        f'export PARTYDECK_SESSION_LOG_DIR="$RUNS_DIR/run-${{TS}}{suffix}"\n'
        'ln -sfn "$RUN_LOG" "$RUNS_DIR/latest.log"\n'
        '# >> so a same-second relaunch appends instead of truncating.\n'
        'exec >> "$RUN_LOG" 2>&1\n'
        "set -x\n"
        'echo "[wrapper] launcher start: $(date)"\n'
        f'cd "{runtime}" || exit 1\n'
        f"{invocation}\n"
        "rc=$?\n"
        'echo "[wrapper] partydeck exited rc=$rc: $(date)"\n'
        "exit $rc\n"
    )
    script.chmod(0o755)
    decky.logger.info("Wrote launcher script (handler=%r) -> %s", handler, script)
    return script


def ensure_runtime_files(
    handler: str = "", players: list | None = None, appid: int = 0
) -> None:
    """Cheap, fast prerequisites for a launch (NO binary download): handlers,
    settings, and the launcher script. Safe to call right before launching."""
    install_bundled_handlers()
    write_default_settings()
    write_launcher_script(handler, players, appid)


def get_launcher_info(
    handler: str = "", players: list | None = None, appid: int = 0
) -> dict:
    """Ensure the cheap runtime files exist (rewriting the launcher for this
    handler/players selection), then return the path + working dir the frontend
    needs to register the Steam shortcut."""
    ensure_runtime_files(handler, players, appid)
    return {
        "exe": str(_runtime_dir() / LAUNCHER_NAME),
        "directory": str(_runtime_dir()),
        "log_dir": str(_runs_dir()),
    }


# Filename contract with the launcher script's RUN_LOG line above.
_RUN_LOG_RE = re.compile(
    r"^run-(\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2})"
    r"(?:_SteamID-(\d+))?(?:_Handler-([A-Za-z0-9._-]+))?\.log$"
)


def list_run_logs(limit: int = 10) -> list[dict]:
    """Newest-first per-session run logs. timestamp = session START (epoch
    seconds), parsed from the filename the launcher script wrote; falls back
    to mtime for anything unparseable."""
    runs = _runs_dir()
    if not runs.is_dir():
        return []
    entries: list[dict] = []
    for path in runs.glob("run-*.log"):
        if not path.is_file() or path.is_symlink():
            continue
        stat = path.stat()
        m = _RUN_LOG_RE.match(path.name)
        ts = stat.st_mtime
        appid = None
        handler = None
        if m:
            try:
                ts = datetime.strptime(m.group(1), "%Y-%m-%d_%H-%M-%S").timestamp()
            except ValueError:
                pass
            appid = int(m.group(2)) if m.group(2) else None
            handler = m.group(3)
        session_dir = path.with_suffix("")
        entries.append(
            {
                "filename": path.name,
                "timestamp": int(ts),
                "size_bytes": stat.st_size,
                "appid": appid,
                "handler": handler,
                "session_dir": session_dir.name if session_dir.is_dir() else None,
            }
        )
    entries.sort(key=lambda e: e["timestamp"], reverse=True)
    return entries[:limit]


# dpaste.com caps pastes at 1MB (ToS); keep the TAIL when over (the end of a
# log — crash + exit code — is the part worth reading).
_PASTE_MAX_BYTES = 950_000
_PASTE_EXPIRY_DAYS = 30
# dpaste's ToS requires a real User-Agent on automated requests.
_PASTE_USER_AGENT = "PartyDeck-Decky-Plugin (https://github.com/wunnr/partydeck)"


def upload_run_log(filename: str) -> dict:
    """Upload one run log to dpaste.com (anonymous pastes are unlisted; logs
    can contain usernames/paths — never public), expiring after a month.
    Returns {"url": ...}; raises with dpaste's error text on failure."""
    if not _RUN_LOG_RE.match(filename):
        raise RuntimeError(f"not a run log: {filename!r}")
    path = _runs_dir() / filename
    if not path.is_file():
        raise RuntimeError(f"log not found: {filename}")

    data = path.read_bytes()
    truncated = len(data) > _PASTE_MAX_BYTES
    if truncated:
        data = data[-_PASTE_MAX_BYTES:]
    content = data.decode("utf-8", errors="replace")
    if truncated:
        content = f"[truncated: showing last {_PASTE_MAX_BYTES} bytes]\n" + content

    body = urllib.parse.urlencode(
        {
            "content": content,
            "title": filename,
            "expiry_days": str(_PASTE_EXPIRY_DAYS),
        }
    ).encode()
    req = urllib.request.Request(
        "https://dpaste.com/api/v2/",
        data=body,
        headers={"User-Agent": _PASTE_USER_AGENT},
    )
    try:
        with urllib.request.urlopen(  # noqa: S310 (fixed https URL)
            req, timeout=30, context=get_ssl_context()
        ) as resp:
            text = resp.read().decode("utf-8", errors="replace").strip()
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace").strip()[:200]
        raise RuntimeError(f"dpaste: HTTP {e.code} {detail}") from e
    if not text.startswith("https://dpaste.com/"):
        raise RuntimeError(f"dpaste: unexpected response: {text[:200]}")
    decky.logger.info("Uploaded %s -> %s", filename, text)
    return {"url": text}


def get_shortcut_artwork() -> dict:
    """Library artwork for the PartyDeck shortcut, generated by
    scripts/generate-shortcut-art.py into assets/shortcut/. Images go over the
    bridge as base64 (SetCustomArtworkForApp takes base64, not paths); the icon
    stays a path because SetShortcutIcon takes one. Missing files are simply
    omitted so a partial deploy degrades to 'less artwork', not an error."""
    art_dir = _plugin_dir() / "assets" / "shortcut"
    art: dict = {}
    for key in ("capsule", "hero", "logo", "header"):
        path = art_dir / f"{key}.png"
        if path.is_file():
            art[key] = base64.b64encode(path.read_bytes()).decode("ascii")
    icon = art_dir / "icon.png"
    art["icon_path"] = str(icon) if icon.is_file() else None
    return art

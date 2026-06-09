"""PartyDeck launcher orchestration.

This is the backend that turns the plugin into a one-stop-shop for PartyDeck
split-screen co-op. Responsibilities (Step 4a — GUI-launch milestone):

  1. Ensure the PartyDeck binary bundle is present on-device (downloaded from
     the upstream GitHub release on first run — we pin v0.8.5 because v0.8.6+
     is built against glibc 2.43 and won't run on SteamOS's glibc 2.41).
  2. Install bundled game handlers (the .pd2 packages shipped with the plugin)
     into PartyDeck's data dir.
  3. Write a known-good settings.json.
  4. Launch PartyDeck's GUI inside a nested KWin session (exactly what upstream's
     GamingModeLauncher.sh does: `./partydeck --kwin --fullscreen`).

The user then picks players/controllers in PartyDeck's own GUI. A later step
(4b) replaces the GUI launch with a true headless entrypoint + in-Decky
controller assignment.

Pure orchestration: no compilation here. The heavy gamescope/bwrap/goldberg
command-building stays in the upstream binary.
"""

import hashlib
import json
import os
import shutil
import subprocess
import tarfile
import urllib.request
from pathlib import Path

import decky

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
    "enable_kwin_script": True,
    "gamescope_fix_lowres": True,
    "gamescope_sdl_backend": True,
    "gamescope_force_grab_cursor": False,
    "kbm_support": True,
    "proton_version": "",
    "proton_separate_pfxs": True,
    "vertical_two_player": False,
    "pad_filter_type": "All",
    "allow_multiple_instances_on_same_device": False,
    "disable_mount_gamedirs": False,
}


def _home() -> Path:
    return Path(os.environ.get("HOME", "/home/deck"))


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


def _binary_path() -> Path:
    return _runtime_dir() / "partydeck"


def is_binary_installed() -> bool:
    return _binary_path().is_file() and os.access(_binary_path(), os.X_OK)


# Headless queries — shell out to PartyDeck's subcommands and parse their JSON.


def _run_partydeck_json(*args: str) -> object:
    # HOME is set explicitly: the binary finds its data dir via $HOME, which the
    # Decky backend env may not carry.
    binary = _binary_path()
    if not is_binary_installed():
        raise RuntimeError(f"PartyDeck binary not installed at {binary}")

    env = {**os.environ, "HOME": str(_home())}
    proc = subprocess.run(  # noqa: S603 (fixed binary, no shell)
        [str(binary), *args],
        capture_output=True,
        text=True,
        env=env,
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
    env = {**os.environ, "HOME": str(_home())}
    proc = subprocess.run(  # noqa: S603 (fixed binary, no shell)
        [str(binary), *args],
        capture_output=True,
        text=True,
        env=env,
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
    urllib.request.urlretrieve(PARTYDECK_URL, tarball)  # noqa: S310 (pinned URL)

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

LAUNCHER_NAME = "partydeck-launch.sh"
PLAYERS_NAME = "launch-players.json"


def write_launcher_script(handler: str = "", players: list | None = None) -> Path:
    """Write the wrapper script Steam will execute, and return its path.

    With a handler + players, the script launches that game headlessly, binding
    each player to a Steam Input pad by XInput slot. The players payload goes to
    a sidecar JSON file (passed by path) rather than through Steam launch options
    — the `--kwin` re-exec re-quotes its forwarded args and would mangle inline
    JSON. Without a handler, it falls back to the plain GUI (upstream behaviour).
    """
    import shlex

    runtime = _runtime_dir()
    runtime.mkdir(parents=True, exist_ok=True)
    script = runtime / LAUNCHER_NAME
    binary = _binary_path()

    if handler and players:
        players_file = runtime / PLAYERS_NAME
        players_file.write_text(json.dumps(players))
        # `--kwin --fullscreen launch ...` runs the headless launch INSIDE the
        # KWin session (gamescope tiling), per the binary's arg handling.
        invocation = (
            f'"{binary}" --kwin --fullscreen launch '
            f"--handler {shlex.quote(handler)} "
            f'--players "{players_file}"'
        )
    else:
        # cd into the runtime dir so partydeck finds its sibling bin/ and res/,
        # then exec the GUI inside a nested KWin session.
        invocation = f'"{binary}" --kwin --fullscreen'

    # Wrapper-level tracing (wrapper.log) is separate from the binary's own
    # log.txt: the --kwin re-exec detaches the nested session, so its output can
    # escape log.txt. The wrapper trace + exit code always survive here, telling
    # us whether Steam ran the script and how the outer process exited.
    log = f"{runtime}/log.txt"
    wrapper = f"{runtime}/wrapper.log"
    script.write_text(
        "#!/bin/bash\n"
        f'exec > "{wrapper}" 2>&1\n'
        "set -x\n"
        f'echo "[wrapper] launcher start: $(date)"\n'
        f'cd "{runtime}" || exit 1\n'
        f'{invocation} > "{log}" 2>&1\n'
        f'rc=$?\n'
        f'echo "[wrapper] partydeck exited rc=$rc: $(date)"\n'
        f"exit $rc\n"
    )
    script.chmod(0o755)
    decky.logger.info("Wrote launcher script (handler=%r) -> %s", handler, script)
    return script


def ensure_runtime_files(handler: str = "", players: list | None = None) -> None:
    """Cheap, fast prerequisites for a launch (NO binary download): handlers,
    settings, and the launcher script. Safe to call right before launching."""
    install_bundled_handlers()
    write_default_settings()
    write_launcher_script(handler, players)


def get_launcher_info(handler: str = "", players: list | None = None) -> dict:
    """Ensure the cheap runtime files exist (rewriting the launcher for this
    handler/players selection), then return the path + working dir the frontend
    needs to register the Steam shortcut."""
    ensure_runtime_files(handler, players)
    return {
        "exe": str(_runtime_dir() / LAUNCHER_NAME),
        "directory": str(_runtime_dir()),
        "log": str(_runtime_dir() / "log.txt"),
    }

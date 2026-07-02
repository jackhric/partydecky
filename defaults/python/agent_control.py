"""Autonomous start/observe/stop of a PartyDeck session over the Decky bridge.

Launch goes through the Steam shortcut: the plugin_loader backend has no display
session and can't RunGame, so build_launch_request() writes the launcher and
main.py emits AGENT_LAUNCH_EVENT; the frontend listener (src/lib/agentControl.ts)
calls launchViaShortcut(). All paths come from partydeck.py.
"""

import json
import os
import re
import signal
import subprocess
import time
from pathlib import Path

import decky

from python import partydeck

# Keep in sync with AGENT_LAUNCH_EVENT in src/lib/agentControl.ts.
AGENT_LAUNCH_EVENT = "agent_launch"

# Not "bwrap"/the game exe — too broad, would catch unrelated processes.
_SESSION_PROCESS_NAMES = (
    partydeck.LAUNCHER_NAME,
    "partydeck",
    "partydeck-comp",
    "gamescope-kbm",
    "gamescopereaper",
)


def build_launch_request(
    appid: int = 0, handler: str = "", players: list | None = None
) -> dict:
    """Write the launcher and return the AGENT_LAUNCH_EVENT payload (exe+dir)."""
    if not partydeck.is_binary_installed():
        raise RuntimeError("PartyDeck not installed yet — run setup first")
    info = partydeck.get_launcher_info(handler, players, appid)
    return {"exe": info["exe"], "directory": info["directory"]}


def _pids_for(name: str) -> list[int]:
    try:
        out = subprocess.run(  # noqa: S603 (fixed argv, no shell)
            ["pgrep", "-f", name], capture_output=True, text=True, check=False
        )
    except FileNotFoundError:
        decky.logger.warning("agent_control: pgrep not found; cannot stop by name")
        return []
    return [
        int(t) for t in out.stdout.split() if t.isdigit() and int(t) != os.getpid()
    ]


def is_session_running() -> bool:
    return any(_pids_for(name) for name in _SESSION_PROCESS_NAMES)


def stop_session(force: bool = False) -> dict:
    """Pattern-kill the session. SIGTERM first so the launcher can unmount its
    game-N overlays, then SIGKILL stragglers; force=True SIGKILLs immediately."""
    sig = signal.SIGKILL if force else signal.SIGTERM
    killed: dict[str, list[int]] = {}
    for name in _SESSION_PROCESS_NAMES:
        pids = _pids_for(name)
        if not pids:
            continue
        killed[name] = pids
        for pid in pids:
            try:
                os.kill(pid, sig)
            except ProcessLookupError:
                pass
            except PermissionError:
                decky.logger.warning("agent_control: can't kill %d (%s)", pid, name)

    if not force and killed:
        time.sleep(2)
        for name in _SESSION_PROCESS_NAMES:
            for pid in _pids_for(name):
                try:
                    os.kill(pid, signal.SIGKILL)
                except (ProcessLookupError, PermissionError):
                    pass

    decky.logger.info("agent_control: stop_session killed=%s", killed)
    return {"killed": killed}


# Crash signatures (wrapper rc can be a misleading 0); DONE adds the rc line.
_RUN_CRASH_RE = re.compile(
    r"Aborted \(core dumped\)|Primary child shut down|Segmentation fault|"
    r"terminate called|cannot open shared object file"
)
_RUN_DONE_RE = re.compile(r"\[wrapper\] partydeck exited rc=|" + _RUN_CRASH_RE.pattern)


def _newest_run_log() -> Path | None:
    runs = partydeck._runs_dir()
    if not runs.is_dir():
        return None
    logs = [p for p in runs.glob("run-*.log") if p.is_file() and not p.is_symlink()]
    return max(logs, key=lambda p: p.stat().st_mtime) if logs else None


def _read_session_meta(session_dir: Path) -> dict | None:
    try:
        return json.loads((session_dir / "session.json").read_text())
    except (OSError, ValueError):
        return None


def _merge_session(result: dict, session_dir: Path, deadline: float, tail_lines: int) -> None:
    """Fold the binary's session dir into the wait_for_run result. The wrapper
    rc line can land before the binary finalizes session.json, so keep polling
    for finished_at within the caller's deadline — but bail as soon as no
    session process is left (killed / failed launch never writes it)."""
    meta = _read_session_meta(session_dir)
    while (
        meta is not None
        and meta.get("finished_at") is None
        and is_session_running()
        and time.monotonic() < deadline
    ):
        time.sleep(2)
        meta = _read_session_meta(session_dir)
    exit_codes = [inst.get("exit_code") for inst in (meta or {}).get("instances", [])]
    result["session_dir"] = session_dir.name
    result["exit_codes"] = exit_codes
    if any(code not in (0, None) for code in exit_codes):
        result["crashed"] = True
    for log in sorted(
        session_dir.glob("instance-*.log"),
        key=lambda p: int(m.group()) if (m := re.search(r"\d+", p.stem)) else -1,
    ):
        try:
            text = log.read_text(errors="replace")
        except OSError:
            continue
        tail = "\n".join(text.splitlines()[-tail_lines:])
        result["tail"] += f"\n--- {log.name} (tail) ---\n{tail}"


def wait_for_run(since_mtime: int = 0, timeout_s: int = 60, tail_lines: int = 120) -> dict:
    """Block until a run newer than since_mtime finishes (or timeout), then
    return its metadata + tail. Pass the run-dir mtime from BEFORE the launch so
    a stale prior run isn't matched. Sleeps — call from an executor, not the loop.
    since_mtime=0, timeout_s=0 reads the latest run without blocking.

    When the binary created the sibling session dir (run-<stem>/), the result
    also carries session_dir, exit_codes (non-zero ⇒ crashed), and per-instance
    log tails appended to `tail`; without it the shape is unchanged."""
    deadline = time.monotonic() + timeout_s
    while True:
        path = _newest_run_log()
        fresh = path is not None and int(path.stat().st_mtime) >= since_mtime
        if fresh:
            text = path.read_text(errors="replace")
            if _RUN_DONE_RE.search(text) or time.monotonic() >= deadline:
                result = {
                    "exists": True,
                    "filename": path.name,
                    "mtime": int(path.stat().st_mtime),
                    "crashed": bool(_RUN_CRASH_RE.search(text)),
                    "running": is_session_running(),
                    "tail": "\n".join(text.splitlines()[-tail_lines:]),
                    "timed_out": not _RUN_DONE_RE.search(text),
                }
                session_dir = path.with_suffix("")
                if session_dir.is_dir():
                    _merge_session(result, session_dir, deadline, tail_lines)
                return result
        if time.monotonic() >= deadline:
            return {"exists": bool(path), "timed_out": True}
        time.sleep(2)

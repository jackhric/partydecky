import asyncio
import json
import os
import sys
from pathlib import Path

# Provided by decky-loader at runtime.
import decky

# ── Make our backend package importable ──────────────────────────────
# Backend logic lives in defaults/python/ (the SDH-PlayTime convention). Decky
# sets DECKY_PLUGIN_DIR to the plugin root on-device; fall back to this file's
# directory when running outside Decky (e.g. tests/tooling). We append the
# plugin root so `from python.service import ...` resolves, rather than relying
# on Decky's implicit sys.path setup.
_PLUGIN_DIR = Path(os.environ.get("DECKY_PLUGIN_DIR", Path(__file__).parent))


def add_plugin_to_path() -> None:
    for import_dir in (["./"], ["python"]):
        sys.path.append(str(_PLUGIN_DIR.joinpath(*import_dir)))


add_plugin_to_path()

# pylint: disable=wrong-import-position
from python import partydeck  # noqa: E402
from python.service import greet  # noqa: E402
from python.timers import schedule_pong  # noqa: E402


class Plugin:
    # Callable from the frontend via @decky/api `callable`.
    async def say_hello(self, name: str) -> str:
        decky.logger.info(f"say_hello called with name={name!r}")
        return greet(name)

    # Kicks off a background task that emits a "pong" event after a delay.
    async def ping_later(self) -> None:
        schedule_pong(self.loop)

    # ── PartyDeck orchestration ──────────────────────────────────────
    # The ~46MB first-run download is too slow to do inside a single callable
    # round-trip (a long blocking call surfaces as a frontend error). So setup
    # runs as a BACKGROUND task and the frontend polls partydeck_status.

    async def partydeck_status(self) -> dict:
        """Poll target: installed? setup running? did setup error?"""
        return {
            "binary_installed": partydeck.is_binary_installed(),
            "setup_running": getattr(self, "_setup_task", None) is not None
            and not self._setup_task.done(),
            "setup_error": getattr(self, "_setup_error", None),
        }

    async def setup_partydeck(self) -> dict:
        """Kick off first-run setup in the background (idempotent) and return
        immediately. Poll partydeck_status to see when it finishes. Calling again
        while a setup is running is a no-op."""
        decky.logger.info("setup_partydeck called")
        existing = getattr(self, "_setup_task", None)
        if existing is not None and not existing.done():
            return {"started": False, "reason": "already running"}

        self._setup_error = None

        async def _run() -> None:
            try:
                await self.loop.run_in_executor(None, partydeck.ensure_setup)
                decky.logger.info("PartyDeck setup finished")
            except Exception as e:  # noqa: BLE001 — surface to the frontend via status
                decky.logger.exception("PartyDeck setup failed")
                self._setup_error = str(e)

        self._setup_task = self.loop.create_task(_run())
        return {"started": True}

    async def prepare_partydeck(self, appid: int = 0) -> dict:
        """Return the launcher script path + working dir so the FRONTEND can
        register a non-Steam shortcut and RunGame it (so Steam provides the
        display session, not us). Requires setup to have completed; raises if the
        binary isn't installed yet.

        `appid` is accepted now so the contract is stable; it's unused until the
        headless step (4b) pre-selects the game via launch options."""
        decky.logger.info(f"prepare_partydeck called (appid={appid})")
        if not partydeck.is_binary_installed():
            raise RuntimeError("PartyDeck not installed yet — run setup first")
        # Cheap: ensures handlers/settings/launcher exist, returns paths.
        return await self.loop.run_in_executor(None, partydeck.get_launcher_info)

    # Run in the executor so the subprocess doesn't block the event loop.
    async def list_profiles(self) -> list:
        return await self.loop.run_in_executor(None, partydeck.list_profiles)

    async def list_handlers(self) -> list:
        return await self.loop.run_in_executor(None, partydeck.list_handlers)

    async def list_devices(self, filter: str = "all") -> list:
        return await self.loop.run_in_executor(
            None, partydeck.list_devices, filter
        )

    async def create_profile(self, name: str) -> list:
        return await self.loop.run_in_executor(
            None, partydeck.create_profile, name
        )

    async def delete_profile(self, name: str) -> list:
        return await self.loop.run_in_executor(
            None, partydeck.delete_profile, name
        )

    async def get_config(self) -> dict:
        return await self.loop.run_in_executor(None, partydeck.get_config)

    async def set_config(self, config: dict) -> dict:
        return await self.loop.run_in_executor(
            None, partydeck.set_config, config
        )

    async def erase_prefixes(self) -> None:
        return await self.loop.run_in_executor(None, partydeck.erase_prefixes)

    # Live input monitor: streams 'partydeck_input' events ({path, button}) from
    # `partydeck monitor-input` until stopped.

    async def start_input_monitor(self, filter: str = "only-steam-input") -> dict:
        existing = getattr(self, "_input_proc", None)
        if existing is not None and existing.returncode is None:
            return {"started": False, "reason": "already running"}

        binary = partydeck._binary_path()
        if not partydeck.is_binary_installed():
            raise RuntimeError(f"PartyDeck binary not installed at {binary}")

        import os as _os

        self._input_proc = await asyncio.create_subprocess_exec(
            str(binary), "monitor-input", "--filter", filter,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env={**_os.environ, "HOME": str(partydeck._home())},
        )
        decky.logger.info("input monitor started (filter=%s)", filter)
        self._input_reader = self.loop.create_task(self._read_input_stream())
        return {"started": True}

    async def _read_input_stream(self) -> None:
        proc = self._input_proc
        assert proc is not None and proc.stdout is not None
        try:
            while True:
                line = await proc.stdout.readline()
                if not line:  # EOF
                    break
                try:
                    evt = json.loads(line)
                except json.JSONDecodeError:
                    continue
                await decky.emit("partydeck_input", evt)
        except asyncio.CancelledError:
            pass
        finally:
            decky.logger.info("input monitor stream ended")

    async def stop_input_monitor(self) -> dict:
        proc = getattr(self, "_input_proc", None)
        reader = getattr(self, "_input_reader", None)
        if reader is not None:
            reader.cancel()
            self._input_reader = None
        if proc is None or proc.returncode is not None:
            self._input_proc = None
            return {"stopped": False, "reason": "not running"}
        proc.terminate()
        try:
            await asyncio.wait_for(proc.wait(), timeout=2)
        except asyncio.TimeoutError:
            proc.kill()
        self._input_proc = None
        decky.logger.info("input monitor stopped")
        return {"stopped": True}

    # Runs once when the plugin is loaded. Long-running async setup goes here.
    async def _main(self) -> None:
        self.loop = asyncio.get_event_loop()
        decky.logger.info("PartyDeck backend loaded.")

    # Called first during unload. Stop tasks / release resources here.
    async def _unload(self) -> None:
        decky.logger.info("PartyDeck backend unloading.")
        await self.stop_input_monitor()

    # Called during uninstall, after _unload. Clean up persisted state here.
    async def _uninstall(self) -> None:
        decky.logger.info("PartyDeck backend uninstalled.")

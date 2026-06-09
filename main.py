import asyncio
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

    async def prepare_partydeck(
        self, appid: int = 0, handler: str = "", players: list = None
    ) -> dict:
        """Write the launcher script for this game + player assignment and return
        its path + working dir, so the FRONTEND can register a non-Steam shortcut
        and RunGame it (so Steam provides the display session, not us). Requires
        setup to have completed; raises if the binary isn't installed yet.

        `handler` is the handler name to launch headlessly; `players` is a list of
        {profile, xinput} dicts (array order = split order). With neither, the
        launcher falls back to the plain GUI."""
        decky.logger.info(
            f"prepare_partydeck called (appid={appid}, handler={handler!r}, "
            f"players={players})"
        )
        if not partydeck.is_binary_installed():
            raise RuntimeError("PartyDeck not installed yet — run setup first")
        # Cheap: ensures handlers/settings/launcher exist, returns paths.
        return await self.loop.run_in_executor(
            None, partydeck.get_launcher_info, handler, players
        )

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

    # Runs once when the plugin is loaded. Long-running async setup goes here.
    async def _main(self) -> None:
        self.loop = asyncio.get_event_loop()
        decky.logger.info("PartyDeck backend loaded.")

    # Called first during unload. Stop tasks / release resources here.
    async def _unload(self) -> None:
        decky.logger.info("PartyDeck backend unloading.")

    # Called during uninstall, after _unload. Clean up persisted state here.
    async def _uninstall(self) -> None:
        decky.logger.info("PartyDeck backend uninstalled.")

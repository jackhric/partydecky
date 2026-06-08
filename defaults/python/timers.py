"""Background-task helpers for the PartyDeck backend."""

import asyncio

import decky

# Seconds to wait before emitting the pong event.
PONG_DELAY = 3


async def _delayed_pong() -> None:
    await asyncio.sleep(PONG_DELAY)
    await decky.emit("pong", "Pong! This came from the Python backend.")


def schedule_pong(loop: asyncio.AbstractEventLoop) -> None:
    """Schedule a 'pong' event to fire after PONG_DELAY seconds.

    Takes the plugin's event loop so the caller controls the loop lifecycle.
    """
    loop.create_task(_delayed_pong())

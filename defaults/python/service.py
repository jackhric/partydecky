"""Core, side-effect-free backend logic.

Keeping the actual work here (rather than in main.py's Plugin class) makes it
unit-testable and keeps the Decky entry point thin.
"""


def greet(name: str) -> str:
    """Return a friendly greeting for `name`."""
    name = name.strip() or "stranger"
    return f"Hello, {name}!"

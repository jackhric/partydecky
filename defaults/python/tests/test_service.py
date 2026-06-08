"""Unit tests for the backend service logic.

Run from the project root with:  pytest
(See pyproject.toml for the test path / sys.path config.)
"""

from python.service import greet


def test_greet_basic():
    assert greet("Steam Deck") == "Hello, Steam Deck!"


def test_greet_strips_whitespace():
    assert greet("  Deck  ") == "Hello, Deck!"


def test_greet_empty_falls_back_to_stranger():
    assert greet("") == "Hello, stranger!"
    assert greet("   ") == "Hello, stranger!"

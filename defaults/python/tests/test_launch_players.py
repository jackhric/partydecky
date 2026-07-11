import copy
import json

import pytest

from python import agent_control, partydeck


def _write_script(monkeypatch, tmp_path, players):
    monkeypatch.setattr(partydeck, "_runtime_dir", lambda: tmp_path)
    monkeypatch.setattr(partydeck, "_runs_dir", lambda: tmp_path / "runs")
    partydeck.write_launcher_script("Some Game", players, appid=42)
    return json.loads((tmp_path / partydeck.PLAYERS_NAME).read_text())


def test_write_launcher_script_keeps_xinput_slots_as_sent(monkeypatch, tmp_path):
    players = [
        {"profile": "Blinky", "xinput": 3},
        {"profile": "Pinky", "xinput": 0},
        {"profile": "Inky", "xinput": 7},
    ]
    written = _write_script(monkeypatch, tmp_path, players)

    assert [p["xinput"] for p in written] == [3, 0, 7]
    assert [p["profile"] for p in written] == ["Blinky", "Pinky", "Inky"]


def test_write_launcher_script_rejects_duplicate_xinput_slots(monkeypatch, tmp_path):
    players = [
        {"profile": "Blinky", "xinput": 2},
        {"profile": "Pinky", "xinput": 2},
    ]

    with pytest.raises(ValueError):
        _write_script(monkeypatch, tmp_path, players)


def test_write_launcher_script_rejects_invalid_xinput_slot(monkeypatch, tmp_path):
    players = [
        {"profile": "Blinky", "xinput": -1},
        {"profile": "Pinky", "xinput": 0},
    ]

    with pytest.raises(ValueError):
        _write_script(monkeypatch, tmp_path, players)


def test_write_launcher_script_does_not_mutate_callers_players(monkeypatch, tmp_path):
    players = [
        {"profile": "Blinky", "xinput": 2},
        {"profile": "Pinky", "xinput": 1},
    ]
    original = copy.deepcopy(players)

    _write_script(monkeypatch, tmp_path, players)

    assert players == original


def test_build_launch_request_keeps_original_xinput_slots(monkeypatch):
    monkeypatch.setattr(partydeck, "is_binary_installed", lambda: True)
    monkeypatch.setattr(
        partydeck,
        "get_launcher_info",
        lambda *_args: {"exe": "/x/launch.sh", "directory": "/x", "log_dir": "/x/runs"},
    )
    players = [
        {"profile": "Blinky", "xinput": 3},
        {"profile": "Pinky", "xinput": 0},
    ]

    payload = agent_control.build_launch_request(42, "Some Game", players)

    assert payload["xinput_slots"] == [3, 0]

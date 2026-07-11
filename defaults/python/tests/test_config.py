import json

from python import partydeck


def test_set_config_partial_update_preserves_current_values(monkeypatch):
    current = {
        "layout_preset": "vertical",
        "pad_filter_type": "All",
        "debug_game_logs": True,
        "kbm_support": True,
    }
    sent = {}

    def fake_run(*args):
        assert args[:2] == ("config", "set-json")
        sent.update(json.loads(args[2]))

    monkeypatch.setattr(
        partydeck, "_run_partydeck_json", lambda *_args: dict(current)
    )
    monkeypatch.setattr(partydeck, "_run_partydeck", fake_run)

    partydeck.set_config({"debug_game_logs": False})

    assert sent == {
        "layout_preset": "vertical",
        "pad_filter_type": "All",
        "debug_game_logs": False,
        "kbm_support": True,
    }

import types

from python import agent_control, partydeck


def _capture_pgrep(monkeypatch, stdout=""):
    calls = []

    def fake_run(argv, **_kwargs):
        calls.append(argv)
        return types.SimpleNamespace(stdout=stdout, returncode=0)

    monkeypatch.setattr(agent_control.subprocess, "run", fake_run)
    return calls


def _expected_argvs(tmp_path):
    launcher = str(tmp_path / partydeck.LAUNCHER_NAME)
    return [
        ["pgrep", "-x", name] for name in agent_control._SESSION_EXACT_NAMES
    ] + [["pgrep", "-f", launcher]]


def test_is_session_running_pgrep_argv(monkeypatch, tmp_path):
    monkeypatch.setattr(partydeck, "_runtime_dir", lambda: tmp_path)
    calls = _capture_pgrep(monkeypatch)

    assert agent_control.is_session_running() is False
    assert calls == _expected_argvs(tmp_path)


def test_stop_session_pgrep_argv_and_kill(monkeypatch, tmp_path):
    monkeypatch.setattr(partydeck, "_runtime_dir", lambda: tmp_path)
    monkeypatch.setattr(partydeck, "_party_data_dir", lambda: tmp_path / "party")
    monkeypatch.setattr(agent_control, "_read_proc_mounts", lambda: "")
    monkeypatch.setattr(agent_control, "_proc_cmdline", lambda _pid: "")
    calls = _capture_pgrep(monkeypatch, stdout="4242\n")
    kills = []
    monkeypatch.setattr(
        agent_control.os, "kill", lambda pid, sig: kills.append((pid, sig))
    )
    monkeypatch.setattr(agent_control.time, "sleep", lambda _s: None)

    result = agent_control.stop_session()

    expected = _expected_argvs(tmp_path)
    # SIGTERM sweep, SIGKILL sweep, then the fuse-overlayfs survivor scan.
    assert calls == expected + expected + [["pgrep", "-x", "fuse-overlayfs"]]
    assert all(pid == 4242 for pid, _sig in kills)
    assert set(result["killed"]) == set(agent_control._SESSION_EXACT_NAMES) | {
        str(tmp_path / partydeck.LAUNCHER_NAME)
    }
    assert result["fuse_cleanup"] == {
        "unmounted": [],
        "unmount_failed": [],
        "killed": [],
    }


def test_stop_session_unmounts_only_partydeck_fuse_mounts(monkeypatch, tmp_path):
    party = tmp_path / "party"
    tmp = party / "tmp"
    monkeypatch.setattr(partydeck, "_runtime_dir", lambda: tmp_path)
    monkeypatch.setattr(partydeck, "_party_data_dir", lambda: party)
    mounts = "\n".join(
        [
            f"fuse-overlayfs {tmp}/game-0 fuse.fuse-overlayfs rw,nodev 0 0",
            f"fuse-overlayfs {tmp}/game-1 fuse.fuse-overlayfs rw,nodev 0 0",
            "fuse-overlayfs /home/deck/unrelated fuse.fuse-overlayfs rw 0 0",
            f"overlay {tmp}/game-2 overlay rw 0 0",
            f"tmpfs {tmp} tmpfs rw 0 0",
        ]
    )
    monkeypatch.setattr(agent_control, "_read_proc_mounts", lambda: mounts)

    calls = []

    def fake_run(argv, **_kwargs):
        calls.append(argv)
        return types.SimpleNamespace(stdout="", returncode=0)

    monkeypatch.setattr(agent_control.subprocess, "run", fake_run)
    monkeypatch.setattr(agent_control.time, "sleep", lambda _s: None)

    result = agent_control.stop_session(force=True)

    unmounts = [argv for argv in calls if argv[0].startswith("fusermount")]
    assert unmounts == [
        ["fusermount3", "-u", f"{tmp}/game-0"],
        ["fusermount3", "-u", f"{tmp}/game-1"],
    ]
    # Orphan scan (kill step) must precede every unmount.
    assert calls.index(["pgrep", "-x", "fuse-overlayfs"]) < calls.index(unmounts[0])
    assert result["fuse_cleanup"]["unmounted"] == [f"{tmp}/game-0", f"{tmp}/game-1"]
    assert result["fuse_cleanup"]["unmount_failed"] == []


def test_fusermount_falls_back_when_fusermount3_missing(monkeypatch):
    calls = []

    def fake_run(argv, **_kwargs):
        calls.append(argv)
        if argv[0] == "fusermount3":
            raise FileNotFoundError
        return types.SimpleNamespace(stdout="", returncode=0)

    monkeypatch.setattr(agent_control.subprocess, "run", fake_run)

    assert agent_control._fusermount_unmount("/x/game-0") is True
    assert calls == [["fusermount3", "-u", "/x/game-0"], ["fusermount", "-u", "/x/game-0"]]


def test_cleanup_kills_only_fuse_procs_on_partydeck_paths(monkeypatch, tmp_path):
    party = tmp_path / "party"
    monkeypatch.setattr(partydeck, "_party_data_dir", lambda: party)
    monkeypatch.setattr(agent_control, "_read_proc_mounts", lambda: "")
    monkeypatch.setattr(agent_control.time, "sleep", lambda _s: None)

    def fake_run(argv, **_kwargs):
        return types.SimpleNamespace(stdout="101\n202\n", returncode=0)

    monkeypatch.setattr(agent_control.subprocess, "run", fake_run)
    cmdlines = {
        101: f"fuse-overlayfs\x00-o\x00lowerdir=/g\x00{party}/tmp/game-0",
        202: "fuse-overlayfs\x00-o\x00lowerdir=/g\x00/home/deck/unrelated",
    }
    monkeypatch.setattr(agent_control, "_proc_cmdline", lambda pid: cmdlines[pid])
    kills = []
    monkeypatch.setattr(
        agent_control.os, "kill", lambda pid, sig: kills.append((pid, sig))
    )

    result = agent_control._cleanup_fuse_overlays()

    assert kills == [(101, agent_control.signal.SIGKILL)]
    assert result["killed"] == [101]


def test_cleanup_kills_before_unmount_and_retries_failed_unmount(monkeypatch, tmp_path):
    party = tmp_path / "party"
    mnt = f"{party}/tmp/game-0"
    monkeypatch.setattr(partydeck, "_party_data_dir", lambda: party)
    monkeypatch.setattr(
        agent_control,
        "_read_proc_mounts",
        lambda: f"fuse-overlayfs {mnt} fuse.fuse-overlayfs rw,nodev 0 0",
    )
    monkeypatch.setattr(
        agent_control, "_proc_cmdline", lambda _pid: f"fuse-overlayfs\x00{mnt}"
    )

    events = []
    unmount_rcs = iter([1, 0])  # first attempt busy, retry succeeds

    def fake_run(argv, **_kwargs):
        if argv[0] == "pgrep":
            events.append("pgrep")
            return types.SimpleNamespace(stdout="101\n", returncode=0)
        assert argv == ["fusermount3", "-u", mnt]
        events.append("unmount")
        return types.SimpleNamespace(stdout="", returncode=next(unmount_rcs))

    monkeypatch.setattr(agent_control.subprocess, "run", fake_run)
    monkeypatch.setattr(
        agent_control.os, "kill", lambda pid, _sig: events.append(f"kill:{pid}")
    )
    monkeypatch.setattr(
        agent_control.time, "sleep", lambda _s: events.append("sleep")
    )

    result = agent_control._cleanup_fuse_overlays()

    assert events == ["pgrep", "kill:101", "sleep", "unmount", "sleep", "unmount"]
    assert result == {"unmounted": [mnt], "unmount_failed": [], "killed": [101]}

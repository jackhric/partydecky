"""Stub the Decky-injected modules so backend modules import outside the loader."""

import sys
import types
from unittest.mock import MagicMock

if "decky" not in sys.modules:
    decky_stub = types.ModuleType("decky")
    decky_stub.logger = MagicMock()
    sys.modules["decky"] = decky_stub

if "helpers" not in sys.modules:
    helpers_stub = types.ModuleType("helpers")
    helpers_stub.get_ssl_context = lambda: None
    sys.modules["helpers"] = helpers_stub

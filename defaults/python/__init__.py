"""PartyDeck plugin backend package.

This lives under defaults/python/ — the convention used by well-structured
pure-Python Decky plugins (e.g. SDH-PlayTime). main.py adds this directory to
sys.path explicitly (see add_plugin_to_path) so `from python.service import …`
resolves both on the Deck and in editors.

If you later need a third-party or compiled Python dependency, create a
py_modules/ folder at the plugin root for it (Decky adds that to sys.path too)
and add it back to the deploy rsync. Keep your own code here.
"""

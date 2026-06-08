# Credits & Thanks

This plugin stands on the shoulders of several other projects. Thank you to:

## MoonDeck

A huge thank you to the [**MoonDeck**](https://github.com/FrogTheFrog/moondeck)
project by [@FrogTheFrog](https://github.com/FrogTheFrog). MoonDeck's approach to
integrating with the Steam Gaming Mode UI from a Decky plugin (injecting a
button into the game detail page, and launching via a managed non-Steam shortcut
so Steam provides the display session) was an invaluable reference while
building PartyDeck's prototype.

## PartyDeck

This plugin integrates (and forks) the upstream
[**PartyDeck**](https://github.com/partydeck/partydeck) split-screen game
launcher, which does the actual heavy lifting (gamescope, bubblewrap, Goldberg
Steam Emu, runtime handling). PartyDeck is MIT-licensed (Copyright (c) 2025
wunner). Thanks to [@wunnr](https://github.com/wunnr) for starting PartyDeck and
to [@Blahkaey](https://github.com/blahkaey),
[@davidawesome02-backup](https://github.com/davidawesome02-backup), and the rest
of the contributors for maintaining it and the game handlers!

## Decky Loader

Built on [**Decky Loader**](https://github.com/SteamDeckHomebrew/decky-loader)
and the [`@decky/*`](https://www.npmjs.com/org/decky) libraries from the
[SteamDeckHomebrew](https://github.com/SteamDeckHomebrew) team.

---

This project is MIT-licensed (see [`LICENSE`](../LICENSE)). The third-party
binaries bundled at setup time (UMU Launcher, Goldberg Steam Emu, Gamescope)
retain their own licenses — see
[`THIRD-PARTY-LICENSES.md`](../THIRD-PARTY-LICENSES.md).

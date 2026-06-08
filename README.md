# PartyDeck — Decky Loader Plugin

Local multiplayer / split-screen for the Steam Deck, built as a
[Decky Loader](https://decky.xyz/) plugin (and runnable on other Decky-supported
handhelds/desktops).

## How to Install

Install instructions will be provided at a later date once the plugin is at an appropriate state.

## Prerequisites

- [Node.js](https://nodejs.org/) **v16.14+**
- [pnpm](https://pnpm.io/) **v9** — `npm i -g pnpm@9`
  (pnpm v9 is recommended to avoid CI issues if you later submit to the plugin store)
- A Steam Deck (or device) with **Decky Loader installed** and **Developer mode**
  enabled (Decky settings → Developer → enable, and set your CSS/JS reload + SSH).

## Build

```bash
pnpm install
pnpm run build      # one-off build into dist/
pnpm run watch      # rebuild on change
```

A successful build produces `dist/index.js`. This is the bundled frontend that
Decky loads.

## References

- Plugin template: <https://github.com/SteamDeckHomebrew/decky-plugin-template>
- Decky Loader: <https://github.com/SteamDeckHomebrew/decky-loader>
- Dev wiki: <https://wiki.deckbrew.xyz/plugin-dev/getting-started>
- `@decky/ui` components: <https://www.npmjs.com/package/@decky/ui>

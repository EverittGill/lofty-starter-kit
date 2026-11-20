# KTS drips → Lofty (Chrome extension)

Creates Lofty Smart Plans from the kit's drips, using the requests Lofty's own website makes while
you are logged in. Not an official Lofty integration. Setup and use: `../START-HERE.md`.

- `data/` is built by `node tools/build-lofty-extension-data.mjs` (run from the kit folder) and is
  not in git. Reload the extension after rebuilding.
- Plans are saved as Personal drafts with auto-apply off.
- `services/converter-v2.js` builds the plan; `services/lofty-client.js` stores each email and saves
  the plan; `injected.js` signs and sends the requests from the Lofty tab.

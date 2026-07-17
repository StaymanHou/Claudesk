---
name: vitest-raw-import-css-returns-processed-not-text
description: Vitest ?raw import of a .css file does NOT yield raw file text (Vite CSS plugin intercepts) — read CSS source-guards via node:fs, not ?raw.
metadata:
  type: reference
---

The repo's source-text-guard convention (assert against a file's literal source, e.g. `import appTsx from "../../App.tsx?raw"`) works for `.tsx`/`.ts` but **NOT for `.css`**: Vite's CSS plugin intercepts `?raw` on a `.css` import, so `import appCss from "../App.css?raw"` does NOT give you the raw file text (the guard's `indexOf(".update-banner {")` returned `-1` — `appCss` was not the file text).

Fix: read the CSS file directly with Node fs — `readFileSync(fileURLToPath(new URL("../../App.css", import.meta.url)), "utf8")`. Add `import { readFileSync } from "node:fs"` + `import { fileURLToPath } from "node:url"`.

Discovered M10 WP4 (the `.update-banner` not-`position:absolute` layout-invariant guard in `src/updater/__tests__/updaterWiring.test.ts`). Any future vitest source-guard that must assert over CSS (`App.css` or a component `.css`) uses the fs read, not `?raw`. Relates to the `?raw` FE-wiring guard convention (see `menuBridge.test.ts`, the `pickerTimeTrackingWiring.test.ts` family). [[macos-case-collision-module-naming]] is the other FE test-authoring gotcha.

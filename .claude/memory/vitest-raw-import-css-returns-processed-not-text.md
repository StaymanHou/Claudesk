---
name: vitest-raw-import-css-returns-processed-not-text
description: Vitest ?raw import of a .css file does NOT yield raw file text (Vite CSS plugin intercepts) — read CSS source-guards via node:fs, not ?raw.
metadata:
  type: reference
---

The repo's source-text-guard convention (assert against a file's literal source, e.g. `import appTsx from "../../App.tsx?raw"`) works for `.tsx`/`.ts` but **NOT for `.css`**: Vite's CSS plugin intercepts `?raw` on a `.css` import, so `import appCss from "../App.css?raw"` does NOT give you the raw file text (the guard's `indexOf(".update-banner {")` returned `-1` — `appCss` was not the file text).

Fix: read the CSS file directly with Node fs — `readFileSync(fileURLToPath(new URL("../../App.css", import.meta.url)), "utf8")`. Add `import { readFileSync } from "node:fs"` + `import { fileURLToPath } from "node:url"`.

⚠️ **Not in a jsdom test file.** Under `// @vitest-environment jsdom`, `import.meta.url` is not a `file:` URL, so that recipe throws `TypeError: The URL must be of scheme file` and the WHOLE file fails to collect (Vitest prints `Tests  no tests`, which a `grep "Tests "` filter can misread as a pass). There, resolve from Vitest's cwd (the project root): `readFileSync(resolve("src/App.css"), "utf8")` with `import { resolve } from "node:path"`. Hit 2026-11-09 (paydown-2026-11-08 WP5, `pickerRowTrustLive.test.tsx`).

Discovered M10 WP4 (the `.update-banner` not-`position:absolute` layout-invariant guard in `src/updater/__tests__/updaterWiring.test.ts`). Any future vitest source-guard that must assert over CSS (`App.css` or a component `.css`) uses the fs read, not `?raw`. Relates to the `?raw` FE-wiring guard convention (see `menuBridge.test.ts`, the `pickerTimeTrackingWiring.test.ts` family). [[macos-case-collision-module-naming]] is the other FE test-authoring gotcha.

---
name: debug-bundle-verifies-bundled-origin
description: An agent CAN verify the bundled `tauri://localhost` origin without a release — build a DEBUG `.app` with the dev identity and launch it via `open`; the MCP bridge survives (debug_assertions). It does NOT exercise hardened runtime.
metadata:
  type: project
---

The dev origin (`http://localhost:1420`) is not the bundled origin (`tauri://localhost`), so a dev-only pass
proves nothing about how the installed build loads frontend/asset content. You do not need a release to close
that gap:

```
pnpm tauri build --debug --bundles app \
  --config src-tauri/tauri.dev.json \
  --config '{"bundle":{"createUpdaterArtifacts":false}}'
open "src-tauri/target/debug/bundle/macos/Claudesk Dev.app"   # LaunchServices = the Finder launch path
```

- **The MCP bridge is still there** (`#[cfg(debug_assertions)]`), so `webview_execute_js` and the other bridge
  tools drive it. Assert `location.origin === "tauri://localhost"` first.
- **Dev identity** (`com.claudesk.app.dev`), so it never collides with the operator's installed prod app.
- ⚠️ **Stop your OWN `pnpm tauri:dev` chain first.** It shares bridge port 9223 and the identifier. Tear down by
  PID, never with a blanket pkill (`[[verify-self-dev-vs-prod-process-name-collision]]`).
- `createUpdaterArtifacts:false` is required: the updater `.tar.gz` needs the signing key, and a local parity
  check has no use for it. `--bundles app` skips the dmg. The build took about 40 s warm.
- ⚠️ **It does NOT exercise hardened runtime or notarization.** `codesign -dv` shows
  `flags=0x20002(adhoc,linker-signed)` with no runtime flag. Anything that hardened runtime could break
  (subprocess spawns, entitlements) stays a **`/release`-gate** check (`[[installed-build-verify-deferred-to-release]]`).
  Record it as deferred, never as passed.

**Why:** this narrows the older belief that installed-build checks are operator-only. Origin-dependent behavior
(asset protocol, CSP, fetch/media loading) is agent-verifiable today. First used in M16 WP1 Phase 2
(2026-09-29): the media matrix on `tauri://localhost` matched dev row for row.

**How to apply:** use this whenever a check depends on the bundled origin or bundled assets rather than on
signing. Keep a real installed-`.app` check for PATH/env (`env_path`), hardened runtime and the updater.

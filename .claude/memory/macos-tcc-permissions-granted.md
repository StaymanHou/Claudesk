---
name: macos-tcc-permissions-granted
description: Terminal.app has Accessibility + Screen Recording, but `screencapture` can still fail for a whole session ("could not create image from display"); use the bridge screenshot for webview content.
metadata:
  node_type: memory
  type: reference
  originSessionId: 3ad92028-0aea-4de8-a9d0-f4e7d10a8cb0
---

The session's terminal app is **Terminal.app** (`/System/Applications/Utilities/Terminal.app`); the process chain is Terminal.app → zsh → `claude` → bash. macOS attaches TCC permissions to the top-level `.app`, not child CLI tools.

As of 2026-06-18 the operator granted Terminal.app both **Accessibility** and **Screen Recording** (System Settings → Privacy & Security). Verified live: `osascript`/System Events returns process info with no `-25211` error, and `screencapture -o -x <file>.png` produces a real PNG.

This means the agent CAN, from Bash, produce native-window screenshots (`screencapture`) and query window geometry / drive GUI scripting (`osascript ... System Events`) — the verification path for native Tauri/Claudesk windows that Playwright (browser-only) cannot reach. Re-verify after major macOS updates (Sequoia+ can drop Screen Recording grants on some reboots). Permissions only apply to terminal sessions launched AFTER a full Terminal quit/relaunch.

Distinct from WP8's planned Accessibility flow for the Claudesk `.app` itself (global shortcuts) — that's a separate grant for a different bundle. See [[wp4-macos-perf-measurement]].

⚠️ **CORRECTED 2026-11-16 (M17 WP4): the grant does not guarantee a capture.** For the WHOLE session,
`screencapture -x <file>` (and `-m`, and `-R`) failed with **"could not create image from display"**, most
likely a locked or asleep screen; the cause was not established. Consequences:
- For webview content, use **`mcp__tauri__webview_screenshot`** (with `windowId` `main` or `pip`). It worked
  all session, independent of the display.
- The **menu-bar tray stays unobservable** (no IPC readout either; backlogged as
  `SURFACE-2026-11-16-TRAY-HAS-NO-READOUT-FOR-LIVE-VERIFY`). Do not plan a tray check on `screencapture`
  alone: try it once, and record a no-harness UNVERIFIED if it fails.

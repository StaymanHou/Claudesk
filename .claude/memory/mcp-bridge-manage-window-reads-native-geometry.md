---
name: mcp-bridge-manage-window-reads-native-geometry
description: The tauri MCP bridge's manage_window {action:"info", windowId} returns a native NSPanel/NSWindow's on-screen frame geometry (x/y/w/h, top-left-origin y-down) — makes native window-POSITION features agent-verifiable via geometry math, not just DOM/screenshot.
metadata:
  type: reference
---

`mcp__tauri__manage_window { action: "info", windowId: "<label>" }` returns the **native window's on-screen frame geometry** — `{ x, y, width, height }` — for any Tauri window/NSPanel by label (`"main"`, `"pip"`, …). This is the piece that makes native **window-position** features agent-verifiable through the MCP bridge, extending the bridge-verify-self toolkit beyond DOM-read / JS-exec / click / screenshot / `cc_input` injection (all in the root `CLAUDE.md` bridge list — this is a natural **"caveat (f)"** on it).

**Use it to assert native window placement** without carrying to the operator: read a panel's `x/y/w/h` before + after an op (`pip_move`, `pip_set_mode`, a layout change) and check the geometry. First proven on **M10.5 WP1** (PiP top-right default position): confirmed a 150px top+right inset on first summon, drag-preservation across hide/re-summon, and re-anchor-against-current-size on a layout change — all via geometry math.

**Coordinate-frame gotcha (the conversion you must do):**
- `manage_window info` reports **top-left-origin, y-DOWN** screen coordinates (Tauri/`outer_position` convention).
- The backend AppKit `setFrameOrigin:` math is **bottom-left-origin, y-UP** (NSWindow/NSScreen `visibleFrame`).
- So the agent converts when checking. Worked example (1920×1080, 30px menu bar → availHeight 1050; panel 128×102 at the 150px inset): `manage_window` reports `x=1642, y=180`. Right gap = `availW − (x+w) = 1920 − 1770 = 150`. Top gap = `y − menuBarHeight = 180 − 30 = 150`. Both = the intended 150px inset.

Pairs with [[verify-native-pty-via-ps-screencapture-stderr]] (the *pre-bridge* native toolkit — `ps`/`screencapture`/stderr; the bridge is the newer path) and the root `CLAUDE.md` bridge-verify-self caveats (a)–(e) [tool names `mcp__tauri__*`, dev-capability perms, PiP-webview reachability, port-cleanup teardown + fire-then-poll, live-CC-turn `cc_input`]. Bridge is `#[cfg(debug_assertions)]`-gated, binds 127.0.0.1:9223.

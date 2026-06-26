---
name: tauri-nspanel-pip-gotchas
description: tauri-nspanel v2.1 PiP usage rules for M5 WP3 — four AppKit gotchas each found via a live crash at verify-human
metadata:
  type: reference
---

`tauri-nspanel` v2.1 is the confirmed-GO crate for the M5 Picture-in-picture NSPanel
(probed at WP1, 2026-06-25). Viable with no raw-objc2 fallback, but four usage rules —
each paid for by a live crash/failure at WP1 verify-human — that WP3 MUST follow:

1. **NonactivatingPanel mask only on a BORN-borderless window.** Create the window
   `decorations(false)` + `transparent(true)` via `.with_window(...)` BEFORE conversion,
   THEN `style_mask(borderless | nonactivating_panel)`. A titled→borderless `setStyleMask:`
   transition crashes with `NSRangeException` (AppKit content-view teardown vs. WebKit's
   `WKWindowVisibilityObserver` KVO).
2. **Never `.no_activate(true)` on a single-window app.** It flips the global
   `NSApplicationActivationPolicy` to `Prohibited` during `build()` — hid the main
   Claudesk window entirely.
3. **Teardown via `panel.to_window()` → `window.close()` ONLY**, in the main window's
   `CloseRequested`. Closing the live panel is a use-after-free abort (`fatal runtime
   error: Rust cannot catch foreign exceptions`). An all-Spaces/floating panel also
   orphans on screen unless explicitly torn down.
4. **`can_become_key_window: false` does NOT stop click-activation** — only the
   `NonactivatingPanel` style mask does.

Setup: crate is git-only (`branch=v2.1`, pinned by `Cargo.lock` to commit `a3122e8`);
requires the `tauri` feature `macos-private-api` + `"macOSPrivateApi": true` in
`tauri.conf.json`. Compiles against Tauri 2.11.2. Builder method is `collection_behavior`
(American), not the British spelling arch.md wrote.

Full detail: `docs/product/wbs.md` → "Probe outcomes". The working code is the kept WP3
seed at `src-tauri/src/pip_probe/` (rename off `_probe` + replace the throwaway button
at WP3). Related: [[tauri-xterm-pty-gotchas]].

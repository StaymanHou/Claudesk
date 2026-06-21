---
name: verify-native-pty-via-ps-screencapture-stderr
description: How to actually verify PTY/native behavior in Claudesk when Playwright can't see the WKWebView and the Vite browser has no backend.
metadata:
  type: reference
---

Browser-based verify-self **structurally cannot** observe Claudesk's real PTY/native behavior, for two compounding reasons:

1. **Playwright cannot attach to the Tauri WKWebView** — the native window is not a browser Playwright can drive.
2. **The Vite-served frontend (`http://localhost:1420`) has no Tauri backend** — so `invoke()` calls (`cc_spawn`, `term_spawn`, `cc_ready`, every command) reject with `Cannot read properties of undefined (reading 'invoke')`. The frontend panel-switch / mount logic renders, but anything backend-backed (a live shell, a real PTY prompt) never runs.

So a browser verify-self can confirm *frontend wiring* (a slot mounts, a tab toggles, no React crash) but **never** the load-bearing native behavior (does the shell prompt paint? did exactly one process spawn?). This is the actionable companion to [[verify-self-stub-cannot-cross-subprocess-boundary]] and [[macos-tcc-permissions-granted]].

**The native verification toolkit (use these, not browser verify-self, for PTY/native features):**
- **`ps -axo pid,etime,command | grep <proc>`** — count spawned processes + check state/age. Decisive for spawn-lifecycle bugs (e.g. "1 shell or 3?", "is the orphan reaped?"). Filter young procs by `etime` to exclude your own long-running sessions.
- **`screencapture -o -x [-R x,y,w,h] /tmp/shot.png`** then Read it — macOS CAN capture the WKWebView (Terminal.app has Screen Recording granted, see [[macos-tcc-permissions-granted]]). This is how you confirm a prompt actually painted. `-R` crops to the panel region.
- **Native-stderr telemetry** — `eprintln!("// TELEMETRY ...")` in Rust + (for frontend hops) a temp `dbg_log(msg)` Tauri command the frontend `invoke`s; read it all from the `pnpm tauri dev` log (redirect to a file: `pnpm tauri dev > /tmp/dev.log 2>&1 &`). WKWebView `console.log` does NOT reach the dev stdout, so route frontend signals through the backend. Mark `// TELEMETRY`/`// DBG` for mechanical cleanup; remove before ship.
- **`?ws=<path>` dev seam** — append to `devUrl` in `tauri.conf.json` (or navigate the Vite browser to it) to auto-seed a workspace without the folder dialog, so a native run reaches a workspace headlessly. Revert the `devUrl` edit before ship.
- **Operator devtools** — when the agent can't drive the native window (coordinate clicks need Accessibility for the WebView, which isn't granted), ask the operator to open WKWebView devtools (Cmd+Opt+I → Console) + paste the console + the `pnpm tauri dev` terminal output. On WP9 this was the single most decisive input — it pinned the exact failing hop after agent-side guessing had mis-verified the wrong code path twice.

**Gotcha that cost two back-loops on WP9:** verifying with scaffolding that changes the path under test. Forcing the terminal panel to be the *default* (active-at-mount) to grab a screenshot proved "active-at-mount paints" while the operator's real path was "active-on-reveal" — which still failed. Verify the path the user actually uses; scaffolding must not change which code runs.

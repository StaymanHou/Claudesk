---
name: verify-self-dev-vs-prod-process-name-collision
description: "During live verify-self, osascript \"first process whose name is claudesk\" hits the PROD app, not the dev build — both share the executable/process name; target the dev app by window title or bundle id."
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 96ff82b2-9c55-4b41-8923-57a1475be787
---

During a live verify-self MCP-bridge session, I ran `osascript -e 'tell application "System Events" to set visible of (first process whose name is "claudesk") to false'` to try to force a `WindowEvent::Focused` transition on the **dev** build — but it hid the operator's **PROD** Claudesk app instead. The operator caught it ("you hid the prod claudesk app!"). Restored it with `set visible of (every process whose name is "claudesk") to true`; it was only hidden (never quit), so no data loss.

**Root cause:** Claudesk's dev/prod isolation is by **bundle identifier** (`com.claudesk.app.dev` vs `com.claudesk.app`) for app-data/socket/registration — but the **executable/process name is identical (`claudesk`)** for both. So any `process whose name is "claudesk"` (and especially `first process ...`) is ambiguous and often selects the wrong one (the prod app, if it's running — which it usually is when dogfooding Claudesk with Claudesk).

**Why:** the operator runs the installed prod `.app` and `pnpm tauri:dev` **concurrently** (dogfooding). A process-name match can't tell them apart. Hiding/quitting the wrong one disrupts real work.

**How to apply:** When driving the DEV app during verify-self, NEVER target it by process name. Instead:
- Prefer the **MCP bridge** for everything drivable (it's bound to the dev app on 127.0.0.1:9223 specifically — `mcp__tauri__*` never touches prod).
- If you must use osascript/AppKit to drive the dev app (e.g. forcing an OS focus transition the bridge can't), match on the **window title `"Claudesk (dev)"`** (set by `tauri.dev.json`) or the **bundle id `com.claudesk.app.dev`** — never `name is "claudesk"`.
- Better still: avoid OS-focus manipulation entirely. Forcing `WindowEvent::Focused` headlessly is unreliable anyway (the dev app is often on a different Space; hide/show didn't fire the Tauri focus event in M9 WP2.5 P2), and it risks this exact prod-collision + the Space-gathering side effect ([[feedback_osascript_activate_side_effects]]). Carry live-focus-transition checks to verify-human instead.

Related: [[feedback_osascript_activate_side_effects]], [[installed-build-verify-deferred-to-release]].

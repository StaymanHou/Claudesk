---
name: verify-self-dev-vs-prod-process-name-collision
description: "During live verify-self, osascript \"first process whose name is claudesk\" hits the PROD app, not the dev build — both share the executable/process name; drive the dev app ONLY through the MCP bridge (title/bundle-id targeting also silently hits prod — the dev binary is un-bundled)."
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
- ⚠️ **CORRECTED 2026-09-23: do NOT fall back to window-title or bundle-id targeting either.** This bullet used to say it was safe. It is not for the dev build: `target/debug/claudesk` is an **un-bundled** binary, so System Events reports `bundle identifier = missing value` for it and shows no windows early in a launch. Both schemes then **silently resolve to the PROD app**. A `keystroke "q"` quit the operator's prod app this way (M13.5 WP1), and a window enumeration "of the dev PID" returned prod's windows. **Never send osascript/System Events to the dev app while prod runs.** Use the bridge (`manage_window`, `ipc_emit_event`; quit via `ipc_emit_event('quit-requested')`). Full write-up: `docs/lessons/mcp-tauri-bridge-caveats.md` caveat (m).
- Better still: avoid OS-focus manipulation entirely. Forcing `WindowEvent::Focused` headlessly is unreliable anyway (the dev app is often on a different Space; hide/show didn't fire the Tauri focus event in M9 WP2.5 P2), and it risks this exact prod-collision + the Space-gathering side effect ([[feedback_osascript_activate_side_effects]]). Carry live-focus-transition checks to verify-human instead.

**TEARDOWN IS THE SAME COLLISION — DO NOT BLANKET-KILL (2026-07-13, real incident with data loss).** The `pkill -f "target/debug/claudesk"` + `lsof -ti tcp:1420 tcp:9223 | xargs kill -9` teardown I ran after a verify-self MCP-bridge session is the SAME footgun as the osascript case, on the kill side. During M9 WP6b-2 I did this teardown at 11:19 and it killed the operator's **actively-in-use** Claudesk (which had live morning workspaces open: neo-stayman-assistant + claudesk). It fired `WorkspaceClose` on all their sessions, ended them, and produced a ~7h empty band in the time-analytics dashboard (11:19→18:48) that we then spent multiple turns misdiagnosing as a capture/reclassifier bug — it was self-inflicted. Root cause identical: `pkill -f target/debug/claudesk` matches ANY instance of that binary (the operator may run the dev build themselves while dogfooding), and blanket-killing ports 1420/9223 kills whatever holds them, not specifically the instance I launched.
  - **Rule:** scope teardown to the EXACT process you launched — capture the PID from your own `pnpm tauri:dev &` (`$!`, or the Bash tool's background task id) and kill only that PID tree. NEVER `pkill -f target/debug/claudesk` or a blanket `lsof … | xargs kill -9` on the shared ports.
  - **Before ANY kill during a Claudesk session, assume a real user instance may be running.** If you can't prove the process you're about to kill is the one you started, don't kill it — leave it and note the orphan instead. A stale port at worst wastes one relaunch; killing the operator's live app destroys real work + fabricates phantom "bugs."
  - The CLAUDE.md caveat-(d) teardown ("`lsof -ti tcp:1420 tcp:9223 | xargs kill -9`") was written for a solo-agent context and is UNSAFE when the operator is concurrently using Claudesk — treat it as PID-scoped, not blanket.

Related: [[feedback_osascript_activate_side_effects]], [[installed-build-verify-deferred-to-release]], [[claudesk-philosophy]].

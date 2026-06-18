---
name: tauri-command-removal-needs-invoke-sweep
description: Removing/renaming a #[tauri::command] needs a frontend invoke() caller sweep + runtime smoke-launch — the FE/BE binding is stringly-typed and invisible to the unit gate
metadata:
  type: project
---

In Tauri, the frontend↔backend command binding is **stringly-typed**: the frontend calls `invoke("<name>", …)` and the backend exposes `#[tauri::command] fn <name>`. Nothing checks that the string matches a registered command at compile time — not `tsc`, not `cargo test`, not `cargo clippy -D warnings`. A removed/renamed command with a live `invoke()` caller **passes the entire unit gate** and breaks only at runtime when the call fires.

**Rule when touching the command surface (add, remove, rename a `#[tauri::command]`):**
1. **Caller sweep before deletion** — `grep -rn 'invoke("<name>"' src/` (and `generate_handler!` registration in Rust). No orphaned callers may remain.
2. **Runtime smoke-launch** — `pnpm tauri dev`, confirm clean launch + exercise the affected path. The unit suite is necessary but NOT sufficient for FE/BE-spanning changes.

**Discovered 2026-06-17/18:** the scaffold-debt refactor removed the demo `greet` command but left `App.tsx` calling `invoke("greet", …)`. Full gate stayed green; the Greet button would have thrown "command not found" at runtime. Caught only when verification was questioned, then fixed by stripping the greet demo from `App.tsx`.

**Load-bearing for WP7** (`PtyCcSession` / `CcSession`): every command added to or changed on Claudesk's real command surface inherits this rule. The native runtime smoke-launch is now possible from Bash — see [[macos-tcc-permissions-granted]] (screencapture + osascript work). See also [[observable-outcomes-execution-evidence]].

---
name: verify-main-thread-freeze-via-sample
description: How to prove a Tauri command does or does not block the main thread — `sample` during a fire-then-poll bridge invoke, read the com.apple.main-thread section, positive control by swapping only the command file back to HEAD under tauri:dev's hot rebuild.
metadata:
  type: reference
---

**Question it answers:** does this `#[tauri::command]` run its wait ON the main thread (freezing the UI)? The MCP bridge cannot answer it — its `webview_execute_js` reports "Script execution timeout" for ANY script that calls `invoke`, so a bridge timeout is not a freeze signal ([[mcp-bridge-tools-not-exposed-to-subagents]] for who can drive it).

**Recipe (orchestrator only — the bridge does not reach subagents):**
1. `pnpm tauri:dev` (dev identity `com.claudesk.app.dev`; confirm from the bridge init log). Never touch the operator's installed PID.
2. Fire-then-poll: in `webview_execute_js`, start `__TAURI_INTERNALS__.invoke('<cmd>', {...})` storing the result on `window.__x` in `.then`/`.catch` (the eval itself times out — expected). Pick an input that keeps the command busy for several seconds (for the adjudicator: a ~400-word prompt to `claude -p`, ~13s).
3. Immediately, while the work is in flight (confirm with `ps` that the child's PPID is the dev app): `sample <pid> 3 -file <scratch>/sample.txt`.
4. Read it: `grep -n "com.apple.main-thread"` gives the main-thread section's line range; grep the command's frames (`run_command`, the command fn name) and check which thread section they fall in. Idle main thread = `mach_msg2_trap` / `__CFRunLoopRun`, and its only `claudesk_lib` frame is `claudesk_lib::run` (the event-loop root).
5. Poll `window.__x` to prove the command still WORKS through the new path.
6. **Positive control:** `cp` the command's file aside, write `git show HEAD:<file>` over it, let tauri:dev hot-rebuild (new PID), repeat 2–4, then restore by `cp` + `shasum -c`. The pre-fix sample must show the frames under the main thread — otherwise the method proves nothing. ⚠️ If the feature moved an export that the HEAD file imports, the swapped-in file blanks the app instead; build the control from the fixed file with only the behaviour reverted ([[positive-control-from-head-can-break-on-moved-exports]]).
7. Teardown: `driver_session stop`, `TaskStop` the dev task, check `lsof -nP -iTCP:1420 -iTCP:9223` is empty.

**Measured (paydown 2026-09-23 WP9, `supervisor_adjudicate`):** pre-fix `supervisor_adjudicate → run_command` under `com.apple.main-thread` in **2327/2327** samples; post-fix (async + `spawn_blocking`) **0** — the frames sat on a `tokio-rt-worker` thread. A clean discriminator.

**⚠️ A command that finishes fast cannot be sampled one call at a time** (added 2026-11-04, paydown WP4,
`trash_path`). The `webview_execute_js` call that fires the invoke itself holds until the bridge's
timeout, so a single ~150 ms call (or one delayed with `setTimeout`) is over before `sample` attaches,
and the sample shows no frames at all. That reads like a pass but proves nothing. Fix: chain N calls
inside the webview (`for … await invoke(…)` in an async IIFE, recording start/end/done on `window`),
sample while it runs, then check that the chain was still going (work left over when the sample ended,
or the chain's `end` later than the sample's end). 80 chained `trash_path` calls ran ~12 s and gave
2110/2491 main-thread samples pre-fix vs 0/2597 post-fix.

**The main thread's label varies between samples:** `Thread_N: main` in one run and
`Thread_N   DispatchQueue_1: com.apple.main-thread  (serial)` in another. Locate it with
`grep -n "^ \+[0-9]\+ Thread_"` and take the first section, rather than grepping one fixed label (a
miss there yields an empty range, which reads as "0 frames on main").

The static counterpart is `src-tauri/tests/sync_commands_do_not_block.rs` (the guard); this recipe is for the live UI-freeze half it cannot observe. See [[verify-native-pty-via-ps-screencapture-stderr]] for adjacent native-verification techniques.

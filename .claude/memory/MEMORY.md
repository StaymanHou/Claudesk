# Memory Index

base=MEMORY.md
- [bash-cargo-env.md](bash-cargo-env.md) — Bash subshells in Claude Code sessions do not inherit ~/.cargo/env from the user's login shell; cargo/rustc invocations require an explicit PATH prefix.
- [verify-self-dev-vs-prod-process-name-collision.md](verify-self-dev-vs-prod-process-name-collision.md) — osascript "process whose name is claudesk" hits the PROD app during dev verify-self (same process name); target the dev app by window title / bundle id, or avoid OS-focus driving entirely. Teardown must be PID-scoped — never blanket pkill/port-kill (killed operator's live app 2026-07-13).
- [time-tracking-capture-is-machine-global.md](time-tracking-capture-is-machine-global.md) — time-analytics capture is machine-global + gated by a live tracking-ON instance; any tracking-on Claudesk logs ALL CC sessions on the machine (incl. the other app's). Expected behavior — flag proactively when reading the dashboard.
- [day-view-flexible-timeline-model.md](day-view-flexible-timeline-model.md) — M9 Day view = continuous video-editor flexible timeline (SHIPPED 2026-07-15, fixed-origin @ today-29d); coordinate frame has ONE source of truth (ViewportContext dataWindow + DayWindowContext windowStartIso) — every consumer READS it, never recomputes (the P2.7 Minimap regression).
- [reclassifier-primitives-need-session-end-cap.md](reclassifier-primitives-need-session-end-cap.md) — Aggregate-duration consumers of the reclassify primitives (active_bursts/session_active_ms/tool_intervals/subagent_intervals) must clip events at resolve_session_end FIRST — the WP6.5 cap lives in the CALLER (build_viz_session/build_metrics::capped_events), not the primitives (RAW bursts); skipping it inflates durations (the 885-min dangling-burst trap).
- [vitest-raw-import-css-returns-processed-not-text.md](vitest-raw-import-css-returns-processed-not-text.md) — Vitest ?raw import of a .css file does NOT yield raw file text (Vite CSS plugin intercepts) — read CSS source-guards via node:fs readFileSync, not ?raw (the .tsx/.ts ?raw convention doesn't extend to .css).
- [mcp-bridge-manage-window-reads-native-geometry.md](mcp-bridge-manage-window-reads-native-geometry.md) — MCP bridge manage_window {info, windowId} returns a native window's on-screen frame geometry (x/y/w/h, top-left-origin y-down) → native window-POSITION features are agent-verifiable via geometry math (convert to AppKit bottom-left y-up when checking). Caveat (f) on the bridge-verify-self list.
- [mcp-bridge-seed-held-workspace-status-via-fiber.md](mcp-bridge-seed-held-workspace-status-via-fiber.md) — Hold a workspace CC status for a bridge verify-self check by dispatching setStatusMap via the React fiber; ipc_emit_event double-encodes the payload to a JSON string (applyStatusUpdate no-ops) and a real CC turn races faster than inter-tool latency. Next in the bridge-caveat chain.
base=bash-cargo-env.md
desc='Bash subshells in Claude Code sessions do not inherit ~/.cargo/env from the user'\''s login shell; cargo/rustc invocations require an explicit PATH prefix.'
- [brew-cask-manual-delete-desync.md](brew-cask-manual-delete-desync.md) — "Why \"brew won't reinstall claudesk after I deleted the app\" happens, and the fix"
base=brew-cask-manual-delete-desync.md
desc='"Why \"brew won'\''t reinstall claudesk after I deleted the app\" happens, and the fix"'
- [cc-hook-capture-beats-docs.md](cc-hook-capture-beats-docs.md) — For CC hook-channel work, a live hook-stream capture beats the official docs — docs can be confidently wrong about event existence
base=cc-hook-capture-beats-docs.md
desc=$'For CC hook-channel work, a live hook-stream capture beats the official docs �\M-\C-@\M-\C-T docs can be confidently wrong about event existence'
- [cc-hook-event-facts.md](cc-hook-event-facts.md) — Concrete Claude Code v2.1.x hook-event facts for Claudesk's status channel (live-captured)
base=cc-hook-event-facts.md
desc='Concrete Claude Code v2.1.x hook-event facts for Claudesk'\''s status channel (live-captured)'
- [cc-tui-cr-not-lf.md](cc-tui-cr-not-lf.md) — Raw-mode CC PTY interaction — /cmd byte-injection must end in  (0x0d) to execute; 
 only triggers autocomplete typeahead. Used by WP7 PtyCcSession trait.
base=cc-tui-cr-not-lf.md
desc=$'Raw-mode CC PTY interaction �\M-\C-@\M-\C-T /cmd byte-injection must end in \\r (0x0d) to execute; \\n only triggers autocomplete typeahead. Used by WP7 PtyCcSession trait.'
- [claudesk-philosophy.md](claudesk-philosophy.md) — "The deliberate design philosophy behind Claudesk — opinionated, Claude-specific, parallel-across-projects, attention as the scarce resource"
base=claudesk-philosophy.md
desc=$'"The deliberate design philosophy behind Claudesk �\M-\C-@\M-\C-T opinionated, Claude-specific, parallel-across-projects, attention as the scarce resource"'
- [cm6-dont-copy-compartment-by-analogy.md](cm6-dont-copy-compartment-by-analogy.md) — Don't add a CM6 Compartment by analogy to fontSizeCompartment without checking the new case needs live reconfigure — an array-rebuild may already swap the value, making the compartment vestigial.
base=cm6-dont-copy-compartment-by-analogy.md
desc=$'Don\'t add a CM6 Compartment by analogy to fontSizeCompartment without checking the new case needs live reconfigure �\M-\C-@\M-\C-T an array-rebuild may already swap the value, making the compartment vestigial.'
- [cmd-shift-digit-reserved-for-filmstrip.md](cmd-shift-digit-reserved-for-filmstrip.md) — ⌘⇧+digit is reserved for future workspace/filmstrip switching in Claudesk; do not claim it for editor features
base=cmd-shift-digit-reserved-for-filmstrip.md
desc=$'�\M-\C-L\M-\C-X�\M-\C-G�+digit is reserved for future workspace/filmstrip switching in Claudesk; do not claim it for editor features'
- [feedback_no_sublime_activate.md](feedback_no_sublime_activate.md) — Dev-time rule only — macOS Spaces yanks live ST windows to current Desktop; the Claudesk app's runtime ST activation is NOT constrained
base=feedback_no_sublime_activate.md
desc=$'Dev-time rule only �\M-\C-@\M-\C-T macOS Spaces yanks live ST windows to current Desktop; the Claudesk app\'s runtime ST activation is NOT constrained'
- [feedback_osascript_activate_side_effects.md](feedback_osascript_activate_side_effects.md) — Activating any app via osascript/open -a/subl/etc. gathers that app's windows onto the current Desktop — treat as a write during dev-time probes
base=feedback_osascript_activate_side_effects.md
desc=$'Activating any app via osascript/open -a/subl/etc. gathers that app\'s windows onto the current Desktop �\M-\C-@\M-\C-T treat as a write during dev-time probes'
- [feedback_read_help_before_cli_matrix.md](feedback_read_help_before_cli_matrix.md) — Five seconds of --help reading collapses redundant matrix rows and surfaces native flags upstream research may have missed
base=feedback_read_help_before_cli_matrix.md
desc='Five seconds of --help reading collapses redundant matrix rows and surfaces native flags upstream research may have missed'
- [feedback_surfaced_in_discoveries_not_worktree.md](feedback_surfaced_in_discoveries_not_worktree.md) — Work Tree leaves are units of work; SURFACED items are notices — mixing them creates parent-completion-invariant violations
base=feedback_surfaced_in_discoveries_not_worktree.md
desc=$'Work Tree leaves are units of work; SURFACED items are notices �\M-\C-@\M-\C-T mixing them creates parent-completion-invariant violations'
- [hmr-stale-across-file-rename.md](hmr-stale-across-file-rename.md) — A long-lived Vite/HMR dev window across a mid-build file RENAME can half-apply and fake a regression — relaunch before suspecting the diff.
base=hmr-stale-across-file-rename.md
desc=$'A long-lived Vite/HMR dev window across a mid-build file RENAME can half-apply and fake a regression �\M-\C-@\M-\C-T relaunch before suspecting the diff.'
- [installed-build-verify-deferred-to-release.md](installed-build-verify-deferred-to-release.md) — "Operator defers installed-`.app` / native-window manual verification to the /release packaging gate, not per-feature verify-human"
base=installed-build-verify-deferred-to-release.md
desc='"Operator defers installed-`.app` / native-window manual verification to the /release packaging gate, not per-feature verify-human"'
- [m7-docs-viewer-intent.md](m7-docs-viewer-intent.md) — "Why Claudesk's M7 workflow-docs markdown viewer exists — it's an attention/re-orientation feature, not a documentation reader"
base=m7-docs-viewer-intent.md
desc=$'"Why Claudesk\'s M7 workflow-docs markdown viewer exists �\M-\C-@\M-\C-T it\'s an attention/re-orientation feature, not a documentation reader"'
- [macos-case-collision-module-naming.md](macos-case-collision-module-naming.md) — On macOS case-insensitive FS, foo.ts and Foo.tsx collide (tsc TS1149/TS1261) — name pure modules case-distinct from their PascalCase component siblings.
base=macos-case-collision-module-naming.md
desc=$'On macOS case-insensitive FS, foo.ts and Foo.tsx collide (tsc TS1149/TS1261) �\M-\C-@\M-\C-T name pure modules case-distinct from their PascalCase component siblings.'
- [macos-tcc-permissions-granted.md](macos-tcc-permissions-granted.md) — Terminal.app has Accessibility + Screen Recording granted; agent can screenshot native windows and run osascript GUI queries
base=macos-tcc-permissions-granted.md
desc='Terminal.app has Accessibility + Screen Recording granted; agent can screenshot native windows and run osascript GUI queries'
- [observable-outcomes-execution-evidence.md](observable-outcomes-execution-evidence.md) — feature-plan discipline in Claudesk. Outcomes that test command execution must require BOTH the typing-side evidence AND the execution-side evidence (output body, exit code, state change). "Marker appears in output" is too weak for execution checks.
base=observable-outcomes-execution-evidence.md
desc='feature-plan discipline in Claudesk. Outcomes that test command execution must require BOTH the typing-side evidence AND the execution-side evidence (output body, exit code, state change). "Marker appears in output" is too weak for execution checks.'
- [pty-output-buffer-until-frontend-ready.md](pty-output-buffer-until-frontend-ready.md) — A new PTY session kind must buffer early output until the frontend attaches its listener + calls cc_ready — a quiescent shell loses its one-shot prompt otherwise.
base=pty-output-buffer-until-frontend-ready.md
desc=$'A new PTY session kind must buffer early output until the frontend attaches its listener + calls cc_ready �\M-\C-@\M-\C-T a quiescent shell loses its one-shot prompt otherwise.'
- [pty-probe-observable-default.md](pty-probe-observable-default.md) — Project-wide pattern for PTY probe harnesses in Claudesk (WP2, WP4, WP7, future workspace-process work). Reader thread must mirror PTY output to an observable surface by default; opt-out to silent byte-counting only when needed.
base=pty-probe-observable-default.md
desc='Project-wide pattern for PTY probe harnesses in Claudesk (WP2, WP4, WP7, future workspace-process work). Reader thread must mirror PTY output to an observable surface by default; opt-out to silent byte-counting only when needed.'
- [raw-mode-cr-is-enter.md](raw-mode-cr-is-enter.md) — POSIX terminal line-discipline fact relevant to ALL PTY-driven subprocesses in Claudesk (not just CC). Raw mode disables CR→NL translation, so input lines must end in  to register as Enter.
base=raw-mode-cr-is-enter.md
desc=$'POSIX terminal line-discipline fact relevant to ALL PTY-driven subprocesses in Claudesk (not just CC). Raw mode disables CR�\M-\C-F\M-\C-RNL translation, so input lines must end in \\r to register as Enter.'
- [synthetic-tab-seam-reusable-readonly-buffer.md](synthetic-tab-seam-reusable-readonly-buffer.md) — The WP12 synthetic-tab seam renders programmatic read-only content as an editor tab; consumers must supply font-size + decorations (it doesn't inherit the editor's live zoom).
base=synthetic-tab-seam-reusable-readonly-buffer.md
desc='The WP12 synthetic-tab seam renders programmatic read-only content as an editor tab; consumers must supply font-size + decorations (it doesn'\''t inherit the editor'\''s live zoom).'
- [tauri-command-removal-needs-invoke-sweep.md](tauri-command-removal-needs-invoke-sweep.md) — Removing/renaming a #[tauri::command] needs a frontend invoke() caller sweep + runtime smoke-launch — the FE/BE binding is stringly-typed and invisible to the unit gate
base=tauri-command-removal-needs-invoke-sweep.md
desc=$'Removing/renaming a #[tauri::command] needs a frontend invoke() caller sweep + runtime smoke-launch �\M-\C-@\M-\C-T the FE/BE binding is stringly-typed and invisible to the unit gate'
- [tauri-nspanel-pip-gotchas.md](tauri-nspanel-pip-gotchas.md) — tauri-nspanel v2.1 PiP usage rules for M5 WP3 — four AppKit gotchas each found via a live crash at verify-human
base=tauri-nspanel-pip-gotchas.md
desc=$'tauri-nspanel v2.1 PiP usage rules for M5 WP3 �\M-\C-@\M-\C-T four AppKit gotchas each found via a live crash at verify-human'
- [tauri-scaffold-recipe.md](tauri-scaffold-recipe.md) — The exact non-interactive command and merge pattern used to scaffold WP1 (Tauri 2 + React + TS + Vite) without destroying strategic docs.
base=tauri-scaffold-recipe.md
desc='The exact non-interactive command and merge pattern used to scaffold WP1 (Tauri 2 + React + TS + Vite) without destroying strategic docs.'
- [tauri-xterm-pty-gotchas.md](tauri-xterm-pty-gotchas.md) — Embedding xterm.js + a PTY in a Tauri WKWebView needs explicit TERM, term.focus(), and rAF-deferred fit() — none are automatic.
base=tauri-xterm-pty-gotchas.md
desc=$'Embedding xterm.js + a PTY in a Tauri WKWebView needs explicit TERM, term.focus(), and rAF-deferred fit() �\M-\C-@\M-\C-T none are automatic.'
- [verify-native-pty-via-ps-screencapture-stderr.md](verify-native-pty-via-ps-screencapture-stderr.md) — How to actually verify PTY/native behavior in Claudesk when Playwright can't see the WKWebView and the Vite browser has no backend.
base=verify-native-pty-via-ps-screencapture-stderr.md
desc='How to actually verify PTY/native behavior in Claudesk when Playwright can'\''t see the WKWebView and the Vite browser has no backend.'
- [verify-self-stub-cannot-cross-subprocess-boundary.md](verify-self-stub-cannot-cross-subprocess-boundary.md) — A stubbed verify-self (Tauri IPC faked in a plain browser) passes precisely where it can't reach — the real-subprocess bugs hide at the boundary the stub replaces.
base=verify-self-stub-cannot-cross-subprocess-boundary.md
desc=$'A stubbed verify-self (Tauri IPC faked in a plain browser) passes precisely where it can\'t reach �\M-\C-@\M-\C-T the real-subprocess bugs hide at the boundary the stub replaces.'
- [wp4-macos-perf-measurement.md](wp4-macos-perf-measurement.md) — How to measure CPU/RAM/frame-time of the Tauri WKWebView on macOS for Claudesk perf probes

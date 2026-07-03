# Memory Index

base=MEMORY.md
- [bash-cargo-env.md](bash-cargo-env.md) — Bash subshells in Claude Code sessions do not inherit ~/.cargo/env from the user's login shell; cargo/rustc invocations require an explicit PATH prefix.
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

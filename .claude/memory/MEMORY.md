# Memory Index

## Verification method & instrument traps

- [verify-the-mutation-landed.md](verify-the-mutation-landed.md) — A mutation test must confirm it changed *executable code*, not just that the test ran; `sed -n '<line>p'` the mutated line before believing a pass. A silent no-op looks exactly like a real guard hole and leads to weakening a guard that was fine.
- [invalid-probe-and-real-hole-look-identical.md](invalid-probe-and-real-hole-look-identical.md) — A guard probe that PASSES means either a real hole or an invalid probe (violation placed in an exempt module) — indistinguishable from the result alone. Verify the probe's premises before weakening the guard.
- [guard-predicate-completeness-vs-mutation-landing.md](guard-predicate-completeness-vs-mutation-landing.md) — A guard's PREDICATE can be incomplete, so "0 findings" is under-determined (distinct from a mutation that never lands): interrogate the parsed DOM, mutation-test each option individually, attribute each mutant to its own probe.
- [raw-guard-identifier-satisfied-by-own-comments.md](raw-guard-identifier-satisfied-by-own-comments.md) — A `?raw` guard asserting a bare identifier is satisfied by the module's OWN COMMENTS, so it passes exactly when the named code was deleted — strip comments, assert the CALL shape `fn(`.
- [extract-for-import-when-a-raw-guard-cant-express-the-property.md](extract-for-import-when-a-raw-guard-cant-express-the-property.md) — For a BEHAVIORAL property, extract the code so a test drives the real thing; a better source-text predicate can only encode shapes you thought of. A test that RE-IMPLEMENTS the code shares its blind spot.
- [raw-guard-jsx-prose-needs-flattened-haystack.md](raw-guard-jsx-prose-needs-flattened-haystack.md) — A `?raw` guard over user-visible PROSE must flatten whitespace first; phrases otherwise pass only by luck about where Prettier wraps. The emptiness meta-guard must keep reading the RAW import.
- [widened-selector-must-be-strict-superset.md](widened-selector-must-be-strict-superset.md) — When widening a guard/lint/codemod's file-selection predicate, diff the OLD and NEW candidate sets — "does it catch the new target?" passes while silently DROPPING a module previously in scope.
- [rustdoc-link-to-a-nonexistent-test-fails-no-gate.md](rustdoc-link-to-a-nonexistent-test-fails-no-gate.md) — A doc comment can cite a test that DOESN'T EXIST and pass cargo test + clippy + fmt. `grep -rc "fn <name>"` returning 1 means only the citation exists.
- [doc-correction-scope-list-is-a-floor.md](doc-correction-scope-list-is-a-floor.md) — A doc-correction task's enumerated site list is a FLOOR: grep the retracted CLAIM repo-wide first (WP4d — 5 named, 10 wrong; the unnamed ones held a disproven design still standing as live spec). Separate string-matches from claim-assertions.
- [prove-mechanical-transform-by-rerunning-it.md](prove-mechanical-transform-by-rerunning-it.md) — To prove a formatter sweep changed nothing semantic, re-run the transform on the pre-change input and diff; do NOT hand-write a normalizer (`git diff -w` and whitespace/paren-stripping each false-alarmed).
- [observable-outcomes-execution-evidence.md](observable-outcomes-execution-evidence.md) — Outcomes testing command execution need BOTH typing-side AND execution-side evidence (output body, exit code, state change). "Marker appears in output" is too weak.
- [pnpm-exec-shadows-local-binaries.md](pnpm-exec-shadows-local-binaries.md) — `pnpm exec tsc` runs the PNPM binary and exits 0 regardless of type errors (silent FALSE GREEN); use `./node_modules/.bin/tsc`. `pnpm run <script>` is trustworthy.
- [vitest-raw-import-css-returns-processed-not-text.md](vitest-raw-import-css-returns-processed-not-text.md) — A Vitest `?raw` import of a `.css` file does NOT yield raw text (Vite's CSS plugin intercepts); read CSS source-guards via `node:fs`.

## verify-self: what the agent can and cannot observe

- [verify-self-stub-cannot-cross-subprocess-boundary.md](verify-self-stub-cannot-cross-subprocess-boundary.md) — A stubbed verify-self (faked Tauri IPC in a plain browser) passes precisely where it can't reach; the real bugs hide at the boundary the stub replaces.
- [verify-native-pty-via-ps-screencapture-stderr.md](verify-native-pty-via-ps-screencapture-stderr.md) — How to verify PTY/native behavior when Playwright can't see the WKWebView and the Vite browser has no backend.
- [xterm-dom-reads-fake-a-blank-pane.md](xterm-dom-reads-fake-a-blank-pane.md) — `.xterm-rows` reads empty and `innerText` returns xterm's injected STYLESHEET, so a "blank pane" verdict can be pure instrument error. Instrument AGREEMENT is not correctness when both share a defect; run a positive control.
- [agent-launched-app-cannot-verify-continue.md](agent-launched-app-cannot-verify-continue.md) — An agent-launched Claudesk cannot verify which conversation `--continue` resumes (spawned sessions inherit `CLAUDE_CODE_CHILD_SESSION`, write no transcript). It CAN prove the flag reaches argv + the arm was selected.
- [verify-self-dev-vs-prod-process-name-collision.md](verify-self-dev-vs-prod-process-name-collision.md) — osascript "process whose name is claudesk" hits the PROD app during dev verify-self; target by window title/bundle id. Teardown must be PID-scoped — never blanket pkill (killed the operator's live app 2026-07-13).
- [lsof-ti-tcp-misses-ipv6-vite.md](lsof-ti-tcp-misses-ipv6-vite.md) — `lsof -ti tcp:1420` misses Vite's IPv6-only listener (use `lsof -nP -iTCP:`). Real lesson: never kill a `target/debug/claudesk` you didn't launch — "port in use" usually means the OPERATOR has it open.
- [installed-build-verify-deferred-to-release.md](installed-build-verify-deferred-to-release.md) — The operator defers installed-`.app` / native-window manual verification to the `/release` gate, not per-feature verify-human.
- [macos-tcc-permissions-granted.md](macos-tcc-permissions-granted.md) — Terminal.app has Accessibility + Screen Recording; the agent can screenshot native windows and run osascript GUI queries.
- [wp4-macos-perf-measurement.md](wp4-macos-perf-measurement.md) — How to measure CPU/RAM/frame-time of the Tauri WKWebView on macOS.

## MCP tauri bridge (caveat chain)

- [mcp-bridge-tools-not-exposed-to-subagents.md](mcp-bridge-tools-not-exposed-to-subagents.md) — `mcp__tauri__*` reaches the ORCHESTRATOR but not spawned subagents (which silently fall back to bare Vite); drive the bridge yourself. `ipc_emit_event`'s param is `eventName`.
- [mcp-bridge-interact-click-needs-el-click-fallback.md](mcp-bridge-interact-click-needs-el-click-fallback.md) — `webview_interact{click}` can fail on a missing ref helper; fall back to `el.click()` in `webview_execute_js`. That bypasses hit-testing, so pair with geometry + `elementFromPoint` when reachability is the point.
- [mcp-bridge-manage-window-reads-native-geometry.md](mcp-bridge-manage-window-reads-native-geometry.md) — `manage_window{info}` returns a native window's on-screen frame → window-POSITION features are agent-verifiable via geometry math (convert to AppKit y-up).
- [mcp-bridge-seed-held-workspace-status-via-fiber.md](mcp-bridge-seed-held-workspace-status-via-fiber.md) — Hold a workspace CC status by dispatching `setStatusMap` via the React fiber; `ipc_emit_event` double-encodes the payload and a real CC turn races faster than inter-tool latency.

## CC hooks, PTY & terminal

- [cc-hook-capture-beats-docs.md](cc-hook-capture-beats-docs.md) — For hook-channel work a live capture beats the official docs, which can be confidently wrong about event existence.
- [cc-hook-event-facts.md](cc-hook-event-facts.md) — Concrete CC v2.1.x hook-event facts for Claudesk's status channel (live-captured).
- [raw-mode-cr-is-enter.md](raw-mode-cr-is-enter.md) — Raw mode disables CR→NL translation, so input lines must end in `\r`. Applies to ALL PTY-driven subprocesses, not just CC.
- [cc-tui-cr-not-lf.md](cc-tui-cr-not-lf.md) — `/cmd` byte-injection must end in `\r` (0x0d) to execute; `\n` only triggers autocomplete typeahead.
- [pty-output-buffer-until-frontend-ready.md](pty-output-buffer-until-frontend-ready.md) — A new PTY session kind must buffer early output until the frontend attaches its listener and calls `cc_ready`, or a quiescent shell loses its one-shot prompt.
- [pty-probe-observable-default.md](pty-probe-observable-default.md) — A PTY probe's reader thread must mirror output to an observable surface by default; opt out to silent byte-counting only when needed.
- [tauri-xterm-pty-gotchas.md](tauri-xterm-pty-gotchas.md) — xterm.js + PTY in a Tauri WKWebView needs explicit TERM, `term.focus()`, and rAF-deferred `fit()` — none automatic.
- [zsh-histfile-overridden-by-etc-zshrc.md](zsh-histfile-overridden-by-etc-zshrc.md) — A HISTFILE env var to a spawned login zsh is overridden by `/etc/zshrc`; isolate via HOME. SIGHUP saves history, SIGTERM/SIGKILL don't.
- [time-tracking-capture-is-machine-global.md](time-tracking-capture-is-machine-global.md) — Time-analytics capture is machine-global: any tracking-on Claudesk logs ALL CC sessions on the machine. Expected — flag proactively when reading the dashboard.

## Architecture, seams & precedents

- [claudesk-philosophy.md](claudesk-philosophy.md) — The deliberate design philosophy: opinionated, Claude-specific, parallel-across-projects, attention as the scarce resource.
- [app-ships-with-no-csp.md](app-ships-with-no-csp.md) — Claudesk ships `"csp": null`, so anything executing in the webview gets the full `__TAURI_INTERNALS__` surface and a sanitizer is the ONLY defense. A plan asking "does it run under our CSP?" has no answer — invert it.
- [m7-docs-viewer-intent.md](m7-docs-viewer-intent.md) — The workflow-docs viewer is an attention/re-orientation feature, not a documentation reader.
- [day-view-flexible-timeline-model.md](day-view-flexible-timeline-model.md) — M9 Day view is a continuous flexible timeline; the coordinate frame has ONE source of truth that every consumer READS, never recomputes (the P2.7 Minimap regression).
- [reclassifier-primitives-need-session-end-cap.md](reclassifier-primitives-need-session-end-cap.md) — Aggregate-duration consumers must clip events at `resolve_session_end` FIRST; the cap lives in the CALLER, not the primitives (the 885-min dangling-burst trap).
- [session-only-vs-permanent-dismiss-precedent.md](session-only-vs-permanent-dismiss-precedent.md) — A two-way "ask later vs never again" precedent already exists in `useUpdater.ts`; copy it instead of inventing a field, and keep the lifecycle marker separate from the feature flag.
- [synthetic-tab-seam-reusable-readonly-buffer.md](synthetic-tab-seam-reusable-readonly-buffer.md) — The synthetic-tab seam renders programmatic read-only content as an editor tab; consumers must supply font-size + decorations.
- [tauri-command-removal-needs-invoke-sweep.md](tauri-command-removal-needs-invoke-sweep.md) — Removing/renaming a `#[tauri::command]` needs a frontend `invoke()` sweep + smoke-launch; the binding is stringly-typed and invisible to the unit gate.
- [tauri-nspanel-pip-gotchas.md](tauri-nspanel-pip-gotchas.md) — Four AppKit gotchas for PiP, each found via a live crash at verify-human.
- [cmd-shift-digit-reserved-for-filmstrip.md](cmd-shift-digit-reserved-for-filmstrip.md) — `⌘⇧`+digit is reserved for workspace/filmstrip switching; don't claim it for editor features.
- [cm6-dont-copy-compartment-by-analogy.md](cm6-dont-copy-compartment-by-analogy.md) — Don't add a CM6 Compartment by analogy without checking the case needs live reconfigure; an array-rebuild may already swap the value.

## Toolchain & environment traps

- [bash-cargo-env.md](bash-cargo-env.md) — Bash subshells don't inherit `~/.cargo/env`; cargo/rustc need an explicit PATH prefix.
- [hmr-stale-across-file-rename.md](hmr-stale-across-file-rename.md) — A long-lived Vite/HMR window can half-apply and fake a regression after a RENAME *or* any edit to a component holding `useRef`/`useState`. Relaunch before believing a verify RESULT.
- [strictmode-remount-deadlocks-an-unreleased-fetch-latch.md](strictmode-remount-deadlocks-an-unreleased-fetch-latch.md) — A fetch-once latch set before the await and never released on cancel deadlocks under StrictMode and renders BLANK while every gate is green. Release in cleanup; model as a pure state machine.
- [block-comment-terminated-by-regex-star-slash.md](block-comment-terminated-by-regex-star-slash.md) — A block comment documenting a regex with `*` then `/` terminates EARLY; tsc then blames your prose lines. Prefer `//` headers.
- [macos-case-collision-module-naming.md](macos-case-collision-module-naming.md) — On macOS's case-insensitive FS `foo.ts` and `Foo.tsx` collide (TS1149/TS1261); name pure modules case-distinct from PascalCase siblings.
- [brew-cask-manual-delete-desync.md](brew-cask-manual-delete-desync.md) — Why "brew won't reinstall claudesk after I deleted the app" happens, and the fix.
- [tauri-scaffold-recipe.md](tauri-scaffold-recipe.md) — The non-interactive scaffold command + merge pattern that doesn't destroy strategic docs.
- [feedback_read_help_before_cli_matrix.md](feedback_read_help_before_cli_matrix.md) — Five seconds of `--help` collapses redundant matrix rows and surfaces native flags upstream research missed.

## Dev-time side effects (macOS focus)

- [feedback_osascript_activate_side_effects.md](feedback_osascript_activate_side_effects.md) — Activating any app via osascript/`open -a`/`subl` gathers its windows onto the current Desktop — treat as a WRITE during probes.
- [feedback_no_sublime_activate.md](feedback_no_sublime_activate.md) — Dev-time rule only: macOS Spaces yanks live Sublime windows to the current Desktop. The app's runtime activation is NOT constrained.

## Workflow-system discipline

- [feedback_surfaced_in_discoveries_not_worktree.md](feedback_surfaced_in_discoveries_not_worktree.md) — Work Tree leaves are units of work; SURFACED items are notices. Mixing them violates the parent-completion invariant.

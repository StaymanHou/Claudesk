# Memory Index

## Operator preferences

- [feedback-operator-labelling-pass-shape](feedback-operator-labelling-pass-shape.md) — Labelling passes: a keyboard card reviewer, two blind readers, sample-then-contested; never a text sheet.

## Verification method & instrument traps

- [detector-scored-against-its-own-table-is-circular](detector-scored-against-its-own-table-is-circular.md) — A detector scored against its own policy table gets 1.000 by identity; score against an independent signal.
- [installed-skills-are-symlinks-into-the-mccc-repo](installed-skills-are-symlinks-into-the-mccc-repo.md) — `~/.claude/skills/` entries are symlinks into mccc; editing one dirties THAT repo. `cp -RL`, check its status.
- [git-checkout-no-ops-on-untracked-file](git-checkout-no-ops-on-untracked-file.md) — Never restore a mutation with `git checkout` (no-op on untracked, destroys dirty work); `cp` aside + `shasum`.
- [verify-redaction-by-what-remains](verify-redaction-by-what-remains.md) — Verify a redaction by asking what is STILL unredacted across the whole artifact, not field by field.
- [verify-the-mutation-landed](verify-the-mutation-landed.md) — Confirm a mutant changed EXECUTABLE code (`sed -n '<line>p'`) and require a `Tests N` line per run.
- [live-dev-app-may-run-a-mutant](live-dev-app-may-run-a-mutant.md) — Rust mutation runs under `tauri:dev` can rebuild the live app from a mutant; check PID start + binary mtime.
- [behavioral-test-can-still-be-an-equivalent-mutant](behavioral-test-can-still-be-an-equivalent-mutant.md) — A landed mutant survives when both paths give identical observables; find the discriminating input.
- [mutant-survives-because-its-line-never-executes](mutant-survives-because-its-line-never-executes.md) — A mutant can survive because a gate short-circuits above its line; check the arm is reachable first.
- [extracted-machine-needs-a-live-caller-guard](extracted-machine-needs-a-live-caller-guard.md) — A pure `plan*` module's own tests can't see it has no callers; guard that every exported `plan*` has one.
- [whole-app-jsdom-boot-via-tauri-mockipc](whole-app-jsdom-boot-via-tauri-mockipc.md) — Boot the real `main.tsx` under jsdom via `mockIPC` + `shouldMockEvents` + `mockWindows` (`appBoot.test.tsx`).
- [real-xtermpane-mounts-under-jsdom](real-xtermpane-mounts-under-jsdom.md) — The real XtermPane mounts under jsdom (fake `@xterm/*`, ResizeObserver, rAF); `useRealTimers()` before teardown.
- [jsdom-listener-throw-is-silent-in-vitest](jsdom-listener-throw-is-silent-in-vitest.md) — Under Vitest jsdom a throw inside a DOM listener is swallowed and the test stays green; tap `window` `error`.
- [vitest-console-log-silent-on-passing-tests](vitest-console-log-silent-on-passing-tests.md) — Vitest here prints no console output on a passing test (stderr.write does); silence is not a negative.
- [ts-arity-flexible-assignability-hides-a-widened-param](ts-arity-flexible-assignability-hides-a-widened-param.md) — Widening a function-type param breaks no impl; capture the VALUE in the double and mutate the call site.
- [measurement-input-must-be-representative](measurement-input-must-be-representative.md) — A measurement's input must exercise the use case, or the reading is about the input, not the system.
- [skill-usage-count-spans-renamed-command-names](skill-usage-count-spans-renamed-command-names.md) — Count a renamed skill across EVERY historical name, matching `<command-name>` in text only.
- [raw-guard-substring-must-be-unique-to-its-site](raw-guard-substring-must-be-unique-to-its-site.md) — A `?raw` guard must anchor on a substring UNIQUE to its site; `grep -c` it before leaning on it.
- [invalid-probe-and-real-hole-look-identical](invalid-probe-and-real-hole-look-identical.md) — A passing guard probe is a real hole OR an invalid probe; verify the probe's premises before weakening the guard.
- [source-guard-blind-to-spread-bindings](source-guard-blind-to-spread-bindings.md) — A regex over literal syntax can't see a spread binding (`...searchKeymap`); resolve the spread.
- [guard-predicate-completeness-vs-mutation-landing](guard-predicate-completeness-vs-mutation-landing.md) — An incomplete guard predicate makes "0 findings" meaningless; mutation-test each option on its own.
- [raw-guard-identifier-satisfied-by-own-comments](raw-guard-identifier-satisfied-by-own-comments.md) — A `?raw` guard on a bare identifier passes on the module's own comments; strip comments, assert `fn(`.
- [extract-for-import-when-a-raw-guard-cant-express-the-property](extract-for-import-when-a-raw-guard-cant-express-the-property.md) — For a behavioral property, extract the code so a test drives the real thing; a regex encodes only known shapes.
- [raw-guard-jsx-prose-needs-flattened-haystack](raw-guard-jsx-prose-needs-flattened-haystack.md) — A `?raw` guard over JSX prose must flatten whitespace first (Prettier wraps); the meta-guard reads RAW.
- [widened-selector-must-be-strict-superset](widened-selector-must-be-strict-superset.md) — When widening a guard's file selector, diff the OLD and NEW candidate sets; it can silently drop a module.
- [cite-code-by-symbol-not-line](cite-code-by-symbol-not-line.md) — Cite code by symbol, never `file:line`: line citations drift and get copied into new docs.
- [rustdoc-link-to-a-nonexistent-test-fails-no-gate](rustdoc-link-to-a-nonexistent-test-fails-no-gate.md) — A doc comment can cite a nonexistent test and pass every gate; check with `grep -rc "fn <name>"`.
- [doc-correction-scope-list-is-a-floor](doc-correction-scope-list-is-a-floor.md) — A doc-correction site list is a FLOOR: grep the retracted claim repo-wide first.
- [backlog-finding-carries-an-implicit-as-of-date](backlog-finding-carries-an-implicit-as-of-date.md) — A backlog finding is true as of its filing date; re-check it first, and don't fabricate a mandate.
- [handoff-detail-can-be-wrong-while-its-conclusion-is-right](handoff-detail-can-be-wrong-while-its-conclusion-is-right.md) — Verify a handoff's shipped-state claims against `git tag` / `git log` before building on them.
- [grep-addressed-doc-loses-value-to-prose-rewrite](grep-addressed-doc-loses-value-to-prose-rewrite.md) — Move a grep-addressed doc near-verbatim and diff the token set; a prose rewrite dropped 259 identifiers.
- [prove-mechanical-transform-by-rerunning-it](prove-mechanical-transform-by-rerunning-it.md) — Prove a formatter sweep is semantic-free by re-running it on the pre-change input and diffing.
- [prove-render-unchanged-via-head-worktree](prove-render-unchanged-via-head-worktree.md) — Prove unchanged output: `renderToStaticMarkup` at a HEAD worktree vs the working tree, then diff.
- [prove-guard-hole-via-head-test-copy](prove-guard-hole-via-head-test-copy.md) — Prove an old guard passed a mutant by running HEAD's test as a throwaway `zz*.test.ts` beside the real one.
- [prove-comments-only-diff-via-parser-tokens](prove-comments-only-diff-via-parser-tokens.md) — Prove a comments-only TS diff via parser leaf tokens (filter JSDoc kinds), with a positive control.
- [observable-outcomes-execution-evidence](observable-outcomes-execution-evidence.md) — Command-execution outcomes need typing-side AND execution-side evidence; "marker in output" is too weak.
- [supervisor-activity-observable-from-cc-transcripts](supervisor-activity-observable-from-cc-transcripts.md) — Supervisor fires and misses are readable from CC transcripts (a fire lands ~4 s after turn end).
- [never-emit-provocation-token-in-supervised-reply](never-emit-provocation-token-in-supervised-reply.md) — In a supervised workspace never write a TRANSITION token you don't mean, even in a code block.
- [pnpm-exec-shadows-local-binaries](pnpm-exec-shadows-local-binaries.md) — `pnpm exec tsc` exits 0 whatever the errors (false green); use `./node_modules/.bin/tsc`.
- [vitest-raw-import-css-returns-processed-not-text](vitest-raw-import-css-returns-processed-not-text.md) — A Vitest `?raw` import of a `.css` file returns processed CSS; read CSS guards via `node:fs`.

## verify-self: what the agent can and cannot observe

- [verify-self-stub-cannot-cross-subprocess-boundary](verify-self-stub-cannot-cross-subprocess-boundary.md) — A stubbed verify-self passes exactly where it can't reach; real bugs hide at the boundary the stub replaces.
- [verify-native-pty-via-ps-screencapture-stderr](verify-native-pty-via-ps-screencapture-stderr.md) — Verify PTY/native behavior via `ps`, `screencapture` and stderr when Playwright can't see the WKWebView.
- [verify-main-thread-freeze-via-sample](verify-main-thread-freeze-via-sample.md) — Prove a main-thread block with `sample` during a fire-then-poll invoke, plus a HEAD positive control.
- [positive-control-from-head-can-break-on-moved-exports](positive-control-from-head-can-break-on-moved-exports.md) — A HEAD-swapped control blanks the app if the feature moved an export it imports; revert only the behavior.
- [agent-cannot-send-real-keystrokes-to-dev-app](agent-cannot-send-real-keystrokes-to-dev-app.md) — Synthetic keydowns never trigger native defaults; native chord checks (⌘R) go to the operator.
- [react-state-read-needs-a-deferred-frame](react-state-read-needs-a-deferred-frame.md) — Read the DOM a frame after a synthetic click, or you see the PREVIOUS render (a false FAIL).
- [xterm-dom-reads-fake-a-blank-pane](xterm-dom-reads-fake-a-blank-pane.md) — `.xterm-rows` reads empty and `innerText` returns a stylesheet; a "blank pane" can be instrument error.
- [read-logs-console-captures-nothing](read-logs-console-captures-nothing.md) — `read_logs{source:"console"}` captures nothing for this app; an empty read is a false green.
- [agent-launched-app-cannot-verify-continue](agent-launched-app-cannot-verify-continue.md) — Agent-launched dev builds need the Claude-marker `env -u` strip; send text, then a separate `\r`.
- [turn-respawn-continue-needs-a-clear-unclean-flag](turn-respawn-continue-needs-a-clear-unclean-flag.md) — `--continue` proves a turn-respawn only with the unclean flag clear; `/exit` leaves it set.
- [verify-self-dev-vs-prod-process-name-collision](verify-self-dev-vs-prod-process-name-collision.md) — osascript/bundle-id targeting hits the PROD app; drive dev via the MCP bridge and tear down by PID.
- [lsof-ti-tcp-misses-ipv6-vite](lsof-ti-tcp-misses-ipv6-vite.md) — `lsof -ti tcp:1420` misses Vite's IPv6 listener; never kill a `target/debug/claudesk` you didn't launch.
- [dev-profile-for-f-b-verification](dev-profile-for-f-b-verification.md) — Verify F-b against `~/.config/claude-original-dev`, never the operator's real profiles.
- [debug-bundle-verifies-bundled-origin](debug-bundle-verifies-bundled-origin.md) — `tauri build --debug --bundles app` + `open` verifies `tauri://localhost` with the bridge (no hardened runtime).
- [installed-build-verify-deferred-to-release](installed-build-verify-deferred-to-release.md) — Installed-`.app` and native-window manual checks are deferred to the `/release` gate.
- [verify-human-agent-runs-cli-captures](verify-human-agent-runs-cli-captures.md) — At verify-human, run the CLI/curl captures yourself; ask the operator only for judgment calls.
- [macos-tcc-permissions-granted](macos-tcc-permissions-granted.md) — Terminal.app has Accessibility + Screen Recording: the agent can screenshot and query the GUI via osascript.
- [verify-trash-via-finder-not-ls](verify-trash-via-finder-not-ls.md) — `~/.Trash` is TCC-blocked; verify a Trash move with a read-only Finder osascript query, never `ls`.
- [wp4-macos-perf-measurement](wp4-macos-perf-measurement.md) — How to measure CPU, RAM and frame time of the Tauri WKWebView on macOS.

## MCP tauri bridge (caveat chain)

- [mcp-bridge-tools-not-exposed-to-subagents](mcp-bridge-tools-not-exposed-to-subagents.md) — `mcp__tauri__*` reaches the orchestrator, not subagents; drive the bridge yourself.
- [mcp-bridge-interact-click-needs-el-click-fallback](mcp-bridge-interact-click-needs-el-click-fallback.md) — If `webview_interact{click}` fails, use `el.click()` + `elementFromPoint`; switch tiles via ⌘⇧N.
- [mcp-bridge-manage-window-reads-native-geometry](mcp-bridge-manage-window-reads-native-geometry.md) — `manage_window{info}` returns native window frames, so window-position features are agent-verifiable.
- [mcp-bridge-seed-held-workspace-status-via-fiber](mcp-bridge-seed-held-workspace-status-via-fiber.md) — Hold a workspace status by dispatching `setStatusMap` via the React fiber, not `ipc_emit_event`.
- [vite-hmr-stamped-url-is-a-separate-module-instance](vite-hmr-stamped-url-is-a-separate-module-instance.md) — An HMR-edited module loads as `<path>?t=<ts>`; a bridge import must use that stamped URL.

## CC hooks, PTY & terminal

- [production-shaped-claude-p-for-adjudicator-scoring](production-shaped-claude-p-for-adjudicator-scoring.md) — Score the adjudicator production-shaped: cwd `/`, CLAUDE* env stripped, `--no-session-persistence`.
- [cc-hook-capture-beats-docs](cc-hook-capture-beats-docs.md) — For hook-channel work a live capture beats the official docs.
- [cc-hook-event-facts](cc-hook-event-facts.md) — Live-captured CC v2.1.x hook-event facts for the status channel.
- [raw-mode-cr-is-enter](raw-mode-cr-is-enter.md) — Raw mode disables CR→NL, so PTY input lines end in `\r`, for every subprocess.
- [cc-tui-cr-not-lf](cc-tui-cr-not-lf.md) — Slash-command injection must end in `\r`; `\n` only triggers autocomplete.
- [pty-output-buffer-until-frontend-ready](pty-output-buffer-until-frontend-ready.md) — A new PTY session kind must buffer output until the frontend listens and calls `cc_ready`.
- [pty-probe-observable-default](pty-probe-observable-default.md) — A PTY probe's reader thread should mirror output to an observable surface by default.
- [tauri-xterm-pty-gotchas](tauri-xterm-pty-gotchas.md) — xterm.js + PTY in WKWebView needs explicit TERM, `term.focus()` and an rAF-deferred `fit()`.
- [wkwebview-button-click-does-not-take-focus](wkwebview-button-click-does-not-take-focus.md) — A button click leaves focus in xterm; overlays must take focus or their keys also reach CC.
- [zsh-histfile-overridden-by-etc-zshrc](zsh-histfile-overridden-by-etc-zshrc.md) — `/etc/zshrc` overrides a HISTFILE env var; isolate via HOME. SIGHUP saves history, SIGTERM doesn't.
- [time-tracking-capture-is-machine-global](time-tracking-capture-is-machine-global.md) — Time-analytics capture logs ALL CC sessions on the machine; flag it when reading the dashboard.

## Architecture, seams & precedents

- [derived-state-is-not-a-proxy-for-its-event](derived-state-is-not-a-proxy-for-its-event.md) — A consumer of "event X" must match every state X maps to; sweep consumers when the enum grows.
- [classifier-must-key-on-the-classified-property](classifier-must-key-on-the-classified-property.md) — Key a classifier on the property itself, not a correlate; a correlate fails as a silent under-report.
- [workspace-status-map-collapses-consecutive-events](workspace-status-map-collapses-consecutive-events.md) — The status MAP collapses consecutive events; per-event consumers must read the RAW stream.
- [no-css-custom-property-layer](no-css-custom-property-layer.md) — There is no CSS token layer, so `var(--x)` resolves to nothing; copy hex from `.panel-tab`.
- [claudesk-philosophy](claudesk-philosophy.md) — Opinionated, Claude-specific, parallel across projects; attention is the scarce resource.
- [app-ships-with-no-csp](app-ships-with-no-csp.md) — Claudesk ships `"csp": null`: webview code gets full `__TAURI_INTERNALS__`, so a sanitizer is the only defense.
- [m7-docs-viewer-intent](m7-docs-viewer-intent.md) — The workflow-docs viewer is an attention/re-orientation feature, not a doc reader.
- [day-view-flexible-timeline-model](day-view-flexible-timeline-model.md) — The Day view's coordinate frame has ONE source of truth that every consumer reads, never recomputes.
- [reclassifier-primitives-need-session-end-cap](reclassifier-primitives-need-session-end-cap.md) — Duration consumers must clip events at `resolve_session_end` first; the cap lives in the caller.
- [session-only-vs-permanent-dismiss-precedent](session-only-vs-permanent-dismiss-precedent.md) — Copy `useUpdater.ts`'s "later vs never" dismiss precedent instead of inventing a field.
- [synthetic-tab-seam-reusable-readonly-buffer](synthetic-tab-seam-reusable-readonly-buffer.md) — The synthetic-tab seam renders read-only content as an editor tab; supply font size + decorations.
- [tauri-command-removal-needs-invoke-sweep](tauri-command-removal-needs-invoke-sweep.md) — Removing a `#[tauri::command]` needs a frontend `invoke()` sweep and a smoke launch.
- [tauri-nspanel-pip-gotchas](tauri-nspanel-pip-gotchas.md) — Four AppKit gotchas for PiP, each found via a live crash.
- [cmd-shift-digit-reserved-for-filmstrip](cmd-shift-digit-reserved-for-filmstrip.md) — `⌘⇧`+digit is reserved for workspace/filmstrip switching.
- [cm6-dont-copy-compartment-by-analogy](cm6-dont-copy-compartment-by-analogy.md) — Don't add a CM6 Compartment by analogy; check the case needs live reconfigure first.

## Toolchain & environment traps

- [node-strip-types-fails-on-extensionless-runtime-imports](node-strip-types-fails-on-extensionless-runtime-imports.md) — `node --experimental-strip-types` breaks on extensionless runtime imports; use a throwaway vitest spec.
- [bsd-sed-lacks-word-boundary](bsd-sed-lacks-word-boundary.md) — BSD `sed` has no `\b`, so a mutation silently no-ops; use `perl -pi -e` and check it landed.
- [check-payload-before-outward-send](check-payload-before-outward-send.md) — Before any outward send from a file, `test -s` + `head` the payload (an empty public issue, #105187).
- [zsh-unquoted-var-does-not-word-split](zsh-unquoted-var-does-not-word-split.md) — zsh doesn't word-split `$files` in a `for`; `$rev:src/x` is a modifier, so write `"${rev}:path"`.
- [bash-cargo-env](bash-cargo-env.md) — Bash subshells lack `~/.cargo/env`; give cargo an explicit PATH prefix.
- [perl-alarm-watchdog-orphans-cargo-test-binary](perl-alarm-watchdog-orphans-cargo-test-binary.md) — A `perl alarm` watchdog around `cargo test` orphans the test binary; `pgrep -fl claudesk_lib-`, kill yours.
- [hmr-stale-across-file-rename](hmr-stale-across-file-rename.md) — A long-lived HMR window can half-apply after a rename and fake a regression; relaunch first.
- [strictmode-remount-deadlocks-an-unreleased-fetch-latch](strictmode-remount-deadlocks-an-unreleased-fetch-latch.md) — A fetch-once latch not released on cancel deadlocks under StrictMode (blank render); release it in cleanup.
- [block-comment-terminated-by-regex-star-slash](block-comment-terminated-by-regex-star-slash.md) — A block comment documenting a regex with `*` then `/` ends early; prefer `//` headers.
- [macos-case-collision-module-naming](macos-case-collision-module-naming.md) — macOS's case-insensitive FS collides `foo.ts` with `Foo.tsx`; name modules case-distinct.
- [brew-cask-manual-delete-desync](brew-cask-manual-delete-desync.md) — Why brew won't reinstall claudesk after a manual app delete, and the fix.
- [tauri-scaffold-recipe](tauri-scaffold-recipe.md) — The non-interactive scaffold + merge pattern that keeps strategic docs intact.
- [feedback_read_help_before_cli_matrix](feedback_read_help_before_cli_matrix.md) — Read `--help` before a CLI test matrix; it collapses rows and surfaces native flags.

- [never-propose-brew-upgrade-to-verify-a-release](never-propose-brew-upgrade-to-verify-a-release.md) — ⚠️ Never propose `brew upgrade` to verify a release: it kills every running Claudesk.
- [release-is-three-artifacts-verify-each](release-is-three-artifacts-verify-each.md) — A release is three artifacts (.app / .dmg / .app.tar.gz); verify each, the self-update payload above all.
- [stage-around-operator-edits-via-blob](stage-around-operator-edits-via-blob.md) — Stage around an operator's same-file edit with a computed blob via `git update-index --cacheinfo`.

## Dev-time side effects (macOS focus)

- [feedback_osascript_activate_side_effects](feedback_osascript_activate_side_effects.md) — Activating an app via osascript / `open -a` / `subl` gathers its windows onto this Desktop: treat it as a WRITE.
- [feedback_no_sublime_activate](feedback_no_sublime_activate.md) — Dev-time only: Spaces yanks live Sublime windows to the current Desktop; the app's runtime is not constrained.

## Workflow-system discipline

- [feedback_surfaced_in_discoveries_not_worktree](feedback_surfaced_in_discoveries_not_worktree.md) — Work Tree leaves are units of work; SURFACED items are notices that belong in Discoveries.

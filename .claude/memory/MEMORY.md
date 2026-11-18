# Memory Index

## Operator preferences

- [Labelling pass shape](feedback-operator-labelling-pass-shape.md) — Keyboard card reviewer, two blind readers, sample-then-contested; never a text sheet.
- ["All good" is the verdict](feedback-operator-all-good-is-the-verdict.md) — Record it; never re-interrogate on ambiguous logs, re-check with own captures.

## Verification method & instrument traps

- [Circular detector score](detector-scored-against-its-own-table-is-circular.md) — Scored against its own policy table it gets 1.000 by identity; use an independent signal.
- [Skills are mccc symlinks](installed-skills-are-symlinks-into-the-mccc-repo.md) — Editing `~/.claude/skills/` dirties the mccc repo; `cp -RL`, check its status.
- [No git checkout restores](git-checkout-no-ops-on-untracked-file.md) — Restore mutants by `cp` aside + `shasum`, `|| exit` if the aside copy fails.
- [Redaction: check what remains](verify-redaction-by-what-remains.md) — Ask what is STILL unredacted across the whole artifact, not field by field.
- [Mutation landed?](verify-the-mutation-landed.md) — Confirm the mutant changed EXECUTABLE code; require a `Tests N` line per run.
- [projects.json re-sorted](projects-json-resorted-on-every-launch.md) — Every launch rewrites it; compare row sets, never a shasum across a launch.
- [Live app may run a mutant](live-dev-app-may-run-a-mutant.md) — `tauri:dev` rebuilds from a Rust mutant; check PID start + binary mtime.
- [Equivalent mutant](behavioral-test-can-still-be-an-equivalent-mutant.md) — Both paths give identical observables; find the discriminating input.
- [Unreachable mutant line](mutant-survives-because-its-line-never-executes.md) — A gate short-circuits above it; check the arm is reachable first.
- [Caller guard for plan*](extracted-machine-needs-a-live-caller-guard.md) — A pure module's tests can't see it has no callers; guard each exported `plan*`.
- [jsdom whole-app boot](whole-app-jsdom-boot-via-tauri-mockipc.md) — Real `main.tsx` via `mockIPC` + `shouldMockEvents` + `mockWindows` (`appBoot.test.tsx`).
- [XtermPane under jsdom](real-xtermpane-mounts-under-jsdom.md) — Fake `@xterm/*`, ResizeObserver, rAF; `useRealTimers()` before teardown.
- [jsdom listener throws](jsdom-listener-throw-is-silent-in-vitest.md) — Swallowed, test stays green; tap `window` `error`.
- [Vitest console silence](vitest-console-log-silent-on-passing-tests.md) — No console output on a passing test (stderr.write shows); silence is not a negative.
- [Widened param hides](ts-arity-flexible-assignability-hides-a-widened-param.md) — Breaks no impl; capture the VALUE in the double, mutate the call site.
- [Representative input](measurement-input-must-be-representative.md) — Else the reading is about the input, not the system.
- [Renamed skill counts](skill-usage-count-spans-renamed-command-names.md) — Count every historical name, `<command-name>` in text only.
- [?raw anchor uniqueness](raw-guard-substring-must-be-unique-to-its-site.md) — Anchor on a substring unique to its site; `grep -c` it first.
- [Invalid probe vs hole](invalid-probe-and-real-hole-look-identical.md) — Verify the probe's premises before weakening a guard.
- [Spread bindings](source-guard-blind-to-spread-bindings.md) — A regex can't see `...searchKeymap`; resolve the spread.
- [Guard predicate completeness](guard-predicate-completeness-vs-mutation-landing.md) — Incomplete predicate makes "0 findings" meaningless; mutate each option alone.
- [?raw satisfied by comments](raw-guard-identifier-satisfied-by-own-comments.md) — Strip comments, assert `fn(`.
- [Extract, don't regex](extract-for-import-when-a-raw-guard-cant-express-the-property.md) — For behavior, extract so a test drives the real code.
- [?raw over JSX prose](raw-guard-jsx-prose-needs-flattened-haystack.md) — Flatten whitespace first (Prettier wraps); the meta-guard reads RAW.
- [Widened selector](widened-selector-must-be-strict-superset.md) — Diff old vs new candidate sets; it can silently drop a module.
- [Cite by symbol](cite-code-by-symbol-not-line.md) — Never `file:line`; line citations drift and get copied.
- [Rustdoc cites ghost test](rustdoc-link-to-a-nonexistent-test-fails-no-gate.md) — Passes every gate; check `grep -rc "fn <name>"`.
- [Doc-fix list is a floor](doc-correction-scope-list-is-a-floor.md) — Grep the retracted claim repo-wide first.
- [Backlog as-of date](backlog-finding-carries-an-implicit-as-of-date.md) — Re-check a finding first; don't fabricate a mandate.
- [Handoff detail vs conclusion](handoff-detail-can-be-wrong-while-its-conclusion-is-right.md) — Check shipped-state claims against `git tag` / `git log`.
- [Grep-addressed docs](grep-addressed-doc-loses-value-to-prose-rewrite.md) — Move near-verbatim, diff the token set (a rewrite dropped 259 identifiers).
- [Prove formatter sweep](prove-mechanical-transform-by-rerunning-it.md) — Re-run it on the pre-change input and diff.
- [Prove render unchanged](prove-render-unchanged-via-head-worktree.md) — `renderToStaticMarkup` at a HEAD worktree vs working tree; wait on lazy panels, run HEAD twice.
- [Prove old guard hole](prove-guard-hole-via-head-test-copy.md) — Run HEAD's test as a throwaway `zz*.test.ts` beside the real one.
- [Comments-only diff](prove-comments-only-diff-via-parser-tokens.md) — Compare parser leaf tokens (filter JSDoc), with a positive control.
- [Execution evidence](observable-outcomes-execution-evidence.md) — Needs typing-side AND execution-side evidence; a marker in output is too weak.
- [Supervisor in transcripts](supervisor-activity-observable-from-cc-transcripts.md) — Fires and misses are readable there (a fire lands ~4 s after turn end).
- [No stray TRANSITION token](never-emit-provocation-token-in-supervised-reply.md) — In a supervised workspace, never write one you don't mean, even in code.
- [pnpm exec false green](pnpm-exec-shadows-local-binaries.md) — `pnpm exec tsc` exits 0 regardless; use `./node_modules/.bin/tsc`.
- [?raw CSS is processed](vitest-raw-import-css-returns-processed-not-text.md) — Read CSS guards via `node:fs`.

## verify-self: what the agent can and cannot observe

- [Stub hides the boundary](verify-self-stub-cannot-cross-subprocess-boundary.md) — A stubbed check passes exactly where it can't reach.
- [PTY via ps/screencapture](verify-native-pty-via-ps-screencapture-stderr.md) — When Playwright can't see the WKWebView.
- [Main-thread freeze](verify-main-thread-freeze-via-sample.md) — `sample` during a fire-then-poll invoke, plus a HEAD positive control.
- [HEAD control vs moved exports](positive-control-from-head-can-break-on-moved-exports.md) — Blanks the app; revert only the behavior.
- [Background focus sets no :focus-within](background-webview-focus-sets-no-focus-within.md) — Hover/focus-revealed controls stay hidden to the bridge; reveal inline to capture; `el.click()` still works.
- [No real keystrokes](agent-cannot-send-real-keystrokes-to-dev-app.md) — Synthetic keydowns skip native defaults; ⌘R-type checks go to the operator.
- [Drive the native menu](drive-native-menu-via-event-emit.md) — Emit `menu` via `plugin:event|emit` from the webview; it reaches App's real listener.
- [Read DOM a frame later](react-state-read-needs-a-deferred-frame.md) — Else you see the PREVIOUS render (a false FAIL).
- [Same-tick editor input](bridge-same-tick-editor-input-sends-stale-draft.md) — Set Prompt text and ⌘↵ in separate calls, else a stale draft sends nothing.
- [xterm DOM fakes blank](xterm-dom-reads-fake-a-blank-pane.md) — `.xterm-rows` reads empty; `innerText` returns a stylesheet.
- [read_logs console empty](read-logs-console-captures-nothing.md) — Captures nothing for this app; empty is a false green.
- [Agent-launched dev app](agent-launched-app-cannot-verify-continue.md) — Needs the Claude-marker `env -u` strip; send text, then a separate `\r`.
- [--continue needs clear flag](turn-respawn-continue-needs-a-clear-unclean-flag.md) — Proves a turn-respawn only with the flag clear; `/exit` leaves it set.
- [Dev vs prod name collision](verify-self-dev-vs-prod-process-name-collision.md) — osascript/bundle-id hits PROD; drive dev via the bridge, kill by PID.
- [lsof misses IPv6 Vite](lsof-ti-tcp-misses-ipv6-vite.md) — Never kill a `target/debug/claudesk` you didn't launch.
- [F-b dev profile](dev-profile-for-f-b-verification.md) — Use `~/.config/claude-original-dev`, never real profiles.
- [Debug bundle origin](debug-bundle-verifies-bundled-origin.md) — `tauri build --debug --bundles app` + `open` verifies `tauri://localhost`.
- [Installed-build checks](installed-build-verify-deferred-to-release.md) — Installed-`.app` and native-window checks wait for the `/release` gate.
- [Run CLI captures yourself](verify-human-agent-runs-cli-captures.md) — Ask the operator only for judgment calls.
- [TCC granted, still flaky](macos-tcc-permissions-granted.md) — `screencapture` can fail a session; use the bridge screenshot.
- [notarytool preflight errors](notarytool-credential-unreadable-while-screen-locked.md) — "No Keychain password item" = screen locked (unlock, don't re-store); 403 "agreement missing" = Account Holder must accept.
- [Trash via Finder](verify-trash-via-finder-not-ls.md) — `~/.Trash` is TCC-blocked; read-only Finder osascript query.
- [Mini account](mini-remote-user-is-stayman.md) — Which account to use (never root-ops), token location, `zsh -l` PATH, the pre-push identifier grep list. Gitignored: names real accounts.
- [Remote verify hygiene](remote-verify-hygiene.md) — Real commands only in a scratch remote folder; check open remote workspaces before stopping the app; rebuilds and App.tsx edits are hard stops; the mini's dev account HAS the workflow skills since 2026-11-17 (manual install, no `git pull`).
- [Trust dialog exits](cc-trust-dialog-defaults-to-exit.md) — Defaults to "No, exit"; read the pane, answer ↓ then \r.
- [Drive the real hook](drive-status-channel-with-real-hook-script.md) — Pipe a payload into the working-tree hook script at the dev socket.
- [WKWebView perf](wp4-macos-perf-measurement.md) — How to measure CPU, RAM and frame time on macOS.

## MCP tauri bridge (caveat chain)

- [Bridge not in subagents](mcp-bridge-tools-not-exposed-to-subagents.md) — `mcp__tauri__*` reaches the orchestrator only.
- [el.click() fallback](mcp-bridge-interact-click-needs-el-click-fallback.md) — If `webview_interact{click}` fails; switch tiles via a pointerdown+pointerup pair on the tile.
- [Native geometry](mcp-bridge-manage-window-reads-native-geometry.md) — `manage_window{info}` returns native frames.
- [Hold a status via fiber](mcp-bridge-seed-held-workspace-status-via-fiber.md) — Dispatch `setStatusMap`, not `ipc_emit_event`.
- [HMR stamped URL](vite-hmr-stamped-url-is-a-separate-module-instance.md) — A bridge import must use `<path>?t=<ts>`.

## CC hooks, PTY & terminal

- [Production-shaped claude -p](production-shaped-claude-p-for-adjudicator-scoring.md) — cwd `/`, CLAUDE* env stripped, `--no-session-persistence`.
- [Capture beats docs](cc-hook-capture-beats-docs.md) — For hook-channel work, capture live.
- [Hook event facts](cc-hook-event-facts.md) — Live-captured CC v2.1.x hook facts for the status channel.
- [Raw mode: \r](raw-mode-cr-is-enter.md) — PTY input lines end in `\r`, for every subprocess.
- [Inject ends in \r](cc-tui-cr-not-lf.md) — `\n` only triggers autocomplete.
- [SGR per word](cc-tui-wraps-each-word-in-sgr.md) — A multi-word raw-stream sentinel never matches.
- [Buffer until cc_ready](pty-output-buffer-until-frontend-ready.md) — New PTY kinds buffer output until the frontend listens.
- [Observable PTY probe](pty-probe-observable-default.md) — Mirror reader output to an observable surface by default.
- [xterm + PTY gotchas](tauri-xterm-pty-gotchas.md) — Explicit TERM, `term.focus()`, rAF-deferred `fit()`.
- [Button keeps xterm focus](wkwebview-button-click-does-not-take-focus.md) — Overlays must take focus or keys reach CC.
- [HISTFILE overridden](zsh-histfile-overridden-by-etc-zshrc.md) — Isolate via HOME; SIGHUP saves history, SIGTERM doesn't.
- [Time capture is global](time-tracking-capture-is-machine-global.md) — Logs ALL CC sessions on the machine.

## Architecture, seams & precedents

- [Derived state ≠ event](derived-state-is-not-a-proxy-for-its-event.md) — Match every state X maps to; sweep consumers when the enum grows.
- [Key on the property](classifier-must-key-on-the-classified-property.md) — A correlate fails as a silent under-report.
- [Status map collapses](workspace-status-map-collapses-consecutive-events.md) — Per-event consumers read the RAW stream.
- [No CSS token layer](no-css-custom-property-layer.md) — `var(--x)` resolves to nothing; copy hex from `.panel-tab`.
- [Philosophy](claudesk-philosophy.md) — Opinionated, Claude-specific, parallel; attention is the scarce resource.
- [No CSP](app-ships-with-no-csp.md) — `"csp": null`, full `__TAURI_INTERNALS__`; a sanitizer is the only defense.
- [Docs viewer intent](m7-docs-viewer-intent.md) — An attention/re-orientation feature, not a doc reader.
- [Day view frame](day-view-flexible-timeline-model.md) — One coordinate source every consumer reads, never recomputes.
- [Session-end cap](reclassifier-primitives-need-session-end-cap.md) — Clip at `resolve_session_end` first; the cap lives in the caller.
- [Dismiss precedent](session-only-vs-permanent-dismiss-precedent.md) — Copy `useUpdater.ts`'s "later vs never".
- [Synthetic tab seam](synthetic-tab-seam-reusable-readonly-buffer.md) — Read-only content as an editor tab; supply font size + decorations.
- [Command removal sweep](tauri-command-removal-needs-invoke-sweep.md) — Sweep frontend `invoke()` calls, then smoke-launch.
- [PiP AppKit gotchas](tauri-nspanel-pip-gotchas.md) — Four, each found via a live crash.
- [⌘⇧digit reserved](cmd-shift-digit-reserved-for-filmstrip.md) — For workspace/filmstrip switching.
- [No CM6 Compartment by analogy](cm6-dont-copy-compartment-by-analogy.md) — Check the case needs live reconfigure first.

## Toolchain & environment traps

- [strip-types imports](node-strip-types-fails-on-extensionless-runtime-imports.md) — Breaks on extensionless imports; use a throwaway vitest spec.
- [open('w') truncates](open-w-truncates-before-read-wipes-untracked-file.md) — Copy an untracked file aside before scripted edits.
- [BSD sed no \b](bsd-sed-lacks-word-boundary.md) — A mutation silently no-ops; use `perl -pi -e`, check it landed.
- [Check payload first](check-payload-before-outward-send.md) — `test -s` + `head` before any outward send (an empty public issue).
- [zsh no word-split](zsh-unquoted-var-does-not-word-split.md) — `$rev:src/x` is a modifier; write `"${rev}:path"`.
- [zsh =word expansion](zsh-equals-expansion-eats-tmux-exact-targets.md) — `-t =cd-x` fails; quote it or send the script on stdin.
- [cargo PATH](bash-cargo-env.md) — Bash subshells lack `~/.cargo/env`; prefix PATH.
- [Bound cross-thread test waits](bound-cross-thread-waits-in-tests.md) — `recv_timeout`, or a mutant hangs `cargo test` and leaves itself on disk.
- [alarm orphans test binary](perl-alarm-watchdog-orphans-cargo-test-binary.md) — `pgrep -fl claudesk_lib-`, kill yours.
- [HMR stale after rename](hmr-stale-across-file-rename.md) — Can fake a regression; relaunch first.
- [StrictMode latch deadlock](strictmode-remount-deadlocks-an-unreleased-fetch-latch.md) — Release a fetch-once latch in cleanup.
- [Regex ends block comment](block-comment-terminated-by-regex-star-slash.md) — Prefer `//` headers.
- [Case-collision names](macos-case-collision-module-naming.md) — `foo.ts` vs `Foo.tsx` collide on macOS.
- [brew cask desync](brew-cask-manual-delete-desync.md) — Why brew won't reinstall after a manual delete, and the fix.
- [Scaffold recipe](tauri-scaffold-recipe.md) — Non-interactive scaffold + merge that keeps strategic docs.
- [--help before matrix](feedback_read_help_before_cli_matrix.md) — Collapses rows, surfaces native flags.
- [Never brew upgrade to verify](never-propose-brew-upgrade-to-verify-a-release.md) — ⚠️ It kills every running Claudesk.
- [Release = three artifacts](release-is-three-artifacts-verify-each.md) — .app / .dmg / .app.tar.gz; the self-update payload above all; minisign `.sig` checkable via OpenSSL 3.
- [Stage around operator edits](stage-around-operator-edits-via-blob.md) — Computed blob via `git update-index --cacheinfo`.

## Dev-time side effects (macOS focus)

- [Activate gathers windows](feedback_osascript_activate_side_effects.md) — osascript / `open -a` / `subl` pull windows to this Desktop: a WRITE.
- [No Sublime activate](feedback_no_sublime_activate.md) — Dev-time only: Spaces yanks live Sublime windows.

## Workflow-system discipline

- [SURFACED in Discoveries](feedback_surfaced_in_discoveries_not_worktree.md) — Tree leaves are work; SURFACED notices belong in Discoveries.

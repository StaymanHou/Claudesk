---
drive_mode: autopilot
---

# Feature: M18 WP2.5 — Remote panes copy to the Mac's clipboard

**Workflow:** feature
**State:** ship (complete)
**Created:** 2026-11-18
**WBS:** `workflow-system/product/wbs.md` → WP2.5 (tasks 2.5.1–2.5.6)

## Problem Statement

In a remote pane, a drag-select never reaches this Mac's clipboard. The deployed `tmux.conf` (`remote_link::TMUX_CONF`,
config C, ratified at M17 WP1 for wheel scrollback) sets `mouse on`. So tmux turns the drag into a copy-mode selection,
and on mouse-up the default `MouseDragEnd1Pane` → `copy-pipe-and-cancel` puts the text in tmux's buffer **on the mini**
and clears the highlight. xterm.js never sees the drag. Verified 2026-11-18 on tank's pane: `alternate_on=0
mouse_any_flag=0 mouse=1` (CC is inline and is not the cause). Local panes are unaffected (no tmux). The fix has to
keep `mouse on` (with `mouse off` the wheel types arrow keys into CC; M17 WP1 ruled that out). The planned route:
tmux emits OSC 52 to its client (`set-clipboard on` + a `clipboard` terminal feature), and Claudesk's xterm.js handles
OSC 52 by **writing** the Mac clipboard and never answering a read.

Problem statement unchanged (2026-11-18, F9b from Phase 2 verify-self): the route stands. A live drag reached the Mac clipboard and Option+drag worked. The two failures are in how the fix was carried out: the live re-source ran outside a login shell, and a locale test could not see its own deletion.

**Not a 3rd-party dependency:** tmux, xterm.js and macOS are all already in the stack. The unknowns are on-host
behaviour, which Phase 1 probes.

**Facts found at plan time (not in the WBS):**
- **tmux reads `-f <conf>` only when its server starts.** The pre-connect script rewrites `tmux.conf` on every connect,
  but a server that is already running (one `-L claudesk[-dev]` server per identifier, shared by every session on the
  host) keeps the options it started with. A conf change would not reach tank's live session until every Claudesk
  session on the mini ended. → probe Q4, build task P2.2.
- **`copy-pipe-no-clear` leaves the pane IN copy-mode.** By the ratified §I rule, keys typed in copy-mode are
  swallowed (no `Any` binding). If the operator drags at the bottom of the pane and then types a reply, the first keys
  may vanish. The WBS chose no-clear "so the highlight stays", which trades against this. → probe Q3, with a decision
  rule written in advance (below).
- **No clipboard path exists in the app today.** Local copy is the native Edit → Copy menu through the responder chain
  on xterm's own selection. `navigator.clipboard.writeText` without a user gesture may be refused by WKWebView. →
  probe Q2 decides between that and a small Rust write command.

## Decision rules, written in advance (applied by Phase 1, no operator pause needed)

- **R-a (write path):** if `navigator.clipboard.writeText` called from inside an xterm OSC handler (no user gesture,
  dev build AND a debug bundle at `tauri://localhost`) puts the text on the pasteboard (`pbpaste` matches), use it.
  Otherwise add a Rust `clipboard_write(text)` command that pipes to `/usr/bin/pbcopy` on a worker. It must never block
  the main thread: async + `spawn_blocking`, listed in `sync_commands_do_not_block.rs`'s `ASYNC_COMMANDS` with a reason.
  No new crate either way.
- **R-b (drag-end binding):** use `copy-pipe-no-clear` (highlight stays) ONLY IF, after a drag-copy with the pane at the
  bottom, the next printable key typed reaches CC's input box. Otherwise keep tmux's default `copy-pipe-and-cancel`
  (the copy still reaches the Mac via OSC 52; only the highlight is lost). Losing the operator's typing is worse
  than losing a highlight.
- **R-c (conf reaching a live server):** if Q4 shows a running server keeps old options, the pre-connect script also
  runs `tmux -L <srv> source-file <conf>` when that server is up (a no-op when it isn't). Every option in the conf must
  be safe to re-apply (set/bind are idempotent; `set -as terminal-features` APPENDS, so the probe checks that a re-source
  does not stack duplicates in a way that changes behaviour).
- **R-d (which panes get the handler):** register the OSC 52 write handler on **every** `XtermPane` (CC pane and the
  second terminal, local and remote). A local program could already write the clipboard with `pbcopy`, so this adds
  no new power locally, and one code path beats an origin-plumbed one. A READ (`?`) is never answered on any pane.

## Work Tree

- [x] Phase 1: Probe — OSC 52 out of tmux, the write path, the drag-end binding, a live server
  **Observable outcomes:**
  - CLI (state-changing, scratch remote only: a throwaway tmux server `-L claudesk-probe` on the mini under the dev account, killed after): with a conf of `TMUX_CONF` + `set -g set-clipboard on` + `set -as terminal-features ',xterm*:clipboard'`, a copy in the pane (`send-keys -X` select + copy, or a real drag in the dev pane) makes the client's byte stream contain `ESC ] 52 ; <sel> ; <base64> (BEL|ESC \)`, and the base64 decodes to the selected text. Raw bytes captured (Claudesk PTY tap, or `script`/`xxd` on an ssh client with `TERM=xterm-256color`) and pasted into Probe evidence. Q1.
  - CLI: the same with the clipboard feature REMOVED (only `set-clipboard on`) is captured too, so the evidence shows which line is load-bearing. Q1.
  - Browser (dev app via the tauri bridge): an OSC 52 handler registered on a live pane, fed `ESC]52;c;<b64 of a unique token>BEL` through `term.write`, calls `navigator.clipboard.writeText`; `pbpaste` on this Mac then equals the token, or the promise rejects (error name recorded). Repeated in a debug bundle (`tauri build --debug --bundles app` + `open`) at `tauri://localhost`. Q2, decides R-a.
  - CLI (scratch remote pane): after a drag-copy with `MouseDragEnd1Pane` bound to `copy-pipe-no-clear`, `#{pane_in_mode}` is read, then one printable key is sent the way the operator's typing arrives (`cc_input` bytes into the pane); `capture-pane` shows whether it reached the shell/CC prompt. Q3, decides R-b.
  - CLI: on a `-L claudesk-probe` server started with conf A, rewrite the conf to B (adds `set-clipboard on`) and open a second session the way `remote_cmd` does (`-f <conf> new …`); `show -g set-clipboard` reads A's value (old) or B's. Then `source-file` the conf and read it again, and run `show -g terminal-features` after two sources. Q4, decides R-c.
  **Alignment questions:**
  - none (the four decision rules above are pre-registered; the probe applies them)
  - [x] P1.1 Scratch setup: a throwaway `-L claudesk-probe` tmux server on the mini (dev account, `<user>@<mini-host>`), never the live `claudesk`/`claudesk-dev` servers. Record tmux version + CC 2.1.327.
  - [x] P1.2 Q1: does tmux emit OSC 52 to the client on a copy, and which conf lines are needed? Raw bytes.
  - [x] P1.3 Q2: does `navigator.clipboard.writeText` work from an OSC handler without a gesture (dev + debug bundle)? Apply R-a.
  - [x] P1.4 Q3: after `copy-pipe-no-clear`, does the next typed key reach the app? Apply R-b.
  - [x] P1.5 Q4: does a conf change reach a running server, and is `source-file` re-runnable? Apply R-c.
  - [x] P1.6 Write "Probe evidence" + the R-a…R-d verdicts below; kill the probe server; confirm `tmux -L claudesk-probe ls` fails.
  - [x] verify-auto — probe phase, no code changed.
    — evidence: `git diff -- src src-tauri | wc -l` → 0 (no source touched); `git status --short` → only the new WIP file.
    — evidence: the identifier grep over the WIP (the full mini host, its short name, `ts.net`, the admin account, `stayman@`, the remote scratch path) → 0 matches.
    — evidence: probe cleanup confirmed. On the mini, `tmux -L claudesk-probe ls` → "no server running", and `~/claudesk-probe-wp25` is gone. Locally, the dev app and Vite were stopped (`pgrep target/debug/claudesk` and `lsof :1420` both empty), and there were 0 dev `ssh -M` masters.
  - [x] verify-self — a fresh runner re-ran Q1/Q1b/Q3/Q4 on its own scratch server (`-L claudesk-wp25-verify`, killed, dir removed) and decoded the recorded bytes itself.
    - [x] Q1 PASS — evidence: a fresh server with conf a, b, and a + clipboard feature each emitted `ESC]52;;VkVSSUZZLVRFWFQtNw==BEL` → `VERIFY-TEXT-7`. A `set-clipboard off` control emitted none, so the recorder can see an absence. `-f /dev/null` defaults include `xterm*:clipboard`.
    - [x] Q1b PASS — evidence: an in-pane app's `52;c;<b64>` reaches the client under b only (`→ INNER-VERIFY-9`); a `52;c;?` never reached the client under either conf.
    - [x] Q2 UNVERIFIED (runner: no harness — the bridge isn't exposed to subagents). The orchestrator's own reading stands: `NotAllowedError` with `userActivation.isActive=false`, resolved when active. The runner independently confirmed the pbcopy encoding claim: `env -i` → MacRoman mojibake, `LANG=en_US.UTF-8` → `cmp` IDENTICAL; clipboard restored byte-exact. Debug-bundle repeat skipped (reason in Probe evidence).
    - [x] Q3 PASS — evidence: real bytes `zq` typed into the client pty. no-clear → `pane_in_mode=1`, nothing reached `cat`; and-cancel → `pane_in_mode=0`, `zq` echoed; both emitted OSC 52.
    - [x] Q4 PASS — evidence: `-f b.conf new` on a running a-server → `external`; `source-file` → `on`; `-as` RGB entries stack [3],[4],[5]; the fixed-index c twice-sourced → one `[100] xterm*:RGB`, and the client reports `RGB` (a no-RGB control does not).
  - [x] verify-human — operator 2026-11-18: "A and A".
    - [x] P1.verify-human.1 (decision) R-b reverses the WBS's "highlight stays": keep tmux's default `copy-pipe-and-cancel` (the highlight clears on mouse-up, typing keeps working) vs `copy-pipe-no-clear` (the highlight stays, the next keys are swallowed until `q`/Esc). Recommended: the default. → **A (default `copy-pipe-and-cancel`)**.
    - [x] P1.verify-human.2 (decision) `set-clipboard on` lets remote CC's `/copy` (and any in-pane OSC 52) reach the Mac, and as a side effect tmux answers an in-pane clipboard READ from its own host-side buffer (never from the Mac's). Keep `on`, or stay on `external` (drag-copy only, no `/copy` passthrough)? Recommended: `on`. → **A (`on`)**.
  - [x] verify-codify — no new tests: a probe phase changes no code. Its facts are codified in Phase 2 as `TMUX_CONF` / pre-connect / OSC 52 tests (P2.1–P2.4).
    Test scope: full — suite not long (`runtimes.md` → `pnpm verify:auto` Last 61s)
    — evidence: `pnpm verify:auto` → EXIT=0 in 53 s. vitest `Tests 4079 passed (4079)`; cargo 1430 passed, 0 failed. Lint: 1 warning, already present (`XtermPane.tsx` exhaustive-deps spread; no source touched this phase).

**Relevance check (before Phase 2):**
- Requester still needs this: yes — tank is in daily remote use.
- Requirements unchanged: yes — copy a remote selection to this Mac's clipboard, keep `mouse on`.
- Solution still feasible: yes — the probe showed tmux already emits OSC 52; only the handler, the write path and one conf line are new.
- No superior alternative discovered: yes — `navigator.clipboard` ruled out (Q2); a rebind ruled out (Q3).
**Verdict:** proceed

- [x] Phase 2: Build — conf, OSC 52 write handler, Option-drag, live check, docs
  **Observable outcomes:**
  - CLI: `pnpm verify:auto` exits 0.
  - CLI: `cargo test` asserts `TMUX_CONF` contains `set -g set-clipboard on` and the fixed-index `set -s terminal-features[100] 'xterm*:RGB'`, and NO `-as terminal-features` append and NO `MouseDragEnd` rebinding (R-b). The pre-connect script sources the conf into a running `-L <srv>` server and exits 0 when no server runs (both arms tested against a real local tmux if present, else as a script-text test plus the live P2.6 check).
  - CLI (vitest, the real handler, not a copy): an OSC 52 write with an EMPTY Pc (`;<b64>`, tmux's own form, measured) and with `c;<b64 of "héllo ✓\nline2">` each produce exactly one clipboard write of that UTF-8 text (multi-byte and newline survive); `c;?` (read query) produces NO write and **nothing is written back to the PTY**; an empty / malformed base64 payload produces no write and no throw; the handler returns `true` (consumed) in every case. Each assertion mutation-proved alone: delete the `?` guard → the read test goes red; replace TextDecoder with plain `atob` → the UTF-8 test goes red.
  - CLI (vitest): every `XtermPane` mount registers the handler (a positive control: an unregistered pane writes nothing), and the Terminal is constructed with `macOptionClickForcesSelection: true`.
  - CLI (state-changing, scratch remote row only: a temporary remote row for `~/claudesk-scratch-remote` in the dev `projects.json`, row set restored after): in the dev app, a drag across known text in the remote pane (driven by real mouse events via the bridge, or by tmux `send-keys -X` select + the bound drag-end command if the bridge's synthetic mouse cannot reach xterm's mouse reporting, which is recorded) → `pbpaste` on this Mac equals that text; the highlight state matches R-b; `wheel` up still enters copy-mode with history reachable (`#{scroll_position}` > 0); an injected inert Prompt send while scrolled up still lands (cancel-before-inject unchanged).
  - CLI (Rust test): `clipboard_write` sets `LANG=en_US.UTF-8` on the child and feeds the text on stdin (a fake writer captures the env and bytes); the command is `async` and listed in `sync_commands_do_not_block.rs`'s `ASYNC_COMMANDS`. Live: `héllo ✓ — 中文` round-trips through it to `pbpaste` byte-exact.
  - CLI (same scratch row): Option-drag on the remote pane gives an xterm selection (`term.getSelection()` non-empty) and tmux does NOT enter copy-mode (`#{pane_in_mode}` = 0).
  - CLI (same scratch row, OSC 52 from inside remote CC's own world): `printf '\e]52;c;%s\a' "$(printf token-x | base64)"` run in the remote pane → `pbpaste` = `token-x`; `printf '\e]52;c;?\a'` → the pane receives no reply (no base64 echoed into the shell).
  - Browser: local CC pane unchanged — a local drag still selects natively and Edit → Copy still copies (`pbpaste` matches).
  **Alignment questions:**
  - Drag-select in a remote pane (tank, or the scratch row) and paste on the Mac: is this the copy you meant? With R-b's outcome in front of you (highlight kept or cleared), still what you want?
  - (decision) The OSC 52 write handler is on every pane, local panes too (R-d). Any program in any pane can now put text on the Mac clipboard by printing OSC 52; reading it is never allowed. OK, or remote panes only?
  - [x] P2.1 `TMUX_CONF`: add `set -g set-clipboard on` (Q1b: remote CC's `/copy` passthrough); rewrite the RGB line to the fixed-index `set -s terminal-features[100] 'xterm*:RGB'` (Q4: re-sourceable). No clipboard-feature line (tmux default), no rebind (R-b). Update `remote_link` tests that pin the conf, and arch §C.1's ratified-conf line.
  - [x] P2.2 (R-c fired) pre-connect script: after writing the conf, `tmux -L <srv> source-file <conf>` when that server is up; a no-op (exit 0, `set -e` safe) when none runs. Find where `<srv>` (`claudesk` / `claudesk-dev`) is derived in `remote_cmd` and reuse it, never a second spelling.
  - [x] P2.3 OSC 52 handler as a pure, exported module (e.g. `src/components/workspace/osc52.ts`): parse `Pc;Pd`, ignore `?`, base64 → UTF-8 via `TextDecoder`, cap the decoded size (tmux's own limit is the bound; pick ≥ 1 MiB and test the cap), call `clipboard_write` (R-a: Rust). Treat any Pc (tmux sends an EMPTY one, `52;;`; apps send `c`) as the clipboard; a READ (`?`) never. Register it in `XtermPane` for every pane (R-d). Never `term.write`/`cc_input` a reply.
  - [x] P2.4 (R-a chose Rust) `clipboard_write` async command → `spawn_blocking` → `pbcopy` via stdin with `LANG=en_US.UTF-8` set on the child (measured: without it pbcopy reads MacRoman); `ASYNC_COMMANDS` entry; capability entry if the invoke path needs one; a Rust test with a fake writer.
  - [x] P2.5 `macOptionClickForcesSelection: true` on the Terminal (WBS 2.5.4).
  - [x] P2.6 Live check on the scratch remote row (WBS 2.5.5). Executed AS the Phase 2 verify-self live outcomes (P2.vs.7–P2.vs.10; orchestrator-run, because the tauri bridge is not exposed to subagents). Close remote workspaces through the UI and stop the dev app before any Rust edit ([[remote-verify-hygiene]]); sweep `ssh -M` + `tmux -L claudesk-dev ls` after.  <!-- status: NOT-STARTED -->
  - [x] P2.7 `arch/remote-workspaces.md` §C.1 (the ratified conf line) + §I (scrollback / copy-mode) to as-built: the clipboard route, R-b, R-c, and the write-only rule. Note in `arch/security-posture.md` that OSC 52 is write-only.
  - [x] verify-auto — `pnpm verify:auto` (the project's per-phase gate).
    — evidence: 1st run EXIT=1. `prettier --check` flagged `osc52.test.ts` (format only); fixed with `prettier --write`.
    — evidence: 2nd run EXIT=1. `cargo fmt --check` flagged `clipboard.rs:80` and `remote_link/tests.rs:319` (format only); fixed with `cargo fmt`.
    — evidence: 3rd run EXIT=0 in 60 s. vitest `Tests 4088 passed (4088)` (+9 vs 4079: `osc52.test.ts` 7, `osc52Live.test.tsx` 2). cargo 1435 passed, 0 failed (+5: `clipboard` 3, `remote_link` 2). clippy `-D warnings` clean. tsc and `check:link` clean. Lint: the 1 warning was already there (`XtermPane.tsx` exhaustive-deps; its line moved 978→988 with the insert).
    — evidence (after the F9b back-loop): `pnpm verify:auto` → EXIT=0 in 58 s. vitest 4088 passed. cargo **1436** passed, 0 failed (+1: `the_pbcopy_command_sets_the_utf8_locale_itself`; the pre-connect test was rewritten in place). Lint: the same 1 pre-existing warning.
    — evidence (build-time mutation proofs, each restored by `cp` + `shasum`): 1) dropping the `has-session` guard and 2) hard-coding `claudesk-dev` each turn `the_pre_connect_sources_…` red. 3) TextDecoder→binary, 4) no `registerOsc52` in the pane, 5) no `macOptionClickForcesSelection`, 6) the handler returns `false`, 7) caps removed each turn an osc52 test red. 8) Dropping the `ASYNC_COMMANDS` entry turns `no_sync_tauri_command_reaches_a_blocking_call` red. The `?` guard is an equivalent mutant (`atob("?")` throws too); it is commented as such in `osc52.ts`.
  - [x] verify-self — re-entry after F9b: a fresh runner re-verified both fixes.
    - [x] P2.vs.1-rv PASS — evidence: the rewritten test goes red on the original bug's shape (`sh -c` instead of `login_shell`; the tmux log was empty), green after restore (shasum match). On the REAL host (scratch `-L claudesk-wp25-rv`, killed after), a plain ssh exec had PATH `/usr/bin:/bin:/usr/sbin:/sbin` and `command -v tmux` → empty, rc=1. The same exec's `zsh -lc '… set -g set-clipboard on' claudesk x` → rc 0, and `show -gv set-clipboard` = `on`.
    - [x] P2.vs.2-rv PASS — evidence: with `LANG=en_US.UTF-8` exported in the shell, deleting the `.env` line → `the_pbcopy_command_sets_…` FAILED (`LANG not set explicitly: []`), while the old fake test stayed green on the same mutant (the gap it closes). Restored (shasum match).
    - [x] module suites — evidence: `cargo test --lib -- remote_link:: clipboard::` → 69 passed, 0 failed.
    - [x] P2.vs.1 R-c live source of the conf into a running server — FIXED (F9b) + re-verified live
      — evidence: a `claudesk-dev` server was seeded on the mini with the OLD conf (`set-clipboard external`, a `-as` RGB entry [3]). Opening the scratch remote row deployed the NEW `tmux.conf` file (cat matches `TMUX_CONF`), but `show -gv set-clipboard` stayed **`external`**: the source never ran.
      — cause: the pre-connect script runs as a plain `ssh <host> <script>` exec (`SshExec`), and the mini's NON-login PATH has no tmux (the probe hit this too). So `command -v tmux` is false and the guard skips silently. Every other remote tmux call goes through `remote_cmd::login_shell` (`zsh -lc`). The stub tests put a `tmux` on PATH, so they could not see it (a stub hides the boundary: [[verify-self-stub-cannot-cross-subprocess-boundary]]).
      — fix: `conf_reload()` = `login_shell("tmux -L <srv> has-session … || exit 0; exec tmux -L <srv> source-file \"$1\"")`, called with the conf path as `$1`, all output to /dev/null. The test now puts the stub tmux ONLY on the login PATH (`$HOME/.zprofile`, which also prints noise), with outer PATH `/usr/bin:/bin`. Mutants: running the reload under a plain `sh -c` (the original bug's shape) → red; dropping the stdout redirect → red on the noise assertion.
      — re-verify (live): the seed `claudesk-dev` server had `set-clipboard external`. After relaunch + opening the scratch row it read **`on`**, with `terminal-features[100] xterm*:RGB` present.
    - [x] P2.vs.2 (runner) `clipboard_write` locale test cannot catch a regression — FIXED (F9b)
      — evidence: `run_captured` does not clear the child env, and this shell (where `verify:auto` runs) exports `LANG=LC_ALL=en_US.UTF-8`. So deleting `.env("LANG"…).env("LC_ALL"…)` in `write_with` would leave `writes_the_exact_utf8_bytes_with_a_utf8_locale` green. The code itself is right (passes under `env -u LANG -u LC_ALL -u LC_CTYPE`).
      — fix: `pbcopy_command()` builds the `Command`; `the_pbcopy_command_sets_the_utf8_locale_itself` asserts `get_envs()` holds `LANG`/`LC_ALL=en_US.UTF-8`. Mutant: deleting the `.env(…)` line → red, run from this shell where LANG IS exported.
    - [x] P2.vs.3 (runner) `TMUX_CONF` content test PASS — evidence: each line checked exactly; ` -as `/`MouseDragEnd`/`no-clear` absent.
    - [x] P2.vs.4 (runner) OSC 52 handler vitest PASS — evidence: the real `osc52.ts` and the real `XtermPane` registration; `;UFJPQkUtVEVYVC0xMjM=` → `clipboard_write` `["PROBE-TEXT-123"]`; `c;?` → no write, no terminal write, no `cc_input`/`term_input`.
    - [x] P2.vs.5 (runner) every pane registers + Option option PASS — evidence: remote `cc_spawn`, local `cc_spawn` and local `term_spawn` each `osc.has(52)` and `macOptionClickForcesSelection === true`.
    - [x] P2.vs.6 (runner) real `pbcopy` round-trip under the exact env PASS — evidence: `héllo ✓ — 中文` byte-exact (`cmp` equal); the `env -i` control → MacRoman mojibake; clipboard restored (`cmp` equal).
    - [x] P2.vs.7 LIVE (orchestrator, dev app + scratch remote row, CC 2.1.327 up in the pane): a **plain drag** across row 1 via real-shaped mouse events (`mousedown`/`mousemove`, `detail: 1`) reached tmux: `pane_in_mode=1 selection_present=1`. On `mouseup`, tmux `show-buffer` = `Claude Code v2.1.32`, **`pbpaste` on this Mac = `Claude Code v2.1.32`** (identical), and `pane_in_mode=0` (the default and-cancel, R-b).
    - [x] P2.vs.8 LIVE: **Option+drag** (`altKey`, `detail: 1`) → the live Terminal (via its React fiber) `hasSelection()=true`, `getSelection()="Claude Code v2.1.327"`, `options.macOptionClickForcesSelection=true`; tmux `pane_in_mode=0` (the drag never reached tmux).
      ⚠️ Instrument note: a synthetic `MouseEvent` defaults `detail` to 0, and xterm's selection handler switches on `detail`, so without `detail: 1` an Option-drag silently selects nothing.
    - [x] P2.vs.9 LIVE (after the fix, same scratch row): an in-pane app's OSC 52 (`printf '\e]52;c;<b64>\a' > <pane_tty>`) → **`pbpaste` = `WP25 in-pane ✓ copy`** (multi-byte intact); this is remote CC's `/copy` path.
      — wheel: 150 lines written to the pane tty (`history_size=89`), then 5 `wheel` events (deltaY −120) on the xterm → `pane_in_mode=1 scroll_position=20`.
      — scrolled-up inject: with `pane_in_mode=1 scroll_position=20`, clicking `workspace-clear-btn` → `pane_in_mode=0`, the pane shows `❯ /clear`, and the remote transcript holds `<command-name>/clear</command-name>`.
      — the `?` read was NOT injected live: under `set-clipboard on`, tmux answers it into the pane's INPUT, which would type base64 into CC's prompt. The probe (Q1b, twice) showed it never reaches the client, and `osc52Live.test.tsx` pins that Claudesk never replies.
    - [x] P2.vs.10 LIVE local pane unchanged (`scratch-c`, local CC, `mouseTrackingMode=none`): a plain drag → `getSelection()="Claude Code v2.1.327"`. Control: `pbcopy` a token, select `Opus 5.5 w` → the clipboard still holds the token (selection alone copies nothing); then the copy command on the focused xterm (the copy event Edit → Copy fires) → **`pbpaste` = `Opus 5.5 w`**. (WebKit's `execCommand` returned `false` even though it copied.) The native menu click itself is not drivable from the bridge; it fires the same copy event.
    - Hygiene (final): both workspaces closed through the UI. `wp25-seed` killed and `~/claudesk-wp25-seed` removed, so `claudesk-dev` has "no server running". The scratch folder is back to README + `workflow-system/`. Tank's prod session is untouched. The dev app is stopped with 0 dev `ssh -M`. The dev `projects.json` row set equals the pre-check copy (8 = 8). The clipboard is back to empty text (it held 0 bytes before; non-text content, if any, was not recoverable).
    - Hygiene: the scratch workspace was closed through the UI (its session ended; only the `wp25-seed` session remains on `claudesk-dev`); 0 dev `ssh -M`; tank's prod session untouched; the dev app was stopped before any Rust edit.
  - [x] verify-human — operator 2026-11-18: "vh1 good / vh2 A".
    - [x] P2.verify-human.1 (happy path) In the dev app ("Claudesk (dev)"), open `claudesk-scratch-remote`, drag-select text in the CC pane, paste on the Mac. Also try Option+drag + ⌘C. Is this the copy you meant? (Captured: P2.vs.7 drag → `pbpaste` = `Claude Code v2.1.32`; P2.vs.8 Option+drag selection; P2.vs.9 in-pane OSC 52.) → **good**.
    - [x] P2.verify-human.2 (decision, R-d) The OSC 52 write handler is on every pane, local panes too. OK, or remote panes only? → **A: every pane**.
  - [x] verify-codify — no new tests needed. Each behavior verified live already has a test that fails when it breaks (each proven by a mutant): the conf (`the_tmux_conf_…`), the login-shell re-source (`the_pre_connect_sources_…`, which reproduces the mini's login-only PATH), the OSC 52 decode / read-ignore / cap (`osc52.test.ts`), the consuming surface (the real `XtermPane` → `clipboard_write` with tmux's empty-Pc form, `osc52Live.test.tsx`), the pbcopy locale / stdin / cap (`clipboard.rs` tests), `ASYNC_COMMANDS`, and the command registration (`invokedCommandsAreRegistered`: dropping `clipboard::clipboard_write` from `generate_handler!` → red, restored).
    Test scope: full — last phase
    — evidence: `pnpm verify:auto` → EXIT=0 in 54 s; vitest 4088 passed; cargo 1436 passed, 0 failed; lint has the same 1 pre-existing warning.

## Current Node
- **Path:** Feature > review-quality
- **Active scope:** review-quality (ship commit is the baseline)
- **Blocked:** none
- **Unvisited:** none beyond Phase 2
- **Open discoveries:** none

## Probe evidence

**Setup (P1.1, 2026-11-18):** mini, dev account (`<user>@<mini-host>`), tmux **3.8**, CC **2.1.327**. A throwaway
`-L claudesk-probe` server (never `claudesk`/`claudesk-dev`), confs in `~/claudesk-probe-wp25/` (removed after; `tmux -L
claudesk-probe ls` → "no server running"). The client side was a local Python `pty.fork` running `ssh -tt` with
`TERM=xterm-256color` (what Claudesk's PTY passes), and every client byte was recorded to a file. Conf **a** = today's `TMUX_CONF`
verbatim. Conf **b** = a + `set -g set-clipboard on`.
- ⚠️ **Instrument trap found on the way:** entering copy-mode and copying in ONE tmux command batch produced NO OSC 52
  (the buffer held the text, the client had the `clipboard` feature, and `set-clipboard` was `on`). tmux skips a client
  that has a redraw pending. Splitting it into "enter copy-mode + select" → 0.5 s → "copy" (the shape of a real drag, whose
  mouse-up arrives as a later event) emitted it. The 0-OSC captures from the batched driver are invalid, not negatives.

**tmux 3.8's built-in defaults** (`-f /dev/null`): `terminal-features[0] xterm*:clipboard:ccolour:cstyle:focus:title`,
`set-clipboard external`. The attached client reports `client_termfeatures` =
`bpaste,ccolour,clipboard,cstyle,focus,RGB,title`.

- **Q1: does tmux emit OSC 52 on a copy?** ✅ **YES, already, with today's conf a**: the client stream held
  `ESC ] 52 ; ; UFJPQkUtVEVYVC0xMjM= BEL` → `PROBE-TEXT-123`. Conf b gave the identical bytes. ⚠️ **Pc is EMPTY** (`52;;`),
  so the handler must treat an empty selection parameter as the clipboard. **The `terminal-features ',xterm*:clipboard'`
  line the WBS planned is NOT needed** (it's in tmux's default). **Root cause of WP2.5, corrected:** tmux has been sending
  the copied text to Claudesk all along, and xterm.js has no OSC 52 handler, so it drops it. The fix is frontend-first.
- **Q1b: an app INSIDE the pane emitting OSC 52** (`printf '\e]52;c;<b64 INNER-APP-COPY>\a'`, then a `52;c;?` read):
  conf a (`external`) → **nothing reached the client**; conf b (`on`) → `ESC ] 52 ; c ; SU5ORVItQVBQLUNPUFk= BEL` →
  `INNER-APP-COPY`. **The read query never reached the client under either conf.** So `set-clipboard on` is what lets
  remote CC's own `/copy` reach the Mac. It is not needed for a drag.
- **Q2: `navigator.clipboard.writeText` in the dev webview** (origin `http://localhost:1420`, secure context): with
  transient activation live (`userActivation.isActive` = true right after a bridge call) it resolved and `pbpaste` showed
  the token. **From a 12 s timer (`isActive` = false): REJECTED, `NotAllowedError … not allowed by the user agent`**.
  An OSC 52 from CC's `/copy`, or one arriving after the activation window, would fail. → **R-a: Rust `clipboard_write` →
  `/usr/bin/pbcopy`.** (The debug-bundle repeat was not run: the dev origin already fails the rule, so the bundle can't
  change the verdict.)
- **`pbcopy` encoding trap (measured for R-a):** `printf 'héllo ✓ — 中文\nline2' | env -i pbcopy` → pasteboard holds
  `h√©llo ‚úì ‚Äî ‰∏≠Êñá` (UTF-8 read as MacRoman). The same with `env -i LANG=en_US.UTF-8` → exact. A Finder-launched app
  has no `LANG` (only the PATH is captured, by `env_path`), so **`clipboard_write` must set `LANG=en_US.UTF-8` on the
  child.** Test it with multi-byte text.
- **Q3: after `copy-pipe-no-clear`, does a typed key reach the app?** Pane running `cat`; copy, then `send-keys h i`:
  no-clear → `pane_in_mode` 1 before and after, and **`hi` never reached `cat` (swallowed)**. `copy-pipe-and-cancel` →
  `pane_in_mode` 0, and `hi` was echoed. **Both emitted the OSC 52.** → **R-b: keep tmux's default drag-end
  (`copy-pipe-and-cancel`), no rebinding.** The highlight clears on mouse-up and the copy still reaches the Mac.
- **Q4: does a conf change reach a running server?** Server started with a; `new -d -s q` with `-f b.conf` →
  `set-clipboard` still **`external`** (`-f` is read only at server start). `source-file b.conf` → `on`. ⚠️ But each
  source of `set -as terminal-features ',xterm*:RGB'` **appended another `xterm*:RGB` entry** (indices 3, 4, 5…), so it grows with every connect.
  The fixed-index form `set -s terminal-features[100] 'xterm*:RGB'` sourced twice stays one entry, and the attached client
  still reports `RGB` in `client_termfeatures`. → **R-c fires:** the conf switches to the fixed-index RGB line, and
  pre-connect sources the conf into a running server.

**Verdicts:**
- **R-a → Rust `clipboard_write`** (pbcopy, `LANG=en_US.UTF-8`, async + `spawn_blocking`, no new crate).
- **R-b → no drag-end rebinding** (no-clear swallows typing).
- **R-c → fires** (fixed-index RGB + `source-file` into a live server).
- **R-d** unchanged (every pane; a READ is never answered).
- **Found by verify-self (not in the first readings): under `set-clipboard on`, tmux ANSWERS an in-pane app's `52;c;?`
  read itself, from ITS OWN buffer** (the reply `^[]52;c;<b64>^G` lands in the pane). Under `external` it does not. The read
  never reaches Claudesk, so **this Mac's clipboard stays unreadable** (R-d holds). What becomes readable is tmux's buffer on
  the host, which already holds text the operator drag-copied in ANY session on that `-L` server. A program running as that account
  could already read it with `tmux -L <srv> show-buffer`, so this grants no new reach. It is recorded as a known property for arch
  §I / security-posture, not a blocker.
- **WBS deltas:** 2.5.2 shrinks to `set -g set-clipboard on` + the RGB-line rewrite + the live source (no clipboard
  feature, no rebind). 2.5.3 must accept an empty Pc and writes through Rust, not `navigator.clipboard`.

⚠️ **Probe side effect:** the probe's token writes replaced this Mac's clipboard. Its prior text was already empty
(`pbpaste` = 0 bytes), so any non-text content was lost and could not be restored.

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->

---
workflow: feature
state: ship (complete)
created: 2026-08-06
drive_mode: autopilot
---

# Feature: M12 WP4b — The drive-mode signal (per-project value + per-turn injection)

**Workflow:** feature
**State:** ship (complete) — 2026-08-07
**Created:** 2026-08-06

## Problem Statement

A Claudesk-opened CC session is re-asked a question the operator already answered: `/session-restore`
shows its drive-mode menu even though the operator picked a mode when opening the workspace. Measured
full-corpus: **82% of 622 entry points got the mode menu**, **99% of replies bundle the mode word with
the work instruction**, and the numbered 1–4 affordance was used **3 times in 417 replies**. WP4b
delivers the **acting** half: store a per-project drive mode, gate an env var onto the CC spawn, and
have the shared `claudesk-hook.pl` emit a `UserPromptSubmit` `additionalContext` line naming that mode —
so the real `/session-restore` skips the menu. **Zero companion-repo change**: the skills are untouched
and a plain-terminal `claude` behaves byte-identically, because inertness comes from the env var simply
not being set.

**The deliverable is a SIGNAL, not a store.** A persisted `drive_mode` already exists on disk in 93% of
manual restores and is already ignored 74% of the time; storing one more copy accomplishes nothing.
Claudesk therefore does **not** write into `workflow-system/` (task 4b.7 — recorded as a decision, not
an oversight).

**Probe basis:** WP4a is complete; its four operator-approved verdicts (c)–(f) in
`workflow-system/product/wbs.md` → "Probe outcomes" are the build instruction. The hook mechanism was
proven live 2026-08-06 (two arms, identical fixture, one env var apart). No 3rd-party probe gap.

**Known unknown, deliberately carried (not a blocker):** that per-turn re-injection holds up under
**long-context** pressure is **ASSUMED, not proven** — both live proofs were on short cold contexts. A
synthetic long-context probe was considered and declined by the operator (filler ≠ real pressure).
Validated by dogfooding, not by this WP.

**Problem statement unchanged** — re-checked at the 2026-08-07 F9b back-loop (§1b). The back-loop was
raised by a **verification gap, not a defect**: the integration boundary (`cc_spawn`) had no Observable
Outcome citing it, so nothing pinned the *caller*. The implementation was read and believed correct at
the time of the back-loop; the deliverable, the mechanism, and all nine constraints are untouched. What
shifted is only the evidence standard for Phase 2 — constraint 9 ("prove the CALLER, not only the
primitive") now has a leaf enforcing it rather than a code comment asserting it.

**Problem statement unchanged (2nd time)** — re-checked at the 2026-08-07 Phase 3 F9b back-loop (§1b).
Same cause as the Phase 2 one: an integration boundary (here **Claude Code itself**, via 10 registered
hook events on both identities) with no Observable Outcome citing it. The implementation emits
correct JSON — proven five ways at verify-auto, incl. a byte-diff against the pre-change script — but
nothing yet proves **CC consumes it**, and WP4a measured those to be separable (a top-level
`additionalContext` emits fine and is REJECTED at runtime). ⚠️ **This is now the SECOND phase in a row
whose outcome set was planned primitive-first while constraint 9 sat in this very file predicting it
(five prior occurrences, now seven). That is a PLANNING-time signal, not a verification-time one** —
Phase 4 must draft its outcomes with the consuming surface named FIRST rather than discover the
omission a third time.

## Constraints (read before Phase 1 — every one of these is mutation-proven or measured)

1. **`DriveMode` serializes 2 of 4 variants WRONG.** `step-by-step` must be **`stepping`**;
   `full-autopilot` must be **`fsd`**. Authority: `transitions.md:165`,
   `session-handoff/SKILL.md:75`, 29 archive WIP files. Building on today's values ships a **silent
   no-op for modes 1 and 4**.
2. **The known-mode allowlist does NOT exist.** `claudesk-hook.pl` is write-only telemetry
   (grep `stepping` → 0 hits). "Present and non-empty" admits any garbage; Phase 3 creates the guard.
3. **Emission goes ABOVE `claudesk-hook.pl:44`** (`exit 0 if $sock_path eq ''`), so the **stdin drain
   moves up and is shared**. Appending below line 44 kills the signal whenever `CLAUDESK_HOOK_SOCK`
   is absent.
4. **Never-block-CC rests on ONE construct: line 58's `eval { decode_json }`.** There is **no** outer
   guard (the other `eval`s are `:120` socket and `:138` write-log, neither wraps the decode). Do not
   "simplify" it away when moving the drain up. `never_blocks_cc_on_degraded_inputs` must stay green.
5. **Do NOT append the env var to `color_tty_env()`** — fixed-size `[(&str,&str); 4]`, three callers
   (`:612` CC, `:634` **shell**, `:1128` test). The obvious widening **leaks `CLAUDESK_DRIVE_MODE` into
   the raw login shell**. Compose a `Vec` at the CC call site.
6. **Gate is enforced SPAWN-SIDE, never in the hook.** Gate OFF → do not set the var. Fail-closed read,
   copying `announce/commands.rs:33`: `read_workflow_features_enabled(&dir).unwrap_or(false)`.
7. **`additionalContext` must nest under `hookSpecificOutput` with `hookEventName`** — top level is
   rejected at runtime.
8. **An unset/empty/unrecognized mode emits NOTHING** — never a line naming a default. There is no
   coherent upstream default to copy (`session-restore` contradicts *itself*: `SKILL.md:42` says
   orchestrated, `:59` labels autopilot "(default)"), so any default would be Claudesk inventing
   workflow policy.
9. **Prove the CALLER, not only the primitive.** This milestone has hit "a proven module behind a
   caller that does not honor it" **five times**. Every phase carries an end-to-end assertion.

## Work Tree

- [x] Phase 1: Fix the `DriveMode` vocabulary + activate the per-project store  <!-- status: [x] — COMPLETE 2026-08-06 -->
  **Observable outcomes:**
  - CLI: `cargo test -p claudesk --lib config_store` exits 0, and
    `drive_mode_serializes_to_these_literal_strings` asserts exactly
    `["stepping","orchestrated","autopilot","fsd"]` (the tripwire's expectations updated, its
    wrong-values note deleted, in this same commit).
  - CLI: a new test asserts the four literal strings **transcribed from `transitions.md:165`** — not
    derived from the enum's own output (a round-trip proves symmetry, not correctness).
  - CLI: `cargo test -p claudesk --lib` exits 0 — `read_default_drive_mode` / `set_default_drive_mode`
    round-trip through `projects.json`, an unknown path is an `Err` on write (matching
    `set_default_model`), and clearing with `None` removes the key from disk rather than writing `null`.
  - CLI: `grep -c "Never read or written\|WP15" src-tauri/src/config_store/mod.rs` returns 0 — both
    stale doc claims killed in the same commit (value, readership, provenance).
  - [x] P1.1 Rename the two serde values via explicit `#[serde(rename = "stepping")]` /
        `#[serde(rename = "fsd")]` (explicit renames over changing `rename_all`, so the mapping is
        readable at the variant and a future variant cannot silently inherit a wrong shape)  <!-- status: [x] -->
  - [x] P1.2 Update the tripwire test's expectations + delete its "known wrong" note; add the
        `transitions.md`-transcribed assertion as a separate test with the authority cited in-test  <!-- status: [x] -->
  - [x] P1.3 Add `read_default_drive_mode` + `set_default_drive_mode` mirroring
        `read_default_model`/`set_default_model` (verbatim path compare; unknown path = write error)  <!-- status: [x] -->
  - [x] P1.4 Rewrite `default_drive_mode`'s doc comment — kill *"Never read or written"* AND
        *"Reserved for Phase 2 (WP15 …)"*; state its real reader (the spawn env var) and that it does
        **not** terminate in argv (unlike `default_model`)  <!-- status: [x] -->
  - [x] P1.5 **(added mid-build)** Per-item `#[allow(dead_code)]` + module ledger for the two new
        accessors, each naming the consumer that retires it — clippy `-D warnings` treats a
        test-only caller as dead  <!-- status: [x] -->
  - [x] verify-auto  <!-- status: [x] — 4 scoped checks PASS 2026-08-06; see Verification log -->
  - [x] verify-self  <!-- status: [x] — 7/7 PASS, 0 blocking, 0 cosmetic (subagent, 2026-08-06) -->
  - [x] verify-human  <!-- status: [x] — AUTO-SKIPPED 2026-08-06, all 4 gates clean (F11) -->
  - [x] verify-codify  <!-- status: [x] — 12 tests, 3 mutants proven, 811 pass (2026-08-06) -->

- [x] Phase 2: Set `CLAUDESK_DRIVE_MODE` on the CC spawn, gated  <!-- status: [x] — COMPLETE 2026-08-07 (all 7 impl tasks + all 4 verify nodes) -->
  **Observable outcomes:**
  - CLI: `cargo test -p claudesk --lib cc_session` exits 0 — a pure `spawn_env(mode, gate_enabled)`
    (or equivalent) returns a `Vec` that **contains** `("CLAUDESK_DRIVE_MODE", "<mode>")` only when
    gate ON **and** mode `Some`; returns the bare color/locale set for (gate OFF, any mode) and for
    (gate ON, mode `None`).
  - CLI: the existing guard `color_tty_env_carries_nothing_beyond_color_and_locale` stays green, and
    `color_tty_env()`'s return type is still `[(&'static str, &'static str); 4]` (grep-asserted) —
    proving the shell spawn at `:634` cannot receive the var.
  - CLI: `cargo test -p claudesk` exits 0 (full suite, incl. integration) — no regression in
    `cc_session` spawn tests.
  - CLI: `grep -n "read_workflow_features_enabled" src-tauri/src/cc_session/mod.rs` shows the
    fail-closed `.unwrap_or(false)` form at the spawn site.
  - **CLI (added 2026-08-07 at verify-self — INTEGRATION-BOUNDARY outcome, cites the consuming
    surface):** the existing **`cc_spawn` Tauri command** (`cc_session/commands.rs:75`), whose body
    is `SessionRegistry::spawn`, is proven to hand the *resolved* env to the PTY rather than the
    bare `color_tty_env()`. A test drives the spawn path itself and asserts the env the process
    would receive — so a mutant reverting `&cc_env` → `&color_tty_env()` at that call site goes
    RED. ⚠️ Asserting `resolve_cc_spawn_env`'s return value does **not** satisfy this: that is the
    primitive, and this outcome exists because the *caller* is what three retired source-text
    guards each failed to pin (constraint 9; five occurrences this milestone).
  - [x] P2.1 Extract a **pure** env-composition fn taking `(mode: Option<DriveMode>, gate: bool)` and
        returning the spawn env — so gate×mode is table-testable without a PTY  <!-- status: [x] — cc_spawn_env -->
  - [x] P2.2 Read the per-project mode in `SessionRegistry::spawn` beside `read_default_model`
        (`cc_session/mod.rs:907-921`), degrading to `None` on any read error (same posture as model:
        a missing override is a mild surprise, a refused workspace is a dead click)  <!-- status: [x] -->
  - [x] P2.3 Read the gate spawn-side, fail-closed, copying `announce/commands.rs:33`  <!-- status: [x] — resolve_gate_enabled -->
  - [x] P2.4 Compose the `Vec` **at the CC call site** (`:612`) only; leave `color_tty_env()` and the
        shell spawn untouched  <!-- status: [x] — color_tty_env() still [_; 4], shell untouched -->
  - [x] P2.5 Table-test all four gate×mode combinations + all four mode values, asserting the exact
        var value is the `transitions.md` string (not the enum's output)  <!-- status: [x] -->
  - [x] P2.6 **(added mid-build)** `resolve_cc_spawn_env` — one importable resolver owning the whole
        wiring, after THREE source-text guards over this call site were each measured vacuous  <!-- status: [x] -->
  - [x] P2.7 **(added 2026-08-07 at verify-self, F9b)** Pin the CALLER: assert that `cc_spawn`'s
        spawn path hands the resolved env to the PTY, so reverting `&cc_env` → `&color_tty_env()`
        goes RED. Mutation-prove it (apply the revert, confirm the test fails, revert the
        mutant) and confirm the mutation landed in **executable** code per
        `[[verify-the-mutation-landed]]`  <!-- status: [x] — the_cc_spawn_wires_the_gate_through_the_fail_closed_resolver; MUTATION-PROVEN (mutant at executable line 576; exactly 1 test RED, all others green) -->
  - [x] verify-auto  <!-- status: [x] — PASS 2026-08-07 (re-run after the F9b back-loop); all 5 Observable Outcomes met, incl. the added integration-boundary one -->
  - [x] verify-self  <!-- status: [x] — PASS 2026-08-07; subagent verified 5/5 outcomes, 0 BLOCKING, 0 COSMETIC -->
  - [x] verify-human  <!-- status: [x] — APPROVED 2026-08-07, all 3 leaves PASS. INTEGRATION BOUNDARY (cc_spawn): F11 skip was forbidden and auto-skip gate (c)+(d) both failed, so this was a real operator pause — correctly so: .1 and .2 proved on the LIVE process what no test reaches (the var arrives / does not arrive), and .3 was operator-only by instrument limitation. -->
    - [x] P2.verify-human.1 Gate ON + mode set → a live `claude` process has `CLAUDESK_DRIVE_MODE` in its real environment  <!-- status: [x] — PASS 2026-08-07 live: dev app pid 54775 → CC pid 55461 carried CLAUDESK_DRIVE_MODE=autopilot. Control: ps -E read 70 env tokens (an empty read was NOT mistaken for absence). Isolation confirmed same instant: both PROD-app CC procs (30753, 2547) ABSENT. Additivity confirmed: TERM/COLORTERM/LANG/LC_ALL all still present, so the env was EXTENDED not replaced (the M10.5 mojibake regression this could have reintroduced). -->
    - [x] P2.verify-human.2 Gate OFF → the var is ABSENT from the same live process (the fail-closed direction, on the real app)  <!-- status: [x] — PASS 2026-08-07 live: gate flipped to false on disk with the scratch-a `default_drive_mode: autopilot` stamp DELIBERATELY LEFT IN PLACE (mode set, gate off — so a var appearing would prove the gate does not gate). Relaunched, reopened scratch-a → CC pid 62115: CLAUDESK_DRIVE_MODE ABSENT, with the control reading 69 env tokens (readable, so absence is real — NOT the unreadable-instrument artifact that produced a false ABSENT on the login shell). Token delta 70 (ON) → 69 (OFF) is EXACTLY the one var; TERM/COLORTERM/LANG/LC_ALL all intact, so gate-OFF is byte-identical to a build without the feature. UI corroborated the gate at the same instant: Docs tab absent from the tab row, no /session-start button. -->
    - [x] P2.verify-human.3 The raw login shell (right-panel terminal) NEVER receives the var — constraint 5, observed live rather than by type-arity  <!-- status: [x] — PASS 2026-08-07 operator-observed IN the dev app's scratch-a right-panel shell: `echo "DRIVE_MODE=[$CLAUDESK_DRIVE_MODE]"` → `DRIVE_MODE=[]`. Same app instance whose CC carried the var (.1), so the two together prove the CC/shell SPLIT live, not merely the var's presence. ⚠️ NOT agent-checkable by process inspection: macOS `ps -E`/`ps -Eww` returns ZERO env tokens for an interactive login shell (`/bin/zsh -l -i`), while the SAME instrument reads 70 tokens off the dev CC and 15 off a prod CC. A grep for the var on the shell returns empty for BOTH "absent" and "unreadable" — an agent run produced a false "ABSENT ✅" caught ONLY by an env-token control count, and retracted. Operator-only by instrument limitation, not by policy. -->
  - [x] verify-codify  <!-- status: [x] — 2026-08-07. ONE new test: `the_raw_login_shell_never_receives_the_drive_mode_var`, codifying P2.verify-human.3 (the operator-only leaf). Behaviors .1/.2 were already covered by mutation-proven tests and were NOT duplicated. ⚠️ A REAL GAP was found: NO test covered `spawn_shell`'s env SOURCE — `color_tty_env_carries_nothing_beyond_color_and_locale` pins what is IN the array but not WHICH env the shell call site passes, so routing the CC env to the shell (constraint 5's exact leak) passed the whole suite. Closed by extracting `shell_spawn_env()` as an assertable seam, mirroring `borrow_env` on the CC side. Mutation-proven (mutant at executable line 579; exactly 1 test RED; the pre-existing color_tty_env guard stayed GREEN under it, confirming the gap was real, not theoretical). -->

- [x] Phase 3: The hook emission + the known-mode allowlist  <!-- status: [x] — COMPLETE 2026-08-07 (all 5 impl tasks + all 4 verify nodes). The signal is PROVEN END TO END: a real CC turn in a Claudesk-spawned workspace answered `fsd`, the exact stamped mode. -->
  **Observable outcomes:**
  - CLI: with `CLAUDESK_DRIVE_MODE=autopilot` and a `UserPromptSubmit` payload on stdin,
    `perl src-tauri/resources/claudesk-hook.pl` exits 0 and stdout parses as JSON containing
    `hookSpecificOutput.hookEventName == "UserPromptSubmit"` and
    `hookSpecificOutput.additionalContext == "Claudesk reports the drive mode for this workspace as autopilot."`
  - CLI: the same invocation with **`CLAUDESK_HOOK_SOCK` unset** still emits that JSON and exits 0 —
    proving the emission sits **above** line 44 (this is the check that catches constraint 3).
  - CLI: all four allowlisted values (`stepping`/`orchestrated`/`autopilot`/`fsd`) emit; each of
    absent · empty-string · `full-autopilot` · `banana` · a shell-metachar payload emits **byte-empty
    stdout** and exits 0.
  - CLI: for each of the other 9 registered events (`Stop`, `Notification`, `PostToolUse`,
    `PreToolUse`, `PostToolUseFailure`, `SubagentStart`, `SubagentStop`, `SessionStart`, `SessionEnd`)
    with the var SET, stdout is byte-empty and exit is 0 — the 1-of-10 blast radius.
  - CLI: `cargo test -p claudesk --test hook_pl_output` exits 0 —
    `never_blocks_cc_on_degraded_inputs` (6 arms) and `notification_forwards_notification_type` still
    green; telemetry to the socket is unchanged across event shapes.
  - **INTEGRATION-BOUNDARY outcome (added 2026-08-07 at verify-self) — cites the consuming surface:**
    a **real `claude` process** (not `perl` driven synthetically) invokes the deployed hook on a
    genuine `UserPromptSubmit` and **acts on** the returned `additionalContext`. The hook is
    registered in `~/.claude/settings.json` for **10 events on both identities**, so CC is the
    consuming surface (boundary criterion 4) and it is live, not hypothetical. ⚠️ Every other Phase-3
    outcome proves the script **emits well-formed JSON**; none proves **CC accepts it** — and the
    two are separable, which is not a theoretical worry: WP4a measured that a top-level
    `additionalContext` is emitted just fine and **rejected at runtime**. A synthetic `perl` run
    cannot distinguish those cases. Verified by: the deployed `claudesk-hook-dev.pl` carrying the
    signal, a CC turn in a workspace with the var set, and the model demonstrably having the mode in
    context (per WP4a's live method — two arms, identical fixture, one env var apart).
  - [x] P3.1 Move the stdin drain **above** the `$sock_path` early exit and share it between the two
        concerns; keep line 58's `eval { decode_json }` **intact** and add an in-script comment naming
        it as the sole never-block guard  <!-- status: [x] — moved the drain above the socket early exit; the exit now sits at :132, BELOW both the drain (:70) and the signal block; :79 eval left intact + comment naming it the sole guard -->
  - [x] P3.2 Build the known-mode allowlist (exactly `stepping`/`orchestrated`/`autopilot`/`fsd`),
        emitting nothing for anything else — never a default  <!-- status: [x] — exact-match allowlist on the four transitions.md literals (NOT present-and-non-empty) -->
  - [x] P3.3 Emit the Verdict (d) sentence nested under `hookSpecificOutput` + `hookEventName`, on
        `UserPromptSubmit` only  <!-- status: [x] — Verdict (d) sentence nested under hookSpecificOutput + hookEventName, UserPromptSubmit only -->
  - [x] P3.4 Extend `hook_pl_output.rs` with the emission arms via `run_hook_degraded()` (binds no
        socket, captures stdout + status) — the firing arm, the 9 silent events, and the socket-absent
        arm  <!-- status: [x] — 6 new tests in hook_pl_output.rs (8 -> 14) via run_hook_env/run_hook_capture_line_with_mode -->
  - [x] P3.5 **(added 2026-08-07 at verify-self, F9b)** Pin the CONSUMING SURFACE: prove a real
        `claude` process **acts on** the emitted `additionalContext`, not merely that the script
        emits it. ⚠️ Automatable portion: assert the emitted envelope matches CC's accepted shape
        (nesting + event name), since WP4a proved a top-level variant emits fine and is REJECTED at
        runtime. The live arm (a CC turn demonstrably carrying the mode) is operator- or
        bridge-driven and is carried to verify-human  <!-- status: [x] — automatable half DONE 2026-08-07: `stdout_is_always_empty_or_exactly_one_cc_accepted_object`, 12 hostile inputs, mutation-proven against BOTH the top-level-additionalContext shape and the non-Object crash shape. Schema independently corroborated against CC's official hooks reference (nesting required; top-level NOT accepted; hookEventName required + exact-match) — a SECOND source beside WP4a's live measurement. ⚠️ THE LIVE ARM IS CARRIED TO VERIFY-HUMAN and is NOT covered here: nothing in this suite runs a real `claude`. -->
  - [x] verify-auto  <!-- status: [x] — PASS 2026-08-07 (re-run after the P3.5 F9b back-loop); all 6 Observable Outcomes met incl. the added integration-boundary one. The "telemetry unchanged across event shapes" clause was proven by DIFFING against the pre-change script extracted from git HEAD (7 shapes × {var set, var unset} → byte-identical after dropping the by-design-varying timestamp), not merely by the one in-suite test. Also confirmed the DEPLOYED `claudesk-hook-dev.pl` is byte-identical to the repo source, so the tests exercised the same bytes CC will run (it lags after any later repo edit — the dev app redeploys at launch). -->
  - [x] verify-self  <!-- status: [x] — PASS 2026-08-07; subagent verified 6/6, 0 BLOCKING, 0 COSMETIC. It independently mutation-proved TWO properties on scratchpad copies (re-inserting the socket early exit above the drain → signal dies; removing the `eval` → malformed stdin exits non-zero), checked its OWN env for the exported-CLAUDESK_DRIVE_MODE hazard, and confirmed `perl_available()` is true so no test silently early-returned. ⚠️ IT ALSO CORRECTED A DURABLE MEASUREMENT: the eval-removal mutant exits **255**, not the **2** recorded in WP4a's verdict — Perl's `die` exits 255. The wrong number had been copied verbatim into `claudesk-hook.pl:75` and `hook_pl_output.rs:179` before anyone re-measured; all three corrected in this commit. -->
  - [x] verify-human  <!-- status: [x] — APPROVED 2026-08-07, all 3 leaves PASS. INTEGRATION BOUNDARY (Claude Code, 10 registered hook events): F11 skip forbidden and auto-skip gate (c)+(d) both failed, so this was a real operator pause — correctly so: leaf .3 is the ONLY evidence in the entire WP that the model CONSUMES the signal, and no test reaches it.

       ⚠️ AGENT MEASUREMENT ERROR, CORRECTED — worth reading before trusting any future "the pane is blank" claim. Mid-run the agent recorded the CC pane as BLANK on "7 consecutive stable DOM samples over 12.6s PLUS a screenshot", explicitly citing two-independent-instruments-agreeing as grounds for NOT invoking caveat (h). An operator screenshot then showed the pane rendering CC's banner AND the agent's own typed prompt the whole time. Both instruments were wrong TOGETHER: the DOM reads walked `.xterm-rows` children, which read empty under the DOM renderer (the real text lives in absolutely-positioned spans), and the screenshot was captured before paint. **The durable lesson EXTENDS caveat (h): instrument AGREEMENT is not correctness when both instruments share a defect — two reads of the same wrong node are one observation, not two.** A cheap disconfirming check (does this selector return text for a pane KNOWN to be painted?) was available and was not run. -->
    - [x] P3.verify-human.0 Sanity: the pane renders at all  <!-- status: [x] — operator-confirmed by screenshot; see the correction above. -->
    - [x] P3.verify-human.1 The var reaches a live CC spawned through the REAL picker path (not a test harness)  <!-- status: [x] — AGENT-VERIFIED 2026-08-07 via the MCP bridge: clicked the ⊘ no-fire door on scratch-b (stamped `fsd`), CC pid 10935 spawned with NO `--continue` and `CLAUDESK_DRIVE_MODE=fsd` present, 70 readable env tokens. Also proves the mode is re-read from projects.json at SPAWN time — the running app picked up a stamp written after launch, no relaunch needed. -->
    - [x] P3.verify-human.2 The hook actually FIRES for a Claudesk-spawned session (not merely when run by hand)  <!-- status: [x] — AGENT-VERIFIED 2026-08-07: status-channel.log shows `SessionStart cwd=…/scratch-b` at epoch 1786118011809, matching the ⊘ click at 1786118011377. The deployed `claudesk-hook-dev.pl` was confirmed byte-identical to the repo source, so the firing script IS the one under test. -->
    - [x] P3.verify-human.3 **A real `/session-restore` (or a real CC turn) demonstrably ACTS on the injected mode** — the one claim no test makes  <!-- status: [x] — PASS 2026-08-07, OPERATOR-DRIVEN. A real CC turn in the Claudesk-spawned scratch-b session answered **`fsd`** — the exact stamped mode. Log corroboration: UserPromptSubmit epoch 1786118603026 (cwd=scratch-b, outcome=emitted) → Stop at 1786118605775. ⚠️ WHY `fsd` IS DECISIVE AND NOT A LUCKY GUESS: it appears NOWHERE in scratch-b (an empty scratch repo with no workflow-system/ dir — the Docs panel read "No workflow docs found"), it is NOT any documented default (`session-restore` labels *autopilot* "(default)"), and it was chosen for exactly this reason at setup. The only path from projects.json to that reply is env var → hook → additionalContext. ⚠️ AGENT COULD NOT DRIVE THIS: `cc_input` via `__TAURI_INTERNALS__` resolved cleanly yet the text never COMMITTED (bridge caveat (e) — synthetic Enter does not reach the PTY); the operator pressing Enter on the agent-typed text is what fired the turn. -->
  - [x] verify-codify  <!-- status: [x] — 2026-08-07. ONE new test: `the_perl_hook_allowlist_matches_rusts_drive_mode_vocabulary` (config_store). ⚠️ IT CLOSES A REAL, SILENT GAP: the drive-mode vocabulary lives in TWO LANGUAGES (Rust serde renames + the Perl `qw(...)` allowlist) and NOTHING tied them together — Rust's tests pinned Rust, the hook tests fed Perl hard-coded literals, so a rename on either side left BOTH suites green while the signal silently stopped reaching CC (no crash, no error; the only symptom is /session-restore asking a question it should have skipped — precisely constraint 1's failure). It READS the allowlist out of the real script rather than restating it, so it cannot become a third copy of the vocabulary. Mutation-proven BOTH directions: Perl-side rename → 1 test RED naming both lists; Rust-side rename → 4 RED incl. this one + the constraint-1 tripwire. ⚠️ PLACEMENT NOTE: first written as an integration test, which CANNOT compile — `config_store` is a private `mod` in a bin-only crate, so reaching `DriveMode` from `tests/` would mean widening production visibility to serve a test. Moved to a unit test where both sides are already reachable. Behaviors .1/.2 needed nothing new (.1 covered by Phase 2's mutation-proven caller test; .2 is CC's own invocation, not ours to test); .3's live finding has NO automatable equivalent — no test can prove a model consumes context. -->

- [x] Phase 4: Mutation-prove the three inert arms + the end-to-end caller  <!-- status: [x] — COMPLETE 2026-08-07 (4 impl tasks + all 4 verify nodes). 5 mutants proven individually + the cross-language caller assertion. -->
  **Observable outcomes:**
  - CLI: **three separate mutants**, each applied and reverted individually, each confirmed to have
    changed *executable* code via `sed -n '<line>p'` before believing the result
    (`[[verify-the-mutation-landed]]`): (1) delete the var-absent check → the absent-arm test FAILS;
    (2) delete the empty-string check → the empty-arm test FAILS; (3) replace the allowlist with a
    truthiness check → the unrecognized-value test FAILS. Each mutant attributed to its own probe (a
    composite that trips *some* arm hides gaps — M10.9's proven method).
  - CLI: a 4th mutant — remove the `UserPromptSubmit` event filter → the 9-silent-events test FAILS.
  - CLI: a 5th mutant on the **caller**: make the spawn-side gate read `unwrap_or(true)` → a test
    FAILS (fail-closed is asserted, not assumed).
  - CLI: an **end-to-end** test asserts the spawn path's composed env actually feeds the value the
    hook's allowlist accepts — one assertion crossing both sides, not two unit tests passing
    independently (constraint 9).
  - CLI: `cargo test -p claudesk` + `./node_modules/.bin/tsc --noEmit` + `pnpm lint` all exit 0 with
    every mutant reverted.
  - [x] P4.1 Mutants 1–3 (the three inertness arms), individually applied, each landing verified  <!-- status: [x] — mutants 1-3 applied INDIVIDUALLY, each landing verified. ⚠️ MUTANT 1 EXPOSED A REAL GAP AND WAS FIXED, NOT WAIVED: deleting the `// ''` fallback left stdout byte-empty and ALL tests green, because absent-var inertness actually comes from the `%KNOWN` allowlist (an undef key is falsy) — the fallback really prevents a `use warnings` diagnostic on STDERR, one line of noise per prompt for every gate-OFF user. Invisible because every helper sets `.stderr(Stdio::null())`. Closed by a new test `the_hook_never_writes_to_stderr` (stderr PIPED, 5 arms); mutant 1 now goes RED. Mutants 2 (empty-string admitted to the allowlist) and 3 (allowlist -> truthiness) each RED 2 tests. -->
  - [x] P4.2 Mutant 4 (event filter) + mutant 5 (fail-closed gate)  <!-- status: [x] — mutant 4 (event filter -> `if (1)`) RED `only_user_prompt_submit_emits_the_signal`; mutant 5 (gate `unwrap_or(false)` -> `unwrap_or(true)`, i.e. fail-OPEN) RED `resolve_gate_enabled_fails_closed_on_every_degraded_read` + `the_resolved_cc_env_honors_the_gate_end_to_end`. Both landings verified in executable code. -->
  - [x] P4.3 The end-to-end spawn-env → hook-allowlist assertion (the caller proof)  <!-- status: [x] — `the_spawn_env_feeds_a_value_the_real_hook_accepts` (cc_session): takes the env the REAL spawn path composes and feeds it to the REAL Perl script as a subprocess, asserting the model-facing sentence names that mode; gate-OFF arm asserts byte-empty through the same path. ⚠️ This is the ONLY test that runs Rust's composed value THROUGH the shipped script — the vocabulary test compares the two lists as TEXT without executing anything, so both could pass while the halves never meet. Mutation-proven: forcing the composed value to `full-autopilot` REDs 5 tests incl. this one. ⚠️ Placed as a UNIT test, not an integration test: `cc_spawn_env` is private in a private module, so reaching it from `tests/` would mean widening production visibility to serve a test (same constraint hit at Phase 3 verify-codify). -->
  - [x] P4.4 Extend the OFF-invariant guard's reach or confirm this arm is covered — record which,
        since **WP5 owns the guard's 4th arm** and must not re-discover this  <!-- status: [x] — VERDICT: **the OFF-invariant guard does NOT and SHOULD NOT cover WP4b.** MEASURED, not reasoned: the guard scans NO `.rs` and NO `.pl` file (its allowlist is all `src/**` TypeScript), and WP4b adds ZERO frontend surface — the only `src/` hit for `default_drive_mode` is a comment saying the field is unused. WP4b's surfaces are a Rust spawn-time env var and a Perl hook, structurally outside all three registry arms (panel/menu-id/chord). Gate-OFF is instead enforced Rust-side by the fail-closed `resolve_gate_enabled` + the byte-empty-when-OFF arms (36 gate-related lib tests). ⚠️ **WP5 MUST STILL ADD ITS 4TH ARM — for WP4c's PICKER CELL, which IS a frontend surface — but must not expect that arm to cover WP4b.** Note `WORKFLOW_TERMS` already contains `drivemode`/`drive-mode`, so a `driveMode` identifier in any `*Chord*`-exporting module trips the chord arm today. -->
  - [x] verify-auto  <!-- status: [x] — PASS 2026-08-07. All 5 Observable Outcomes RE-RUN independently at this gate rather than cited from the build pass. Five mutants applied INDIVIDUALLY, each landing confirmed in executable code before believing the result: (1) absent-var fallback → 1 RED, (2) empty admitted to allowlist → 3 RED, (3) allowlist→truthiness → 2 RED, (4) event filter → 1 RED, (5) gate fail-OPEN → 2 RED, (OC4) composed value drifted → the cross-language caller test RED. ⚠️ KILL COUNTS CORRECTED at verify-self: an earlier run reported (1)→2 and (3)→3, but a shell helper was counting cargo's `test result: FAILED` SUMMARY line as if it were a failing test. Re-measured: (1) kills exactly ONE test — `the_hook_never_writes_to_stderr`, the SOLE test catching it, which is precisely why it was added. The substantive finding is unchanged and sharper. ⚠️ Also note cargo HALTS after the lib target fails, so a lib-killing mutant leaves integration kills unattributed unless the integration suite is re-run separately. Both mutated files verified byte-identical to pre-mutant state afterwards (diff, not eyeball). Gates with everything reverted: 821 lib + 16 hook + 1 integration / 0 fail, tsc exit 0, lint 0 errors (1 pre-existing warning in XtermPane.tsx, a file this WP never touched). -->
  - [x] verify-self  <!-- status: [x] — PASS 2026-08-07; subagent verified 6/6, 0 BLOCKING, 0 COSMETIC. ⚠️ NO INTEGRATION BOUNDARY: Phase 4 added exactly TWO TESTS and zero production code (verified — the hook allowlist, the composed value and the gate are all byte-identical to their Phase-3 values), so it adds only isolated new artifacts no existing surface consumes. Subagent independently reproduced all 5 mutants + the end-to-end one, and did THREE things worth carrying: (1) caught that `unwrap_or(false)` appears TWICE — line 522 is a DOC COMMENT, 527 the executable body — and line-scoped the mutation, printing both (the exact [[verify-the-mutation-landed]] trap); (2) its first OC4 mutation attempt SILENTLY MATCHED NOTHING and produced an empty diff — it noticed and redid it with awk instead of reporting a false pass; (3) re-ran the integration suite SEPARATELY for the lib-killing mutants, because cargo HALTS after the lib target fails and would otherwise leave integration kills unattributed. It also proved restoration by diff+shasum and confirmed final `git status` matches the pre-verification baseline. -->
  - [x] verify-human  <!-- status: [x] — AUTO-SKIPPED 2026-08-07 (F11), all 4 gates clean: (a) drive_mode=autopilot, (b) verify-self all-PASS, (c) NO integration boundary — Phase 4 added only tests and changed ZERO production code (verified: hook allowlist :108, composed value :504, fail-closed gate :527 all byte-identical to their Phase-3 values), (d) no outcome cites a consuming surface — the `UserPromptSubmit` and 'spawn path' mentions are SUBJECTS OF MUTATION, and every outcome terminates in a test-suite result. ⚠️ CONTRAST WORTH KEEPING: Phases 2 and 3 each FAILED this gate and took a real operator pause, because each changed production code behind a live consuming surface. The gate discriminated correctly in all three cases rather than always firing. Affirmation block printed in chat as the operator's read-time veto. -->
  - [x] verify-codify  <!-- status: [x] — 2026-08-07. NO new tests: all 6 behaviors Phase 4 verified already have permanent tests, BY CONSTRUCTION (the phase's deliverable WAS those tests) — verified by grepping each `fn` name rather than assumed. What DID need codifying was P4.4's VERDICT, which lived only in this WIP and would be ARCHIVED at finalize: the OFF-invariant guard's header now carries a `WHEN M12 LANDS` section (the `WHEN M11 LANDS` precedent) recording that WP4b is deliberately OUT of scope (Rust env var + Perl hook; the guard scans neither, and its allowlist is all `src/**` — re-verified, the only src-tauri reference in the file is that new comment) while WP4c's picker cell IS in scope and WP5 owns its arm. ⚠️ It also warns against 'fixing' the guard to reach into src-tauri/, which would make it a different and weaker thing. Guard still 14/14 (the comment does not false-positive — it strips comments before matching, by its own design). Gates: 1926 frontend, 838 Rust, tsc 0, lint 0 errors. -->

## Current Node
- **Path:** Feature > finalize
- **Review-quality (2026-08-07):** COMPLETE — 0 CRITICAL / 3 MAJOR / 4 MINOR, all auto-backlogged per drive_mode=autopilot. No refactor triggered (F39). The headline MAJOR (env var inherits to all descendants) was CONFIRMED EMPIRICALLY at review, not accepted on assertion.
- **Ship note (2026-08-07):** cleanup + full verification DONE (838 Rust / 1926 frontend / clippy / fmt / tsc / 0 lint errors). ⚠️ `cargo fmt --check` FAILED at this gate on P4.3's test and was fixed — earlier fmt passes predated that test, so the final gate caught what the per-phase ones structurally could not. ⚠️ NOT COMMITTED: the operator has not asked for a commit, and this repo commits only on request. `main` is already 7 ahead of origin/main; the WP4b tree is uncommitted on top of that.
- **Active scope:** none — **ALL 4 PHASES COMPLETE** (impl + verify-auto/self/human/codify each).
  The feature is proven end to end: a real CC turn in a Claudesk-spawned workspace answered `fsd`,
  the exact stamped mode (operator-driven, 2026-08-07).
- **Blocked:** none
- **Unvisited:** none — ship, review-quality and finalize all COMPLETE.
- **Blocked:** none
- **✅ The Phase 4 planning note was HONORED:** its outcome set already named the consuming surface
  (P4.3's end-to-end assertion), so unlike Phases 2 and 3 this phase needed **no F9b back-loop**.
- **Open discoveries:** 4 — see Discoveries

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->
- [SURFACED-2026-08-06] feature-plan — `wbs.md` exceeds the 300-line size guard (1226 lines); read the
  WP4b task list (494-585) + Verdicts (c)-(f) (972-1155) + incidental code facts (1156-1185) targeted
  rather than the first 100 lines, since the headings pointed straight at the binding sections.
  Logged as `SURFACE-2026-08-06-WBS-MD-EXCEEDS-SIZE-GUARD-1226-LINES` (low).
- [SURFACED-2026-08-06] Phase 1 — **an unparseable `default_drive_mode` fails the WHOLE project
  list**, not just the offending record: `read_projects` does one `serde_json::from_slice` over the
  file, so a single unknown mode string returns `ConfigError::Parse` and the picker presents as
  empty. **The WP4b rename was nonetheless migration-free, and this was MEASURED not assumed** —
  `default_drive_mode` appears **0 times** in both the real `com.claudesk.app` and
  `com.claudesk.app.dev` `projects.json`, consistent with the field never having had a writer. Pinned
  by `an_unknown_drive_mode_string_fails_the_whole_project_list` so the blast radius is recorded
  **before** the field has real users. ⚠️ **Consequence for any FUTURE vocabulary change:** once
  modes are being persisted, a rename is a breaking migration needing a lenient reader or a version
  bump — not another rename. Not backlogged: no live defect, and the note belongs with the code.
- [SURFACED-2026-08-06] Phase 2 — ⚠️ **A `?raw`-style source-text guard over a CALL SITE was
  measured vacuous THREE times in a row, each time for a different reason, each time passing while
  a mutant broke the feature.** (1) `contains("cc_spawn_env(")` is satisfied by the function's own
  `fn` **declaration**; (2) a whitespace-exact match on the call site stopped biting the instant
  `cargo fmt`/a signature refactor moved the argument; (3) the literal-argument form
  `contains("&cc_spawn_env(drive_mode, gate_enabled)")` was satisfied by **the assertion line
  inside the guard itself** — the needle appears in the test's own source, which survives
  comment-stripping. ⚠️ **This extends `CLAUDE.md`'s rule beyond what it currently says.** The
  documented mitigations are *"assert single identifiers"* (which is what made hole 1 possible) and
  *"strip comments first"* (which does nothing for hole 3, since the guard's own **executable**
  assertion line carries the needle). **A source-text guard cannot verify a property whose
  statement contains the string it searches for.** Resolved per
  `[[extract-for-import-when-a-raw-guard-cant-express-the-property]]`: the wiring now goes through
  one importable `resolve_cc_spawn_env(gate_read, mode_read)`, and
  `the_resolved_cc_env_honors_the_gate_end_to_end` asserts its **return value** across 8 real
  degraded-input combinations — proven to catch both the fail-closed inversion and the
  gate-bypass mutant. Logged as `SURFACE-2026-08-06-RAW-GUARD-SATISFIED-BY-ITS-OWN-ASSERTION-LINE`.
- [SURFACED-2026-08-06] Phase 2 — **clippy `too_many_arguments` (8/7) was a real design signal, not
  a threshold to silence.** Passing `(drive_mode, gate_enabled)` as two parameters to
  `PtyCcSession::spawn` gave a caller a way to supply the mode and forget the gate. Fixed by passing
  the **already-composed env** instead, so "gate off ⇒ no var" cannot be re-decided at the spawn.
  Worth noting because the reflex fix (an `#[allow]`) would have preserved the hazard the lint found.
- [SURFACED-2026-08-06] Phase 1 — **clippy `-D warnings` counts a test-only caller as dead code**, so
  both new accessors needed `#[allow(dead_code)]` (their real consumers are Phase 2 and WP4c). Handled
  per `session_state/mod.rs:47`'s discipline — **per-item** allows each naming its retiring consumer,
  plus an OPEN ledger in the module header with an explicit close condition (clippy passing with
  *neither* attribute present). ⚠️ The M12 precedent that makes this worth tracking rather than
  waving through: `is_unclean_on_disk` was attributed on a predicted consumer that never
  materialized, and was rightly **deleted** rather than re-attributed. Not backlogged — the ledger
  in the module header *is* the tracking artifact, and burying it in the backlog would split it from
  the code it governs.
- [SURFACED-2026-08-07] Phase 2 verify-self — ⚠️ **INTEGRATION BOUNDARY with no outcome citing the
  consuming surface → F9b back-loop before running the subagent.** The phase's *entire* subtractive
  diff is one line inside `SessionRegistry::spawn` — `&color_tty_env()` → `&cc_env` — and that
  function is the body of the **existing `cc_spawn` Tauri command** (`cc_session/commands.rs:75`)
  that every workspace open consumes. That is boundary criterion 1, on the consumed path itself.
  All four Observable Outcomes are unit/CLI-scoped (`cc_spawn_env` and `resolve_cc_spawn_env` in
  isolation, a `color_tty_env` type grep, a full-suite regression); **none names `cc_spawn` or a
  real workspace open**, so nothing yet proves a live `claude` process actually *receives*
  `CLAUDESK_DRIVE_MODE`. ⚠️ **This is precisely constraint 9's failure mode — "a proven module
  behind a caller that does not honor it" — which this milestone has now hit five times, and which
  this very call site already produced three times via vacuous source-text guards** (see the
  2026-08-06 entry above). `the_resolved_cc_env_honors_the_gate_end_to_end` closes most of the gap
  but calls `resolve_cc_spawn_env` **directly**, so it cannot observe whether `spawn` passes
  `&cc_env` or silently reverts to `&color_tty_env()` — the exact mutant the retired guards missed.
  Remedy is an added outcome + leaf, not a code change; the implementation is believed correct.
- [SURFACED-2026-08-07] Phase 2 / P2.7 — ⚠️ **A doc comment NAMED a test that did not exist, and
  every gate passed.** `PtyCcSession::spawn`'s doc comment (`:717`) asserted that
  `[tests::the_cc_spawn_wires_the_gate_through_the_fail_closed_resolver]` "guards that this
  receives `cc_spawn_env`'s output rather than the shell-shared `color_tty_env` array" — and that
  test **did not exist**; the identifier's only occurrence in the whole crate was the doc comment
  referencing it. **A rustdoc intra-doc link to a missing item does not fail `cargo test`,
  `cargo clippy -D warnings`, or `cargo fmt`**, so the claim shipped as a documentation lie a
  future reader (or a future agent doing exactly this audit) would trust — and it asserted
  coverage of *precisely* the caller property that was in fact unpinned. **This is a FOURTH,
  distinct failure class**, not another instance of the three vacuous source-text guards above:
  those were guards that ran and proved nothing; this was a guard that **never ran at all** while
  reading, in prose, as the strongest evidence in the module. ⚠️ **Generalizes beyond this repo's
  existing `[[verify-the-mutation-landed]]` rule** — that rule says confirm a mutation landed in
  executable code; this adds: **confirm a test cited as evidence EXISTS before crediting it.**
  Cheap mechanical check: `grep -c` the identifier — 1 occurrence means only the citation exists.
  Fixed by writing the test the comment promised (mutation-proven: mutant at executable line 576,
  exactly 1 test RED, all 817 others green). Candidate for `-D rustdoc::broken_intra_doc_links` in
  CI — filed as `SURFACE-2026-08-07-DOC-COMMENT-CITED-A-NONEXISTENT-TEST` (medium).

## Retrospect

- **What changed in our understanding:**
  - **The two integration boundaries were invisible at plan time and obvious in hindsight.** Phases 2
    and 3 each wrote a complete-looking Observable-Outcome set that proved the *module* and never the
    *caller* — and each cost an F9b back-loop at verify-self. Constraint 9 sat in this very file
    predicting it, with five prior instances recorded. **The lesson is that constraint 9 is a
    PLANNING-time instrument, not a verification-time one:** by the time verify-self catches it, the
    phase is already built. Phase 4 drafted its outcomes with the consuming surface named first and
    needed no back-loop — the only phase of the four that didn't.
  - **A defensive construct with no test defending it is invisible, even to mutation testing that
    targets it.** Deleting the `// ''` fallback changed nothing observable and passed everything,
    because inertness actually comes from the allowlist. What it really prevents is a Perl warning on
    **stderr** — and every test helper set `.stderr(Stdio::null())`, so the suite structurally could
    not see it. Mutation testing found this only because the mutant was applied and the *absence* of a
    failure was treated as a question rather than a pass.
  - **Instrument agreement is not correctness.** At Phase 3 verify-human the agent called a rendering
    CC pane "blank" on 7 stable DOM samples PLUS a screenshot, and explicitly cited two-independent-
    instruments as grounds for not invoking the known caveat. Both were wrong together (wrong DOM
    nodes; pre-paint capture). **Two reads of the same wrong node are one observation, not two.**

- **Assumptions that held:**
  - WP4a's four verdicts were sound build instructions — shared script, gate-by-absence, the exact
    sentence, emit-nothing-on-unknown. None was revisited.
  - The hook mechanism worked as proven at WP4a: the real `/session-restore` path consumed the
    injected context, confirmed live with `fsd`.
  - Constraint 3 (drain above the early exit) and constraint 4 (the `eval` is the sole never-block
    guard) were both real and both mutation-confirmed exactly as written.

- **Assumptions that were wrong:**
  - **"The `// ''` fallback is what makes an absent var inert."** It is not — the allowlist is.
  - **WP4a recorded the never-block-CC mutant as exiting `2`; it exits `255`** (Perl's `die`). The
    wrong number had been copied verbatim into two other files before anyone re-measured it. A
    recorded measurement is still worth re-running when re-running is cheap.
  - **The containment story was believed complete at "CC yes, login shell no."** Code review found —
    and this WP then confirmed empirically — that the env var inherits to **all descendants**, so a
    nested `claude` fires the hook with the parent workspace's mode. ⚠️ The test suite had *already
    observed* this and neutralized it as test hygiene (`.env_remove` + a comment). The strongest
    available production signal was consumed locally and never asked as a product question.

- **Approach delta:**
  - Three tasks were added mid-flight, all at verify gates rather than planned: **P2.7** (the
    `cc_spawn` caller proof), **P3.5** (the CC-accepted-shape proof), and the stderr guard inside
    P4.1. Each closed a gap the phase's own outcome set had missed.
  - Two tests were written first as **integration** tests and moved to **unit** tests: `config_store`
    and `cc_session` are private modules in a bin-only crate, so reaching them from `tests/` would
    have meant widening production visibility to serve a test. Worth knowing before the next attempt.
  - A doc comment was found citing a test that **did not exist** — a rustdoc intra-doc link to a
    missing item fails no gate, so it read as the module's strongest evidence while pinning nothing.
    Writing that test became P2.7.
  - **Not committed at finalize.** The operator did not request a commit, and this repo commits on
    request only.

## Code-Quality Review — m12-wp4b-drive-mode-signal

**Reviewed 2026-08-07** (subagent, fresh context). Baseline was NON-STANDARD: WP4b has **no ship commit**
(the operator has not asked for one), so the review target was the **working tree vs `HEAD` = `7c299a4`**.

**Verdict: 0 CRITICAL · 3 MAJOR · 4 MINOR** — all auto-backlogged per `drive_mode: autopilot`
(→ `backlog-quality-findings.md`, pointer in `backlog.md`). No refactor triggered.

### Strengths (reviewer's, verbatim in substance)
- Inertness-by-absence is the right architecture and is stated consistently in all four places it matters.
- The vocabulary test **reads the `qw(...)` list out of the shipped script** rather than restating it —
  the right shape for a two-language contract with a silent failure mode.
- `the_spawn_env_feeds_a_value_the_real_hook_accepts` is the standout: the one assertion in the WP that
  **could not be satisfied by two half-correct implementations**.
- `stdout_is_always_empty_or_exactly_one_cc_accepted_object` correctly identifies that the allowlist
  doubles as **crash safety**.
- The `#[allow(dead_code)]` ledger names its retiring consumer per item with an explicit close condition.

### MAJOR findings
1. **`CLAUDESK_DRIVE_MODE` inherits to ALL DESCENDANTS, not just CC.** ⚠️ **I CONFIRMED THIS
   EMPIRICALLY rather than accepting it** — there is no `env_clear` anywhere in `cc_session`, and
   `CLAUDESK_DRIVE_MODE=fsd bash -c 'bash -c ...'` shows `fsd` at both levels; feeding that value to the
   real hook emits the sentence. So a `claude` launched from inside a Claudesk-spawned CC's Bash tool
   fires the hook with the **parent workspace's** mode. The WP's stated containment story (constraint 5,
   `shell_spawn_env`) covers only the **sibling** login shell. ⚠️ **The test suite ALREADY OBSERVED this
   and neutralized it as test hygiene** (`.env_remove` + "the ambient environment already carries it") —
   the strongest available production signal, consumed locally. Not necessarily a defect; undecided and
   unstated. → `SURFACE-2026-08-07-QUALITY-WP4B-ENV-VAR-INHERITS-TO-ALL-DESCENDANTS`
2. **`shell_spawn_env`'s test asserts the primitive, not the caller** — it calls `shell_spawn_env()`
   directly, never `spawn_shell`, so a mutant routing `spawn_shell` to `cc_spawn_env(...)` still passes.
   ⚠️ The SAME caller-vs-primitive gap this WP closes at `cc_spawn`, recurring in a seam added to close
   it. Extracting is not the same as asserting the caller. →
   `SURFACE-2026-08-07-QUALITY-WP4B-SHELL-SEAM-ASSERTS-THE-PRIMITIVE-NOT-THE-CALLER`
3. **Incident-narrative comments are triple-recorded** (code + WIP + backlog), ~48% comments/blanks in
   the new region, with `resolve_cc_spawn_env` spending 14 lines on retired guards. Scoped to the
   *chronology* subset — the contract warnings are the ones that have prevented regressions and should
   stay. → `SURFACE-2026-08-07-QUALITY-WP4B-INCIDENT-NARRATIVE-TRIPLE-RECORDED-IN-CODE-COMMENTS`

### MINOR findings (4, grouped)
`%KNOWN` rebuilt per turn · `to_string().trim_matches('"')` string surgery + an unreachable `if let Ok`
arm · `expected_context()` duplicates the sentence three lines from the test whose principle is the
opposite, with nothing reconciling them · the "vice versa" half of a config_store test is unasserted.
→ `SURFACE-2026-08-07-QUALITY-WP4B-FOUR-MINOR-FINDINGS`

### Assessment (reviewer)
Well-built work with an unusually clear-eyed grasp of its own failure modes; the cross-language caller
proof exists "because constraint 9 was taken seriously rather than recited." Debt is of two kinds: a
genuine scope gap (descendant inheritance, observed by the tests and never stated in production), and
the extract-for-testability method applied past its yield.

### If you disagree
Mark any finding `[DISMISSED]` in this section before `feature-finalize` archives this file.


## Verification log

### Phase 1 — verify-auto, 2026-08-06: **PASS** (4 scoped checks)

Scope confirmed first: `git diff --name-only` shows exactly **one** source file changed
(`src-tauri/src/config_store/mod.rs`); the other two are docs/state (`runtimes.md`, `backlog.md`).

| # | Check | Result |
|---|---|---|
| 1 | `cargo check --lib` — compile/type | PASS |
| 2 | `cargo test --lib config_store` — targeted module | **84 pass** / 0 fail |
| 3 | `cargo clippy --all-targets -- -D warnings` (⚠️ never `--lib`, per `CLAUDE.md`) | clean, 0 findings |
| 4 | The vocabulary claim, checked against the **external** authority | PASS — see below |

**Check 4 is the one that matters, and it is deliberately not a source-read of our own code.**
Phase 1's whole risk is a vocabulary both sides share and both get wrong, so the assertion was
verified against three *independent* sources, all agreeing on `stepping | orchestrated | autopilot |
fsd`:
- `_ref/claude-customization/workflow-system/product/transitions.md:165` — verbatim, exact path as
  documented;
- `session-handoff/SKILL.md:75` — the writer template `<stepping|orchestrated|autopilot|fsd>`;
- **real archive WIP frontmatter** — `28 autopilot`, `1 orchestrated`, matching the WBS's counts
  exactly.

The 11 drive-mode tests were also run in isolation (`cargo test --lib drive_mode` → 11 pass) to
confirm they are actually *selected* and not silently filtered — a renamed test that never runs is
indistinguishable from a passing one in an aggregate count.

**Also carried from build (not re-run here — verify-auto is scoped by design):** full suite
`cargo test --all-targets` → **810 lib pass** / 0 fail; `cargo fmt --check` clean; and the
`fsd`→`full-autopilot` mutant proven to fail two tests independently with the mutation confirmed to
have landed on executable code (line 119, a `#[serde]` attribute).

**Incidental:** the first `_ref/` read failed with "No such file or directory" — that was
working-directory drift in the shell, **not** a broken symlink. `_ref/claude-customization` resolves
correctly to the companion repo. Noted because a missing `_ref/` would have invalidated check 4, and
the two failure modes look identical from the error text alone.

### Phase 1 — verify-self, 2026-08-06: **PASS 7/7** (0 BLOCKING, 0 COSMETIC)

**Integration-boundary determination: NO BOUNDARY.** Checked rather than assumed, because
`config_store/mod.rs` *is* consumed by existing IPC commands — so the rule plausibly applied:
- The 7 `#[tauri::command]` wrappers in `config_store/commands.rs` contain **0** references to
  `drive_mode` (grepped).
- `Project` — which `list_projects` returns — is the one shape that did change, but only in the
  *serde value mapping* of a field whose key is **absent while unset** (`skip_serializing_if`), and
  `ProjectPicker.tsx:42` already documents that `default_drive_mode` "exist[s] on the wire but [is]
  unused by this component."
- `project_serializes_path_as_project_path_for_frontend_contract` re-run green, confirming the wire
  contract is unchanged.
So the phase changes only isolated new artifacts + a value mapping no consuming surface reads. Per
the rule, noted explicitly rather than left implicit.

Verified by a `feature-verify-self-runner` subagent (spawn is unconditional by design — parent-context
cleanliness, not tool availability). No dev URL: pure store change, no running app involved.

| # | Outcome | Result |
|---|---|---|
| 1 | tripwire asserts the four literal strings | PASS |
| 2 | expectation is TRANSCRIBED, not derived from the enum | PASS |
| 3 | accessors round-trip; unknown path errs on write; clear removes the key | PASS |
| 4 | both stale doc claims gone (`grep -c` → **0**, no disambiguation needed) | PASS |
| 5 | `cargo clippy --all-targets -- -D warnings` | PASS |
| 6 | `cargo fmt --check` | PASS |
| 7 | external authority agrees with the enum, reported verbatim | PASS |

**Two things the subagent did that are worth keeping as method:**
1. ⚠️ **It refused to trust a CACHED clippy pass.** The first run finished in 0.19s from cache, which
   makes a green **under-determined**; it re-ran after `touch`ing the changed file, confirmed the log
   said `Checking claudesk v0.3.2` (a real recompile including test targets), and only then reported
   PASS. This is the same discipline as `[[verify-the-mutation-landed]]` applied to a build cache —
   a pass that could not have failed is not evidence.
2. **On outcome 2 it checked the DIRECTION of the derivation**, confirming only the *observed* side
   calls `serde_json::to_string` while the *expected* side is hardcoded literals. That is the actual
   property; "the test contains the right strings" would have passed even if they were computed.

**Auditable agreement (outcome 7), both sides verbatim:**
- `transitions.md:165` — *"…stored in `workflow-system/state/wip/<item>.md` frontmatter as
  `drive_mode: stepping | orchestrated | autopilot | fsd`…"*
- `config_store/mod.rs` — `StepByStep→"stepping"`, `Orchestrated→"orchestrated"`,
  `Autopilot→"autopilot"`, `FullAutopilot→"fsd"`, each per-variant, **no `rename_all`**.

### Phase 1 — verify-human, 2026-08-06: **AUTO-SKIPPED (F11)**, all 4 gates clean

Gates: **(a)** `drive_mode: autopilot` read from frontmatter · **(b)** verify-self 7/7 all-`[x]`, no
`UNVERIFIED`/`FAILED`/`FAILED-cosmetic` · **(c)** no integration boundary (determined at verify-self,
not re-asserted) · **(d)** re-read all four Observable Outcomes — every one is a build-tool invocation
(`cargo test`, `grep`) against new artifacts; none names an existing endpoint / UI route / CLI command
/ job / external system that this phase *modifies*.

⚠️ **Gate (d) judgment worth recording:** `projects.json` **is** named in outcome 3, which superficially
looks like a consuming surface. It is not — it is named as *the store the new accessors write to*, not
as a surface whose existing behavior changes. The distinction was checked rather than argued: the key
is absent while unset (`skip_serializing_if`) and
`project_serializes_path_as_project_path_for_frontend_contract` passes, so `list_projects` returns
byte-identical JSON. Had the field been serialized unconditionally, gate (d) would have failed and this
phase would have owed a captured `curl`-equivalent against `list_projects`.

The affirmation block was printed in chat, preserving the operator's read-time veto (the recovery path
for the known probe/decision-artifact false positive is a manual `/feature-build <leaf-id>`).

**No design prior captured** — no operator correction or rejection occurred at this gate, so the
capture discriminant did not fire.

### Phase 1 — verify-codify, 2026-08-06: **PASS** → Phase 1 COMPLETE

**Coverage audit first — nothing duplicated.** All 11 tests written during build (TDD) were checked
against each verified behavior for "would this catch a regression?"; all 11 would, so no test was
rewritten at a different level. **No integration boundary** — isolated new artifacts only, so no
consuming-surface test is owed (the boundary determination was made at verify-self and re-checked at
verify-human gate (d)).

**One real gap found and closed: the P1.4 doc corrections had NO pin.** They were verified by a
one-off `grep` and nothing held them. That class of claim matters here — a future reader trusting
*"never read or written"* will mis-plan, which is **exactly how task 4b.1 came to be written on a
false premise**. Added `the_retired_drive_mode_doc_claims_do_not_come_back` (12th test).

⚠️ **The new guard FAILED on its first run, and that failure was correct.** The phrase survives (as
an intentional historical quote) in two test docs, so a whole-file scan cannot distinguish a quote
from a live claim. Re-scoped the haystack to the `Project` struct's field docs — the only place the
phrase would be an assertion about current behavior.

⚠️ **A verify-auto detail is corrected by this: `grep -c "Never read or written\|WP15"` returned 0
while a LOWERCASE instance sat at line 628.** The grep was case-sensitive and the quote is lowercase.
**Two independent runs of that grep (mine, then the verify-self subagent's) agreed, and both were
blind the same way** — which is the argument for pinning a claim in a test with an explicit haystack
over re-running a one-off grep. The production field docs were clean throughout; only the *check* was
weaker than reported.

**Three mutants, each applied individually, each confirmed to land in executable code via `sed`
before believing the result** (`[[verify-the-mutation-landed]]`):

| mutant | change | result |
|---|---|---|
| 1 | reinstate `Reserved for Phase 2 (WP15). Never read or written.` in the field doc | FAILS with the actionable message |
| 2 | delete the `LIVE since M12 WP4b` positive claim | FAILS on the anti-vacuity assertion |
| 3 | mis-scope the haystack to a valid-but-wrong 400-byte window | FAILS on the haystack meta-guard |

Mutant 3 is the one worth keeping: a `find`-based window's real failure mode is a **valid but wrong**
slice, which makes every assertion above it vacuous while staying green. The meta-guard asserts the
slice still contains `pub default_drive_mode`.

**Final gates:** `cargo test --all-targets` → **811 pass** / 0 fail · `cargo clippy --all-targets --
-D warnings` → 0 findings · `cargo fmt --check` clean. No test failures, so §3b triage did not apply.

## Notes on phasing (why four phases, not seven tasks)

The WBS lists 4b.1-4b.7 as a flat task list; this plan groups them so each phase has an independently
verifiable observable outcome:

- **4b.1 → Phase 1** (vocabulary must be right before anything reads it — everything downstream
  depends on the strings)
- **4b.2 + 4b.6 → Phase 2** (the env var and its gate are one decision: the gate's *only* mechanism is
  whether the var gets set, per Verdict (c), so splitting them would leave a phase whose outcome is
  "the var is set ungated" — a state we never want to exist, even transiently)
- **4b.3 → Phase 3** (the hook side, where the allowlist is created)
- **4b.4 + 4b.5 → Phase 4** (proof, deliberately its own phase: three mutants + the caller assertion
  are the load-bearing deliverable, and burying them inside Phase 3 invites treating a green suite as
  proof — the exact failure this milestone has paid for five times)
- **4b.7 is a decision, not a task** — recorded in the Problem Statement; there is nothing to build.

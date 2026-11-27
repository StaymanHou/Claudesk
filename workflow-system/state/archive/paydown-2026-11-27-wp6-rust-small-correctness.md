---
drive_mode: autopilot
---

# Feature: paydown-2026-11-27 WP6 — Rust small correctness + copy

**Workflow:** feature
**State:** finalize (complete)
**Completed:** 2026-11-27
**Created:** 2026-11-27
**Source:** `workflow-system/product/backlog-paydown-wbs.md` §WP6 (8 QF items, bodies in `backlog-quality-findings.md`)

## Problem Statement

Eight MINOR review findings in the Rust core, each small, each with a pinning test:
(1) `subprocess::MAX_OUTPUT` carries three meanings (the `run_captured` per-pipe cap, the runner's combined
budget, the runner's per-line limit), so tuning one silently moves the others, and the adjudicator's
"a verdict is a few hundred bytes" reason was lost; (2) the runner cuts an over-long line with no marker;
(3) the truncation note's "the last {shown} follow" implies arrival order (the tail is stdout's, then stderr's);
(4) `announce::apply_trust` re-parses the whole `.claude.json` per row, continue rows included, on the main
thread; (5) the add-time preflight's connect step needs stdout to be exactly one `/…` line, so a chatty
`.zshenv` fails it (the link's pre-connect already tolerates noise via `remote_link::HOME_SENTINEL` +
`parse_home`); (6) a preflight check-script transport failure is labelled `tools` and "stopped early" is
labelled `auth`, whatever step was reached; (7) `remote_ops::confirmed_matches`'s refusal names the same
folder twice when only the record changed; (8) `RemoteUninstallTarget` also feeds Update, so the name
misdescribes it.

**No 3rd-party dependency** (the preflight's ssh target is our own host; no probe needed).
**Backlog high item checked:** the "deleted export across phases" entry is upstream-only; this WP is one
phase and Rust's compiler catches a missed consumer of the rename, but the rename, every consumer and the
arch doc land together in P1.8 anyway.

**Decisions taken without asking (Assumed):**
- A1. Values stay byte-identical (all three caps remain 4 MiB). This WP separates meanings, not sizes.
- A2. The preflight reuses `remote_link::parse_home`, so it inherits its stricter rule: a remote `$HOME`
  with whitespace or `:` now fails at **preflight** instead of at the first open (where the link already
  refuses it). Strictly earlier, never newly-broken.
- A3. The preflight and the pre-connect script print `$HOME` through ONE shared command builder, so the
  sentinel format has one writer and one parser.
- A4. Rename target: `ApprovedRemoteClone` (the finding's suggestion). Historical records (CHANGELOG,
  `state/archive/`, `product/archive/`) are NOT rewritten.
- A5. The `zsh` exit-127 case keeps the `tools` label (zsh IS a missing tool); every other transport
  failure of the check-script exec is labelled `script`.

## Work Tree

- [x] Phase 1: Eight small Rust fixes, each pinned
  **Observable outcomes:**
  - CLI: `pnpm verify:auto` exits 0 (timeout 315000).
  - CLI: `grep -rnw MAX_OUTPUT src-tauri/src` → 0 hits; the three uses read three named constants
    (`run_captured`'s per-pipe cap in `subprocess`, the runner's combined budget and per-line limit in
    `workflow_install/runner.rs`), each documenting its own reason; the adjudicator's run site carries
    "a verdict is a few hundred bytes".
  - CLI: `cargo build` fails if `remote_fs::REMOTE_READ_MAX_BYTES` is raised to ≥ the `run_captured`
    per-pipe cap (a `const` assertion; proven by a temporary mutation, restored by `cp` + `shasum`).
  - CLI: `cargo test read_bounded_line`-family tests pass and pin: an over-long line ends with
    ` […line cut]`; a line of exactly the limit followed by `\n` or `\r\n` has NO marker and strips
    like any other line; an over-long last line with no newline before EOF gets the marker.
  - CLI: the truncation-note tests pin the new wording (no "the last {shown} follow"; it says the
    tail is stdout's last lines, then stderr's).
  - CLI: an `apply_trust` test pins ONE `.claude.json` parse for a map with several restore rows, and
    ZERO trust walks for continue rows (a `#[cfg(test)]` counter in `folder_trust`).
  - CLI: preflight tests pin: rc noise before AND after the sentinel line still resolves `$HOME`; no
    sentinel line → a `connect` failure in plain words; the connect exec's command equals the shared
    builder's output (the same one `pre_connect_script` embeds).
  - CLI: preflight tests pin: a non-127 transport failure of the check-script exec is named `script`;
    "stopped early" is named for the next unreported check (`tools` after nothing, `path` after
    `ok:tools`, `token` after `ok:path`, `auth` after `ok:token`).
  - CLI: `an_uninstall_proceeds_only_on_the_approval_the_operator_confirmed` pins both refusal wordings:
    record-only change → names no folder pair; folder change → names both folders.
  - CLI: `grep -rn RemoteUninstallTarget src-tauri workflow-system/product/arch` → 0 hits.
  - CLI (state-changing: temporary edit of one source file, restored by `cp` + `shasum`): a struct literal
    `ApprovedRemoteClone { … }` added outside `remote_guard.rs` makes `cargo check` fail with `E0451`
    naming the new type (the type-level fence survives the rename).
  - CLI (read-only remote exec, no writes on the host): a throwaway `#[ignore]` test outside the repo tree
    (or deleted before commit) runs `run_preflight(&SshExec, <mini host>, <scratch remote folder>)` →
    every check passes and `resolved_path` is absolute. Read `[[remote-verify-hygiene]]` and
    `[[mini-remote-user-is-stayman]]` first; no Claudesk app is involved.
  - CLI: every pinning test above dies on its own mutant (one mutation at a time, landed in executable
    code, a `test result:` line per run, restored by `cp` + `shasum`).
  **Alignment questions:**
  - The new user-visible wordings, shown verbatim (truncation note, line-cut marker, the two consent
    refusals, the `script` and "stopped early" preflight messages): are these the words you want?
  - (decision, A2) A remote `$HOME` with a space or `:` now fails at "Add remote project…" rather than
    at first open. Fine?
  - [x] P1.1 Split `MAX_OUTPUT` into named constants; restore the adjudicator's reason at its run site; const-assert `REMOTE_READ_MAX_BYTES` < the per-pipe cap; fix `remote_fs`'s doc reference
  - [x] P1.2 `read_bounded_line`: append ` […line cut]` only when line content was discarded (a lone `\n`/`\r\n` remainder is put back, not marked) + tests
  - [x] P1.3 Reword `truncation_note`; update its two tests
  - [x] P1.4 `folder_trust`: parse once (`trusted_folders(text)` + `is_trusted_in(&[..], path)`, with `is_trusted` composed of them); `apply_trust` checks the action first and parses lazily once; counter-pinned test
  - [x] P1.5 Preflight connect: shared `$HOME`-sentinel command builder (used by `pre_connect_script` too) + `remote_link::parse_home`; drop `PRINT_HOME`; tests for noise / no sentinel / shared command
  - [x] P1.6 Preflight check names: `script` for a check-script transport failure; "stopped early" names the next unreported check; update `CheckResult.name`'s doc list; confirm no TS consumer keys on the old names
  - [x] P1.7 `confirmed_matches`: two wordings; pin both in the named test
  - [x] P1.8 Rename `RemoteUninstallTarget` → `ApprovedRemoteClone` in `src-tauri/` + `arch/claude-substrate.md` (grep repo-wide first; history files untouched)
  - [x] verify-auto
    — evidence: `pnpm verify:auto` → exit 0 in 96s (lint 0 errors / 1 pre-existing warning in untouched `XtermPane.tsx`; prettier, tsc, check:link clean; vitest 332 files / 4205 tests passed; cargo fmt --check clean; clippy --all-targets -D warnings clean; cargo test lib 1534 passed, 0 failed)
    — evidence: build-time targeted runs: `cargo test --lib workflow_install::runner` 45 passed; `-- announce folder_trust remote` 397 passed; `remote_cmd` 59 passed; `workflow_install` 193 passed
  - [x] verify-self  (runner subagent; 13/13 outcomes PASS after one cosmetic fix; final `git diff | shasum` = as-built tree)
    - [x] verify:auto — evidence: verify-auto run, exit 0 in 96s; tree unchanged since (shasum 81f7547a…)
    - [x] constants split — evidence: `grep -rnw MAX_OUTPUT src-tauri/src` → exit 1, no output; `CAPTURED_PIPE_MAX` / `OUTPUT_BUDGET` / `MAX_LINE_BYTES` each documented; `run_adjudicator` carries "A verdict is a few hundred bytes."
    - [x] const assertion — evidence: mutant `REMOTE_READ_MAX_BYTES = 4 MiB` → `cargo check --lib` "error[E0080]: … assertion failed: REMOTE_READ_MAX_BYTES < crate::subprocess::CAPTURED_PIPE_MAX as u64"; restored, shasum equal
    - [x] line-cut tests — evidence: the 4 runner tests ok ("test result: ok. 61 passed")
    - [x] truncation-note wording — evidence: `the_tail_is_bounded_in_lines_and_in_bytes_per_stream` ok (literal assert_eq)
    - [x] apply_trust parse-once — evidence: `the_record_is_parsed_once_and_only_restore_rows_are_walked` ok (PARSES==1, WALKS==3)
    - [x] preflight sentinel — evidence: rc-noise / missing-or-unusable home / shared-command tests ok (14 preflight tests ok)
    - [x] preflight check names — evidence: `a_check_script_transport_failure_is_named_script`, `a_script_that_stopped_early_names_the_next_unreported_check` ok
    - [x] consent refusal wordings — evidence: `an_uninstall_proceeds_only_on_the_approval_the_operator_confirmed` ok (both literal strings)
    - [x] rename grep — evidence: `grep -rn RemoteUninstallTarget src-tauri workflow-system/product/arch --exclude-dir=target` → only `claude-substrate.md:323` ("renamed from", deliberate). First run also hit a history note in `remote_guard.rs`'s doc comment (FAILED-cosmetic); dropped in place, re-grepped (see Discoveries SHORTCUT)
    - [x] E0451 fence — evidence: temporary `ApprovedRemoteClone { … }` literal in `remote_ops.rs` → `cargo check --lib` "error[E0451]: fields `clone_dir`, `root` and `record_hex` of struct `ApprovedRemoteClone` are private"; restored, shasum equal
    - [x] live preflight (read-only) — evidence: existing ignored test `live_preflight_against_a_real_host` with `CLAUDESK_TEST_REMOTE_HOST=<user>@<mini-host>`, path `~/claudesk-scratch-remote` → PASS connect/tools/path/token/auth, resolved_path `/Users/<user>/claudesk-scratch-remote`, "test result: ok. 1 passed"; no file edited
    - [x] mutation proofs — evidence: M1–M12 each landed in executable code, each "test result: FAILED", each restored with shasum equal (M12 compiled via `{print_home:.0}`)
    - [x] align: new wordings — evidence: truncation note "[output truncated at 4 MiB; {dropped} later lines were dropped. {shown} of them follow: the last of stdout, then the last of stderr]"; marker " […line cut]"; refusals "The install on the host changed after you reviewed the removal (its install record changed). Nothing was changed; open Uninstall again to review it." / "… (it was {clone_dir}, now {approved}). …"; stopped early "the checks on {host} stopped early, before the {next} check (no result line came back)"; a `script` failure on a dropped link reads "ssh to mini failed (exit 255): Connection to mini closed by remote host." (timeout: "mini did not answer within 30s")
    - [x] align: (decision, A2) — evidence: `$HOME="/Users/a b"` → "mini answered, but the host's home folder \"/Users/a b\" can't carry a socket forward (it must be absolute, with no spaces or ':')"; no check script runs
  - [x] verify-human  (operator: "all good", 2026-11-27)
    - [x] P1.verify-human.1: the new user-visible wordings (truncation note, line-cut marker, two consent refusals, `script` / stopped-early preflight messages) — approved as worded
    - [x] P1.verify-human.2: (decision, A2) a remote `$HOME` with a space or `:` now fails at "Add remote project…" instead of at first open — accepted
  - [x] verify-codify
    Test scope: full — last phase
    — evidence: no new tests needed: every approved behavior is pinned by a build-time test, each mutation-proven at verify-self (M1–M12 + const-assert + E0451). Integration boundary: `add_remote_project`'s body is covered end to end by `remote_cmd::commands::tests::tilde_and_trailing_slash_spellings_add_one_row` (preflight → write, updated to the sentinel answer); the runner's sink by `a_cut_line_reaches_the_sink_marked`.
    — evidence: `pnpm verify:auto` → exit 0 in 68s (vitest 332 files / 4205 tests; cargo test lib 1534 passed, 0 failed)

## Current Node
- **Path:** Feature > complete
- **Active scope:** none (finalized; review MAJOR resolved at finalize by the §H resync, 3 MINOR backlogged)
- **Blocked:** none
- **Unvisited:** none
- **Open discoveries:** none

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->
[SHORTCUT-2026-11-27] P1.verify-self rename-grep — a history note ("it was `RemoteUninstallTarget` until …") in `ApprovedRemoteClone`'s doc comment (`remote_guard.rs`) was the only extra grep hit (cosmetic, comment-only). Dropped in place (the arch doc already records the rename); re-verified by re-running the outcome's exact grep → only the deliberate `claude-substrate.md:323` hit, and `cargo fmt --check` clean.

## Code-Quality Review

*(feature-review-quality, ship commit `7f14181`, window `d26df84..7f14181`; drive_mode=autopilot → MAJOR + MINOR auto-backlogged under `# paydown-2026-11-27-wp6-rust-small-correctness — 2026-11-27` in `backlog-quality-findings.md`, pointer in `backlog.md`.)*

### Strengths
- One writer / one parser for the `$HOME` sentinel (`remote_link::print_home_command` + `parse_home`), shared by the preflight and `pre_connect_script`, with a test asserting both use the same command.
- The constant split is real separation: `CAPTURED_PIPE_MAX`, `OUTPUT_BUDGET`, `MAX_LINE_BYTES` each document their own reason and dependents; `remote_fs` gained a compile-time assertion.
- `read_bounded_line`'s edge cases are pinned exactly (terminator-only overflow incl. a `\r` split across chunks, one-byte cut, over-long last line at EOF, exactly-the-limit), plus an end-to-end real-pipe test.
- User-visible strings pinned with literal `assert_eq`; every pin mutation-proven; the `E0451` fence re-proven after the rename.
- `apply_trust` checks the action first and parses once, pinned by per-thread counters; `is_trusted` stays a thin composition.

### Issues
**CRITICAL**
- (none)

**MAJOR**
- [`workflow-system/product/arch/remote-workspaces.md` §H "WP2 as-built"] still says the first preflight exec is `printf '%s' "$HOME"`, and omits the A2 `$HOME` rule and the `script` check name. The `arch/` set is the as-built authority, so it now contradicts the code on exactly what this WP changed. → `SURFACE-2026-11-27-QUALITY-WP6-ARCH-H-STILL-DESCRIBES-PRINT-HOME`

**MINOR**
- [`remote_fs/mod.rs` const assertion] weaker than its comment ("plus its answer framing"): passes at 4 MiB − 1. → `…-WP6-REMOTE-READ-ASSERT-WEAKER-THAN-ITS-COMMENT`
- [`remote_cmd/preflight.rs` `CheckResult.name` doc] omits the zsh-127 → `tools` exception. → `…-WP6-CHECKRESULT-NAME-DOC-OMITS-ZSH-127`
- [`subprocess/mod.rs` and five other doc lines] "an [`RunError::OutputTooLarge`]" → "a"; over-long doc lines left by the rename. → `…-WP6-RENAME-LEFT-LONG-DOC-LINES`

### Assessment
A well-built paydown: each of the eight findings is fixed at the right layer (shared helpers, a compile-time assertion, a type fence kept through the rename), each pinned by a mutation-proven test. The one real gap is documentation drift in `arch/remote-workspaces.md` §H; the rest is wording polish.

### If you disagree
Edit this section and mark a finding `[DISMISSED]` before `feature-finalize` archives the WIP.

## Retrospect
- **What changed in our understanding:** the run_captured per-pipe cap had a fourth dependent the finding never named: `remote_fs`'s remote read rides one exec's stdout, so `REMOTE_READ_MAX_BYTES` was coupled to it (now a const assertion). The runner's tail byte cap evicts a 64 KB-sized cut line as soon as any later line arrives, so an end-to-end marker test must end on the cut line.
- **Assumptions that held:** all eight fixes stayed behavior-preserving outside their own pins; one phase was enough; the compiler caught every rename consumer and the `E0451` fence survived it; the preflight could reuse the link's `parse_home` as-is (the stricter `$HOME` rule was accepted by the operator).
- **Assumptions that were wrong:** the existing truncation-note tests compared the note against `truncation_note()` itself (tautological), so the wording change needed a new literal pin, not "update its two tests". A history note in a doc comment tripped the plan's own zero-hit rename grep (cosmetic, fixed in place). The as-built §H in `arch/remote-workspaces.md` described the retired connect exec; the plan named only `claude-substrate.md` (the review caught it; resynced at finalize).
- **Approach delta:** `read_bounded_line` grew terminator-aware handling (a lone `\n`/`\r\n` past the limit is put back, not marked) that the finding did not ask for, because a naive marker would have flagged whole lines. `folder_trust` gained `trusted_folders` + `is_trusted_in` and a generic `trust_covers`. The live preflight used the repo's existing ignored `live_preflight_against_a_real_host` (env-var host) instead of a throwaway test.

**Closure:** Requester = operator — closure notice for self-record. **Feature complete:** paydown-2026-11-27 WP6 has shipped (`7f14181`): eight small Rust correctness and copy fixes (separate output caps, a marked line cut, honest truncation and refusal wording, a parse-once trust check, a noise-tolerant preflight with true check names, and the `ApprovedRemoteClone` rename). Each is pinned by a mutation-proven test; see the Work Tree's verify-self evidence.

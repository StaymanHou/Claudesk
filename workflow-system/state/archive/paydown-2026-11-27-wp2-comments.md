---
workflow: task
state: close (complete)
completed: 2026-11-27
created: 2026-11-27
drive_mode: autopilot
docs-only: false
---

# Task: paydown-2026-11-27 WP2 — comments and docs only

**Workflow:** task
**State:** Completed (2026-11-27)
**Created:** 2026-11-27

## Problem Statement
Fix the comment/doc MINORs the sweep groups under WP2 (stale, false, history-laden or
label-citing comments) without changing one executable token.

## Context
- `workflow-system/product/backlog-paydown-wbs.md` §WP2, Defaults D4/D5/D6/D10
- Proof method: `[[prove-comments-only-diff-via-parser-tokens]]` (TS leaf tokens with JSDoc
  filtered, plus a positive control); Rust: no changed non-comment line in `git diff -U0`.
- `docs-only: false`: these are source files, so verify runs the token proof + `pnpm verify:auto`.

## Work Tree

- [x] T1 Picker comments: QF WP5-ANNOUNCEROW-HEADER, QF WP5-PICKERROW-COMMENT, QF PANEL-COMMENT-SAYS-ONE-CHILD (App.css)
- [x] T2 History/label comments: QF M17WP2-HISTORY-NOTES, QF M17WP3-WIP-LABELS (+WP5 update; reword to decision content, D10)
- [x] T3 Stale/wrong docs: QF M17WP4-BRITTLE-PIN (docs half), QF M17WP5-STALE-ANNOUNCE-REMOTE-COMMENT, QF M17WP5-DISPLACED-DOC-BLOCKS (D5), QF M17WP5-SESSION-EXISTS-RECORD-COMMENT (D6), QF XTERMPANE-LIFECYCLE-FLAG-BLOCK, QF STUB-RELAUNCH, QF CC-SESSION-DOC-LINE-WIDTH, QF SUBSTRATE-SINK-SETTER (doc), QF REMOTE-PREFLIGHT-NO-CALLER (D4), QF WP6-DOCS-STILL-NAME-SPAWN-BLOCKING (docs half), BL PRUNE-COMMENT
- [x] T4 Comments-only proof (TS token diff + positive control; Rust non-comment-line check) and `pnpm verify:auto`

## Current Node
- **Path:** Task > closed
- **Active scope:** none (archived)
- **Blocked:** none
- **Open discoveries:** none

## Verification Observable

**Observable:** every changed TS/TSX file has the same parser leaf tokens as HEAD (JSDoc filtered), every changed Rust line outside `//` comments is one of the planned `ASYNC_COMMANDS` reason strings, and the full gate passes.
**Verification command:** `node <scratchpad>/tokdiff.cjs <changed .ts/.tsx>`; `git diff -U0 -- '*.rs' | grep -E '^[+-]' | grep -vE '^(\+\+\+|---|[+-]\s*//)'`; `pnpm verify:auto`
**Expected result:** tokdiff exit 0 on all 7 files AND exit 1 on a positive control; only reason-string residue in the Rust diff; `verify:auto` EXIT=0.

## Verification Result

**Status:** PASS
**Date:** 2026-11-27
**Evidence:** tokdiff: `same` for all 7 files (PickerRow 860, ProjectPicker 2888, announceRow 393, Workspace 4693, XtermPane 2531, liveWorkspace 1750, injectFailure 72 tokens). Positive control (`"handoff"` → `"Xhandoff"` in `injectFailure.ts`): `DIFF … at token 46`, exit 1, restored by `cp` + `shasum`. (A first control targeted a string that only appears in comments and did not land; caught by its `grep -c` = 0.) Rust residue: only the 19 `ASYNC_COMMANDS` reason strings. CSS: comment lines only. `pnpm verify:auto` EXIT=0 in 90 s.

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->

## Retrospect
- **What changed in our understanding:** the WIP-label finding was smaller than its "~65 lines" (later WPs had already scrubbed some); the older M12/M13.5 node labels in `cc_session/mod.rs` predate the finding and were left, and that is recorded on the surviving entry.
- **Assumptions that held:** every item was comment-only; the token diff proved it and no `?raw` guard anchored on a removed comment (the full suite stayed green).
- **Assumptions that were wrong:** WP1 had not decremented the m17-wp3 group stub when it buried a finding; fixed here. Two of my edits joined a following sentence onto a doc line (status broadcaster); caught by a width check and rewrapped.
- **Approach delta:** the `ASYNC_COMMANDS` reasons changed as test strings (planned residue); the `remote_preflight` doc names `add_remote_project` as the real path.

**Closure notice:** Requester = operator — closure notice for self-record. Paydown WP2 is complete: 13 findings and 1 SURFACE closed, 3 findings narrowed to their WP3/WP4 halves.

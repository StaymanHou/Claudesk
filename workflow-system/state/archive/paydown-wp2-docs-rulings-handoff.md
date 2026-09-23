---
workflow: task
state: close (complete)
completed: 2026-09-23
created: 2026-09-23
docs-only: false  # two edits are COMMENTS inside source files (a Rust doc comment, a TS test comment); no runtime effect, but they pass through rustfmt/prettier/rustdoc, so verify runs the real gate
drive_mode: autopilot
---

# Task: Paydown WP2 — Local docs, lessons, rulings, and the mccc handoff

**Workflow:** task
**State:** Completed 2026-09-23
**Created:** 2026-09-23

## Problem Statement
Ten backlog entries are resolved by writing something down that is not yet written: a verification lesson, a doc warning, an operator ruling, or a path fix. Thirteen more are upstream mccc work with no consolidated handoff. So they stay open as backlog clutter, and the next session re-derives them.

## Context
- Scope: `workflow-system/product/backlog-paydown-wbs.md` §WP2 + §Rulings R4.
- Entries resolved by this WP (each deleted with a `**Backlog resolved:**` line once its doc lands):
  - `SURFACE-2026-09-21-MACOS-TEXT-INPUT-SERVICES-DEAD-UNDER-TAURI-DEV` (9)
  - `SURFACE-2026-09-13-AGENT-LAUNCHED-CC-CANNOT-PRODUCE-A-REAL-HOOK-EVENT` (15)
  - `SURFACE-2026-08-21-OSASCRIPT-CANNOT-SAFELY-ADDRESS-THE-DEV-BUILD` (30)
  - `SURFACE-2026-08-14-SESSION-RESTORE-USAGE-FIGURE-SPANS-TWO-COMMAND-NAMES` (34)
  - `SURFACE-2026-08-04-CC-READY-NAME-INVITES-MISREADING-AS-CC-READINESS` (39)
  - `SURFACE-2026-09-17-SETTINGS-PANEL-READS-THE-GATE-VIA-ITS-OWN-CONTROL-NOT-THE-HOOK` (61)
  - `SURFACE-2026-09-17-STALE-WORKFLOW-PATHS-SURVIVE-THE-LAYOUT-MIGRATION` (58)
  - R4 rulings: `SURFACE-2026-08-03-TYPED-EXIT-LEAVES-THE-UNCLEAN-FLAG-SET` (40), `SURFACE-2026-07-31-NO-REACT-COMPONENT-RENDER-HARNESS` (46), `SURFACE-2026-08-18-DEV-PROFILE-PERMISSION-MODE-BLOCKS-SKILL-WRITES` (32)
- Doc homes: `docs/lessons/verify-self-tiers.md`, `docs/lessons/mcp-tauri-bridge-caveats.md`, `docs/lessons/source-text-guards.md` (the render-harness authority), `workflow-system/product/arch/session-resumption.md` (unclean flag), `workflow-system/product/arch/workflow-gate.md` (gate seam), `src-tauri/src/cc_session/commands.rs` (`cc_ready`), `src/state/__tests__/offInvariantGuard.test.ts` (guard comment), `.claude/memory/`.
- mccc handoff: model on `HANDOFF-to-mccc-m15-wp2.md` / `-m15-wp4.md`. ⚠️ **Do NOT edit mccc** (`_ref/` and `~/.claude/skills/` are symlinks into it). Upstream entries stay OPEN, re-anchored to the handoff. Writing the handoff resolves none of them.
- ⚠️ **Re-check before writing:** `[[doc-correction-scope-list-is-a-floor]]`. Grep each claim repo-wide rather than trusting the named site. And a ruling that says "document X" must land where a future reader of that code will look, not only in the backlog.

## Work Tree

- [x] T1 Verification lessons: (9) text-input services dead under `tauri:dev` → `verify-self-tiers.md`; (15) the hook-socket injection technique → `verify-self-tiers.md` / bridge caveats; (32, R4) dev-profile permission-mode check-this-first line
- [x] T2 (30) The osascript/dev-build rule: "drive dev only via the MCP bridge", with the `quit-requested` trigger → lessons; amend `[[verify-self-dev-vs-prod-process-name-collision]]`
- [x] T3 (34) The renamed-skill usage-count trap → a lessons home (measurement method)
- [x] T4 Code-adjacent notes: (39) a ⚠️ on the `cc_ready` doc comment + arch; (61) the gate-seam contract ("use the hook UNLESS the component owns the control") → `arch/workflow-gate.md` + the OFF-invariant guard comment
- [x] T5 R4 rulings: (40) record "typed `/exit` is not a clean exit; the flag resolves at the next close" in `arch/session-resumption.md`; (46) record the formally-accepted posture in `source-text-guards.md`'s render-harness note
- [x] T6 (58) Fix stale `workflow/` paths in 3 memories (leave the quoted historical note in `widened-selector…`); PII audit of every touched memory
- [x] T7 Write `HANDOFF-to-mccc-2026-09-23-paydown.md` (13 upstream items + O2); re-anchor each upstream entry's Status to it
- [x] T8 CHANGELOG `**Backlog resolved:**` lines + delete the 10 resolved entries; update the WBS

## Current Node
- **Path:** Task > close (complete)
- **Active scope:** none (archived)
- **Blocked:** none
- **Open discoveries:** 3 (below), folded in place; plus the SURFACED red gate (logged)

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->
[SURFACED-2026-09-23] T1 — the inventory's claim that `tooling/autofire-timing/probe.py` "already talks to `hook.sock`" is FALSE: the file only mentions the socket in a print string. The lesson now says no helper exists yet.
[SURFACED-2026-09-23] T7 — upstream `feature-review-quality` §1 now computes the base as `main..HEAD`, with a fallback to the WIP file's earliest commit. On this always-on-`main` project that means always the fallback, so the entry's diagnosis still holds. Folded into the handoff §C.7.
[SURFACED-2026-09-23] T7 — the handoff covers 12 backlog entries + 1 finding. The WBS's "13 + O2" included F10B, which mccc already fixed (`07ff3ba`).

## Verification Observable

**Observable:** the two source-file comment edits (`cc_session/commands.rs` doc comment, `offInvariantGuard.test.ts` comment) pass the project's full per-phase gate. That covers rustfmt, clippy `--all-targets`, prettier, eslint, tsc and both test suites, and the OFF-invariant guard still passes with its edited allowed-getter comment.
**Verification command:** `pnpm verify:auto`
**Expected result:** exit code 0

## Verification Result

**Status:** PASS for this task's changes. SURFACED-sibling-bug (a pre-existing red gate) logged to the backlog.
**Date:** 2026-09-23
**Evidence:** `pnpm verify:auto` → `EXIT=1` at step 2: `[warn] src-tauri/tauri.conf.json` / `Code style issues found`. **That file is not touched by this task**, and its unformatted array was introduced by `08f2db5` (Release v0.6.0). Every gate step then run individually on this tree: `prettier --check` on every changed/new file → `All matched files use Prettier code style!` (exit 0); `eslint` exit 0 (1 pre-existing warning, `XtermPane.tsx:898`); `tsc --noEmit` exit 0; `vitest` exit 0, `Test Files 218 passed (218)`, `Tests 2960 passed (2960)` (includes the OFF-invariant guard whose comment was edited); `cargo fmt --check` exit 0; `cargo clippy --all-targets -D warnings` exit 0; `cargo test` exit 0, 920 passed / 0 failed. Wall 107s.
**Notes:** the observable as stated (the whole gate exits 0) cannot pass on this tree for a reason outside the task. So each constituent step was run against the task's changes, and all passed. The §4b in-place shortcut was NOT taken: the fix is in a different file and a different bug family (a release-time formatting regression). Logged as `SURFACE-2026-09-23-VERIFY-AUTO-RED-ON-MAIN-SINCE-THE-V0.6.0-RELEASE-COMMIT` (high), scheduled as WP3's first step.

## Retrospect
- **What changed in our understanding:** the per-phase gate had been **red on `main` since the v0.6.0 release commit**, and nothing noticed, because this project has no CI and no hook. A WP that runs `verify:auto` as its observable inherits whatever state `main` is in. So a "the gate exits 0" observable really asserts about the whole tree, not about the task.
- **Assumptions that held:** each doc landed where a future reader of that code would look. The `cc_ready` warning sits on the command itself, the `/exit` ruling in the unclean-flag section, the render-harness posture in the note 29 files cite, and the gate exception both in arch and at the guard's allow-list.
- **Assumptions that were wrong:**
  - Two inventory claims failed a live check: `probe.py` does not speak to the hook socket, and the upstream count was 12 + 1, not 13 + 1.
  - The upstream review-quality window had changed (`main..HEAD` with a WIP-file fallback) since its entry was filed, although the diagnosis still holds on this always-on-`main` project.
  - The `cc_ready` arch half and the Settings guard's exemption comment were already partly done, so each needed a sentence, not a section.
- **Approach delta:** verification split the gate into its constituent steps when the whole-gate command failed for an unrelated reason, rather than either accepting red or fixing an out-of-scope file under the §4b shortcut (whose same-file / same-bug-family gate did not hold).

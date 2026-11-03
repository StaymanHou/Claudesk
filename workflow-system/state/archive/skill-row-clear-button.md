---
workflow: task
state: close (complete)
completed: 2026-11-03
created: 2026-11-03
docs-only: false
---

# Task: Add a `/clear` button to the skill row, before `restore`

**Workflow:** task
**State:** Completed 2026-11-03
**Created:** 2026-11-03

## Problem Statement
The workspace header's skill row offers `restore` but not the `/clear` that almost always precedes it, so the commonest in-session flow (`/clear` → `/session-restore`) still needs typing; add a `clear` button immediately before `restore`.

Problem statement unchanged after the T6 back-loop — only WHERE the gate applies changed (the guard showed `/clear` must not be gated), not what the operator sees with the gate on.

## Context
- Operator request 2026-11-03 (screenshot of the header row: `start restore capture prune paydown recycle`). Asked while waiting on mccc's drive-mode picker Phase 2.
- `src/components/workspace/skillButtons.ts`: `SKILL_BUTTONS` (the fixed set; its own header records `/clear` = 333 typed, overwhelmingly followed by `/session-restore` inside an already-open session). `fireSkillCommand` is the one send funnel; `Workspace.tsx` renders `SKILL_BUTTONS.map(…)`, so adding a member needs no render change.
- Tests pinning the set: `__tests__/skillButtons.test.ts` (exact membership + order; `toHaveLength(5)`; the regex `^\/[a-z0-9-]+$` accepts `/clear`; every title must name its command; the live-caller test drives every member through the funnel).
- `src/state/__tests__/readmeTierOneHonesty.test.ts`: tier-2 README must name every shipped command AND name no backticked slash command the row doesn't ship → README line 339 must gain `/clear`.
- "Five" count sites: `skillButtons.ts` doc, `App.css` `.workspace-skill-row` comment, `README.md:339`, `docs/lessons/closed-cycles-m13-m13-5.md` item 1, `CLAUDE.md` M13 bullet ("the fixed-five skill row"). Historical records (`roadmap.md` M13 row, CHANGELOG) stay as written.
- The OFF-invariant guard's arm 5 iterates `SKILL_BUTTONS` with `showSkillButtons(…, false)`; a new member is covered automatically.

## Decisions taken without asking (autopilot; disclose at close)
- ~~**Gated with the row.**~~ **REVERSED at act (T6 back-loop, 2026-11-03):** `offInvariantGuard.test.ts` → "every member of the row is a COMPANION-workflow skill — licensing the wholesale gate" failed on `/clear`. The recorded design: a stock CC command serving every user must NOT be gated with the row; split it out per arm 4's precedent (its non-vacuity test even names `/clear`). So `/clear` is its OWN ungated button (`clearButton.ts`), NOT a `SKILL_BUTTONS` member: gate ON it renders inside the row immediately before `restore` (what the operator sees is unchanged); gate OFF (or a non-default profile) it renders alone in the header.
- **No confirm dialog.** `/clear` is instant when typed (333×), and the old conversation stays resumable via CC's `/resume`. The row's other buttons don't confirm either.
- **Label `clear`, title names `/clear`.** Fires through the same `fireSkillCommand` → `injectCommand` funnel.

## Work Tree

- [x] T1 ~~Add `/clear` to `SKILL_BUTTONS`~~ superseded by T1b (guard refuted the gating)
- [x] T1b Revert the `SKILL_BUTTONS`/test/README/lessons/CLAUDE.md "six" edits; add `clearButton.ts` (`CLEAR_COMMAND`, label, title, testid, ungated `showClearButton({ccSessionId})`)
- [x] T2b Render it in `Workspace.tsx`: inside the gated row right before the `/session-restore` button; standalone when the row is absent
- [x] T3b Tests: `clearButton.test.ts` (predicate ungated; funnel sends `/clear\r`) + a live-mount test (gate ON → `start, clear, restore, …` order inside the row; gate OFF → `clear` present, row absent); update the guard's arm-5 header prose ("NO ungated half") to point at the split-out
- [x] T4b Docs: README tier-1 names the `clear` button (tier-2 must NOT backtick `/clear` — `readmeTierOneHonesty`); `App.css` count comment; lessons item 1 + CLAUDE.md note that `/clear` is split out ungated
- [x] T5b `pnpm verify:auto`; live check in a dev build (gate ON order + click clears the session)

## Current Node
- **Path:** Task > verify (complete)
- **Active scope:** all complete, ready for close
- **Blocked:** none
- **Open discoveries:** none

## Discoveries
- [2026-11-03] T5b — `mediaTabLive.test.tsx` image test flaked once in the full gate and once ISOLATED (then 3/3 passes); not this change. Folded into the existing `SURFACE-2026-10-26-MEDIATABLIVE-FLAKES-UNDER-FULL-SUITE-LOAD` rather than a new entry.

## Evidence (act)
- `pnpm verify:auto` EXIT=0 (282 files / 3676 tests; cargo 1094 passed).
- `clearButtonLive.test.tsx` 6/6; three mutants each killed (clear after `capture` → order test; standalone always → exactly-one test; `workflowEnabled &&` gate → 3 gate-OFF/profile tests).
- Live dev build: scratch-c (gate ON) row = `start clear restore capture prune paydown recycle`; a click cleared the session (`Ctx Used` 10.0% → 0.0%, new transcript `6bd8b25b…` opening on `/clear`). scratch-a (non-default profile, row absent): `clear` alone in the header.

## Verification Observable

**Observable:** With the gate ON the header renders `clear` inside the skill row immediately before `restore`; with the row absent (gate OFF / non-default profile) `clear` renders alone; a click delivers exactly `/clear⏎` to that workspace's session, and in a live dev build CC actually executes it.
**Verification command:** `./node_modules/.bin/vitest run src/components/workspace/__tests__/clearButtonLive.test.tsx src/state/__tests__/offInvariantGuard.test.ts src/state/__tests__/readmeTierOneHonesty.test.ts src/components/workspace/__tests__/skillButtons.test.ts` (real `Workspace` mounted under jsdom with `mockIPC`), plus `grep -c 'command-name>/clear<'` on the transcript the live dev-build click produced (`scratch-c/6bd8b25b-….jsonl`).
**Expected result:** vitest exit 0 with all tests passing; the transcript grep returns ≥1.

## Verification Result

**Status:** PASS
**Date:** 2026-11-03
**Evidence:** `Test Files  4 passed (4)` / `Tests  78 passed (78)`, exit=0. Transcript grep: `1`. Live dev build (same session, before teardown): scratch-c row `["start","clear","restore","capture","prune","paydown","recycle"]`, one `clear`; after the click the footer read `Ctx Used: 0.0% | Cost: $0.00` (was 10.0%); scratch-a header showed `scratch-a  clear` with no row. Full `pnpm verify:auto` EXIT=0 (3676 vitest, 1094 cargo).
**Notes:** Both placements and execution confirmed end to end; the three mutants of the placement logic were each killed by the live-mount tests.

## Retrospect
- **What changed in our understanding:** `/clear` cannot be a `SKILL_BUTTONS` member. The row is gated as a whole, and the OFF-invariant guard allows that only while every member is a companion-workflow skill; a stock CC command must be split out ungated (its non-vacuity test names `/clear` explicitly).
- **Assumptions that held:** placement before `restore` (the `/clear` → `/session-restore` flow the row's own notes measured); one send funnel (`fireSkillCommand`); no confirm dialog.
- **Assumptions that were wrong:** the plan's "gated with the row, cheap to reverse" default. The guard caught it on the first `verify:auto`, which forced a T6 back-loop.
- **Approach delta:** a new `clearButton.ts` plus one button rendered in one of two places in `Workspace.tsx` (inside the row before `restore`, or standalone) instead of a one-line array addition. README now names it in tier 1 rather than tier 2. Gate-ON appearance is exactly what was asked.

**Closure notice:** Requester = operator — closure notice for self-record. The workspace header now has a `clear` button immediately before `restore` that runs `/clear` in one click, and it stays available with workflow features off. Visible after the next `/release` (or now in `pnpm tauri:dev`).

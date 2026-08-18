---
workflow: task
state: verify (complete)
created: 2026-08-18
docs-only: false
drive_mode: autopilot
---

# Task: Paydown WP3 — reconcile conflicting precedents + the containment story

**Workflow:** task
**State:** verify (complete)
**Created:** 2026-08-18

## Problem Statement

Six filed "contradictory precedent" pairs plus the D2 ruling — each supposedly leaving the next
consumer inheriting two opposite rules; three turn out to be genuine, two are deliberate and
correct, and one is a real behavioral gap rather than a documentation one.

## Context

**Parent WBS:** `workflow-system/product/backlog-paydown-wbs.md` → WP3
(`[impact: Med-High · effort: S · risk: Low]`). Rated the theme **most likely to produce a FUTURE
defect** rather than describe a present one. Resolves T4 (6 items) + T8's `arch` half + D2.

**Baselines:** `cargo test` **845** · `pnpm test` **2118** / 165 files.

⚠️ **`docs-only: false`.** Item 5 is a **behavior change** (surfacing a swallowed error), so this
WP is not purely documentary — unlike WP2. Item 6 is a one-line control-flow change.

### Discovery: 3 GENUINE · 2 REFUTED · 1 BEHAVIORAL

⚠️ **Third consecutive WP where the filings needed correction.** Per
`[[backlog-finding-carries-an-implicit-as-of-date]]`. The refutations here are a *different* kind
from WP1/WP2's, and the distinction matters: these two are not stale or misfiled — they are
**deliberate decisions with their reasons written at the site**, which a sweep would have
"reconciled" into a genuine regression.

**GENUINE (3):**

- **D2 — the containment story.** `cc_spawn_env`'s doc (`cc_session/mod.rs:492-493`) says
  `color_tty_env` "is shared with the raw login-shell spawn, **which must never receive this
  var**", and `:575` calls it "the **CC-only** `CLAUDESK_DRIVE_MODE`". Both are true of the
  *sibling* shell spawn but imply a containment the code does not provide: **no `env_clear`
  exists anywhere** (grep-confirmed), so the var reaches CC's **entire descendant chain** —
  including a nested `claude`. ⚠️ **Per the D1/D2 ruling that is CORRECT, not a defect** (a nested
  `claude` in a workspace IS working on that project). ⚠️ **Do NOT add `env_clear()`** — it strips
  `PATH`/`LANG`/`TERM` and breaks both the M10.5 mojibake fix and the GUI-PATH spawn fix.
  Documentation-only.

- **Render-phase ref writes** — a real contradiction, and the filing UNDERSTATES it.
  `Workspace.tsx:193-196` documents render-phase ref assignment as an eslint **ERROR** that
  "caught this", while `XtermPane.tsx:280` (`handleRelaunchRef`) and `:302` (`fitAndResizeRef`)
  both do it. Verified by indentation: both sit at **indent 4 = the component body**.
  ⚠️ **And `XtermPane`'s own comment miscites its precedent** — `:279` says "mirroring
  `fitAndResizeRef.current = fitAndResize` below" and elsewhere the pattern is attributed to
  `onSessionIdRef`, but `onSessionIdRef` (`:258`) is written **inside a `useEffect`** (indent 6).
  ⚠️ **eslint does NOT currently flag `:280`/`:302`** (`pnpm lint` reports only the pre-existing
  `:616` exhaustive-deps warning), so `Workspace.tsx`'s "it caught this" is about *its own* site.
  Reconcile by naming which rule governs where.

- **Escape-branch asymmetry** — real. `App.tsx:370-374` (dashboard chord) returns; the
  `e.key === "Escape"` block (`:379-396`) does **not**, falling through to `isSettingsChord(e)`
  at `:403`. ⚠️ **Harmless today, VERIFIED**: `isSettingsChord` requires `e.key === ","`
  (`settingsChord.ts:39`), which Escape can never satisfy. So this is a latent trap, not a live
  bug — the fix is a `return` plus a sentence, and the sentence matters more than the `return`.

**REFUTED (2) — do NOT "reconcile" these; the duplication/second-listener is deliberate:**

- **Per-workspace `fs-change` listeners — REFUTED.** The filing says `m11-wp4` added a second
  listener while `RightPanelHost.tsx:315-317` documents "reuse the single listener." **That claim
  does not exist there.** The nearest real text is `RightPanelHost.tsx:204`, and it is about
  **`usePipMode`** — an app-*global* value where N per-workspace subscriptions were genuinely
  redundant (`SURFACE-2026-06-27-QUALITY-WP5-PIPMODE-STATE-DUP-PER-WORKSPACE`). `fs-change` is a
  **per-workspace broadcast** whose consumers each filter via `appliesToWorkspace`; three
  listeners exist by design (`RightPanelHost.tsx:281`, `DocsPanel.tsx:443`,
  `recycleSession.ts:254`). **Two different events with different cardinality — no contradiction.**
  Worth one clarifying sentence so the next reader does not re-file it.

- **`hook_pl_output.rs::expected_context()` duplication — REFUTED.** Its doc (`:409-411`) already
  states the reason: transcribed as a literal *"rather than built from a format string shared with
  the script, so a drift in either one shows up as a test failure instead of two mirrors agreeing
  with each other."* That is this repo's **independent-transcription** discipline, the same reason
  `config_store`'s wire strings are transcribed from `transitions.md` rather than round-tripped.
  ⚠️ **Sharing the literal would DESTROY the test's value** — it is the one thing that catches the
  script drifting. No edit.

**BEHAVIORAL (1) — the only real code change in this WP:**

- **Error-surfacing asymmetry — CONFIRMED, and it is a behavior gap, not prose.** The initial docs
  fetch surfaces failures (`DocsPanel.tsx:202` → `setError(String(e))`); the **reload** path's
  `.catch()` (`:429`) is **empty**, with the rationale *"a failed refresh leaves the current list
  in place rather than blanking the panel."* That reasoning is right for a **transient** failure
  and wrong for a **persistent** one: a permanently-unreadable doc dir reads as *"nothing is
  changing."* ⚠️ **Keep the keep-what-they-had behavior** — do not blank the panel. Surface the
  error *alongside* the retained list.

## Work Tree

- [x] T1 D2: correct the containment story at `cc_spawn_env` + `:575`  <!-- status: complete -->
- [x] T2 Reconcile the render-phase-ref-write rule across both files; fix the miscited precedent  <!-- status: complete -->
- [x] T3 Surface the swallowed `docs_list` reload failure while KEEPING the list (behavior change + guard)  <!-- status: complete -->
- [x] T4 Add the missing `return` to the Escape branch + state why the fall-through was harmless  <!-- status: complete -->
- [x] T5 Record the 2 refutations at their sites  <!-- status: complete -->
- [x] T6 Gate  <!-- status: complete -->

## What changed (4 edits · 2 refutations recorded · 1 behavior change + guard)

| Item | Disposition |
|---|---|
| D2 — containment | `cc_session/mod.rs`: added a precise containment paragraph — the boundary is **CC-spawn vs sibling login-shell spawn**, NOT around CC. No `env_clear` exists, so the var reaches CC's whole descendant chain, and **that is intended**. Explicit "do NOT tighten with `env_clear()`" naming both regressions it would cause (M10.5 mojibake, GUI-PATH). Also narrowed "the **CC-only** var" → "the **CC-side** var" at `:575` |
| Render-phase refs | Reconciled with a **discriminator** rather than a blanket rule: an *imperative-handle forwarding ref* (`handleRelaunchRef`, `fitAndResizeRef` — never read during render) may be written on render; a *latest-value ref* (`ccSessionIdRef` — polled by a long-lived closure) must go in an effect, because a render-phase write can land for a render React discards. Both files now point at the discriminator. ⚠️ Also **fixed a miscitation**: `XtermPane` cited `onSessionIdRef` as a render-phase precedent, but it is written inside a `useEffect` (indent 6 vs 4) |
| Escape branch | Added the missing `return` + why it was harmless (`isSettingsChord` needs `e.key === ","`). Framed as removing a **trap for the next predicate added below it**, not fixing a live bug |
| `fs-change` listeners | **REFUTED** — clarifying sentence added at `RightPanelHost.tsx`. The one-listener rule is about **app-global** values (`usePipMode`); `fs-change` is **per-workspace** and its 3 listeners are correct. Discriminator recorded as CARDINALITY |
| `expected_context` | **REFUTED** — note added at `hook_pl_output.rs`. Sharing the literal would **destroy** the test's only value; the duplication rule governs rationale prose, not an independently-transcribed expected value |
| Docs reload swallow | **BEHAVIOR CHANGE.** New `reloadNote` state (mirroring the existing `linkNote` precedent) surfaces the failure **above** the retained list. ⚠️ Deliberately NOT `setError` — `docsView` ranks `error` above the list, so reusing it would blank a readable panel, trading a silent failure for a destructive one |

## Verification Observable

**Observable:** the new reload-error surfacing is pinned by a guard that goes RED on (a) the
original empty `.catch`, (b) the destructive `setError` variant, and (c) deletion of the render
site — each proven individually — while the unmutated tree passes the full gate.

**Verification command:** three mutations of `DocsPanel.tsx`, run individually, each confirmed to
land in executable code and reverted after; plus the full gate.

**Expected result:** each mutant → 1 failed test naming this guard; pristine tree → 2119 pass.

## Verification Result

**Status:** PASS
**Date:** 2026-08-18
**Evidence:**
- **⚠️ The FIRST version of this guard was mutation-REFUTED and rewritten.** It asserted the bare
  identifier `setReloadNote(`, which is satisfied by the `useState` **declaration** (`:164`) and by
  the success path's `setReloadNote(null)` (`:376`) — so it **passed with the entire catch body
  reverted to the shipped defect** (2119 pass, mutation confirmed landed). This is
  `[[raw-guard-identifier-satisfied-by-own-comments]]` in its declaration-vs-use variant. Rewritten
  to assert the surfacing **call shape with its argument** (`setReloadNote(\`Could not refresh the
  doc list:`), which only the surfacing site has.
- **MUTANT A** (revert to empty `.catch`) → **RED**, 1 failed / 2118 pass. Landed: `setReloadNote`
  reduced to declaration + clear only.
- **MUTANT B** (swap the note for `setError(String(e))` — the destructive variant) → **RED**.
  Landed: two `setError(String(e))` sites (`:214` initial, `:451` reload).
- **MUTANT C** (delete the render site only, so the note is computed but never shown) → **RED**.
  Landed: `docs-reload-note` count 0.
- Each mutant reverted from a pristine copy; final `diff` vs pristine **IDENTICAL**.
- **⚠️ `pnpm format:check` FAILED on my own new test and that is the gate earning its keep.**
  Prettier reflowed two assertions across lines. Because a reflow is exactly how root
  `CLAUDE.md:145`'s recorded defect broke a `?raw` guard, **MUTANT A was re-run after formatting**
  → still RED. The needles are single-line literals; only the call wrapping moved.
- **Gate:** `cargo fmt --check` clean (run first); `clippy --all-targets -D warnings` 0 warnings;
  `cargo test` **845**; `tsc --noEmit` exit 0; `pnpm lint` 0 errors (1 pre-existing `:616`
  warning); `pnpm format:check` clean after the fix; `pnpm test` **2119** (+1 = the new guard).

**Notes:** PASS. Rust unchanged at 845 — T1/T5b are comments only, which is the attribution.
Frontend +1 for the guard. ⚠️ **Third consecutive WP needing filing corrections, but of a NEW
kind:** WP1's item had expired and WP2's was simply wrong, whereas WP3's two refutations are
**deliberate decisions with their reasons written at the site** — a sweep that "reconciled" them
would have caused a regression (sharing the `expected_context` literal destroys the drift
detector; collapsing the `fs-change` listeners routes one payload to N unrelated consumers).
**Reading the reason before changing the code is what separated the 4 real items from the 2.**

## Current Node
- **Path:** Task > verify (complete)
- **Active scope:** all complete, ready for close
- **Blocked:** none
- **Unvisited:** none
- **Open discoveries:** 1 (note-and-continue)

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->

[SURFACED-2026-08-18] T3 — **The reload-note surfacing is pinned only by a `?raw` guard, not by a
render test.** The behavior (a note appears above a retained list) is genuinely renderable — this
repo already renders components in 2 files via `renderToStaticMarkup` + jsdom (`docsRender.test.tsx`,
`projectModelCellRender.test.tsx`), which is exactly the half-truth **WP5** is scheduled to correct
in `SURFACE-2026-07-31-NO-REACT-COMPONENT-RENDER-HARNESS`. ⚠️ A render test here would assert the
list SURVIVES alongside the note — the property that matters and that no source-text guard can
express. **Candidate for WP5's amendment work**, as a concrete first consumer of the corrected note.

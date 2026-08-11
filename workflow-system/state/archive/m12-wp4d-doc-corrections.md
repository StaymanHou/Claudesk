---
workflow: feature
state: planned
created: 2026-08-11
drive_mode: autopilot
wbs_ref: M12 WP4d
---

# M12 WP4d: Doc corrections — vision.md, roadmap.md, arch.md, and the M13 hand-off note

**Workflow:** feature
**State:** planned → build
**Size:** S (documentation only — no app code, no tests to add)
**WBS:** `workflow-system/product/wbs.md` → "WP4d: Doc corrections"
**Dependencies:** WP4b + WP4c (both SHIPPED) — correct the docs to what actually shipped, not to what was planned.

## Problem

Three durable strategic docs still assert premises that M12's WP4 re-decomposition **rejected**, plus
two facts that were **retracted** during WP4a/WP4b. Because these are the *durable* docs (they outlive
every WBS cycle), a future reader consulting them alone re-derives the wrong design.

⚠️ **The governing rule for this whole WP, learned at a cost of four verification passes in WP4a:**
**a correction written only where it was discovered is not a correction.** When retracting a fact,
sweep every place that *asserts* it — not only the place that *found* it wrong.

## Scope — the five task groups

### 4d.1 `vision.md` — 5 places + the vocabulary

⚠️ **Metric 5 is unsatisfiable as written; this is not optional cleanup.**

| Site | What it says now | Correction |
|---|---|---|
| `:28` | workspace "header chrome (drive-mode selector, skill buttons)" | drive-mode selector is on the **picker row**; skill buttons stay (M13) |
| `:51` | selector "in each workspace's header" + "mirrored into the WIP file's `drive_mode:` frontmatter … single source of truth" | **picker row**; the frontmatter mirror was **REJECTED** — the signal mechanism replaces it |
| `:51` | "(1 step-by-step / 2 orchestrated / 3 autopilot / 4 full-autopilot)" | **2 of 4 are WRONG** → `stepping` / `fsd` |
| `:79` | "`/session-pause`", "`/session-resume`" | **neither has existed since M9 WP5** → `/session-handoff` / `/session-restore` |
| `:79` (metric 5) | "The active drive mode is always visible in the workspace header" | **unsatisfiable as written** → visible on the picker row |
| `:87` | Core Principle 2: "drive-mode indicator reflects the WIP file's `drive_mode:` frontmatter" + `/session-resume` | reflects Claudesk's own `projects.json`; Claudesk **never writes** `workflow-system/` |
| `:87` (Principle 4) | "Persistent controls live in the workspace header (drive-mode selector)" | picker row |

⚠️ **Why the vocabulary fix matters MORE here than in the WBS:** editing these lines for the
header→picker-row change while leaving the wrong wire values makes them look **freshly audited**, so
the durable strategic doc becomes the surviving authority for two values no skill recognizes.

Also: add the reasoning + a pointer to design prior `set-a-spawn-time-choice-where-the-spawn-is-chosen`
(M12 is its first live edge case — drive mode is read at spawn **and** live-reconfigurable; resolved
**picker row only, not both**, because two homes for one per-project value would need a sync path that
deliberately does not exist).

### 4d.2 `roadmap.md` — the M12 deliverable + exit criterion

- `:318` still describes the **rejected** frontmatter mirror ("mirrored to the active WIP file's
  `drive_mode:` frontmatter so Claudesk's UI and the workflow's pause-policy logic share a single
  source of truth"). Replace with the signal mechanism **and say why** it was rejected.
- `:318` carries the identical wrong four-value list → `stepping` / `fsd`.
- ⚠️ It also says "**never** a live `<select>` on every row" — the shipped cell **does** use a native
  `<select>`, by operator decision (a closed 4-value set). Reconcile rather than leave the contradiction.

### 4d.2b Sweep BOTH retracted claims — two distinct wrong facts

⚠️ **A sweep scoped to the first will silently leave the second.**

1. **The drive-mode vocabulary.** `CLAUDE.md:17` is the known live site beyond 4d.1/4d.2.
   ⚠️ **Sweep result (2026-08-11): `roadmap.md:219`, `:227`, `:371` also match `step-by-step` but are
   ordinary English** (the install instructions the invite shows) — **leave them alone.** Matching the
   string is not the same as asserting the wire value.
2. **The "env var is free" claim.** `CLAUDE.md:243` still reads *"`spawn_argv` already takes a generic
   `env`, so adding one is free"* — retracted **three times** inside `wbs.md` because `color_tty_env()`
   is a fixed-size `[_; 4]` and widening it **leaks the var into the raw login shell**. It is true of
   the *primitive* and false at the *call site*. A reader consulting `CLAUDE.md` alone re-derives the
   wrong sizing **and** the wrong fix.
   ⚠️ The other `costs nothing` grep hits (`vision.md:86` Sublime, `roadmap.md:46`, `arch.md:311` PiP,
   the WP4a mockup HTML) are **unrelated English** — do not touch.

### 4d.3 `arch.md` — record the hook-as-write-channel

The hook channel was **read-only telemetry** until WP4b; `arch.md:262` still documents it as
one-directional CC→Claudesk. This is a **new architectural capability** and the next person to touch
the hook script must find it here rather than rediscover it. Must survive the record:
**the never-block-CC invariant** (the script still `exit 0`s unconditionally on every degraded path,
and stays silent on the other 9 of 10 events it is registered for).

### 4d.4 The M13 hand-off note

M13's Recycle Session ends in `/session-restore` and is the natural second caller of the signal.
⚠️ **Operator decision 2026-08-06: reuse is NOT pre-committed** — *"I'll need to open the spec and
re-evaluate if it's reusable when we get there."* So **record what exists and let M13 decide**; do
**not** build a generalized abstraction for a second caller that has not been specced.

## Work Tree

- [x] Phase 1: Correct the durable docs  <!-- status: COMPLETE — all children [x]; verify-human operator-passed 2026-08-11 -->
  **Observable outcomes:**
  - CLI: `grep -rn "session-resume\|session-pause" workflow-system/product/vision.md` returns **zero** hits.
  - CLI: `grep -rn "step-by-step\|full-autopilot" workflow-system/product/vision.md workflow-system/product/roadmap.md:318 CLAUDE.md` returns **zero** hits *presenting them as drive-mode wire values* (the three ordinary-English `roadmap.md` sites survive and are annotated as deliberate).
  - CLI: `grep -n "workspace header\|workspace's header" workflow-system/product/vision.md` returns no hit that attributes the **drive-mode selector** to the header.
  - CLI: `grep -rn "frontmatter" workflow-system/product/vision.md workflow-system/product/roadmap.md` shows no surviving claim that Claudesk **mirrors/writes** `drive_mode:` into a WIP file.
  - CLI: `grep -n "adding one is free" CLAUDE.md` returns **zero** hits.
  - Doc: `vision.md` success metric 5 reads consistently with the shipped picker-row placement (satisfiable).
  - Doc: `arch.md` documents the hook channel as **bidirectional**, naming the never-block-CC invariant.
  - [x] P1.1 `vision.md` — the 5 sites + vocabulary + the design-prior pointer  <!-- status: done -->
  - [x] P1.2 `roadmap.md:318` — signal mechanism, vocabulary, the `<select>` contradiction  <!-- status: done -->
  - [x] P1.3 `CLAUDE.md` — `:17` vocabulary + `:243` the retracted env-var claim  <!-- status: done -->
  - [x] P1.4 `arch.md` — the hook-as-write-channel section  <!-- status: done -->
  - [x] P1.5 The M13 hand-off note (record-only, no abstraction)  <!-- status: done -->
  - [x] verify-auto  <!-- status: done — all 7 doc-integrity outcomes pass; gates untouched-green -->
  - [x] verify-self  <!-- status: done — every load-bearing claim re-verified against source, not narrative -->

**verify-auto result (2026-08-11):** all 7 observable outcomes pass. `tsc` ✓ · `eslint` ✓ ·
`prettier` ✓ (confirming `.prettierignore` still protects `workflow-system/` + `CLAUDE.md`, so the
prose was not reflowed) · **1981/1981 frontend** (159 files) · **840 Rust** (823 lib + 16
`hook_pl_output` + 1 integration) · **OFF-invariant guard 14/14**. Both test counts are **unchanged**
from WP4c's close — for a docs-only WP that identity *is* the result: it proves the edits are inert.
Registry updated for both commands.

**verify-self result (2026-08-11) — every load-bearing claim re-verified against SOURCE, not against
the WBS narrative that asserted it:**
- **Precedence** — `predictAction.ts:131-141` checks `uncleanFlag` **first**, returns the
  `{kind:"argv", flag:"--continue"}` / `{kind:"inject"}` tagged union, and carries a comment naming the
  swap as "the fix the roadmap invites." Confirms both the precedence *and* the two-arms-differ-in-kind
  claim.
- **The env composition** — `cc_spawn_env` (`cc_session/mod.rs:484`) builds **from** `color_tty_env()`
  and adds the var **CC-only**, gated on `gate_enabled && Some(mode)`. Confirms the `CLAUDE.md:243`
  correction: free in the *primitive*, not at the *call site*.
- **The hook's stdout** — read the **shipped** `claudesk-hook.pl`: stdout on `UserPromptSubmit`
  **only** (`:102`), the nested `hookSpecificOutput`/`hookEventName` shape with its own runtime warning
  (`:110-123`), and `exit 0` unconditional (`:221`). Confirms the arch.md section including the
  1-of-10 blast radius.
- **Gate-OFF shape** — `ProjectModelCell.tsx:267` renders on `modeLine &&`; the component follows the
  data and never re-branches on the gate.
- **The `default_drive_mode` doc comment** — confirmed it no longer says *"never read or written"*
  (`config_store/mod.rs:114-123`), which is what let me date-scope the M11.5 roadmap line rather than
  silently rewrite it.

⚠️ **One self-inflicted inconsistency found and fixed during verify-self:** my new auto-resume table
numbered the no-signal case as a **row 3** while the prose said *"TWO signals, not three"* — resurrecting
the exact ambiguity the disproven three-branch spec created. The row is now unnumbered (`—`) with an
explicit note that the count means *things that fire*.

⚠️ **Also found: three sites the WBS task list did not enumerate.** `vision.md:40`, `:45`, `:49` carried
`/session-pause`//`/session-resume` **and** the full disproven three-branch table as live design.
4d.1 named only lines 28/51/79/87 + metric 5. This is task 4d.2b's own rule paying off immediately —
*sweep every place that asserts a fact, not only the place that found it wrong* — and it means the WP's
own scope list was an undercount, not a boundary. Two `roadmap.md` staleness sites were likewise found
by sweep rather than by the task list (`:4`'s "still say header" note, `:286`'s "never read or written").

⚠️ **Deliberately NOT touched:** `roadmap.md:219`, `:227`, `:371` match `step-by-step` but are ordinary
English describing the invite's install instructions. Matching the string is not asserting the wire
value. Likewise the `costs nothing` hits in `vision.md:86` (Sublime), `roadmap.md:46`, `arch.md:311`
(PiP) and the WP4a mockup HTML.
  - [x] verify-human  <!-- status: done — operator-performed 2026-08-11 -->
    - [x] The corrected vision/roadmap text matches what the operator actually decided  <!-- status: done -->
    - [x] The `<select>` reconciliation reads as intended, not as a silent reversal  <!-- status: done -->
  - [x] verify-codify  <!-- status: done — N/A by scope, reasoned below, not skipped -->

**verify-human result (2026-08-11) — PASSED, operator-performed.**

**What the human saw** (recorded per `SURFACE-2026-08-10-A-PACING-INSTRUCTION-WAS-READ-AS-A-GATE-WAIVER`,
which requires a completed `verify-human` to name this rather than merely assert a pass): the operator
was presented the full change summary — all 8 `vision.md` sites (incl. the disproven three-branch table
replacement and the unsatisfiable metric 5), the `roadmap.md` deliverable/exit-criterion rewrite, the
`CLAUDE.md` retractions, the `arch.md` bidirectional section, and the M13 note — together with the two
judgment calls put to them explicitly: **(1)** whether the corrected text matches what they actually
decided (picker-row-only resolution + the frontmatter rejection, both written from the WBS record by an
agent who was not in that conversation), and **(2)** whether the `<select>` reconciliation reads as an
operator decision with a correctness rationale rather than a silent reversal of the roadmap's
"never a live `<select>`" rule. Verdict: **"ok. looks fine."** Both checks accepted; no corrections
requested.

⚠️ **This gate was NOT waived.** The operator's `autopilot` instruction earlier in the session was
treated as pacing, not authorization — autopilot pauses at `verify-human` by definition. The pause was
taken, the two questions were asked, and the answer above is the operator's own.

**verify-codify — N/A by scope, and this is a reasoned outcome rather than a skip.** WP4d changed
**zero executable code** (5 markdown files; both test counts identity-unchanged at 1981/840). There is
no new behavior to codify, and a test asserting the *prose* of a strategic doc would be a `?raw` guard
over hand-authored English — precisely the shape this repo has repeatedly proven vacuous
(`[[raw-guard-identifier-satisfied-by-own-comments]]`, `[[raw-guard-jsx-prose-needs-flattened-haystack]]`),
and worse here because these docs are `.prettierignore`d, so nothing even stabilizes their wrapping.
The durable protection for a doc correction is the correction itself plus the CHANGELOG record.

⚠️ **verify-human is NOT waivable here, and this WP starts one week after a HIGH-priority finding that
verify-human was skipped on five phases as an *inferred* waiver**
(`SURFACE-2026-08-10-A-PACING-INSTRUCTION-WAS-READ-AS-A-GATE-WAIVER`). **Autopilot pauses at
verify-human by definition.** A completed verify-human must name *what the human saw*.

## Current Node
- **Path:** M12 WP4d > COMPLETE — ready to ship + finalize
- **Active scope:** none (all 5 tasks + all 4 verify gates closed)
- **Blocked:** none
- **Unvisited:** none in this WP. **Next in the milestone: WP5** (milestone-exit verify + the OFF-invariant guard's fourth arm — which now has a second hole to close, the CSS↔component gap found at WP4c).
- **Open discoveries:** 1, resolved in-scope (the `<select>` contradiction — see Discoveries)

## Discoveries

[SURFACED-2026-08-11] 4d.2 — `roadmap.md:318` says the cell must **never** be a live `<select>`, but
the shipped cell **is** a native `<select>` (operator decision: closed 4-value set, and a bad
drive-mode string fails serde on read and takes the whole project list down). The roadmap line and the
as-built disagree; reconciling it is in scope for P1.2. Not a defect — a stale constraint.

## Verification notes

There is no app code in this WP, so `verify-auto` is the **doc-integrity** greps above plus confirming
the frontend/Rust gates are untouched-green (nothing should change them).

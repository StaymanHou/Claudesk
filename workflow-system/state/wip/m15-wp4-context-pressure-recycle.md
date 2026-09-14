# Feature: M15 WP4 — Context-pressure recycle at phase boundaries

**Workflow:** feature
**State:** verify-codify (all phases complete)
**Created:** 2026-09-14
**Milestone:** 15 (workflow supervisor)
**Size:** M
**Depends on:** WP3 (turn-end trigger + transcript reader + fan-out), WP1 Q6 (threshold value — **settled**)

## Problem Statement

The supervisor (WP3) can now detect an auto-chain break and fire the next skill, but it does so
with no regard for how full the context window is. A feature workflow that chains phase after
phase in one long-lived session accumulates context until CC degrades or compacts — precisely
the condition a `/session-handoff` → fresh CC → `/session-restore` cycle exists to clear. WP4
adds the second branch to the supervisor's decision: **above a context-pressure threshold, at a
phase boundary that is not the last phase, in the feature workflow, recycle instead of chaining.**
Everywhere else the WP3 behavior is unchanged.

⚠️ **The supervisor still has ZERO production callers.** WP3 built the mechanism and stopped at
the module boundary; nothing in `src/components/` invokes `fanOut`. So WP4's opening move is to
become that caller — which means WP4 is where the supervisor first runs against a live workspace,
and where the three carried-not-done checks from WP3 finally become exercisable.

**Settled before planning (do not re-derive):**
- **Threshold = 400,000 absolute tokens** (R-7) — a *tunable starting value*, not a derived
  constant. Fires on ≤37.7% of sessions as an upper bound; real firing is strictly lower because
  it also requires a non-final phase boundary AND the feature workflow. Next rung down if too
  eager: 500k (21.7%).
- **No model→window map** (R-2 deleted the seam; M-5 refuted its derivation). `roadmap.md`'s
  "above 50%" is **superseded** — corrected at WP5 task 5.6, not here.
- **The verdict lives in TypeScript** (R-4); Rust does file IO only. No new backend→frontend IPC.
- **`assertPinnedModel` wiring is DISCHARGED** — it is already called inside `adjudicate` before
  the spawn. Do not re-add it as a WP4 task.

**3rd-party probe check:** no 3rd-party service, API, or SDK. `claude -p` (the adjudicator's
subprocess) is a local CLI already probed and pinned at WP3. Skipped.

## Verified facts this plan is built on

Established by reading live code and a live transcript at plan time — not assumed:

1. **`usage` is present on every assistant line.** Live check of this session's transcript: 46
   assistant lines in the last 200, **0 missing `usage`**. The backward walk to the last assistant
   line lands cleanly (idx 147 of 151). Formula `input_tokens + cache_creation_input_tokens +
   cache_read_input_tokens` = 136,628 for this session — sane, and well under 400k.
2. **The 512 KiB tail always contains the last assistant line** (`TAIL_BYTES`), so 4.1 needs no
   new Rust read. The existing `transcript_tail` output is sufficient.
3. **No WIP/Work-Tree parser exists** anywhere in `src/` or `src-tauri/` — 4.3 is genuinely new.
4. **The Work Tree phase shape is regular**: `- [ ] Phase N: <title>` at column 0, `[x]` when
   complete (verified against the WP3 archive file).
5. **`**Workflow:** feature`** is the frontmatter marker gating 4.5.
6. **`recycleSession()` needs caller-owned React state** — `relaunch: () => ccPaneRef.current?.relaunch()`
   and `awaitFreshSessionId: () => waitForFreshSessionId(ccSessionIdRef, sessionId)`. Those refs
   live inside `Workspace.tsx`. ⚠️ **This is what decides the host** (see below).
7. **`useTurnEnd` is per-workspace** (takes a `workspaceId`), matching `Workspace`'s scope.

## Key design decision: where the supervisor is hosted

⚠️ **The supervisor hosts inside `Workspace.tsx`, per workspace — NOT as a single app-level sweep.**

`fanOut()` is written to sweep N workspaces, which reads like an invitation to host it once at app
level. **It is not, and the reason is fact 6:** `recycleSession` cannot be called without
`ccPaneRef` and `ccSessionIdRef`, which exist only inside a mounted `Workspace`. An app-level host
would have to reach into per-workspace refs it does not own — reintroducing exactly the
backend→frontend coupling R-4 removed, on the frontend side.

So each `Workspace` supervises **itself**: `useTurnEnd` (already per-workspace) → `fireOne` for
that one workspace. `fanOut` remains correct and tested but stays unwired in production; it is the
N-workspace shape for a future host that has N recycle contexts. ⚠️ **Record this in the code, or
a later reader will "fix" the unused export by wiring `fanOut` at app level and break recycle.**

⚠️ **Accepted cost, stated:** supervision is per-mounted-workspace, so a workspace whose webview is
gone is not supervised. That is the SAME accepted cost R-4 already recorded ("the supervisor stops
when the webview is gone"), not a new one.

## Work Tree

- [x] Phase 1: Context-pressure read (tasks 4.1, 4.2)  <!-- status: DONE -->
  **Observable outcomes:**
  - CLI: `pnpm vitest run src/state/supervisor/__tests__/contextPressure.test.ts` exits 0; a
    fixture whose last assistant line carries `{input:2, cache_creation:2053, cache_read:132347}`
    reads **134,402**, and a fixture with a LATER assistant line carrying a SMALLER usage reads the
    LATER one (proving last-line-wins, not max and not sum).
  - CLI: a fixture with three assistant lines summing to >400k but whose LAST line reads 100k
    returns `under` — the anti-sum guard, mutation-proven.
  - CLI: a transcript with no assistant line, and one whose last assistant line has no `usage`,
    each return `null` (unknown), never `0` — `0` would read as "empty context" and is the
    dangerous default.
  - [x] P1.1 `contextPressure.ts`: `readContextTokens(lines): number | null` — walk BACKWARD to
        the last assistant line carrying `usage`; sum the three fields. ⚠️ **LAST line only,
        never summed across lines.** Reuses `TranscriptLine` from `transcript.ts`; adds a `usage`
        field to that interface.  <!-- status: DONE -->
  - [x] P1.2 `RECYCLE_TOKEN_THRESHOLD = 400_000` as a named exported constant with R-7's
        provenance in its doc comment (tunable starting value; next rung 500k). ⚠️ **No window
        map, no percentage** — cite R-2/M-5 so a future reader does not "restore" the derivation.  <!-- status: DONE -->
  - [x] P1.3 `isOverPressure(tokens: number | null): boolean` — `null` → **false** (withhold;
        unknown pressure must never trigger a recycle).  <!-- status: DONE -->
  - [x] verify-auto  <!-- status: DONE -->
  - [x] verify-self  <!-- status: DONE -->
  - [x] verify-human  <!-- status: DONE (F11 — human-confirmed skip; no integration boundary) -->
  - [x] verify-codify  <!-- status: DONE -->

- [x] Phase 2: WIP phase parser (task 4.3)  <!-- status: DONE -->
  **Observable outcomes:**
  - CLI: `pnpm vitest run src/state/supervisor/__tests__/wipPhases.test.ts` exits 0; parsing the
    real archived `m15-wp3-break-detection-and-auto-fire.md` yields 5 phases, all complete,
    `workflow: "feature"`, and `atNonFinalBoundary === false` (all phases done → no later phase).
  - CLI: a fixture with phases `[x],[x],[ ]` yields `atNonFinalBoundary === true`; one with
    `[x],[x],[x]` yields `false` (the last-phase case that must NOT recycle).
  - CLI: a WIP file with `**Workflow:** task` yields `workflow: "task"`, and `isFeatureWorkflow`
    returns `false` for it. ⚠️ **Corrected at Phase 2 verify-self (2026-09-14):** the original
    wording read *"and the caller gates it out"*, which reaches into **Phase 3 (P3.2)** — Phase 2
    ships the gating PRIMITIVE, not its caller. The clause was unsatisfiable by construction at
    this phase (zero consumers, by design) and would have been a permanent false FAIL.
  - CLI: a malformed/absent WIP file yields `null`, never a throw — the sweep must not die on it.
  - [x] P2.1 Rust: extend the existing `transcript`/fs surface with a command to read the active
        WIP file's text for a project (`workflow-system/state/wip/*.md`, newest-modified when
        several). ⚠️ **File IO only, no parse** (R-4). Returns `{path, text}` or nulls.  <!-- status: DONE -->
  - [x] P2.2 `wipPhases.ts`: parse `**Workflow:** <x>` from frontmatter and `- [ ] / - [x] Phase N:`
        lines into `{workflow, phases: {done: boolean}[]}`. ⚠️ **Contract-reader against the Work
        Tree schema** — anchor on the documented shape, and record that task 4.7 asks mccc to PIN
        it so this is a contract not a guess.  <!-- status: DONE -->
  - [x] P2.3 `atNonFinalPhaseBoundary(parsed): boolean` — true iff at least one phase is
        incomplete AND at least one is complete. ⚠️ A fresh WIP with NO phase done is not a
        "boundary" (nothing has been completed to recycle at); state that in the doc comment.  <!-- status: DONE -->
  - [x] verify-auto  <!-- status: DONE -->
  - [x] verify-self  <!-- status: DONE -->
  - [x] verify-human  <!-- status: DONE (F11 — human-confirmed skip; no integration boundary) -->
  - [x] verify-codify  <!-- status: DONE -->

- [x] Phase 3: The boundary rule — recycle vs chain (tasks 4.4, 4.5)  <!-- status: DONE -->
  **Observable outcomes:**
  - CLI: `pnpm vitest run src/state/supervisor/__tests__/verdict.test.ts` exits 0 with the new
    `recycle` arm; a fire-candidate + over-threshold + non-final feature boundary yields
    `kind: "recycle"`; each of the three conditions individually falsified yields `kind: "fire"`.
  - CLI: a `task`-workflow WIP over threshold at a boundary yields `kind: "fire"` — the
    feature-only gate (4.5), mutation-proven by flipping the gate and watching a test go red.
  - CLI: a turn the mechanical rule WITHHELD stays `withhold` even when over threshold — the
    recycle branch must never promote a withhold, mirroring the adjudicator's no-promote rule.
  - [x] P3.1 Extend `SupervisedVerdict` with a `recycle` arm carrying `edgeId`, `mode`, and the
        token reading. ⚠️ Do NOT overload the `fire` arm with a boolean — a closed union is what
        makes the caller's switch exhaustive (`[[derived-state-is-not-a-proxy-for-its-event]]`).  <!-- status: DONE -->
  - [x] P3.2 The rule, in `decideSupervised`, applied **only to a would-be fire**, AFTER the
        adjudicator clears it: over-threshold AND feature-workflow AND non-final boundary →
        `recycle`; else unchanged. ⚠️ **Ordering is load-bearing** — a turn awaiting input must
        not be recycled any more than it may be chained.  <!-- status: DONE -->
  - [x] P3.3 Extend `VerdictInput` with the optional pressure + WIP evidence, following the
        existing `reading` precedent (caller supplies what it already read; absent → the
        conservative branch).  <!-- status: DONE -->
  - [x] verify-auto  <!-- status: DONE -->
  - [x] verify-self  <!-- status: DONE -->
  - [x] verify-human  <!-- status: DONE (F11 — human-confirmed skip; no integration boundary) -->
  - [x] verify-codify  <!-- status: DONE — fanOut recycle-arm coverage gap CLOSED -->

- [x] Phase 4: Wire the second caller — the supervisor goes live (task 4.6)  <!-- status: DONE -->
  **Observable outcomes:**
  - Browser (MCP bridge, live app): with the workflow gate ON and a stored drive mode, a real CC
    turn ending on an AUTO edge causes the next skill to be injected into the pane — the
    supervisor's FIRST production fire. Evidence: the command appears in the pane AND the
    `supervisor` label appears on any failure warning (never `auto-resume`).
  - Browser: with the workflow gate OFF, the same turn fires nothing — OFF-invariant holds.
  - CLI: `pnpm verify:auto` exits 0.
  - CLI: `rg -n "fanOut\(" src/components/` returns no production call site — the per-workspace
    host uses `fireOne`; `fanOut` stays unwired by design (documented, not accidental).
  - [x] P4.1 Host in `Workspace.tsx`: `useTurnEnd` → build the `SupervisedWorkspace`, read the
        transcript + WIP, call `fireOne`. ⚠️ Gate on `workflow_features_enabled` (M10.9) and on a
        stored drive mode — the opt-in is `decideVerdict`'s `not-supervised` arm, already built.  <!-- status: DONE -->
  - [x] P4.2 Route the `recycle` arm to the EXISTING `fireRecycle` path, reusing its
        `ccPaneRef`/`ccSessionIdRef` wiring and its `recycling` re-entrancy guard. ⚠️ **Do not
        build a second recycle call site** — one funnel (`recycleSession`'s own header rule).  <!-- status: DONE -->
  - [x] P4.3 Verify the abort/flag asymmetry holds unattended: on abort after a successful
        handoff but before respawn, **the clean mark STAYS**. ⚠️ There is deliberately **no
        `mark_unclean` primitive** and this site is exactly where adding one looks tempting —
        assert the current behavior, do not "fix" it.  <!-- status: DONE — VERIFIED, no code written -->
  - [x] P4.4 Discharge WP3's carried checks now that a production caller exists: the
        `injectCommand`→PTY hop, and Esc recovery for a chained one-step run.  <!-- status: DONE-AS-DEFERRED — the hop is structurally verified (label chain end-to-end); Esc recovery is P4.verify-human.5, DEFERRED to dogfooding -->
  - [x] verify-auto  <!-- status: DONE -->
  - [x] verify-self  <!-- status: DONE — 2 PASS, 2 UNVERIFIED (no live CC trigger); carried to verify-human -->
  - [x] verify-human  <!-- status: DONE-AS-DEFERRED — ⚠️ NOT an F11 skip; see the deferral block below -->
    - [x] P4.verify-human.1 Live AUTO-edge fire; `/skill` appears in the pane  <!-- status: DEFERRED-TO-DOGFOODING (operator, 2026-09-14) -->
    - [x] P4.verify-human.2 Gate OFF → the same turn fires nothing (OFF-invariant)  <!-- status: DEFERRED-TO-DOGFOODING (operator, 2026-09-14) -->
    - [x] P4.verify-human.3 Installed-`.app` smoke test (GUI-PATH)  <!-- status: DEFERRED-TO-RELEASE-GATE (operator, 2026-09-14) -->
    - [x] P4.verify-human.4 Recycle fires unattended at a real phase boundary  <!-- status: DEFERRED-TO-DOGFOODING (operator, 2026-09-14) -->
    - [x] P4.verify-human.5 Esc recovery for a chained one-step run  <!-- status: DEFERRED-TO-DOGFOODING (operator, 2026-09-14) -->
  - [x] verify-codify  <!-- status: DONE — consuming-surface wiring test added -->

- [x] Phase 5: Cross-repo handoff to mccc (task 4.7)  <!-- status: DONE -->
  **Observable outcomes:**
  - CLI: `HANDOFF-to-mccc-m15-wp4.md` exists at the repo root, names the exact Work Tree
    properties Phase 2's parser depends on, and states the requested `check-structure.sh` phase.
  - CLI: `git log --oneline -1` shows it committed.
  - [x] P5.1 Write the handoff: the schema properties the parser is a contract-reader against
        (`- [ ] Phase N:` at column 0, `[x]` completion marker, `**Workflow:**` frontmatter), and
        the ask — a new `check-structure.sh` phase pinning them. ⚠️ **Send EARLY** (WBS §"one
        shortenable edge"): it has someone else's latency and is consumed here.  <!-- status: DONE -->
  - [x] P5.2 Note the still-open `HANDOFF-to-mccc-m15-wp2.md` in it (Phase 9 deletion + the
        unanswered `I2` PAUSE-vs-AUTO question) so one mccc-rooted session can clear both.  <!-- status: DONE -->
  - [x] verify-auto  <!-- status: DONE -->
  - [x] verify-self  <!-- status: DONE — 1 BLOCKING + 1 COSMETIC found and FIXED in place -->
  - [x] verify-human  <!-- status: DONE (F11 — human-confirmed skip; no integration boundary) -->
  - [x] verify-codify  <!-- status: DONE — no new tests owed; claim already pinned at Phase 2 -->

## Current Node
- **Path:** Feature > ALL PHASES COMPLETE
- **Active scope:** none — ready for `/feature-ship`. ⚠️ **5 behavioral checks DEFERRED to dogfooding — OPEN, not passed** (backlog SURFACE logged)
- **Blocked:** none
- **Unvisited:** (none — Phase 5 is the last)
- **Open discoveries:** none

### Phase 1 build record (2026-09-14)

**Built:** `src/state/supervisor/contextPressure.ts` (+ `TranscriptUsage` on `transcript.ts`'s
`TranscriptLine`), `src/state/supervisor/__tests__/contextPressure.test.ts` — 15 tests, green.

⚠️ **FIVE MUTANTS, RUN INDIVIDUALLY, ALL KILLED.** Batching was avoided deliberately — WP3 had two
of four survive invisibly inside a 98-green run. Each was confirmed to have landed in **executable**
code before being run, and the module's `shasum` was verified identical to its pre-mutation value
afterward (`11d443fa…`), so no residue remains.

| # | Mutation | Killed by |
|---|---|---|
| 1 | sum across ALL assistant lines (a real, compiling accumulator) | *reads the LAST assistant line…* + *does NOT sum across lines* |
| 2 | `return null` → `return 0` for the unknown case | *returns null (unknown), never 0…* |
| 3 | `null` treated as over-pressure (`?? MAX_SAFE_INTEGER`) | *is false for null…* |
| 4 | `>` → `>=` at the threshold | *is false at exactly the threshold…* |
| 5 | skip → stop on a `usage`-less assistant line | *skips an assistant line with no usage…* |

⚠️ **A first attempt at mutant 1 was INVALID and had to be redone.** A `perl` edit produced
`total += …` with `total` undeclared — a compile error, not a summing implementation. An invalid
probe and a real guard hole are indistinguishable from the result alone
(`[[invalid-probe-and-real-hole-look-identical]]`), so it was rewritten as a genuine accumulator
before being trusted.

**Validated against REAL transcripts** (throwaway harness in `tmp/scratch/`, since removed): 5
recent sessions all parsed to sane non-null readings scaling with length —
`27L → 53,699` · `273L → 173,323` · `572L → 218,759` · `2844L → **789,888 (over=true)**`.
⚠️ **The threshold is reachable in practice** — one real session genuinely exceeds 400k, which
also corroborates M-5's 833,567 observation. 1-of-5 over is consistent with R-7's ≤37.7% bound.

**verify-auto (2026-09-14):** `pnpm verify:auto` **EXIT=0, 25s** (warm cargo cache).
Frontend **2513 → 2528** (+15, this phase's tests), Rust **887 → 907** unchanged by this phase
(the +20 is the WP3 refactor's uncommitted Rust work already in the tree). Zero non-zero failure
counts; clippy and `cargo fmt --check` clean.

⚠️ **The gate failed on the first run at `format:check`** — both new files needed Prettier. Since
a Prettier reflow has broken a `?raw` guard in this repo before, the reflow was inspected (it
wrapped two function signatures and nothing else) and the 15 tests were **re-run after formatting**
rather than assumed still green. The one remaining lint warning is pre-existing in
`XtermPane.tsx` (0 errors) and unrelated to this phase.

**verify-self (2026-09-14) — ALL 3 OUTCOMES PASS, no BLOCKING, no COSMETIC.**
⚠️ **No integration boundary** — the phase adds an isolated new module plus an *optional* field on
`TranscriptLine`; no existing endpoint, route, UI surface, CLI command or job consumes either, and
the additive field changes no existing consumer's behavior.

The subagent verified each outcome **independently of suite greenness** — it read the source and
ran its own mutants rather than trusting the build record:
- ⚠️ **Last-line-wins is proven against TWO wrong implementations, not one.** The build pass ran
  only the summing mutant; the subagent additionally killed a `max()` mutant (returned 500,000
  where 100 was expected). Stronger evidence than Phase 1's own record claimed.
- The anti-sum fixture straddles the threshold (850,100 summed vs 100,000 last-line) **and**
  asserts `isOverPressure(...) === false`, so the `under` verdict itself is exercised, not just
  the raw number.
- The `null`-vs-`0` distinction was re-confirmed, including the deliberate separation of a
  *missing* `usage` object (keeps walking → `null`) from `usage: {}` (a real reading → `0`).

⚠️ **Method note worth carrying:** the impl file is **UNTRACKED**, so `git checkout -- <path>`
would have silently no-opped on the subagent's mutations and left residue
(`[[git-checkout-no-ops-on-untracked-file]]`). It backed up by copy and verified the restore by
`shasum`. Orchestrator re-confirmed afterward: `28c41a2b…` matches baseline, 15/15 green.

**verify-human (2026-09-14) — F11, HUMAN-CONFIRMED SKIP (not auto-skip).**
⚠️ **The §2 auto-skip gate (a) FAILED and the prompt was therefore NOT elided.** The WIP file
carries **no `drive_mode:` frontmatter field**, and the skill is explicit that an absent field is
treated as Mode 2 — do NOT auto-skip. Claudesk's hook reports `autopilot`, but gate (a) reads the
**WIP frontmatter**, not the hook; the two are separate signals and conflating them would silently
elide a human gate. Gates (b) verify-self all-PASS, (c) no integration boundary, and (d) no
outcome cites a consuming surface were all clean — only (a) failed.

Affirmation given to the operator: the phase wires into no existing endpoint, route, UI page, CLI
command, job, or external call; it adds `contextPressure.ts` (**zero production consumers** until
Phase 4), its test file, and an **optional** `usage` field on `TranscriptLine` (additive, so no
existing consumer's behavior changes). Operator replied **"skip"**.

⚠️ **Open decision for Phase 2+:** whether to add `drive_mode: autopilot` to this WIP's
frontmatter. Offered and NOT yet taken — without it, every future phase with no integration
boundary will pause at this same gate. Left as the operator's call; do not add it unilaterally.

**verify-codify (2026-09-14) — PHASE 1 COMPLETE.** `pnpm verify:auto` EXIT=0, 25s. Frontend
**2528 → 2531** (+3), Rust **907** unchanged. No failures, so no §3b triage entry was owed.

⚠️ **THE 15 BUILD-TIME TESTS WERE NOT DUPLICATED.** Per §2, a behavior already covered by a test
that would fail if it broke is skipped. What codify added is the ONE thing those 15 could not
reach: a test against a **REAL captured transcript**.

⚠️ **WHY THAT GAP WAS REAL, AND MUTATION-PROVEN:** every hand-written fixture in this file uses a
`usage` object the test author constructed, so they all share the author's assumptions about its
shape. A real `usage` is far richer and carries **two active traps** — `cache_creation` (a NESTED
OBJECT whose name is a prefix of `cache_creation_input_tokens`) and `iterations` (a nested ARRAY
that REPEATS all three field names per entry). A nested-walk implementation double-counts.
**Proven:** a nested-walk mutant was killed by the two new real-fixture tests and **survived all
15 original tests** — the synthetic fixtures were structurally incapable of catching it. Module
`shasum` re-verified at `28c41a2b…` after restore; 18/18 green.

Reuses `fixtures/real-chained-turn.jsonl`, the same captured transcript `transcript.test.ts` and
`fanOut.test.ts` already read (145,737 tokens = 2 + 503 + 145,232; a double-count reads 291,474).

### Phase 2 build record (2026-09-14)

**Built:** `src-tauri/src/wip/{mod.rs,commands.rs}` (+ `mod wip;` and `wip_read` registered in
`lib.rs`) — 12 Rust tests; `src/state/supervisor/wipPhases.ts` + its test file — 19 TS tests.

⚠️ **P2.1 did NOT reuse `docs::glob_dir`.** It is private to `docs` and sorts **alphabetically**;
the supervisor needs **newest-modified**, because with several WIP items open the active one is
the most recently written. An alphabetical pick would gate the recycle on another feature's phase
list — a silent wrong answer. `list_wip_files` mirrors `transcript::list_transcripts`'s
`Reverse(mtime)` pattern instead, and a command test pins it (`a-old.md` sorts first by name and
must LOSE to `z-new.md`).

⚠️ **`read_head`, not a tail read.** The parser's inputs (`**Workflow:**`, `## Work Tree`) are at
the TOP of the file, so `transcript::read_tail`'s posture is exactly wrong here. Pinned by a test
that a tail-read implementation fails.

**SIX MUTANTS, RUN INDIVIDUALLY. FOUR KILLED, ONE SURVIVED AND EXPOSED A REAL HOLE, ONE PROVEN
EQUIVALENT.**

| # | Mutation | Result |
|---|---|---|
| 1 | drop the `^` column-0 anchor from `PHASE_LINE` | ⚠️ **SURVIVED → real gap, test added, now killed** |
| 2 | `anyDone && anyOpen` → `anyOpen` | killed (fresh-WIP case) |
| 3 | `anyDone && anyOpen` → `anyDone` | killed by 3 tests incl. the real archived file |
| 4 | remove `PHASE_LINE.lastIndex = 0` | ⚠️ **EQUIVALENT MUTANT — proven, not guessed** |
| 5 | `workflow === "feature"` → `!== null` | killed |
| 6 | read the `<!-- status: -->` comment instead of the checkbox | killed by 5 tests |

⚠️ **MUTANT 1 IS THE FINDING OF THIS PHASE.** All 19 tests passed with the anchor removed. The
cause: every child leaf in the fixtures is named `P1.1` / `verify-auto`, and none contains the
word "Phase" — so `Phase\s+\d+:` already excluded them and **the anchor was never exercised**.
⚠️ The shape that DOES exercise it is real, not invented: `archive/wp4-thumbnail-rendering-probe.md`
line 14 carries an indented commented-out phase line
(`  <!-- ORIGINAL: - [ ] Phase 1: Harness scaffold … -->`). Unanchored, that parses as a live
Phase 1 and **makes a COMPLETED feature look like a non-final boundary** — i.e. it would recycle a
finished feature. A test built on that real shape now kills the mutant.

⚠️ **MUTANT 4 IS AN EQUIVALENT MUTANT AND IS DOCUMENTED AS ONE, NOT TESTED AROUND.** The loop runs
to exhaustion, and `exec` resets `lastIndex` to 0 on its final failed match — so removing the
explicit reset changes nothing reachable through `parseWip`. Verified directly in `node`, and the
loop body confirmed to have no `break`/early `return`. **The line stays** (it becomes load-bearing
the instant anyone adds an early exit) and its comment was **rewritten to say so honestly** — the
original comment overclaimed that it prevented a live bug. Contorting a test to kill an equivalent
mutant would have been the wrong response.

⚠️ **One test was REMOVED as a time-bomb before it could fire.** A first draft read this WP's own
live `wip/` file and asserted "Phase 1 done → boundary true". That passes today and **breaks the
moment this WP finishes its last phase** — a test that fails because its subject SUCCEEDED, which
would then land in the archive asserting a state the file no longer has. Replaced with a mixed
state synthesized from the archived WP3 file's own phase lines (still schema-sourced, permanently
stable).

**verify-auto (2026-09-14):** `pnpm verify:auto` **EXIT=0, 31s**. Frontend **2531 → 2550** (+19),
Rust **907 → 919** (+12). ⚠️ **Both deltas match Phase 2's additions exactly**, which is the
evidence that `mod wip;` is actually registered and running — a mis-wired module would have shown
+0 Rust tests while still passing the gate.

⚠️ **Failed on the first run at `format:check` again** (same class as Phase 1 — `wipPhases.test.ts`
needed Prettier; `wipPhases.ts` itself passed). Tests re-run after formatting: 19/19 still green.

⚠️ **`every_allow_dead_code_is_still_load_bearing` was run EXPLICITLY** (`cargo test --test
stale_dead_code_allows -- --ignored`, 40s) — it is `#[ignore]`d in the normal run and its own
message says to invoke it in verify-auto. PASSED: the new `wip` module introduced no stale
`#[allow(dead_code)]`. ⚠️ Without this the gate reports `ok. 0 passed` for that target and reads
green while checking nothing.

**verify-self (2026-09-14) — 3 PASS, 1 FAIL/COSMETIC (an outcome-WORDING defect, not a code one).**
⚠️ **No integration boundary.** `lib.rs` was modified, but purely as ADDITIVE REGISTRATION (a
`mod wip;` line + one entry in the invoke-handler list). No existing command, route or handler
changed behavior, so none of the 5 boundary conditions fire.

Independently verified by the subagent, beyond suite greenness:
- ⚠️ **THE `^` ANCHOR'S LOAD-BEARING-NESS WAS CONFIRMED AGAINST THE REAL FILE.** Anchored vs
  unanchored run against `archive/wp4-thumbnail-rendering-probe.md`: anchored → **3 phases,
  boundary false**; unanchored → **4 phases, boundary TRUE** (it picks up the indented
  commented-out impostor at line 14). ⚠️ **The unanchored parser would recycle a COMPLETED
  feature.** This independently reproduces the build-time finding on a second real file.
- Both halves of `atNonFinalPhaseBoundary` mutation-killed individually; uncovered shapes probed
  (`[ ][ ][x]` → true, single `[x]` → false, single `[ ]` → false).
- **29 malformed inputs** driven through `parseWip` (NUL bytes, unterminated HTML comment, CRLF,
  non-string types, an object whose `toString` throws): **zero throws**.
- 5 mutants run individually, each printed to confirm it landed in executable code, each killed.
- Untracked-file discipline honored: backed up by copy, restored, `shasum -c` verified
  (`a7f907d1…`). No residue.
- Rust: **12 `wip::` tests confirmed by count**, not by trusting a filtered run's exit 0.

⚠️ **THE COSMETIC IS A DEFECT IN THIS PLAN'S OWN WORDING, AND IT IS CORRECTED ABOVE.** Outcome 3
read *"…and the caller gates it out"* — but the caller-side gate is **Phase 3's P3.2**, and Phase 2
deliberately ships the gating PRIMITIVE with **zero consumers**. Verified independently: a repo-wide
grep for `wipPhases`/`isFeatureWorkflow`/`atNonFinalPhaseBoundary`/`parseWip` finds no consumer
outside the module's own test. The clause was **unsatisfiable by construction at this phase** and
would have recurred as a false FAIL at every future re-verification, so the outcome text was
corrected to describe what Phase 2 owns rather than marking it passed and moving on.

**verify-human (2026-09-14) — F11, HUMAN-CONFIRMED SKIP (not auto-skip).** Gate (a) failed again:
the WIP still carries no `drive_mode:` frontmatter, so the absent-field rule treats this as Mode 2
and the prompt fired. Gates (b)/(c)/(d) were clean. Affirmation given: no existing endpoint, route,
UI page, CLI command, job or external call is wired; the artifacts are the new Rust `wip` module
(`wip_read` has no callers), `wipPhases.ts` (zero consumers by design — its caller is P3.2), and
two purely ADDITIVE `lib.rs` registration lines. Operator replied **"skip"**.

⚠️ **PHASE 4 WILL HAVE A REAL INTEGRATION BOUNDARY** and must NOT be skipped here: it wires the
supervisor into `Workspace.tsx`, an existing component whose user-visible behavior changes. Per §2
the F11 path is **forbidden** when a boundary applies — Phase 4's verify-human requires an actual
checklist with captured evidence, regardless of drive mode.

**verify-codify (2026-09-14) — PHASE 2 COMPLETE.** `pnpm verify:auto` EXIT=0, 25s. Frontend
**2550 → 2551** (+1), Rust **919** unchanged. No failures, so no §3b triage entry was owed.

⚠️ **THE 19 TS + 12 RUST BUILD-TIME TESTS WERE NOT DUPLICATED** (§2: covered behavior is skipped).
Codify added exactly ONE test, closing a gap that verify-self exposed without closing:

⚠️ **THE STRONGEST ANCHOR EVIDENCE WAS LIVING ONLY IN A TRANSCRIPT.** The subagent proved the
unanchored parser misreads `archive/wp4-thumbnail-rendering-probe.md` — but **no committed test
read that file**; it was referenced only in a code COMMENT. So the anchor was guarded solely by a
hand-built fixture that *imitates* the real shape, which proves the parser handles the shape the
author imagined, not the shape the corpus contains. The new test reads the **actual archived
file**: 3 real top-level phases + 1 indented `<!-- ORIGINAL: - [ ] Phase 1: … -->` impostor
(an ordinary artifact of revising a Work Tree). Anchored → 3 phases, all done, `boundary: false`;
unanchored → 4 phases, one open, `boundary: true` → **would recycle a COMPLETED feature**.
**Mutation-proven:** the anchor mutant is now killed INDEPENDENTLY by both the imitation test and
the real-file test. Module `shasum` re-verified at `a7f907d1…`; 20/20 green.

### Phase 3 build record (2026-09-14)

**Built:** the `recycle` arm on `SupervisedVerdict`, `shouldRecycle()` + the branch in
`decideSupervised`, `contextTokens`/`wip` on `VerdictInput`, and the `recycle` field +
`readWip` dep on `fanOut`. **11** new tests (verdict 24 → 35); `fanOut` unchanged.

⚠️ **THE CLOSED UNION PAID FOR ITSELF IMMEDIATELY — `tsc` CAUGHT THE UNHANDLED ARM.** Adding the
`recycle` member broke `fanOut.ts:186` (`Property 'reason' does not exist`), because
`verdict.kind !== "fire"` is true for BOTH `recycle` and `withhold` and the recycle would have
reached `no(verdict.reason)` → `undefined` → an unexplained non-fire. ⚠️ **Had this been a boolean
on the `fire` arm (`fire & {recycle:true}`), the compiler would have said NOTHING** and `fanOut`
would have injected the skill command AND ignored the recycle — the silent-wrong-action shape from
`[[derived-state-is-not-a-proxy-for-its-event]]`. This is the concrete payoff for P3.1's
"do NOT overload the fire arm" instruction.

⚠️ **`fired: false` FOR A RECYCLE, DELIBERATELY.** `fired` means "a slash command was injected",
which a recycle does not do. Reported as `fired: true` the two actions become indistinguishable in
a diagnostic — and the entire point of the branch is that they differ.

⚠️ **`fanOut` REPORTS the recycle; it does not PERFORM it.** `recycleSession()` needs caller-owned
React state (`relaunch`, `awaitFreshSessionId`) a pure module cannot reach. The `readWip` dep is
**optional**, so its absence disables the recycle branch entirely — WP3's chain-only behavior is
preserved for every existing caller with no edits, and the destructive branch is opt-in by
construction rather than by a flag someone can forget.

**FIVE MUTANTS, RUN INDIVIDUALLY. FOUR KILLED, ONE SURVIVED AND EXPOSED A REAL FIXTURE HOLE.**

| # | Mutation | Result |
|---|---|---|
| 1 | drop the `isOverPressure` condition | killed by 3 tests |
| 2 | drop the `isFeatureWorkflow` gate | ⚠️ **SURVIVED → real gap, test added, now killed** |
| 3 | drop the `atNonFinalPhaseBoundary` condition | killed |
| 4 | move the recycle branch BEFORE the adjudicator | killed |
| 5 | let a mechanical withhold be promoted to a recycle | killed |

⚠️ **MUTANT 2 IS THE FINDING OF THIS PHASE, AND IT IS A FIXTURE DEFECT, NOT A CODE ONE.** Deleting
`isFeatureWorkflow` from `shouldRecycle` left all 34 tests green. Cause: the `taskWip` fixture has
**no phase lines**, so `atNonFinalPhaseBoundary` already returned `false` — the feature gate was
never the thing doing the work, and "condition 2 falsified" was never actually tested.
⚠️ The discriminating input is a **non-feature WIP that nonetheless parses to a non-final
boundary** (`boundary: true` + `isFeature: false`), confirmed by direct measurement. Nothing in the
schema prevents a task/incident WIP from carrying `Phase N:` lines, and the gate exists precisely
so that need not be assumed. The new test asserts the fixture really does satisfy the other two
conditions before asserting the verdict, so it cannot silently stop discriminating.

⚠️ **Mutants 4 and 5 guard the two ordering properties**, which are the ones that would do real
damage: a recycle running BEFORE the adjudicator would destroy a turn that had just asked the
operator a question, and a recycle able to promote a withhold would be strictly worse than the
fire it replaced. Module `shasum` re-verified at `607803b9…`; 56 tests green across verdict +
fanOut.

**verify-auto (2026-09-14):** `pnpm verify:auto` **EXIT=0, 25s**. Frontend **2551 → 2562** (+11),
Rust **919** unchanged — correct, Phase 3 is TS-only. Formatted pre-emptively this time, so the
gate passed on the FIRST run (Phases 1 and 2 each failed once at `format:check`).

⚠️ **The +11 was RECONCILED, not assumed.** The build record first said "13 new tests"; a direct
count of the WP4 `describe` block shows **11**, and `verdict.test.ts` went 24 → 35. The suite
delta matches exactly, so there is no hidden skipped or mis-registered test — the 13 was a
miscount in the prose, now corrected.

**verify-self (2026-09-14) — ALL 3 OUTCOMES PASS, no BLOCKING, no COSMETIC.**
⚠️ **No integration boundary.** `verdict.ts`/`fanOut.ts` are existing files, but the supervisor
still has **zero production callers** (Phase 4's job) and every change is additive — a new union
arm, optional input fields, an optional dep. No existing caller's behavior changes.

⚠️ **MY FIXTURE FIX WAS INDEPENDENTLY CONFIRMED TO DISCRIMINATE.** I asked the subagent to
re-probe the `isFeatureWorkflow` hole I had found and patched myself, since a self-authored fix is
exactly what deserves outside confirmation. Deleting the gate now fails **exactly** the new
task-with-phases test **and no other** — and the fixture self-asserts its own premises
(`atNonFinalPhaseBoundary === true`, `isFeatureWorkflow === false`) inside the test, so it is a
valid probe rather than one passing for the wrong reason.

All five verdict-side mutants re-killed independently (pressure / feature gate / boundary /
ordering-before-adjudicator / withhold-promotion). `shasum` re-verified at `607803b9…`.

⚠️ **NEW GAP FOUND — `fanOut.test.ts` HAS NO TEST OF THE RECYCLE ARM.** Mutant **F1** (moving the
`kind !== "fire"` check ahead of the recycle arm in `fireOne`) **SURVIVED all 150 tests** and was
caught **only by `tsc`**. Confirmed directly: the sole "recycle" string in that file is an
unrelated label list at line 376. The runtime behavior IS correct — a throwaway probe verified
`fired: false`, `reason: "context-pressure-recycle"`, the payload, zero injections, the opt-in
degradation and the throwing-`readWip` degradation — but **that probe deleted itself, so nothing
standing guards any of it**.

⚠️ **Deliberately NOT back-looped (F9b).** This is missing COVERAGE, not a defect: all three
Observable Outcomes pass, the behavior is correct, and `tsc --noEmit` runs inside `pnpm
verify:auto` so the ordering cannot regress silently. Writing the missing test is exactly what
**verify-codify** is for, and it is now a named obligation on that node.

**verify-human (2026-09-14) — F11, HUMAN-CONFIRMED SKIP.** Gate (a) failed again (no `drive_mode:`
in the WIP frontmatter → treated as Mode 2), so the prompt fired; gates (b)/(c)/(d) clean.
⚠️ **The `fanOut` recycle-arm coverage gap was surfaced to the operator IN CHAT, not buried in
this file**, along with the explicit choice not to back-loop and an offer to do so instead.
Operator replied **"skip"** — so the coverage obligation stands with verify-codify as planned.

**verify-codify (2026-09-14) — PHASE 3 COMPLETE. THE COVERAGE GAP IS CLOSED.**
`pnpm verify:auto` EXIT=0, 25s. Frontend **2562 → 2568** (+6), Rust **919** unchanged. No failures,
so no §3b triage entry was owed.

⚠️ **THE 11 VERDICT TESTS WERE NOT DUPLICATED** (§2). Codify wrote exactly the 6 tests the named
obligation called for: `fanOut.test.ts` had **no recycle case at all**, so mutant **F1** (moving
the `kind !== "fire"` check ahead of the recycle arm) survived all 150 tests and was caught only
by `tsc`.

⚠️ **F1 IS NOW KILLED BEHAVIORALLY — re-landed and re-run to prove it.** Two of the new tests fail
on the mutant (*"reports a recycle and injects NOTHING"*, *"reports `fired: false`"*), so the
ordering no longer depends on the type checker alone. **Why that matters:** `tsc` catches F1 today
only because `recycle` happens to lack a `reason` field; a future shape change that gave it one
would make the misordering **compile** and silently report every recycle as an unexplained
non-fire. The behavioral tests guard the behavior, not the current field layout.

The six tests also pin what the subagent's throwaway probe had confirmed and then deleted:
**zero injections** on a recycle (a recycle that ALSO injected would run the next phase in the very
session it was ending), `fired: false` + `reason: "context-pressure-recycle"`, a genuine withhold
still reporting **its own** reason (the ordering asserted in both directions), the `readWip`
opt-in, the throwing-`readWip` degradation, and an under-threshold turn chaining normally.
`fanOut.ts` `shasum` re-verified at `e538ce6f…`; 27/27 green.

### Phase 4 build record (2026-09-14)

**Built:** `src/state/supervisor/useSupervisor.ts` (the per-workspace host) + its 12 tests; wired
into `Workspace.tsx` via `useSupervisor({...})`. **THE SUPERVISOR NOW HAS A PRODUCTION CALLER** —
the zero-callers state that stood since WP3 is over.

⚠️ **THE HOST IS PER-WORKSPACE AND `fanOut` STAYS UNWIRED — this is the phase's load-bearing
design call.** `fanOut` sweeps N workspaces and reads like the obvious choice, but
`recycleSession()` needs `relaunch`/`awaitFreshSessionId`, built from `ccPaneRef`/`ccSessionIdRef`
— refs that exist ONLY inside a mounted `Workspace`. An app-level host would have to reach into
per-workspace refs it does not own. Wiring `fanOut` there **would compile** and leave the recycle
branch unable to act, so a source guard pins `fireOne` and forbids `fanOut` in this module.

⚠️ **P4.2 — NO SECOND RECYCLE CALL SITE.** The `recycle` arm calls the EXISTING `fireRecycle`,
inheriting its `recycling` re-entrancy guard, its AbortController wiring, and its failure-arm
surfacing. A separate programmatic path would have duplicated all three. A `console.warn`
announces the recycle *before* it runs — the operation is unattended and runs up to 3 minutes, so
without it an operator returning to the pane sees a session that restarted for no visible reason.

⚠️ **P4.3 REQUIRED NO CODE — IT IS A VERIFICATION, AND IT PASSED.** `markSessionClean` runs at
`recycleSession.ts:439`; the abort check at line 453 returns **after** it, so on abort after a
successful handoff the clean mark **STAYS**. Already pinned by an M13 behavioral test
(`recycleSession.test.ts:448`, *"D1: aborting between the clean mark and the respawn KEEPS the
mark"* — 39/39 green). ⚠️ The absence of a `mark_unclean` primitive is itself pinned
(`cleanExit.test.ts:134` asserts the module does not export `markSessionUnclean`). **Nothing was
"fixed" here, per the plan's instruction.**

⚠️ **TWO CONTRACT DETAILS READ FROM SOURCE RATHER THAN GUESSED:**
- `injectCommand(sessionId, command, onIpcError?, label)` — the label is the **4th** argument, so
  the call passes `undefined` for `onIpcError`. Getting this wrong misattributes every supervisor
  failure to M12's auto-resume arm.
- `AdjudicatorDeps.run` takes `{model, prompt, timeoutMs}`, **not** a bare prompt (`tsc` caught the
  first attempt). ⚠️ `deps.model` is deliberately **NOT set**: `assertPinnedModel` CHECKS a
  supplied model rather than honoring it (R-6 condition 1), so plumbing one through from config
  would be a loud failure. The pin stays single-sourced in `ADJUDICATOR_MODEL`.

**FOUR MUTANTS, RUN INDIVIDUALLY, ALL KILLED.**

| # | Mutation | Killed by |
|---|---|---|
| 1 | drop the `label` from `injectCommand` | *forwards the label as the 4th argument* |
| 2 | **drop `readWip`** | *supplies readWip — without it the recycle branch is dead* |
| 3 | swap `fireOne` → `fanOut` | *uses fireOne, NOT fanOut* |
| 4 | recreate the `FireLedger` per turn | *holds the FireLedger in a ref* |

⚠️ **MUTANT 2 IS THE ONE THAT MATTERS MOST.** `FanOutDeps.readWip` is OPTIONAL by design (its
absence preserves WP3's chain-only behavior), so forgetting it at the wiring site **silently
disables the entire WP4 feature** while `tsc` and every other test stay green. That is the
standing local defect shape exactly — a correct mechanism behind a caller that does not honor it.

⚠️ **The source guards were re-proven AFTER Prettier reflowed one of their regexes** onto multiple
lines — the `?raw`-guard-broken-by-a-Prettier-reflow trap this repo has hit before. Re-landed
mutant 1 post-format: still killed. `shasum` re-verified at `a93a17c1…`; 12/12 green.

⚠️ **P4.4's carried checks are NOT done here** — the `injectCommand`→PTY hop, Esc recovery, and
the installed-`.app` smoke test all need the live app and belong to verify-self/verify-human.

**verify-auto (2026-09-14):** `pnpm verify:auto` **EXIT=0, 25s** after one triaged failure.
Frontend **2568 → 2580** (+12), Rust **919** unchanged.

⚠️ **THE FIRST RUN FAILED — AND THE FAILURE WAS WP2'S ARCHITECTURAL GUARD DOING ITS JOB.**
`workflowMachineFunnel.test.ts` failed 2 tests because `useSupervisor.ts` is a new importer of
`workflowMachine/`. **Triaged before any test file was touched** (§3b hard rule) — see
`## Test Triage` above. Classification: *obsolete test* (the pinned allowlist did not yet know
about an intentionally-added module), confidence *high*, because both failures share one cause and
nothing behavioral changed.

⚠️ **THE ADMISSION WAS EARNED, NOT ASSUMED.** The guard's message states the condition; it was
checked factually: `useSupervisor.ts` imports **exactly one symbol, a TYPE**
(`import type { DriveMode }`), and `grep -cE "POLICY_ROWS|cellForMode|resolvePolicy"` returns
**0** — it reads no policy at all, so it cannot bypass the funnel. ⚠️ **The failure signature
matched the "correct consumer" pattern the allowlist's own comments specify:** exactly TWO tests
failed and the discriminator — *"wires graph to policy in exactly ONE module"* — **PASSED**, which
is the mechanical evidence a module is not hand-rolling the derivation. Both the allowlist and the
production-consumer expectation were updated **together**, as the guard's message requires.

⚠️ **THE GUARD WAS PROVEN STILL LIVE AFTER THE EDIT.** A throwaway module importing
`workflowMachine/` was added; the guard fired on it (2 failures), and the probe was deleted. Its
predicate is unchanged — only a reviewed entry was added. Without this check, "admitted my module
to the allowlist" and "disabled the allowlist" look identical from a green run.

**verify-self (2026-09-14) — 2 PASS, 2 UNVERIFIED. No BLOCKING, no COSMETIC.**
⚠️ **INTEGRATION BOUNDARY: YES** (condition 2 — `Workspace.tsx` is an existing component whose
user-visible behavior now changes). The outcomes DO cite the consuming surface (the live workspace
pane + its CC terminal), so the boundary rule is satisfied and no back-loop was owed on that count.

| # | Outcome | Result |
|---|---|---|
| 1 | live fire on an AUTO edge, `supervisor` label | **UNVERIFIED** |
| 2 | gate OFF → fires nothing | **UNVERIFIED** |
| 3 | `pnpm verify:auto` exits 0 | PASS |
| 4 | no `fanOut(` in `src/components/` | PASS |

⚠️ **THE UNVERIFIED PAIR IS A DEFERRED OBSERVATION, NOT A DEFECT — SO NO F9b.** Nothing is
known-broken; the blocker is that the TRIGGER cannot be manufactured. A real CC turn must end with
a `TRANSITION:` token as its LAST assistant text block, on an edge `resolvePolicy` resolves to
`auto` with a dispatchable target. ⚠️ **Tooling was NOT the blocker** — the subagent reached the
live dev app and drove its MCP bridge on `127.0.0.1:9223` directly. It declined to synthesize the
trigger because injecting a fake transcript line would verify the FIXTURE, not the feature
(`[[verify-self-stub-cannot-cross-subprocess-boundary]]`). Reporting UNVERIFIED beats a false PASS.

**Preconditions that WERE observed live:** gate ON, stored mode `orchestrated` rendered in the UI,
a live PTY CC session (v2.1.270), the supervisor host mounted, **zero console errors** — which also
clears the blank-`#root` failure mode this repo has shipped before.

**Source-side chains, re-verified by the orchestrator rather than taken on trust:**
`SUPERVISOR_INJECT_LABEL = "supervisor"` (`fanOut.ts:76`) → passed at `fanOut.ts:259` → forwarded as
`injectCommand`'s 4th arg (`useSupervisor.ts:139-140`), so `autoResumeFire.ts`'s `"auto-resume"`
default is unreachable from this path. The gate is checked twice: `Workspace.tsx:616` and
`useSupervisor.ts:110`.

⚠️ **A FALSE BLOCKING WAS AVOIDED, AND THE MECHANISM IS WORTH KEEPING.** The subagent's first run
showed an unhandled rejection (`listeners[eventId].handlerId`) that looked like a WP4 defect. It was
**instrument error** — its own forced `location.href` navigation tore down Tauri's listener
registry. A clean relaunch with no navigation produced zero errors.

⚠️ **PROCESS SAFETY HELD.** The operator's prod app (PID 2157) — which this very session runs
inside — was untouched, and no stray dev process was left behind (both re-confirmed by the
orchestrator afterward). ⚠️ The installed app is from **Sep 6 (v0.4.0)** while WP4's code is from
**Sep 14**, so the running prod build **cannot** exercise this feature; a `pnpm tauri:dev` build
under the `com.claudesk.app.dev` identity was the only viable surface.

**verify-human (2026-09-14) — ⚠️ DEFERRED TO DOGFOODING. NOT AN F11 SKIP, AND NOT A PASS.**

⚠️ **THE DISTINCTION IS LOAD-BEARING.** This phase has an integration boundary, which **forbids**
the F11 skip path outright. Recording these as "skipped" would erase the difference between
*verified* and *never observed*. The operator's decision was explicit and correct on the merits:
*"It's hard to consistently trigger these conditions without actually using it… I'll provide
feedback after we actually ship this milestone and after I start dogfooding it."* Manufacturing the
trigger would test the fixture, not the feature — the same reason verify-self returned UNVERIFIED
rather than inventing a substitute.

**FIVE BEHAVIORAL CHECKS ARE OPEN. Owner: the operator. Trigger: first real dogfooding after M15
ships.**

| Leaf | Check | Deferred to |
|---|---|---|
| P4.vh.1 | Live AUTO-edge fire; `/skill` appears in the pane | dogfooding |
| P4.vh.2 | Gate OFF → the same turn fires nothing | dogfooding |
| P4.vh.3 | Installed-`.app` GUI-PATH smoke test | the `/release` gate |
| P4.vh.4 | Recycle fires unattended at a real phase boundary | dogfooding |
| P4.vh.5 | Esc recovery for a chained one-step run | dogfooding |

⚠️ **WHAT IS AND IS NOT KNOWN.** Everything statically checkable IS verified — `verify:auto` green
(2580 / 919), the label chain intact end-to-end, the gate checked twice, the OFF-invariant enforced
structurally, `fanOut` provably unwired, 4 wiring mutants killed. **What has never been observed is
the supervisor actually firing in a live session.** The wiring is proven; the behavior is not.

⚠️ **THE RISK THIS CARRIES, STATED PLAINLY:** the supervisor fires with **no human watching**, and
`injectCommand` has **no retry and no pre-send cancel window** — the only recovery from a wrong
fire is CC's **Esc**, which is itself one of the deferred checks (P4.vh.5). A wrong fire on an
unwatched workspace is therefore unrecoverable *and* its recovery path is unconfirmed. This is the
single largest open risk in WP4 and it must be named in the ship note and at WP5's exit verify.

⚠️ **P4.vh.3's deferral is the ONE with precedent** — the operator defers installed-`.app` checks
to the `/release` gate as standing practice (`[[installed-build-verify-deferred-to-release]]`).
The other four are new deferrals specific to this feature's trigger-rarity.

⚠️ **DO NOT LET THESE EVAPORATE.** They are logged to `backlog.md` as a SURFACE item at finalize,
and WP5's exit verify must read them as open. A future session finding `[x]` on these leaves must
read the `DEFERRED-*` status tags, **not** the checkbox — the checkbox means "this gate is closed",
not "this behavior was observed.

**verify-codify (2026-09-14) — PHASE 4 COMPLETE.** `pnpm verify:auto` EXIT=0, 32s. Frontend
**2580 → 2587** (+7), Rust **919** unchanged. No failures, so no §3b triage entry was owed.

⚠️ **NOTHING WAS MANUALLY VERIFIED THIS PHASE, SO THERE WAS NO CONFIRMED BEHAVIOR TO CODIFY** —
the five behavioral checks were deferred, not passed. What codify owed instead was the
**integration boundary's** requirement: at least one test exercising the **consuming surface**.

⚠️ **THE GAP WAS REAL: NOTHING PINNED `Workspace.tsx` ← `useSupervisor`.** `useSupervisor.test.ts`
guards the HOOK; a perfect hook that no component mounts is this repo's standing defect shape
exactly. A repo-wide grep confirmed no test referenced `useSupervisor` from the component side.
New file `src/components/workspace/__tests__/supervisorWiring.test.ts` (7 tests) closes it,
following `docsPanelWiring.test.ts`'s established `?raw` rules (comments stripped, call/argument
shapes asserted, emptiness meta-guard).

⚠️ **THESE GUARDS CARRY MORE WEIGHT THAN USUAL AND THE FILE SAYS SO.** With the live behavior
unobserved, they are currently **the only thing** between a wiring regression and a silent
never-fires. They are explicitly **not** a substitute for the deferred live checks.

**FOUR MUTANTS, RUN INDIVIDUALLY, ALL KILLED:**

| # | Mutation | Killed by |
|---|---|---|
| 1 | `useSupervisor` imported but NEVER CALLED | *CALLS useSupervisor — without this the whole feature is dead code* |
| 2 | `enabled: workflowFeaturesEnabled` → `enabled: true` | *passes the M10.9 workflow gate* |
| 3 | a SECOND `recycleSession` call site (bypassing `fireRecycle`) | *routes the recycle to the EXISTING fireRecycle* |
| 4 | `storedModeRef` → a literal `{current: "autopilot"}` | *passes the STORED drive mode ref, not a literal* |

⚠️ **Mutant 1 is the one that matters most:** an unused import is a lint warning at most, so `tsc`
and every other test stay green while the supervisor never mounts. `Workspace.tsx` `shasum`
re-verified at `51ea3b5e…`; 7/7 green.

### Phase 5 build record (2026-09-14)

**Built:** `HANDOFF-to-mccc-m15-wp4.md` at the repo root. Asks mccc to add a `check-structure.sh`
phase pinning the Work Tree schema, so `parseWip()` becomes a **contract-reader** rather than a
guesser.

⚠️ **THE THREE PROPERTIES ARE SOURCED FROM THE CODE AS BUILT, NOT FROM MEMORY** — both regexes were
read out of `wipPhases.ts` and quoted verbatim (`PHASE_LINE`, `WORKFLOW_LINE`).

⚠️ **THE ANCHOR EVIDENCE WAS RE-MEASURED AT WRITE TIME**, not copied from the Phase 2 record:
against the real `archive/wp4-thumbnail-rendering-probe.md`, anchored reads **3 phases, 3 done,
boundary `false`**; unanchored reads **4 phases, 3 done, boundary `true`** — i.e. unanchored,
Claudesk **recycles a COMPLETED feature**. That single measurement is what turns the ask from
tidiness into correctness, so it is the note's centerpiece.

⚠️ **EVERY FACTUAL CLAIM IN THE NOTE WAS VERIFIED BEFORE HANDOFF** — a handoff carrying a wrong
detail is worse than none (`[[handoff-detail-can-be-wrong-while-its-conclusion-is-right]]`).
Checked: line 14 of the probe file matches verbatim; `HANDOFF-to-mccc-m15-wp2.md` exists and is
committed (a standing note, not applied upstream); the `I2` question is in it; WBS task 2.9 is
indeed `[~]` at `wbs.md:130`.

⚠️ **The note explicitly does NOT ask mccc to change the format** — only to enforce it. And it
records that Claudesk shipped the parser in the meantime with the properties documented in-code as
**observed-not-enforced**, backstopped by tests that read real WIP files — a backstop, not a
substitute, since those tests only see files in this repo.

**verify-auto (2026-09-14):** ⚠️ **SCOPED, NOT the full gate — and that is the correct call here.**
Phase 5 added ONE markdown file and changed **no code**: `find -newermt` over the phase's window
returns no `.ts`/`.tsx`/`.rs` file, and the source files showing in `git status` are cumulative
from Phases 1–4. This is the one phase where the skill's *"do NOT run the full test suite"*
guidance applies cleanly — the full gate was already green at Phase 4 and nothing since could
change it.

| Check | Result |
|---|---|
| the note exists at the repo root | ✅ 5,846 bytes |
| no source file touched this phase | ✅ markdown only |
| `prettier --check` on the note | ✅ clean (and `HANDOFF-*.md` is `.prettierignore`d, so `format:check` cannot trip on it) |
| both regexes quoted **verbatim** from `wipPhases.ts` | ✅ `grep -qF` against the live source lines |
| the anchored/unanchored table | ✅ both rows re-measured fresh and matched |

⚠️ **The regex check was MECHANICAL (`grep -qF` of the live source line), not eyeballed.** A handoff
quoting a regex that had since drifted would send mccc to pin the WRONG shape — the failure mode
`[[handoff-detail-can-be-wrong-while-its-conclusion-is-right]]` names, where an accurate-looking
adjacent detail lends credibility to a wrong one.

**verify-self (2026-09-14) — ⚠️ FOUND A REAL BLOCKING ERROR IN MY OWN HANDOFF. Both findings
FIXED in place; 2 rounds of subagent verification.**
⚠️ **No integration boundary** — the phase adds one markdown note and no code.

**Round 1 — BLOCKING (fixed).** The note claimed four recognized `**Workflow:**` values
(`feature`/`task`/`incident`/**`product`**) and asked mccc to pin *"one of the four known
workflows"*. ⚠️ **`product` occurs ZERO times as a WIP frontmatter value.** Verified independently
by the orchestrator: all real occurrences are non-WIP (Claudesk test fixtures, mccc's
`session-start/SKILL.md:114` *routing-label* prose, a transcript fixture). It is **structural**, not
merely unobserved — the product workflow writes to `workflow-system/product/`, never `state/wip/`,
and the only `product-*` skill naming `state/wip/` (`product-finalize:99`) **reads** it.
⚠️ **Why BLOCKING:** the note's whole purpose is a pin that **fails loudly on drift**, and a
`product` arm **can never fail** — shipping a dead arm into someone else's guard. The exact
`[[handoff-detail-can-be-wrong-while-its-conclusion-is-right]]` shape: three correct values lent
credibility to a fourth that was wrong. Fixed at **both** sites, and the exclusion is **explained,
not silently deleted**, so nobody restores it from Claudesk's own harmless unused
`KNOWN_WORKFLOWS` member.

**Round 2 — COSMETIC, introduced BY the round-1 fix (also fixed).** The correction said *"zero
times in 343 real WIP and archive files"*. ⚠️ **343 is a LINE count presented as a FILE count.**
Re-measured by the orchestrator: Claudesk **149 files / 149 lines**, mccc **193 files / 194 lines**
(`workflow-system/product/arch.md` carries two), and ~7 of mccc's lines are schema templates in
skill/arch docs rather than WIP files. Total lines **343** — the number was right, its **label** was
not. Reworded to say lines, with the file counts and both caveats stated.
⚠️ **A correction that introduces a new wrong number is worse than the original error**, which is
precisely why round 2 was asked to hunt for exactly that.

⚠️ **THE IN-PLACE-SHORTCUT GATES WERE ALL THREE SATISFIED** (verify-self is contractually
observe-only, so bypassing F9b required them): (1) trivial factual correction to prose in the
just-written P5.1 artifact, no redesign; (2) **re-verified by a FRESH subagent invocation** —
self-re-reading explicitly does not satisfy this; (3) audit trail logged as
`[SHORTCUT-2026-09-14]` in `## Discoveries`.

**Untouched claims re-confirmed after the edits** (regression check): both regexes still verbatim
from `wipPhases.ts:54/:62`, and the anchored **3/3/`false`** vs unanchored **4/3/`true`** table still
reproduces against the real archived probe file — re-run with the actual `atNonFinalPhaseBoundary`
semantics, not a paraphrase. `prettier --check` clean.

**Outcome 2 (`git log` shows it committed) — FAIL/COSMETIC, and the cause is the OUTCOME'S OWN
SCOPE.** The whole WP4 tree is deliberately uncommitted (operator policy: commit only when asked);
`/feature-ship` is what commits. The outcome described a post-ship state `feature-build` should
never have produced. ⚠️ No write-side git command was run by either subagent.

**verify-human (2026-09-14) — F11, HUMAN-CONFIRMED SKIP.** Gate (a) failed again (no `drive_mode:`
in the WIP frontmatter → Mode 2), so the prompt fired; (b)/(c)/(d) clean. Affirmation given: the
phase adds one isolated markdown artifact and no code. ⚠️ **Both content errors were already FIXED
at verify-self, so they were NOT re-presented** (the pre-filter rule: do not spend operator time on
what the agent already confirmed). The one judgment surfaced was the genuinely human one — *this
note asks ANOTHER REPO to do work*, and whether that ask is wanted and well-framed is not something
an agent can verify. Operator replied **"skip"**.

**verify-codify (2026-09-14) — PHASE 5 COMPLETE. ALL FIVE PHASES DONE.**
`pnpm verify:auto` **EXIT=0, 25s, no errors**. Frontend **2587**, Rust **919**.

⚠️ **NO NEW TESTS WERE OWED, AND THAT IS A DELIBERATE §2 CALL — NOT AN OVERSIGHT.** Phase 5
produced a **markdown document for another repo**. There is no behavior to codify, and a test
asserting prose inside a handoff note would pin a document that exists *to be acted on and then
become obsolete*. ⚠️ More to the point, the note's one load-bearing factual claim is **already
pinned**: `wipPhases.test.ts` → *"excludes the REAL indented impostor in
wp4-thumbnail-rendering-probe.md"* (written at Phase 2's codify) reads that exact file and asserts
3 phases / all done / `boundary: false`. If the evidence the note rests on ever stopped holding,
that test breaks. §2 says covered behavior is skipped, not duplicated.

⚠️ **A FLAKE COST ONE GATE CYCLE AND WAS ESCALATED, NOT "FIXED"** — see `## Test Triage` above.
The first run exited **1** while reporting **2587 passed / 0 failed / 190 files passed**; the
non-zero exit came from a post-completion `setTimeout` rejection in an **M11 docs module WP4 never
touched**. Re-ran the file in isolation twice (14/14, clean) and the full suite twice (exit 0
both), which is §3b's definition of flaky. **Nothing was modified.** Logged to `backlog.md`
because the SHAPE is corrosive: a gate that exits non-zero while reporting zero failures trains a
future session to re-run until green — exactly how a real failure gets waved through.

## Test Triage — docsLinkHandling.test.ts (unhandled error, Phase 5 verify-codify)

**Classification:** Flaky test — a timing-dependent unhandled rejection unrelated to this feature.
**Confidence:** high (after re-runs; it was *ambiguous* on the first observation, which is why
re-runs came before any judgement).
**Evidence:** `pnpm verify:auto` exited 1 while reporting **2587 passed, 0 failed** and
`Test Files 190 passed` — the failure was an `Errors 1 error` AFTER the suite completed, thrown
from a `setTimeout` callback (`scrollToFragmentWhenPresent` →
`handleDocLinkClick.ts:160` → `Timeout._onTimeout`). That is an M11 docs module; **WP4 touched
nothing in it**, and a post-completion timer callback cannot be caused by a passing test's
assertions.
**Action:** ⚠️ **NOTHING WAS MODIFIED — §3b forbids editing code or tests to eliminate a flake.**
Re-ran the file in isolation **twice** (14/14 both times, no error), then the full frontend suite
**twice** (2587/2587, **exit 0** both times). Inconsistent results across identical runs is §3b's
definition of flaky, so it is escalated rather than "fixed". ⚠️ **Logged to `backlog.md` as a
standing item**: a flake that exits non-zero while reporting zero failures is corrosive — it
teaches a future session to re-run until green, which is exactly how a REAL failure gets waved
through.

## Test Triage — workflowMachineFunnel.test.ts (2 failures, Phase 4 verify-auto)

**Classification:** Obsolete test — the new feature intentionally adds a module the pinned
allowlist did not yet know about. (NOT a code regression: nothing the tests assert about
behavior changed.)
**Confidence:** high
**Evidence:** Both failures are the SAME cause — `state/supervisor/useSupervisor.ts` is a new
importer of `workflowMachine/`. The guard's own message states the condition for admitting one:
*"If it needs a policy VERDICT it must call resolvePolicy() — not POLICY_ROWS/cellForMode
directly."* Verified factually, not assumed: `useSupervisor.ts` imports **only `type DriveMode`**
from `workflowMachine/policy` (one line, type-only), and `grep -cE "POLICY_ROWS|cellForMode|
resolvePolicy"` returns **0** — it reads no policy at all. It cannot bypass the funnel because it
never consults policy; `verdict.ts` (already allowlisted) owns every policy read in this subsystem.
**Action:** Added `state/supervisor/useSupervisor.ts` to `ALLOWED_IMPORTERS` **and** to the
production-consumer expectation, together — the guard's message explicitly requires both to be
updated in the same change. ⚠️ The guard is NOT weakened: its predicate is unchanged, and it will
fire again for the next new importer. That is the guard working as designed, and this entry is the
audit trail the §3b hard rule requires before any test file is edited.

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->

[SHORTCUT-2026-09-14] P5.1 — verify-self found a **BLOCKING factual error** in
`HANDOFF-to-mccc-m15-wp4.md`: it listed the recognized `**Workflow:**` values as `feature`, `task`,
`incident`, **`product`** and asked mccc to pin *"one of the four known workflows"*. ⚠️ **`product`
occurs ZERO times as a WIP frontmatter value** — measured independently across both repos (343
files: Claudesk 130/15/4, mccc 137/42/15). It is structural, not merely unobserved: the product
workflow writes to `workflow-system/product/`, never `state/wip/`, and the only `product-*` skill
naming `state/wip/` (`product-finalize`) **reads** it. Fixed **in place** at both sites — the
"Recognized values" line and the suggested-pin bullet — and the exclusion is now explained rather
than silently deleted, so a future reader cannot "restore" it from Claudesk's own harmless unused
`KNOWN_WORKFLOWS` member. **Re-verified by a FRESH subagent invocation** (in-place-shortcut gate 2;
self-re-reading does not satisfy it). ⚠️ **Why this was worth catching:** the note's whole purpose
is a pin that fails loudly on drift, and a `product` arm **can never fail** — a dead arm inside a
guard. It is also the textbook
`[[handoff-detail-can-be-wrong-while-its-conclusion-is-right]]` shape: three correct values lent
credibility to a fourth that was wrong.

## Notes carried into this WP

- ⚠️ **`SURFACE-2026-08-18-GUARD-VOCABULARY-MISSES-RECYCLE-AND-SESSION` does NOT fire here.** Its
  exposure is conditional on a new **menu id, panel, or chord** naming Recycle. WP4 adds none —
  the recycle is fired automatically from an existing call path, not a new UI surface. So the
  standing precedent (b) is untouched and the shared `WORKFLOW_TERMS` list is **not** widened.
  ⚠️ **Re-check at WP5** and if a Recycle menu item is ever added, decide (a) vs (b) BEFORE
  building it.
- ⚠️ **The OFF-invariant guard pins 6 arms / 8 subjects.** WP4 adds no new gated *surface*
  (Phase 4 gates behavior inside an existing component), so the arm count should NOT change. If
  Phase 4 finds it must, that is a SEVENTH arm and the pin bumps in the same change.
- ⚠️ **Mutants are run INDIVIDUALLY, never batched.** Two of four survived invisibly inside a
  98-green run at WP3 (`[[behavioral-test-can-still-be-an-equivalent-mutant]]`). Each mutant gets
  its own run and its own attribution, and each must be confirmed to have landed in **executable**
  code (`[[verify-the-mutation-landed]]`).
- ⚠️ **A `?raw` source-text guard is the weak form here.** WP3 replaced one that survived the very
  mutant it was written for. Prefer extracting the property so a behavioral test drives the real
  thing (`[[extract-for-import-when-a-raw-guard-cant-express-the-property]]`).
- **WP1 fixture is label-circular** — only the 36 `GROUND_TRUTH_BREAK` records are independent
  signal. Do not score WP4's rule against that fixture and read a high number as evidence.
- **R-6 condition 3** (re-measure the Q2 margin on a larger labelled set) remains a **WP5**
  obligation, not WP4's.

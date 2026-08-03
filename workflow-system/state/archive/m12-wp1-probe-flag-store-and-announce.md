# Feature: M12 WP1 — Probe: the unclean-flag store + the two announce signals

**Workflow:** feature
**State:** COMPLETED 2026-08-03 (finalized; archived)
**Created:** 2026-08-03
**Type:** probe (deliverable is a written verdict, not software)
**Timebox:** half-day
**WBS:** `workflow-system/product/wbs.md` → WP1
**drive_mode:** autopilot

## Problem Statement

M12's four remaining WPs all build on two facts nobody has established, and both are
expensive to retrofit. **(a)** The unclean-exit flag needs a store. The operator settled its
*category* — machine-local session state, **not** a project preference (*"it should not touch
the project dir. It's not a sibling of `default_model`, but similar"*) — but not its
*location*, and the WBS names three candidates without deciding. **(b)** The picker must
announce a predicted command per row, and `.session.md` lives in each *project dir*, so the
naive shape is a filesystem stat per row. That exact N+1 already shipped once on this exact
surface: M11.5 WP1's model cell re-fetched, per row, a field `list_projects` was already
returning on the wire. This is a probe of **our own storage boundary**, not a 3rd party — no
external API, SDK, or service is involved, so no 3rd-party probe WP is required or missing.

Both verdicts land in `wbs.md` → "Probe outcomes". Nothing ships as a user-facing surface.

## Findings already established at plan time

These came out of reading the code while planning; they narrow the probe rather than
pre-empt it, and each is a claim the phases must confirm or overturn rather than inherit.

- **`write_projects` serializes the WHOLE `Vec<Project>` on every write**
  (`config_store/mod.rs:115-122`), and `add_or_touch` writes the full list on *every project
  open* to stamp `last_opened_at`. So a flag stored on `Project` is rewritten by unrelated
  recency traffic — which matters for a value whose whole job is to survive a crash.
  ⚠️ Treat as the leading hypothesis for candidate 1's cost, to be confirmed in P1.
- **`.session.md` already has a Rust presence-check precedent** — M11's `docs` module reads
  it by exact path join (`docs/mod.rs:113`), non-recursive. The announce query does not need
  a new filesystem primitive.
- **The batched shape has a precedent too, and it is "widen the existing payload"** —
  `RecentProject` (`ProjectPicker.tsx:43-47`) gained `default_model` precisely to kill the
  N+1; its comment records the lesson. The candidate answer for (b) is therefore *one more
  field on what `list_projects` already returns*, not a new command.
- **Measured, cold and warm (15 real recents, `~/Library/Application Support/com.claudesk.app`):**
  15 stats = **1.69 ms cold / 0.017 ms warm** (best-of-5); `.session.md` present in 5 of 15.
  Extrapolated to 40 rows: ~0.05 ms warm. **The per-open batch cost is a non-issue; the N+1
  risk is architectural (per-row IPC round-trips), not stat latency.** P2 must not conclude
  "it's fast, so per-row is fine" — that is the wrong lesson from this number.
- **`SessionRegistry::spawn` already receives `project_path` and resolves `data_dir`**
  (`cc_session/mod.rs:788-800`, the `read_default_model` call) — so WP2's set-on-open needs
  no signature change, confirming the WBS's M-not-L sizing.

## Work Tree

- [x] Phase 1: Verdict (a) — the unclean flag's store and serialized shape  <!-- status: [x] -->
  **Observable outcomes:**
  - CLI: `./node_modules/.bin/tsc --noEmit` exits 0 and `cargo fmt --check` exits 0 — the
    phase writes docs + at most a probe harness, so the tree stays green (no source change
    is expected; this outcome catches an accidental one).
  - CLI: `grep -c 'candidate' workflow-system/product/wbs.md` ≥ 3 — all three candidate
    stores are enumerated in the recorded verdict, each with its cost, not just the winner.
  - CLI: the "Probe outcomes" section of `wbs.md` contains a `Verdict (a)` block naming the
    chosen store, the serialized shape, **and an explicit rejection reason for each of the
    other two** — `grep -A40 'Verdict (a)' workflow-system/product/wbs.md` shows all three.
  - CLI: a throwaway measurement script under the session scratchpad demonstrates the
    write-amplification claim above — writing one project's flag rewrites N records under
    candidate 1 — exits 0 and prints the byte count. ⚠️ Scratchpad, **not** `tmp/` inside the
    repo: `pnpm add`-class footprint rules aside, a spike belongs outside the tree.
  - [x] P1.1 Read `config_store/mod.rs` (`Project`, `add_or_touch`, `write_projects`) and
        `settings.rs` (`AppSettings`, `read_settings`/`write_settings`) end-to-end. Enumerate
        the three candidates with a concrete cost each: (1) a field on `Project` in
        `projects.json`; (2) a sibling map in Claudesk's own `settings.json`; (3) its own
        small store. Note explicitly that `default_model` is the **shape** precedent and
        **not** the **category** precedent.  <!-- status: [x] -->
  - [x] P1.2 Confirm-or-overturn the write-amplification finding by measurement, not
        reading: does setting one project's flag rewrite every other record under candidate
        1? Record the byte/record count.  <!-- status: [x] -->
  - [x] P1.3 Decide the store + serialized shape. If `projects.json` wins anyway, record
        **how the flag stays visually and semantically separate from user preferences on the
        same record** (the operator's stated concern). If it loses, record what a
        crash-durability argument would have to look like to reopen it.  <!-- status: [x] -->
  - [x] P1.4 State the durability posture explicitly: the flag is **default-set on open** and
        a power loss runs no code, so the store must make "set" durable *before* the session
        starts doing work. Name where in the open path that write lands.  <!-- status: [x] -->
  - [x] P1.5 Record Verdict (a) in `wbs.md` → "Probe outcomes".  <!-- status: [x] -->
  - [x] verify-auto  <!-- status: [x] -->
  - [x] verify-self  <!-- status: [x] — subagent: 5/5 PASS, 0 BLOCKING, 0 COSMETIC -->
  - [x] verify-human  <!-- status: [x] — operator approved all 3 decision leaves 2026-08-03 -->
    - [x] P1.verify-human.1 store choice: own `session-state.json`, cand 1 rejected on lost-update, cand 2 on category  <!-- status: [x] -->
    - [x] P1.verify-human.2 `absent = clean`; set lands after spawn succeeds (failed spawn leaves no flag)  <!-- status: [x] -->
    - [x] P1.verify-human.3 reopening condition is narrow enough  <!-- status: [x] -->
  - [x] verify-codify  <!-- status: [x] — 1 new Rust test, mutation-proven; 733 cargo + 1734 vitest pass -->

- [x] Phase 2: Verdict (b) — the batched announce query  <!-- status: [x] -->
  **Observable outcomes:**
  - CLI: the recorded verdict names **one** command that returns the predicted action for
    **all** projects in a single call, and states the per-row IPC count is **zero** —
    `grep -A40 'Verdict (b)' workflow-system/product/wbs.md` shows both claims.
  - CLI: a measurement across a realistic recents count is recorded with a real number
    (cold + warm), reproducible by re-running the script the phase writes; script exits 0.
  - CLI: the verdict cites `ProjectPicker.tsx:38-42` (the N+1 comment) as the precedent it
    is following, so the next reader sees *why* the shape is "widen the payload" —
    `grep -A40 'Verdict (b)' workflow-system/product/wbs.md` contains the file reference.
  - CLI: the staleness window is written down as a concrete sequence of events, not a
    caveat sentence — the verdict states what the picker shows when `.session.md` is deleted
    by `/session-restore` step 7 while the picker is open, and whether that is acceptable.
  - [x] P2.1 Design the batched command: one call → per-project predicted action. Decide
        between widening `list_projects`' payload (the `default_model` precedent) and adding
        one sibling batch command, and record which and why. ⚠️ The flag half is free
        (already in Claudesk's store); only the `.session.md` half touches the filesystem.  <!-- status: [x] -->
  - [x] P2.2 Re-measure the stat cost at the real recents count and at a padded count
        (≥40) to show the shape scales. Record cold and warm separately — the warm number
        alone would misleadingly suggest per-row is harmless.  <!-- status: [x] -->
  - [x] P2.3 Confirm read-at-picker-open is sufficient (operator-settled: **yes**) and write
        down the actual staleness window. ⚠️ `.session.md` can vanish while the picker is
        open — `/session-restore` deletes it at step 7. Per M11 WP4's lesson,
        stale-content-that-looks-current is worse than absent, so state whether a
        re-read-on-focus is needed or explicitly deferred with a reason.  <!-- status: [x] -->
  - [x] P2.4 Sanity-check the prediction inputs against the settled decision model: flag →
        `/resume`, `.session.md` → `/session-restore`, neither → nothing. ⚠️ Confirm the
        query returns enough to express the **flag-wins** precedence WP3 task 3.1 must
        mutation-prove — a payload that collapses both signals into one string would make
        that precedence untestable downstream.  <!-- status: [x] -->
  - [x] P2.5 Record Verdict (b) in `wbs.md` → "Probe outcomes".  <!-- status: [x] -->
  - [x] verify-auto  <!-- status: [x] — 4 scoped checks; consumer-set claim confirmed (3 call sites, 2 count-only) -->
  - [x] verify-self  <!-- status: [x] — subagent: 5/5 PASS, 0 BLOCKING, 0 COSMETIC -->
  - [x] verify-human  <!-- status: [x] — operator approved both decision leaves 2026-08-03 -->
    - [x] P2.verify-human.1 sibling command `picker_announce_actions`, NOT a `list_projects` widening (2 of 3 consumers are count-only)  <!-- status: [x] -->
    - [x] P2.verify-human.2 staleness is display-only + self-correcting; focus re-read deferred  <!-- status: [x] -->
  - [x] verify-codify  <!-- status: [x] — 11 new FE tests, 3 source-mutants proven to bite; 1745 vitest + 733 cargo pass -->

## Current Node
- **Path:** Feature > feature-finalize
- **Active scope:** none — SHIPPED at `cc3dfa2`; code-quality review complete (0 CRITICAL / 3 MAJOR / 5 MINOR; 2 MAJORs + 1 MINOR fixed in place, 5 auto-backlogged). Ready for finalize.
- **Phase 2 verify-self result:** 5/5 PASS. Independently confirmed the decisive claim: `list_projects` has exactly 3 real `invoke` sites (11 raw grep hits reduce to 3), `App.tsx:310`/`:702` both feed only `setInviteProjectCount(projects.length)`, and `ProjectPicker.tsx:127` is the one genuine field consumer. `picker_announce_actions` correctly absent repo-wide.
- **Verify-self result:** 5/5 PASS. Independently confirmed the verdict's central claim: `write_projects` serializes the whole slice, and `ProjectPicker.tsx:145-146` really does `record_open` → `onOpen` adjacently, so the co-trigger is real. No integration boundary (docs-only; zero source files touched).
- **Blocked:** none
- **Unvisited:** none
- **Open discoveries:** one (see below) — recorded, non-blocking

## Notes on verification shape (read before verify-self)

This is a **probe**, so the outcomes above are deliberately *document + measurement* checks
rather than app behavior — there is no UI and no backend surface to drive. That is not a
weakened bar: each outcome is a concrete grep or an exit-0 script, per the
mechanically-verifiable rule.

Consequently **verify-self is fully agent-drivable here** and must NOT be carried to the
operator — no live app, no MCP bridge, no `pnpm tauri:dev` is needed for either phase. The
standing "backend-lifecycle features are operator-only at the live tier" convention does
not apply, because nothing in this WP spawns a process or observes one. **verify-human is
where the operator reviews the two verdicts themselves** — that is the real gate, and it is
a judgment review, not a mechanical one.

## Retrospect

- **What changed in our understanding:**
  - **The flag-store question was not the question the WBS thought it was.** It framed candidate 1's cost as write *amplification* (bytes). The real disqualifier is a **correctness** hazard: `projects.json` writes are whole-file RMW, and the flag's set-on-open is co-triggered by `add_or_touch`'s recency stamp **on the same click**, so the two writes clobber each other. Byte cost would have been an acceptable tradeoff; a silent lost update that disables auto-resume is not. **The category of the objection changed, not just its size.**
  - **"Reuse the precedent" needed a second question.** `default_model` looked like the obvious model for the announce query, and the plan said so. It is the right precedent for *a field already read and parsed* and the wrong one for *work that adds a filesystem stat*. What settled it was reading the **consumer set**, not the precedent: two of three `list_projects` callers want only `.length`.
  - **A guard's header is part of the guard.** Two MAJORs at review were both cases of the header claiming coverage the assertions did not deliver — and this repo has paid for that shape repeatedly. The lesson is sharper than "test your guards": **an overclaiming comment is worse than no comment**, because it retires the reader's suspicion.

- **Assumptions that held:**
  - `.session.md` presence is cheap to batch — measured 0.123 ms at N=100, so read-at-picker-open needed no cleverness.
  - `SessionRegistry::spawn` already carries `project_path` + `data_dir`, so set-on-open needs no signature change (confirms WP2's M-not-L sizing).
  - The operator's category call (machine-local, not a preference) was decisive and correct; it eliminated candidate 2 on meaning before any measurement.
  - `wbs.md`'s "Scope-audit findings" were accurate where checked — every cited `file:line` resolved at ship SHA.

- **Assumptions that were wrong:**
  - **Plan-time hypothesis "candidate 1 loses on write amplification"** — right verdict, wrong reason. Measured 27.9×, then found the lost-update hazard that actually decides it.
  - **Plan-time expectation "widen the payload, per `default_model`"** — reversed on the consumer-set evidence.
  - **Phase 2's own observable encoded the wrong conclusion** ("cite the precedent it *is following*"), and I left it un-amended when the verdict inverted it. A mechanical grep now reports a miss on a phase marked `[x]` — logged as a MINOR.
  - **Three of my own verification instruments were wrong before they were right:** a WIP-tree validator that reported 8 false failures, then one that passed *vacuously* (21 leaves collapsed to 2), then a parent-completion predicate that false-positived on a later phase's open node. Plus a mutant that "proved a guard hole" by modifying a deliberately-exempt phase header. **In every case the tooling was wrong and the artifact was fine** — and in one I nearly weakened a correct guard on that false signal.

- **Approach delta:**
  - Plan said 2 phases, 5 leaves each, half-day timebox — delivered exactly that. Both verdicts landed in `wbs.md` → "Probe outcomes" as specified.
  - **Unplanned:** two codified guards (the plan anticipated "at most a probe harness"). Justified — each pins a *premise a verdict reasons from*, which is the only durable thing a probe can hand forward.
  - **Unplanned:** a self-inflicted parse error while documenting the fix — a JSDoc containing `^\s*//` whose `*` + `/` terminated the block comment (5 tsc errors). Diagnosed with a 5-line fixture rather than guesswork.
  - Verification ran fully agent-side as the plan predicted (no live app, no MCP bridge, no operator drive) — correct call for a docs/measurement phase.

## Code-Quality Review — m12-wp1-probe-flag-store-and-announce

*(feature-review-quality, 2026-08-03, against ship baseline `8c6b7c9..cc3dfa2`. 0 CRITICAL / 3 MAJOR / 5 MINOR.
Each finding below was independently re-verified by the orchestrator before acceptance — all three MAJORs
reproduce exactly as described.)*

### Strengths
- Both verdicts record an explicit **reopening condition** and a reject-reason per candidate, so a future reader inherits the decision *and* the conditions under which it is wrong.
- The verdicts overturn their own plan-time hypotheses in two places (write-amplification → lost-update; "widen the payload" → sibling command) and *say so*, keeping the plan-time finding visible next to the correction.
- Every cited line reference is accurate at ship SHA (`config_store/mod.rs:115-122`, `ProjectPicker.tsx:145-146`, `App.tsx:310`/`:702`, `settings.rs:291`, `cc_session/mod.rs:788-800`). No drift.
- The Rust hazard test is genuinely non-duplicative: the pre-existing `set_default_model_on_one_project_leaves_every_field_of_the_others_untouched` covers only the sequential case and passes either way.
- `listProjectsConsumers.test.ts` is not duplicative of `nPlusOneObservable.test.ts` — that sibling counts the model *cell's* mount-time reads; this pins the *call-site shape* in real source.
- Verdict (b)'s explicit anti-lesson ("do NOT read this as 'per-row would have been fine'") pre-empts the exact misreading, and the staleness window is a numbered event sequence rather than a caveat sentence.

### Issues

**CRITICAL**
- (none)

**MAJOR**
- [`listProjectsConsumers.test.ts:73-79`] **Field-access negatives are variable-name- and syntax-form-bound.** `not.toMatch(/projects\[\d+\]\./)` + `not.toMatch(/projects\.map\(/)` miss realistic mutants: a `for (const p of projects) { use(p.default_model) }` consumer passes both, as does any consumer naming the variable `rows`/`list`. The header claimed "an App.tsx consumer switching to field access would be caught"; the calibration block only fed the matcher a literal string it constructed itself. Same shape as `[[guard-predicate-completeness-vs-mutation-landing]]`. **Mitigating:** the *decisive* assertions (call-site count == 3; exactly-2 `setInviteProjectCount(projects.length)`) DO bite on real mutants, so the verdict's protection is real — the advertised margin was thinner than stated. → **FIXED 2026-08-03** (see Resolution below).
- [`listProjectsConsumers.test.ts:44-47`] **`stripComments` is one-directional.** `/^\s*\/\/.*$/gm` strips a `//` comment only when it is first non-whitespace on the line, so a *trailing* commented-out call (`foo(); // await invoke(...)`) counts as a real call site (verified: returns 1). Blast radius is a false *failure*, not a false pass — annoying, not dangerous — but it contradicted a stated property. → **FIXED 2026-08-03** (see Resolution below).
- [`wbs.md` Verdict (a)/(b) measurement citations] **The three measurement scripts are session-scratchpad-local and absent from the repo.** The 27.9× amplification figure and the 0.022/0.051/0.123 ms table therefore have no surviving provenance, while Phase 2's own observable required the measurement be "reproducible by re-running the script the phase writes." The lost-update fact *is* now pinned by the Rust test (the right answer); the two performance numbers are not. → **BACKLOGGED** (see below) with the numbers relabelled in `wbs.md` as one-shot observations.

**MINOR**
- [`listProjectsConsumers.test.ts:96-101, :140-146`] `interface RecentProject\s*\{[\s\S]*?\}` truncates at the first `}`, so a nested-object field defeats the smuggling assertion (verified). Latent — the wire type is flat today.
- [`wbs.md` / WIP Phase 2 observable] The observable required citing `ProjectPicker.tsx:38-42` "as the precedent it **is following**"; the verdict correctly *reversed* that and cites the precedent as declined, by name rather than by line. Observable left un-amended, so a mechanical grep would report a miss on a phase marked `[x]`.
- [`src/App.tsx:306-308`] Pre-existing M10.9 comment says "Verdict (b)'s requirement"; this commit introduces a *different* "Verdict (b)" in the same milestone whose reasoning cites the same call site. Two live "Verdict (b)"s on one line. A one-word qualifier (`M10.9 Verdict (b)`) would settle it.
- [`config_store/mod.rs` hazard-test doc comment] 16 lines of doc for a 40-line test. The ⚠️ paragraph is load-bearing; the paragraph re-explaining the pre-existing sequential test is one sentence in five lines. Mildly over-long, not the DocsPanel pattern.
- [`runtimes.md`] `pnpm test` history bullet says `5s wall` while `**Last:**` says `3s wall` for the same run/date. → **FIXED 2026-08-03.**

### Assessment
A well-built probe that discharges its actual contract: the two verdicts are decisive, internally consistent, accurately cited, and carry their own falsification conditions. Pinning each verdict's *premise* rather than the decision is the right instinct, and the assert-the-hazard-exists inversion is sound rather than a trap. The debt accrued is confined to **guard calibration honesty** — the `?raw` header claimed broader coverage than its weaker assertions delivered, and comment-stripping was one-directional; both are lessons this repo has already paid for, and both are cited in that very header. The unreproducible measurement scripts are the one thing a future reader is actually blocked by.

### Resolution (orchestrator, 2026-08-03)
Two MAJORs were **fixed in place** rather than backlogged: both were inaccurate claims in a header written in this same commit, and shipping a guard whose header overstates its coverage is precisely the failure mode the file cites. Fixing text about a guard is not a refactor of the guard.
- **MAJOR 1** — negatives rewritten to be variable-name-agnostic and form-agnostic (any `.field` access on the awaited result, any iteration form), with three previously-missed mutants added to the calibration block as real inputs. Header claim narrowed to what is actually asserted.
- **MAJOR 2** — `stripComments` now strips trailing `//` comments too, with the previously-passing trailing-comment mutant added to calibration.
- **MAJOR 3 (measurements)** — **BACKLOGGED**, not fixed: relocating throwaway spike scripts into `tooling/` is a scope decision, not cleanup. Mitigated now by relabelling the figures in `wbs.md` as one-shot observations with their method stated inline, so the doc no longer cites evidence a reader cannot reach.
- **MINOR (runtimes.md wall-time)** fixed. The other four MINORs backlogged.

### If you disagree
Dismiss any finding by editing this section and marking the line `[DISMISSED]` before `feature-finalize` archives this WIP.

## Discoveries

[CODIFIED-2026-08-03] Phase 2 verify-codify — Added `listProjectsConsumers.test.ts` (11 tests),
pinning the PREMISE Verdict (b) reasons from: `list_projects` has exactly 3 call sites, and the
two in `App.tsx` are count-only (`invoke<unknown[]>` → `projects.length`), which is *why*
widening was rejected. Also asserts no announce field gets smuggled onto `RecentProject`.
**Mutation-proven against real source edits** (not just the built-in calibration block): a 3rd
consumer, an App.tsx consumer switching to field access, and widening `RecentProject` each fail
the specific assertion they should — and the guard still bites AFTER Prettier reflowed the file
(the failure mode that silently disarmed a `?raw` guard in M10.9 WP2). Both mutated source files
verified byte-identical to HEAD afterward. The sibling `nPlusOneObservable.test.ts` covers the
model CELL's read count, not this call-site shape, so this is not duplicate coverage.

[CODIFIED-2026-08-03] Phase 1 verify-codify — Added `interleaved_whole_file_writes_lose_the_earlier_writers_edit`
(`config_store/mod.rs`), which pins the ONE fact Verdict (a) reasons from: `write_projects`
serializes the whole slice, so two writers that each read-modify-write lose each other's edits.
**Mutation-proven** — making `write_projects` merge per-record (the verdict's own "reopening
condition") makes it fail with `left: 999, right: 100`; the mutation was confirmed present in
executable code (lines 118-127) before believing the failure, per `[[verify-the-mutation-landed]]`.
The pre-existing `set_default_model_on_one_project_leaves_every_field_of_the_others_untouched`
covers only the SEQUENTIAL case and passes either way, so it was not duplicate coverage.
⚠️ This test asserts the hazard EXISTS; if it ever fails, update the SURFACE + Verdict (a)'s
reopening condition rather than deleting it.

[SURFACED-2026-08-03] Phase 1 — Candidate 1 (`projects.json`) was rejected for a **lost-update
hazard**, not the write-amplification cost the plan hypothesized. Every `projects.json` write is
a whole-file read-modify-write, and the flag's set-on-open is co-triggered by `add_or_touch`'s
recency stamp on the same click, so one write silently discards the other's field. M12 side-steps
it (own store), but the general hazard outlives M12 — logged as
`SURFACE-2026-08-03-PROJECTS-JSON-WRITERS-ARE-WHOLE-FILE-RMW` (medium).

<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->

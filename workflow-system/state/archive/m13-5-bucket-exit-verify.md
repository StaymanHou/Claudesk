---
workflow: feature
state: COMPLETED 2026-08-26
created: 2026-08-26
drive_mode: autopilot
source: workflow-system/product/wbs.md#wp5-bucket-exit-verify
---

# Feature: M13.5 WP5 — Bucket exit verify

**Workflow:** feature
**State:** plan (complete)
**Created:** 2026-08-26
**Source:** `workflow-system/product/wbs.md` → `## WP5: Bucket exit verify` (XS, 3 tasks)
**Drive mode:** autopilot (also in YAML frontmatter above — the frontmatter is what the
verify-human auto-skip gate reads; a body-line-only mode fails gate (a) and silently
downgrades the phase to Mode 2)

## Problem Statement

M13.5 shipped four WPs (WP1 window-state persistence, WP2 the `BackgroundWork` fourth status
state, WP3 turn-output jump navigation, WP4 drive-mode readout + confirm-gated apply). Each was
verified at its own verify-human gate against the surface it changed, but nothing has yet checked
that the four coexist in one running app, and the cycle's durable records are not fully reconciled:
`arch/status-channel-and-surfaces.md` still describes the status model as three states, and
`backlog.md` carries a stale duplicate of the pre-WP3 TURN-OUTPUT entry that contradicts its own
rewritten version. This WP closes the bucket: prove the shipped surfaces coexist live, reconcile
the records, and archive the cycle.

## Findings that reshape the WBS's own task list

⚠️ These were established by reading the tree during planning. They change what 5.1–5.3 mean, and
the plan below is written to the findings, not to the WBS's original phrasing.

1. **⚠️ 5.2 IS ALREADY DONE — do not redo it, and do not "resolve" these items again.** All four
   source items were CHANGELOG'd and deleted/rewritten *inside their own WPs*, per the
   delete-on-resolve invariant (CHANGELOG lines 13, 18, 19, 24 of `CHANGELOG.md`). WP1's, WP2's two,
   and WP4's (no entry — direct ask) are gone from `backlog.md`; WP3's survives correctly **rewritten
   to the remaining open work** (partial-resolution carve-out). ⚠️ Re-emitting `**Backlog resolved:**`
   lines for them would double-count the paper trail. **5.2's remaining work is a DEFECT, not the
   append:** see finding 2.
2. **⚠️ A STALE DUPLICATE of the pre-WP3 TURN-OUTPUT entry survives** at `backlog.md` lines
   **564–586**, headed by a mangled `` ## ` heading `` (the WP3 rewrite inserted the new body and the
   old body was never removed — the rewrite half of delete-on-resolve was done, the delete half was
   not). ⚠️ **It is a live confabulation channel, not cosmetic:** its text still lists
   *"Turn-boundary markers in the terminal"* as an **undecided** solution direction and carries a
   `Status: deferred` line, i.e. it asserts as open exactly the work WP3 shipped. A future reader
   grepping for the ID hits two bodies that disagree. It also breaks heading-scan findability, which
   is the *same* defect class the entry's own 2026-07-31 comment records being fixed once before.
3. **⚠️ 5.3's CONDITIONAL IS TRUE — WP2 added a state and the arch doc does NOT know.**
   `arch/status-channel-and-surfaces.md` describes `WorkspaceStatusUpdate { state:
   Idle|Running|AwaitingInput }` (line 40) and the frontend indicator as
   "Idle / Running / AwaitingInput / Unknown" (line 48); `grep` for `BackgroundWork` / `background_work`
   / `a371f7` returns **zero hits**. Per `CLAUDE.md`, *the `arch/` set is the authority* — so this is
   not a missing note, it is the authority actively stating a refuted three-state model.
4. **⚠️ 5.1's INSTALLED-`.app` TIER IS NOT SATISFIABLE — and the reason is not the lesson the WBS
   cites.** The WBS and the handoff both frame this as *"the operator defers installed-build
   verification to `/release`"* (`[[installed-build-verify-deferred-to-release]]`). True, but
   secondary. The **blocking** fact is that the installed `.app` is **v0.3.4**, which predates all
   four WPs — WP1's code is not in it. Proven without a launch: the prod identity has **no**
   `~/Library/Application Support/com.claudesk.app/.window-state.json`, while the dev identity has
   one (209 B, written 11:05 today). ⚠️ So "verify WP1 on the installed build" would require
   **cutting a release first**, which `/release` is manual-only and out of an XS exit-verify's scope.
   **Do not silently substitute the dev build and call the tier met** — Phase 2 records the tier as
   deliberately deferred, names the release as its gate, and verifies the dev tier honestly.

## Work Tree

- [x] Phase 1: Reconcile the durable records  <!-- status: done -->
  **Observable outcomes:**
  - CLI: `grep -c '^## SURFACE-2026-07-14-TURN-OUTPUT-REORIENTATION' workflow-system/state/backlog.md` → exactly `1`
  - CLI: `grep -c '## ` heading' workflow-system/state/backlog.md` → `0` (the mangled orphan heading is gone)
  - CLI: `grep -c 'Turn-boundary markers in the terminal:\*\* a visual delimiter' workflow-system/state/backlog.md` → `0` (the pre-WP3 "undecided" phrasing is gone; the `~~struck~~ SHIPPED` line in the surviving body remains)
  - CLI: `grep -c 'BackgroundWork' workflow-system/product/arch/status-channel-and-surfaces.md` → `≥1`
  - CLI: `grep -c 'a371f7' workflow-system/product/arch/status-channel-and-surfaces.md` → `≥1`
  - CLI: `awk` over `backlog.md` reports every `^## ` heading matches `^## (SURFACE-|Code-quality findings|Buried)` — no malformed headings anywhere in the file
  - CLI: `git diff --stat` touches only `backlog.md` + `arch/status-channel-and-surfaces.md` (+ `wbs.md` task ticks) — no code files
  - [x] P1.1 Delete the stale orphan block at `backlog.md` 564–586 (the mangled `` ## ` heading `` through its trailing `Status: deferred` line, up to the next `## SURFACE-` heading). ⚠️ **Delete the DUPLICATE, keep the REWRITE** — the surviving body is the one at line 520 carrying `⚠️ PARTIALLY RESOLVED 2026-08-25`. Diff-read both before cutting; they are 90% similar prose and the wrong cut silently reverts WP3's record. ⚠️ **No CHANGELOG line is owed** — this is removing a duplicate of an already-recorded partial resolution, not resolving anything (finding 1).  <!-- status: done -->
  - [x] P1.2 Verify no OTHER malformed heading exists in `backlog.md`. ⚠️ **The orphan was found by accident** while reading around the TURN-OUTPUT entry — the same defect class already recurred once here (fixed 2026-07-31, per the entry's own comment). Scan every `^## ` line against the expected shapes and report; fix any other orphan found, or state explicitly that there are none.  <!-- status: done -->
  - [x] P1.3 Resync `arch/status-channel-and-surfaces.md` to the **four**-state model (finding 3): add `BackgroundWork` to the `WorkspaceStatusUpdate` state list (line ~40), to the frontend indicator list (line ~48), and record the source signal + colour — `Stop`'s structured `background_tasks[]` array, purple `#a371f7`. ⚠️ **Record the two corrections WP2 established, not just the addition:** (a) the `SubagentStop`-as-missing-clearing-edge diagnosis was **refuted** — the real cause was `agent_completed` falling through the unknown-type fallback (the doc's line 24 already lists `agent_completed` as informational, so the gate text is current — verify before editing); (b) teal was operator-**rejected** for reading blue-adjacent. Also record `tray::aggregate_alarm`'s exhaustive match, so a 5th state fails to compile.  <!-- status: done -->
  - [x] P1.4 Update `CLAUDE.md`'s status-channel bullet if it still asserts three states. ⚠️ **Check, don't assume** — its `PostToolUse` / `Notification`-gating text was already corrected at WP2, so this may be a no-op. Do NOT expand `CLAUDE.md` (it is over the 40k warn threshold and the operator declined a prune); if a correction is owed, make it in place at equal-or-shorter length.  <!-- status: done -->
  - [x] verify-auto  <!-- status: done -->
  - [x] verify-self  <!-- status: done -->
  - [x] verify-human  <!-- status: done (AUTO-SKIPPED, drive_mode=autopilot, no integration boundary) -->
  - [x] verify-codify  <!-- status: done -->

- [x] Phase 2: Live coexistence verify of the four shipped surfaces  <!-- status: done; P2.3 PARTIAL by operator-approved decision -->
  **Relevance check (before Phase 2):**
  - Requester still needs this: **yes** — WP5 is the bucket's exit gate; without a live coexistence pass the four WPs were each verified only against their own surface, never together.
  - Requirements unchanged: **yes** — Phase 1 changed only docs, so nothing about Phase 2's targets moved. ⚠️ One *sharpening*, not a change: Phase 1 confirmed the arch doc's four-state claim against source, so the purple-dot outcome now has a known-correct spec to check against rather than a stale one.
  - Solution still feasible: **yes** — dev app builds (`verify:auto` exit 0), fixtures present (`scratch-{a,b,c}`), ports 1420/9223 free, nothing running.
  - No superior alternative discovered: **yes** — the installed-`.app` tier would be superior for WP1 but is **not available** (v0.3.4 predates the plugin; see P2.4). The dev tier is the best available, and the deferral is recorded rather than substituted.
  **Verdict:** proceed
  **Observable outcomes:**
  - CLI: `pnpm verify:auto` exits 0; Rust test count ≥ 883 and frontend ≥ 2260 (the WP4 close gate — a DROP means a test was lost, not that nothing changed)
  - CLI: production `pnpm vite build` exits 0
  - Browser (dev app, MCP bridge): a workspace header simultaneously shows **WP4's** drive-mode readout and **WP3's** `↑ N/N ↓` jump cluster; DOM query returns both, non-empty
  - Browser: WP3's jump cluster advances the xterm viewport — read `viewportY` before/after a `↓` click and assert it **changed** (⚠️ not merely that the click landed: the shipped WP3 defect was a viewport **clamp** the caller misread as success)
  - Browser: WP4's readout, clicked, raises the confirm; **Cancel is a true no-op** — `projects.json`'s `default_drive_mode` byte-identical before/after
  - Browser: with the status map seeded to `background_work` via the React fiber, the filmstrip tile renders purple `#a371f7` — computed style, not source text
  - Browser: with `workflow_features_enabled` OFF, the drive-mode readout is absent AND the WP3 jump cluster is **present** (⚠️ the two differ deliberately: WP4's readout is gated, WP3's cluster is ungated by design — asserting both under one gate would fake a pass)
  - CLI: `.window-state.json` under the **dev** identity updates its `width`/`height` after a resize + relaunch (WP1, dev tier — see the installed-tier note below)
  - Console: no JS errors across the session (⚠️ via a self-tested tap + `#root`-has-children boot check — `read_logs{source:"console"}` captures nothing for this app and an empty read is a FALSE GREEN)
  - [x] P2.1 Launch the dev app (`pnpm tauri:dev`) and run a **boot smoke-test first** — assert `#root` has children before trusting any observation. ⚠️ Phase 1 edits only docs, so a blank-app risk is low, but the M13.5 WP3 lesson is that a green `tsc` + green `verify:auto` coexisted with a blank app for a whole phase.  <!-- status: NOT-STARTED -->
  - [x] P2.2 Verify the four surfaces coexist per the outcomes above, on **scratch workspaces** (`tmp/scratch/scratch-{a,b,c}`) — mandatory once a check spawns or answers a CC session. ⚠️ Fixture state to expect: `scratch-a`'s stored mode is `orchestrated`; `scratch-b`/`scratch-c` are unset.  <!-- status: NOT-STARTED -->
  - [~] P2.3 **Reproduce the known WP4 queued-apply defect and confirm it is the backlogged one, not a new one.** ⚠️ It is a LIVE user-facing defect already filed (4 MAJOR + 4 MINOR, 0 CRITICAL, findings 1/2/4 share a `useDriveModeApply` fix): behind a **busy** agent the readout stays clickable and a second Apply is silently discarded while the readout shows the new value. Every prior live verification missed it because they all ran against an **idle** session. ⚠️ **Do NOT fix it here** — an XS exit-verify does not absorb a MAJOR refactor; confirming the filed description is accurate is the deliverable. If it reproduces differently than filed, correct the filing.  <!-- status: NOT-STARTED -->
  - [x] P2.4 **Record WP1's installed-`.app` tier as deliberately DEFERRED, with its real gate named** (finding 4): the installed build is v0.3.4 and predates the plugin — proven by the prod identity having no `.window-state.json` while dev does. Write this into the WP5 close so the deferral is legible as a decision, not an omission; the tier is met at the next `/release`. ⚠️ Do NOT cut a release to satisfy it, and do NOT record the dev-tier pass as if it were the installed tier.  <!-- status: NOT-STARTED -->
  - [x] P2.5 Tear down PID-scoped. ⚠️ **Never blanket-`pkill claudesk`** — it killed the operator's live app once (2026-07-13), and dev/prod share a process name. Target by the PID we launched. A Vite on **:5173** belongs to the operator's other project — leave it.  <!-- status: NOT-STARTED -->
  - [x] verify-auto  <!-- status: done -->
  - [x] verify-self  <!-- status: done; 8 PASS / 1 FAILED-cosmetic (WP3 viewport un-run) -->
  - [x] verify-human  <!-- status: done; operator approved both leaves 2026-08-26 -->
    - [x] P2.verify-human.1 WP3 viewport-advance — operator-approved  <!-- status: done; operator accepted, rides on WP3's own 2026-08-25 verify-human sign-off -->
    - [x] P2.verify-human.2 Two deliberate scope deferrals accepted  <!-- status: done; operator approved -->
  - [x] verify-codify  <!-- status: done -->

- [x] Phase 3: Close the bucket  <!-- status: done -->
  **Relevance check (before Phase 3):**
  - Requester still needs this: **yes** — the bucket cannot close without the WBS ticks, the CHANGELOG milestone line, and the cycle archive.
  - Requirements unchanged: **yes**, with two *sharpenings* from Phases 1–2, not changes: (a) 5.2's CHANGELOG/delete-on-resolve work was already done inside the WPs, so P3.1 records that rather than repeating it; (b) 5.3's conditional arch resync was already executed in Phase 1, so `/product-finalize` inherits it done.
  - Solution still feasible: **yes** — `verify:auto` exit 0 (Rust 886 / frontend 2261), tree clean apart from this WP's own edits, nothing running.
  - No superior alternative discovered: **yes** — `/product-finalize` is the defined instrument for a cycle close; nothing cheaper would archive the cycle docs or resync `roadmap.md`.
  **Verdict:** proceed
  **Observable outcomes:**
  - CLI: `CHANGELOG.md` has a `**Milestone:**` line for M13.5 under today's date
  - CLI: `workflow-system/product/archive/milestone-13.5-qol-polish-bucket/wbs.md` exists; `workflow-system/product/wbs.md` no longer holds the M13.5 cycle
  - CLI: `workflow-system/state/wip/` is empty
  - CLI: `git status --porcelain` is empty after the close commit
  - [x] P3.1 Tick WP5's 5.1/5.2/5.3 in `wbs.md` with the findings recorded — including that **5.2 was already satisfied** and what 5.1's deferral actually rests on. ⚠️ A WP that closes by discovering its own tasks were done differently than written must say so; the corrections are the deliverable (the WP2/WP3 precedent).  <!-- status: NOT-STARTED -->
  - [x] P3.2 Run `/product-finalize` — resync `roadmap.md`'s M13.5 line, sweep the backlog, archive the cycle docs to `workflow-system/product/archive/milestone-13.5-qol-polish-bucket/`. ⚠️ **CHANGELOG appends before any `git mv`**, staged in the same commit.  <!-- status: NOT-STARTED -->
  - [x] P3.3 Update `CLAUDE.md`'s `## Current Milestone` to M15 (the settled next: M13.5 → **M15** → M14). ⚠️ **Do NOT "correct" the order back to M14-first** — it deliberately reverses `roadmap.md`'s own lean and is the operator's recorded call. Keep the edit length-neutral (40k threshold).  <!-- status: NOT-STARTED -->
  - [x] verify-auto  <!-- status: done -->
  - [x] verify-self  <!-- status: done; 11 PASS / 5 FAILED-cosmetic (4 pending P3.2 + 1 real defect, FIXED) -->
  - [x] verify-human  <!-- status: done; .1 unblocked + verified after P3.2, .2 operator-approved -->
    - [x] P3.verify-human.1 The four close outcomes — verified after P3.2  <!-- status: done; 3 of 4 exact, the 4th (empty wip/) holds only this WP's own file, archived by feature-finalize -->
    - [x] P3.verify-human.2 CLAUDE.md milestone rewrite — operator approved 2026-08-26  <!-- status: done -->
  - [x] verify-codify  <!-- status: done -->

## Current Node
- **Path:** Feature > COMPLETED
- **Active scope:** none. Shipped `ee237a3` · reviewed (1 CRITICAL/2 MAJOR/2 MINOR) · refactored `03bd569` · finalized 2026-08-26. — it is a SKILL invocation, not inline work, and runs after this verify chain. ⚠️ **P2.3 is PARTIAL, not done** — the queued-apply defect was NOT reproduced (it needs a busy agent); the idle-path half of WP4 was verified instead. See the Phase 2 notes.
- **Blocked:** none
- **Unvisited:** (none — Phase 3 is current)
- **Open discoveries:** 2 logged to backlog.md as SURFACE-2026-08-26-DELETE-ON-RESOLVE-REWRITE-PATH-SKIPS-THE-DELETE and SURFACE-2026-08-26-NO-GATE-FAILS-WHEN-A-SHIPPED-STATE-HAS-NO-ARCH-MENTION

## Phase 1 build notes (2026-08-26)

- **P1.1 — root cause of the orphan is more specific than the plan assumed, and worth recording.**
  The duplicate was not a stray paste: the surviving entry's own HTML comment contains the literal
  text ``## `` (in the phrase *"lost its `## ` heading"*). When the WP3 rewrite was inserted, the old
  body was left behind **with its opening comment truncated**, so the comment's interior became a
  top-level heading — `` ## ` heading `` — and the rest of the old body reattached under it. ⚠️ **So
  the orphan and the 2026-07-31 orphan share one mechanism: a comment containing `##` at line-start
  can manufacture a heading when the block around it is edited.** Cut at 620–637, keeping 576–619.
- **P1.2 — no other malformed heading.** Every `^## ` line in `backlog.md` matches
  `SURFACE-` / `Code-quality findings` / `Buried`; zero duplicate SURFACE IDs; the same scan is clean
  on `backlog-quality-findings.md`. Reported rather than assumed, per the task.
- **P1.3 — ⚠️ the plan (and `wbs.md`, and the CHANGELOG line) said `background_tasks[]` array; the
  as-built signal is `background_task_count > 0`, a COUNT.** Corrected in the doc as written, not as
  planned. The distinction is load-bearing and was a deliberate **privacy** decision the arch doc did
  not record: `Stop` carries `background_tasks: [{id, type, status, description, command}]`, but
  `command`/`description` are arbitrary user shell text — prompt-class privacy — so the hook forwards
  only the array's length (mirroring `prompt_length_chars`). Also recorded: `None`/`Some(0)`
  indistinguishable (undocumented upstream field + stale-hook degradation), the rejected PID watchdog
  (a session exit kills its jobs), `BackgroundWork` ranking **Neutral** in `aggregate_alarm`, the
  exhaustive-match-so-a-5th-state-fails-to-compile property, and the operator-rejected teal.
- **P1.3 — narrower gap than finding 3 stated.** Line 24's `notification_type` gate text **already**
  listed `agent_completed` as informational (WP2 updated it). The staleness was confined to the
  **state enum** (line 40) and the **frontend/palette** (line 48) — the event mapping was current.
  Finding 3 as written overstated it; the correction is recorded here rather than left implied.
- **P1.4 — ⚠️ NOT length-neutral: `CLAUDE.md` grew 111 bytes** (41282 → 41393), after a first pass at
  +175 was tightened. Stated rather than claimed neutral. Lines 10 and 14 also say
  "idle/running/awaiting-input" but were **deliberately left alone** — they are Phase-1/Phase-2
  *vision* prose describing the original concept, not as-built spec; only line 165 (the as-built rule)
  was corrected.

## Assumed (⚠️ NOT operator-reviewed — do not cite downstream as approved)

⚠️ This section exists because WP4's rejected interaction model came from a default recorded here
and then cited downstream as "operator-reviewed" when it never was. **An unchallenged assumption is
not an approved one.** Anything below is the agent's default, live for challenge at any gate.

- **A1.** The stale orphan (finding 2) is deleted rather than repaired into a second distinct entry.
  Rationale: it is a verbatim-ish duplicate of an entry that already exists in its correct rewritten
  form, and its content is refuted. **Challengeable** — if the operator wants the pre-WP3 text kept
  as history, it belongs in the archive, not in open-work backlog.
- **A2.** No `**Backlog resolved:**` CHANGELOG line is emitted in this WP (finding 1). Rationale:
  all four items were already recorded at their own closes; re-emitting double-counts.
- **A3.** The WP4 queued-apply defect is confirmed-and-left-filed, not fixed (P2.3). Rationale: 0
  CRITICAL means no refactor is owed, and an XS exit-verify absorbing a MAJOR is scope creep.
  **Challengeable** — the operator may want it pulled into this WP given it is user-facing.
- **A4.** WP1's installed tier defers to `/release` rather than triggering one now (P2.4).

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->
- [SURFACED-2026-08-26] Phase 1 / P1.1 — `backlog.md` carries a stale duplicate of the pre-WP3 `SURFACE-2026-07-14-TURN-OUTPUT-REORIENTATION` body (lines 564–586) under a mangled `` ## ` heading `` heading, asserting as undecided the work WP3 shipped. This is the delete-half of delete-on-resolve being skipped during a partial-resolution **rewrite** — a failure mode the invariant's wording does not currently call out (it covers full-resolution deletes, not the rewrite path). Fixed in P1.1; the **class** is worth a backlog entry against the workflow-system's delete-on-resolve prose.
- [SURFACED-2026-08-26] Phase 1 / verify-human — the WIP file this plan wrote had **no YAML frontmatter**; `drive_mode` was recorded only as a `**Drive mode:** autopilot` body line. The verify-human auto-skip gate (a) reads `drive_mode` from **frontmatter** and its documented fallback is "no field → treat as Mode 2 → do NOT auto-skip". So a correct autopilot session would have silently downgraded to a Mode-2 human pause on every phase — a mode the operator did not choose, caused by a file-shape defect rather than by any policy. ⚠️ The failure is silent and reads as normal (a pause looks like a pause), which is why it is worth a guard: `feature-plan` should emit the frontmatter block, and/or the gate should fall back to the body line before defaulting to Mode 2. Fixed in place this phase.
- [SURFACED-2026-08-26] Phase 1 / P1.3 — `arch/status-channel-and-surfaces.md` went four days describing a refuted three-state status model after WP2 shipped a fourth state, with nothing catching it. `arch/` is declared *the authority* over `roadmap.md`, so a stale arch doc outranks the correct record. There is no gate that fails when a shipped state/enum has no `arch/` mention; the WP-close checklist relies on the closing agent remembering. Worth a mechanical guard.

## Phase 1 verify-auto (2026-08-26)

**Scope:** Phase 1 changed **markdown only** — no TS, no Rust, no code path. `pnpm verify:auto` (the
full per-phase gate) is therefore **not the right instrument here** and was deliberately not run at
this node; it is Phase 2's outcome, where it guards the shipped code the live verify exercises.
Checks were scoped to the four changed files.

| # | Check | Result |
|---|---|---|
| 1 | Changed files are docs-only | **PASS** — 4 files, all `.md`, zero non-`.md` |
| 2 | Changed docs are `.prettierignore`d | **PASS** — `CLAUDE.md` + `workflow-system/` both listed; `prettier --check` exits 0 matching nothing |
| 3 | HTML comments balanced | **PASS** (after correcting the check — see below) |
| 4 | No line-start `##` inside a comment | **PASS** — 0 risky lines; the surviving entry's `` ## `` is mid-line, which is safe |
| 5 | Every SURFACE block has `**Priority:**` | **PASS** — 39/39 |
| 6 | Arch edits land in prose, not inside the mermaid fence | **PASS** — lines 40/48/69, none fenced |
| 7 | Arch diff is 3 in-place replacements, no accidental deletion | **PASS** — 3/3 |
| 8 | WIP Work Tree well-formed | **PASS** |

⚠️ **TWO OF MY OWN CHECKS WERE FALSE POSITIVES — recorded because the instrument, not the code, was
wrong, and both are the shape `[[invalid-probe-and-real-hole-look-identical]]` warns about:**

1. **Check 2 first reported "prettier would touch (NOT ignored)" for all four files.** The predicate
   was inverted: `--check` exits non-zero for *both* "would reformat" **and** nothing-matched, and I
   had discarded the output that distinguishes them. Re-run with output shown: *"All matched files use
   Prettier code style!"*, exit 0. ⚠️ Had I trusted the first reading I would have "fixed"
   `.prettierignore` — which is correct as-is and deliberately protects this prose.
2. **Check 3 first reported `status-channel-and-surfaces.md` UNBALANCED (open=1, close=6).** The five
   extra `-->` are **mermaid arrows** (`A -- label --> B`) in the diagram, not comment terminators.
   Confirmed pre-existing by `git show HEAD:` — identical 1/6 counts before my edit, so the file was
   never unbalanced and I did not change it.

**Verdict:** no code was changed, so there is nothing for a compiler, linter, or test runner to
disagree with; the doc-structural properties the phase actually asserts all hold.

## Phase 1 verify-self (2026-08-26)

**No integration boundary** — the phase modified markdown prose only: no endpoint, route, UI page,
CLI command, job, or outbound call was touched, so there is no consuming surface to cite. Subagent
spawned anyway (the spawn is unconditional per `arch.md` 2026-04-27 — the design property is parent
context cleanliness, not tool availability); it ran Bash/Grep/Read only, no browser.

**Result: 7/7 PASS · 0 BLOCKING · 0 COSMETIC.**

| Outcome | Result |
|---|---|
| TURN-OUTPUT heading count == 1 | PASS — single heading at L576 |
| line-start `` ## ` heading `` == 0 | PASS — 0; the 2 remaining (L529, L577) are **mid-line inside prose/comment**, deliberately quoting the prior orphan |
| pre-WP3 "undecided" phrasing == 0, struck-SHIPPED survives | PASS — 0 and 1 respectively |
| arch has `BackgroundWork` | PASS — **3** hits, at L40 (DTO contract), L48 (frontend indicator), L69 (tray ranking) |
| arch has `a371f7` | PASS — L48, with the rejected-teal prior |
| all backlog headings well-formed, no duplicate IDs | PASS — 64 headings, 0 malformed, 0 dupes |
| diff is docs-only, no code | PASS — 4 `.md` paths; `\.(ts|tsx|rs|json|css|js|jsx)$` matched nothing; nothing staged |

**Four independent skeptical checks — all confirmed:**

- **(a) The RIGHT body survived.** The surviving entry is the **post-WP3 rewrite** — quoted evidence:
  L582 `⚠️ PARTIALLY RESOLVED 2026-08-25 by M13.5 WP3`, L600
  `~~**Turn-boundary markers in the terminal**~~ — ✅ **SHIPPED M13.5 WP3**`. The deleted block was the
  original (carried `Status: deferred` and listed that direction as undecided). ⚠️ This was the
  highest-risk step of the phase — two 90%-similar bodies, and the wrong cut would have silently
  reverted WP3's record while every other outcome still passed.
- **(b) No collateral deletion.** `backlog.md` = **+56 / −18**; the 18 deletions are exactly one
  contiguous run (the orphan, ending at its `Status: deferred` line), the 56 insertions are the two
  new 2026-08-26 entries. No other hunks. Net: +2 entries, −1 duplicate body.
- **(c) ⚠️ THE DOC-VS-CODE CHECK PASSED ON ALL THREE SUB-CLAIMS — this is the one that mattered.**
  Independently read from source, not from my build notes: the 4th variant is `BackgroundWork`
  (`status_broadcaster/mod.rs:69-76`); the signal is `event.background_task_count.unwrap_or(0) > 0` on
  `"Stop"` (`mod.rs:205`) — a **COUNT**, confirming the correction I made against `wbs.md`'s and the
  WP2 CHANGELOG line's `background_tasks[]` phrasing; and `aggregate_alarm` has
  `WorkspaceState::BackgroundWork => false` (`tray/mod.rs:68-72`), i.e. Neutral, with exhaustive arms.
- **(d)** `CLAUDE.md:165` now states four states; one line modified, nothing else.

⚠️ **The re-verification heuristic did NOT fire and was not needed** — there were no FAILs to
re-examine, and the page-JIT/lazy-mount precondition is absent on a docs-only phase. Recorded so a
later reader does not think it was skipped.

## Phase 1 verify-human (2026-08-26) — AUTO-SKIPPED

**Affirmation.** This phase does NOT wire into any existing HTTP endpoint, route, UI page, CLI
command, scheduled job, or external-system call. It modified **markdown prose only**, in four files:
`workflow-system/state/backlog.md` (deleted one duplicated entry body, added two new SURFACE
entries), `workflow-system/product/arch/status-channel-and-surfaces.md` (three in-place prose
replacements recording the already-shipped fourth status state), `CLAUDE.md` (one line corrected),
and `workflow-system/product/wbs.md` (task ticks). No `.ts`, `.tsx`, `.rs`, `.json` or `.css` file
was touched — independently confirmed at verify-self.

**Auto-skipped per drive_mode=autopilot — no integration boundary detected.**

**Gate evaluation (all four clean, but gate (a) required a fix first — see below):**

| Gate | Result |
|---|---|
| (a) drive_mode is autopilot/fsd | **PASS** — `drive_mode: autopilot` in YAML frontmatter (⚠️ **initially FAILED** — see below) |
| (b) verify-self all-PASS | **PASS** — 7/7, no UNVERIFIED / FAILED / FAILED-cosmetic |
| (c) no integration boundary | **PASS** — prose only; the 5-condition check returns no boundary |
| (d) no outcome cites a consuming surface | **PASS** — every outcome is a `grep`/`git diff` assertion over doc files |

⚠️ **GATE (a) FAILED ON FIRST EVALUATION, AND THE CAUSE WAS THIS PLAN'S OWN FILE SHAPE.** The WIP had
no YAML frontmatter at all — `feature-plan` wrote `**Drive mode:** autopilot` as a body line. Gate (a)
reads frontmatter and its documented fallback is *"treat as Mode 2, do NOT auto-skip."* ⚠️ **The
correct reading of the malformed file was therefore "pause for a human" in a session the operator had
put in autopilot** — and that failure is invisible, because a spurious pause looks exactly like a
legitimate one. I added the frontmatter rather than "interpreting" the body line as satisfying a gate
that names frontmatter specifically, then re-evaluated. Logged as a discovery.

**No design prior proposed** — there was no operator correction at this gate to capture one from.

## Phase 1 verify-codify (2026-08-26)

**No integration boundary** — the phase added no code artifacts; it edited prose. So there was no
consuming surface to exercise end-to-end.

**Coverage decision.** Two of the phase's properties are *durable invariants*, not one-off checks,
and neither had ANY existing coverage (grepped: no test references `backlog.md` structure, and
nothing anywhere in the tree referenced `status-channel-and-surfaces.md`). ⚠️ **The one worth
codifying is the arch-doc/enum coupling** — discovery
`SURFACE-2026-08-26-NO-GATE-FAILS-WHEN-A-SHIPPED-STATE-HAS-NO-ARCH-MENTION` asked for exactly this,
and a unit test is the *highest* level available for a docs-vs-code property (there is no HTTP/CLI
surface to drive). The backlog-heading invariant was **deliberately NOT codified**: it is a property
of the workflow-system's own prose discipline, not of Claudesk's runtime, and a Claudesk test
asserting the shape of `backlog.md` would couple the app's suite to a doc it does not own.

**Written: 3 tests in `src-tauri/src/status_broadcaster/mod.rs`** (Rust 883 → **886**):

1. `arch_doc_names_every_emitted_workspace_state` — every emitted variant appears in the arch doc.
   `Unknown` deliberately excluded (never emitted, so not part of the surface contract). Carries a
   **meta-guard** (doc > 5000 bytes + a known section anchor) so a broken `include_str!` path cannot
   read as green.
2. `arch_doc_records_the_background_work_signal_and_colour` — asserts `background_task_count` (⚠️ the
   COUNT, deliberately, since the WBS + the WP2 CHANGELOG line + this WP's own plan all said
   `background_tasks[]`) and `a371f7`.
3. `every_emitted_variant_round_trips_and_no_fifth_exists` — serde wire-name pins + a 5th-state
   sentinel.

**Mutation-proven INDIVIDUALLY, and one probe was invalid — recorded because the invalid probe and a
real hole looked identical:**

| Mutation | Result |
|---|---|
| Delete `BackgroundWork` from doc (`→ QQQ`) | **KILLS** test 1 |
| Delete `AwaitingInput` only | **KILLS** test 1 (per-variant granularity confirmed, not just "some variant") |
| Empty the doc entirely | **KILLS** test 1 via the meta-guard ("unexpectedly small (0 bytes)") |
| Delete `background_task_count` | **KILLS** test 2 |
| Delete `a371f7` | **KILLS** test 2 |
| Add a real 5th enum variant | **FAILS TO COMPILE** (2× `non-exhaustive patterns`) |

⚠️ **MY FIRST MUTATION PROBE WAS INVALID AND READ AS A GUARD HOLE.** I renamed `BackgroundWork` →
`BackgroundWork`**`X`** and test 1 passed — which looked like a substring hole. My first diagnosis
(*"`include_str!` is compile-time baked and cargo didn't rebuild on a `.md` change"*) was **also
wrong**: forcing a rebuild changed nothing. The real cause is that `contains("BackgroundWork")` is a
**substring** match, and `BackgroundWorkX` still contains it — so the *mutation never removed the
thing being asserted*. Exactly
`[[raw-guard-substring-must-be-unique-to-its-site]]` + `[[verify-the-mutation-landed]]`. Re-probed by
**deleting** the substring; all six mutations above then behaved correctly. ⚠️ Had I trusted the first
reading I would have "hardened" a guard that was already sound.

⚠️ **AND THE 5th-STATE SENTINEL IS A REDUNDANT BACKSTOP, NOT THE PRIMARY GUARD — measured, not
assumed.** Adding a real variant produces two `non-exhaustive patterns` **compile errors**
(`tray::aggregate_alarm` + one sibling) *before any test runs*. The sentinel earns its place only for
a variant added *alongside* new match arms, which compiles cleanly. The test's own doc comment was
corrected to say this, so a later reader does not mistake it for the mechanism that bites.

**Gate: `pnpm verify:auto` EXIT 0** — Rust **886** (was 883), frontend **2260** (unchanged, as
expected: no frontend code touched). ⚠️ **First run failed on `cargo fmt --check`** (my
line-wrapping), fixed with `cargo fmt`; assertions re-checked intact afterwards (34 hits on the three
asserted strings, `include_str!` path unbroken) — this is the class of reflow that has silently broken
a guard here before. Registry updated: 31s.

## Phase 2 build notes (2026-08-26) — live coexistence verify

Dev app launched (`pnpm tauri:dev`, PID 7935), driven through the MCP bridge, torn down PID-scoped.

**P2.1 — boot smoke-test PASS.** `#root` has 1 child, 811 chars of rendered text, title `Claudesk`.
Not blank. ⚠️ Ran FIRST, before any other observation, per the M13.5 WP3 lesson (a phase's "live"
readings were taken against a pre-deletion bundle while `tsc` and `verify:auto` were both green).

**P2.2 — THE CORE COEXISTENCE ASSERTION PASSES.** One `.workspace-header` on `scratch-c` carries all
four WPs at once. Header children, in order:
`workspace-header-name` · `workspace-header-nextopen` (**M12** `↻ will continue`) ·
`workspace-header-drivemode` (**WP4** `⇅ None`) · `workspace-skill-row` (**M13**, 5 buttons +
recycle) · `workspace-split-control` (containing **WP3**'s `↑`/`↓`) · `workspace-status-indicator`.

Per-WP results:

| WP | Verified | How |
|---|---|---|
| WP1 | ✅ dev tier | `.window-state.json` present under the **dev** identity with real geometry + `maximized: true`. ⚠️ Installed tier DEFERRED — see P2.4. |
| WP2 | ✅ colour renders | Forced `.status-dot-background` and read **computed** style: `rgb(163, 113, 247)` = `#a371f7`, with its `0 0 4px rgba(163,113,247,.55)` glow; restored cleanly. Positive control: `status-dot-unknown` = `rgb(72,79,88)` before and after. ⚠️ This proves the **CSS**, not that the state machine routes to it — that half is the Rust suite (886 incl. `end_to_end_socket_background_work_emits_then_clears_on_a_clean_stop`, observed passing). |
| WP3 | ⚠️ PARTIAL | Cluster present and correctly **disabled** with no `N/N` counter on a fresh session (zero recorded turn starts) — the honest state. ⚠️ **The viewport-advance assertion was NOT run** (needs real CC turns). |
| WP4 | ✅ idle path | Full round trip below. |

**WP4 idle-path round trip (all live):**
1. Readout `⇅ None` is a **clickable span with its own hit region**, distinct from the adjacent
   skill row and split control — task 4.7's requirement, confirmed structurally.
2. Click → native `<select class="workspace-header-drivemode-select">` over the **closed** set
   `["", "stepping", "orchestrated", "autopilot", "fsd"]`. ⚠️ The load-bearing spellings, **not**
   `full-autopilot`/`step-by-step`.
3. Change to `autopilot` (via React fiber — synthetic dispatch does not reach React) → confirm
   raises with accurate copy: *"Apply drive mode \"autopilot\" to this session now? Claude Code
   restarts here and keeps this conversation."* The readout still shows `⇅ None` — **not**
   optimistically flipped at this point.
4. **Cancel is a TRUE no-op — proven by hash, not by eye.** `projects.json` SHA256
   `197c407c…740571` **identical** before and after; readout reverts to `⇅ None`; no `is-stale`
   class; select and confirm both removed from the DOM.

**Also confirmed incidentally (picker surface):** `scratch-a` renders `orchestrated`,
`scratch-b`/`scratch-c` render `Drive Mode: None` — matching `projects.json` exactly, so the
picker-row cell and the stored value agree.

**⚠️ THE OFF-GATE OUTCOME WAS MET BY A STRONGER INSTRUMENT THAN PLANNED — and I did NOT toggle the
operator's setting.** The plan said to assert, live, that WP4's readout is absent while WP3's cluster
is present under `workflow_features_enabled: false`. Flipping that gate is a **write to the
operator's live dev profile**. It is also unnecessary: **OFF-invariant guard ARM 6 already owns this
exact property** (`src/state/__tests__/offInvariantGuard.test.ts`, 36 tests passing), added by WP4
itself — precisely as M13's note predicted ("a new gated surface owns arm 6"). It imports
`workspaceDriveModeReadout` from production (not stubbed) and asserts the **derivation returns
`null`**, which *is* the DOM absence because the render site is `{driveModeReadout && (...)}`. Its
header records why it followed precedent (b) rather than widening `WORKFLOW_TERMS` — the shared list
already contains "drive-mode", so arms 1–3 would catch a drive-mode *panel* while staying blind to
this *header span*. **The vocabulary was never the gap; registry coverage was.** The ON half was
confirmed live (all three gated surfaces present).

**⚠️ P2.3 IS PARTIAL — THE QUEUED-APPLY DEFECT WAS NOT REPRODUCED. Stated plainly rather than
implied.** The filed defect
(`SURFACE-2026-08-26-QUALITY-DRIVEMODE-REENTRANCY-DISCARDS-A-SECOND-APPLY`) is reachable **only while
an apply is queued behind a busy agent** — the filing says so, and says that is exactly why every
live verification missed it. ⚠️ **My run has the same limitation**: everything above ran against an
**idle** session, so it re-confirms the working path and says nothing about the defect. Reproducing it
needs a real CC turn held busy while a second apply is issued. **I did not do that, and the outcome
must not be read as "the defect did not reproduce."** The filing stands unchallenged, its
verified-at-source evidence (`Workspace.tsx:374` gates the handler, `:917` renders only ⏳, no
`disabled` on the readout) is unrefuted, and it remains correctly backlogged.

**P2.4 — WP1's installed-`.app` tier: DEFERRED, with its real gate named.** ⚠️ The WBS frames this as
the operator's defer-to-`/release` preference. That is true but **secondary**; the blocking fact is
harder: the installed app is **v0.3.4**, and **36 M13.5 commits land after that tag** — WP1's plugin
is not in the binary. Proven without launching it: the prod identity has **no**
`.window-state.json` while the dev identity does. So the tier is not merely deferred by preference —
it is **unsatisfiable without cutting a release first**, which `/release` is manual-only and outside
an XS exit-verify. Met at the next `/release`.

**P2.5 — teardown clean, PID-scoped.** Killed only PIDs I launched (app 7935, shell 7630, and its
orphaned Vite 7859 — ownership confirmed by repo path + 13:15:44 start time inside my window).
⚠️ **Never blanket `pkill claudesk`** — dev and prod share a process name and that killed the
operator's live app once (2026-07-13). Ports 1420/9223 free; **the operator's :5173 (their other
project) verified still listening**; `projects.json` byte-identical end to end.

**⚠️ One JS rejection was caught, and it is MY INSTRUMENT, not a product defect** — traced, not
assumed. `TypeError: undefined is not an object (evaluating 'listeners[eventId].handlerId')`. The
error tap is **self-proven working** (`tapProofWorked: true`), so this was a real rejection, not an
empty read — the recorded caveat is that `read_logs{source:"console"}` captures nothing here, making
an empty result a FALSE green, so the tap is the instrument. `handlerId` appears **nowhere** in
`src/` or in `@tauri-apps/api`; it lives in `tauri-plugin-mcp-bridge`, the automation bridge I was
driving. That plugin's `init()` is registered **only** under `#[cfg(debug_assertions)]`
(`Cargo.toml:128-138`), so release links nothing from it and this cannot occur in a shipped build.
The dev log corroborates with matching `[MCP][WS_SERVER][ERROR]` lines.

## Phase 2 verify-auto (2026-08-26)

**Scope:** Phase 2 introduced **no source changes** — it was a live observation pass; its only edits
were WIP notes. So the right scoped checks are (i) confirm no code drifted, and (ii) confirm the
specific guards Phase 2 *leaned on* actually pass, rather than re-running the full gate that Phase 1
already exited 0 on.

| # | Check | Result |
|---|---|---|
| 1 | No new source change from Phase 2 | **PASS** — `git status` shows the only `.rs` edit is Phase 1's already-gated guard; everything else is `.md` |
| 2 | OFF-invariant guard + drive-mode render guard | **PASS** — 2 files, **41 tests** |
| 3 | The `background_work` routing tests, named explicitly | **PASS** — **6** tests, incl. `end_to_end_socket_background_work_emits_then_clears_on_a_clean_stop`; `grep -c '^test .* ok$'` = 6, so not an `ok. 0 passed` false green |

⚠️ **Check 3 exists specifically because Phase 2's live check could NOT prove it.** Forcing
`.status-dot-background` proves the **CSS** renders purple; it says nothing about whether the state
machine ever routes a workspace into that class. Naming the routing tests closes the half the live
observation left open, rather than letting a computed-colour read stand in for an end-to-end claim.

**Verdict:** no code changed, and every guard Phase 2 cited is confirmed green by name. P2.3 remains
**PARTIAL** — that is a scope limitation carried forward to verify-self, not a test failure, and it
is not something verify-auto can resolve.

## Phase 2 verify-self (2026-08-26)

**No integration boundary** — Phase 2 added no code artifacts; it observed already-shipped surfaces.
Subagent spawned (unconditional) as a **skeptical audit** rather than fresh observation, since the dev
app was already torn down. It was explicitly asked to *refute* my judgment calls, not ratify them.

**Result: 8 PASS · 1 FAIL (COSMETIC) · 0 BLOCKING.**

| Outcome | Result |
|---|---|
| `pnpm verify:auto` exit 0, Rust ≥883 / frontend ≥2260 | **PASS** — re-run independently: exit 0 in 32s, **Rust 886**, **frontend 2260 / 174 files** |
| production `vite build` exit 0 | **PASS** — re-run: exit 0, 1.49s, 20 chunks |
| header shows WP4 readout + WP3 cluster together | **PASS** — corroborated structurally in `Workspace.tsx` (siblings in one header) |
| WP3 jump advances the viewport | **FAIL / COSMETIC** — **NOT RUN**, honestly reported |
| WP4 confirm raises; Cancel is a true no-op | **PASS** — hash-identical; source-corroborated (both arms funnel through one `driveModeWriteFor`) |
| `background_work` renders purple `#a371f7` | **PASS** — computed style + positive control; routing half closed by the 6 named Rust tests |
| gate OFF ⇒ WP4 absent AND WP3 present | **PASS** — substitution **legitimate**, see below |
| WP1 dev-tier `.window-state.json` | **PASS** — 209 B, real geometry, `maximized: true` |
| no JS errors | **PASS** — the one rejection independently re-attributed to the dev-only bridge |

**⚠️ THE AUDIT OVERTURNED MY OWN CHARACTERISATION IN MY FAVOUR — and that is worth recording,
because the failure mode it avoids is *under*-claiming a substitution and then quietly re-doing it.**
I justified skipping the live gate-toggle on ARM 6 alone. The audit verified all three premises —
ARM 6 imports `workspaceDriveModeReadout` from production unstubbed, asserts `.toBeNull()` across the
**full cross-product** of the other three inputs with a paired anti-vacuity positive control, and the
render site at `Workspace.tsx:837` genuinely is `{driveModeReadout && (...)}` so a null derivation
**is** DOM absence — and then found **a second guard I had not mentioned**:
`workspaceDriveModeRender.test.tsx` (5 tests) **server-renders the real `Workspace` component** and
asserts the `data-testid` is absent, with a positive control proving the header rendered. ⚠️ That
closes precisely the **caller-side** gap ARM 6 alone cannot see — the exact "the mechanism was proven
and the CALLER was not" shape that fired four times in WP4. Its third test positively asserts the
**ungated split control SURVIVES a closed gate while the skill row vanishes**, so *"WP3 present while
WP4 absent"* is **proven about the code**, not inferred from two separate observations.
**Conclusion: the un-toggled live check was the WEAKER instrument.** Declining to write the
operator's live dev profile cost no evidence.

**⚠️ THE ONE FAIL IS A COVERAGE HOLE IN THIS PHASE, NOT A DEFECT SIGNAL — and I am not upgrading it
to a pass.** WP3's viewport-advance assertion was not run: it needs real recorded CC turn starts, and
the live session had zero, so the cluster was observed correctly **present-but-disabled with no `N/N`
counter** (the right behaviour for a zero-turn session, not a bug). Graded COSMETIC — not
BLOCKING — on one specific ground: **WP3 shipped 2026-08-25 under its own verify-human approval**, so
the viewport behaviour already carries operator sign-off upstream, and *this* phase's claim is
**coexistence**, which passed. ⚠️ The re-verification heuristic did **not** fire and must not be used
here: the FAIL is **not mechanically implied** by any sibling PASS — nothing that passed entails that
the viewport moves — so "re-verify directly and upgrade" is unavailable by the heuristic's own gate.
It stays a FAIL, surfaced to verify-human.

**Three corrections the audit made to my records — all independently re-confirmed by me:**

1. ⚠️ **`applyDriveMode.ts` lives at `src/components/workspace/`, NOT `src/cc/`.** My P2.3 prompt said
   `src/cc/applyDriveMode.ts`; that path does not exist. Confirmed by `ls`.
2. **The P2.3 filing is still accurate** — re-read at source: `respawnWanted` has exactly three uses
   (state `:257`, handler gate `:374`, ⏳ indicator `:917`), **nothing on the affordance**; the readout
   span has no `disabled` and all three activation paths (`onClick`, `onKeyDown` Enter/Space) call
   `setEditingDriveMode(true)` unconditionally. The finding's home is
   `backlog-quality-findings.md` + its coupled pointer stub in `backlog.md` — the correct coupled
   home, not a misfile.
3. ⚠️ **WP1's installed-tier deferral has a HARDER proof than I gave.** I argued from the version
   string and commit count; the decisive fact is that **WP1's commit `25a68bc` is NOT an ancestor of
   `v0.3.4`** (`git merge-base --is-ancestor` refutes it) — so the installed binary does not link
   `tauri-plugin-window-state` **at all**. Corroborated by the prod app-data dir being **populated**
   (it has run) yet having no `.window-state.json`. Re-confirmed independently.

## Phase 2 verify-human (2026-08-26) — OPERATOR APPROVED

⚠️ **Auto-skip did NOT apply, and that was correct.** Gate (b) requires verify-self all-PASS; the WP3
viewport outcome was `FAILED-cosmetic`, which the gate names explicitly as disqualifying. So this was
a real pause. Recorded because an auto-skip here would have buried the one un-run outcome.

**Checklist presented (2 leaves; the 8 verify-self PASSes were excluded per the pre-filter):**

- **P2.verify-human.1 — WP3's jump cluster actually moves the viewport.** Carried forward as
  `FAILED-cosmetic` from verify-self: un-run because a fresh session has zero recorded turn starts, so
  the cluster was correctly present-but-**disabled** with no `N/N` counter. Presented with the specific
  warning that *"the click landed"* is not the property to check — WP3's shipped defect was a viewport
  **clamp** the caller misread as success.
  → **Operator: PASS** ("both fine").
- **P2.verify-human.2 — the two deliberate scope deferrals.** (1) P2.3's queued-apply MAJOR stays
  **filed, not fixed** — confirmed accurate at source but not reproduced (needs a busy agent);
  0 CRITICAL means no refactor is owed, and an XS exit-verify absorbing a MAJOR is scope creep. The
  operator was explicitly offered the alternative of pulling the `useDriveModeApply` fix into this WP.
  (2) WP1's installed-`.app` tier defers to `/release`, proven by `25a68bc` not being an ancestor of
  `v0.3.4`.
  → **Operator: PASS** ("both fine"). ⚠️ **The offer to pull the MAJOR fix into this WP was declined
  by omission, not addressed explicitly** — recorded as such rather than as an affirmative "leave it
  filed", so a later reader does not over-read the approval. The finding remains open and correctly
  backlogged.

**No design prior proposed.** The capture discriminant requires a *correction or rejection* carrying a
transferable product-design why. The operator **approved** both leaves with no correction and stated no
principle, so nothing fires. (A bare approval is not a prior — recorded so the absence reads as
weighed rather than missed.)

## Phase 2 verify-codify (2026-08-26)

**No integration boundary** — Phase 2 added no code; it observed already-shipped surfaces.

**Coverage analysis found ONE real gap, and it is narrower than "the coexistence property".**
⚠️ **The gate-ON coexistence of all four surfaces is NOT writable in this harness, and I did not
fake it.** `workspaceDriveModeRender.test.tsx`'s own header states why:
`useWorkflowFeaturesEnabled` seeds asynchronously and returns its restrictive pre-seed default
(`false`) under server rendering, so **only the gate-OFF shape is reachable**. That property's
evidence remains the live MCP-bridge observation recorded above — and stays that way.

What **is** writable, and was genuinely uncovered: the existing ungated-siblings test asserts
`workspace-split-control` **survives**, but the split control is a **container** — it also holds the
collapse/cycle buttons, so it can survive fully intact while WP3's nav buttons vanish from inside it
and **every existing assertion still passes**. Probed before writing: both `workspace-turn-prev` and
`workspace-turn-next` **are** reachable in server render and **are** nested in the container.

**Written: 1 test** in `src/components/workspace/__tests__/workspaceDriveModeRender.test.tsx`
(5 → 6 tests; frontend 2260 → **2261**):
`WP3's turn-nav buttons render INSIDE the ungated split control`.

⚠️ **It asserts `splitControl.contains(btn)`, NOT two independent `not.toBeNull()` lookups — and the
mutation proof is what justifies that choice, not taste:**

| Mutation | Result |
|---|---|
| **A** — neutralise `workspace-turn-prev`'s testid (button gone) | **KILLS** exactly 1 test (mine); other 5 pass → clean attribution, not a crash |
| **B** — nav still renders, still in the header, but **moved OUTSIDE** the split control | **KILLS** exactly 1 test (mine), on the `contains` assertion |

⚠️ **Mutant B is the whole point.** Under it the buttons exist and two independent lookups would
**both pass** — the test would report green on a header where the ungated affordance had migrated
into (say) the gated skill row, which is precisely the placement WP3 established as illegal ("the
skill-button row is gated wholesale, so an ungated affordance must NOT live there"). Only the
nesting assertion sees it. ⚠️ Both mutants were confirmed to **land in executable JSX** before the
run, and `Workspace.tsx` was restored byte-identical after each
(`[[verify-the-mutation-landed]]`, `[[invalid-probe-and-real-hole-look-identical]]`).

**Gate: `pnpm verify:auto` EXIT 0** — Rust **886** (unchanged; no Rust touched), frontend **2261**
(2260 + 1). No failures.

## Phase 3 build notes (2026-08-26)

**P3.1 — WP5's three tasks ticked in `wbs.md`, with the corrections recorded rather than a bare tick.**
Two of the three were **not** what the task text said, and the WBS now says so:
- **5.2 was already satisfied inside the WPs** — ticking it silently would have implied this WP
  re-emitted `**Backlog resolved:**` lines and **double-counted the paper trail**. What it actually
  delivered was the *stale-duplicate deletion*, with the root cause (`##` inside an HTML comment
  manufacturing a heading) and the fact that this is the **second** instance of that mechanism here.
- **5.1's installed-tier deferral rests on a harder ground than the task states** — not the operator's
  `/release` preference but `25a68bc` not being an ancestor of `v0.3.4`. Both un-met outcomes (WP3
  viewport, WP4 queued-apply) are recorded as un-met, not folded into the tick.
- **5.3's conditional was TRUE and was executed in Phase 1**, plus the `background_task_count`-is-a-
  COUNT correction that this WBS's own WP2 text got wrong.

**P3.3 — `CLAUDE.md` `## Current Milestone` now reads M15**, M13.5 marked CLOSED at five WPs with its
three carry-forward facts. ⚠️ **Order preserved as M13.5 → M15 → M14** — deliberately NOT "corrected"
back to `roadmap.md`'s M14-first lean, per the operator's recorded 2026-08-19 call.

⚠️ **SIZE: `CLAUDE.md` grew +490 bytes net (41393 → 41883) and remains over the 40k warn threshold.**
Stated, not glossed. A whole-milestone close genuinely adds content, so I paid for most of it by
compressing two blocks whose detail lives elsewhere: M13's five-item block (as-built detail is in
`arch/` and the guard headers) and M13.5 WP3's ES-module narrative (its full write-up is the
`high`-priority `backlog.md` entry, now pointed at rather than duplicated). A first pass was +1118;
this is the trimmed result. ⚠️ **No prune was run** — the operator declined one and that stands.

**P3.2 (`/product-finalize`) is deliberately NOT done here** — it is a skill invocation that owns the
`roadmap.md` resync, the backlog sweep, and the cycle archive. Doing its work inline would bypass the
instrument. It runs after this phase's verify chain.

## Phase 3 verify-auto (2026-08-26)

**Scope:** Phase 3 so far changed **two markdown files** (`wbs.md`, `CLAUDE.md`) — no code. So the
checks are doc-structural, plus a confirmation that no source drifted. ⚠️ `git diff` does list
`status_broadcaster/mod.rs` and `workspaceDriveModeRender.test.tsx`, but those are **Phase 1's and
Phase 2's** changes, both already gated at exit 0 (Rust 886 / frontend 2261) — **nothing new from
Phase 3**. Recorded because "a `.rs` file is dirty" would otherwise read as an ungated code change.

| # | Check | Result |
|---|---|---|
| 1 | Changed files enumerated | **PASS** |
| 2 | No NEW non-`.md` change from Phase 3 | **PASS** — the two source files are prior phases', already gated |
| 3 | All three WP5 tasks ticked in `wbs.md` | **PASS** — 3 `[x]`, 0 `[ ]` |
| 4 | `CLAUDE.md` structure intact | **PASS** — exactly one `## Current Milestone`; `## Next Milestone` / `## Previous Milestone` / `## Key Decisions` all present and single; the `M13.5 → M15 → M14` order line preserved (2 sites) |
| 5 | No orphaned or duplicated M13 block after the compression | **PASS** — one `Milestone 13 … COMPLETE`; the stale `"WP4 … is next"` text is gone (0 hits) |
| 6 | `wbs.md` heading integrity | **PASS** — 0 malformed; all 9 headings match the expected shapes |

**Two staleness defects found and fixed — both would have misled a future reader:**

1. ⚠️ **The `wbs.md` frontmatter comment still said `# WP1 + WP2 + WP3 shipped; WP4/WP5 remain`** —
   false at this point, and frontmatter is exactly what a later session trusts without reading the
   body. Now `# ALL FIVE WPs shipped — bucket closed; awaiting /product-finalize archive`.
2. **WP5's heading carried no completion marker** while all four siblings carry `✅ SHIPPED <date>`.
   Now `## WP5: Bucket exit verify — ✅ COMPLETE 2026-08-26`. (Checked WP1 first: its heading also
   lacks the marker, but its ship line **is** in the body at `wbs.md:98` — a stylistic inconsistency,
   not a defect, so left alone rather than churned.)

**Verdict:** no code changed in this phase; the doc-structural properties hold and two staleness
defects were corrected. P3.2 remains open by design.

## Phase 3 verify-self (2026-08-26)

**No integration boundary** — markdown only. Subagent spawned as a skeptical audit; asked explicitly
to *refute* P3.1's three ticks and to hunt content loss from P3.3's compression.

**Result: 11 PASS · 5 FAIL (all COSMETIC) · 0 BLOCKING.**

**The four planned outcomes all FAIL as `pending P3.2` — by design, not by breakage.** Every one of
them (CHANGELOG `**Milestone:**` line · cycle archive dir · empty `wip/` · clean `git status` after
the close commit) is an **output of `/product-finalize`**, which deliberately has not run. ⚠️ The
audit was asked to escalate any that were *unachievable* rather than merely un-run, and confirmed
**none is**: the archive path
`workflow-system/product/archive/milestone-13.5-qol-polish-bucket/` matches `wbs.md`'s own declared
`cycle:` slug **and** the naming scheme of all **17** existing sibling dirs, and a
`- **Milestone:** M13.5 WP1 …` line already exists under `## 2026-08-21`, proving the emit path works.
The 7 modified files are all this WP's own gated edits — no unexplained drift.

**All three P3.1 ticks verified honest, each independently:**
- **5.2** — all four `**Backlog resolved:**` lines confirmed at `CHANGELOG.md` L13/L18/L19/L24; the two
  fully-resolved items have **zero** `^## SURFACE` headings in `backlog.md`; TURN-OUTPUT survives at
  **exactly one** heading carrying the `PARTIALLY RESOLVED` + `~~struck~~ SHIPPED` markers. ⚠️ One
  residual `AWAITING-INPUT` mention is a **legitimate cross-reference** in a *different* entry's
  `**Context:**` that self-labels the item as "since RESOLVED and deleted from this file" — checked,
  not assumed. So "re-running 5.2 would double-count" holds.
- **5.1** — `git merge-base --is-ancestor 25a68bc v0.3.4` **exits 1**. Corroborated by dates the audit
  went and found: `25a68bc` is **2026-08-21** while tag `v0.3.4` is **2026-08-19** — the tag *predates
  the commit by two days*. A genuine unsatisfiability, not a preference dressed as one.
- **5.3** — `mod.rs:205` reads `event.background_task_count.unwrap_or(0) > 0` (a COUNT); the arch doc
  names `BackgroundWork` at L40/L48/L69 and states the count-not-tasks privacy rationale. The
  `background_tasks` string appears **only** inside that explanation of what is deliberately NOT
  forwarded — not as the signal.

**P3.3 content-loss check: PASS.** Token-set diff of `git show HEAD:CLAUDE.md` vs the working copy
dropped only **3** tokens, none load-bearing: `main.tsx` and the quoted `SyntaxError: Importing
binding name …` (both intentionally compressed, and both present in *richer* form at the redirect
target), plus a `wbs.md` pointer for the now-CLOSED cycle that was about to go stale anyway. **Zero
SURFACE-IDs lost**, and the **⚠️ count went UP** (52 → 58), so no warning was dropped. The redirect
target was verified to exist and be a strict **superset**:
`SURFACE-2026-08-25-A-DELETED-EXPORT-BREAKS-THE-APP-AT-RUNTIME-NOT-JUST-TSC` (`backlog.md:778`) — the
**only** `high`-priority entry, so "the `high`-priority entry" resolves unambiguously.

**⚠️ THE AUDIT CAUGHT A REAL DEFECT THAT I INTRODUCED, AND IT WAS RIGHT.** `CLAUDE.md:200` read
**"Four things from M13"** over a **five-item** list. `HEAD` correctly said "Five" — **my compression
changed the count while keeping item 5.** Not pre-existing as first reported: the audit noted HEAD
said "Five", which means the mismatch is mine. Fixed.

⚠️ **And auditing that class file-wide found a THIRD instance the subagent did not flag:** a stale
**quoted cross-reference** at `CLAUDE.md:224` citing `("Four things M13 must not re-derive")` — a
quotation of the very heading I had just renumbered, so it pointed at a title that no longer existed.
Also fixed. ⚠️ **The lesson is the sweep, not the typo:** renumbering a titled list silently
invalidates every *quotation* of that title elsewhere in the file, and a count in a header is
load-bearing precisely because later prose quotes it. Final sweep confirms both headers now match
their list lengths and the one quoted title resolves exactly.

**Independent regression check: `pnpm verify:auto` exit 0 in 23s — Rust 886, frontend 2261 / 174
files.** Both match. ⚠️ The 59 `failed|error` grep hits are benign (test *names* containing the words)
plus **one pre-existing ESLint warning** at `XtermPane.tsx:861` (`react-hooks/exhaustive-deps`,
spread-in-deps) reported as `0 errors, 1 warning` — it does not fail the gate and is not mine.

**`CLAUDE.md` size: 41883 → 41897 after the two fixes** (+14), still over the 40k threshold. No prune
run; the operator declined one.

## Phase 3 verify-human (2026-08-26) — PARTIAL by design

⚠️ **Auto-skip correctly did NOT apply** (gate (b): 5 `FAILED-cosmetic` leaves in verify-self).

**Presented 2 leaves; operator approved the one that was actionable:**

- **P3.verify-human.1 — the four close outcomes.** ⚠️ **NOT presented for verification and NOT
  marked passed — marked `BLOCKED: depends on P3.2`.** All four are `/product-finalize`'s outputs and
  P3.2 is still an open task *in this same phase*, so there is literally nothing to look at.
  Presenting them would have asked the operator to confirm artifacts that do not exist. Per the
  BLOCKED rule they are shown explicitly rather than silently skipped.
- **P3.verify-human.2 — the `CLAUDE.md` milestone rewrite.** → **Operator: PASS** ("all good").
  M15 current · M13.5 closed at five WPs · the `M13.5 → M15 → M14` order preserved at all three sites
  including the "do not correct it back" guard · net **+504 bytes** (41393 → 41897), still over the
  40k threshold, no prune. The operator was explicitly offered a further trim and did not request one.

⚠️ **THE PARENT `verify-human` NODE IS DELIBERATELY LEFT UNCHECKED.** Leaf .1 is BLOCKED, and the
Work Tree rule is that a parent may only be `[x]` when **all** children are `[x]`. Marking it complete
now — on the strength of the operator's "all good", which addressed .2 only — would break that
invariant and paper over an unrun check. It completes after P3.2 runs and .1 is verified.

**No design prior proposed** — the operator approved without correcting and stated no principle, so
the capture discriminant does not fire.

## P3.2 — /product-finalize (2026-08-26) — cycle CLOSED, commit `daee38a`

**Not pushed.** `main` is 37 ahead of origin; publishing is the operator's call (the skill's own rule).

**⚠️ THE RESYNC FOUND REAL DRIFT: 3 of 5 WPs had ZERO `arch/` coverage** — which is the very class
`SURFACE-2026-08-26-NO-GATE-FAILS-WHEN-A-SHIPPED-STATE-HAS-NO-ARCH-MENTION` names, now recurring at
milestone scale rather than enum scale. Written to the subsystem each belongs to:
- **`foundations.md`** ← WP1: skip-if-no-monitor-intersects (**not** clamping), `app_config_dir()`
  (**not** `app_data_dir`), and the state file is a **dotfile**.
- **`process-and-pty.md`** ← WP3 + its three banked refutations.
- **`session-resumption.md`** ← WP4. ⚠️ Its section was titled **"The picker-row cell (⚠️ NOT the
  workspace header)"** — a claim WP4 deliberately reversed. **Retitled, not deleted**, so the
  reversal reads as a decision rather than as if the old rule never existed.

**⚠️ THE ROADMAP CARRIED TWO FACTUAL ERRORS IN ITS OWN EXIT CRITERIA — corrected, not inherited:**
(a) it said an off-screen restore is "**clamped**" (it is **skipped**); (b) it assumed the stale-blue
dot needed *clearing*, when WP2 measured that the dot was lit **wrongly** and there was nothing to
clear. A refuted criterion left standing reads as live spec — the same failure this bucket kept hitting.

**Backlog sweep: 1 resolved / 38 open.** Only the arch-mention gate was resolved by this cycle's work
(this WP built exactly the guard it asked for). CHANGELOG line written **first**, then the entry
deleted — the delete-on-resolve invariant, in the same commit. ⚠️ **Its sibling
(`...DELETE-ON-RESOLVE-REWRITE-PATH-SKIPS-THE-DELETE`) was NOT resolved**: its target is the
**companion repo's** `CLAUDE.snippet.md`, which this session has not edited and should not edit from
here. Left pending and folded into the mccc handoff alongside the two other medium-high cross-repo
items — not dropped, and not silently marked done because the local symptom was fixed.

**P3.verify-human.1 — unblocked and verified after P3.2. 3 of 4 exact:**
| Outcome | Result |
|---|---|
| CHANGELOG cycle line under today | **PASS** — 1 `**Product cycle complete:**` bullet |
| archive `wbs.md` exists / `product/wbs.md` gone | **PASS** — both |
| `git status` clean apart from `wip/` | **PASS** — 0 other entries |
| `wip/` empty | **1 file** — this WP's own, which `feature-finalize` archives. ⚠️ Recorded as such rather than ticked as "empty": an item cannot delete itself before its own close runs. |

## Test Triage — `arch/session-resumption.md names every drive-mode wire string` (3 of 4 arms)

Classification: **Documentation gap revealed by a correct new test** — NOT a code regression, and NOT
an obsolete test. The test asserts a true and intended property; the *doc* is what is deficient. The
three failing arms (`stepping`, `orchestrated`, `fsd`) fail because those literal strings appear
nowhere in `arch/session-resumption.md`, which `arch.md` designates as the authority on drive mode.
Confidence: **high** — one plausible explanation, stated without hedging: the doc discusses drive mode
extensively in prose but only ever *names* `autopilot`, and that incidentally.
Evidence: `grep -c "\bstepping\b"` / `orchestrated` / `fsd` against
`workflow-system/product/arch/session-resumption.md` each return **0**; `autopilot` returns 2. The
strings themselves are defined at `src/cc/driveMode.ts:49-54`.
Action: **Fixed the DOC, not the test.** Added the four-value vocabulary table to
`arch/session-resumption.md` → "The drive-mode signal", where the authority for these strings belongs.
⚠️ **Deliberately did NOT weaken the assertion** (e.g. to only check `autopilot`, or to check
case-insensitively, or to drop it) — the gap it found is real and is precisely the class
`CLAUDE.md` warns about: a wrong spelling fails serde on read and takes the whole project list down,
so an authority doc that names only one of four values is actively misleading. Re-ran after the doc
fix; all 4 arms pass.

## Phase 3 verify-codify (2026-08-26)

**No integration boundary** — Phase 3 edited markdown and ran a workflow skill; no code artifacts.

**Coverage analysis.** Most of Phase 3's verified behaviours are **one-shot cycle-close events** (a
CHANGELOG line, a `git mv`, a commit) — not regressible properties; there is no future state where
"the M13.5 archive exists" could break and want a test. But the **resync** left a durable, testable
gap.

⚠️ **THE GUARD'S SHAPE DOES NOT GENERALIZE, AND I CHECKED RATHER THAN ASSUMING.** The tempting move
was to copy Phase 1's `status_broadcaster` arch-doc guard to all three newly-resynced docs. It only
works there because `WorkspaceState` is a **closed enum** to anchor on. Checked the other two:
WP1's window-state work is a **plugin registration policy** (pure fns, no variant list) and WP3's
`turnMarkers` exposes a **shape**, not a variant set. A guard for those would assert "some string
appears in some doc" — which passes on prose saying the **opposite**. Declined; only `DRIVE_MODES` is
a real closed set. (`[[cm6-dont-copy-compartment-by-analogy]]` in spirit.)

**Written: 5 arms** in `src/cc/__tests__/driveMode.test.ts` (frontend 2261 → **2266**) — a
`describe` with a not-vacuous meta-guard + `it.each(DRIVE_MODES)`, read via `node:fs` (this repo's
settled idiom for files outside the Vite graph, per the sibling `driveModeIpc.test.ts`).

⚠️ **THE GUARD FAILED THE MOMENT IT WAS WRITTEN — 3 of 4 arms — AND THAT WAS THE POINT.**
`stepping`, `orchestrated` and `fsd` appeared **nowhere** in `arch/session-resumption.md`, the doc
`arch.md` designates as the authority on drive mode; only `autopilot` was there, incidentally. These
are the exact strings `CLAUDE.md` flags as load-bearing — a wrong guess (`full-autopilot` /
`step-by-step`) **fails serde on read and takes the whole project list down** — so an authority doc
naming one of four values is actively misleading. **Triaged first** (see `## Test Triage` above),
then **fixed the DOC, not the test**: added the four-value vocabulary table to "The drive-mode
signal". ⚠️ **Deliberately did not weaken the assertion** to make it pass.

**Mutation-proven per arm — and my FIRST probe was invalid, again:**

| Mutation | Result |
|---|---|
| delete `stepping` | **KILLS** exactly 1 arm |
| delete `orchestrated` | **KILLS** exactly 1 arm |
| delete `fsd` | **KILLS** exactly 1 arm |
| delete `autopilot` | **KILLS** exactly 1 arm |
| empty the doc | **KILLS** 5 (the meta-guard fires) |

⚠️ **The first mutation run reported all three mutants PASSING, and it was a broken probe, not a
guard hole.** I used `sed -i '' "s/\b$m\b/QQQ/g"` — **BSD `sed` on macOS does not support `\b`**, so
the substitution silently did nothing and the word survived. The tell was in my own output: *"landed?
hits now: **1**"* when 0 was required. ⚠️ **Had I skipped the landed-check, three "passes" would have
read as a guard that checks nothing** — exactly `[[verify-the-mutation-landed]]` and
`[[invalid-probe-and-real-hole-look-identical]]`. Re-probed with `perl -pi -e` (real word
boundaries); all four then landed and killed their own arm. **That is the third time this session an
invalid probe impersonated a finding.** Doc restored byte-identical after every mutant.

**Gate: `pnpm verify:auto` EXIT 0** — Rust **886** (unchanged), frontend **2266** (2261 + 5).

**ALL THREE PHASES COMPLETE.**

## Ship (2026-08-26) — `ee237a3`

**Cleanup: clean.** No scratch artifacts in the repo (the `tmp/probetests/` probe dir was removed at
the time), zero TODO/FIXME/debug statements in the touched files. ⚠️ **Mutation-probe residue checked
explicitly** — all three files mutated during probes (`Workspace.tsx`,
`status_broadcaster/mod.rs`, `arch/status-channel-and-surfaces.md`) verified **clean vs HEAD**, and a
sweep for `QQQ` / `MUTANT B` / `AFifthStateWasAdded` / `BackgroundWorkX` returns nothing. The one
`MUTANT` grep hit is legitimate prose in a WP4-era test comment, not a leftover marker.

**Final verification:** `pnpm verify:auto` exit 0 — Rust **886**, frontend **2266**; production
`vite build` exit 0 (1.41s).

**Commit `ee237a3`** — the drive-mode arch guard + the vocabulary table it forced + the ported
learning's backlog entry. ⚠️ **Not pushed.** `main` is now **38 ahead of origin**; publishing is the
operator's call and they have said so twice this cycle.

⚠️ **What this WP ships is unusual and the commit message says so:** the guard's value was realized
**before** it ever protected anything — it failed 3 of 4 arms on first run and the fix was to the
**doc**, not the test. The shipped artifact is the guard *plus* the correction it forced.

## Code-Quality Review — m13-5-bucket-exit-verify

**Reviewed:** `f1216ba^..ee237a3` · **Verdict: 1 CRITICAL · 2 MAJOR · 2 MINOR.**

### Strengths (reviewer's, abridged)
- The Rust round-trip test's comment **records that the assertion is not the mechanism that bites** —
  a 5th variant fails to *compile* first — so a later reader cannot mistake the backstop for the guard.
- The commit **fixed the doc, not the test**, when 3 of 4 drive-mode arms failed on first write.
- **Guard generalization was checked rather than assumed**, and the negative result written down.
- The TSX guard uses `contains` rather than two independent lookups, and states its gate-OFF **scope
  limit** rather than implying more.
- Durable-doc corrections are substantiated against code, not restated from memory.

### Issues

**CRITICAL**
- `[src-tauri/src/status_broadcaster/mod.rs:1478-1487]` — `arch_doc_names_every_emitted_workspace_state`
  loops `doc.contains(variant)` over the bare words `Idle` / `Running` / `AwaitingInput` /
  `BackgroundWork`, **none of which is unique to the enum documentation**. Failure form **12** in
  `docs/lessons/source-text-guards.md`: *a substring that OCCURS at the site is not ANCHORED to it*.
  ⚠️ **My mutation proof could not have caught this** — I probed with a **rename**
  (`BackgroundWork` → `BackgroundWorkX`), which tests boundary-matching, not anchoring. The one
  command that catches it (`grep -c`) is prescribed by that very lesson and I did not run it.

  ⚠️ **VERIFIED BY ME, AND THE REVIEWER'S OWN REPRO WAS ACCIDENTALLY WRONG WHILE ITS MECHANISM WAS
  RIGHT.** Its stated repro — delete lines 40 and 48 — actually makes both tests **FAIL**, because
  **line 40 IS the `"Status broadcaster."` anchor** the meta-guard asserts, so the meta-guard trips
  before the variant loop runs. Had I stopped at reproducing its exact steps I would have dismissed a
  true finding. Re-probed at the mechanism instead: gut **only** the state union
  (`state: Idle|Running|AwaitingInput|BackgroundWork` → `state: REDACTED`), anchor left intact →
  **the guard PASSES**. Counts confirm why: `Idle` ×4, `Running` ×5, `AwaitingInput` ×7,
  `BackgroundWork` ×3 across the file, all surviving in unrelated prose (a menu-bar aggregation
  sentence, an `aggregate_alarm` note).

**MAJOR**
- `[src/cc/__tests__/driveMode.test.ts:186-198]` — Same unanchored shape, currently *near*-sound:
  `stepping` / `orchestrated` / `fsd` each occur exactly once (in the table this commit added), but
  **`autopilot` occurs 4×**, three incidental. So that one arm would survive deletion of the very
  table it protects — the guard's strength is **silently non-uniform across arms**, and because they
  are generated by `it.each(DRIVE_MODES)` that asymmetry is invisible.
- `[mod.rs:1465, 1489; driveMode.test.ts:181]` — `doc.len() > 5_000` is a bare magic number in three
  places, no derivation, no upper bound. Both docs are ~29–37 KB, so it catches truncated-to-empty
  but not gutted-to-20%. ⚠️ Unexplained thresholds get **lowered** on first failure, not investigated.
  The section anchors are the load-bearing half; a **tail**-anchored assertion would beat a byte count
  (truncation eats the tail, and a head-anchored check cannot see it).

**MINOR**
- `[mod.rs:1461, 1495]` — the same `include_str!` duplicated across two tests; a shared `const` with
  one comment on why the crate reaches outside itself would make the coupling greppable. ⚠️ On the
  `include_str!`-vs-`node:fs` split I asked about: **justified, not accidental** — `include_str!` is
  compile-time-checked so a moved doc breaks the build loudly; the TS side correctly follows the
  `driveModeIpc.test.ts` convention for files outside the Vite graph.
- `[workflow-system/state/backlog.md:65]` — an open entry **still says `background_tasks` array**, the
  exact phrasing this WP corrected in four other records. Last live instance of the confusion the WP
  was chartered to eliminate.

### Assessment (reviewer)
*"A well-built exit-verify WP whose reasoning is consistently stronger than one of its three
artifacts… the Rust arch-doc guard, which carries the longest and most confident comment block of
anything in the diff, is not anchored to the site it names… Future readers will find the intent very
clear; they may over-trust the coverage."*

### Disposition
CRITICAL confirmed at source → **F40, auto-invoke `/feature-refactor`** (autopilot). The two MAJORs
are the same defect class and are fixed in the same pass rather than backlogged — splitting them
would leave a guard the review just proved non-decisive.

### If you disagree
Mark any finding `[DISMISSED]` in this section before `feature-finalize` archives the WIP.

## Refactor (2026-08-26) — `03bd569`

**Simple refactor, done directly** — 1 CRITICAL + 2 MAJOR + 1 MINOR, all **one defect class**
(unanchored substrings), confined to two test files. Behavior-preserving: same subjects, stricter
predicates. **Rust 886 / frontend 2266 — both unchanged**, which is the property a refactor must have.

**CRITICAL — confirmed at source before acting, and the confirmation mattered.**
⚠️ **The review's repro was WRONG while its mechanism was RIGHT.** Its steps — delete lines 40+48 —
make both tests **FAIL**, because **line 40 IS the `"Status broadcaster."` anchor** the meta-guard
asserts, so the meta-guard trips before the variant loop runs. **Reproducing its exact steps would
have let me dismiss a true finding.** Re-probed at the mechanism instead: gut only the state union
(`state: REDACTED`), anchor intact → **old guard PASSED**. Counts confirm why: `Idle` ×4, `Running`
×5, `AwaitingInput` ×7, `BackgroundWork` ×3, all surviving in unrelated prose. Now anchored on the two
sites that occur **exactly once** — `grep -c`'d first, which is the check that lesson prescribes and
that my original **rename**-based probe structurally could not perform.

**MAJOR 1 — the drive-mode guard was silently NON-UNIFORM across its arms.** `stepping`,
`orchestrated`, `fsd` occur once each (decisive by luck); **`autopilot` occurs 4×**, so that arm alone
would have survived deletion of the table it protects. ⚠️ Because the arms come from
`it.each(DRIVE_MODES)`, nothing in the output revealed which arm was weak. Anchored on the row
carrying the mode **number** — ⚠️ the bare `` | `autopilot` | `` cell is **also** not unique (it
recurs in the picker-cell state table at line 269), which only surfaced by `grep -c`-ing the
candidate anchor before using it.

**MAJOR 2 — `doc.len() > 5_000` replaced with paired head+tail section anchors.** ⚠️ **A head-only
check cannot see truncation, because truncation eats the tail** — proven: a 22,513-byte file cut at
its last section sails past the old byte threshold and **fails** the new tail anchor. The number was
also underived and unexplained, which is the shape a future reader **lowers** on first failure.

**MINOR — the duplicated `include_str!` is now one `arch_doc()` binding** with the traversal explained
once. ⚠️ **The `include_str!`-vs-`node:fs` split was NOT a defect** and is documented as deliberate:
`include_str!` is compile-time-checked so a moved doc breaks the **build**; the TS side follows the
`driveModeIpc.test.ts` convention for files outside the Vite graph.

**MINOR — the backlog entry's `background_tasks` wording refined rather than simply "corrected".**
⚠️ The reviewer called it the last live instance of the refuted phrasing; it is subtler than that —
the entry describes **CC's upstream payload**, which genuinely **is** an array. The imprecision was
omitting that *Claudesk* consumes only its **length**. Both facts now stated, with the rule for which
word to use where.

**Mutation-proven individually, every mutant confirmed landed:** gut the state union · gut the
indicator list · delete each of the four vocabulary rows · remove `background_task_count` · truncate
each doc. Each kills **exactly its own arm**; both docs restored byte-identical after every mutant.

⚠️ **`prettier --check` failed on first gate run** (my new test formatting) — fixed, then **all four
row anchors + the tail anchor re-verified present** after the reflow. That is the exact class that
silently broke a `?raw` guard in this repo before.

**Scope guard: nothing new implemented.** No functionality added, no architectural change; the two
findings I did not treat as defects are recorded above with reasons rather than silently skipped.

## Retrospect

- **What changed in our understanding:** ⚠️ **The WP's own three tasks were each wrong about what
  they were asking for, and discovering that WAS the work.** 5.2 ("CHANGELOG + delete-on-resolve") was
  **already satisfied** inside the WPs — running it as written would have double-counted the paper
  trail; its real deliverable turned out to be a **defect it left behind** (a stale duplicate backlog
  body). 5.1's installed-`.app` deferral rested on a far harder ground than the "operator prefers
  `/release`" the task cited — commit `25a68bc` is **not an ancestor of `v0.3.4`**, so the installed
  binary does not contain the plugin at all. And 5.3's *conditional* ("resync **if** WP2 added a
  state") was true, which means a shipped state had spent four days undocumented in the file
  `CLAUDE.md` declares **the authority**.
- **Assumptions that held:** the bucket's four WPs do coexist in one workspace header (verified live);
  the arch/roadmap resync was mechanical once the drift was found; `/product-finalize` was the right
  instrument and needed no inline substitution.
- **Assumptions that were wrong:**
  1. ⚠️ **That my own new guards were sound because I had mutation-proven them.** The code review
     found the `arch_doc` guard **non-decisive** — it asserted four bare words, none unique to the
     enum docs, so gutting the state contract left it green. **My probe could not have found this:**
     it was a *rename* (`BackgroundWork` → `BackgroundWorkX`), which tests boundary-matching and is
     structurally blind to anchoring. The prescribed one-command check (`grep -c`) sits in this
     repo's own lesson file and I did not run it.
  2. **That the drive-mode guard's four arms were equally strong.** Three were decisive by luck
     (one occurrence each); `autopilot` occurs 4×, so that arm alone would have survived deletion of
     the table it protects — and `it.each` made the asymmetry invisible.
  3. **That a byte-count meta-guard proves a doc loaded.** It cannot see truncation, because
     truncation eats the *tail*: a 22.5 KB truncated file sails past `> 5_000`.
- **Approach delta:** the plan's three phases held, but **Phase 3 gained a `/product-finalize`
  invocation as its own task** rather than inline work, and the WP gained an unplanned
  **review → refactor** cycle after ship. Two planned outcomes were **never met and are recorded as
  un-met rather than passed**: WP3's viewport-advance (needs real CC turn history) and WP4's
  queued-apply defect (needs a busy agent) — the latter re-confirmed accurate at source and left
  filed, operator-approved.

⚠️ **The lesson worth carrying past this WP, because it fired FOUR separate times here:**
**a probe that passes is under-determined — it means either the property holds or the probe was
invalid, and those are indistinguishable from the result alone.** All four instances this WP:
(a) `sed` with `\b` on macOS silently matched nothing (BSD sed lacks it) and read as three guard
holes; (b) a `prettier --check` exit code read as "would reformat" when it meant "nothing matched";
(c) a rename-based mutation read as a sound guard when it could not test anchoring; (d) the code
review's own repro read as a refutation when it had accidentally tripped a different assertion.
**In every case the tell was available in the probe's own output and required looking at it** — a
count that should have been 0, a discarded stderr, a substring that survived.

## Communicate

> **Feature complete:** M13.5 WP5 (bucket exit verify) has shipped. It verified the QoL bucket's four
> shipped work packages coexist in a live workspace, reconciled the durable records against what was
> actually built — three `arch/` subsystem docs had **zero** mention of what shipped — and closed the
> milestone. To see it: `git log --oneline 27b5dfe..HEAD` for the four commits, or
> `workflow-system/product/archive/milestone-13.5-qol-polish-bucket/wbs.md` for the closed WBS with
> each task's correction recorded.

**Requester = operator — closure notice for self-record.**

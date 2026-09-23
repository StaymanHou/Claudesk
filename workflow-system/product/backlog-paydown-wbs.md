---
shape: temporary-wbs
cycle: backlog-paydown-2026-09-23
created: 2026-09-23
status: in-progress
parent-backlog: workflow-system/state/backlog.md (+ workflow-system/state/backlog-quality-findings.md)
---

# Backlog-Paydown Sweep — 2026-09-23

> ⚠️ **This is NOT a roadmap milestone.** It reserves no milestone number and changes no
> execution order (F-b is still next; supervisor dogfeedback still runs on the wall clock in
> parallel). **This file is DELETED on completion** — see §"Fold back and delete". Do not resync
> it into `arch.md`.

**Run at:** the clean boundary after `v0.6.0` (F-a's first release). `wip/` empty, tree clean,
everything pushed.

**Inventory:** 63 SURFACE entries + **100 discrete code-quality findings** under 34 headings
(0 CRITICAL · 23 MAJOR · 77 MINOR). Anchor check against live code: **58 LIVE · 17 DRIFTED ·
3 PARTIAL · 22 GONE**. ⚠️ **About one in five finding bodies is stale.** The 2026-08-18/19 paydown
fixed them and never deleted them, which is the same shape as the open
`SURFACE-2026-08-26-DELETE-ON-RESOLVE-REWRITE-PATH-SKIPS-THE-DELETE`.

**Mode:** 3 (Autopilot). Unambiguous dispositions were applied automatically. Five items were
ruled by the operator (§Rulings).

## ⚠️ The sweep's central risk — read before any WP that touches a test

The F-a cycle's defect class was **guards whose STATED coverage exceeds their ACTUAL coverage**.
It happened three times in one WP, and the reviewer, not the agent, caught the third
(`CLAUDE.md` guard catalogue, entries 15–18). **This inventory found about 20 more, and one
claimed-closed fix turned out to be half-closed** (L1 below). So, for every WP:

- **Mutation-prove each guard change INDIVIDUALLY.** Confirm the mutant landed in
  **executable** code (`sed -n '<line>p'`; use `perl -pi -e`, because BSD `sed` has no `\b`).
  Then confirm the target test fails. An invalid probe and a real hole look identical.
- **Restore from a `cp` backup and verify with `shasum`. Never use `git checkout`.** It silently
  no-ops on an untracked file and destroys uncommitted work on a dirty tracked one
  (`[[git-checkout-no-ops-on-untracked-file]]`).
- **A finding closed by this sweep must name the mutant that now dies.** "Tests added" is not
  closure; that phrasing is how L1 passed as closed in August.
- **Any WP that deletes an export runs the boot smoke test (WP3) before a live observation is
  trusted.** As built, that is **`pnpm check:link`** (a `verify:auto` step). A Vitest import or render
  CANNOT see a missing export, because the module runner reads it as `undefined` (probed at WP3 plan).
- **Re-anchor every finding by SYMBOL.** 17 line numbers have drifted.
- Gate: `pnpm verify:auto` (timeout **216000**, per `runtimes.md`).

## Effort anchor (this project)

Benchmarked against the F-a cycle (`c26a9bd` → `5af55f6`) and the 2026-08-18 paydown
(`f92ca4f`, 8 WPs). A WP is one ship → review → finalize trio, about a day. So **WP-sized is
Medium and anything smaller is Small/XS**. Almost every finding here is Small/XS, which is what
Rule 1 is built to catch.

## Disposition model (applied — reproduced so build sessions rule consistently)

- **Impact** = feature value + maintainability, where maintainability = quality × P(future touch).
  **Effort** = implementer time, measured against the anchor above. **Risk** = P(the change breaks
  something the suite won't catch). Risk is suite-relative, so a fix that adds the missing test
  lowers its own risk.
- **Rule 1: cheap + safe → ALWAYS Sweep, no exception.** Closing an entry de-clutters the backlog,
  and that is an impact term in its own right.
- **Severity is an INPUT to impact**, not a sort key.
- **Ordering:** deletions → low-risk → high-impact → co-location. Effort is not an ordering key,
  and risk outranks impact.

## Rulings (operator, 2026-09-23)

- **R1 — Drive-mode apply cluster (H1/H2/H5d) → Option A, "disable while queued."** While an
  apply waits for idle (⏳ is shown, `respawnWanted`), the header readout is **disabled**. Its
  tooltip names the queued mode, so a second Apply can no longer be silently dropped at
  `resolveDriveMode`'s `|| respawnWanted` early return. `[PRIOR:
  explicit-selectable-mode-over-inferred-mode]`: the lower-bug-surface version was chosen because
  the value of changing modes mid-queue is unproven. **H2 (the 400ms `RESPAWN_INTENT_HOLD_MS`
  sleep) and H5d (extracting a `useDriveModeApply` hook) are DEFERRED to the next time
  drive-mode apply is touched.**
  - ⚠️ **Recorded so the escalation is not re-derived:** a "latest wins" supersede (B′) is
    **small**. The respawn reads the stored mode from `projects.json` **at spawn time**
    (`resolve_cc_spawn_env`), not the value captured at the click. So a second Apply need only
    persist, and the one queued respawn picks it up. In the race where the respawn reads before
    the write lands, the header's existing `is-stale` marker shows the mismatch, so the failure
    is not silent. Escalate to B′ **only if the operator actually hits "I want to change it
    while ⏳ is showing."**
- **R2 — Comment-convention pass (`SURFACE-2026-08-19-COMMENT-CONVENTION-PASS-T1-T2-DEFERRED`)
  → KEEP SEPARATE.** It is its own dedicated pass after this sweep, with the guard written
  first. All T1 (rationale duplication) and T2 (comment density) findings stay attached to it and
  are **not trimmed here**. A per-WP trim was measured as not converging, and a
  comment-duplication guard tacked onto a sweep is exactly the kind of guard that over-claims.
- **R3 — CSP (`SURFACE-2026-08-02-SET-A-CSP-AS-SECOND-LINE-OF-DEFENSE`) → BURY.** `csp: null` is
  accepted as the posture, and the sanitizer remains the only defense
  (`[[app-ships-with-no-csp]]`).
- **R4 — Four decision SURFACEs, recommended rulings accepted:**
  - (40) A typed `/exit` keeps the current behavior (b). Document it.
  - (46) The render harness is **formally** accepted as `renderToStaticMarkup` + per-file jsdom.
    RTL is not adopted.
  - (32) Dev-profile `dontAsk` drift gets a check-this-first line in `verify-self-tiers.md`, not
    an auto-seed.
  - (26) Subagent-analytics pairing is **Buried**.

## Finding-ID key

IDs are `<group letter><n>`. Each letter maps to one `# <name> — <date>` group in
`backlog-quality-findings.md` (whose `## SURFACE-…-QUALITY-…` entries are the finding bodies) and to
its `## Code-quality findings — <name>` pointer stub in `backlog.md`:

| | heading | | heading |
|---|---|---|---|
| A | fa-wp2-draft-store-history-payload | R | time-tracking-offline-local-only-copy |
| B | hotkey-reference | S | m10.9-wp3-invite-settings-substrate |
| C | supervisor-hotfix | T | editor-fs-backend-hardening |
| D | m15-wp4-context-pressure-recycle | U | m10.5-wp3-cc-terminal-clean-kill |
| E | m15-wp3-break-detection-and-auto-fire | V | m10-wp4-updater-user-control-ux |
| F | m15-wp2-state-machine-as-code | W | m9-wp6b-2 (Phase 4) |
| G | m15-wp1-supervisor-probe | X | m9-wp4-segment-model-query-layer |
| H | drive-mode-on-the-workspace-surface | Y | mirror-fill-from-bottom |
| I | turn-output-reorientation | Z | cc-permission-mode-dropdown |
| J | window-geometry-persistence | AA | qol-wp1-close-workspace |
| K | m13-wp4-milestone-exit-verify | AB | file-op-error-surface |
| L | m13-wp3-recycle-session | AC | m10.9-wp2-workflow-features-gate |
| M | m12-wp4b-drive-mode-signal | AD | m11-wp4-docs-live-reload |
| N | m12-wp3-autofire-and-announce | AE | wp2-background-work-status-states |
| O | m12-wp1-probe-flag-store-and-announce | AF | m14-wp2-sign-notarize-delete-quarantine |
| P | m11-wp3-docs-render-and-navigation | AG | m14-wp4-two-tier-setup-docs |
| Q | m11-wp2-docs-panel-plumbing | AH | fa-wp4-send-and-stage |

The number inside each ID follows the order the entries appear under that heading. ⚠️ **IDs are fixed as of the 2026-09-23 inventory.** Deleting a resolved entry does NOT renumber its siblings (after I2's deletion at WP3, I3 and I4 still mean what they meant). Anything that
starts with `SURFACE-` is a backlog.md entry and is referenced by its full ID.

---

## WP1 — Backlog bookkeeping: delete, bury, restructure  `[impact: Med · effort: S · risk: Lowest]`

> ✅ **CLOSED 2026-09-23** (task `paydown-wp1-backlog-bookkeeping`, archived). backlog.md 98 → 73 sections;
> 30 `**Backlog resolved:**` lines. Routing changes it made to later WPs: C3 added to WP4; row 17 in WP6
> is now verify-first; the `RecentProject` regex in WP6 is confirmed LIVE.

Pure subtraction and reorganization, so it runs first: it can only shrink surface. **Every delete
lands in the same commit as its `**Backlog resolved:**` CHANGELOG line** (delete-on-resolve
invariant). Drive via `/task-plan`.

1. **Delete the 22 GONE finding bodies** from `backlog-quality-findings.md`: C5, D3, J3.4, L3b,
   L3c, M1, M2.3, M2.4, N1a, N1c, O3, S2, V1, X1, X2, Y1, Z1, AC2, AD2, AD3, AD4, and **G1**. G1's
   premise lapsed: M15 is closed, so the archive directory it reads from is permanent.
   **Re-check each before deleting.** An agent classified these as GONE, and the classification
   is itself a claim. (L3a is GONE but carries a stale `:489` cite; fix the cite in WP4, then
   delete it.)
2. **Delete the four fully-GONE headings and their `backlog.md` stubs:** m10-wp4 (V), m9-wp4 (X),
   mirror-fill-from-bottom (Y), cc-permission-mode-dropdown (Z).
3. **Rewrite the PARTIAL entries down to what remains:** C6 (now 2 sites), L1 (only the
   `WORKSPACE_STATUS` arm is open; fixed in WP6), Q2 (the density remains; goes to the R2 pass).
4. **Reconcile the 10 stubs whose claims don't match their bodies.** Verify each stub-only claim
   against live code, then either route it or delete it:
   - m12-wp4b: `shell_spawn_env` test asserts the primitive, not the caller → **verify; if LIVE,
     route to WP6.**
   - m12-wp3: 3 stale "whole-feature gate" doc comments → **verify; if LIVE, route to WP4.**
   - m12-wp1: the lazy `\{[\s\S]*?\}` regex over `interface RecentProject` in
     `listProjectsConsumers.test.ts` (likely LIVE) → **WP6**. The Rust hazard-test doc paragraph
     → R2 pass.
   - m11-wp3 density, time-tracking "~55 lines of test commentary", and m10.9-wp2 "rationale in
     ~6 places" → R2 pass.
   - Remove the already-RESOLVED items still listed in stubs: m10.9-wp3 `WP3-POSITIONAL-RAW-SLICING`
     / kebab-case / `other_seven_fields`, m10.9-wp2 `WP2-RAW-GUARDS-STILL-LOAD-BEARING` /
     `ALLOWED_SAMPLE`, editor-fs `WP7-STALE-COMPILE-GAP-TEST-COMMENT`, and m9-wp6b "clears
     selection 3 ways" (verify first).
   - Stale Priority/Pickup lines: m15-wp4 (3 already-resolved MAJORs), supervisor-hotfix
     ("medium (3)"), m13-wp3 (its "pending" test exists). Fix stale `workflow/…` links (editor-fs,
     m9-wp6b, file-op-error-surface).
5. **Delete stale SURFACEs**, each with a `**Backlog resolved:**` line naming what closed it:
   - `…-07-14-M9-CUSTOM-RANGE-NEEDS-MULTIDAY-TIMELINE`: shipped as M9 WP6b-4, 2026-07-15.
   - `…-08-01-PNPM-SPIKE-IN-TMP-MUTATES-REPO-LOCKFILE`: the CLAUDE.md bullet exists.
   - `…-09-11-EVERY-INSTALLED-SKILL-IS-A-SYMLINK-INTO-THE-MCCC-SOURCE-REPO` and
     `…-09-11-A-DETECTOR-SCORED-AGAINST-ITS-OWN-POLICY-TABLE-IS-CIRCULAR`: both captured as
     memories.
   - `…-09-13-GIT-CHECKOUT-SILENTLY-NO-OPS-ON-AN-UNTRACKED-FILE`: captured as a (broader) memory.
     Add a one-line pointer in `docs/lessons/source-text-guards.md` first.
   - `…-08-22-STOP-BACKGROUND-TASKS-IS-AN-UNDOCUMENTED-SEAM` and
     `…-08-22-A-CC-SESSION-EXIT-KILLS-ITS-BACKGROUND-JOBS`: both are in
     `arch/status-channel-and-surfaces.md`. **Move the `shell-snapshots` discriminator detail
     into arch first**; it is the one thing only the second entry holds.
   - `…-09-11-Q2-SEPARABILITY-IS-MODEL-CONDITIONAL`: conditions 1 and 2 shipped
     (`assertPinnedModel`). **Merge condition 3 into
     `…-09-15-ADJUDICATOR-MARGIN-NEEDS-A-LARGER-LABELLED-SET`**, then delete.
6. **Bury** (move to `backlog-archived.md` with a `Buried because:` line), per §Scope below.
7. **Structural:**
   - 5 active SURFACEs and 3 stubs sit **physically below `## Buried`** (≈ lines 1664–1819). Move
     them above it.
   - Move the one item under `backlog.md`'s `## Buried` into `backlog-archived.md`, then remove
     the section.
   - The ~36 lines of historical `> **… cycle-close — backlog sweep …**` blockquotes are not open
     work. **Move them verbatim** into `workflow-system/state/archive/backlog-cycle-close-notes.md`;
     do not delete them.
8. **Hygiene:**
   - Add `Status:` lines to the five entries missing one.
   - Fix `…-09-12-ONE-TRANSITION-HAS-NO-PAUSE-POLICY-ROW-UPSTREAM`, whose body still says "two
     transitions."
   - Refresh the "latest v0.5.0 / no release cut" anchors in `…-SUPERVISOR-DOGFEEDBACK-BATCH-1`
     and `…-SUPERVISOR-NEVER-OBSERVED-FIRING…`. `v0.6.0` is out, so blocker (b) has cleared.
   - Rewrite `…-09-17-F10B-STOPPED-BEFORE-VERIFY-HUMAN…` down to its remaining **measurement**.
     The mccc fix landed at `07ff3ba`.

## WP2 — Local docs, lessons, rulings, and the mccc handoff  `[impact: Med · effort: S · risk: Low]`

> ✅ **CLOSED 2026-09-23** (task `paydown-wp2-docs-rulings-handoff`, archived). 10 entries resolved and deleted.
> The handoff consolidates **12** backlog entries + O2, not "13 + O2": F10B was excluded because it was already fixed
> upstream. Correction found while writing: `tooling/autofire-timing/probe.py` does NOT speak to the hook socket
> (the inventory said it did). No helper exists yet.

Documentary only. Drive via `/task-plan`.

- **Lessons / tiers:**
  - (9) Dictation and other macOS text-input services are dead under `tauri:dev` → add a tier
    line in `verify-self-tiers.md`.
  - (15) Agent-launched CC produces no real hook event → write up the socket-injection technique
    (cite `tooling/autofire-timing/probe.py`).
  - (30) osascript cannot safely address the dev build → a "drive dev only via the MCP bridge"
    rule. **Amend `[[verify-self-dev-vs-prod-process-name-collision]]`**, which still prescribes
    the targeting this entry says fails.
  - (34) A renamed skill's usage figure spans two command names → add a lessons line.
- **Code-adjacent doc notes:**
  - (39) Add a ⚠️ to the `cc_ready` doc in `commands.rs`: it means *frontend ready*, not *CC ready*.
  - (61) Add a seam-contract note: the Settings panel reads the gate through its own control, not
    the hook.
- **Memory hygiene:** (58) fix stale `workflow/` paths in 3 memories — `feedback_surfaced…`,
  `observable-outcomes…`, `m7-docs-viewer-intent`. **Leave the quoted historical note in
  `widened-selector…` alone.**
- **R4 rulings:** document (40), (46) and (32), then delete each entry. (26) was Buried in WP1.
- **mccc handoff.** Write `HANDOFF-to-mccc-2026-09-23-paydown.md`, following the existing
  `HANDOFF-to-mccc-m15-wp*.md` shape. It consolidates the 13 upstream items plus O2:
  `…-09-17-OBSERVABLE-OUTCOME-WRITTEN-FOR-A-SURFACE-A-LATER-PHASE-BUILDS`,
  `…-09-15-WIP-FILES-USE-PROSE-HEADERS…`, `…-09-12-ONE-TRANSITION-HAS-NO-PAUSE-POLICY-ROW…`,
  `…-09-12-THE-TWO-UPSTREAM-COPIES-OF-THE-FEATURE-GRAPH-DISAGREE`, `…-08-25-PROBE-CHECK-EXEMPTS…`,
  `…-08-25-REFUTATION-FROM-TYPINGS-NOT-RUNTIME`, `…-08-06-SESSION-RESTORE-CONTRADICTS-ITSELF…`,
  `…-08-28-SUPERSEDED-TEXT-IN-DURABLE-DOCS…`, `…-08-26-DELETE-ON-RESOLVE-REWRITE-PATH…` (upstream
  half), `…-08-25-OBSERVABLE-OUTCOME-ASSERTED-A-GREEN-GATE…`, `…-08-25-A-DELETED-EXPORT…`
  (upstream half), `…-09-17-REVIEW-QUALITY-DIFF-WINDOW…`, and O2.
  - ⚠️ **Do not edit mccc from here.** `_ref/` and `~/.claude/skills/` are symlinks into that
    repo (`[[installed-skills-are-symlinks-into-the-mccc-repo]]`).
  - Each entry **stays open**, re-anchored to the handoff file. **None are resolved by writing
    the handoff.**

## WP3 — A whole-app boot smoke test  `[impact: High · effort: M · risk: Low]`

> ✅ **CLOSED 2026-09-23** (feature `paydown-wp3-boot-smoke-test`, archived; `7c91d30` step 0 + `374e7a4`).
> ⚠️ **The "Done" mechanism below was REFUTED at plan time and replaced (operator-approved at P1 verify-human).**
> Under Vitest a consumer's missing named export never throws (the module runner reads it as `undefined`), so
> no jsdom import or render can fail on it. The goal split into two checks, each mutation-proven against its
> own class:
> - **`pnpm check:link`** (rollup, `write: false`, a `verify:auto` step between tsc and vitest) catches the
>   deleted-export class. Mutants that die: un-exporting `newWorkspaceChord` (main) or `computePanelSize`
>   (PiP-only); `linkCheck.test.ts` kills catch-swallow, a dropped `root`, always-fail, the unwired step, and
>   the reordered step.
> - **`src/__tests__/appBoot.test.tsx`** boots the real `main.tsx` + `pip/main.tsx` under jsdom and catches
>   evaluation- and mount-time throws. Mutants that die: a render throw in `ProjectPicker`, top-level throws in
>   `cleanExit.ts` / `pipPanelSize.ts`, `setRecents([])` (identity), and `main.tsx` not rendering. The PiP half
>   is claimed, not deferred.
> - I2 resolved (the gate is built and the header narrowed). Row 60's **local** half is resolved; its upstream
>   half stays open for mccc. The review found 2 MAJOR + 6 MINOR, auto-backlogged: MAJOR-1 is that `check:link`'s
>   "both entries" claim is not pinned by a durable test.

⚠️ **STEP 0, added at WP2 verify: restore the green gate first.** `pnpm verify:auto` has been RED on
`main` since `08f2db5` (Release v0.6.0 reflowed `tauri.conf.json`'s `resources` array; `prettier --check`
fails at step 2). Run `prettier --write src-tauri/tauri.conf.json`, confirm the gate exits 0, and add a
format check to `.claude/skills/release/SKILL.md` step 2 before its commit
(`SURFACE-2026-09-23-VERIFY-AUTO-RED-ON-MAIN-SINCE-THE-V0.6.0-RELEASE-COMMIT`).
✅ **Step 0 DONE 2026-09-23:** config reformatted, gate exits 0, and release skill step 2 now runs
`prettier --write` + `--check` on `tauri.conf.json` before its commit. SURFACE deleted with its CHANGELOG line.

Additive, so it lowers the risk of every later WP that deletes something (WP5's `chordLabel`,
WP8's legacy `WorkspaceStatus`). Drive via `/feature-plan` (it may need phases).

- **Gap (row 60 local half + I2):** nothing boots `main.tsx`.
  - `src/updater/__tests__/moduleGraphBoot.test.ts` covers **only the updater graph**.
  - `turnNavExportContract.test.ts` covers **one** import edge, yet its header claims
    app-start blast-radius coverage.
  - The M13.5 WP3 blank-app CRITICAL is the failure this must catch.
- **Done:**
  - A test that loads the real app entry graph under jsdom (per-file
    `// @vitest-environment jsdom`, with a stubbed `__TAURI_INTERNALS__`) and fails on a
    missing-export `SyntaxError`.
  - **Mutation-proven** by deleting one live export the app imports at boot. The test must go
    red while `tsc` is bypassed.
  - Narrow `turnNavExportContract.test.ts`'s header to what it actually covers.
- **Fallback, if the full App cannot boot cheaply under jsdom:** import the module graph without
  rendering. That is still the whole graph, and it catches the ESM-linking failure class. Record
  the rendering half as a Defer, and **do NOT write a header claiming more than the test does.**

## WP4 — Narrow every over-claiming comment to what the code does  `[impact: Med · effort: S · risk: Low]`

Documentary. ⚠️ **Re-anchor by symbol.** These are not density trims (that is R2); each one is a
comment that asserts something false. Drive via `/task-plan`.

- **C1 option (a).** The `Workspace.tsx` header says the supervisor toggle is read "PER TURN,"
  but it is re-read only on a `visible` edge. That is harmless today: the **only writer is the
  workspace's own toggle** (updated through local state and a ref), and the registry is 1:1 by
  path. **State that.** Options (b)/(c) are deferred to F-b, the first thing that could put two
  workspaces on one tree.
- **C2.** The `UnsentInputWatermark.clear()` doc says it is "used at a turn boundary," but it has
  **no production caller, by design**. `useSupervisor.ts` records that the watermark
  deliberately does not clear, and its false-positive rate is what dogfooding measures. **Restate
  the doc as unwired/reserved. Do NOT wire a turn-boundary clear during dogfooding.** That would
  change the behavior under observation, and it would discard real on-screen input.
- **H3, H5a, H5b** (the drive-mode comments, part of R1):
  - H3: the `RESPAWN_INTENT_HOLD_MS` comment borrows `INJECT_SETTLE_MS`'s credibility. It is
    unmeasured, so say so.
  - H5a: delete the orphan duplicate "Apply: persist, then respawn…" block.
  - H5b: `/** Cancel: a TRUE no-op */` sits on `resolveDriveMode`. Move or delete it.
- **I2, I3, I4:**
  - I2: covered by WP3.
  - I3: the "push not poll" prose is false at 2 of 3 layers → narrow it.
  - I4: 7 lines about the removed `TURN_MARKER_COLOR` → reduce to one line or delete.
- **Others:**
  - A3: the `loadDraft` `typeof raw` comment → say it guards the test double.
  - D2: the `useCallback(onTurnEnd, [host])` comment implies stability → say what it does.
  - G3: "consults no policy table" is false (472 undecided records are excluded) → fix it here
    and in the probe-report line.
  - S1: the substrate comment is detached from `substratePresent` → reattach it.
  - N1b: the spawn-effect `exhaustive-deps` exclusion list omits `pendingAction`/`openIntent`.
  - L3a's stale `:489` cite → cite by symbol.
- **C3 (added at WP1).** `config_store/mod.rs`: two tests' doc comments were merged into one
  block above `an_absent_supervisor_enabled_key_reads_as_on`, and
  `an_unknown_drive_mode_string_fails_the_whole_project_list` lost its own doc. Split them back.
  *(The m12-wp3 "whole-feature gate" comments WP1 was to check are RESOLVED: the only surviving
  mentions describe the change FROM that gate.)*

**✅ WP4 CLOSED 2026-09-23.**
- Every item above was narrowed; code files changed in comments only, proven by a
  comment-stripped token-stream diff with a positive control.
- Six WP3 prose findings were folded in, and entries 17 and 18 were written in
  `source-text-guards.md`.
- Three WP3 residues went to WP6.
- `SURFACE-2026-09-23-QUALITY-VITEST-UNDEFINED-RATIONALE-DUPLICATED-8X` is T1 rationale
  duplication, so it goes to the **R2 comment-convention pass**, not here.
- ⚠️ N1b's own premise was stale: `openIntent` is NOT immutable after mint. The comment
  records why it is excluded anyway.

## WP5 — Chord registry + Settings panel: guards that can't see what they claim  `[impact: High · effort: S · risk: Low]`

Co-located (`chordRegistry*`, `SettingsPanel.tsx`, `editorExtensions.ts`). **This is the surface
where F-a's third guard hole was found.** Drive via `/task-plan`.

- **B2 (MAJOR).** The CM6-owned-set guard regexes literal `key:` syntax, so it cannot see
  `...searchKeymap`. **`cm6-find` (⌘F) has zero coverage.** Fix: **import and resolve
  `searchKeymap`.** Widening the regex only proves the spread is present
  (`[[source-guard-blind-to-spread-bindings]]`). Mutation: drop ⌘F from the registry, and the
  guard must fail.
- **B3 (MAJOR).** `HOST_SECTIONS` duplicates the `ChordHost` union, and the render test iterates
  the same array. Tie it with exhaustiveness (a `satisfies Record<ChordHost, …>`, or derive one
  from the other). Mutation: add a host to the union only.
- **B1 (MAJOR).** The only multi-outcome selector is `.settings-hotkey-outcome`, a class with no
  CSS rule, so a cleanup silently removes the assertion's handle. Give it a `data-testid`, or a
  rule plus a test-handle comment.
- **Row 6.** The completeness guard selects matchers by a `/[Cc]hord/` naming convention. Make
  the selector structural (registry-aware). ⚠️ Diff the OLD and NEW candidate sets
  (`[[widened-selector-must-be-strict-superset]]`).
- **B4.** `chordLabel` has zero non-test consumers. Delete it (then run the WP3 boot test) or
  wire it; pick the one the Settings render already wants.
- **B5.** `visibleChords(...)` is recomputed per section → hoist it.
- **AC1.** The Settings panel uses `picker-*` data-testids → rename them, and their 5 wiring tests.
- **AG1.** An unanchored `w.includes(e.label)` → anchor it. **AG2.**
  `readmeTierOneHonesty.test.ts` is in the wrong directory → move it.

**✅ WP5 CLOSED 2026-09-23** (task `paydown-wp5-chord-registry-settings-guards`, archived).
- Every item was closed with a named mutant that now dies. Where the old guard could be
  re-run, it was shown to PASS the same mutant (B2, Row 6, B3, AG1), so each hole was real.
  B4, B5 and AG2 are a deletion, a hoist and a move.
- B2: resolving the spread surfaced 3 more uncatalogued CM6 bindings (⌘G, ⌘⇧L, ⌘⌥G). They are
  in `NOT_LISTED` with reasons, not new Settings rows. ⚠️ ⌘⌥G go-to-line is a product call if
  wanted.
- Row 6 was done test-side (TypeScript AST, unioned with the name-based arm); no host was
  refactored. Residual: a matcher fed an event-*derived* local is still invisible.
- B6 stays with R2.

## WP6 — Guards and tests that cannot fail  `[impact: High · effort: S · risk: Low]`

The central class, outside the chord surface. Each item names the mutant that must now die. Drive
via `/task-plan`, or split in two if it runs long.

- **L1 (MAJOR, claimed closed in August, only half closed).** `recycleSession.ts`
  `awaitCompletion` has two `settled ? un() : unlisteners.push(un)` arms. `recycleSession.test.ts`
  covers the **`fs-change`** arm. The **`WORKSPACE_STATUS`** arm is still unreachable, because
  its mock resolves synchronously, and the test comment claims both. Defer that mock's unlisten,
  then mutate **that arm alone**.
- **Row 1 (`SURFACE-2026-09-21-UNCHUNKED-BASE64-ENCODER-OVERFLOWS-ON-LARGE-INPUT`, premise
  refuted, verified this sweep).** `autoResumeFire.ts` `encodeUtf8Base64` builds its string with
  a per-byte `+=` loop, which **does not overflow**. So the "REGRESSION GUARD" at
  `stagedPayload.test.ts` "encodes a body large enough to overflow an unchunked spread" **cannot
  fail** in the scenario it names. Fix:
  - **Dedup `autoResumeFire` onto `cc/bridge`'s `encodeBase64`.** Delete the twin; check that its
    UTF-8 handling is equivalent before swapping.
  - Rewrite the test comment so it claims only what the test checks (a size/round-trip test).
  - Delete the SURFACE.
- **C4.** `supervisorToggleStyles.test.ts` `CLASSES` asserts only its own length.
- **F1.** Hardcoded counts (232, 44, 111×2) that are arithmetic of each other → derive them.
- **F2.** The live funnel guard keeps inline regexes while the discrimination block tests copies
  → make both use one source.
- **G2.** The `scoreArm` 0.8 bar is hardcoded apart from `_meta.threshold`, and haiku's margin
  uses sonnet's positive count.
- **G4.** Near-tautological assertions → delete them. **G6.** `Object.values` depends on insertion
  order → destructure by key.
- **AF1.** A pure `not.toContain` reverse guard → add a positive anchor (CLAUDE.md entry 13).
- **AE1.** The CSS regex guard understands one shape and its failure message misleads → list the
  shapes it cannot read in the message.
- **J3.2.** `!code.contains('"')` is broader than its property → narrow it. **J3.1.** A bare
  `"main"` literal → share `MAIN_WINDOW_LABEL`. **J3.3.** `[&'static str; 1]` → a slice.
- **A1.** The ESC[201~ terminator count filters elements, not indices → copy the index-loop form
  at `:207`.
- **Row 17's local half.** The feature-graph drift test is `_ref/`-gated and skips on a fresh
  checkout. ⚠️ **Verify first:** the backlog entry itself claims it is *"reported as skipped,
  never silently passed"*, which contradicts the inventory's flag. If the skip is already visible
  in the runner's count, this is **no-change-needed**; record that with the evidence. Otherwise
  make it visible (`it.skipIf` with a reason).
- **Row 28.** Classify `elicitation_url_dialog` explicitly in `event_to_state`, and pin the
  vocabulary so an unlisted type is a deliberate decision, not a fallback.
- **Row 7.** The `scrollToFragmentWhenPresent` timer fires after teardown, so `verify:auto` exits
  1 with 0 failures. Keep a cancellable handle and clear it on teardown.
- **Row 29.** Change `hook_socket` test `client.shutdown().unwrap()` to `let _ =`, and add a
  mutation check that `join` is still asserted.
- **m12-wp1 `RecentProject` regex (confirmed LIVE at WP1).** `listProjectsConsumers.test.ts`'s
  `/interface RecentProject[\s\S]*?default_model\?/` can match past the interface's closing brace
  into a later declaration, so brace-count the slice. Mutation: move `default_model?` out of the
  interface into a following one; the guard must fail. *(The m12-wp4b `shell_spawn_env` item is
  RESOLVED: the test now asserts the `spawn_shell` call site.)*
- **WP3 review residue (routed here at WP4, 2026-09-23):**
  - **`SURFACE-2026-09-23-QUALITY-LINK-CHECK-BOTH-ENTRIES-CLAIM-IS-UNPINNED` — the code half.**
    WP4 narrowed the prose in `linkCheck.mjs` and `verify-auto-gate.md` so it no longer claims
    the property. Now pin it: assert that both the `main` and `pip` entry chunks are in the
    RollupOutput, and exit 1 if either is missing. Codify mutant B (PiP-only `computePanelSize`)
    with a two-input fixture. **Mutant that must die:** narrowing `rollupOptions.input` to
    `main` only. Then update the two narrowed sentences back to a claim.
  - **`…APPBOOT-UNCAUGHT-ASSERTION-UNPROVEN`.** Add a positive control, a throw inside a
    `setTimeout` on the boot path where the picker still renders, and confirm it goes red on
    `expect(uncaught).toEqual([])` **alone**. Otherwise delete the assertion.
  - **`…LINKCHECK-TEST-OUTSIDE-TSC-INCLUDE`.** Rename it to `.test.mjs`, or add
    `tooling/link-check` to a tsconfig `include`.


**✅ WP6 CLOSED 2026-09-23** (task `paydown-wp6-guards-that-cannot-fail`, archived).
- Every guard change names a mutant that now dies. Where the old guard could be re-run, it
  PASSED the same mutant: L1, C4, F2, G2, AF1, RecentProject ×2, the link check, and
  linkCheck-in-tsc. So those holes were real. The per-ID table is in the archived WIP's
  `## Closure evidence`.
- **Not claimed as kills:**
  - G4 is a deletion (33 → 31 tests).
  - G6 and J3.1/J3.3 are refactors.
  - G2's per-arm-positives half is an equivalent mutant on this data (both arms have 29).
  - AE1 is a message change, shown by a mutant tripping the new message.
- **Row 17 needed no change**, and the evidence is recorded on its SURFACE.
- **appBoot `uncaught` was KEPT.** A throwing DOM listener turns it red on its own, with
  Vitest reporting nothing. A timer throw does not reach it; Vitest's own unhandled-error
  report catches that one.
- **Row 1's premise was refuted.** The deleted encoder never overflowed. The 200k test now
  guards the chunking inside `encodeBase64`.
- **Row 28 was rewritten, not deleted.** What remains is the periodic corpus check for an
  UNDOCUMENTED type.
- Plus Row 7, whose one extra defect was caught by running it: the caller's pre-aborted check
  was untested, and now has a test.

## WP7 — Render instead of `?raw`; tests that re-implement production  `[impact: High · effort: M · risk: Low]`

The "prove a copy, not the code" class. Each change **replaces** a test with a stronger one, so it
cannot reduce what production does. Drive via `/feature-plan`.

- **I1 (MAJOR).** `turnNavControls.test.ts` answers DOM-at-rest questions with `?raw` → render it
  (`renderToStaticMarkup`, per R4-46).
- **H4 (MAJOR).** `workspaceDriveModeRender.test.tsx` has `persist` / `e.payload.path` source
  guards while `shouldApplyBroadcast` is extractable → drive the extracted function.
- **AH1 (MAJOR).** `promptSendWiring.test.tsx` `performSend` re-implements the panel's send
  sequence → a jsdom render with a CM6 host that captures `onRegisterSend`.
- **AA1.** The `requestCloseWithIntent` / Filmstrip × close wiring has no test. Its trigger ("a
  render harness exists") has fired.
- **E2.** The adjudicator test helpers re-implement the production wait/kill loop → test
  `run_adjudicator` through an injectable program path.
- ⚠️ For each replaced guard, **confirm the new one kills the mutant the old one claimed to kill**
  before deleting the old one.

**✅ WP7 CLOSED 2026-09-23** (feature `paydown-wp7-render-instead-of-raw`, archived; ship `a26b514`).
- All five items were resolved, and each names the mutants that now die. Where the old test could
  be re-run, it PASSED them: AH1 5/5 and both H4 regex-shaped edits. The per-mutant tables are in
  the archived WIP's `## Phase N build evidence` sections.
- **What changed in the approach:**
  - H4 was resolved by a LIVE `Workspace` mount, not by extracting `shouldApplyBroadcast`, so no
    source guard remains.
  - AA1 goes through the real `App`.
  - E2 gained an argv pin (`adjudicator_command`).
  - The render-harness lesson's "no interaction" half was corrected: `act` + `createRoot` under
    jsdom, and still no RTL.
- **New open work from this WP:**
  - `SURFACE-2026-09-23-SUPERVISOR-ADJUDICATE-BLOCKS-THE-MAIN-THREAD` → WP9, named there.
  - A 1 MAJOR + 5 MINOR code-quality pointer (`# paydown-wp7-render-instead-of-raw`). Most notably,
    the harness lifecycle is forked by `closeWiring` and its `pane` stub is single-instance. The
    `run_command` pipe-drain MINOR travels with E3 (WP8) and WP9.

## WP8 — Small live defects and dead code  `[impact: Med-High · effort: S · risk: Low-Med]`

Behavior changes, so they come after the guard WPs have strengthened the suite. **Run the WP3
boot test after each deletion.** Drive via `/task-plan`.

- **H1 (R1, Option A).** Disable the drive-mode readout while `respawnWanted`, with a tooltip
  naming the queued mode. **Test:** render it queued and assert the control cannot open the
  editor; mutate the gate away and the test fails.
- **I6.** The `aria-live` region is conditionally mounted, so the first turn is never announced →
  mount it unconditionally and gate only its text.
- **AE2.** `state/workspace.ts` has a legacy `WorkspaceStatus` that is written and never read →
  delete it. ⚠️ **The export deletion and its consumer migration go in ONE commit**, followed by
  the boot test.
- **E3.** `AdjudicateError::Failed { stderr: String::new() }` discards captured stderr → pass it
  through.
- **U1.** `KillStep::ReapLeader` `let _ = poll_reaped` → log a failed reap.
- **M2.2.** A silently dropped can't-happen serde failure in `cc_spawn_env` → `expect` with a
  reason, or log it. **M2.1.** `%KNOWN` is rebuilt per call in `claudesk-hook.pl` → hoist it.
- **T2.** Add an `UnknownRoot` variant for `validate_root`'s `"<no known project>"`. **T3.** A
  one-line note on the `exists()` → `canonicalize()` non-issue.
- **D1.** The `input.contextTokens as number` cast rests on prose → narrow it through the type.
- **A2.** The `appendToHistory` blank check reads storage before the `safeStorage()` guard →
  reorder. ⚠️ **Do NOT return `[]` from the blank arm.**
- **H5c.** `.workspace-header-drivemode` is declared twice in `App.css` → merge.
- **K1** (Rule 1). The archived `m13-wp4-milestone-exit-verify.md` has phase sections out of
  order → **move** them into order; do not rewrite.

**✅ WP8 CLOSED 2026-09-23** (task `paydown-wp8-small-live-defects-and-dead-code`, archived).
- All 11 items are closed. Each behavior change names the mutants that now die (H1 ×2, I6, D1 ×2, E3, T2), and the per-item table is in the archived WIP's `## Build evidence`.
- **What differed from this list:**
  - **A2 was REFUTED, not fixed.** Both `appendToHistory` arms call `loadHistory`, which runs its own `safeStorage()` guard first, so reordering would remove zero reads. Nothing was edited.
  - **M2.1 was NOT hoisted.** The hook is one process per event, so the hash is already built at most once per process. A file-scope hoist would build it for all 10 events instead of 1. A comment now answers the question instead.
  - **M2.2 logs rather than `expect`s**, because a panic in the spawn path would be worse than a dropped var.
  - `SURFACE-2026-09-23-QUALITY-RUN-COMMAND-PIPES-NOT-DRAINED` stays with WP9 (the same restructure as the async move).

## WP9 — Guard against blocking work in sync Tauri commands  `[impact: High · effort: M · risk: Med]`

`SURFACE-2026-08-25-SYNC-TAURI-COMMANDS-MAY-BLOCK-THE-MAIN-THREAD`. The riskiest item, so it runs
**last**. The inventory may find a real blocking site, and moving that site to a worker thread is
a behavior change the suite may not see. Drive via `/feature-plan`.

- **Inventory:** every sync `#[tauri::command]` body that reaches `thread::sleep`, a blocking
  poll, or a lock held across a main-thread marshal. There are ~11 `thread::sleep` modules in
  `src-tauri`; the incident tests pin only 2 sites.
- **Guard:** mutation-proven against the **pre-fix `cc_kill`** shape (the P1 2026-08-25 hang). It
  must fail on that shape, not just pass on today's code.
- **Known hit (found at WP7 Phase 1, 2026-09-23):** `supervisor_adjudicate` (`adjudicator/commands.rs`) is sync, and its body sleep-polls `claude -p` for up to `timeout_ms`. See `SURFACE-2026-09-23-SUPERVISOR-ADJUDICATE-BLOCKS-THE-MAIN-THREAD`.
- **Any real site found:** move it to a worker (`SessionRegistry::take` + `thread::spawn`
  precedent). The UI-freeze half is verified live with `sample`
  (`docs/lessons/pip-nspanel-main-thread.md`).

**✅ WP9 CLOSED 2026-09-23** (feature `paydown-wp9-sync-command-blocking-guard`, archived; ship `17f90e5`).
- **The guard:** `src-tauri/tests/sync_commands_do_not_block.rs`. It follows calls transitively, parsed with `syn`, over all **78** commands. It is mutation-proven against the **pre-fix `cc_kill`**, which fails with `cc_kill → kill → poll_reaped → sleep`, and has 10 fixture self-tests.
- **The inventory found 7 flagged commands:**
  - **2 real, fixed:**
    - `supervisor_adjudicate` → `async` + `spawn_blocking`. The freeze was confirmed live by `sample`: 2327/2327 samples on the main thread before, 0 after.
    - `workflow_uninstall_dry_run` → `(async)`.
  - **1 accepted:** `quit_now`.
  - **4 false positives:** `git_*`, where `.status()` is git2's accessor.
- **`run_command`** took 3 back-loops, 1 shortcut and 5 fresh adversarial verify rounds before its exits held. It now has continuous drains, a 4 MiB cap with `OutputTooLarge`, and a group kill on timeout.
- ⚠️ **The review found the dry-run fix INCOMPLETE:** `(async)` still pins a runtime worker. That is backlogged, with 3 other MAJORs and 5 MINORs, under `# paydown-wp9-sync-command-blocking-guard`.

## WP10 — Mark a staged prompt as dictated  `[impact: Med · effort: S · risk: Low]`  *(operator-added 2026-09-23, mid-WP4)*

⚠️ **New behavior, not paydown.** This is an operator ask, not an inventory finding. It lives here
because the operator put it on this list; it changes no execution order. Drive via `/task-plan`,
or `/feature-plan` if the open questions below do not settle in one line each.

**The ask** (operator's words): the prompt staging area should *"prepare or inject a sentence
saying that, or maybe not just prepared but wrap the prompt between notes saying that this
section is dictated, which may contain speech detection or recognition errors."* The goal: CC
reads a dictated body charitably. A misheard word gets read as an ASR slip, not as the
operator's intent.

**Where it goes (as-built seam):** `stagedPayload(body, { submit })` in
`src/components/workspace/stagedPayload.ts`. Its only production caller is
`prompt/sendStagedDraft.ts`'s `buildPayload`. Wrap the **body** before normalization, so the
notes sit **inside** the bracketed-paste envelope, and the `ESC[201~` neutralization plus the
`\r` normalization still apply to the whole thing.
- ⚠️ **Do NOT touch `slashCommandPayload`** (the F-a ruling; M12/M13/M15 callers stay
  byte-identical).
- ⚠️ **Wrap at SEND time only.** The draft store and history keep the raw body, so a
  recover/re-send does not double-wrap.

**Open questions — the operator's to settle at plan time** (recommendation first):
1. *Wrap (open + close note) or a single leading sentence?* → **Wrap.** It bounds the dictated
   span, so text the operator appends in CC's own prompt after a stage-only (`⇧⌘↵`) send is not
   covered by the caveat.
2. *Always, or only when the body was actually dictated?* → The panel accepts typed text too, and
   macOS dictation leaves no reliable DOM signal (it arrives as ordinary input events). So the
   honest choices are **always**, or an **operator-controlled toggle** in the panel. The
   recommendation is a per-panel toggle, **default ON**, since the panel exists for dictation.
3. *Wording.* → Short and literal, e.g. `[Dictated via speech recognition — may contain
   transcription errors; read for intent.]` … `[End dictated section.]`. Keep it out of any
   `TRANSITION:`/slash-command shape, so it can never look like a workflow token.

**Rulings (operator, 2026-09-23, at restore):** Q1 **wrap** (open + close note). Q2 **per-panel
toggle, default ON**. Q3 the proposed wording **minus "read for intent"**, exactly:
`[Dictated via speech recognition — may contain transcription errors.]` … `[End dictated section.]`

**Done when:** a value test asserts the exact decoded payload for wrap ON, for OFF, and for both
submit modes, **identity, not length** (source-text-guards entry 15). It is mutation-proven by
(a) dropping the close note and (b) wrapping after normalization. A render or wiring test proves
the toggle reaches `buildPayload`, because a pure builder proves the machine, not its caller.

**✅ WP10 CLOSED 2026-09-23** (task `paydown-wp10-dictated-prompt-wrap`, archived).
- **What was built:**
  - A **required** `dictated` option on `stagedPayload` and `planSend`. It wraps the body before normalization, so the notes sit inside the envelope, and `plan.body` stays raw.
  - A persisted **Dictated** checkbox in the panel's action row, default ON.
- **Proof:**
  - Value tests pin the exact bytes for ON/OFF × submit/stage.
  - Three mutants were killed, each individually: close note dropped (7 fail), wrap after normalization (8 fail), panel ignores toggle (2 fail).
  - Verified live against a real `claude` prompt: the wrapped and raw arms both landed, unsubmitted.
- **Default taken:** the toggle is ONE global key (`claudesk.prompt.dictatedWrap`), not per-workspace.
- ⚠️ **Real dictation into the panel is still unexercised.** macOS dictation does not engage under `pnpm tauri:dev`, so that stays with the backlog's dictation entry (needs a released build).

---

## Scope — what's NOT swept (anchors intact)

**Deferred:**

| Item | Why | Anchor |
|---|---|---|
| H2 (400ms sleep), H5d (`useDriveModeApply` extraction) | R1 | next touch of drive-mode apply (B′ note in §Rulings) |
| `SURFACE-2026-08-19-COMMENT-CONVENTION-PASS-T1-T2-DEFERRED` + B6, C6, D4, E1, G5, I5, J1, J2, K2, L2, Q1, Q2, AD1, AH2, and the density halves of the m11-wp3 / time-tracking / m10.9-wp2 / m12-wp1 stubs | R2 | its own guard-first pass, **immediately after this sweep** |
| C1 options (b)/(c) (per-turn re-read / broadcast), `…-08-21-STATUS-PATH-KEYS-ON-CWD-ALONE…` | harmless while path↔workspace is 1:1 | F-b (the first thing that could put two workspaces on one tree) |
| `…-08-18-GUARD-VOCABULARY-MISSES-RECYCLE-AND-SESSION` | a vocabulary decision owned by the next gated surface | `…-09-21-SUPERVISOR-HAS-NO-OPERATOR-VISIBLE-ACTIVITY-SURFACE` (owns the 7th arm) |
| `…-09-15-ADJUDICATOR-MARGIN-NEEDS-A-LARGER-LABELLED-SET` (+ merged Q2 condition 3) | a measurement, not a fix | before any adjudicator tuning |
| `…-09-18-DOC-COUNT-NEEDS-A-GENERATOR-NOT-A-DETECTOR` | its own trigger | "if the arm count drifts again" |
| AC3 (`SettingsPanel.tsx` size, 683 lines) | M-effort extraction; WP5 touches the file for guards only | next Settings feature |
| AB1 (file-op error surface) | net-new UX | feature backlog |
| Supervisor dogfeedback: `…-09-14-SUPERVISOR-NEVER-OBSERVED-FIRING…`, `…-09-15-SUPERVISOR-DOGFEEDBACK-BATCH-1`, `…-09-21-SUPERVISOR-HAS-NO-OPERATOR-VISIBLE-ACTIVITY-SURFACE` | wall-clock | ~1 week of real use; the last opens with its own `/util-grill-me` |
| `…-09-15-STAGING-AREA-FOR-PROMPT-INPUT` | reopening condition live on v0.6.0 | an operator dictation report. **Do not re-probe.** |
| `…-08-06-MANUAL-SESSION-START-MODE-MENU…`, `…-09-17-F10B…` (measurement) | wall-clock | dogfooding |
| `…-09-14-MANAGE-ISOLATED-CC-PROFILES…` (F-b), `…-07-31-MODEL-ALIAS-HINTS…`, `…-07-31-EDITOR-MINIMAP-STALE…`, `…-07-13-M9-WP6B1-KEYBOARD-PAN-ZOOM…`, `…-06-21-WP7-PER-RESULT-PER-FILE-REPLACE` | net-new features | roadmap / feature backlog |
| The 13 upstream items + O2 | mccc owns them | `HANDOFF-to-mccc-2026-09-23-paydown.md` (WP2) |
| `…-08-25-A-DELETED-EXPORT…` (upstream half) | the local half is WP3 | the mccc handoff |

**Buried** (moved to `backlog-archived.md` in WP1):

- `…-08-02-SET-A-CSP…`: R3.
- `…-08-21-SUBAGENT-PAIRING…`: R4-26.
- `…-08-14-SKILL-SCAN-COLLAPSES…`: no scanner exists.
- `…-08-01-DOMPURIFY-DEFAULTS…`: DOMPurify is no longer a dependency.
- `…-07-14-TURN-OUTPUT-REORIENTATION`: dropped from Group F.
- `…-07-08-M9-WP6.5-CLOSE-MARKER-MISSES-FORCE-QUIT`: an accepted limitation.
- `…-06-22-WP5-DROPPED-WATCH-WORKFLOW-DOC-HIERARCHY`.
- `…-06-20-WP3C-SHARED-DOC-CURSOR-RESET`: dogfood-conditional, L.
- `…-08-01-EDITOR-DISK-RELOAD-WAITS-FOR-REAL-WINDOW-FOCUS`: low-confidence, confounded.
- `…-08-10-NO-GUARD-COUPLES-A-CSS-CLASS…`: low impact, M.
- `…-06-26-MCP-BRIDGE-RELEASE-ACL-STRINGS`: functionally release-safe and self-described as
  optional. ⚠️ The suggested `[target.'cfg(debug_assertions)'.dependencies]` fix would not work,
  because Cargo target tables take target cfgs, not `debug_assertions`.
- R1: a cosmetic new element.
- T1: memoizing roots is an efficiency nit, M.
- W1: likely won't-fix.
- O1: a convention call.
- P1: `headingSlug` collisions, parked by design, with revisit triggers in code.

**Deleted (WP1):** the 22 GONE bodies plus G1, the four fully-GONE headings, and the 8 stale
SURFACEs listed in WP1 §5. The R4 rulings (40, 46, 32) are deleted in WP2 once documented.

## Fold back and delete (on completion)

1. Confirm every finding ID above is RESOLVED, each with the mutant it now kills. Check each
   against its own WP's closure note, not this file.
2. Confirm every Bury/Delete in §Scope happened, and that each delete has its CHANGELOG
   `**Backlog resolved:**` line in the same commit.
3. Carry any surviving obligation back into `backlog.md` as its own SURFACE, so it outlives this
   file (the 2026-08-19 sweep did this for the comment-convention pass).
4. **Delete this file** in a commit that says so.

## Session Handoff — 2026-09-23 14:31
Handed off. See `workflow-system/state/.session.md` to restore. WP1–WP10 CLOSED; next is §"Fold back and delete" (+ optional WP9 MAJOR-1 small task).

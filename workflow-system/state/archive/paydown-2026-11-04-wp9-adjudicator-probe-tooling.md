---
workflow: task
state: close (complete)
completed: 2026-11-06
created: 2026-11-06
docs-only: false
---

# Task: Sweep WP9 — adjudicator-probe tooling

**Workflow:** task
**State:** Completed 2026-11-06
**Created:** 2026-11-06

## Problem Statement
The adjudicator probe (`tooling/adjudicator-probe/`) carries ten open review findings (9 from M16.5 WP2's review, 1 from WP3's). The replay test is not bound to the prompt, model and tail length it measured. Two probes read WIP files that finalize has since moved. The only full labelled set is a single copy in gitignored `tmp/`. A resume counts failed calls as done. The runner skips production's exact-pin check and has no spawn `error` handler. Run numbers sort as strings. The PRNG and `LABELS` are duplicated, the policy exclusion is restated by id prefix, and claudesk tails are kept by slug PREFIX.

## Context
- Source: `workflow-system/product/backlog-paydown-wbs.md` → WP9; default **D2** (private copy outside the repo).
- Finding bodies: `workflow-system/state/backlog-quality-findings.md` → `# m16-5-wp2-adjudicator-remeasure — 2026-10-21` (9 of its 10 entries; `…-MEASUREMENT-NUMBERS-REPEATED-IN-FOUR-PLACES` belongs to **WP14**, not here) and `SURFACE-2026-10-27-QUALITY-WP3-PROBE-RUNNER-SKIPS-THE-PRODUCTION-MODEL-CHECK`.
- Stubs in `backlog.md`: `## Code-quality findings — m16-5-wp2-adjudicator-remeasure (2026-10-21)` (rewrite to the WP14 residual) and `## Code-quality findings — m16-5-wp3-supervisor-correctness (2026-10-27)` (rewrite to the JSDoc residual, WP14).
- Code, re-anchored by symbol on 2026-11-06:
  - `paths.ts` → `OUT` = `<repo>/tmp/adjudicator-probe` (2.8 MB, incl. the WP3 `wp3-*` files).
  - `runner.ts` → `adjudicateOnce`: hand-rolled `JSON.parse`, no model check, no `child.on("error")`.
  - `score.probe.ts` → `WIP` = `state/wip/m16-5-wp2-…md` (archived since); `set` re-implements the sha gate inline; `score` counts every basis as done; `report` sorts runs with bare `.sort()`.
  - `wp3.probe.ts` → `WIP` = `state/wip/m16-5-wp3-…md` (also archived since — the recurrence the WBS names); `WP2_WIP` hard-codes `archive/`; private `rng` (a third mulberry32 copy); `report` bare `.sort()`.
  - `wp3.ts` → `scoredKeys` already retries `error` (only the WP3 probe; WP2's `score` never got it — hence PARTIAL).
  - `labelSheet.ts` → `mulberry32`, `shuffle` (private), `LABELS` (exported). `triage.ts` → `sampleIds` (inline copy). `reviewer.ts` → its own `LABELS`.
  - `triage.ts` → `isPolicyExcluded` keys on the id's letter (`P`/`I`). Production: `SUPERVISED_WORKFLOWS` in `src/state/supervisor/verdict.ts`, keyed on `edge.workflow`; `edgeById` in `src/state/workflowMachine/edges.ts`. Second restatement: `adjudicatorRemeasure.test.ts` → `/^[PI]/`.
  - `corpus.ts` → `projectClassOf` uses `startsWith("-Users-stayman-Personal-projects-claudesk")`. Real slugs today: `…-claudesk`, `…-claudesk-src-tauri`, and five `…-claudesk-tmp-scratch-*` (excluded upstream by `isScratchWorkspace`). ⚠️ D4 (WP11) moves scratch to a sibling `claudesk-scratch/`, whose slugs would match the prefix and NOT the `-tmp-scratch-` exclusion — the hole becomes live at WP11.
  - `redact.probe.ts` → `answers` ordered with bare `.sort()`; `_meta` carries no prompt/model/tail binding.
  - Production `adjudicator.ts`: `parseReplyEnvelope` (exported); the exact-pin rule is INLINE in `adjudicate` (`envelope.models.length !== 1 || envelope.models[0] !== model`); `assertPinnedModel` checks the REQUESTED model, which in the probe is the constant itself.
  - `fanOut.ts` → `export const TAIL_CHARS = 1200` has no importer.
- Measured at plan time: `adjudicationPrompt` is byte-identical at `904dcc8` (WP2) and HEAD (sha256 of the function source matches); `TAIL_CHARS` = 1200 at both; all 873 rows of `answers.jsonl` resolved to `claude-sonnet-5-5`, basis `model`. So binding `_meta` to the live values leaves the replay test GREEN today and makes it fail on any future change.
- Every `edgeId` in `candidates.json` (27 distinct) exists in `EDGES`; `P*`/`I*` are exactly the product/incident ones.

## Design decisions (taken in plan; flag if wrong)
1. **Resume rule = one shared predicate.** `error` and the new `model-mismatch` are retried; `model`, `unparseable` and `timeout` count as done. This keeps WP3's tested rule (`wp3.test.ts` asserts `timeout` is done) and applies it to WP2's `score`. A timeout scores AWAITING exactly as production withholds; a mismatch is a pin problem, never a measurement.
2. **The model check is the EXACT-PIN ENVELOPE rule, not `assertPinnedModel`.** `assertPinnedModel` only checks the model we ASK for, which in the probe is the constant checking itself. The rule that caught the silent alias move is the reply-side one inside `adjudicate`; extract it as an exported predicate in `adjudicator.ts`, have `adjudicate` call it (behavior-preserving), and have the runner call it too. A mismatch is recorded as its own `basis: "model-mismatch"`.
3. **`_meta.measuredAgainst = { promptSha256, tailChars, model }`** written by `redact.probe.ts` (prompt sha + `TAIL_CHARS` live at redact time, `model` = the single resolved id across `answers.jsonl`, throwing if more than one). The replay test asserts all three equal the live `sha256(adjudicationPrompt(""))`, `TAIL_CHARS` and `ADJUDICATOR_MODEL`, failing with "re-run the probe".
4. **D2 location:** `OUT` → `~/Library/Application Support/claudesk-tooling/adjudicator-probe/`. Copy `tmp/adjudicator-probe/` there with `cp -Rp` (mtimes preserved) plus a `PROVENANCE.md` (copy date, source, what each file is, the rebuild path). The `tmp/` copy is left in place (operator data; not deleted by the agent).
5. **Claudesk slugs:** an exact allow-list (`-Users-stayman-Personal-projects-claudesk`, `…-claudesk-src-tauri`). Anything else is classified as before by the remaining rules, so it is redacted and scanned.

## Work Tree

- [x] T1 D2: create the private copy and repoint `paths.ts`
  - `cp -Rp tmp/adjudicator-probe/. "<appsupport>/claudesk-tooling/adjudicator-probe/"`, `shasum` both trees and confirm equal; write `PROVENANCE.md`.
  - `paths.ts`: `OUT` = that dir; rewrite the header comment (never committed, why, restore/rebuild step).
  - Add `wipOrArchive(name, root = REPO)` to `paths.ts`: returns the `state/wip/` path if present, else `state/archive/`, else throws naming both.
- [x] T2 One `wip/`-or-`archive/` resolver in both probes
  - `score.probe.ts` `set`: replace the inline sha gate with `frozenLabelsRefusal(body, readFileSync(wipOrArchive("m16-5-wp2-adjudicator-remeasure.md")))`.
  - `wp3.probe.ts`: `WIP` and `WP2_WIP` both via `wipOrArchive`.
  - Unit test (`paths.test.ts` or in `wp3.test.ts`) over a temp root: wip wins, archive fallback, neither → throws. Mutation: swap the order / drop the fallback.
- [x] T3 Runner: production envelope, exact-pin check, spawn `error`
  - `adjudicator.ts`: extract the exact-pin predicate (e.g. `answeredByPinOnly(models, pin)`); `adjudicate` calls it. Existing mismatch tests must stay green.
  - `runner.ts`: split into a pure `answerFromReply(key, run, stdout, timedOut)` using `parseReplyEnvelope` + the predicate + `parseAdjudication`, and the spawn shell; add `child.on("error")` and a `stdin` error sink with a settle-once guard; take an optional `bin` for the test.
  - `score.ts`: `Answer["basis"]` gains `"model-mismatch"`; `failedCalls` init includes it.
  - Tests: `answerFromReply` per basis (model, unparseable, error from `is_error`, error from non-JSON, model-mismatch for a different and for an extra model, timeout); `adjudicateOnce` with a nonexistent `bin` resolves `basis: "error"` (no hang). Mutations: drop the pin check; drop `on("error")`; invert the extracted predicate inside `adjudicate`.
- [x] T4 Resume never counts a failure as done
  - One predicate in `score.ts` (e.g. `isRetryable(a)` → `error` | `model-mismatch`); `wp3.ts` `scoredKeys` and `score.probe.ts` `score` both use it.
  - Update `wp3.test.ts` expectations for `model-mismatch`; add a test that `score.probe`'s done-set rule matches (drive the shared predicate). Mutation: remove `model-mismatch` from the predicate.
- [x] T5 Numeric run sort
  - `score.ts`: export `distinctRuns(answers)` sorted `(a, b) => a - b`; used by `score.probe.ts` and `wp3.probe.ts` `report`. `redact.probe.ts`: `.sort((a, b) => a - b)`.
  - Test: runs `[10, 2, 1]` → `[1, 2, 10]`. Mutation: bare `.sort()`.
- [x] T6 PRNG, shuffle and `LABELS` once, seeded output identical
  - BEFORE editing: capture golden outputs (`sampleIds` over a fixed list + seed; `buildRows` order over a fixed fixture) as pinned literals in tests, and recompute `wp3-split.json` from `score-set.json` + `SEED` in a throwaway spec to confirm the existing algorithm reproduces it.
  - Export `mulberry32` + `shuffle` from `labelSheet.ts`; `triage.sampleIds` = `shuffle(ids, mulberry32(seed))…`; `wp3.probe.ts` split uses them (same call order, one shared generator); `reviewer.ts` imports `LABELS`.
  - After: golden tests still pass; recomputed split still equals `wp3-split.json` byte-for-byte. Delete the throwaway spec.
- [x] T7 Policy exclusion from production
  - `triage.isPolicyExcluded(edgeId)` = edge unknown OR `!SUPERVISED_WORKFLOWS.has(edgeById(edgeId).workflow)`.
  - `adjudicatorRemeasure.test.ts`: replace `/^[PI]/` with `SUPERVISED_WORKFLOWS.has(edgeById(r.edgeId)!.workflow)`.
  - Equivalence: over all 27 real edge ids, new === old. Mutation: add `"product"` to a local copy of the set / flip the predicate.
- [x] T8 Exact claudesk slug allow-list
  - `corpus.ts`: `CLAUDESK_SLUGS` set; `projectClassOf` uses `.has(slug)`.
  - Tests: both real slugs → `claudesk`; `…-claudesk-scratch-scratch-a`, `…-claudesk-worktree` → not `claudesk`. Equivalence: every distinct `project` in `candidates.json` keeps its stored `projectClass`. Mutation: restore `startsWith`.
- [x] T9 Bind the replay test (+ gives `TAIL_CHARS` its importer)
  - `redact.probe.ts`: write `_meta.measuredAgainst`.
  - Re-run `redact` (probe config, private `OUT`); diff the regenerated `wp2-adjudicator-set.json` against HEAD: ONLY `_meta.measuredAgainst` may differ (records byte-identical).
  - `adjudicatorRemeasure.test.ts`: assert the three fields equal the live values. Mutations: change one char of the prompt; change `TAIL_CHARS`; change the recorded model — each must fail.
- [x] T10 Probe smoke from the private copy (no `claude` calls)
  - `score.probe -t set` → `score-set.json` byte-identical to the `tmp/` original (proves the resolver, the gate and T7's equivalence on real data).
  - `score.probe -t report` and `wp3.probe -t report` → `score-report.json` / `wp3-report.json` equal to the originals (proves T5 + T4 change no recorded number).
  - Do NOT run `score`, `tune` or `final` (they spend real calls).
- [x] T11 Gate: `pnpm verify:auto` (timeout 207000)

## Act evidence (2026-11-06)
Each guard below was mutation-proved INDIVIDUALLY (mutant `grep`-confirmed in executable code, restored by `cp` + `shasum`):
- **T1/T2** `wipOrArchive`: swapped order → "prefers wip/" dies; dropped archive fallback → 2 die. Private copy: 44 files, sha256-equal to `tmp/`; `PROVENANCE.md` written.
- **T3** runner `if (!answeredByPinOnly…)` → `if (false)` → 3 die; predicate without the length check → 2 die (production `adjudicate` + runner); `child.on("error")` renamed → spawn test fails (5 s timeout + unhandled error).
- **T4** `isRetryable` without `model-mismatch` → 2 die (`score.test`, `wp3.test`). ⚠️ `score.probe`'s own use of it is probe-only (excluded from the gate by design), so only the shared predicate is guarded.
- **T5** `distinctRuns` with bare `.sort()` → dies.
- **T6** Before the refactor, a throwaway spec reproduced all three seeded artifacts from the private set: `rows.json` + `row-keys.json` (seed 20261021), the triage `sample` (⚠️ over the PRE-exclusion pool: 3 of its 40 ids are now policy-excluded, because the sample predates the exclusion), and `wp3-split.json` (seed 20261026). After the refactor the same spec, through the exported `mulberry32`/`shuffle`, still reproduced all three byte-for-byte; it was then deleted. Permanent pinned-output tests added (`sampleIds`, `buildRows` order). PRNG constant mutant → 5 die.
- **T7** `isPolicyExcluded` = unknown OR not in `SUPERVISED_WORKFLOWS` (by `edgeById`). Over the 27 real corpus edge ids it excludes exactly I14/I17/I18/P3/P5/P7/P9, as the prefix rule did. Mutants: predicate reduced to `edge === undefined` → 5 die; `"feature"` removed from production `SUPERVISED_WORKFLOWS` → the replay test dies. ⚠️ The replay test calls the probe's `isPolicyExcluded` rather than importing `edgeById` itself: the latter tripped `workflowMachineFunnel`'s importer-population guard (correct signature: only the allowlist test failed), and one predicate in both places is what the finding asked for.
- **T8** Real data: every claudesk-class record carries the exact repo slug; no claudesk-prefixed slug is classed otherwise. `startsWith` restored → dies.
- **T9** `redact.probe` re-run from the private `OUT`: records byte-identical to HEAD, `_meta` identical except the new `measuredAgainst` (`d16e986d…`, 1200, `claude-sonnet-5-5`). Mutants: one prompt word, `TAIL_CHARS` 1500, recorded model `sonnet` → each fails the replay test.
- **T10** From the private copy, no `claude` calls: `score.probe -t set` → `score-set.json` byte-identical to the `tmp/` original; `score.probe -t report` and `wp3.probe -t report` → identical to the originals except the new `model-mismatch: 0` counter.
- **T11** `pnpm verify:auto` EXIT 0, 46 s (3708 vitest, 286 files; cargo green). The first run failed on Prettier (4 files, reformatted) and the funnel guard (T7 note).

## Verification Observable

**Observable:** Run from the private `OUT`, the probe's offline steps reproduce WP2's recorded artifacts, the regenerated committed set changes only `_meta.measuredAgainst`, and one real production-shaped `claude -p` call through the new runner classifies as `basis: "model"`, answered by `claude-sonnet-5-5` alone.
**Verification command:** `vitest --config tooling/adjudicator-probe/vitest.config.ts score.probe -t ^set$` + `-t ^report$` + `wp3.probe -t ^report$` + `redact`, each `cmp`/JSON-compared to `tmp/adjudicator-probe/` and HEAD; then a throwaway `zzLive.probe.ts` calling `adjudicateOnce` once against the installed `claude`.
**Expected result:** `score-set.json` byte-identical; both reports equal modulo the new `model-mismatch: 0` counter; committed set records identical to HEAD; live answer `{basis: "model", models: ["claude-sonnet-5-5"], answer: AWAITING|PROCEED}`.

## Verification Result

**Status:** PASS
**Date:** 2026-11-06
**Evidence:**
- `[score.probe -t ^set$] Tests 1 passed | 2 skipped`; `cmp` → `score-set.json byte-identical`
- `[score.probe -t ^report$]`, `[wp3.probe -t ^report$]` pass → `score-report.json` / `wp3-report.json equal modulo model-mismatch counter: True`
- `[redact] Tests 1 passed` → `committed records identical to HEAD: True`, `_meta diff keys: ['measuredAgainst'] | other meta equal: True`
- Live call (throwaway spec, deleted): `LIVE {"key":"verify","run":1,"models":["claude-sonnet-5-5"],"raw":"PROCEED","answer":"PROCEED","basis":"model"}`
**Notes:** The private `OUT`, both resolvers, the numeric sort and the shared PRNG change no recorded result. A real reply passes the extracted exact-pin check, so the probe would not reject every live answer as `model-mismatch`.

## Current Node
- **Path:** Task > verify (complete)
- **Active scope:** all complete, ready for close
- **Blocked:** none
- **Unvisited:** task-close
- **Open discoveries:** none

## Retrospect
- **What changed in our understanding:**
  - The WP2 review's freeze-gate MAJOR had already recurred in WP3's own probe, as the WBS warned. Both of WP3's WIP reads (its own and WP2's) needed the resolver.
  - The "model check" the WP3 finding asked for is not `assertPinnedModel`, which checks only the model the probe ASKS for (the constant itself). It is the reply-side exact-pin rule, which was inline in `adjudicate`.
  - The triage sample cannot be recomputed from today's `uncontested` list. It was drawn before product/incident rows left the set, so 3 of its 40 ids are now policy-excluded.
- **Assumptions that held:**
  - The prompt, `TAIL_CHARS` and the resolved model are identical to what WP2 measured, so binding them left the replay green.
  - Every seeded artifact reproduces byte-for-byte through the shared PRNG.
  - The offline probe steps from the private copy changed no recorded number.
- **Assumptions that were wrong:** importing `edgeById` into the replay test trips `workflowMachineFunnel`'s importer-population guard. Routing the test through the probe's `isPolicyExcluded` was the better fix anyway, since it is one predicate in both places.
- **Approach delta:** the plan was followed as written. Two additions: the runner takes an optional `bin` so a test can prove a spawn failure resolves, and one live `claude -p` call at verify confirmed a real reply passes the exact-pin check.

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->

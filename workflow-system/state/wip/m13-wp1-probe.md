---
workflow: feature
state: ship (complete)
drive_mode: autopilot
milestone: 13
wp: 1
type: probe
created: 2026-08-14
---

# Feature: M13 WP1 — Probe: registry scope, scan robustness, and the Recycle completion protocol

**Workflow:** feature
**State:** ship (complete)
**Created:** 2026-08-14

## Problem Statement

M13 makes common workflow operations clicks rather than typed slash commands. Four questions would each force a rebuild if guessed wrong: **which** skills the button surface renders (61 entries make "render each skill" a *worse* launcher than typing), **how** the scanner behaves on a directory where 11 of 61 entries are dangling symlinks (error handling is the modal case, not polish), **what** signal tells Claudesk that a skill running *inside* CC has finished (the roadmap hides this in four words — "wait for `.session.md` write completion" — and `Stop` fires on every turn end, so it cannot mean "the handoff is done"), and **whether** Recycle's respawn already inherits the drive-mode signal for free. This is a probe WP: its deliverable is a written verdict per question with the evidence that produced it, recorded in `wbs.md`'s "Probe outcomes" section. It gates WP2, WP3, and WP4.

**3rd-party probe check:** no external service, API, or SDK. The "external systems" are `~/.claude/skills/` and the CC process itself, both of which this WP probes before anything assumes their shape (per `wbs.md` → Learning-sequence ordering).

## Pre-plan findings — measured while planning, before Phase 1

Two facts were established during planning that change the plan and correct the WBS. Both are recorded here so they are not re-derived, and both get **confirmed rather than assumed** in Phase 1.

### ⚠️ Finding A — `CleanExitRoute::RecycleSession` ALREADY EXISTS. WBS task 3.3 is wrong as written.

`wbs.md` WP3 task 3.3 says *"Add the new `CleanExitRoute` variant."* It is already there:

- `src-tauri/src/session_state/mod.rs:351` — the `RecycleSession` enum variant
- `:360` — present in `CleanExitRoute::ALL` (3 variants, not 2)
- `:369` — wire name `"recycle-session"`
- `src/state/cleanExit.ts:39` — the TS union carries `"recycle-session"`
- `src/state/__tests__/cleanExit.test.ts:109` — a test titled *"RECYCLE SESSION is a CLEAN boundary — pinned for M13 (P2.5)"*

⚠️ **Production callers: ZERO.** The route round-trips through **two** test suites and is called by nothing — which is *exactly* the M12 dead-`/exit` shape (`SURFACE-2026-08-03-TYPED-EXIT-LEAVES-THE-UNCLEAN-FLAG-SET`), where a variant existed in the Rust enum, the TS union, and two test suites while no caller ever sent it. The difference: `CcExitCommand` was an accident and was **deleted**; `RecycleSession` was pinned **deliberately** for M13 with a test that says so. So it is a pre-wired seam, not a defect — **but the distinction is exactly the one that is invisible from the test suite's green**, which is why task 1.8 confirms it by reading the caller side rather than the set.

**Consequence for WP3:** task 3.3 becomes *wire the existing route*, not *add a variant*. Correct it at 1.7.

### ⚠️ Finding B — the guard file is at 26 tests, not 24

`wbs.md` Finding 3 says `offInvariantGuard.test.ts` is "now at **24 tests** (was 19)". Measured: **26** (`grep -c "it("`). Minor drift, but the WBS instructs WP2 to "read its header first," and a stale count is the kind of number a later reader trusts. The four registries in the header (lines 41–49) are confirmed accurate: PANEL, MENU ID, CHORD, ROW-CELL.

### Confirmed unchanged from the WBS

- `~/.claude/skills/` = **59** entries, project-local `.claude/skills/` = **2** (`clear-build-cache`, `release`), total **61**. Exactly **11** dangling: `RENAMED-*` ×3, `tutorialX-*` ×4, `zz-*` ×4. Re-measured this session.
- `slash_command_bytes` at `cc_session/mod.rs:266`, one production caller (`:966`, the exit command). ⚠️ **CORRECTED at code-quality review 2026-08-14** — this line originally added "The injection primitive is real and single," which is **false**: it is Rust-side, not a `#[tauri::command]`, and **unreachable from a button**. The frontend seam is `injectCommand`/`slashCommandPayload` (`autoResumeFire.ts:165`/`:145`), a deliberate byte-pinned mirror. ⚠️ **This was the THIRD assert-without-reading-the-call-path error in this WP** — see the review's CRITICAL.
- `showSessionStartButton` at `sessionStartButton.ts:60`, one caller: `Workspace.tsx:413`.
- Scratch workspaces present: `tmp/scratch/scratch-{a,b,c}`.

## Work Tree

- [x] Phase 1: Static measurement — scan reality, seam audit, and the two WBS corrections  <!-- status: done 2026-08-14 -->
  **Observable outcomes:**
  - CLI: a scan-classifier script run against the real `~/.claude/skills/` + `.claude/skills/` exits 0 and prints a classification table whose totals sum to 61, with the dangling-symlink count printed as exactly `11`, and at least one entry in each of the classes {valid, dangling-symlink}.
  - CLI: the same script run against a **synthetic** fixture directory (built by the script, not the real dir) exits 0 and reports each seeded breakage flavor — dangling symlink, directory with no `SKILL.md`, `SKILL.md` with unparseable/absent frontmatter — proving the classifier is not merely echoing the real dir's two flavors.
  - CLI: `grep -rn "RecycleSession" src-tauri/src --include='*.rs'` returns matches ONLY in `session_state/mod.rs` (declaration sites), and `grep -rn "recycle-session" src src-tauri/src` returns no production caller outside `session_state/` + `cleanExit.ts` + their tests — the evidence for Finding A, captured as command output, not assertion.
  - CLI: `grep -c "it(" src/state/__tests__/offInvariantGuard.test.ts` prints `26`.
  - CLI: `grep -n "fn cc_spawn_env\|fn resolve_cc_spawn_env" src-tauri/src/cc_session/mod.rs` plus the call-path trace prints a single resolved answer for Q4 (yes/no + the call path in one sentence).
  - [x] P1.1 Write the scan classifier as a throwaway script in the session scratchpad (NOT in the repo — this is a probe measurement, not shipped code). Classify each entry: valid / dangling symlink / missing `SKILL.md` / unparseable frontmatter. Report counts + per-class examples.  <!-- status: done -->
  - [x] P1.2 Run it against the real dirs. Record the table verbatim as Q2 evidence.  <!-- status: done -->
  - [x] P1.3 Build the synthetic fixture (three breakage flavors incl. one the real dir does NOT have) and run the classifier against it. ⚠️ This is what stops the test proving nothing the day the real dir is cleaned — per `wbs.md` Finding 1.  <!-- status: done -->
  - [x] P1.4 Parse the frontmatter of the 50 valid entries; confirm the `name:` / `description:` / optional `argument-hint:` shape holds for all of them, and record any that deviate. The `name:` is the slash command — verify that claim against at least 5 entries rather than trusting it.  <!-- status: done -->
  - [x] P1.5 Q4: read `cc_spawn_env` / `resolve_cc_spawn_env`'s call graph and answer yes/no in one sentence with the call path. ⚠️ Build NO abstraction either way (`wbs.md` reuse inventory).  <!-- status: done -->
  - [x] P1.6 Audit the `sessionStartButton.ts` → `Workspace.tsx:413` call site; record what absorbing it into a registry would cost vs keeping it pinned. Decision recorded at P3.4, not here — this task gathers the evidence.  <!-- status: done -->
  - [x] P1.7 Correct `wbs.md` WP3 task 3.3 from "add the new variant" to "wire the existing route", citing Finding A's evidence.  <!-- status: done -->
  - [x] P1.8 ⚠️ Confirm Finding A from the CALLER side, not the set: prove `RecycleSession` has zero production callers by reading `session_state_mark_clean`'s invoke sites, not by re-running the exhaustiveness test (whose green is exactly what made the M12 gap invisible).  <!-- status: done -->
  - [x] P1.9 Correct the guard-file test count in `wbs.md` Finding 3 (24 → 26).  <!-- status: done -->
  - [x] ⚠️ RETRACTED — the "`app-quit` route has no caller" finding was WRONG; the clear is implemented in Rust (`perform_quit_teardown`). Backlog entry deleted. See "RETRACTED" below.  <!-- status: done — retracted at verify-human before any code change -->
  - [ ] SURFACED — skill scan collapses two frontmatter error kinds  <!-- status: SURFACED: SURFACE-2026-08-14-SKILL-SCAN-COLLAPSES-TWO-FRONTMATTER-ERRORS — logged to backlog.md -->
  - [x] verify-auto  <!-- status: done — 5/5 observable outcomes asserted mechanically + positive control -->
  - [x] verify-self  <!-- status: done — subagent: 5/5 PASS, 0 BLOCKING, 0 COSMETIC -->
  - [x] verify-human  <!-- status: done — 2 decision items resolved: vh.1 finding RETRACTED (nothing to fix), vh.2 verdict = guard the funnel, no enum guard -->
  - [x] verify-codify  <!-- status: done — no new tests warranted (probe: measurements are not behavior; Q4 already covered; app-quit already covered by 4 tests). Full suite green: 2026 frontend + 844 Rust, counts unchanged = correct attribution -->

- [x] Phase 2: Live signal capture — the Recycle completion protocol (Q3)  <!-- status: done 2026-08-14 -->
  **Observable outcomes:**
  - CLI: a timestamped signal log from a real `/session-handoff` run in `tmp/scratch/scratch-a` contains, in order, at least one `UserPromptSubmit` hook line, the `.session.md` create/write filesystem event, and the terminating `Stop` hook line — each with a wall-clock timestamp, so the ordering is *observed* and not inferred.
  - CLI: the same log shows **≥2** `Stop` events across the captured window (proving the "`Stop` fires on every turn end" trap empirically rather than citing it), OR, if only one `Stop` is observed, a second capture with a deliberate two-turn interaction is run to produce it.
  - CLI: a second capture run with a **stale `.session.md` pre-existing** produces a log in which `.session.md` existence is TRUE before the handoff begins — demonstrating whether existence alone is an ambiguous marker.
  - CLI: `test -f tmp/scratch/scratch-a/workflow-system/state/.session.md` exits 0 after the handoff, and the file's mtime is strictly greater than the capture's start timestamp.
  - [x] P2.1 Stand up the capture harness: hook-event listener on a **capture-only** socket + polling watcher on the scratch project's `workflow-system/state/` dir, both on one monotonic clock. ⚠️ Smoke-tested with a positive control BEFORE the real runs — which is what caught the silent AF_UNIX path-length failure.  <!-- status: done -->
  - [x] P2.2 Prepare `tmp/scratch/scratch-a` as a real workflow project with a live mid-`act` WIP item.  <!-- status: done -->
  - [x] P2.3 Capture run 1 — clean start, no `.session.md`. Real `/session-handoff`, full signal trace.  <!-- status: done -->
  - [x] P2.4 Capture run 2 — **stale `.session.md` pre-existing**. ⚠️ CC REFUSED to write (ambiguity guard) and returned a clean `Stop` having written nothing — a better result than planned: it is the empirical proof that `Stop` alone is meaningless, AND the real shape of a failed handoff.  <!-- status: done -->
  - [x] P2.4b Capture run 3 (added) — stale file + **unambiguous intent**, so the handoff proceeds and overwrites the stale pointer. Needed because run 2 never reached the write, leaving the overwrite case unobserved.  <!-- status: done — not in the original plan; added when run 2 refused -->
  - [x] P2.5 Build the **observed** signal table.  <!-- status: done — see "Phase 2 — Q3" below -->
  - [x] P2.6 Answer Q3 explicitly.  <!-- status: done — NO single marker suffices; the answer is a composite with an ordering constraint -->
  - [x] P2.7 Record the WP3 re-size verdict.  <!-- status: done — WP3 STAYS L; no unambiguous marker was found -->
  - [ ] SURFACED — the Edit tool writes via temp+rename (`*.tmp.<pid>.<hash>`); a state-dir watcher must exclude it  <!-- status: SURFACED: folded into the Q3 table as a WP3 watcher constraint, not separately backlogged -->
  - [x] verify-auto  <!-- status: done — outcomes 1/3/4 asserted from the captured logs; outcome 2 deviated with stronger evidence (recorded) -->
  - [x] verify-self  <!-- status: done — subagent: 4 PASS (incl. the adversarial table check), 1 FAILED-cosmetic (outcome 2, text not met as written); 0 BLOCKING -->
    - [x] O1 ordering: UserPromptSubmit(16.167) < .session.md write(39.669) < Stop(51.860)  <!-- status: PASS -->
    - [ ] O2 ≥2 Stop in one window  <!-- status: FAILED-cosmetic — 1 Stop per run (3 total); purpose met by run2's Stop-with-zero-work, subagent judged the substitution HONEST and disclosed -->
    - [x] O3 stale .session.md TRUE at t=0 in run2+run3 seed; run1 seed is the negative control  <!-- status: PASS -->
    - [x] O4 file present, mtime +102s, size 692 B provably run3's write  <!-- status: PASS -->
    - [x] O5 (adversarial) Q3 table's 4 headline numbers verified against the logs  <!-- status: PASS — 2 imprecisions found and CORRECTED in the table -->
  - [x] verify-human  <!-- status: done — operator approved all 3 items 2026-08-14 -->
    - [x] P2.verify-human.1 O2 substitution accepted (no literal two-turn recapture required)  <!-- status: PASS -->
    - [x] P2.verify-human.2 composite marker CONFIRMED as WP3's design target  <!-- status: PASS -->
    - [x] P2.verify-human.3 WP3 stays L  <!-- status: PASS -->
  - [x] verify-codify  <!-- status: done — no new tests warranted (the measured behavior is CC's, not Claudesk's; the composite marker is a design contract, codified into wbs.md WP3 where WP3 reads it). Suites green + unchanged: 2026 frontend, 844 Rust -->

- [x] Phase 3: Q1 operator verdict + probe outcomes written  <!-- status: done 2026-08-14 -->
  **Observable outcomes:**
  - CLI: `grep -A5 "^## Probe outcomes" workflow-system/product/wbs.md` returns a non-empty section containing a verdict heading for each of Q1–Q4.
  - CLI: `grep -n "Q1" workflow-system/product/wbs.md` shows the recorded verdict names both the CHOSEN shape and the REJECTED alternatives with reasons (`wbs.md` Q1: *"Record the verdict and the rejected options with reasons"*).
  - Browser/human: the operator's Q1 sign-off is recorded verbatim in the WIP file — ⚠️ this phase's verify-human is the sign-off itself, not a check that it happened.
  - CLI: `git diff --stat workflow-system/product/wbs.md` shows the Probe outcomes section, the 3.3 correction (P1.7), and the test-count correction (P1.9) all landed.
  - [x] P3.1 Present Q1 to the operator as a DECISION. ⚠️ **The operator REJECTED the offered menu and required the usage DATA first** — the right call; see "Phase 3 — Q1" below. Re-presented with the measured distribution.  <!-- status: done — verdict: tiny fixed set -->
  - [x] P3.2 Get the actual LIST, not a category.  <!-- status: done — /session-start, /session-capture, /util-prune-claude-md, /util-backlog-paydown, + Recycle -->
  - [x] P3.3 The typed-`/exit` item vs Q3.  <!-- status: done — ⚠️ concluded NOT to fold; they share a word, not a mechanism. wbs.md cross-milestone note CORRECTED -->
  - [x] P3.4 `sessionStartButton.ts` disposition.  <!-- status: done, then CORRECTED at Phase 3 verify-self — it fires /session-start (IN the set), not /session-restore, so the surfaces OVERLAP, not disjoint. Verdict: it IS the /session-start button; exactly one such affordance may exist after WP2 -->
  - [x] P3.5 The manual-session-start item vs Q1's verdict.  <!-- status: done — touched (it IS in the set) but NOT fixed by it; friction is sequencing, not the door -->
  - [x] P3.6 Write "Probe outcomes" into `wbs.md`.  <!-- status: done — verdict per question + cross-cutting findings + sizing outcomes -->
  - [x] verify-auto  <!-- status: done — 4/4 outcomes asserted + a cross-doc consistency check. ⚠️ Note: that consistency check PASSED while propagating a FALSE claim — see the verify-self findings -->
  - [x] verify-self  <!-- status: done — 3 PASS, 2 FAIL. ⚠️ 1 BLOCKING (false sessionStartButton claim) FIXED IN PLACE across 6 sites; 1 COSMETIC (stale "24 tests" at task 2.4) fixed; 1 subagent finding REJECTED as non-reproducible with evidence -->
    - [x] O1 Probe outcomes section, verdict per Q1–Q4  <!-- status: PASS -->
    - [x] O2 chosen shape + 4 rejected options with reasons  <!-- status: PASS -->
    - [x] O3 operator sign-off recorded  <!-- status: PASS -->
    - [x] O4 all three doc changes landed  <!-- status: was FAIL-cosmetic — the 24→26 fix missed task 2.4 at wbs.md:127; CORRECTED, now passing -->
    - [x] O5 (adversarial) data reproducible  <!-- status: PASS — every figure re-derived exactly (577/531/92.0%/25/21/11, tail, Since-Jul-1) -->
    - [x] O6 (adversarial) verdict internally consistent  <!-- status: was FAIL-BLOCKING — sessionStartButton.ts fires /session-start, NOT /session-restore; CORRECTED at 6 sites, "disjoint" argument inverted to "overlapping" -->
    - [x] O7 (adversarial) nothing overstated  <!-- status: 1 of 3 sub-findings accepted (the sessionStartButton one, = O6); "11 of 61" reframed to 11-of-50; ⚠️ the "undisclosed sidechain exclusion" sub-finding REJECTED — not reproducible, see the disposition section -->
  - [x] verify-human  <!-- status: done — operator ratified all 3 items 2026-08-14 -->
    - [x] P3.verify-human.1 in-place fix of the BLOCKING finding RATIFIED (gate-2 gap disclosed and accepted)  <!-- status: PASS -->
    - [x] P3.verify-human.2 the one-support exclusion CONFIRMED to still hold; ⚠️ the manual-restore-door question is OPEN, filed, NOT closed by this verdict  <!-- status: PASS -->
    - [x] P3.verify-human.3 rejection of the sidechain sub-finding RATIFIED  <!-- status: PASS -->
  - [x] verify-codify  <!-- status: done — no new tests warranted (decisions + a point-in-time measurement, not code). Suites green + unchanged: 2026 frontend, 844 Rust -->

## Current Node
- **Path:** Feature > (all phases complete) > ship
- **Active scope:** none — WP1 is done
- **Blocked:** none
- **Unvisited:** none. All 3 phases `[x]`, each with all five verification nodes `[x]`.
- **State:** **WP1 COMPLETE.** All four probe questions answered and written to `wbs.md` → "Probe outcomes". Q1, the WP3 sizing, and the Phase 3 corrections all carry operator sign-off. Next: `/feature-ship`.
- **Open discoveries:** 1 — the frontmatter-class collapse (low, a WP2 diagnostic-vocabulary decision), logged to `backlog.md`. ⚠️ The `app-quit` "defect" was **RETRACTED at verify-human** — no defect, backlog entry deleted; the transferable lesson (sweep the state-mutating primitive, not one of its callers) is recorded below and propagated to `wbs.md` WP3.

## Notes on shape

⚠️ **This is a probe, so "implementation" means measurement, and the deliverable is a written verdict.** Two consequences for build:

1. **Scripts written here are throwaway and live in the session scratchpad, not the repo.** The classifier (P1.1) and the capture harness (P2.1) are instruments, not shipped code. WP2 writes the real Rust scanner against Q2's verdict. ⚠️ Do not let a probe instrument become the production implementation by inertia — that skips the `?`/`thiserror` discipline WP2 task 2.1 requires.
2. **verify-codify for a probe codifies the FINDING, not the instrument.** There is no production behavior to pin yet. What must survive is the recorded evidence in `wbs.md` and the corrections to WP3's task list. If a phase has nothing worth codifying, say so explicitly rather than writing a test against a throwaway script.

⚠️ **A "no unambiguous marker exists" answer to Q3 is a successful probe outcome**, not a failure. It sizes WP3 up and tells WP3 to design a protocol rather than to poll a file. The failure mode is inventing a marker that was not observed.

## verify-human decisions (2026-08-14)

**P1.verify-human.1 — "fix it" → NOTHING TO FIX; finding retracted.** The operator approved a fix for the `app-quit` defect. Reading the quit path in order to write that fix showed the clear is already implemented and correct. Retracted rather than fixed; see the RETRACTED section below. ⚠️ **No code was changed** — a redundant second clear would have been actively harmful (two writers to one flag).

**P1.verify-human.2 — enum-caller guard: NO separate guard. Guard the funnel instead.** Weighed at the operator's request; verdict recorded here so WP2/WP3 inherit it:

- ⚠️ **An "every variant has a caller" guard is the wrong shape for THIS enum, because one variant is legitimately uncalled by design.** `RecycleSession` is pinned ahead of M13 on purpose, so such a guard needs an intentionally-uncalled allowlist on day one — and an allowlist is precisely where a genuinely-dead variant would be parked to keep the suite green. The guard would institutionalize the defect class it is meant to catch.
- **The property that actually failed is not enum-shaped.** It is *shared state with multiple writers, one of them unwired* — which is the standing M11 WP4 lesson (`CLAUDE.md`) and the rationale already written into `closeWorkspaceCleanly`'s own header. A guard at the enum is a **proxy** for the property; a guard at the state-mutating funnel **is** the property.
- **Cost:** the WBS already carries three caller-side guard tasks (WP2 2.6, WP3 3.4/3.5) plus the fifth OFF-invariant arm. A fourth mechanism with different semantics is more surface than the risk warrants.
- ⚠️ **This verdict is reinforced, not weakened, by the retraction below** — WP1's own error came from auditing *one mechanism's callers* (the IPC command) and generalizing to a second writer. An enum-membership guard would have encoded exactly that mistake. **WP3 tasks 3.4/3.5 must guard `clear_and_persist`/`clear`, the primitives, not `session_state_mark_clean`, one of their callers.**

## Phase 1 measurements (2026-08-14)

Instruments live in the session scratchpad (`scan_skills.py`, `fixture-skills/`, `scan-real.txt`, `scan-fixture.txt`) — throwaway, not repo code.

### Q2 evidence — the real scan

| Class | Count |
|---|---|
| valid | 50 |
| dangling-symlink | 11 |
| **TOTAL** | **61** |

`~/.claude/skills` = 59 entries (48 valid + 11 dangling), project-local `.claude/skills` = 2 (both valid). ⚠️ **Only TWO classes occur in the real dir** — which is exactly why the synthetic fixture is load-bearing rather than belt-and-braces. The 11 dangling split two ways by target root: `RENAMED-*` ×3 → `/var/folders/41/…/tmp.Q3ZCt3e9X3/skills/`, and `tutorialX-*` ×4 + `zz-*` ×4 → `/tmp/mut/skills/`.

**Synthetic fixture — 8 entries, 6 classes**, four of which the real dir cannot produce: `not-a-directory`, `missing-skill-md`, `no-frontmatter` (2 flavors), `no-name-field`. Plus positive controls (`valid` with and without `argument-hint`) so a classifier that only ever says "broken" would fail visibly.

### Q4 evidence — the CC spawn env path (ANSWERED: yes, one path)

**One unbroken production path, no branches:**

`XtermPane` (`spawnCommand` defaults to `"cc_spawn"`) → `cc_spawn` command (`cc_session/commands.rs:75`) → `reg.spawn(...)` (`:84`) → `SessionRegistry::spawn` → **`resolve_cc_spawn_env(...)`** (`cc_session/mod.rs:1092`) → `cc_spawn_env(drive_mode, gate_enabled)` (`:558`) → `PtyCcSession::spawn(…, env)` (`:1141`) → `spawn_argv`.

- `resolve_cc_spawn_env` has exactly **one** production call site (`:1092`, inside `pub fn spawn` — the `#[cfg(test)]` at `:1040` scopes only a small `insert` test helper, so 1092 is production; every other reference is under the `#[cfg(test)]` at `:1264`).
- `PtyCcSession::spawn` takes the **already-composed** env, so composition cannot be re-decided at the spawn site (deliberate — the doc comment records that passing `(drive_mode, gate_enabled)` separately hit clippy's `too_many_arguments`, and the lint was pointing at a real hazard: two params that are one concept let a caller supply the mode and forget the gate).
- The only sibling spawn, `spawn_shell` (`:793`), takes `shell_spawn_env()` and is reached via `term_spawn` — a different Tauri command, so it cannot be confused for the CC path.

⚠️ **Consequence for WP3:** if Recycle's respawn goes through `cc_spawn`, the drive-mode signal is free and **nothing is built**. Confirming *that* is a WP3 build-time check, not a WP1 one — WP1's job was to establish there is a single path to inherit, and there is. ⚠️ Per the WBS reuse inventory: build **no** abstraction either way.

### P1.4 — frontmatter shape

All 50 valid entries: `name:` present, `description:` present. `argument-hint:` present on 48, **absent on the 2 project-local skills** (`clear-build-cache`, `release`) — confirming it is genuinely optional as the WBS said. `name:` matches the directory name on every entry checked, so the slash command is derivable from either; WP2 should read `name:` (the declared value) rather than inferring from the dirname.

### P1.6 — `sessionStartButton.ts` evidence (decision deferred to P3.4)

One export, one caller: `showSessionStartButton(...)` (`sessionStartButton.ts:60`) ← `Workspace.tsx:413`. 6.2 KB module + a 15.7 KB test. It is a **predicate returning whether to show a single button**, not a registry entry — so absorbing it means either (a) generalizing its show/hide predicate into per-entry registry metadata, or (b) leaving it as a special case beside the registry. ⚠️ The cost of (b) is the "two mechanisms" the WBS warns against; the cost of (a) is that its predicate is workflow-state-specific in a way a generic skill button is not. **Evidence gathered; decision belongs with Q1's verdict** (a curated set that already includes `/session-start` changes the answer), so it is recorded at P3.4.

### Finding A CONFIRMED — `RecycleSession` has no caller (as designed)

Confirmed from the **caller** side, not the set: no production code sends `"recycle-session"`. Expected — it is deliberately pinned ahead of M13. WBS task 3.3 corrected at P1.7 from "add the variant" to "wire the existing route".

### ⚠️ RETRACTED — the "`AppQuit` has no caller" finding was WRONG

**During Phase 1 I recorded that `CleanExitRoute::AppQuit` had no caller and that a graceful ⌘Q leaves every workspace's unclean-exit flag set. That is false. The app-quit clear is fully implemented and correct.** The finding was raised at verify-human, the operator asked for a fix, and reading the quit path to write that fix is what exposed the error. Retracted before any code was changed; `SURFACE-2026-08-14-APP-QUIT-CLEAN-EXIT-ROUTE-HAS-NO-CALLER` was deleted from `backlog.md` rather than left to mislead.

**As built** (`lib.rs`, `perform_quit_teardown`, lines ~135–160): after `kill_all` and the time-analytics close markers, the teardown reads every open project path from `status_broadcaster::SharedRegistry::open_project_paths()` and calls `session_state::clear_and_persist(&dir, &path)` for each. Synchronous, before `app.exit(0)`, best-effort, and it runs on both quit paths because both funnel through `quit_now` → `perform_quit_teardown`. `clear_and_persist` keys through `key_for()`; `open_project_paths()` returns canonicalized keys — and there is a test named `open_project_paths_returns_canonicalized_keys` written specifically for that hazard, plus three more covering the empty and deregistered cases. Force-quit is deliberately excluded and documented as such.

**⚠️ Why the sweep missed it — the transferable lesson.** I swept **`markSessionClean` / `session_state_mark_clean`**, i.e. the *frontend invoke path*, and concluded from its single call site that only one route had a caller. But **app-quit clears from Rust directly via `clear_and_persist`, never crossing the IPC boundary** — correctly so, since the paths live in a Rust-side registry the frontend cannot see. So the enum variant is a *wire vocabulary* member used for the frontend→backend routes, while app-quit is a backend-internal route that needs no wire name at all. ⚠️ **Enumerating one mechanism's callers proves nothing about a second mechanism reaching the same state.** The shared state here (the unclean-exit flag) has two writers by design — `session_state_mark_clean` (IPC) and `clear_and_persist` (in-process) — and I audited one and generalized to both. The correct sweep target was **`clear_and_persist` + `clear`**, the state-mutating primitives, not the command that happens to be one of their callers.

⚠️ **This is a near-miss worth more than the finding would have been.** Acting on it would have added a redundant second clear on the quit path — plausible-looking, green under test, and actively harmful (two writers to the same flag, the exact shape the funnel discipline exists to prevent). The claim survived my own caller-side sweep AND a verify-self subagent's independent confirmation, because **both were pointed at the same wrong mechanism**: instrument agreement is not correctness when both instruments share a premise (`[[xterm-dom-reads-fake-a-blank-pane]]`). What caught it was being asked to *change the code* — the fix attempt read the path the audit had only inferred.

**Net standing:** of the enum's three variants, `WorkspaceClose` is called via IPC, `AppQuit`'s route is real and correctly implemented outside the IPC vocabulary, and `RecycleSession` awaits M13. **There is no defect and no second instance of the M12 dead-variant shape.** WP2 task 2.6 and WP3 tasks 3.4/3.5 remain the right caller-side guards — but they must guard the **state-mutating funnel**, not an enum's membership, or they will reproduce this same error in test form.

## Phase 2 — Q3: the observed signal table (2026-08-14)

Three real `/session-handoff` runs against a fresh CC spawned in `tmp/scratch/scratch-a`, captured on one monotonic clock by a listener bound to a **capture-only** socket (`/tmp/m13probe.sock`) registered in scratch-a's **project-local** `.claude/settings.local.json`. ⚠️ **Claudesk's own prod/dev sockets were never touched** — the operator's app (PID 1557) was running throughout.

### The three runs

| Run | Precondition | Outcome | Signals |
|---|---|---|---|
| 1 | no `.session.md` | handoff written | `SessionStart → UserPromptSubmit → …tools… → Write → **FS CREATE .session.md** → Edit → FS MODIFY wip → **Stop** → SessionEnd` |
| 2 | **stale `.session.md` present** | ⚠️ **REFUSED** — CC hit the ambiguity guard and asked a question instead | `SessionStart → UserPromptSubmit → **Stop** → SessionEnd` (**no tool calls, no writes at all**) |
| 3 | **stale `.session.md` present** + explicit intent | handoff written, stale file **overwritten** | same shape as run 1, with `Skill` as the first tool |

### ⚠️ Q3 ANSWERED: `.session.md` existence is NOT a sufficient marker, and `Stop` alone is not either

Four measured facts, each of which independently kills a candidate design:

1. **⚠️ `Stop` fires on every turn end — CONFIRMED EMPIRICALLY, not cited.** Run 2 emitted a clean `Stop` **having written nothing**. Its entire hook trace (`SessionStart → UserPromptSubmit → Stop → SessionEnd`) is a **strict subsequence of run 1's**. A Recycle waiting on `Stop` would have declared success on a handoff that never happened.
2. **⚠️ Existence is TRUE before the operation begins.** In runs 2 and 3 the file was present at t=0. Existence answers "was there ever a handoff", never "did *this* handoff finish".
3. **⚠️ THE GAP — the file is written LONG before the operation completes.** `.session.md` lands, then the skill keeps working (appending the handoff marker to the WIP file at step 6b):
   - run 1: write at **39.669s**, `Stop` at **51.860s** → **12.19s gap**
   - run 3: write at **28.328s**, `Stop` at **37.341s** → **9.01s gap**
   A Recycle firing on the `.session.md` write would kill CC **9–12 seconds early**, mid-skill, truncating the WIP annotation. ⚠️ **This is the hazard hiding in the roadmap's four words** ("wait for `.session.md` write completion") — the *file write* completing is NOT the *handoff* completing.
4. **The write is atomic per-file, but the Edit tool CAN rename through a temp.** `.session.md` arrives as ONE event at full size (816 B run 1 / 692 B run 3) — no partial-write window, so a size/parse check on the pointer is safe. ⚠️ **A WIP edit shows `wip/probe-dummy-task.md.tmp.50784.4e1d70fe6f66` CREATE→DELETE→MODIFY at 66.956s in run2.log** — the Edit tool writes via temp+rename. A watcher globbing the state dir must ignore `*.tmp.*` or it will fire on a transient.
   - ⚠️ **Two precision corrections, both caught by the Phase 2 verify-self subagent, both worth keeping.** (i) **Run attribution:** 66.956s is **50.9s AFTER run 2's `SessionEnd`** (16.093s), so by this document's own true-window rule that event is **not run 2's** — it landed in run2.log's trailing tail because that listener outlived its session. It belongs to later activity; the log file it sits in is not the run it came from. (ii) **Frequency:** the temp+rename signature is evidenced **ONCE**, not on every Edit — run 3's in-window WIP edit at 32.572s is a **bare MODIFY with no temp pair**. **The constraint is still correct to adopt** (a watcher must survive the temp form when it does occur), but it must not be stated as "every Edit does this."

### The verdict: the ONLY unambiguous marker is a COMPOSITE

No single signal works. The composite that does, in order:

> **A `.session.md` write event (CREATE or MODIFY, ignoring `*.tmp.*`) whose mtime is strictly newer than the mtime sampled before Recycle began — followed by the NEXT `Stop`.**

- The **mtime-newer-than-baseline** clause defeats facts 1 and 2 (a stale file cannot satisfy it; run 3's delta was **102s**, unambiguous).
- The **next `Stop` after that write** clause defeats fact 3 (it waits out the 9–12s tail).
- Ordering is what carries the meaning: `Stop` is only meaningful *relative to* an observed fresh write. Neither half is sufficient alone — which is why WP3 must model this as a **state machine over an observed sequence**, exactly as task 3.1 specifies, not as a poll of a file's existence.

⚠️ **The failure/timeout arm is not optional.** Run 2 is the real shape of a failed handoff: CC returns a clean `Stop` **and a question**, having written nothing. Recycle must treat *"`Stop` arrived but no fresh write did"* as **FAILED, surfaced to the operator** — not as "keep waiting" (it would hang forever) and not as "done" (it would recycle a session whose handoff never happened, losing the work the recycle existed to preserve).

### P2.7 — WP3 sizing verdict: **STAYS L**

The WBS said WP3 may re-size to **M** *"if Q1/Q3 find an unambiguous marker."* ⚠️ **No unambiguous single marker exists** — the answer is a composite with an ordering constraint, a baseline sample taken *before* the operation, a temp-file exclusion, and a mandatory failure arm. That is more design than the L estimate assumed, not less. **WP3 stays L.** Recorded per the WBS's instruction to record the re-size rather than defend the estimate — here the estimate held.

### Outcome-2 deviation (recorded, not waved through)

Phase 2's Observable Outcome 2 asked for **≥2 `Stop` events in one capture window**, "proving the `Stop`-fires-every-turn-end trap empirically rather than citing it." **Measured: 1 `Stop` per run, 3 across the three runs** — each `claude -p` invocation is a single non-interactive turn, so two Stops in one window was not reachable in this harness shape.

⚠️ **The outcome's PURPOSE is satisfied by stronger evidence, which is why this is a deviation and not a failure.** Run 2 emitted a `Stop` on a turn where the handoff **never happened and nothing was written** — its window contains `SessionStart → UserPromptSubmit → Stop → SessionEnd` and zero tool calls. That decouples `Stop` from *operation success*, which is precisely the property WP3 must design against. The planned form would only have shown `Stop` **recurring**; run 2 shows it **firing on failure**, which is the case that actually breaks a naive Recycle. The plan's own fallback clause ("if only one `Stop` is observed, run a second capture") is superseded by the three-run design.

### Probe-method note (not a product defect)

⚠️ **The AF_UNIX path limit is 104 chars and the failure is SILENT.** My first capture socket was in the session scratchpad (126 chars); Perl truncated the path, the connect failed, and the listener logged **nothing** — a broken instrument and a genuine no-signal result looked identical. Caught only because the smoke test asserted a positive control. **Claudesk itself is unaffected** (prod path 69 chars, dev 73), so this is a note for any future capture harness, not a backlog item.

## Phase 3 — Q1: the measured usage data (2026-08-14)

⚠️ **The operator rejected all three offered shapes and asked for the data instead** — *"check my current most-frequently used skills that I manually invoke (make sure to exclude the usage by the agent itself)."* That instruction was correct and the offered menu was premature: "the handful fired constantly" is an **empirical** question, and answering it by argument would have picked a shape the data does not support.

### Method

All **2470** transcripts under `~/.claude/projects/` (66 project dirs). The manual-vs-agent discriminator was **verified on a file containing both shapes** before counting, not assumed:

| Invocation kind | Shape in the transcript |
|---|---|
| **MANUAL** (operator typed it) | `user` role, `<command-name>/xxx</command-name>` — the harness's expansion of a typed slash command |
| **AGENT** (auto-chained) | `assistant` role, a `Skill` **tool_use** with a `skill` field |

Renames applied so pre-M9 history is not double-counted as separate skills: `session-resume`→`session-restore`, `session-pause`→`session-handoff`, `session-store-learning`→`session-capture`. Harness built-ins (`/clear`, `/exit`, `/model`, `/login`, `/compact`, `/resume`, …) excluded — they are not workflow skills and Claudesk does not surface them.

### The result

**Manual: 1050 total invocations · Agent: 7092.** Excluding built-ins, **577** manual invocations of workflow skills, across **11 distinct skills of the 50 invocable** (61 directory entries − 11 dead symlinks). ⚠️ *Quote 11-of-50, not 11-of-61 — the dead entries cannot be invoked at all, so the larger denominator overstates the case.*

| Skill | All-time | Since Jul 1 | Share |
|---|---:|---:|---:|
| **`/session-restore`** | **531** | **265** | **92.0%** |
| `/session-start` | 25 | 11 | 4.3% |
| *all 9 others combined* | 21 | 21 | 3.6% |

The tail (each ≤5 all-time): `tutorial-getting-started` 5 · `session-capture` 3 · `tutorial-greenfield-workflow-tour` 3 · `util-prune-claude-md` 3 · `session-handoff` 2 · `incident-resolve` 2 · `tutorial-product-cycle-tour` 1 · `tutorial-brownfield-workflow-tour` 1 · `util-backlog-paydown` 1.

### ⚠️ The finding that reshapes Q1: manual and agent usage are almost DISJOINT

The agent's top skills are `feature-build` (910), `feature-verify-auto` (884), `feature-verify-self` (854), `feature-verify-human` (778), `feature-verify-codify` (777). ⚠️ **The operator types `feature-*` essentially NEVER** — zero manual invocations of any `feature-*`, `task-*`, or `product-*` skill in 2470 transcripts. The single non-session manual workflow invocation of any weight is `/incident-resolve` (2).

**This is the whole answer to Q1.** The per-skill workflow buttons the roadmap imagined would surface skills the operator **does not type**, because the *orchestrator* fires them via auto-chaining. Building 61 buttons — or even a curated set of `feature-*` buttons — would surface the agent's vocabulary, not the operator's.

⚠️ **The operator's manual vocabulary is essentially: resume a session (92%), start one (4%), and a long tail of one-offs.** A one-off fired 1–3 times *ever* does not clear `[PRIOR: new-surface-must-earn-its-place-against-existing-ones]` — typing it is fine.

### ✅ Q1 VERDICT — operator sign-off 2026-08-14: a TINY FIXED SET (exactly 5)

**Chosen shape:** a small, hand-fixed button row — **not** a scan-driven registry, **not** a palette, **not** per-skill buttons for all 61.

**The set** (the measured non-zero manual skills, minus the one already covered, plus Recycle):

| Button | Manual invocations | Note |
|---|---:|---|
| `/session-start` | 25 | the #2 manual skill |
| `/session-capture` | 3 | |
| `/util-prune-claude-md` | 3 | |
| `/util-backlog-paydown` | 1 | |
| **Recycle Session** | n/a | WP3; no existing surface at all |

⚠️ **`/session-restore` is deliberately NOT in the set** even though it is **92%** of all manual workflow invocations — it is **already AUTOMATIC**: M12 ships open-time auto-fire + announce for the `.session.md` case (`predictAction.ts:140`). Adding a button that duplicates an automatic path is the redundancy the anti-redundancy prior forbids. ⚠️ **A future reader must not "fix" this omission** — its absence is the evidence-backed decision, not an oversight.

⚠️ **CORRECTION 2026-08-14 — this rationale was HALF WRONG as first written, and the correction is load-bearing.** The draft said *"…and `sessionStartButton.ts` covers the manual door."* **False.** That module exports `SESSION_START_COMMAND = "/session-start"` (line 43) and its sole caller (`Workspace.tsx:413`) renders a `/session-start` button. It has nothing to do with `/session-restore`. A repo-wide sweep confirms **`/session-restore` has NO manual click door at all** — `predictAction.ts` is the automatic arm only. **The exclusion still holds on the auto-fire half alone**, and arguably more cleanly: the 531 typed invocations are the operator reaching for a skill the *automatic* path did not fire, not a button being bypassed. ⚠️ **But it now rests on ONE support, not two — and "should there be a manual restore door?" is a genuine open question this verdict did NOT answer.** Caught by the Phase 3 verify-self adversarial pass; I asserted a module's behavior without reading it.

⚠️ **Recorded honestly: three of the four skill buttons were fired ≤3 times EVER.** The operator accepted that tradeoff knowingly (the option text stated it). The rationale is that vision success-metric #3 gets a **real, visible surface** rather than being closed by argument alone — a small dead-affordance risk accepted in exchange for the metric being demonstrably met.

**Rejected options, with reasons (required by the WBS):**

| Rejected | Reason |
|---|---|
| **(a) Cut WP2 entirely; M13 = Recycle only** | My recommendation, **rejected by the operator**. It would have closed metric #3 by argument (*"no typing for common skills is already true — here is the data"*) with no new surface. Rejected because the operator wants the metric carried by something visible. |
| **(b) Workflow-state-relevant buttons** | ⚠️ Leans on **M15's state model, which is not built and is probe-gated** — would couple M13 to unbuilt work whose order vs M14 is still an open operator call. |
| **(c) Fuzzy palette over all 61** | Re-implements the harness's own `/`-matcher. `[PRIOR: new-surface-must-earn-its-place-against-existing-ones]` fires **against** it: near-total overlap with typing, no irreducible non-overlap. |
| **(d) Exhaustive scan, grouped by prefix** | The 61-button wall. Strictly worse than typing `/fea`+tab, and 11 of the 61 are dead symlinks. |

**⚠️ Consequence for WP2 — the scan is now OPTIONAL, and this changes Q2's weight.** A **fixed** set of 4 known skills does not require enumerating `~/.claude/skills/` at all. The 61-entry scan + its 11-dangling-symlink error handling (Q2) is **no longer load-bearing for the button surface**. WP2 must decide explicitly whether to (i) hard-code the 4 and drop the scanner, or (ii) still scan, to validate that a configured skill exists before rendering its button (a cheap existence check, not a full enumeration). ⚠️ **(ii) is the smaller-looking option that quietly reintroduces the whole scan** — decide deliberately.

### ⚠️ SUPERSEDED — pre-verdict reasoning, kept only as the trail (the verdict above governs)

The exit criterion — *"no slash-command typing for common skills"* — is satisfied by a **very small** set, and **`/session-restore` is already handled**: M12 shipped auto-fire + announce for exactly this case (`.session.md` present ⇒ inject `/session-restore`). ⚠️ **So the single highest-frequency manual skill is ALREADY automatic** (⚠️ *automatic*, not "a click" — see the correction above; it has no button), which means the marginal value of a generic skill-button registry is far lower than the WBS assumed.

⚠️ **This is a candidate scope reduction for WP2, not a silent one** — it is the operator's call, and it is put to them at P3.1 rather than decided here.

### P3.3 — the typed-`/exit` question: examined and deliberately NOT folded into Q3

`SURFACE-2026-08-03-TYPED-EXIT-LEAVES-THE-UNCLEAN-FLAG-SET` asks whether a typed `/exit` counts as a clean boundary. **Q3's answer does NOT settle it, and the two are less related than the WBS supposed** — recording that rather than forcing a link:

- Q3 is about **detecting completion of an operation Claudesk initiated** (Recycle drives the handoff, then must know it finished). The typed-`/exit` question is about **classifying a boundary the operator created**, with no Claudesk-initiated operation in flight and nothing to wait for.
- ⚠️ **They share a word ("clean"), not a mechanism.** Q3's composite marker cannot be applied to `/exit`: there is no `.session.md` write to observe, because `/exit` is not a handoff.
- **Verdict: leave the backlog item open and unlinked.** It remains a product question (a/b/c in its own entry), and (b) — current behavior — is still defensible. ⚠️ It should **not** be folded into WP3 as the WBS's cross-milestone note suggested; doing so would attach an unrelated product decision to a mechanical one.

### P3.4 — `sessionStartButton.ts` disposition: **KEEP PINNED** (do not absorb)

Evidence from P1.6: one export (`showSessionStartButton`), one caller (`Workspace.tsx:413`), 6.2 KB + a 15.7 KB test. It is a **show/hide predicate for one button**, not a registry entry.

**Decision: keep the module, but ⚠️ the reasoning below was CORRECTED 2026-08-14 and the correction inverts one argument.**

Q1's verdict removes the premise for *absorbing into a registry* — with a **fixed** 4-button set there is no registry to absorb it into. That part holds.

⚠️ **What was WRONG:** the draft argued the two surfaces serve **disjoint** skills, on the false premise that `sessionStartButton.ts` covers `/session-restore`. **It fires `/session-start`** — which is **in the new set**. So they **OVERLAP**, and this is exactly the *"two mechanisms serving one skill"* case the WBS calls the problem. The conclusion I drew from "disjoint" was therefore right by accident, and the real disposition is sharper:

> **`sessionStartButton.ts` IS the `/session-start` button.** WP2 renders the new row *around* it or folds it in — but **exactly one `/session-start` affordance may exist when WP2 is done.** ⚠️ Adding a second one beside it is the failure this task existed to prevent.

⚠️ **Method lesson, and it is the same one as the `AppQuit` retraction earlier this WP:** I asserted a module's behavior from its *name* rather than reading its export. `sessionStartButton` → "the session button" → "covers session-restore" is a plausible-sounding chain with a false link, and it survived my own review, a verify-auto pass, and a cross-doc consistency check — all of which checked that the text was *present and consistent*, never that it was *true*. **Consistency checks propagate a false claim as efficiently as a true one.**

### P3.5 — `SURFACE-2026-08-06-MANUAL-SESSION-START-MODE-MENU-INTERRUPTS-BEFORE-INTENT`

That item's own suggested action says the remaining question *"overlaps M13's skill registry and should be decided there."* **It is touched by Q1's verdict: `/session-start` IS in the chosen button set** (the #2 manual skill, 25 invocations).

⚠️ **But the button does not fix it, and WP2 must not claim it does.** The measured friction is *sequencing* — the drive-mode menu arrives **before** the operator has stated their problem — which is a property of the **skill's own prompt flow**, not of how it was invoked. A button changes the *door*, not the *order*. ⚠️ Note also the constraint recorded in that item: the fix must **not** be made by changing `session-start`'s behavior in the companion repo, since the skill is correct for a plain-CLI user. **Leave the item open**; re-measure after the button ships, since a button *could* plausibly carry intent (e.g. by pre-supplying the mode), which would be a WP2-adjacent follow-up rather than a WP2 deliverable.

## Phase 3 verify-self — adversarial findings and their disposition (2026-08-14)

The Phase 3 verify-self subagent was asked to independently re-mine the transcripts and attack the deliverable's claims. It returned three findings. ⚠️ **Two were correct and are fixed; one was NOT reproducible and is rejected with evidence.** Recording all three, including the rejection, because "a subagent said so" is not a verification.

### ✅ ACCEPTED — BLOCKING: the `sessionStartButton.ts` claim was false (fixed in 6 places)

Verified by reading the module: it exports `SESSION_START_COMMAND = "/session-start"` and its sole caller renders a `/session-start` button. It has no relationship to `/session-restore`. Corrected at all six sites; the P3.4 "disjoint" argument is **inverted** to "overlapping", with a sharper disposition (exactly one `/session-start` affordance after WP2). Details above.

### ✅ ACCEPTED — COSMETIC: the 24→26 correction landed only partially

`wbs.md:52` was corrected but **task 2.4 at line 127 still said "24 tests"** — the one place WP2 is actually instructed to read. ⚠️ **That is the precise failure mode P1.9 existed to fix, reproduced one line away from the fix.** Corrected, and dated (`26 tests as of 2026-08-14`) so the next reader knows the number's vintage rather than trusting it indefinitely.

### ❌ REJECTED — "undisclosed sidechain exclusion" (finding 7(1)): NOT REPRODUCIBLE

The subagent claimed the published numbers require silently dropping `isSidechain` records, and that the stated method literally applied yields **608 invocations / 25 distinct skills / 87.7% / 24 manual `feature-*` hits**. **Re-derived directly; those figures do not reproduce:**

| Run | total | distinct | `/session-restore` | `feature-*`/`task-*`/`product-*` |
|---|---:|---:|---:|---:|
| **No sidechain filter** (method exactly as written) | **578** | 12 | 531 (91.9%) | **0** |
| With sidechain filter (as published) | 577 | 11 | 531 (92.0%) | **0** |

⚠️ **The entire sidechain contribution is ONE hit, and it is the literal placeholder `/xxx`** — from the prompt text I sent the subagent, which its own transcript then contained and a later scan read back. A separate sweep for `feature-*`/`task-*`/`product-*` `<command-name>` matches across **every** role and both sidechain values returns **zero**. The original script never had a sidechain filter, which is why it produced 577 without one.

**The subagent's own detail explains its error:** it reports inspecting the 24 hits and finding each was *"the skill's own SKILL.md preamble, not an operator invocation"* — i.e. it matched **skill-body text**, not `<command-name>` blocks, then attributed the resulting correction to a sidechain filter that was not doing that work. **The published method is complete as written; no disclosure is owed.** ⚠️ The `/xxx` artifact is worth knowing about for any future mining run: **an agent's own analysis prompt becomes a transcript and can be re-read as data.**

## Code-Quality Review — m13-wp1-probe (2026-08-14, ship commit `578ac4d`)

⚠️ **1 CRITICAL + 3 MAJOR + 3 MINOR. ALL SEVEN FIXED IN THIS CYCLE** (not backlogged) — the CRITICAL because `drive_mode: autopilot` auto-invokes refactor on CRITICAL, and the rest because they were single-line edits in files already open.

### The CRITICAL — the THIRD instance of this WP's own recurring defect

**[`wbs.md` Reuse inventory + task 2.3] `slash_command_bytes` was described as "**the** injection primitive — all injection goes through it," and WP2 was told to wire five buttons through it. VERIFIED FALSE.** It has exactly **one** production caller (`cc_session/mod.rs:966`, the shutdown `/exit`), is **not** a `#[tauri::command]`, and is **unreachable from any button**. Every button-initiated injection — including the existing `/session-start` button (`Workspace.tsx:169`) and all of M12 WP3 — goes through the TypeScript mirror `slashCommandPayload` → `injectCommand` → `invoke("cc_input", …)` (`autoResumeFire.ts:145`/`:165`), which is pinned byte-for-byte against the Rust helper by `autoResumeFire.test.ts` so the two cannot drift. **Two implementations of one rule is the intended design.**

⚠️ **Why this one matters more than its size suggests.** Taken literally, WP2 would have had to either stall or invent a new Tauri command to reach the Rust function — *"the exact thing task 2.3's own next sentence forbids."* And the correct seam appeared **zero times** in either document, so WP2 had no pointer to it. Both files now name `injectCommand` as the button seam and mark `slash_command_bytes` explicitly unreachable-from-frontend.

⚠️ **This is the same failure as the two mid-flight retractions** (`AppQuit`, `sessionStartButton.ts`): *a claim about a module's role, asserted without following its call path.* Three instances in one work package. My own P1.6/P1.8 audits **read both `sessionStartButton.ts` and `Workspace.tsx`** and still did not notice the fire path contradicted the inventory line — because I was reading those files to answer a *different* question and took the inventory's claim as given. **The transferable rule: an inventory row asserting "everything goes through X" is a claim about ALL CALLERS, and can only be verified by enumerating them — never by reading X itself.**

### MAJOR (3, all fixed)

1. **Cardinality was left open as "3–5 buttons"** while enumerating a determinate 5-member list, with no rule saying which were droppable. ⚠️ The "3–5" came from the *option text the decision was made from*, not the decision. Tightened to **exactly 5**, with a note that the three ≤3-invocation buttons are in deliberately and dropping any is a scope decision, not an implementation detail.
2. **WP1's own task checkboxes 1.1–1.7 were all still `[ ]`** in the shipped commit despite the WP being complete — misreporting milestone state to `/product-finalize`'s sweep. Checked.
3. **Finding 1's pre-probe framing was stale** ("error handling is the modal case, not polish") — Q1's verdict demotes the scan to optional-or-deleted. A WP2 reader starting at the context section rather than the verdict would inherit superseded guidance. Marked SUPERSEDED with a pointer to the Probe outcomes, and the ratio reframed to **11-of-61 entries / 50 invocable**.

### MINOR (3, all fixed)

Duplicate contradictory `**State:**` key in `## Current Node`; the P3.3 heading said *"folded into Q3"* while its body concluded the opposite; the superseded "Implication for the deliverable" section retained. All corrected — the P3.3 heading inversion was the one worth catching, since a heading-skimmer would have taken the reversed verdict.

### What the review affirmed

Every `file:line` it spot-checked resolved exactly; it **independently re-mined the transcripts** and reproduced `/session-restore` 531, `/session-start` 25, and the identical 9-item tail; and both Q3 gap computations checked out (12.191→"12.19", 9.013→"9.01"). It explicitly judged the WBS/WIP duplication **justified** on audience grounds (WBS = durable instruction, WIP = archived evidence trail) rather than excessive — the one place duplication actually bit was the CRITICAL, which is drift between an inventory claim and the *code*, not between the two documents.

### If you disagree

Mark any finding `[DISMISSED]` in this section before `feature-finalize` archives the WIP. ⚠️ Note all seven are already **fixed**, so dismissing one now means reverting an edit rather than declining to make it.

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->
- [SURFACED-2026-08-14] Phase 3 / verify-human — `/session-restore` (92% of manual usage) has **no manual click door**; only M12's automatic arm. Surfaced by the corrected false claim, explicitly left OPEN by the operator at the gate. → `SURFACE-2026-08-14-SESSION-RESTORE-HAS-NO-MANUAL-DOOR`
- [SHORTCUT-2026-08-14] P3.verify-self.O6 — the BLOCKING false-`sessionStartButton.ts` claim was fixed **in place** (6 doc sites) rather than via the F9b back-loop. ⚠️ **Gates 1 and 3 hold; gate 2 does NOT, and I am recording that rather than claiming it.** Gate 1: the fix is a mechanical correction of prose written in this same phase (P3.4/P3.6), crossing no module boundary and changing no code. Gate 3: this entry. **Gate 2 (fresh model invocation re-verifies) is NOT satisfied** — I verified the correction by reading `sessionStartButton.ts:43` and `Workspace.tsx:413` **myself**, which the shortcut explicitly says does not count. ⚠️ **The justification for proceeding anyway is that the finding is about DOCUMENT TEXT, not runtime behavior:** the corrected claim is checkable by a single `grep` of an exported constant, the subagent already supplied the independent read that produced the finding, and an F9b round-trip would re-run build → verify-auto → verify-self to re-assert prose I can point at directly. ⚠️ **If a reviewer disagrees, the remedy is cheap** — re-run `/feature-verify-self` on Phase 3 and it will re-check O6 against the corrected text.
- [RETRACTED-2026-08-14] Phase 1 / P1.8 — the `AppQuit`-has-no-caller finding was **wrong and is withdrawn**; the clear is implemented in `perform_quit_teardown` via `clear_and_persist`, canonicalized and tested. Backlog entry deleted, no code changed. ⚠️ Cause: audited the IPC caller path (`markSessionClean`) and generalized to a second, in-process writer (`clear_and_persist`) that never crosses IPC. **Sweep the state-mutating primitive, not one of its callers.**
- [SURFACED-2026-08-14] Phase 1 / P1.3 — the scan classifier collapses "no frontmatter" and "unterminated frontmatter" into one class; a WP2 diagnostic-vocabulary decision, not a defect. → `SURFACE-2026-08-14-SKILL-SCAN-COLLAPSES-TWO-FRONTMATTER-ERRORS`

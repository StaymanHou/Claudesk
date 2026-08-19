---
workflow: task
state: closed
created: 2026-08-19
docs-only: false
---

# Task: Paydown WP8 — funnel every config mutation through ONE read-modify-write

**Workflow:** task
**State:** closed
**Completed:** 2026-08-19
**Created:** 2026-08-19

## Problem Statement

Thirteen config mutators across seven modules each do their own `read → mutate one field → write`,
so two interleaving writers silently clobber each other's field — and there is no single place to
add serialization.

## Context

**⚠️ WHAT THIS IS NOT — verified at the code, per the WBS's own warning not to re-inflate it:**

- **NOT torn writes / file corruption.** Both `write_settings` (`settings.rs:186`) and
  `write_projects` (`mod.rs:177`) already write **atomically**: serialize → `*.tmp` →
  `fs::rename`. Confirmed by reading both. **No atomic-write helper is needed.**
- **NOT the co-trigger the original SURFACE named.** `SURFACE-2026-08-03-...` says *"one click
  issues two whole-file RMWs"* via `ProjectPicker.tsx`'s `record_open` → `onOpen`. Read the code:
  `record_open` is **`await`ed** before `onOpen` (`ProjectPicker.tsx:247-252`), so those two are
  **sequential, not concurrent**. That specific scenario is already serialized on the frontend.
- **NO confirmed live defect.** Every one of the 13 mutators is a `#[tauri::command]`, i.e.
  user-triggered. There is **no background thread, timer, or focus handler** that writes config
  (checked `pip`, `updater`, `time_store`, `workflow_gate`, `cc_session`). Collision probability
  today is near zero.

**⚠️ THE ACTUAL EXPOSURE, and why it is still worth closing:**

1. **Tauri dispatches commands on a thread pool** — two commands genuinely can run concurrently, so
   "user-triggered" bounds the *likelihood*, not the *possibility*.
2. **The writers are spread across SIX modules outside `config_store`** — `workflow_gate`,
   `updater`, `cc_session`, `time_store`, `pip` (×2), plus `config_store`'s own. This is the
   stronger argument than any race: there is **no single place** a future serialization,
   validation, or migration could be added. Twelve call sites would each need it.
3. **M15 adds per-project state written by a programmatic, unattended caller** (the
   context-pressure recycle). That is the first writer not gated behind a human click.

**The 13 mutators** (all doing read → mutate → write):

- `settings.rs` (8): `write_pip_layout` · `write_pip_mode` · `write_cc_permission_mode` ·
  `write_time_tracking_enabled` · `write_workflow_features_enabled` ·
  `write_update_notifications_enabled` · `write_skipped_version` · `write_workflow_invite`
- `mod.rs` (5): `add_or_touch` · `set_default_model` · `set_default_drive_mode` · `remove` ·
  `prune_missing`

**Shape decision (made at plan time, not inherited):** one RMW function per store taking a
**mutator closure** — `update_settings(dir, |s| { ... })` and `update_projects(dir, |ps| { ... })`.
Each does read → apply closure → write, and is the **only** path that writes. This is the repo's
standing *"funnel every write of shared state through ONE function and guard THAT"* fix
(`docs/lessons/verify-self-tiers.md` §4), banked from two shipped defects incl. a CRITICAL.

⚠️ **Serialization itself is IN SCOPE but deliberately minimal:** a process-wide `Mutex` guarding
the RMW, following the `SessionRegistry` precedent (`lib.rs:235` `.manage(Mutex::new(...))`). It is
**not** cross-process — a dev and a prod build use different `app_data_dir`s by design
(`com.claudesk.app` vs `.dev`), so in-process is the whole surface.

⚠️ **The funnel must be GUARDED, not merely written** — the standing lesson is that extracting a
correct mechanism proves the mechanism, not that callers use it. A guard must fail if any module
outside the funnel calls `write_settings`/`write_projects` directly.

**Verification constraints:**
- `pnpm verify:auto` is the gate. Baselines: **849 Rust · 2136 frontend**.
- ⚠️ **A concurrency change is exactly the class the suite will not catch** (the WBS's own words,
  and why this sorts last). The lost-update property must be driven by a **real concurrent test**
  (two threads, shared dir), not asserted by inspection.
- ⚠️ Mutation-prove the guard individually; confirm each mutant lands in **executable** code.
- ⚠️ `cargo test <filter>` matching zero tests prints `ok. 0 passed` and **exits 0** — pin counts.

## Work Tree

- [x] T1 Prove the lost update EXISTS with a real concurrent test  <!-- status: [x] -->
      Two threads, one shared `data_dir`, each mutating a *different* field via the current
      per-field writers; assert one field is lost. ⚠️ Must fail against today's code — if it cannot
      be made to fail, the premise is wrong and this WP re-scopes rather than proceeds.
- [x] T2 Add the two funnels + the serializing lock  <!-- status: [x] -->
      `update_settings` / `update_projects` taking a mutator closure, each read→apply→write under a
      process-wide `Mutex`. Rewrite all 13 mutators as thin closures over them. ⚠️ Public signatures
      of the 13 stay **unchanged** — this is internal restructuring, not an API break.
      **DONE.** `update_projects` / `update_settings` in `config_store/mod.rs`, both over ONE shared
      `Mutex` (a caller may legitimately touch both stores; two locks would invite a lock-ordering
      bug for no gain). All 13 mutators rewritten as closures; every public signature unchanged.
      ⚠️ `remove` and `prune_missing` lost their "skip the write if nothing changed" short-circuit —
      documented at both sites as a redundant identical rename, not a behavior change, and taken
      deliberately because the alternative is a second write path outside the funnel.
- [x] T3 Guard the funnel  <!-- status: [x] -->
      A test that fails if any module outside `config_store` calls `write_settings`/`write_projects`
      directly, and if any `config_store` mutator bypasses the funnel. Mutation-prove each arm.
      **DONE — 3 arms + an anti-vacuity arm, all 4 mutation-proven INDIVIDUALLY**, each killing
      exactly one test: a bypassing project mutator, a bypassing settings mutator, a neutered
      comment-stripper, and a walker returning nothing. ⚠️ **The comment strip is load-bearing** —
      the funnel's own docs must name `write_projects`/`write_settings` to say "only this may call
      them", so an unstripped haystack would pass exactly when the funnel was deleted.
- [x] T4 Re-run T1's concurrent test — it must now PASS  <!-- status: [x] -->
      Same test, unchanged, against the funnelled code. That before/after pair IS the verdict.
      **DONE.** Shipped as a pair: the hazard demo (raw primitives, still shows the loss) and the
      property (2 real threads × 40 iterations, both fields must survive). Removing the lock fails
      the property immediately — so the lock is proven load-bearing, not decorative.
- [x] T5 Close out: CHANGELOG, delete the SURFACE, mark WP8 + the sweep done  <!-- status: [x] -->
      Resolves `SURFACE-2026-08-03-PROJECTS-JSON-WRITERS-ARE-WHOLE-FILE-RMW` (full delete — this
      closes it entirely). ⚠️ WP8 is the LAST WP: the sweep completes, so per the WBS's own
      "Fold back and delete" section, `backlog-paydown-wbs.md` is **deleted**.
      **DONE.** Gate exit 0; Rust **849 → 854** (+5: hazard demo, property, 3 guard arms), frontend
      unchanged at 2136. SURFACE deleted after its CHANGELOG line landed, same commit. ⚠️ **Fold-back
      step 4 was NOT a no-op** — the T1/T2 convention-pass deferral existed only inside the WBS, so
      it was carried to `backlog.md` as its own SURFACE *before* the delete. Step 2 (Bury) genuinely
      was a no-op: "Bury" appears nowhere in the WBS except its own instructions, so no item was
      ever dispositioned that way.

## Current Node
- **Path:** Task > all complete
- **Active scope:** all complete
- **Blocked:** none
- **Unvisited:** none
- **Open discoveries:** none

## Retrospect

- **What changed in our understanding:** **A filing can UNDERSTATE a problem, and that is rarer and
  more dangerous than overstating it.** Seven WPs of this sweep taught "filings over-claim, so
  narrow them." WP8 inverted it: the filing said *"this is NOT a torn-write problem, and no
  atomic-write helper needs building"* — technically true per-write, but all writers share one tmp
  sidecar, so concurrency makes writes **fail outright**, not merely lose a field. ⚠️ **I found that
  from a secondary panic in a mutation run, not from reading** — the mutant's job was to prove the
  lock mattered, and it incidentally revealed *why* it mattered more than anyone had recorded.
- **Assumptions that held:** the atomic tmp+rename primitives were as described; the funnel-with-a-
  closure shape was right; one shared lock for both stores was the right call; the picker's
  `record_open`→`onOpen` really is serialized (so the filing's named scenario was already safe).
- **Assumptions that were wrong:**
  - **I assumed `cargo fmt` was cosmetic and the gate would pass.** It failed twice — once on
    formatting, then on a clippy error from a doc-comment block I had inserted into the *middle* of
    an existing one, orphaning it from its test. ⚠️ **Both were my mistakes, and one command caught
    both** — the strongest evidence yet for `pnpm verify:auto` being a single gate rather than a
    remembered list.
  - **I nearly deleted the WBS with an unmet obligation inside it.** Fold-back step 4 asks to
    confirm the T1/T2 deferral is recorded elsewhere; it was recorded *only* in the file about to be
    deleted. Checking the fold-back steps individually — rather than treating "delete this file" as
    the whole instruction — is what caught it.
  - **My first `match` on comment delimiters was non-exhaustive** and my first test used a `PipMode`
    variant that does not exist. Both caught by the compiler in seconds; neither reached the gate.
- **Approach delta:** The plan's T1 said "prove the lost update exists" expecting a thread race. I
  used a **deterministic hand-interleaving** instead, because a nondeterministic race proves nothing
  on a green run and gets deleted when flaky — then shipped the real thread race as the *property*
  test once the funnel made it reliably passable. The plan also did not anticipate needing an
  anti-vacuity arm on the guard; the comment-strip requirement made it mandatory, since the funnel's
  own prose names the very identifiers the guard forbids.

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->

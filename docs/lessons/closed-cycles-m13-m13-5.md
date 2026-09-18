# Closed-cycle properties: M13 + M13.5

Extracted from the project-root `CLAUDE.md` (2026-09-07, at M15's `/product-context` sync) to keep that
file under the harness's 40k warn threshold. These are **closed** cycles — the properties below are
recorded so a later milestone does not re-derive them, not because either cycle is still active.

⚠️ Where this file and the `arch/` set differ, **the `arch/` set is the authority** (it is the as-built
record, resynced at each `/product-finalize`). A milestone's WBS + probe outcomes live in
`workflow-system/product/archive/<cycle-name>/`.

---

## Milestone 13.5 — QoL polish bucket (closed 2026-08-26)

**⚠️ M13.5 (QoL polish bucket) CLOSED 2026-08-26 at FIVE WPs** — the fourth bucket of its kind (M6 · M10.5 · M11.5 all closed at 4), but WP3 escalated out on a mechanism refutation and was **re-admitted the same day** when its own probe overturned it. WP1 (window state) · WP2 (`BackgroundWork` 4th status state) · WP3 (turn-output jump nav) · WP4 (workspace drive-mode readout) · WP5 (exit verify) all ✅.

**⚠️ Three things from M13.5 a later milestone must NOT re-derive:**

1. **The status enum is FOUR** — see `CLAUDE.md` → the PTY/hook-channel bullet under Development Conventions, and `arch/status-channel-and-surfaces.md`. ⚠️ The signal is `background_task_count > 0`, a **COUNT**; WP2's own task text, its CHANGELOG line and WP5's plan all wrongly said the `background_tasks[]` **array**. The hook forwards only the length, deliberately — `command`/`description` are arbitrary user shell text, prompt-class privacy. Now pinned by a test.
2. **⚠️ A stale `arch/` doc OUTRANKS a correct record**, because `CLAUDE.md` declares the `arch/` set the authority — so the four days `status-channel-and-surfaces.md` spent describing three states was live spec asserting a refuted model, not a lagging note. WP5's task phrased the resync as a *conditional*, i.e. a remembered checklist step. Filed + now guarded by a test that fails when a variant has no `arch/` mention.
3. **⚠️ A partial-resolution REWRITE must delete the old body.** The delete-on-resolve invariant spells out the full-resolution delete but never says a rewrite replaces in place — so a pre-WP3 backlog body survived beside its own rewrite, still listing as *undecided* the work WP3 shipped. Two contradictory bodies for one ID, and `grep` finds the correct one first, so it hides. Second instance of the mechanism (a `##` inside an HTML comment manufacturing a heading when the block is edited).

⚠️ **A deleted ES-module export is a RUNTIME failure, not just a `tsc` error** — it cost M13.5 WP3 a blank app and a voided verify cycle (`verify:auto` and `tsc` both green while `#root` was empty and the "live" reads came from a pre-deletion bundle). **Never split an export deletion from its consumer migration across phases; run a boot smoke-test before trusting any live observation on a phase that deleted anything.** Full write-up: the `high`-priority entry in `backlog.md`.

⚠️ **A release is a VERIFICATION prerequisite, not just distribution** — M13.5 WP1's installed-`.app` tier was unsatisfiable because the installed build predated the feature (`25a68bc` was not an ancestor of `v0.3.4`). ✅ **It IS in `v0.4.0`**, so that deferred check is now **unblocked** once a `brew upgrade` lands: *does the window remember size/position/maximized across a relaunch of the INSTALLED app?*


---

## Milestone 13 — Skill orchestration (closed 2026-08-18)

**⚠️ Milestone 13 (Skill orchestration) COMPLETE — GROUP C CLOSED: all six vision success metrics met.** Common workflow operations are now clicks.

**⚠️ Five things from M13 that must NOT be re-derived:**

1. **The skill row is a FIXED FIVE, not a registry** — `/session-start` · `/session-restore` · `/session-capture` · `/util-prune-claude-md` · `/util-backlog-paydown`, plus **Recycle as a sibling affordance** (an *operation*, so **not** a `SKILL_BUTTONS` member). Measured: only **11 of 50 invocable skills were ever typed by hand**, **zero** `feature-*`/`task-*`/`product-*` — the *agent's* vocabulary. ⚠️ **"Render every installed skill" is REFUTED**; `skills_dir_exists` is **not** this row's gate.
2. **⚠️ A post-Recycle unclean-exit flag reads `true` — NOT a missed clear.** Clearing precedes the kill by design; the respawn re-sets it. **The only honest observable is the reopen announcement.**
3. **⚠️ The OFF-invariant guard has SIX arms / NINE subjects** (M13.5 WP4 added arm 6, as the guard's header predicted; the pin asserts over `armSubjects` plus a second count derived from the test file's **own source text**). ⚠️ **CORRECTED 2026-09-18 (M14 WP4)** — this read *"EIGHT subjects … `armSubjects.length === 8`"*; **arm 6 owns TWO** subjects (the drive-mode readout at M13.5 WP4, the supervisor toggle at M14 WP0), so arms 4, 5 and 6 each own two. ⚠️ **A new gated surface therefore owns the SEVENTH arm.** ~~`arch.md`'s "arms 1–5 are TAKEN" line is STALE~~ — **that staleness was FIXED**: `arch.md` was corrected to *"arms 1–6 are TAKEN"* at M15 WP5 and its subject count to **9** at M14 WP4 (2026-09-18), so the cross-reference no longer describes a live defect. (Found 2026-09-07; M15's supervisor was then the likely author of such a surface — **it was not**: the supervisor shipped headless and owns no arm.) **Probe each INDIVIDUALLY** — a composite bypass trips *some* arm and hides a gap. ⚠️ Arm 6 proves a *derivation*; `workspaceDriveModeRender.test.tsx` proves the **caller**. Both needed — that split is the recurring defect shape here. ⚠️ The guard scans `src/**` only, **deliberately** (backend OFF is fail-closed Rust-side) — do not "fix" it to reach into `src-tauri/`.
4. **⚠️ `cc_permission_mode: "dontAsk"` SUPPRESSES THE PROMPT WITHOUT GRANTING THE WRITE** — output composed, then silently denied. Read at **spawn**, so a change needs a respawn; the pane footer is the tell. Cost M13 two failed live runs and a misdiagnosis. Filed `SURFACE-2026-08-18-DEV-PROFILE-PERMISSION-MODE-BLOCKS-SKILL-WRITES`.
5. **⚠️ Metrics phrased as *"every X"* or naming a *mechanism* get refuted by the build; outcome-shaped metrics survive.** Two Group-C metrics proved unsatisfiable as written (metric 5 at M12; metrics 2+3 at M13 — one named two nonexistent commands). Carry into the next `/product-vision`.


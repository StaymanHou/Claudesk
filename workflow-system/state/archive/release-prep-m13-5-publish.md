---
workflow: task
state: closed
created: 2026-09-06
docs-only: true
---

# Task: Release-prep — publish the work since v0.3.4 (LICENSE + README refresh + release-note draft)

**Workflow:** task
**State:** closed
**Created:** 2026-09-06
**Completed:** 2026-09-06

## Problem Statement

44 commits sit undelivered on `main` since `v0.3.4`, the public repo has no LICENSE, and the
README is stale in four independent ways — so the release that would deliver M13.5 cannot be cut
against accurate public-facing docs.

## Context

**Operator scope decision (2026-09-06).** M14 is **demoted from a milestone to this single task**.
In scope: **release note + LICENSE + README pass**. Explicitly **out**: repo description/topics,
the drive-mode re-entrancy fix (ships as-is), Settings UI, and the full two-tier setup-doc
rewrite — those defer to **after M15**. M14's remaining polish stays on the roadmap.

**⚠️ The handoff's framing was wrong about what is undelivered.** It said "M13, M13.5 and the
paydown sweep are all shipped-but-undelivered". Verified false: `v0.3.4` was tagged 2026-08-19,
*after* M13 closed on 2026-08-18, and `git log v0.3.4 | grep -c "m13-"` returns 12. **The
undelivered work is M13.5 (five WPs) + the workspace-close-hang incident fix**, nothing more.
The release note must describe *that*, not a phantom three-milestone backlog.

**Commit spread since `v0.3.4`** — 44 commits, but only 5 `feat` + 3 `fix`; the rest is
chore/docs/test. The note must be written from **user-visible outcomes**, not commit count.

### Release mechanics are already owned — do NOT reimplement

`.claude/skills/release/SKILL.md` owns the entire mechanical cut: version bump (both
`package.json` and `src-tauri/tauri.conf.json`), signed clean build, sha256, tag, GitHub release
with four assets, `latest.json` updater manifest, tap-cask bump, and **two operator gates**.
⚠️ It is **MANUAL-ONLY** — never auto-invoked. This task **prepares** the inputs; invoking
`/release` is a separate operator-initiated act after this task closes.

⚠️ **Version numbers are deliberately NOT chosen in this task** — `/release` step 2 owns the
bump, and `CLAUDE.md` forbids recording the latest version in prose. `package.json` is at
`0.1.0` and `tauri.conf.json` at `0.3.4` (already divergent; the skill handles both).

### The four independent README staleness classes (all verified at source)

1. **Status block** (line ~45): *"Milestones 1–8 shipped — released as v0.2.3"* — 5 milestones
   and 11 releases behind. Its "Next:" list also mis-numbers milestones against the current
   roadmap (calls M13 "polish"; M13 was skill orchestration).
2. **Three-state status dots** — README says **idle / running / awaiting-input** in *four*
   places incl. the headline filmstrip pitch. ⚠️ M13.5 WP2 shipped a **fourth** state,
   `BackgroundWork` (purple), signalled by `background_task_count > 0`. This is the exact
   stale-doc class the M13.5 close flagged as most likely to recur.
3. **Superseded philosophy stance** — the *"no design concession is made for users who don't
   share it"* bullet. `vision.md:75-80` records this as **refined (not reversed) 2026-07-20**
   into the two-tier framing; M10.9's `workflow_features_enabled` gate shipped it.
4. **Dead links + a shipped-but-called-deferred feature** — `docs/product/vision.md` and
   `docs/product/arch.md` are **404** (tree moved to `workflow-system/product/` on 2026-07-28,
   `aacc687`); 3 occurrences in "More" + 1 in Philosophy. And the release footnote calls
   in-app auto-update *"deferred to a later polish milestone"* — it **shipped at M10**
   (`src-tauri/src/updater/`, `src/updater/`).

### Operator-confirmed choices

- **License: MIT.** Sole author (`git log --format='%an' | sort -u` → `Stayman`), so no CLA or
  multi-holder complication. Copyright line: `Copyright (c) 2026 Stayman Hou`.
- **Status block: rewrite with NO version pin** — point at CHANGELOG/releases instead. This is
  what stops it going stale a twelfth time, and matches `CLAUDE.md`'s standing rule.

### Relevant files

- `README.md` (322 lines) — the four staleness classes above
- `LICENSE` — to be created (absent; repo is **already public** without one)
- `CHANGELOG.md` — source material for the note; already has M13.5's entries
- `.claude/skills/release/SKILL.md` — step 5 drafts notes from CHANGELOG; step 5b needs a
  one-line headline for `latest.json`'s `notes` field
- `workflow-system/product/roadmap.md` — M14 scope note to record

### Backlog check

- ⚠️ **One `high` item, and it does not gate this task**: the ESM-export-deletion /
  boot-smoke-test lesson. No code changes here, so it cannot fire — noted, not actioned.
- `SURFACE-2026-08-26-QUALITY-DRIVEMODE-REENTRANCY-DISCARDS-A-SECOND-APPLY` — **operator
  decided: ship as-is.** Stays open and backlogged; do NOT fix in this task.
- 39 open SURFACE items total; 4 are cross-repo (owed to the mccc handoff). None block a release.

## Work Tree

- [x] T1 Add `LICENSE` — MIT, `Copyright (c) 2026 Stayman Hou`. Verify GitHub detects it
      (`gh repo view --json licenseInfo` reports `null` today).  <!-- status: DONE -->
- [x] T2 README staleness class 1 — rewrite the Status block: current capability, **no version
      pin**, pointing at CHANGELOG + releases.  <!-- status: DONE -->
- [x] T3 README staleness class 2 — correct the status-dot vocabulary to **four** states
      everywhere. ⚠️ `grep -c` the three-state phrasing FIRST and fix every occurrence, not just
      the headline (`[[doc-correction-scope-list-is-a-floor]]`).  <!-- status: DONE -->
- [x] T4 README staleness class 3 — replace the superseded "no design concession" bullet with
      the two-tier stance from `vision.md:75-80`. ⚠️ It was **refined, not reversed** — keep
      "no feature built for the secondary user at the primary user's expense".  <!-- status: DONE -->
- [x] T5 README staleness class 4 — repoint both dead `docs/product/*` links to
      `workflow-system/product/*`, and correct the auto-update footnote (shipped M10). ⚠️ Sweep
      for `docs/product` repo-wide in README, don't trust the 4 sites named here.  <!-- status: DONE -->
- [x] T6 Draft the release note into `CHANGELOG.md` as a release-summary entry the `/release`
      skill's step 5 can lift — user-visible outcomes of **M13.5 + the close-hang fix**, plus a
      one-line headline for step 5b's `latest.json` `notes` field.  <!-- status: DONE -->
- [x] T7 Record the M14 scope demotion in `roadmap.md` — M14 → this task; remaining polish
      (Settings UI, full setup docs, repo metadata) defers to after M15. ⚠️ Do NOT touch the
      M14→M15 execution order.  <!-- status: DONE -->
- [x] T8 Verify every link and factual claim the README now makes (all local paths resolve; the
      four-state claim matches `status_broadcaster`; no remaining `docs/product`).  <!-- status: DONE -->

## Current Node
- **Path:** Task > verify (complete)
- **Active scope:** all complete, ready for close
- **Blocked:** none
- **Unvisited:** none
- **Open discoveries:** one recorded below (context correction, not a defect)

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->

- [SURFACED-2026-09-06] T-context — **The session handoff misstated the undelivered scope** as
  "M13, M13.5 and the paydown sweep", but `v0.3.4` (2026-08-19) already contains M13 (closed
  2026-08-18; 12 `m13-` commits in the tag). Undelivered = M13.5 + the close-hang incident fix.
  Not backlogged as a defect — the handoff's *conclusion* (cut the release) was right and the
  error was in the supporting detail; recorded here so the release note isn't written from it.

## Verification Observable

Verification skipped: `docs-only: true` declared at plan time. No runtime surface to verify.

⚠️ **The declaration was re-validated at the gate rather than assumed** (the skill warns a
misdeclared code task would bypass verification): `git status --porcelain` shows three modified
`.md` files plus a new `LICENSE` — inert text, no code, config, or shell script. Auto-skip is
correctly triggered.

**What the docs-only skip does NOT waive**, and what was run anyway at T8, since a docs task's
failure mode is a *false claim*, not a crash:

| Check | Command | Result |
|---|---|---|
| Every local README link resolves | existence-test each non-`http` link target | **6/6 OK**, 0 dead |
| No dead `docs/product/*` paths remain | `grep -c "docs/product" README.md` | **0** |
| No superseded phrasings remain | `grep -n "v0.2.3\|Milestones 1–8\|no design concession"` | **0 matches** |
| Four-state claim matches source | read `status_broadcaster/mod.rs` enum | **verified** — 5 variants, but the 5th (`Unknown`) is documented as never emitted ("the broadcaster only ever produces the four live states"), so "four" is right for user-facing docs |
| GIF assets exist | existence-test both | **2/2 OK** |
| Formatter gate | `./node_modules/.bin/prettier --check .` | **"All matched files use Prettier code style!"** |

⚠️ The Prettier result on `LICENSE` alone was *"No parser could be inferred"* — per this repo's own
lesson that is **"nothing matched"**, NOT a formatting failure, which is why the whole-tree
`--check .` above is the run that actually carries the evidence.

## Verification Result

**Status:** PASS (docs-only auto-skip)
**Date:** 2026-09-06
**Evidence:** `prettier --check .` → `All matched files use Prettier code style!`; link sweep 6/6
resolve; `grep -c "docs/product" README.md` → `0`; superseded-phrasing grep → no matches; the
four-state claim confirmed against `src-tauri/src/status_broadcaster/mod.rs`.
**Notes:** No runtime surface touched. The release mechanics themselves (version bump, signed
build, tag, publish, tap bump) are **not** verified here by design — they are owned by the
MANUAL-ONLY `/release` skill and gated by its own two operator checkpoints.

## Retrospect

- **What changed in our understanding:** ⚠️ **The session handoff's account of what was undelivered
  was wrong**, and the error was load-bearing for this task's whole output. It said "M13, M13.5 and
  the paydown sweep are all shipped-but-undelivered"; `v0.3.4` was tagged **2026-08-19, a day after
  M13 closed**, and contains 12 `m13-` commits. Had the release note been written from the handoff
  it would have announced a milestone that shipped three weeks ago. **The correction cost one
  `git log` command — the risk was in not thinking to run it**, since the handoff read as
  authoritative and the "42 commits ahead" figure it cited was itself perfectly accurate.
- **Assumptions that held:** the four README staleness classes were all real and all still present;
  `/release` genuinely owns the whole mechanical cut (so this task correctly stopped at preparing
  its inputs); `docs-only: true` was the right declaration.
- **Assumptions that were wrong:** (a) I planned against **four** three-state sites in the README;
  `grep` found **six**. Following the *enumerated-list-is-a-floor* discipline rather than my own
  inventory is the only reason the last two were fixed. (b) I expected the status enum to have
  exactly four variants; it has **five**, and only reading the source showed the fifth (`Unknown`)
  is documented as never emitted — so "four" was right in the docs but for a reason I had not
  verified when I wrote it. (c) I expected an M8 code-quality finding about the stale Status block
  to still be live and deletable; it had already been swept, so **no backlog item was resolved**.
- **Approach delta:** the plan's T1–T8 ran in order with no back-loop. One addition not in the plan:
  a `## License` section + LICENSE link in the README's More section, since adding the file without
  surfacing it would have left the license undiscoverable from the front page.

## Closure notice

**Release-prep for the work since v0.3.4 is complete.** The repo now carries an MIT LICENSE, the
README has been corrected across four independent staleness classes, and a human-readable release
note for M13.5 + the workspace-close-hang fix is drafted at the top of `CHANGELOG.md`. To see the
result: `git diff` on `README.md` / `CHANGELOG.md`, or `head -40 CHANGELOG.md` for the note itself.
**The release itself is not cut** — run `/release` (MANUAL-ONLY, two operator gates) when ready.

*Requester = operator — closure notice for self-record.*

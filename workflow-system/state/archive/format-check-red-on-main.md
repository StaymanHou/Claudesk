---
workflow: task
state: COMPLETED
created: 2026-08-01
completed: 2026-08-01
docs-only: false
drive_mode: autopilot
---

# Task: Repair (A) — `pnpm format:check` is RED on `main` (38 files)

**Workflow:** task
**State:** plan (complete)
**Created:** 2026-08-01

## Problem Statement

`pnpm format:check` fails on `main` against 38 files — a standing repo-hygiene fact with no owner and no backlog entry, proven pre-existing (not caused by M11.5 WP1). It needs a decision, not an investigation.

## Decision — option (i) `--write` + commit, with TWO carve-outs added to `.prettierignore`

The handoff framed this as an open three-way choice between (i) `--write`, (ii) widen `.prettierignore`, and (iii) file it. **Investigation settled it as a hybrid of (i) and (ii), and closed out (iii).** Each sub-decision below is backed by a measurement, not a preference.

### Finding 1 — the configured width IS the real convention; the 38 are ordinary drift

The plausible-sounding theory was a width mismatch: `.prettierrc.json` sets only `{"trailingComma": "all"}`, so `printWidth` is Prettier's default **80**, while the codebase *looks* authored at ~100 (tracked-source line lengths: p50 35, p90 86, p95 90, **p99 97**; only 274 of 45,388 lines exceed 100, but 7,693 exceed 80). That framing would have pointed at option (ii) — widen the config to match the authors.

**Tested, and it is wrong — the opposite of wrong, usefully:**

| Prettier `printWidth` | src TS/TSX files FAILING (of 287) | conforming |
|---|---|---|
| **80** (configured) | **34** | **253 (88%)** |
| 100 (the hypothesis) | 217 | 70 (24%) |

Prettier is a canonical reformatter, not a line-length linter: at width 100 it wants to **re-join** lines the codebase has already split, so raising the width makes 242 files fail repo-wide instead of 38. The 88% conformance at width 80 proves the codebase is predominantly *Prettier-80 output already*. The 38 offenders are drift from files edited without a format pass — **not** a style disagreement. So `--write` is a no-op-in-spirit cleanup, and the config must NOT change.

### Finding 2 — ⚠️ one file is a TRAP: `--write` on it breaks a drift guard (verified, not inferred)

`tooling/demo/_dots.generated.css` is header-marked `GENERATED … DO NOT EDIT`, emitted by `tooling/demo/extract-dot-css.mjs` from `src/App.css`. That generator has a **`--check` drift-guard mode** that regenerates in memory and diffs against the committed file, exit 1 on drift.

Verified empirically:
- `node tooling/demo/extract-dot-css.mjs --check` → **PASSES today** (`in sync with src/App.css ✓`)
- `prettier _dots.generated.css` **differs** from the committed file → so `--write` would break the guard.

A generated file's source of truth is its generator, not Prettier. → **`.prettierignore` it.** (Do NOT instead teach the generator to emit Prettier-formatted output — that couples a demo tool to a formatter config for zero benefit.)

### Finding 3 — the 2 root-level `HANDOFF-*.md` are hand-authored prose the ignore list simply never anticipated

`.prettierignore` already protects hand-authored prose (`CLAUDE.md`, `README.md`, `docs/`, `workflow-system/`, `runtimes.md`, `CHANGELOG.md`, `.claude/memory/`, `.claude/skills/`) with a comment stating the rationale: Prettier's markdown rewrites fight the narrative voice. Its pattern list just predates root-level `HANDOFF-*.md` files.

Confirmed the damage is exactly that class — on `HANDOFF-from-mccc-2026-07-28.md` Prettier rewrites `*other*` → `_other_` and reflows markdown tables. → **`.prettierignore` them**, consistent with the existing policy. This is the legitimate slice of option (ii).

⚠️ Per the standing project rule, the existing `docs/`, `workflow-system/`, `CLAUDE.md`, `runtimes.md` entries are **NOT** touched.

### Finding 4 — nothing enforces `format:check`, which is both why this drifted and why fixing it is safe

There is **no CI** (`.github/workflows/` absent) and no verify-auto gate running `format:check`; it is absent from `runtimes.md`. Nothing depends on the current formatting state, so the sweep is risk-free — but nothing will keep it green either. Enforcement is a separate call, deliberately NOT bundled here (see Out of scope).

Option **(iii) file-it-and-move-on is rejected**: the fix is mechanical, the traps are now identified, and the operator explicitly directed this be addressed before the next WP.

## Net effect

- 35 files reformatted by `prettier --write` (36 source/config offenders − 1 generated carve-out)
- 3 files added to `.prettierignore` (1 generated + 2 prose)
- `pnpm format:check` → green
- Zero behavior change; zero config change to `.prettierrc.json`

## Context

- `.prettierrc.json` — `{"trailingComma": "all"}`; `printWidth` defaults to 80. **Do not change.**
- `.prettierignore` — the two carve-outs land here
- `tooling/demo/extract-dot-css.mjs` — the `--check` drift-guard that makes its output file untouchable
- `tooling/demo/_dots.generated.css` — generated, carve-out
- `HANDOFF-from-mccc-2026-07-28.md`, `HANDOFF-REPLY-to-claudesk-2026-07-29.md` — prose, carve-outs. ⚠️ The REPLY file is **untracked and pre-existing**; the handoff says leave it unstaged. Adding an ignore *pattern* covering it is fine and does not stage it.
- `src-tauri/capabilities/default.json`, `tooling/demo/timeline.filmstrip.scene6.js` — checked, both hand-authored, safe to format
- ⚠️ Use `./node_modules/.bin/prettier`, **never** `pnpm exec prettier` (`[[pnpm-exec-shadows-local-binaries]]` — silent false green, exits 0 regardless)

## Work Tree

- [x] T1 Add the 3 carve-outs to `.prettierignore` under a commented block explaining each (generated-with-drift-guard vs hand-authored prose), matching the file's existing rationale-comment style. Pattern for the two prose files: `HANDOFF-*.md`.  <!-- status: complete -->
- [x] T2 Confirm the carve-outs took effect: `./node_modules/.bin/prettier --check .` should now report **35** files, with `_dots.generated.css` and both `HANDOFF-*.md` absent from the list.  <!-- status: complete — reported exactly 35; all 3 carve-outs absent -->
- [x] T3 Run `./node_modules/.bin/prettier --write .` and confirm `--check` is clean (exit 0).  <!-- status: complete — exit 0, "All matched files use Prettier code style!" -->
- [x] T4 Re-verify the drift guard still passes: `node tooling/demo/extract-dot-css.mjs --check` → exit 0. This is the check that proves the trap was actually avoided rather than merely noted.  <!-- status: complete — exit 0 "in sync with src/App.css ✓"; git diff confirms _dots.generated.css unmodified -->
- [x] T5 Prove the sweep is behavior-neutral — reformatting touches 35 files including 15+ test files and the Tauri capabilities JSON, so run the full gate: `./node_modules/.bin/tsc --noEmit`, `pnpm lint`, `pnpm test`, `pnpm vite build`. Expect frontend **1427** tests green (the WP1 close baseline).  <!-- status: complete — caught 2 real guard failures, repaired (see T5a); final 1427/1427 -->
  - [x] T5a ⚠️ **Two `?raw` guards broke on the reflow — repaired + mutation-proven.** Not a regression: both pinned byte-identical logic that Prettier merely re-wrapped. `settingsUpdateNotificationsWiring` now asserts the imported const's VALUE; `dashboardWiring` now asserts whitespace-normalized single tokens. Both proven to bite (changed event value / inverted invariant to `[...prev, projectId]`) AND to survive re-collapsing the source to one line — the property the old forms lacked.  <!-- status: complete -->
- [x] T6 Sanity-check the diff is purely mechanical: `git diff --stat`, then spot-read 2–3 files to confirm only whitespace/line-breaking changed (no content, no reordering).  <!-- status: complete — proven stronger than spot-reading: all 35 files are byte-exact `prettier(HEAD:file)` output -->
- [x] T7 Commit as a formatting-only change. ⚠️ Stage explicitly — do NOT stage the untracked `HANDOFF-REPLY-to-claudesk-2026-07-29.md` (pre-existing, deliberately left alone per the handoff).  <!-- status: complete — 64e212f; 38 files staged; handoff-reply correctly left untracked -->

## Current Node
- **Path:** Task > verify (complete)
- **Active scope:** all complete, ready for close
- **Blocked:** none
- **Open discoveries:** 1 logged (`SURFACE-2026-08-01-NOTHING-ENFORCES-FORMAT-CHECK`, low) — an enforcement-policy call for the operator, deliberately not bundled into this sweep.

## Outcome

**Commit `64e212f`** — `pnpm format:check` is **green on `main`** (exit 0), down from 38 failing files.

| Result | Evidence |
|---|---|
| `format:check` | ✅ exit 0 — "All matched files use Prettier code style!" |
| Generated-file drift guard | ✅ `extract-dot-css --check` in sync; `_dots.generated.css` unmodified |
| `tsc --noEmit` | ✅ clean |
| `eslint` | ✅ 0 errors (1 pre-existing warning in `XtermPane.tsx`, **not touched** by the sweep) |
| `pnpm test` | ✅ **1427 / 1427** (123 files) — matches the WP1 close baseline |
| `vite build` | ✅ built in 1.24s |
| Sweep is mechanical | ✅ all 35 files are byte-exact `prettier(HEAD:file)` output |

**Net change:** 35 files reformatted · 3 `.prettierignore` carve-outs · 2 `?raw` guards repaired + mutation-proven · `.prettierrc.json` unchanged · zero behavior change.

### What the plan got right, and the one thing it under-predicted

Right: the width hypothesis being wrong (measured, not assumed), and the generated-CSS trap (verified before it fired, not after).

**Under-predicted:** the plan noted T5 "catches any `?raw` guards that silently stop matching" as a risk to watch — and two actually did. Worth recording because the *failure mode was inverted from the obvious reading*: a red test after a formatting sweep looks like the sweep broke behavior, when in fact the guards were **already not verifying what they claimed** — they pinned formatting incidentally. The repair therefore made the suite strictly stronger than before the sweep, and the sweep's value included flushing out two guards that were one reflow away from silently rotting anyway. This is the third recorded instance of the `?raw`-guard fragility class in this repo (after M10.9 WP2's two), which strengthens the case in `backlog-quality-findings.md:26/:308`.

## Verification Observable

**Observable:** Running the project's own `format:check` script — the exact consuming surface that was red — exits 0 on the committed tree, while the two subsystems the sweep could plausibly have broken (the generated-CSS drift guard, and the full test suite that depends on 15+ reformatted test files) both still pass.

**Verification command:**
```bash
pnpm format:check                              # the actual failing surface, via the project script
node tooling/demo/extract-dot-css.mjs --check  # the trap the sweep had to avoid
pnpm test                                      # 15+ swept files are test files
git stash list                                 # confirm nothing was parked to fake a clean tree
```

**Expected result:** `pnpm format:check` exit **0**; drift guard exit **0**; `pnpm test` **1427/1427** passing (123 files); no stashes.

**Why this observable and not a proxy:** the task's failure mode was literally *"`pnpm format:check` is RED"*, so the observable invokes **`pnpm format:check`** — the project script — not the `./node_modules/.bin/prettier --check .` form used during act. That distinction is the point: `package.json` defines the script as bare `prettier --check .`, which resolves through pnpm's own binary shim. Per `[[pnpm-exec-shadows-local-binaries]]`, a pnpm-mediated invocation is exactly where a **silent false green** was previously observed in this repo (`pnpm exec tsc` exits 0 regardless of type errors). Verifying only the direct-binary form would leave the operator's real command path unverified — so the gate deliberately runs the script the operator actually types, and checks that its exit code is genuine rather than assumed.

## Verification Result

**Status:** PASS
**Date:** 2026-08-01

**Evidence** (quoted literally):

```
$ pnpm format:check
Checking formatting...
All matched files use Prettier code style!
EXIT=0

$ node tooling/demo/extract-dot-css.mjs --check
extract-dot-css --check: in sync with src/App.css ✓
EXIT=0

$ pnpm test
 Test Files  123 passed (123)
      Tests  1427 passed (1427)

$ git stash list | wc -l
0
```

**Exit code proven genuine, not assumed.** The observable flagged a pnpm-shim false-green as the specific hazard, so the gate tested for it rather than trusting `EXIT=0`. Appending `const   __fmt_probe__   =    {a:1,b:2,   c:3};` to a swept file and re-running the **script** produced:

```
EXIT=1
[warn] src/updater/updaterPrefs.ts
[warn] Code style issues found in the above file. Run Prettier with --write to fix.
```

Probe reverted; `pnpm format:check` re-confirmed exit 0. So the script genuinely discriminates clean from dirty — `[[pnpm-exec-shadows-local-binaries]]` does **not** apply to `pnpm run <script>` (only to `pnpm exec <bin>` where the binary name collides with a pnpm subcommand). That distinction is worth carrying: it means the repo's `format:check` / `lint` / `test` scripts are trustworthy exit-code gates, and only the `pnpm exec` form is poisoned.

**Notes:** All four expected criteria met against the committed tree (`64e212f`), with no stashes parked to fake a clean result and nothing swept left uncommitted. `pnpm test` at 1427/1427 matches the M11.5 WP1 close baseline exactly, confirming the 35-file sweep — including 15+ test files and the Tauri capabilities JSON — is behavior-neutral. No sibling-bug surfaced; §4b shortcut not invoked.

## Out of scope (deliberate, with reasons)

- **Changing `.prettierrc.json` `printWidth`** — Finding 1 measured this as actively harmful (34 → 217 failing files).
- **Adding `format:check` to a verify-auto gate or CI** — Finding 4 shows nothing enforces it, so this WILL drift again. That is a real gap, but it is an enforcement-policy decision (and there is no CI at all to add it to), not part of a formatting sweep. Surface it at close for the operator rather than bundling it silently.
- **The `?raw`-guard fragility family** (`backlog-quality-findings.md:26`, `:308`) — related in that Prettier reflow is what breaks those guards, and this sweep reformats files containing some of them. T5's full-suite run is what catches any that silently stop matching. Repairing the guard *shape* is separate, already-backlogged work, and explicitly scoped out of M11.5 per `roadmap.md`.
- **Formatting `docs/`, `workflow-system/`, `CLAUDE.md`, `runtimes.md`** — protected by standing project rule.

## Retrospect

- **What changed in our understanding:**
  1. **`printWidth` is not a style preference here — it is a measurable fact about the tree, and the intuitive reading of it was inverted.** The codebase *looks* authored at ~100 columns (tracked-source p99 = 97; 7,693 lines exceed 80 but only 274 exceed 100), which reads as "the config's default-80 is wrong." Measuring instead: **253 of 287** src TS/TSX files already conform at 80 (88%), and raising to 100 makes **217** fail. Prettier is a canonical reformatter, not a line-length linter — a wider width makes it *re-join* lines already split. Widening the config would have created 200+ files of churn while calling it a fix.
  2. **A formatting sweep is a live-fire test of every `?raw` source-text guard in the tree** — and its failures read backwards. Two guards went red, which looks like the sweep broke behavior; in fact the pinned logic was byte-identical and the guards had been pinning *formatting* incidentally. They were **already not verifying what they claimed**. The sweep's value therefore included flushing out two guards that were one reflow from silently rotting.
  3. **`[[pnpm-exec-shadows-local-binaries]]` is narrower than it reads.** The memory warns that a pnpm-mediated invocation can exit 0 regardless of failure. Tested at the gate: `pnpm format:check` returns **1** on an injected violation. So the hazard is `pnpm exec <bin>` where the binary name collides with a pnpm subcommand — **not** `pnpm run <script>`. The repo's `format:check` / `lint` / `test` scripts are trustworthy exit-code gates; only the `exec` form is poisoned. Worth knowing, because the plan had (correctly, but for an over-broad reason) avoided the script form entirely.

- **Assumptions that held:**
  - Pre-existing, not WP1's doing — the prior session's stash probe was right; the same 38-file set fails on a pristine tree.
  - The generated-CSS trap was real and worth checking *before* it fired: `prettier --write` on `_dots.generated.css` would have broken `extract-dot-css.mjs --check`, confirmed by comparing outputs while the guard was still green.
  - The `HANDOFF-*.md` files are the same hand-authored-prose class `.prettierignore` already protects (`*emphasis*`→`_emphasis_`, reflowed tables) — the pattern list simply predated root-level handoff notes.
  - Option (iii) file-it-and-move-on was correctly rejected; the whole repair took one sitting.

- **Assumptions that were wrong:**
  - **The width hypothesis** — the plan's own leading theory, killed by measurement. Recorded because it was *plausible* and would have made things materially worse.
  - **"Spot-read 2–3 files to confirm the diff is mechanical" (T6) was a weak check, and my first two attempts at a stronger one were also wrong.** `git diff -w` still reports changes (it ignores whitespace *amount*, not added line breaks); whitespace-stripping normalization flagged 34 of 35 files (Prettier legitimately *adds* trailing commas per the existing config); stripping parens too broke JSX `{…}` boundaries. The check that actually works is semantic, not textual: **`prettier(HEAD:file)` must equal the working-tree file** — verified 35/35. Lesson: to prove a mechanical transform is mechanical, re-run the transform on the input; don't try to normalize the output.
  - **A green guard proves nothing.** Both repaired guards passed immediately after repair. Only mutation showed they *bite* (changed event value / invariant inverted to `[...prev, projectId]`) and — the property the old forms lacked — **survive re-collapsing the source to one line**.

- **Approach delta:** Plan shape held (7 steps, decision + sweep + carve-outs). One unplanned sub-step: **T5a**, repairing two `?raw` guards the sweep exposed. That is squarely in scope — the plan named this exact risk in T5 and Out of scope — and repairing them (rather than deleting or reverting) left the suite stronger than before the sweep. T6 was executed *stronger* than written, per the wrong-assumption above. Net: 35 files reformatted, 3 carve-outs, 2 guards repaired + mutation-proven, config untouched, `1427/1427`.

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->
- [SURFACED-2026-08-01] T-out-of-scope — Nothing enforces `pnpm format:check`: no CI (`.github/workflows/` absent), no verify-auto gate, no `runtimes.md` entry. This is why 38 files drifted unnoticed across many milestones, and it means this repair will re-drift. Needs an enforcement decision (verify-auto gate? pre-commit hook? accept periodic sweeps?). Logged to `backlog.md` as `SURFACE-2026-08-01-NOTHING-ENFORCES-FORMAT-CHECK`.
- [SURFACED-2026-08-01] T5a — `SURFACE-2026-07-28-QUALITY-WP2-RAW-GUARDS-STILL-LOAD-BEARING` corroborated a **third** time (annotated in `backlog-quality-findings.md`, **not** resolved). The two guards that broke here are in *different* files from the two that finding names; those two (`workflowInviteCopy.test.ts`, `settingsPanelWiring.test.ts`) were verified at close to be untouched and still fragile (`slice(at` ×3, `escDismissTarget({` ×1). The finding's prediction is now empirical rather than anticipated: these guards rot on the first reformat that touches their target.

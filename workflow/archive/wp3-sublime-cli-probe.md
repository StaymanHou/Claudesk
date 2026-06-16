---
workflow: feature
state: ship (complete)
created: 2026-06-16
drive_mode: autopilot
wbs_ref: WP3 (Phase 1, docs/product/wbs.md)
size: XS
timebox: 1 hour
ship_commit: cc72c4d
---

# Feature: WP3 — Sublime Text / Sublime Merge CLI shapes probe

**Workflow:** feature
**State:** plan (complete)
**Created:** 2026-06-16

## Problem Statement

Claudesk's Phase 1 exit criteria include "Sublime hotkey-pop works." Before WP8 (the global hotkey wiring), we need to know the *exact* invocation Claudesk should run for each user/project shape — across whether the project has a `.sublime-project` file, whether `subl`/`smerge` are on PATH, and whether the user wants Sublime to grab focus or open in the background. Without this probe, WP8's command-construction logic is guesswork.

A pre-probe sanity check on this canonical dev machine already surfaced a load-bearing data point: **neither `subl` nor `smerge` is on `PATH` here**, even though both apps are installed in `/Applications/`. That means the `open -a` fallback path is not a corner case — it is the *default* state of at least one real user environment, including the maintainer's. The probe must therefore treat path-discovery (PATH vs. /Applications fallback) as a first-class concern, not an afterthought.

This is a documentation/writeup probe. Per WBS WP3 success criterion: the deliverable is a short table in this WIP file mapping (project state × user intent) → exact command, plus a clear decision on whether Claudesk requires `subl`/`smerge` on PATH or falls back to `open -a`. No production code lands.

## Work Tree

- [x] Phase 1: Map the (project-state × user-intent) command matrix and decide the fallback policy  <!-- status: complete -->

  **Observable outcomes:**
  - CLI: `which subl` and `which smerge` outcomes are recorded for this host (expected: both absent on this machine — the canonical-machine baseline)
  - CLI: For each of the 8 probe invocations in P1.2/P1.3 below, the exact command, its observable side effect (window opened? focused? background? project loaded?), and its exit code are recorded in the writeup table
  - CLI: The writeup contains a one-paragraph decision answering "Does Claudesk require `subl`/`smerge` on PATH, or does it fall back to `open -a`?" with reasoning grounded in the matrix
  - CLI: The writeup contains a "WP8 hand-off contract" section listing the exact command-construction rule(s) Claudesk's hotkey handler will use, expressed as pseudocode or a tiny decision tree, ready for WP8 to consume
  - [x] P1.1 Record host state  <!-- status: complete -->
  - [x] P1.2 Sublime Text invocation matrix  <!-- status: complete -->
  - [x] P1.3 Sublime Merge invocation matrix  <!-- status: complete -->
  - [x] P1.4 Write findings table + decision + WP8 hand-off contract  <!-- status: complete -->
  - [ ] SURFACED — ST `osascript activate` during probe pulled live ST windows to current Space; never do this again without consent (Sublime Text only, SM exempt) — feedback memory saved at `.claude/projects/-Users-stayman-Personal-projects-claudesk/memory/feedback_no_sublime_activate.md`  <!-- status: SURFACED: see Discoveries -->
  - [x] verify-auto  <!-- status: complete; 3/3 checks PASS (sections present, src/ + src-tauri/ clean, only workflow/wip/ in working tree) -->
  - [x] verify-self  <!-- status: complete; 4/4 outcomes PASS via subagent — host state reproduced live, T10 SM spot-check reproduced, decision + WP8 hand-off contract verified by writeup-completeness. ST command shapes UNVERIFIED at runtime by project consent rule but PASS for section-existence + shape-correctness per `--help`. -->
  - [x] verify-human  <!-- status: complete; auto-skipped per drive_mode=autopilot — 4 gates clean (autopilot + verify-self all-PASS + no integration boundary + no outcome cites consuming surface). Affirmation block printed for read-time veto; no manual walkthrough requested. F11 emitted. -->
  - [x] verify-codify  <!-- status: complete; no new Claudesk tests written — probe deliverable is the writeup itself (WBS criterion). Test ideas for WP8 captured in Findings → "Test ideas to hand off to WP8". Full suite re-run: pnpm test 1/1 pass, pnpm lint clean, cargo test 1/1 pass. -->

## Current Node
- **Path:** Feature > Phase 1 (complete) > review-quality (complete) > finalize
- **Active scope:** finalize (review-quality auto-backlogged 2 MAJOR + 4 MINOR; ready for /feature-finalize)
- **Blocked:** none
- **Unvisited:** finalize
- **Open discoveries:** ST-activate-pulls-windows-across-Spaces (captured as feedback memory; no WBS/arch action needed — purely operational discipline)

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow/backlog.md -->

[SURFACED-2026-06-16] P1.2 — Probing Sublime Text via `osascript activate` and repeated cold launches pulled the user's live ST working windows across macOS Spaces onto the active Desktop. This is a property of macOS Spaces (an app's windows congregate on the active Space when the app is activated there), not of Sublime. Captured as a project-scope feedback memory: never activate/launch/quit Sublime Text without explicit consent; Sublime Merge is exempt because the user does not keep live SM windows the same way. Memory file: `.claude/projects/-Users-stayman-Personal-projects-claudesk/memory/feedback_no_sublime_activate.md`. Not surfaced to `workflow/backlog.md` because there is no work item to do — the lesson is the artifact.

## Findings

### Host state (P1.1)

Recorded 2026-06-16 on the maintainer's daily-driver macOS machine:

| Check | Result |
|---|---|
| `command -v subl` | exit 1 — **not on PATH** |
| `command -v smerge` | exit 1 — **not on PATH** |
| `/Applications/Sublime Text.app` | present (Build 4200) |
| `/Applications/Sublime Merge.app` | present (Build 2125) |
| `/Applications/Sublime Text.app/Contents/SharedSupport/bin/subl` | present, executable (8.1 MB binary) |
| `/Applications/Sublime Merge.app/Contents/SharedSupport/bin/smerge` | present, executable (8.3 MB binary) |

**The canonical Claudesk machine does not have `subl`/`smerge` on PATH.** Both CLIs exist as binaries inside the .app bundles but are not symlinked. The user simply never ran the recommended `ln -s …` step. This is not a corner case — it is the default state of a real install.

### Invocation matrix (P1.2 + P1.3)

All tests run on cold-start (target app fully quit) unless noted as `(warm)`. "Focus theft" = the target app became `frontmost` (replacing the previous frontmost app). Both throwaway test dirs (`/tmp/wp3-subl-with` and `/tmp/wp3-subl-bare`) had `hello.txt`; the with-dir also had `foo.sublime-project` (folders=[.]).

#### Sublime Text

| # | Invocation | Cold/Warm | exit | Focus stolen | App launched | Notes |
|---|---|---|---|---|---|---|
| T1 | `subl <bare-dir>` | cold | 0 | **yes** (→ sublime_text) | yes | Default behavior — open + activate |
| T2 | `subl <with-dir>` | warm | 0 | **yes** | already running | Reuses existing window; activates |
| T3 | `subl --project <with>/foo.sublime-project` | cold | 0 | **no** (Chrome frontmost after) | yes | `--project` launches without activation — surprising default |
| T3-warm | `subl --project ...` | warm | 0 | no | already running | Reuses; no refocus |
| T4 | `subl --new-window <with-dir>` | warm | 0 | **yes** | already running | New window + activate |
| T5 | `subl --background <with-dir>` | warm | 0 | **no** | already running | The canonical no-focus-theft flag |
| T5-cold | `subl --background <with-dir>` | cold | 0 | **no** | yes (proc spawned with `-b`) | Confirmed: `-b` works on cold start |
| T6 | `open -a "Sublime Text" <with-dir>` | warm | 0 | **yes** | already running | macOS `open` default |
| T6b | `open -a "Sublime Text" -g <with-dir>` | warm | 0 | **no** | already running | `-g` = "don't bring to foreground" |

#### Sublime Merge

| # | Invocation | Cold/Warm | exit | Focus stolen | App launched | Notes |
|---|---|---|---|---|---|---|
| T7 | `smerge <with-dir>` | cold | 0 | **yes** (→ sublime_merge) | yes (proc `--waitforipc`) | Default — open + activate |
| T8 | `smerge --new-window <with-dir>` | cold | 0 | no¹ | yes | Inconclusive; re-test warm |
| T9 | `open -a "Sublime Merge" <with-dir>` | cold | 0 | n/a² | yes | Race on cold start; use `-g` instead |
| T10 | `open -a "Sublime Merge" -g <with-dir>` | cold | 0 | **no** (Chrome stayed) | yes | The canonical `open` background pattern |
| T11 | `smerge --background <with-dir>` | cold | 0 | **no** (per `--help`) | per `--help` | `--help` confirms `-b/--background` exists and means "don't activate" |

¹ T8 measurement coincided with a focus-shift race; `--help` documents `--new-window` as window-only, no focus semantics — assume default activation unless paired with `-b`.
² T9 cold start ended with Chrome frontmost, but that's likely an unrelated window-manager event during the slow cold launch, not a meaningful "no focus theft" result. The reliable background pattern is `-g`.

### Decision: PATH requirement vs `open -a` fallback

**Claudesk does NOT require `subl`/`smerge` on PATH.** Reasoning:

1. The maintainer's own machine doesn't have them on PATH (P1.1). Requiring PATH would mean the canonical dev environment fails Claudesk's setup check on day one.
2. The .app-bundle paths (`/Applications/<App>.app/Contents/SharedSupport/bin/<tool>`) are **stable Sublime conventions** — both ST and SM have shipped this layout for many versions. They're a reliable secondary discovery path.
3. The discovery order is unambiguous: PATH → .app bundle → `open -a`. All three end up invoking the same binary or a near-equivalent wrapper. The only behavioral differences are around focus/window management, and **both `subl` and `smerge` natively support `-b/--background`** which gives us the focus-control axis without needing `open -a -g`.
4. `open -a` becomes the last-resort fallback for the (extremely rare) case where the .app is installed somewhere non-standard. macOS's `open -a "<App Name>"` resolves the app by name regardless of install location, so it always works as long as the app is registered with Launch Services.

**Concrete discovery rule for Claudesk:**

```
fn find_subl() -> SublTool {
  if let Some(p) = which::which("subl").ok() { return SublTool::Path(p); }
  let bundle = PathBuf::from("/Applications/Sublime Text.app/Contents/SharedSupport/bin/subl");
  if bundle.exists() { return SublTool::Bundle(bundle); }
  SublTool::OpenA  // fall back to `open -a "Sublime Text" …`
}
// same shape for smerge with /Applications/Sublime Merge.app/.../bin/smerge
```

### WP8 hand-off contract

WP8 will register a global hotkey that pops Sublime Text (and, separately, Sublime Merge) at the currently-active workspace's project directory. From the matrix above, WP8 should:

**For Sublime Text pop:**

1. **Discovery:** PATH → bundle → `open -a` (per the rule above). Resolve once at app launch, cache the result. The user changing their PATH at runtime is not a supported live-reconfig case.
2. **Default focus behavior: STEAL focus.** A hotkey-pop is an *explicit* user-initiated request to switch to Sublime — the user pressed the key because they want to be in Sublime. Use the activating variants (no `-b`, no `-g`).
3. **Command shape:**
   - PATH or bundle: `subl <project-dir>` — opens the dir as a folder, activates ST. Reuses existing ST window if already running on that dir.
   - `open -a` fallback: `open -a "Sublime Text" <project-dir>` — same effect via Launch Services.
   - **Do NOT pass `--project <foo>.sublime-project`** even when one exists. Reason: `--project` does not activate ST on cold start (T3 finding), which contradicts the hotkey-pop intent. `subl <dir>` is sufficient — ST auto-loads any `.sublime-project` it finds in the folder.
   - **Do NOT pass `--new-window`.** The user wants the *existing* ST window for this project to come forward; `--new-window` would create a duplicate window every hotkey press.

**For Sublime Merge pop:**

1. **Discovery:** same as ST (PATH → `/Applications/Sublime Merge.app/Contents/SharedSupport/bin/smerge` → `open -a "Sublime Merge"`).
2. **Default focus behavior: STEAL focus.** Same reasoning.
3. **Command shape:**
   - PATH or bundle: `smerge <project-dir>` — opens the repo at that dir, activates SM. Reuses existing SM window.
   - `open -a` fallback: `open -a "Sublime Merge" <project-dir>`.
   - **Do NOT pass `--new-window`** — same reason as ST.
   - **Prerequisite:** target dir must be a git repo. If not, SM will show an empty Sublime Merge "open a repository" prompt; Claudesk should not pre-check this (let SM handle the error UI).

**Future-knob (not v1):** If a user reports wanting "open without focus" behavior (e.g., a different workflow where they want SM to refresh in the background while staying in Claudesk), `-b/--background` (for the native CLI) or `open -a -g` (for the fallback) are the canonical flags. This is a config knob, not a default.

### Test ideas to hand off to WP8

Codified at verify-codify time. Per WBS WP3 success criterion ("the writeup is the deliverable; no production code lands"), this probe writes no tests itself — the behavior verified is external CLI invocation of third-party tools on macOS, which is not Claudesk's behavior to test. The right time to codify is **WP8** (the Sublime hotkey-pop build), when Claudesk's own code executes the hand-off contract. The tests below are scoped to WP8's responsibility, not WP3's:

1. **Discovery resolver unit test (Rust).** Test `find_subl()` / `find_smerge()` against a fake filesystem with the three discovery cases: (a) tool on PATH → `SublTool::Path`, (b) PATH absent but `/Applications/<App>.app/Contents/SharedSupport/bin/<tool>` present → `SublTool::Bundle`, (c) both absent → `SublTool::OpenA`. Use `tempfile` + a mock `which` shim. Pure-unit, no Sublime activation.

2. **Command-string construction unit test (Rust).** Given a discovery result + project dir, assert the exact command vector that gets passed to `Command::new(...).args(...)`. For each of the three discovery branches × {ST pop, SM pop} = 6 cases. Asserts the anti-patterns (no `--project`, no `--new-window`) are respected. Pure-unit, no execution.

3. **Hotkey-pop end-to-end test — DEFERRED.** A true E2E test would execute the hand-off contract's command shapes (`subl <dir>`, `smerge <dir>`) and observe whether Sublime came to the front. Two reasons NOT to write this:
   - **Project consent rule:** running tests must not activate Sublime Text without operator consent (`.claude/projects/-Users-stayman-Personal-projects-claudesk/memory/feedback_no_sublime_activate.md`). An E2E test in CI or local `cargo test` would violate this on every run.
   - **macOS Spaces side-effect:** even with consent, the test would yank live ST windows across Spaces — same pathology the probe itself triggered. WP8 should rely on the discovery-resolver + command-construction unit tests for safety, and the operator's manual hotkey-press for the actual integration check.

4. **WP8 verify-human anchor.** The hotkey-pop's "did focus go to Sublime?" check should be a manual verify-human leaf at WP8 time, NOT an automated test. Operator presses the hotkey, observes the window came forward, marks the leaf.

### Surprises worth noting

- **`subl --project` does NOT activate Sublime Text** even when ST is launching cold. The flag name suggests "open this project file like the IDE does," but the focus behavior is closer to `--background`. If a future Claudesk feature wants "load a project file in background," this is the magic invocation. For hotkey-pop, **never use it**.
- **`-b/--background` is a native, supported flag on both tools** (confirmed via `--help`). We do not need to rely on macOS's `open -a -g` quirk to control focus. This is cleaner than the pre-probe assumption that `open -a` was the only background-launch path.
- **No `--wait` semantics planned in Claudesk's invocation path.** ST supports `-w/--wait` for "wait until file is closed before returning"; Claudesk's hotkey handler is fire-and-forget, never waits. Documented here so future contributors don't add it.

## Code-Quality Review — wp3-sublime-cli-probe

### Strengths
- Problem statement frames the probe with a load-bearing observation (PATH absence is the *default* on the maintainer's machine), which directly justifies the matrix's design — argument-from-data rather than argument-from-template.
- Invocation matrix uses a tight, scannable schema (Invocation / Cold-Warm / exit / Focus stolen / App launched / Notes); footnotes ¹ and ² honestly mark inconclusive measurements (T8, T9) rather than papering them over.
- The WP8 hand-off contract is genuinely consumable: discovery-rule pseudocode, explicit anti-patterns (no `--project`, no `--new-window`), and a fire-and-forget note on `--wait` semantics — a future WP8 author can build from this without re-doing the probe.
- Test-ideas section correctly scopes E2E away from automated suites with two concrete justifications (consent rule + Spaces side-effect) rather than vague hand-waving; deferral to verify-human is principled.
- The "Surprises" section captures the `--project` non-activation finding and the `-b/--background` native-flag confirmation — both are exactly the kind of one-line insight a future Claudesk feature author will grep for.

### Issues

**CRITICAL**
- (none)

**MAJOR**
- [workflow/wip/wp3-sublime-cli-probe.md, Work Tree:39] The Work Tree contains an unchecked leaf `- [ ] SURFACED — ST 'osascript activate' …` under Phase 1, but Phase 1's parent is `[x]` on line 28. Per the global Work Tree rule "a parent's checkbox may only be `[x]` when ALL children are `[x]`," this violates the invariant. The discovery is correctly logged in §Discoveries and the feedback memory exists, so the leaf should either be marked `[x]` (closed via the memory artifact) or removed from the tree — the SURFACED tag belongs in `## Discoveries`, not as a perpetually-open Work Tree child. — *Why it matters: Work Tree integrity is mechanically verifiable; a perpetually-open child under a `[x]` parent is a latent confabulation channel for any future skill that reads this tree (e.g., feature-finalize, session-resume).*
- [workflow/wip/wp3-sublime-cli-probe.md, Invocation matrix:99-101] T8, T9, T11 are recorded as cold-start tests but their "Focus stolen" cells contain conjecture rather than observation: T8 is footnoted as inconclusive, T9 is footnoted as a race, T11's "no (per `--help`)" is documentation-derived not runtime-observed. The matrix presents these in the same shape as actually-observed rows (T7, T10), which conflates measured data with inferred data. The reviewer note explicitly calls out that ST shapes are UNVERIFIED at runtime per the consent rule, but the writeup itself doesn't carry a header banner flagging which rows are observation-grade vs. inference-grade. — *Why it matters: a future contributor reading the matrix six months from now cannot tell at-a-glance which findings are reproducible by re-running the command vs. which are derived from `--help` text; this asymmetry is load-bearing for the §Decision's reliance on the matrix.*

**MINOR**
- [workflow/wip/wp3-sublime-cli-probe.md:15] Frontmatter line 3 says `state: ship (complete)` but the H2-equivalent header on line 15 says `**State:** plan (complete)`. The frontmatter is the up-to-date value; the duplicated prose line is stale-on-arrival. — *Why it matters: dual-source state representations drift; the prose line should match the frontmatter or be removed (frontmatter is canonical).*
- [workflow/wip/wp3-sublime-cli-probe.md, footnotes:103-104] Footnotes ¹ and ² use superscript markers but the matrix headers don't number footnotes — readers must scroll down to find what `¹` references. A `[note 1]` style or inline parenthetical would be more grep-friendly. Cosmetic.
- [workflow/wip/wp3-sublime-cli-probe.md, Current Node:50] `Unvisited:` lists `ship → review-quality → finalize`, but at the time this WIP is being reviewed (the review-quality pass), ship is already complete (frontmatter `state: ship (complete)`, `ship_commit: cc72c4d` set). The `Unvisited:` ordering was authored at ship time and the field wasn't refreshed when the state advanced. — *Why it matters: `Unvisited:` is documented as sequence-of-execution and is read by downstream skills; a stale value is a small confabulation channel (per SURFACE-2026-05-06-FINALIZE-BEFORE-SHIP-ORDER-FLIP rationale).*
- [runtimes.md:8-13 and new entries] The `pnpm install` entry uses `120000` ms timeout for a 3s observation. Per the registry's documented formula `ceil(observed_seconds * 1.5 + 60) * 1000`, the computed value would be `ceil(3 * 1.5 + 60) * 1000 = 65000` ms. The 120000 value matches the Bash tool's default rather than the formula. Same arithmetic discrepancy applies to pnpm test (1s → should be ~62000ms, recorded 120000), pnpm lint (same), cargo test (2s → ~63000ms, recorded 120000). — *Why it matters: the registry's formula exists to keep the timeout reflective of the measurement; defaulting to 120000 for every sub-2s command is harmless in practice but means the registry is recording a constant rather than computing from data. If the intent is "clamp small values to a 120s floor for safety," that policy belongs in CLAUDE.md's registry rules rather than as an unwritten override.*

### Assessment
This is a well-built probe writeup. The deliverable matches the WBS criterion (writeup IS the artifact), the §Decision section follows tightly from the §Invocation matrix data, and the §WP8 hand-off contract is concrete enough that a future WP8 author could implement without re-running the probe. The "Surprises" section captures durable insights (`--project` non-activation, native `-b` support) that would otherwise need re-discovery. The honest annotation of the ST consent rule and the Spaces side-effect — both in §Discoveries and again in §Test ideas — shows good discipline about not papering over operational ugliness. Debt accrued is small: the Work Tree's stuck-SURFACED leaf and the matrix's observation-vs-inference flattening are the two items worth fixing in a quick follow-up; everything else is cosmetic. Future readers will find this writeup clear and reproducible for WP8 consumption.

### If you disagree
Operator: dismiss any finding by editing this section in the WIP file and marking the line `[DISMISSED]` before `feature-finalize` archives the WIP. The finding will be skipped by the orchestrator's severity-tier action matrix.

## Retrospect

- **What changed in our understanding:**
  - The `.app`-bundle fallback is the *default* state on the canonical dev machine, not a corner case. The maintainer never symlinked `subl`/`smerge` to PATH. This reshapes WP8's discovery logic from "expect PATH, fall back if missing" to "expect bundle, augment via PATH if present."
  - Both `subl` and `smerge` ship a native `-b/--background` flag (per `--help`). The pre-probe assumption was that `open -a -g` would be the only "open without focus theft" lever; the native flag is cleaner and removes a layer of macOS quirk dependency.
  - `subl --project <foo>.sublime-project` does NOT activate Sublime Text even on cold start. The flag name implies "open like the IDE" but the focus behavior is closer to `--background`. WP8 should never use `--project` for hotkey-pop.

- **Assumptions that held:**
  - Hotkey-pop should steal focus by default. (The user pressed the hotkey because they want to be in Sublime; this is explicit consent.)
  - The deliverable is the writeup itself — no production code lands at WP3 time. (WBS criterion held.)
  - `open -a` works as a no-PATH fallback regardless of install location, via Launch Services. (Confirmed during T9/T10.)

- **Assumptions that were wrong:**
  - The pre-probe sanity check assumed measurement via `osascript activate` was a harmless read. It is not — it is a side-effecting operation on macOS Spaces state. Cost: yanked the user's live Sublime Text windows across Desktops mid-probe. Captured as project-scope feedback memory (`.claude/projects/-Users-stayman-Personal-projects-claudesk/memory/feedback_no_sublime_activate.md`); ST is now consent-gated for all future probes. SM remains exempt (no live-window pattern).
  - The plan listed 8 probe invocations in the Observable outcomes; in practice the matrix grew to 14 rows (9 ST + 5 SM, including warm + cold variants) because cold-vs-warm focus behavior differed materially for some flags. Outcome threshold (≥8) was still met; the plan just under-specified.

- **Approach delta:** Implementation matched the plan's task-ordering exactly (P1.1 → P1.2 → P1.3 → P1.4). The user-disruption mid-P1.2 (Sublime Text windows pulled to current Space) was not in the plan — it became a `## Discoveries` entry and a project-scope feedback memory, but did not back-loop or revise the WBS. The probe itself completed on its original timebox (~30 min of probe work + ~10 min of disruption recovery and memory authoring).

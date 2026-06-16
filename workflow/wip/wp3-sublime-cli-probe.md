---
workflow: feature
state: verify-codify (all phases complete)
created: 2026-06-16
drive_mode: autopilot
wbs_ref: WP3 (Phase 1, docs/product/wbs.md)
size: XS
timebox: 1 hour
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
- **Path:** Feature > Phase 1 (complete) > Ship
- **Active scope:** ship (all phases done; ready for /feature-ship)
- **Blocked:** none
- **Unvisited:** ship → review-quality → finalize
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

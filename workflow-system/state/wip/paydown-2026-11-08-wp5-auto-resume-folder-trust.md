---
drive_mode: autopilot
---

# Feature: Auto-resume vs CC's folder-trust prompt (paydown 2026-11-08 WP5)

**Workflow:** feature
**State:** ship (complete)
**Created:** 2026-11-09
**Source:** `workflow-system/product/backlog-paydown-wbs.md` → WP5 (ruling R1 + default D4)
**Resolves:** `SURFACE-2026-11-03-AUTO-RESUME-FIRES-INTO-THE-FOLDER-TRUST-PROMPT`

## Problem Statement

When a never-trusted folder that holds a `workflow-system/state/.session.md` opens as a
workspace, the auto-resume inject arm types `/session-restore\r` 1500 ms after spawn. CC is
then sitting on its "Quick safety check … trust this folder?" dialog, whose default is
"No, exit", so the `\r` exits CC and the session is lost. Ruling R1: before the inject fires,
read CC's own trust record for the workspace's **live profile**; if the folder is not trusted,
do not fire, and keep the picker's announcement honest so the operator runs the command by
hand. D4: any doubt (missing/unreadable file, absent key, a value other than `true`) withholds.


Problem statement unchanged (2026-11-09, F12 re-entry for P2.verify-human.1) — the operator approved
the honest-announcement behaviour and the hidden `⊘`; only the badge's glyph was rejected as reading
like a broken box. Same problem, a presentation fix.

## Probe outcomes (plan time, 2026-11-09, CC 2.1.319) — do NOT re-derive

Measured with a PTY probe (`trust_probe.py` in the session scratchpad: spawns `claude` with the
Claude/Claudesk env markers stripped, `CLAUDE_CONFIG_DIR` set, reads 6–8 s of output, greps for
"Quick safety check"). All runs on the verification profile `~/.config/claude-original-dev`
(backed up first; restored and `shasum`-verified identical afterwards).

1. **File location.** Default profile (no `CLAUDE_CONFIG_DIR`): **`$HOME/.claude.json`**, a
   SIBLING of `~/.claude/`, NOT inside it (`~/.claude/.claude.json` does not exist). A listed
   profile: `<config_dir>/.claude.json` (present for `claude-original`, `claude-3d`,
   `claude-original-dev`). ⚠️ So the trust file is NOT `config_root.join(".claude.json")` for
   the default profile: `transcript::default_config_root` is `~/.claude`, and joining onto it
   reads a file that does not exist, which D4 turns into a silent permanent withhold.
2. **Key format.** `projects` keys are absolute **physical** paths, no trailing slash (the
   default file has `/private/tmp/...` keys and zero `/tmp/...` keys; 0 of 70 keys end in `/`).
3. **⚠️ CC trusts by ANCESTOR WALK, not exact key.** Results:
   | cwd | trust record | prompt? |
   |---|---|---|
   | `claudesk-scratch/scratch-a` | no self/ancestor `true` | **PROMPT** (positive control) |
   | `claudesk/tmp/scratch/scratch-a` | exact key `true` | none |
   | `…/scratch-a/probe-child` (new dir) | parent `true`, no own key | **none** |
   | `…/probe-child` with own key `false` | own `false`, parent `true` | **none** |
   | `…/probe-child` | own `false`, parent `false`, repo root `true` | **none** |
   | symlink in scratchpad → trusted dir | reached through the link | none (CC resolves realpath) |

   **Rule: trusted ⇔ `canonicalize(cwd)` or ANY ancestor has `hasTrustDialogAccepted === true`.**
   A nearer `false` does NOT override a farther `true`. An exact-key lookup would wrongly
   withhold any project nested under a trusted folder (safe direction, but a real regression in
   UX for e.g. everything under a trusted `~/Work/...`).
4. **Side fact:** CC writes its `projects` entry keyed by the **git root**, not the cwd (running
   in `claudesk/tmp/scratch/scratch-a/probe-child` created a `/Users/…/claudesk` key with
   `false`, and no `probe-child` key). Irrelevant to the read rule above (the walk covers it),
   recorded so nobody "fixes" the read to look up the git root instead.
5. **The inject arm only exists for DEFAULT-profile rows** (`announce_actions` →
   `workflow_applicable(gate, project.profile)` is false for any named profile, F-b ruling 4).
   The live-profile resolution is still done properly (R1 says live profile; a `turn-respawn`
   or a future arm must not inherit a hard-coded `~/.claude.json`), but every live verify of
   the inject arm necessarily runs on the operator's real `$HOME/.claude.json`.

## Design decisions (plan time; operator-visible ones are Alignment questions below)

- **Rust does file IO and answers one boolean** (in the spirit of M15 R-4). New module
  `src-tauri/src/folder_trust/`: pure `is_trusted(claude_json: &str, physical: &Path) -> bool`
  (ancestor walk, strict `== Some(true)`), pure `claude_json_path(home, resolved)`, and a sync
  `#[tauri::command] folder_trusted(project_path, pty_session_id) -> bool`. Profile resolution
  REUSES `transcript::commands::{config_root_for_project, live_or_stored_reference}` logic (live
  session's profile wins over the stored row) — refactor the shared part to be callable rather
  than copying it. Any error → `false` (D4).
- **The gate funnels through the existing `shouldInject`.** `FireInputs` gains `trusted:
  boolean`; `shouldInject` returns false unless `trusted`. No second check beside it. The
  XtermPane timer becomes: wait `FIRE_DELAY_MS` → `await readFolderTrust(...)` → re-check
  `cancelled` AFTER the await (via `shouldInject`) → inject. The trust read happens at FIRE
  time, so a trust accepted inside the 1500 ms window fires correctly.
- **The frontend wrapper `readFolderTrust` catches every rejection → `false`** (D4; a Tauri
  rejection with no handler vanishes silently — the WP6 picker MAJOR).
- **Announcement (Phase 2):** the batch `picker_announce_actions` reads trust for
  restore-arm rows (default profile only, so one `$HOME/.claude.json` read per picker open, done
  once, not per row) and returns a new wire value `"restore-manual"` for an untrusted folder.
  `actionFromAnnounced("restore-manual")` maps to the SAME inject action (the fire-time read
  stays the authority; the announcement is a prediction). `rowAffordances` renders the command
  with a "type it after trusting the folder" qualifier and **hides the `⊘` door** for that row,
  because both doors then do the same thing (the module's own "label and door appear together
  only when they differ" invariant).

## Work Tree

- [x] Phase 1: Trust read + fire gate (the safety fix)  <!-- status: done 2026-11-09 -->
  **Observable outcomes:**
  - CLI: `cargo test folder_trust` → each probe-table row above is a passing unit case (exact
    `true`; child of `true` with no key; own `false` under ancestor `true`; no `true` anywhere →
    false; `"true"` string / `1` / absent field → false; malformed JSON → false; missing file →
    false), plus `claude_json_path` → `<home>/.claude.json` for the default profile and
    `<config_dir>/.claude.json` for a listed one, and `None`/false for an unlisted profile.
  - CLI: `vitest` → `shouldInject` returns false for `{action: inject, cancelled: false,
    trusted: false}` and true only for `{inject, false, true}`; `readFolderTrust` resolves
    `false` when the mocked `invoke` rejects.
  - CLI: mutation proof, each INDIVIDUALLY, landing confirmed with `sed -n`: (a) drop the
    `trusted` term from `shouldInject` → a test fails; (b) replace the ancestor walk with an
    exact-key lookup → the child-of-trusted case fails; (c) `== Some(true)` → `.is_some()` →
    the explicit-`false` case fails; (d) default-profile path → `config_root.join(".claude.json")`
    → the path case fails; (e) in XtermPane, inject without awaiting the trust read → a caller
    test (or a `?raw` ORDERING guard: index of the trust read < index of `injectCommand` inside
    the timer, comments stripped) fails.
  - CLI: `pnpm verify:auto` exits 0 (timeout from `runtimes.md`).
  - Browser (dev build via the `tauri` MCP bridge, agent-launched with the full Claude-marker
    `env -u` strip; state-changing, project-local fixture only: writes a `.session.md` into
    `../claudesk-scratch/scratch-a`, removed afterwards): open `scratch-a` (never trusted, no
    trusted ancestor in `$HOME/.claude.json`) from its picker row → after ≥5 s, the CC
    process is still alive (`ps` shows the `claude` child of that session), `cc_input` was NOT
    invoked for that session (positive-controlled IPC capture), and a screenshot of the pane
    shows the trust dialog still up.
  - Browser (positive control, no state change to `~/.claude.json`): open a project that IS
    trusted (exact key or via ancestor; e.g. a fixture under an already-trusted path such as
    `claudesk/tmp/scratch/…`, registered in the dev build's project list) holding a
    `.session.md` → `/session-restore` is injected and executes (transcript shows the
    `<command-name>/session-restore` turn — execution-side evidence, not just typing).
  - CLI (observation, not a fix): with an unclean flag set on an untrusted folder that HAS a
    transcript, does `--continue` survive the trust dialog? Record the answer in this WIP; out
    of scope to change.
  - Browser (observation, not a fix): reproduce the original side observation — after the
    trust-dialog exit, does the workspace header show `↻ will continue`, and does it persist
    across close/reopen? If real and separate, file a new SURFACE.
  **Alignment questions:**
  - Withholding on an untrusted folder in action: open `scratch-a` yourself — CC sits at the
    trust prompt, nothing is typed, and you run `/session-restore` by hand after trusting. Still
    what you want (vs. e.g. Claudesk offering to fire it once you trust)?
  - [x] P1.1 Rust `folder_trust` module: `claude_json_path`, `is_trusted` (canonicalize →
        ancestor walk → strict `true`), unit tests mirroring the probe table  <!-- status: done -->
  - [x] P1.2 Extract the shared live-or-stored profile resolution out of `transcript/commands.rs`
        so `folder_trusted` reuses it; register the `folder_trusted` command in `lib.rs`  <!-- status: done -->
  - [x] P1.3 Frontend: `readFolderTrust(projectPath, sessionId)` IPC wrapper (rejection → false);
        `FireInputs.trusted` + `shouldInject` term; update `autoResumeFire.test.ts`  <!-- status: done -->
  - [x] P1.4 XtermPane timer: await the trust read, then `shouldInject` (re-checks `cancelled`
        after the await), then inject; a caller-level guard that the read precedes the inject  <!-- status: done -->
  - [x] P1.5 Update the `autoResumeFire.ts` header + XtermPane fire comment to state the trust
        term and the probe facts (file location, ancestor walk) in one place, cited by symbol  <!-- status: done -->
  - [x] verify-auto  <!-- status: done -->
    — evidence: `pnpm verify:auto` → EXIT=0 (49 s): eslint 0 errors (1 pre-existing warning at
      XtermPane `useEffect` spread deps, present at HEAD too), vitest 296 files / 3838 tests,
      cargo fmt + clippy `-D warnings` clean, cargo test 1097 lib + integration all ok.
    — first run FAILED twice, both fixed in build scope: (1) `cargo fmt --check` on the new
      `folder_trust/mod.rs` tests; (2) `hook_install::…::profile_callers_route_through_the_tested_bodies`
      pinned the deleted `config_root_for_project` call. Re-pointed at `live_config_target` +
      `transcript_root`, and extended to `folder_trusted` → `claude_json_path(&home,&target)`.
      ⚠️ Root cause of its first post-fix failure: a top-level `#[cfg(test)] use` in
      `transcript/commands.rs` truncated the guard's "production text" (everything before the
      first `#[cfg(test)]`) to the imports, which would have made its NEGATIVE assertion pass
      vacuously. Moved the import into `mod tests`. Guard mutation-proven: g1 (transcript_tail
      back to `~/.claude`) and g2 (folder_trusted bypassing `claude_json_path`) both FAIL it.
  - [x] verify-self  <!-- status: done -->
    Driven by the orchestrator over the `tauri` MCP bridge (dev build `pnpm tauri:dev` launched with
    the full Claude-marker `env -u` strip, PID 35493). The runner subagent was NOT spawned: the bridge
    tools are not exposed to subagents (memory `mcp-bridge-tools-not-exposed-to-subagents`), so it
    could only have fallen back to bare Vite. Declared fixtures: dev `projects.json` (backed up)
    gained default-profile rows `claudesk-scratch/restore-test` (never trusted, no trusted ancestor,
    its own `.session.md` + `reset.sh`) and `claudesk/tmp/scratch/wp5-trusted` (a copy, trusted ONLY
    via the ancestor `claudesk` = `true`). Both picker rows announced `↻ /session-restore`.
    - [x] Unit/mutation/gate outcomes — evidence: see verify-auto + Build notes (all green, 9+2 mutants killed).
    - [x] Untrusted open withholds, CC survives — evidence: opened `restore-test` row (×2). 2nd open
      with a self-tested `console.warn` tap (positive check `tap-check` captured): at +1688 ms the tap
      caught `auto-resume: /session-restore withheld for …/claudesk-scratch/restore-test — Claude Code
      has not trusted this folder yet`; CC child PID 38285 (ppid 35493, cwd restore-test) alive at
      +8 s and later; the pane's xterm BUFFER (read via the React fiber's `termRef`, not the DOM)
      ends `❯ No, exit / Yes, I trust this folder / Enter to confirm · Esc to cancel` — unanswered.
      First open: same buffer, CC PID 36472 alive at +13 s. `.session.md` still present (not consumed).
    - [x] Trusted positive control fires and EXECUTES — evidence: opened `wp5-trusted` (trusted only
      via ancestor walk): transcript `~/.claude/projects/-Users-stayman-Personal-projects-claudesk-tmp-scratch-wp5-trusted/b795d60e-….jsonl`
      contains `<command-name>/session-restore</command-name>`; warn tap recorded NO withhold line.
      This also proves the timer path runs in this build, so the untrusted silence is not a dead timer.
    - [x] ⚠️ Instrument note: `ipc_monitor` + `ipc_get_captured` returned `[]` even though `cc_spawn`
      certainly ran — an uncontrolled capture, so it was NOT used as "no `cc_input` happened"
      evidence (caveat: never conclude no-IPC from a tap without a positive control). The warn tap +
      CC-alive + buffer + the trusted control replace it.
    - [x] `--continue` observation — not reachable in practice: a never-trusted folder has no
      transcript under the same config root (`restore-test` has no `~/.claude/projects/…` dir), and
      `cc_session` → `guard_continue_against_transcripts` drops `--continue` when there is none. Only
      reachable if `.claude.json` were reset while transcripts survived. Not probed; out of scope.
    - [x] Side observation (`↻ will continue`) — REPRODUCED, explained, filed as
      `SURFACE-2026-11-09-NEXT-OPEN-INDICATOR-PREDICTS-CONTINUE-WITH-NO-TRANSCRIPT`: the header shows on
      opening `restore-test`, before any exit. The flag is set at spawn by design, but the indicator
      does not apply the spawn's transcript guard, so it predicts a `--continue` that will be dropped
      (and it displaces the `/session-restore` arm). Separate from WP5.
    - [x] align: "Withholding on an untrusted folder in action" — evidence CAPTURED (no judgment): the
      buffer text and warn line above; the dev app is left running with `restore-test` open at the
      trust dialog for the operator to look at.
  - [x] verify-human  <!-- status: done; operator approved 2026-11-09 -->
    - [x] P1.verify-human.1: Withholding on an untrusted folder in action (main happy path, kind a) — open an untrusted folder holding a `.session.md`; CC sits at the trust prompt, nothing is typed, you run `/session-restore` by hand after trusting. Still what you want?  <!-- status: done — operator: "ok" -->
  - [x] verify-codify  <!-- status: done -->
    Test scope: full — suite not long (`runtimes.md` → `pnpm verify:auto` Last 49s)
    — evidence: `pnpm verify:auto` → EXIT=0 (65 s), vitest 297 files / 3843 tests, cargo all ok.
    — Integration boundary: YES (XtermPane's spawn effect, the existing CC pane). New consuming-surface
      test `src/components/workspace/__tests__/autoResumeFireLive.test.tsx` mounts the REAL
      `XtermPane` under jsdom (only `@xterm/*`, `ResizeObserver`, rAF faked) against `mockIPC` and runs
      its real spawn effect: trusted → `cc_input` with `/session-restore\r` into the spawned session;
      `folder_trusted` asked with `{projectPath, ptySessionId}` AFTER `cc_spawn` and BEFORE `cc_input`;
      untrusted and a non-boolean answer → no `cc_input` (non-vacuous: `folder_trusted` was asked);
      no action → no trust read. First mount of the real pane in a test (the shared harness stubs it).
      Mutation-proven: h1 (pane passes `projectPath: sessionId`), h2 (trust term dropped), h3
      (`readFolderTrust` accepts any non-`false`) each FAIL it. The behavior covered elsewhere (unit
      `is_trusted` cases, `fireAutoResume` sequence, caller guards) was not duplicated.


- [x] Phase 2: Honest picker announcement for an untrusted folder  <!-- status: done 2026-11-09 -->
  **Relevance check (before Phase 2):**
  - Requester still needs this: yes — the operator approved Phase 1 with this phase's wording on the table
  - Requirements unchanged: yes — R1 ("the command is stated, and nothing is typed")
  - Solution still feasible: yes — the announce batch already reads per-row state
  - No superior alternative discovered: yes
  **Verdict:** proceed
  **Observable outcomes:**
  - CLI: `cargo test announce` → a default-profile row with `.session.md` in an untrusted
    folder yields `"restore-manual"`; a trusted one yields `"restore"`; the unclean arm still
    yields `"continue"` regardless of trust; the gate-OFF and named-profile rows still do NO
    `.claude.json` read (assert via an injected reader that records calls, like the existing
    no-project-dir-IO property).
  - CLI: `vitest` → `actionFromAnnounced("restore-manual")` is the inject action;
    `rowAffordances` for `"restore-manual"` returns the announcement with the manual qualifier
    and `showNoFireDoor: false`; for `"restore"` it is unchanged (byte-identical label, door shown).
  - CLI: the TS `AnnouncedAction` union and Rust's action constants agree (extend the existing
    wire-vocabulary pin; mutation: delete the Rust constant → a test fails).
  - Browser (dev build, MCP bridge; same declared `scratch-a` `.session.md` fixture): the
    picker row for `scratch-a` shows the manual-qualified announcement and no `⊘` button
    (DOM read, deferred a frame); the trusted positive-control row shows the plain
    `↻ /session-restore` and its `⊘`.
  - CLI: `pnpm verify:auto` exits 0.
  **Alignment questions:**
  - (decision) The untrusted-row wording: the plan's default is `↻ /session-restore` plus a
    muted "type after trusting folder" qualifier, tooltip "Claude Code will ask whether to trust
    this folder first, so Claudesk will not type /session-restore — run it yourself after
    trusting." Screenshot of the row: is that the wording and weight you want?
  - (decision) Hiding `⊘` on that row (both doors would do the same thing). OK, or keep it
    for consistency across rows?
  - [x] P2.1 Rust `announce`: read `$HOME/.claude.json` once per batch (only when some row
        reaches the restore arm), classify restore rows trusted/untrusted, new
        `ACTION_RESTORE_MANUAL` wire value; tests incl. the no-IO-when-gated property  <!-- status: done -->
  - [x] P2.2 TS: `AnnouncedAction` gains `"restore-manual"`; `actionFromAnnounced` maps it to the
        inject action; `rowAffordances` carries the manual qualifier + hides `⊘`  <!-- status: done -->
  - [x] P2.3 `PickerRow.tsx`: render the qualifier + tooltip/aria text (copy hex from existing
        muted styles — there is no CSS token layer)  <!-- status: done -->
  - [x] verify-auto  <!-- status: done -->
    — evidence: `pnpm verify:auto` → EXIT=0 (63 s): eslint 0 errors (the same pre-existing
      XtermPane warning), vitest 299 files / 3855 tests, cargo fmt + clippy clean, cargo test all ok.
      First run FAILED on eslint `no-fallthrough` (a comment between `case "restore":` and
      `case "restore-manual":` in `actionFromAnnounced`); comment moved above both labels.
    — evidence (re-run after the F12 fix of P2.verify-human.1, scoped): eslint PickerRow.tsx +
      pickerRowTrustLive.test.tsx → EXIT=0; prettier --check → clean; tsc --noEmit → EXIT=0; vitest
      src/components/picker → 24 files / 193 tests passed.
  - [x] verify-self  <!-- status: done (1 FAILED-cosmetic) -->
    Driven by the orchestrator over the MCP bridge (subagents cannot reach it). The dev app was
    RESTARTED first: the running build started 11:24:56, one second after the m3 mutant's restore,
    so it may have been compiled from mutant source (`live-dev-app-may-run-a-mutant`); relaunched as
    PID 77041, 0 `MUT-` markers in `src`/`src-tauri/src`. Declared fixture state: the dev
    `session-state.json` (backed up) had both fixtures' unclean flags set by the previous app's kill,
    so those two entries were cleared to reach the restore arm.
    - [x] Unit/mutation/wire-pin/gate outcomes — evidence: Phase 2 Build notes (m1–m7 all killed) +
      verify-auto (`pnpm verify:auto` EXIT=0, 3855 vitest, 1102 cargo lib).
    - [x] Picker rows against the REAL backend and the operator's real `~/.claude.json` — evidence:
      DOM read after a webview reload (`picker_announce_actions` re-fetched):
      `restore-test` (untrusted) → text `⌨︎ /session-restore` (codepoints 2328 fe0e), `data-manual=true`,
      color rgb(255,207,138) on rgba(255,190,80,0.16), title "Claude Code will first ask whether to
      trust this folder, so Claudesk will not type /session-restore. Trust the folder, then run it
      yourself.", NO `⊘`; `wp5-trusted` (trusted only via ancestor `claudesk`) → `↻ /session-restore`,
      green, title "Opening this project will run /session-restore", `⊘` present; `yitang-copy` →
      `↻ continue` unchanged. Badge not clipped: scrollWidth 141 = width 141.
      Screenshots: scratchpad `p2-picker-rows.png`, `p2-picker-rows-zoom.png`.
    - [x] Glyph legibility  <!-- status: resolved by P2.verify-human.1 option A (glyph dropped); was FAILED-cosmetic: at the badge's 0.72rem the `⌨︎` renders as a tiny box and does not read as a keyboard; the amber tone + tooltip carry the meaning. Decision for verify-human. -->
    - [x] Header indicator — evidence: wiring live-tested (`nextOpenTrustLive.test.tsx`, m7 killed).
      Note: in practice the header rarely shows the manual wording, because an OPEN workspace's
      unclean flag is set at spawn, so it reads `↻ will continue` (the filed
      `SURFACE-2026-11-09-NEXT-OPEN-INDICATOR-PREDICTS-CONTINUE-WITH-NO-TRANSCRIPT`).
    - [x] align (decision): untrusted-row wording/weight — evidence CAPTURED: the zoom screenshot +
      tooltip text above. ⚠️ As built it is a glyph + amber, not the plan's worded qualifier (12em cap).
    - [x] align (decision): hiding `⊘` on that row — evidence CAPTURED: same screenshot (no door on
      `restore-test`, door on `wp5-trusted`).
    - [x] Re-verify after the F12 fix of P2.verify-human.1 — evidence: live DOM read (dev PID 77041,
      HMR + webview reload): `restore-test` → text "/session-restore" (no glyph), rgb(255,207,138),
      `data-manual=true`, tooltip unchanged, no `⊘`, not clipped; `wp5-trusted` → "↻ /session-restore",
      green, `⊘`; `yitang-copy` → "↻ continue". Screenshot `p2-picker-rows-v2-zoom.png`.
  - [x] verify-human  <!-- status: done; operator approved 2026-11-09 -->
    - [x] P2.verify-human.1: (decision, incl. the glyph FAILED-cosmetic) the untrusted row's look — `⌨︎ /session-restore` in amber + tooltip; the glyph reads as a tiny box at 0.72rem  <!-- status: done — operator chose A (glyph dropped), approved the result: "ok" -->
    - [x] P2.verify-human.2: (decision) no `⊘` door on an untrusted row  <!-- status: done — operator: "ok" -->
  - [x] verify-codify  <!-- status: done -->
    Test scope: full — last phase
    — evidence: `pnpm verify:auto` → EXIT=0 (56 s), vitest 299 files / 3856 tests, cargo lib 1102 ok.
    — Integration boundary: YES (the picker row, `picker_announce_actions`, the workspace header).
      Consuming surfaces already pinned by tests written in build: `pickerRowTrustLive.test.tsx`
      (the REAL `ProjectPicker` under jsdom: manual row text "/session-restore", amber class,
      tooltip, no `⊘`; trusted + continue rows unchanged) and `nextOpenTrustLive.test.tsx` (the
      real `Workspace` header). Not duplicated.
    — Gap closed here: the `--manual` CSS rule was emitted-but-unguarded (`cssModifierAudit` covers
      only `.is-*`/`.has-*`). Added a `hasBaseRule` + amber-color check to `pickerRowTrustLive`;
      mutants c1 (rule renamed) and c2 (color back to green) each FAIL it.

## Build notes (Phase 1, 2026-11-09)

- **As built.** Rust `src-tauri/src/folder_trust/` (`claude_json_path`, `is_trusted`,
  `is_trusted_on_disk`, command `folder_trusted`). Profile resolution was extracted:
  `config_store::profiles::{ConfigTarget, config_target, live_or_stored_reference}` (pure) and
  `config_store::commands::live_config_target` (AppHandle), now shared by `transcript_tail` and
  `folder_trusted`. `ConfigTarget` is a Default/Dir choice, NOT a path, because the default
  profile's transcripts and trust record sit under different roots. `transcript::commands::
  config_root_for_project` was deleted (no production caller left); its three tests now compose
  `config_target` + `transcript_root`.
- TS: `shouldInject` gained `trusted`; new `readFolderTrust` (every failure resolves `false`)
  and `fireAutoResume` (read trust → `shouldInject` with a fresh `isCancelled()` → inject,
  `console.warn` on a withhold). XtermPane's timer is a single `fireAutoResume({…,
  isCancelled: () => cancelled})` call.
- **Mutation proofs (each individually, landing confirmed, restored by `cp` + `shasum`):**
  | id | mutant | killed by |
  |---|---|---|
  | a | drop `if (!inputs.trusted) return false` | 4 tests (shouldInject trust term, fireAutoResume untrusted, default-seam untrusted) |
  | e2 | `trusted = true`, read not awaited | 2 (untrusted fire, default-seam untrusted) |
  | e3 | `cancelled = false` instead of `isCancelled()` after the read | "re-reads cancellation AFTER the trust read" |
  | e1 | XtermPane `isCancelled: () => false` | "passes a LIVE cancellation read" |
  | e4 | XtermPane passes an `inject:` override | "still routes the write through injectCommand" |
  | b | exact-key lookup instead of the ancestor walk | 3 Rust tests (child, nearer-false, on-disk) |
  | c | `== Some(true)` → `!= None` | `only_json_true_counts`, `no_true_on_the_path…` |
  | d | default path `~/.claude/.claude.json` | `the_default_profile_record_is_a_sibling…` |
  | f | drop `canonicalize` | `the_path_is_canonicalized_so_a_symlink…` |

## Build notes (Phase 2, 2026-11-09)

- **As built.** Rust: `announce::ACTION_RESTORE_MANUAL = "restore-manual"` and a pure post-pass
  `announce::apply_trust(map, read_trust_record)` applied by `picker_announce_actions` (the
  default profile's `$HOME/.claude.json`, read at most once and only when a row reached the restore
  arm; `announce_actions` itself is unchanged, so its 28 test call sites and its gate/precedence
  logic were not touched). TS: `AnnouncedAction` gained `"restore-manual"`, `isManualAnnounced`,
  `actionFromAnnounced` maps it to the SAME inject action, `RowAffordances.manual` +
  `showNoFireDoor: !manual`, `PickerRow` badge, `.picker-recent-announce--manual` CSS.
- **⚠️ Deviation from the plan's wording (for the Phase 2 alignment question):** the badge is
  capped at `max-width: 12em`, so a worded qualifier ("type after trusting folder") would clip.
  As built: `⌨︎ /session-restore` (U+2328 + U+FE0E text presentation) in the pause control's amber
  (`#ffcf8a` on `rgba(255,190,80,0.16)`, copied, not a new hue), tooltip "Claude Code will first ask
  whether to trust this folder, so Claudesk will not type /session-restore. Trust the folder, then
  run it yourself."
- **Scope addition (same claim, same wire value):** the workspace header's next-open indicator
  (`nextOpenIndicator`, fed by the same batch) now reads `↻ type /session-restore after trusting`
  for a manual row instead of `↻ will run /session-restore`.
- Harness: `liveWorkspace.mountWorkspace` now lets `ipcAnswers` win over its built-in defaults.
- **Mutation proofs (individually, landing confirmed, `cp`+`shasum` restore):**
  | id | mutant | killed by |
  |---|---|---|
  | m1 | `apply_trust` never marks manual | 2 Rust announce tests |
  | m2 | trust read always false | `an_untrusted_restore_row_becomes_manual_and_a_trusted_one_stays` |
  | m3 | command reads `~/.claude/.claude.json` | `profile_callers_route_through_the_tested_bodies` |
  | m4 | `showNoFireDoor: true` | announceRow unit + `pickerRowTrustLive` |
  | m5 | `isManualAnnounced` always false | wire pin + announceRow + live row |
  | m6 | badge glyph always `↻` | `pickerRowTrustLive` |
  | m7 | Workspace passes `manual: false` | SURVIVED all 1065 tests → new `nextOpenTrustLive.test.tsx` now kills it |

## Ship (2026-11-09)

- Full suite: reused the last-phase codify run (`Test scope: full — last phase`, `pnpm verify:auto`
  EXIT=0, 56 s); nothing but the WIP and `runtimes.md` changed after it.
- Cleanup: the dev app torn down; dev `projects.json` restored (shasum matches the backup); dev
  `session-state.json` restored to its pre-verify content; `tmp/scratch/wp5-trusted` removed.
  Left in place: `claudesk-scratch/restore-test` (its own `.session.md` fixture, `reset.sh` exists).
- Committed on `main`, NOT pushed (operator rule). The operator's uncommitted `backlog.md` block,
  outbox edits and memory files stay unstaged (blob-staged around the block).

- **Path:** Feature > review-quality
- **Active scope:** review-quality
- **Blocked:** none
- **Unvisited:** finalize
- **Open discoveries:** SURFACE-2026-11-09-NEXT-OPEN-INDICATOR-PREDICTS-CONTINUE-WITH-NO-TRANSCRIPT (logged, separate from WP5)

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->
[SURFACED-2026-11-09] Phase 1 verify-self — the workspace header's `↻ will continue` (and the picker's `continue` announcement) predicts `--continue` for a project with NO transcript, where the spawn's `guard_continue_against_transcripts` drops it; the prediction also displaces the `/session-restore` arm. Logged as SURFACE-2026-11-09-NEXT-OPEN-INDICATOR-PREDICTS-CONTINUE-WITH-NO-TRANSCRIPT.

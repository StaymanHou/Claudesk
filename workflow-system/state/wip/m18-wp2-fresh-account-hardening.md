---
drive_mode: autopilot
---

# Feature: M18 WP2 — Fresh-account hardening (bypass-dialog withhold + `claude` PATH fallback)

**Workflow:** feature
**State:** ship (complete)
**Created:** 2026-11-18
**WBS:** `workflow-system/product/wbs.md` → WP2 · **Design:** `arch/claude-substrate.md` §R.6 · `arch/session-resumption.md` → "The inject arm withholds…"

## Problem Statement

A CC account that has never accepted Claude Code's "Bypass Permissions mode" warning opens a bypass spawn on that
dialog. The dialog's DEFAULT is "No, exit", so the `\r` that ends an auto-fired `/session-restore` picks it. CC quits,
the pane reads "Session ended", and the session is lost (`SURFACE-2026-11-17-AUTO-RESUME-INJECT-ANSWERS-BYPASS-PERMISSIONS-DIALOG-NO-EXIT`,
**high**). This is the same class as the folder-trust dialog, which `fireAutoResume` already withholds on. The bypass
dialog is not covered on either the local or the remote path. Separately, a remote host account whose `claude` lives only
on the interactive (`.zshrc`) PATH fails Claudesk's `zsh -lc` preflight (`fail:tools:claude`) and `cc-launch`'s
`exec claude` (`SURFACE-2026-11-17-REMOTE-CLAUDE-ONLY-ON-INTERACTIVE-PATH`). WP2 hardens both, so every fresh host account
that WP5–WP7 install into opens onto a CC that can't quit on the bypass dialog.

**Code facts this plan rests on (read 2026-11-18):**
- Claudesk spawns with `--permission-mode <app mode>`, not `--dangerously-skip-permissions` (`cc_session::build_cc_argv`). A
  listed PROFILE spawns with NO flag, and its own `settings.json` `permissions.defaultMode` governs (`spawn_permission_mode`).
  A remote spawn goes through the same `SessionRegistry::spawn`, so it gets the app mode.
- `RegisteredSession` records `drive_mode` and `profile`, but **not** the permission mode the argv carried.
- The fire funnel is `autoResumeFire.ts` → `fireAutoResume` → `shouldInject({action, cancelled, trusted})`. The local trust
  read is the `folder_trusted` command. For a remote row, `folder_trusted` answers from `LinkRegistry::open_trust`, which
  `settle_open_decision` sets from the open check's `TRUSTED_KEYS` perl fragment.
- Recycle's restore inject (`recycleSession.ts` → `injectRefusal`) does **not** go through `fireAutoResume`.
- The deployed `cc-launch` is rewritten on every link connect (`remote_link::pre_connect_script`), so a launcher fix reaches
  every host on its next connect.

## Decisions taken at plan time (not given by the WBS)

- **D-1 — "Does this spawn show the dialog?" is decided from the spawn's EFFECTIVE permission mode,** not from the setting alone.
  The session records the mode its argv carried. Explicit `bypassPermissions` → the dialog is possible. A profile spawn (no flag)
  reads the profile's `settings.json` `permissions.defaultMode`. Any other mode → no dialog, so the term passes. Any doubt (no
  session entry, unreadable file) → **withhold** (D4: a withheld fire costs one typed command, a wrong fire costs the session).
  Phase 1's probe confirms which spawn shapes actually show the dialog. If the probe disagrees, this decision is revised at
  Phase 2 entry.
- **D-2 — The bypass withhold gets a plain-words notice on LOCAL rows too,** not only remote ones. The trust case is silent locally
  because the picker row already predicted "type /session-restore after trusting". Nothing predicts the bypass case, so a silent
  non-fire would read as "nothing to resume" (prior `a-silent-non-action-must-not-read-as-done`). The picker announcement is
  **not** extended in WP2. Raised as a `(decision)` Alignment question at Phase 2.
- **D-3 — Recycle's restore inject also checks the bypass term.** A Recycle respawn under a mode the operator just switched to
  `bypassPermissions` meets the same dialog. A refusal maps to the existing `restore-not-injected` reason ("recycled, now restore
  by hand"). It costs one read and no new UI.
- **D-4 — The PATH fallback prepends `$HOME/.local/bin` to PATH only when `command -v claude` fails,** as one constant fragment
  shared by `cc-launch`, the preflight's tools loop and `AUTH_CHECK`. Claudesk never edits a dotfile.

## Work Tree

- [x] Phase 1: Probe: the bypass dialog on today's CC
  **Observable outcomes:**
  - CLI (state-changing, scratch config dir only): under a pty (`script -q`) with a scratch `CLAUDE_CONFIG_DIR` (a copy of the dev
    profile `~/.config/claude-original-dev`, with `skipDangerousModePermissionPrompt` removed from its `settings.json`),
    `claude --permission-mode bypassPermissions` shows the Bypass Permissions warning. The captured screen names the default
    option. `claude --version` is recorded with it.
  - CLI (state-changing, scratch config dir only): accepting the warning in that pty adds `"skipDangerousModePermissionPrompt": true`
    to `$CLAUDE_CONFIG_DIR/settings.json` (a `jq` read before and after). A `shasum` of the dir's `.claude.json` before and after shows
    whether anything else changes.
  - CLI (scratch config dir only): the spawn-shape matrix, one row each with "dialog: yes/no": `--permission-mode bypassPermissions`,
    `--dangerously-skip-permissions`, no flag with `permissions.defaultMode: "bypassPermissions"` in `settings.json`, and
    `--permission-mode default` / `acceptEdits` / `dontAsk` / `auto`. Also: does the key in a PROJECT `.claude/settings.json` or
    `settings.local.json` (but not the user file) suppress the dialog?
  - CLI (state-changing, scratch HOME on the mini; never the live account, §R.8): the same dialog through the deployed
    `cc-launch --permission-mode bypassPermissions` under a scratch `HOME` without the key. The key is written to
    `$HOME/.claude/settings.json` on accept.
  - CLI: when both dialogs apply (an untrusted folder AND bypass not accepted), the order they appear in is recorded.
  **Alignment questions:**
  - none (the probe records facts; Phase 2 reads them)
  - [x] P1.1 Build the scratch config dir (copy of the dev profile, key stripped) and run the local matrix in a pty. Write the raw captures to the session scratchpad.
  - [x] P1.2 Run the remote capture on the mini under a scratch HOME (token copied into the scratch `.claudesk/`, removed afterwards).
  - [x] P1.3 Record the results under `## Probe outcomes` below, plus a revise/keep verdict on D-1.
  - [x] verify-auto — no code changed (probe phase); the checks are footprint checks
    — evidence: `git status --porcelain` → only `?? workflow-system/state/wip/` (no source touched)
    — evidence: local `ps` → 0 `ptydrive` processes left running
    — evidence: mini `tmux -L wp2probe ls` → "no server running" (probe server gone); scratch-HOME token copy → absent
  - [x] verify-self — runner subagent judged the scratchpad captures plus one fresh run of its own; 4 PASS, 1 UNVERIFIED (evidence not saved to file), closed by re-capture
    - [x] O1 the warning, default "No, exit" — evidence: runner's fresh `run.sh vs-fresh.txt 7 - --permission-mode bypassPermissions` → "❯ No, exit"; `claude --version` → 2.1.327; the scratch key is still null afterwards; 0 driver processes left
    - [x] O2 accept writes the key — runner: UNVERIFIED (the post-accept files were not preserved). Re-captured with the files kept (`ev2-*`): `skipDangerousModePermissionPrompt` null → `true` (the settings diff shows only that line); `.claude.json` shasum 55a1c821 → 2d860c11, the only changed key `numStartups`, 0 bypass-related keys
    - [x] O3 spawn-shape matrix — evidence: `grep -c "running in Bypass Permissions mode" m-*.txt` → 2 for dsp / noflag-defaultMode-bypass / key-false / key-string / key-in-project-settings; 0 for flag-{default,acceptEdits,dontAsk,auto,plan} / noflag-defaultMode-acceptEdits / key-true-control / key-in-project-local
    - [x] O4 remote via `cc-launch`, scratch HOME — evidence: remote-r1 "settings.json: No such file" before; remote-r2 "S1 2" (warning shown) → "⏵⏵ bypass permissions on" → SETTINGS `{"skipDangerousModePermissionPrompt": true}`
    - [x] O5 order — evidence: o-order2 trust prompt → "Yes, I trust this folder" → bypass WARNING "❯ No, exit"; o-order: declining trust exits ("didn't start because this folder isn't trusted"), no bypass warning
  - [x] verify-human
    - [x] P1.verify-human.1 (decision) D-1 verdict: keep the rule and accept the `settings.local.json` gap, or also read the project's `.claude/settings.local.json`. **Operator 2026-11-18: keep, accept the gap** (read only the user/profile `settings.json`)
  - [x] verify-codify — no code in this phase, so there is no repo test to write. The probe's facts are codified in Phase 2 as the decision rule's unit tests (a key `false`/`"true"` → not accepted; only bypass spawn shapes need the key).
    Test scope: nearby — no files touched in this phase, so the nearby set is empty and nothing was run (the full suite runs at the last phase)

- [x] Phase 2: The bypass withhold: local, remote, and Recycle
  **Relevance check (before Phase 2):**
  - Requester still needs this: yes. The high backlog item stands, and WP5–WP7 install into fresh accounts.
  - Requirements unchanged: yes. The probe confirmed the WBS rule; the D-1 gap was accepted at P1.verify-human.1.
  - Solution still feasible: yes. The probe found the key and its file, and the spawn shapes that show the warning.
  - No superior alternative discovered: yes. Answering the dialog for the operator is ruled out (§R.6: the operator's act).
  **Verdict:** proceed
  **Observable outcomes:**
  - CLI: `pnpm verify:auto` exits 0.
  - CLI: `fireAutoResume` with a bypass read of `false` and a `/session-restore` action injects nothing and calls `onWithheld` with
    the bypass notice, for a local path AND for a remote key (vitest, real `fireAutoResume`, injected seams).
  - CLI: deleting the bypass term from `shouldInject` turns that test red (a mutation, proven on its own and restored by `cp` +
    `shasum`). The same holds for each new Rust term: the session's recorded permission mode, the profile `defaultMode` read, the
    `settings.json` key read, and the remote `open_bypass` answer.
  - CLI: the remote open-check script carries a constant `BYPASS_ACCEPTED` perl fragment. `parse_open_facts` reads its
    `CLAUDESK-OPEN:bypass-accepted:yes` line, and a missing, `false` or string `"true"` key reads as not accepted (cargo test,
    as `TRUSTED_KEYS`'s tests do). Run against a scratch HOME on the mini that lacks the key, it prints no `bypass-accepted:yes`.
    With the key, it prints the line.
  - CLI: `settle_open_decision` overwrites the bypass answer on every check, and no outcome leaves an older `true` (cargo test).
  - CLI: Recycle with a bypass read of `false` returns `restore-not-injected` and types no `/session-restore` (vitest).
  - Browser (state-changing, dev build + scratch config): a local workspace whose profile is the scratch config (bypass `defaultMode`,
    key stripped, `.session.md` seeded in a scratch project) opens on the warning. Through the bridge: no `/session-restore` reaches
    the pane (`cc_inject` capture), the workspace toast shows the bypass notice, and after accepting in the pane and typing
    `/session-restore`, the session restores.
  - Browser (state-changing, dev build, scratch remote folder + scratch HOME): the same on a remote scratch row, with the notice
    naming the host.
  - Browser (dev build): a trusted, bypass-accepted local project still auto-fires `/session-restore` (positive control; nothing
    regresses for the common case).
  **Alignment questions:**
  - Read the bypass notice copy in the toast: does it name the cause and the fix clearly enough ("pick **Yes, I accept**, then type
    /session-restore")?
  - (decision) D-2 in action: a LOCAL workspace now shows a toast for the bypass withhold, while the local trust withhold stays
    silent (its picker row warned beforehand). Keep it that way, or should the picker row predict the bypass case too (a later task)?
  - [x] P2.1 Rust: record the spawn's effective `--permission-mode` (`Option<CcPermissionMode>`) on `RegisteredSession`.
  - [x] P2.2 Rust: `bypass_dialog_cleared(project_path, pty_session_id) -> bool` (sync, a file read only). Local: the D-1 rule over the
    session's recorded mode, the config dir's `settings.json` key (`~/.claude/settings.json` or the profile's), and the profile's
    `defaultMode`. Remote: answered from a new `LinkRegistry::open_bypass`, combined with the session's recorded mode. Register it
    in `lib.rs` (sync command: keep `sync_commands_do_not_block.rs` green).
  - [x] P2.3 Rust remote: the constant `BYPASS_ACCEPTED` fragment beside `TRUSTED_KEYS` in `open_check_command`, the parse in
    `parse_open_facts`, `OpenFacts.bypass_accepted`, and `settle_open_decision` → `set_open_bypass` (through the same single funnel
    as `set_open_trust`; extend that funnel's direct-call guard).
  - [x] P2.4 TS: `readBypassCleared` (every failure is `false`), `FireInputs.bypassCleared`, the term in `shouldInject`, and
    `fireAutoResume` reading both at fire time before the fresh `isCancelled()`.
  - [x] P2.5 TS: the bypass notice (`withheldNotice` gains a cause, local and remote per D-2). It names the dialog, its "No, exit"
    default, and the fix. When both apply, the notice names both, trust first (probe finding 4: the trust dialog comes first).
  - [x] P2.6 TS: Recycle's restore inject reads the bypass term first (D-3) → `restore-not-injected`.
  - [x] P2.7 Tests + mutation proofs per the outcomes above. Mutants, each killed and restored by `cp` + `shasum` (`scratchpad/mutate.sh`, logs `mut-*.log`).
    TS (4 files, 108 tests):
    - T1 drop `shouldInject`'s bypass term
    - T2 the fire ignores the read
    - T3 the default seam is not `readBypassCleared`
    - T4 the local bypass notice is dropped
    - T5 Recycle's check is dropped
    - T6 Recycle reads the old session id

    Rust (filtered lib, 128 tests):
    - R1 a bypass flag ignores the key
    - R2 any key value counts
    - R3 an unflagged spawn ignores `defaultMode`
    - R4 a missing file reads as doubt
    - R5 the open check has no fragment
    - R6 the fragment reads `~/.claude.json`
    - R7 the settle does not write the answer
    - R8 the remote half reads the trust map
    - R9 a reattach is not `NoStart`
    - R10 the parse ignores the line
    - R11 `decide_open` drops the answer
    - R12 the command reads the default profile
  - [x] P2.8 Docs: `arch/session-resumption.md` ("The inject arm withholds…" → as-built, the 📐 line removed), `arch/claude-substrate.md`
    §R.6 bypass bullet → as-built, `arch/remote-workspaces.md` §H.
  - [x] verify-auto — `pnpm verify:auto` (the project's per-phase gate)
    — evidence: `pnpm verify:auto` → EXIT=0 in 48s; vitest `Tests 4078 passed (4078)`; Rust 11 test binaries, 1427 passed, 0 failed (includes `sync_commands_do_not_block` for the new sync command); `cargo fmt --check` and `cargo clippy --all-targets -D warnings` clean
    — evidence: eslint `0 errors, 1 warning`, a pre-existing `react-hooks/exhaustive-deps` at `XtermPane.tsx:978` (`git diff --quiet XtermPane.tsx` → untouched)
  - [x] verify-self: the runner subagent took the CLI outcomes (6/6 PASS) and the orchestrator drove the live app over the bridge (the bridge is orchestrator-only)
    - [x] `pnpm verify:auto` exits 0. Evidence: va-p2.log shows `Tests 4078 passed`, Rust lib `1376 passed; 0 failed`, 0 FAILED lines
    - [x] fire withholds + notifies, local and remote. Evidence: the 5 specs give `Tests 120 passed`. The local path is in committed tests. The remote `ssh://` key was proven only by the runner's throwaway spec (outside the repo, `Tests 1 passed`), so it goes to verify-codify as a committed test
    - [x] each new term mutation-proven. Evidence: 18/18 logs show failures; every restored file is identical to its aside copy
    - [x] the remote fragment, live on the mini. Evidence: the runner ran it under a scratch HOME: no file → no output; `true` → `CLAUDESK-OPEN:bypass-accepted:yes`; `"true"` → no output; the scratch home was deleted
    - [x] the settle overwrites the bypass answer on every outcome. Evidence: `the_fire_time_bypass_read_answers_a_remote_row_from_its_last_open_check ... ok`; mutant R7 is killed
    - [x] Recycle withholds. Evidence: the spec gives `{ok:false, reason:"restore-not-injected"}` with no `inject:/session-restore`; mutants T5 and T6 are killed
    - [x] LOCAL live (consuming surface: picker → workspace open → auto-resume fire → workspace toast). The instrument was a sandboxed-`$HOME` dev launch (`HOME`=scratchpad `fake-home`, key absent, gate ON, `scratch-a` trusted with a seeded `.session.md`) — evidence:
      - the picker row read `↻ /session-restore`
      - after the open, CC (`claude --permission-mode bypassPermissions`, pid 11972) was still alive 7s and 42s after spawn, so no `\r` answered the warning
      - the workspace toast read exactly: `Claude Code's Bypass Permissions warning hasn't been accepted yet, so /session-restore was not typed (its default, "No, exit", would close Claude Code). Pick "Yes, I accept", then type /session-restore.` (screenshot `scratchpad/p2-local-bypass-toast.png`)
      - `cc_input` ↓ and then `\r` (separate writes) moved fake-home `settings.json` `skipDangerousModePermissionPrompt` from `null` to `true`, which proves the pane sat on the bypass warning
      - deviation: the "then type /session-restore and it restores" half is undrivable in the sandbox (no CC login there). The restore itself was proven by the positive controls below
      - containment: the real `~/.claude/settings.json` key is still `true`; dev settings shasum `72bfef1c63` = backup
    - [x] REMOTE withheld path, live (gap accepted at P2.verify-human.4)  <!-- status was: UNVERIFIED: undrivable — needs a mini account whose `~/.claude/settings.json` lacks the key. The only CC account on the mini (<user>) serves tank and has the key; <admin> is root-ops only and must not hold CC credentials (memory `mini-remote-user-is-stayman`). The pieces are each proven: the live fragment against a scratch HOME without the key (runner), parse/settle/`remote_cleared` (tests + mutants), and the shared TS path (local live run above) -->
    - [x] REMOTE positive (consuming surface: remote open check → fire) on a temporary scratch row `~/claudesk-scratch-remote`, real-HOME dev app, gate ON, throwaway `.session.md` seeded — evidence:
      - `add_remote_project` passed its preflight
      - after the open, the remote transcript (from 18:40:40Z) holds `<command-name>/session-restore</command-name>`, and the pane sat at `/session-restore`'s drive-mode pick
      - after Enter, the remote `.session.md` was consumed. So the open-check exec, with the new fragment appended, parsed on the real host and answered "accepted"
      - cleanup: the workspace was closed via the UI (`tmux -L claudesk-dev ls` → no server); the row was removed (row set diff empty); no dev `ssh -M` left; tank's prod `cd-86d4c157` untouched
    - [x] LOCAL positive control. Evidence: real-HOME dev app, `scratch-c` (default profile, key `true`, trusted, seeded `.session.md`). The row read `↻ /session-restore`. The new transcript (18:35:35Z) holds `<command-name>/session-restore</command-name>`, and `.session.md` was consumed. Because the fire reads `bypass_dialog_cleared` before typing, this also proves the command is registered and answered `true`. ⚠️ `ipc_monitor` captured nothing at all, not even `cc_spawn` (a blind instrument here, so it was not used as evidence)
    - [x] align: bypass notice copy. Evidence: the live toast text above, plus the runner's 5 exact strings (local/remote bypass, local/remote both, the Recycle toast `Recycled, but /session-restore was not sent: Claude Code is showing its Bypass Permissions warning, whose default "No, exit" would close it (pick "Yes, I accept" first). Run /session-restore yourself.`)
    - [x] align (decision) D-2. Evidence: `withheldNotice` returns `null` for local trust-only and a string for local bypass (pinned by tests). The live local run showed the toast
    - [x] cosmetic (accepted at P2.verify-human.3): the bypass notice renders in the RED error toast style (`workspace-inject-toast`, the same path as the M17 remote trust notice), though nothing failed  <!-- status: FAILED-cosmetic — same class as backlog `SURFACE-2026-11-17-REMOTE-OPEN-STARTED-AGAIN-NOTICE-USES-THE-ERROR-STYLE` -->
  - [x] verify-human (operator, 2026-11-18: all four approved)
    - [x] P2.verify-human.1 (a) the bypass notice copy: does it name the cause and the fix clearly enough? **Copy is fine.**
    - [x] P2.verify-human.2 (c, decision) D-2: a local bypass withhold gets a toast, while the local trust withhold stays silent. Keep, or make the picker predict it later? **Keep** (no picker backlog item).
    - [x] P2.verify-human.3 (c, cosmetic) the notice uses the red error toast style: accept as-is (fold into the existing error-style backlog item) or fix now? **Accept, folded into** `SURFACE-2026-11-17-REMOTE-OPEN-STARTED-AGAIN-NOTICE-USES-THE-ERROR-STYLE`.
    - [x] P2.verify-human.4 (d→c) the live REMOTE withheld path is undrivable (no key-less CC account on the mini): accept the evidence gap, or supply an account? **Accept the gap**; M18 WP8's fresh-host acceptance can observe it end to end.
  - [x] verify-codify. Added the consuming-surface test `autoResumeFireLive.test.tsx` → "a REMOTE bypass warning not yet accepted: no cc_inject, and a notice naming the host" (the real XtermPane, `cc_spawn_remote`, closes the runner's remote-key gap; mutant C1 "notice drops the host" KILLED). Notes: the `bypass_prompt` module docs record which arm is live (profile rows have no restore arm); `docs/lessons/sandboxed-home-verification.md` gained `COREPACK_HOME` and the AF_UNIX hook-socket path limit
    Test scope: full — suite not long (`runtimes.md` `pnpm verify:auto` Last 48s)
    — evidence: `pnpm verify:auto` → EXIT=0 in 48s; vitest `Tests 4079 passed (4079)`; Rust 1427 passed, 0 failed; eslint 0 errors (1 pre-existing warning)

- [x] Phase 3: The `claude` PATH fallback (cc-launch + preflight)
  **Relevance check (before Phase 3):**
  - Requester still needs this: yes. The WBS names it, and any new remote host account can hit it.
  - Requirements unchanged: yes.
  - Solution still feasible: yes.
  - No superior alternative discovered: yes. Editing dotfiles is ruled out (§R.6).
  **Verdict:** proceed
  **Observable outcomes:**
  - CLI: `pnpm verify:auto` exits 0.
  - CLI: `cc_launcher()`, `preflight_script()` and `AUTH_CHECK` each contain the one constant `CLAUDE_PATH_FALLBACK` fragment, ahead of
    the first `claude` use. The fragment contains no variable value (cargo test; mutation: removing it from each site turns its test red).
  - CLI (state-changing, scratch HOME on the mini): with a scratch `HOME` whose `.zprofile` does NOT add `~/.local/bin`, and `claude`
    present only at `$HOME/.local/bin/claude` (a symlink to the real binary), `zsh -lc '<preflight_script>'` prints `ok:tools` … `ok:auth`,
    and the deployed `cc-launch --version` prints CC's version.
  - CLI (state-changing, scratch HOME on the mini): with `claude` neither on PATH nor at `~/.local/bin`, the preflight prints
    `fail:tools:claude`, and the add-remote check's message names both places it looked and the `~/.zprofile` fix (cargo test on
    `parse_check_lines` for the exact copy).
  - Browser (dev build, scratch remote row): an Add Remote against the scratch-HOME account (the first case above) passes every check
    in the dialog.
  **Alignment questions:**
  - Read the `fail:tools:claude` message in the Add Remote dialog: is the `.zprofile` fix clear?
  - [x] P3.1 The constant `CLAUDE_PATH_FALLBACK` fragment (`command -v claude >/dev/null 2>&1 || PATH="$HOME/.local/bin:$PATH"`), used in
    `cc_launcher`, `preflight_script` (before the tools loop) and `AUTH_CHECK`. Check the heredoc-delimiter test still holds.
  - [x] P3.2 The `fail:tools:claude` copy in `parse_check_lines` (other tools keep the current message).
  - [x] P3.3 Tests + mutation proofs. The new tests run the real scripts: the launcher in `/bin/sh` and the preflight in `/bin/zsh`, with `claude` only in `$HOME/.local/bin`, both on PATH, and in neither. Mutants killed (filtered lib, 51 tests):
    - P1 no fallback in the preflight
    - P2b fallback after `exec` (the first P2 variant failed to COMPILE on an unused format arg, so it was redone; not a kill)
    - P3 the wrong dir
    - P4 the fallback always wins
    - P5 the generic claude message
  - [x] P3.4 Docs: §R.6 PATH bullet → as-built, `arch/remote-workspaces.md` §H. Backlog: delete both SURFACE entries with their
    `**Backlog resolved:**` lines (at finalize). (docs done; the backlog deletes happen at finalize)
  - [x] verify-auto — `pnpm verify:auto`
    — evidence: EXIT=0 in 49s; vitest `Tests 4079 passed (4079)`; Rust 1430 passed, 0 failed (+3 new: launcher fallback, preflight in zsh, fallback ordering); fmt/clippy clean; eslint 0 errors (1 pre-existing warning)
  - [x] verify-self: the runner subagent took the CLI outcomes (4/4 PASS); the orchestrator drove the live checks
    - [x] `pnpm verify:auto` exits 0. Evidence: va-p3.log `Tests 4079 passed`; Rust all `ok`; the 4 new tests `... ok`
    - [x] one fragment ahead of the first `claude` in each site. Evidence: the emitted texts (a temporary emit test, file restored by shasum): preflight line 2 = the fragment, line 3 = the tools loop, `AUTH_CHECK` after it; `cc-launch` line 7 = the fragment, line 8 = `exec claude`. Mutants P1, P2b, P3, P4, P5 are killed (P2 was invalid: a compile error)
    - [x] live on the mini under a scratch HOME (`.zprofile` adds `/opt/homebrew/bin`, not `~/.local/bin`; `claude` only as `~/.local/bin/claude`; `env -i … zsh -lc`) — evidence:
      - the login PATH has no claude ("claude NOT on login PATH")
      - the real preflight text gives `ok:tools ok:path ok:token ok:auth` (a real `claude auth status`)
      - the real `cc-launch --version` → `2.1.327 (Claude Code)`
      - controls with the fallback line removed fail in the same env: `fail:tools:claude`; `exec: claude: not found`
      - the scratch home was removed
    - [x] claude in neither place. Evidence: live `fail:tools:claude`; `missing_tool` copy pinned by `each_check_failure_names_what_failed` (mutant P5 killed)
    - [x] Add Remote, live (consuming surface: `add_remote_project` + link connect + remote spawn), real-HOME dev app, scratch remote row — evidence:
      - the preflight passed (`ok:row`)
      - the connect re-deployed the dev `cc-launch` on the mini: fallback lines 0 → 1 (line 7, ahead of `exec claude`)
      - opening the row started CC through it: tmux `cd-f37d9999`, `pane_current_command=2.1.327`, at the prompt with `⏵⏵ bypass permissions on`
      - cleanup: the workspace was closed via the UI; the row was removed (0 rows); the dev app stopped; no dev tmux server or `ssh -M`
      - deviation: the plan named "an Add Remote against the scratch-HOME account". Claudesk's ssh cannot be pointed at a scratch HOME on the same account, so the fallback-only account case is covered by the scratch-HOME CLI runs above, and this live run covers the real consuming surface
    - [x] align: the `fail:tools:claude` copy. Evidence: `missing_tool("claude","mini")` → "claude was not found on mini: not on a login shell's PATH and not at ~/.local/bin/claude. Claudesk's login shell reads ~/.zprofile, not ~/.zshrc, so if your PATH line for claude is only in ~/.zshrc, add it to ~/.zprofile on mini"
  - [x] verify-human (operator, 2026-11-18)
    - [x] P3.verify-human.1 (a) the `fail:tools:claude` message: is the `~/.zprofile` fix clear? **Clear, ship it.**
  - [x] verify-codify — no new test needed. Every approved behaviour is already pinned by a test that runs the real code:
    - the launcher fallback in `/bin/sh`;
    - the preflight in `/bin/zsh`, with `claude` only in `~/.local/bin` and in neither place;
    - the fragment's position in both scripts;
    - the `missing_tool` copy through `run_preflight` (the consuming surface).

    Each one was mutation-proven in build.
    Test scope: full — last phase
    — evidence: `pnpm verify:auto` → EXIT=0 in 61s; vitest `Tests 4079 passed (4079)`; Rust 1430 passed, 0 failed; eslint 0 errors (1 pre-existing warning)

## Current Node
- **Path:** Feature > review-quality
- **Active scope:** review-quality (shipped as a local commit on `main`, not pushed; the full suite was reused from the last-phase codify run)
- **Blocked:** none
- **Unvisited:** ship → review-quality → finalize
- **Open discoveries:** two NOTED entries (both documented); WP2.5 was added to `wbs.md` (remote copy to the Mac clipboard, operator 2026-11-18)

## Verification constraints (from §R.8 + memories)
- ⚠️ Never the live mini account `~/.claude` (it serves tank). Remote captures use a scratch `HOME` on the mini and the scratch remote
  folder only (memory `remote-verify-hygiene`). Check open remote workspaces before stopping the dev app. No `App.tsx` edits while a
  remote workspace is open.
- Local captures use a COPY of the dev profile (`dev-profile-for-f-b-verification`), never the operator's real `~/.claude` or real profiles.
- An agent-launched dev app needs the Claude-marker `env -u` strip (`agent-launched-app-cannot-verify-continue`).
- Mutation restores: `cp` aside + `shasum`, never `git checkout` (`git-checkout-no-ops-on-untracked-file`).

## Probe outcomes

**Phase 1, 2026-11-18. CC 2.1.327 local and on the mini.** Instruments: a Python pty driver locally (no local tmux), and a
separate `tmux -L wp2probe` server under a scratch `HOME` on the mini (`~/claudesk-scratch-home-wp2`, the token copied in for each run
and removed after). The raw captures are in the session scratchpad (`m-*.txt`, `r*.txt`, `o-order*.txt`, `remote-r*.txt`).
The local scratch config was a copy of the dev profile, with `skipDangerousModePermissionPrompt`, `hooks` and `statusLine` stripped.

1. **The dialog:** "WARNING: Claude Code running in Bypass Permissions mode … ❯ No, exit / Yes, I accept · Enter to confirm · Esc to
   cancel". **The cursor starts on "No, exit"**, so an injected `\r` exits CC. It appears BEFORE auth: an unauthenticated config shows it too.
2. **On accept** (↓ then `\r`), CC adds exactly `"skipDangerousModePermissionPrompt": true` to `$CLAUDE_CONFIG_DIR/settings.json`
   (local profile) or `$HOME/.claude/settings.json` (remote, through the deployed `cc-launch`). Nothing bypass-related changes in
   `.claude.json`; its diff is startup bookkeeping only (`numStartups`, `lastReleaseNotesSeen`, …).
3. **Spawn-shape matrix** (user key absent, `permissions.defaultMode: "bypassPermissions"` in `settings.json` unless stated):

   | Spawn | Dialog |
   |---|---|
   | `--permission-mode bypassPermissions` | **YES** |
   | `--dangerously-skip-permissions` | **YES** |
   | no flag, `defaultMode: "bypassPermissions"` | **YES** |
   | no flag, `defaultMode: "acceptEdits"` | no |
   | `--permission-mode default` / `acceptEdits` / `dontAsk` / `auto` / `plan` (the settings' bypass `defaultMode` is overridden by the flag) | no |
   | key `false` | **YES** |
   | key `"true"` (a string) | **YES** |
   | key `true` (control) | no; starts with "bypass permissions on" |
   | key `true` only in the PROJECT `.claude/settings.json` | **YES** (project settings are ignored for this key) |
   | key `true` only in the PROJECT `.claude/settings.local.json` | no (suppressed) |

4. **Order when both apply:** the folder-trust dialog comes FIRST ("Quick safety check …", cursor on "No, exit"; a lone `\r` exits
   CC), and the bypass warning follows once the folder is trusted.

**D-1 verdict: KEEP.** The effective permission mode decides (an explicit bypass flag, or for a no-flag profile spawn its
`defaultMode`), and only a JSON `true` in the user/profile `settings.json` clears it. ⚠️ **Known conservative gap, accepted:** a
`true` in the project's `.claude/settings.local.json` also suppresses the dialog, but WP2 does not read that file. Such a project gets
a withheld fire, which costs one typed command (D4 side), never a lost session. Phase 2 detail from finding 4: when both dialogs
apply, the notice names both, trust first.

⚠️ **Probe-hygiene notes:** the dev `projects.json` remote row is an old `<admin>@` row, so derive the host and write `<user>@`
(memory `mini-remote-user-is-stayman`). One read-only ssh ran as <admin> before this was caught; nothing was written. CC ignores SIGTERM
in a pty, so the driver must escalate to SIGKILL. `echo ===X` in a `zsh -s` script trips `=word` expansion and aborts it (memory
`zsh-equals-expansion-eats-tmux-exact-targets`), so quote markers.

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->
- [NOTED-2026-11-18] Phase 2 — **A profile row never reaches the restore arm** (F-b ruling 4, `workflow_applicable`; `announce::profile_row_gets_no_restore_arm_even_with_the_gate_on`), and Recycle is workflow-gated the same way. So today the bypass read only meets `SpawnPermission::Flag` sessions; the `Unflagged` arm is defensive (correct if profiles ever gain the arm). Recorded in `bypass_prompt` docs at codify; no backlog entry (no defect).
- [NOTED-2026-11-18] Phase 2 verify-self — **the sandboxed-`$HOME` launch also needs `COREPACK_HOME=<real>/.cache/node/corepack`** (else pnpm's corepack shim re-downloads into the fake home and dies `Cannot find module …pnpm.cjs`), and a fake home under the long scratchpad path **cannot bind the hook socket** (AF_UNIX path limit; harmless unless the check needs the status channel). To be added to `docs/lessons/sandboxed-home-verification.md` at codify.

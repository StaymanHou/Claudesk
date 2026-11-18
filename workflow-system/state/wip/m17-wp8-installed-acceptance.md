---
drive_mode: autopilot
---

# Feature: M17 WP8 — Installed-build acceptance against the mini

**Workflow:** feature
**State:** plan (complete)
**Created:** 2026-11-17

## Problem Statement
M17's exit criteria (`wbs.md` → "## Exit criteria (M17)"; `roadmap.md` → M17) must hold on an INSTALLED
release, not the dev build: dev inherits the terminal's PATH and agent socket, so `ssh`, the ControlMaster
link and the agent socket are only proven from a Finder/Dock launch. Every IN row must work on a live remote
workspace, every OUT row must be absent with no errors logged, a network drop must reconnect to the SAME
session, close and quit must end it (R-1), Detach / Reconnect must work (R-3), and nothing may be left on
either machine beyond CC, tmux and the master link. No new product code is planned: a defect found here is a
SURFACE (or an in-place fix under the verify shortcut's gates), not scope creep.

**Constraints carried in:**
- `/release` is MANUAL-ONLY (its own SKILL: "never auto-invoked"), and it publishes (a GitHub release, the tap
  bump, a push of `main` incl. the two local-only commits `87932f8`, `7a7d099`). It runs on the operator's
  explicit go, even in autopilot.
- ⚠️ Installing is the OPERATOR's act, on their own schedule, through the in-app updater (Check for updates →
  Install). Never `brew upgrade`, never a `cp` into `/Applications`, nothing that kills a running Claudesk
  (memory `never-propose-brew-upgrade-to-verify-a-release`). The agent's part ends at publishing and checking
  the DOWNLOADED artifacts (all three: `.app`, `.dmg`, `.app.tar.gz`; memory `release-is-three-artifacts-verify-each`).
- Real commands fire only in the scratch remote folder `~/claudesk-scratch-remote` on the mini (memory
  `remote-verify-hygiene` #1). The mini's account has NO workflow skills, so the skill / Session-Start / Recycle
  rows use project-local STUB skills there (#5), removed afterwards. The remote account is near its weekly limit:
  tiny turns only.
- The MCP bridge reaches the DEV build only. On the installed build the operator does the clicking and the agent
  runs every CLI capture itself (`ps`, `ssh … tmux -L claudesk ls`, the app log, `projects.json` row sets) —
  memory `verify-human-agent-runs-cli-captures`. The installed build's tmux socket is `claudesk`; dev's is
  `claudesk-dev`.

**3rd-party probe check:** the only external dependency is the SSH host itself, probed by WP1 (✅ `fd4423b`,
`arch/remote-workspaces.md` §C/§C.1/§I). No unprobed integration.

**Backlog read at plan time:**
- `SURFACE-2026-11-17-REMOTE-HOST-WITHOUT-WORKFLOW-SKILLS-…` (medium, product:arch) — the button rows run on stubs
  here; the product answer (probe the host vs document "install the skills") is NOT WP8 scope. Raised as a
  `(decision)` alignment question so the operator sees the gap live before deciding.
- `SURFACE-2026-11-17-AUTO-RESUME-INJECT-ANSWERS-BYPASS-PERMISSIONS-DIALOG-NO-EXIT` (HIGH) — not exercised: the mini's
  account already accepted the bypass warning (WP1 probe outcomes, `skipDangerousModePermissionPrompt: true`). It
  stays open; WP8 neither fixes nor masks it.

## Work Tree

- [ ] Phase 1: Release candidate — publish and check what users receive  <!-- status: in-progress -->
  **Observable outcomes:**
  - CLI: `git log origin/main..main` lists no commits after the release push, and the release tag `git tag --sort=-v:refname | head -1` is newer than `v0.8.3`.
  - CLI: before the push, `git log -p origin/main..main` contains none of the real mini identifiers (host, accounts) recorded in the gitignored memory `mini-remote-user-is-stayman` → `grep -c` = 0 for each.
  - HTTP: the updater endpoint (`latest.json` as `/release` publishes it) → 200, `version` = the new tag, and its signature verifies against the trust anchor key used since v0.2.9.
  - CLI: the DOWNLOADED `.dmg` and the DOWNLOADED `.app.tar.gz` (extracted with `tar`, not `cp`) each pass `stapler validate` and `spctl -a -vv` (`source=Notarized Developer ID`); `shasum` of each download = the published asset.
  **Alignment questions:**
  - Version number for this cut (M17 is the first remote-workspace release): the `/release` default, or a minor bump? `(decision)`
  - [x] P1.1 Pre-release gate: `pnpm verify:auto` on HEAD; public-repo identifier grep over `origin/main..main`
    - Evidence: `pnpm verify:auto` EXIT=0 (73 s) on the exact code committed as `7a7d099` (later edits are prettier-ignored docs only). Identifier grep over `git log -p origin/main..main` (`87932f8`, `7a7d099`): 5 patterns (the full host, its ≥4-char labels, the tailnet suffix, the admin account), derived from the dev/prod `projects.json` remote keys, → 0 hits each.
  - [ ] P1.2 ⏸ Operator go for `/release` (manual-only, outward-facing), then run `/release`  <!-- status: BLOCKED: Apple notary 403 (agreement missing/expired) -->
    - Operator go given 2026-11-17 for **v0.9.0**. `/release` step 1 preconditions: gh OK, tree clean except this WIP, tap SSH remote OK, minisign keys present, 1 Developer ID identity, arm64 — but `xcrun notarytool history --keychain-profile claudesk-notary` → `HTTP status code: 403. A required agreement is missing or has expired.` Stopped before step 2: nothing bumped, pushed, tagged or published. Unblock: the operator accepts the pending agreement at developer.apple.com (Account → Agreements) / App Store Connect, then `/release` resumes at step 1.
  - [ ] P1.3 Check the downloaded artifacts + the updater endpoint; hand the install to the operator (in-app updater, their timing)  <!-- status: NOT-STARTED -->
  - [ ] verify-auto  <!-- status: NOT-STARTED -->
  - [ ] verify-self  <!-- status: NOT-STARTED -->
  - [ ] verify-human  <!-- status: NOT-STARTED -->
  - [ ] verify-codify  <!-- status: NOT-STARTED -->

- [ ] Phase 2: IN rows on the installed build (8.2)  <!-- status: NOT-STARTED; depends on Phase 1 AND the operator having installed it -->
  **Observable outcomes:**
  - CLI: the running installed app is the new version — `defaults read /Applications/Claudesk.app/Contents/Info CFBundleShortVersionString` = the new tag, and `ps` shows `/Applications/Claudesk.app/Contents/MacOS/claudesk` started AFTER the install (launched from the Dock/Finder, so the GUI PATH is in force).
  - CLI (state-changing, mini scratch folder): with a scratch remote row `ssh://<user>@<mini-host>/~/claudesk-scratch-remote` added through the picker's add-remote flow, opening it gives `ssh <mini> 'zsh -l -s' <<< 'tmux -L claudesk ls'` → exactly one session for that folder, and `ps -axo pid,ppid,command | awk '$3=="/usr/bin/ssh" && $4=="-M"'` → exactly one master for the host, PPID = the installed app's PID.
  - CLI: the installed app's prod `~/.claude/settings.json` hook registration and the mini's `~/.claude/settings.json` both carry Claudesk's hook entry, and the mini's still has `skipDangerousModePermissionPrompt: true` (WP4's merge preserved it).
  - CLI (state-changing, mini scratch folder): stub skills under `~/claudesk-scratch-remote/.claude/skills/` (`session-handoff` writes `workflow-system/state/.session.md`; `session-restore`, `session-start` and one skill-button target reply one word). After a close + reopen, a Recycle leaves `.session.md` written then consumed (`ssh … test -f` before/after), and the remote transcript shows each injected command name once.
  - CLI: auto-resume's three doors on the scratch row — (a) reopen while the tmux session lives → `tmux ls` shows the SAME session id before and after (reconnect); (b) a session killed uncleanly (`tmux kill-session` on the mini) → the respawn's remote argv contains `--continue` (`ps` on the mini); (c) a clean close with a `.session.md` present → the remote transcript's first user turn is `/session-restore`.
  - CLI: the drive-mode line reaches the remote CC — the remote transcript of a one-word turn contains `Claudesk reports the drive mode for this workspace as <mode>` matching the picker row's mode.
  - CLI: the WP7 MAJOR fix, live — 5 quick Docs↔Prompt switches within 3 s on the remote workspace, then 30 s idle: the app log contains no `the check took too long`, and the operator's toast shows no error (operator screenshot or confirmation).
  **Alignment questions:**
  - Terminal on the remote workspace: typing, scrollback, truecolor and a resize feel like a local pane? (happy path, operator-held feel)
  - Status dots on all three surfaces (filmstrip, menu bar, PiP), incl. the BLUE attention overlay at a verify-human pause and purple background work: do they agree and read right?
  - Docs and Prompt on the remote workspace: Docs lists the scratch folder's workflow docs and refreshes on a remote edit while fronted; a Prompt send lands in the remote CC. As you expected?
  - Thumbnails of the remote workspace in the filmstrip: acceptable?
  - Workflow buttons on a host WITHOUT the skills (seen live, before the stubs go in): install the skills on the mini's account, add a per-host skills probe to the product, or document it? `(decision)` — feeds `SURFACE-…-REMOTE-HOST-WITHOUT-WORKFLOW-SKILLS-…`, not WP8 code.
  - [ ] P2.1 Confirm the installed version + Dock launch; add the scratch remote row through the picker (operator clicks, agent captures)  <!-- status: NOT-STARTED -->
  - [ ] P2.2 Terminal, dots on 3 surfaces + attention, Docs (+ the WP7 MAJOR quick-switch check), Prompt, drive-mode line, thumbnails  <!-- status: NOT-STARTED -->
  - [ ] P2.3 Workflow buttons: observe the no-skills state first, then stub skills, close + reopen, skill / Session-Start / Recycle  <!-- status: NOT-STARTED -->
  - [ ] P2.4 Auto-resume's three doors (reconnect, `--continue`, `/session-restore`)  <!-- status: NOT-STARTED -->
  - [ ] verify-auto  <!-- status: NOT-STARTED -->
  - [ ] verify-self  <!-- status: NOT-STARTED -->
  - [ ] verify-human  <!-- status: NOT-STARTED -->
  - [ ] verify-codify  <!-- status: NOT-STARTED -->

- [ ] Phase 3: OUT rows, resilience, and nothing left behind (8.3–8.5)  <!-- status: NOT-STARTED; depends on Phase 2 -->
  **Observable outcomes:**
  - CLI: on the remote workspace, each OUT surface (editor, diff, terminal tab, file tree, finder, search, Sublime launchers, supervisor, turn jump) is absent; firing each OUT chord (⌘⇧E/D/T, ⌘P, ⌘⇧F, ⌘N, ⌘T) gives ONE neutral info notice; the app log over the whole session has no `os error`, no panic, no refused-command error from an OUT command (`grep -c` = 0).
  - CLI (operator action: Tailscale off ~20 s, then on): the tmux session id on the mini is the SAME before and after, the link overlay shows Reconnecting then clears, and a one-word turn after the drop gets its answer (remote transcript).
  - CLI: Detach → `tmux ls` still lists the session and no `ssh -M` remains for the host once no workspace uses it; reopening the row → attach to the SAME session id (R-3).
  - CLI: explicit close → the remote session is gone from `tmux ls` within 10 s (R-1 `/exit`); reopen, then QUIT the app (⌘Q) → session gone, and on the main box no `ssh -M` for the host survives (`ps` awk match = 0).
  - CLI: no system extension on the main box — `systemextensionsctl list` shows no Claudesk/Tailscale-unrelated entry added by Claudesk; on the mini after the run, `ps -U <user>` shows nothing Claudesk started beyond CC, tmux and sshd (no poller process, no leftover `claude` without a tmux parent).
  - CLI (state-changing, dev app on the same scratch row): dev (`pnpm tauri:dev`) and prod open the scratch folder at once → the mini shows `tmux -L claudesk` AND `tmux -L claudesk-dev` sessions, each app's dots move only for its own session (a one-word turn in each), and the mini's `settings.json` keeps BOTH hook entries (prod `claudesk-hook.pl`, dev `claudesk-hook-dev.pl`).
  - CLI (cleanup): afterwards the scratch remote row is removed from prod and dev `projects.json` (row sets back to their pre-run sets), `~/claudesk-scratch-remote/.claude/` is removed, and no `claudesk`/`claudesk-dev` tmux server or `ssh -M` remains.
  **Alignment questions:**
  - The drop/reconnect as you experienced it (overlay wording, how long it took): acceptable for v1?
  - Every exit criterion seen: is M17 accepted, ready for `/product-finalize`? `(decision)`
  - [ ] P3.1 OUT rows + log sweep  <!-- status: NOT-STARTED -->
  - [ ] P3.2 Resilience: Tailscale drop, Detach / Reconnect, close and quit end the session  <!-- status: NOT-STARTED -->
  - [ ] P3.3 Hygiene: no system extension, nothing left on the mini, dev vs prod on the same mini don't cross; clean up  <!-- status: NOT-STARTED -->
  - [ ] verify-auto  <!-- status: NOT-STARTED -->
  - [ ] verify-self  <!-- status: NOT-STARTED -->
  - [ ] verify-human  <!-- status: NOT-STARTED -->
  - [ ] verify-codify  <!-- status: NOT-STARTED -->

## Current Node
- **Path:** Feature > Phase 1 > P1.2
- **Active scope:** P1.2 (v0.9.0 approved; blocked on the Apple Developer agreement, notary 403)
- **Blocked:** P1.2 waits on the operator's explicit go for `/release`; Phase 2 waits on the operator's own install
- **Unvisited:** Phase 2 (IN rows on the installed build), Phase 3 (OUT rows, resilience, hygiene)
- **Open discoveries:** none

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->
- [RESOLVED-2026-11-17] P1.2 — `/release` step 1's vocabulary check: every observed type is classified. `backlog.md`'s `SURFACE-2026-11-08-QUOTA-AUTO-RESUME-FIRED-…` was a stale duplicate (fixed in `4de4e70`, 2026-11-06, before it was filed); deleted with a CHANGELOG line.

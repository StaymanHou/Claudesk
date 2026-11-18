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

- [x] Phase 1: Release candidate — publish and check what users receive
  **Observable outcomes:**
  - CLI: `git log origin/main..main` lists no commits after the release push, and the release tag `git tag --sort=-v:refname | head -1` is newer than `v0.8.3`.
  - CLI: before the push, `git log -p origin/main..main` contains none of the real mini identifiers (host, accounts) recorded in the gitignored memory `mini-remote-user-is-stayman` → `grep -c` = 0 for each.
  - HTTP: the updater endpoint (`latest.json` as `/release` publishes it) → 200, `version` = the new tag, and its signature verifies against the trust anchor key used since v0.2.9.
  - CLI: the DOWNLOADED `.dmg` and the DOWNLOADED `.app.tar.gz` (extracted with `tar`, not `cp`) each pass `stapler validate` and `spctl -a -vv` (`source=Notarized Developer ID`); `shasum` of each download = the published asset.
  **Alignment questions:**
  - Version number for this cut (M17 is the first remote-workspace release): the `/release` default, or a minor bump? `(decision)`
  - [x] P1.1 Pre-release gate: `pnpm verify:auto` on HEAD; public-repo identifier grep over `origin/main..main`
    - Evidence: `pnpm verify:auto` EXIT=0 (73 s) on the exact code committed as `7a7d099` (later edits are prettier-ignored docs only). Identifier grep over `git log -p origin/main..main` (`87932f8`, `7a7d099`): 5 patterns (the full host, its ≥4-char labels, the tailnet suffix, the admin account), derived from the dev/prod `projects.json` remote keys, → 0 hits each.
  - [x] P1.2 ⏸ Operator go for `/release` (manual-only, outward-facing), then run `/release`
    - Go given 2026-11-17 for **v0.9.0**. First blocked by Apple's notary 403 (a Developer agreement; the operator accepted it), then by `No Keychain password item` (screen locked; cleared on unlock, no `store-credentials`).
    - `Release v0.9.0` = `14f0237` (pushed with `87932f8`, `7a7d099`, `ddefbb9`); tag `v0.9.0`; https://github.com/StaymanHou/Claudesk/releases/tag/v0.9.0 with 4 assets; tap `c86e417` (`claudesk 0.9.0`). Cold build 129 s; notarization `d3ad8cc2-…` Accepted; staple → re-tar → re-sign; `/release` 3d all four checks green.
    - ⚠️ `brew audit` could not run: this Mac's Command Line Tools predate macOS 27 (Homebrew refuses). `brew style` clean; the cask diff is version + sha256 only, both verified against the download. Pushed on the operator's go without the audit.
  - [x] P1.3 Check the downloaded artifacts + the updater endpoint; hand the install to the operator (in-app updater, their timing)
    - `releases/latest/download/latest.json` → HTTP 200, `version` 0.9.0, signature == the downloaded `.sig`. The `.dmg`, `.app.tar.gz` and `.sig` downloads are byte-identical to the local build (sha256). Downloaded `.dmg`: `stapler validate` OK, `spctl` accepted `source=Notarized Developer ID`. Downloaded payload extracted with `tar`: `stapler validate` OK, `spctl` accepted `source=Notarized Developer ID`. Minisign: the `.sig`'s key id = `774E2E8429FDF78A` (the `tauri.conf.json` trust anchor); payload signature (Ed25519 over BLAKE2b-512, via OpenSSL 3) and trusted-comment signature both `Signature Verified Successfully`; a one-byte-flipped payload is REJECTED (negative control).
  - [x] verify-auto
    - evidence: `jq -e '.version=="0.9.0"' src-tauri/tauri.conf.json` → exit 0; `prettier --check src-tauri/tauri.conf.json` → exit 0 (no reflow, the v0.6.0 trap); `cargo metadata --locked --offline` → exit 0, `claudesk` 0.9.0 (Cargo.toml and Cargo.lock agree); `git rev-parse HEAD` == `origin/main` == `v0.9.0^{commit}` = `14f0237`. Full gate `pnpm verify:auto` EXIT=0 on the code at `7a7d099` (P1.1); the release commit changes only these three version lines.
  - [x] verify-self  (fresh `feature-verify-self-runner` subagent against the PUBLISHED release; downloads in the session scratchpad `vs1/`; repo untouched)
    - [x] O1 tag + push — evidence: after `git fetch`, `origin/main..main` = 0 commits; newest tag v0.9.0 (then v0.8.3); v0.9.0 = origin/main = main = `14f0237`.
    - [x] O2 no real identifiers — evidence: `git log -p v0.8.3..v0.9.0` (44,525 lines) + the release notes body, `grep -cF` per pattern: full host 0/0, both host labels 0/0, the admin account 0/0, the account 0/0. the literal tailnet-suffix pattern scored 15/0, and every hit is a made-up example (`tail0000` / `tail1234`) or a bare tailnet-suffix filter-syntax example, already public before this cut. Orchestrator ruling: the pattern is too broad, not a leak, so PASS. (The pre-push grep over only the unpushed commits scored 0 on it.)
    - [x] O3 updater endpoint + trust anchor — evidence: `latest.json` http 200, version 0.9.0, url → v0.9.0 `Claudesk.app.tar.gz` (http 200, 10,245,221 B); pubkey key id `774E2E8429FDF78A`, the key's sha256 unchanged at v0.2.9 / v0.9.0 / HEAD; `openssl pkeyutl -verify` payload exit 0 and trusted comment exit 0; one-bit-flipped payload exit 1 and flipped comment exit 1 (negative controls).
    - [x] O4 downloaded artifacts — evidence: dmg + `tar`-extracted app: `stapler validate` OK; `spctl` accepted `source=Notarized Developer ID`; sha256 of dmg / tar.gz / sig downloads = the local build; dmg sha256 = the repo cask = the remote tap cask (both version 0.9.0); tarball 12 members, 0 AppleDouble, no top-level non-dir.
    - [x] align: Version number for this cut — evidence: `Claudesk v0.9.0`, tag v0.9.0 (v0.8.3 → v0.9.0, minor), published 2026-11-18T01:36:12Z, not draft or prerelease, `releases/latest` → v0.9.0. (The operator already chose v0.9.0 at P1.2.)
  - [x] verify-human — zero admissible leaves (F11). The `(decision)` version question was already decided by the operator at P1.2 (v0.9.0); the skipped `brew audit` was accepted at Gate 2; the tailnet-suffix pattern ruling is on an Assumed line.
  - [x] verify-codify — no new tests: the phase changes only version metadata (no integration boundary in code); the release's properties live in the published artifacts and are enforced by `/release` 3d + 7 and re-checked on the downloads. A repo test against a live GitHub release would be network-bound and outside `verify:auto`.
    Test scope: full — suite not long (`runtimes.md` → `pnpm verify:auto` Last 73 s)
    - evidence: `pnpm verify:auto` EXIT=0, 120 s (cold debug build after the release's `cargo clean`); vitest 4045 passed; cargo lib 1362 passed, 0 failed.

- [x] Phase 2: IN rows on the installed build (8.2)
  **Observable outcomes:**
  - CLI: the running installed app is the new version — `defaults read /Applications/Claudesk.app/Contents/Info CFBundleShortVersionString` = the new tag, and `ps` shows `/Applications/Claudesk.app/Contents/MacOS/claudesk` started AFTER the install (launched from the Dock/Finder, so the GUI PATH is in force).
  - CLI (state-changing, mini scratch folder): with a scratch remote row `ssh://<user>@<mini-host>/~/claudesk-scratch-remote` added through the picker's add-remote flow, opening it gives `ssh <mini> 'zsh -l -s' <<< 'tmux -L claudesk ls'` → exactly one session for that folder, and `ps -axo pid,ppid,command | awk '$3=="/usr/bin/ssh" && $4=="-M"'` → exactly one master for the host, PPID = the installed app's PID.
  - CLI: the installed app's prod `~/.claude/settings.json` hook registration and the mini's `~/.claude/settings.json` both carry Claudesk's hook entry, and the mini's still has `skipDangerousModePermissionPrompt: true` (WP4's merge preserved it).
  - CLI (state-changing, mini scratch folder): stub skills under `~/claudesk-scratch-remote/.claude/skills/` (`session-handoff` writes `workflow-system/state/.session.md`; `session-restore`, `session-start` and one skill-button target reply one word). After a close + reopen, a Recycle leaves `.session.md` written then consumed (`ssh … test -f` before/after), and the remote transcript shows each injected command name once.
  - CLI: auto-resume's three doors on the scratch row — (a) reopen while the tmux session lives → `tmux ls` shows the SAME session id before and after (reconnect); (b) a session killed uncleanly (`tmux kill-session` on the mini) → the respawn's remote argv contains `--continue` (`ps` on the mini); (c) a clean close with a `.session.md` present → the remote transcript's first user turn is `/session-restore`.
  - CLI: the drive-mode line reaches the remote CC — the remote transcript of a one-word turn contains `Claudesk reports the drive mode for this workspace as <mode>` matching the picker row's mode.
  - CLI: the supervisor entry's check 6 (owed since v0.8.3; `1ccf9c4` moved the adjudicator spawn): after some days of normal use on the installed 0.9.0, `supervisor-activity.log` holds ≥1 `adjudicator (` verdict with `"appVersion":"0.9.0"`. As of 2026-11-17 the newest is from 0.8.0. (Dogfood evidence, not a blocker on Phase 2's other rows.)
  - CLI: the WP7 MAJOR fix, live — 5 quick Docs↔Prompt switches within 3 s on the remote workspace, then 30 s idle: the app log contains no `the check took too long`, and the operator's toast shows no error (operator screenshot or confirmation).
  **Alignment questions:**
  - Terminal on the remote workspace: typing, scrollback, truecolor and a resize feel like a local pane? (happy path, operator-held feel)
  - Status dots on all three surfaces (filmstrip, menu bar, PiP), incl. the BLUE attention overlay at a verify-human pause and purple background work: do they agree and read right?
  - Docs and Prompt on the remote workspace: Docs lists the scratch folder's workflow docs and refreshes on a remote edit while fronted; a Prompt send lands in the remote CC. As you expected?
  - Thumbnails of the remote workspace in the filmstrip: acceptable?
  - ~~Workflow buttons on a host WITHOUT the skills: install, probe, or document? `(decision)`~~ **DECIDED by the operator 2026-11-17** (after seeing `Unknown command: /session-restore` live on the first open): detect + install on a remote host becomes **Milestone 18** (`roadmap.md`), not WP8 code, with remote profiles decided there too; the mini's dev account is set up by hand now.
  - [x] P2.1 Confirm the installed version + Dock launch; add the scratch remote row through the picker (operator clicks, agent captures)
    - **Relevance check (before Phase 2):** requester still needs this: yes (M17 exit criteria) · requirements unchanged: yes · solution still feasible: yes · no superior alternative: yes. **Verdict:** proceed.
    - Pre-state 2026-11-17: `/Applications/Claudesk.app` `CFBundleShortVersionString` = 0.9.0; PID 49107, PPID 1 (launchd: the updater's relaunch), started 20:45:49. Prod `projects.json`: 30 rows, 0 remote (row set saved in the session scratchpad `prod-rows-before.txt`). Prod `settings.json` `workflow_features_enabled: true`.
    - ⚠️ `tailscale status` → "Tailscale stopped", so the mini's name does not resolve. Waiting on the operator to start Tailscale. (The dev `projects.json`'s one remote row still names the admin account; per memory `mini-remote-user-is-stayman` the scratch row uses the dev account.)
    - Tailscale started by the operator. Mini pre-state (dev account, `zsh -l`): `~/claudesk-scratch-remote` = `README.md` + WP5's `workflow-system/state/.session.md`; no `claudesk` and no `claudesk-dev` tmux server; no claude/tmux processes; `claude` = `~/.local/bin/claude` 2.1.326; `~/.claude/settings.json` `skipDangerousModePermissionPrompt: True`, hooks = 10 entries, ALL the dev app's (`~/.claudesk/com.claudesk.app.dev/claudesk-remote-hook-dev.pl`), none from prod yet; `~/.claude/skills` absent; `~/.claudesk/` = `cc-oauth-token` + `com.claudesk.app.dev/` only (no prod dir yet).
  - [x] P2.1 evidence (first open, 20:58): operator added the row through the picker ("worked well"), the next-open label predicted `/session-restore`, the open showed the CC pane, then `Unknown command: /session-restore` (screenshot). Captures: exactly ONE `ssh -M` for the host, PPID 49107 (the installed app); `tmux -L claudesk ls` → one session `cd-f37d9999` (attached); the remote CC argv `claude --permission-mode bypassPermissions`; the mini's `settings.json` now has 10 prod `claudesk-remote-hook.pl` entries ALONGSIDE the 10 dev ones, `skipDangerousModePermissionPrompt: True` kept; `~/.claudesk/com.claudesk.app/` deployed (cc-launch, hook script, hook.sock, tmux.conf); prod `status-channel.log` shows the remote events `resolved=ws-2` (origin routing). Prod `projects.json` gained exactly one row, `ssh://stayman@<host>/Users/stayman/claudesk-scratch-remote` (the `~` was normalized to the absolute path).
  - [x] P2.2 Terminal, dots on 3 surfaces + attention, Docs (+ the WP7 MAJOR quick-switch check), Prompt, drive-mode line, thumbnails
    - Operator: "all good" for all 7 steps (drive mode, Prompt + dots, blue, purple, terminal feel, Docs + quick switch with no red toast, thumbnails).
    - Captures: prod `projects.json` scratch row `default_drive_mode: orchestrated`; the remote transcript has 20× `Claudesk reports the drive mode for this workspace as orchestrated`, and the user turns `reply with only the word ok` (→ `ok`, sent from the Prompt panel), `use AskUserQuestion…` (→ AskUserQuestion, answered), `run "sleep 30" as a background task…` (→ Bash background, then the task-notification turn). The prod `status-channel.log` for `cwd=…/claudesk-scratch-remote`, in order: UPS running → Stop idle; UPS running → Notification **awaiting_input** → PostToolUse running → Stop idle; UPS running → PostToolUse running → Stop **background_work**; UPS running → Stop idle. Every event was `outcome=emitted`.
    - The drive-mode change on the open workspace triggered the M12 turn-respawn: the transcript shows `/exit` at 21:08:05 and the session continuing in the SAME transcript file, and the tmux session was recreated at 21:08:08. As designed, a respawn uses `--continue`, so the scratch `.session.md` was NOT consumed (still present).
    - The WP7 MAJOR quick-switch check: the toast is frontend-only (no log line), so the evidence is the operator's observation (no red "took too long" after ~5 fast Docs↔Prompt switches + 30 s).
  - [x] P2.3 Workflow buttons: observe the no-skills state first, then ~~stub skills~~ the REAL skills (installed by hand 2026-11-17), close + reopen, skill / Session-Start / Recycle — ⚠️ Recycle's respawn FAILS on remote (operator: not blocking)
    - Batch A (operator: steps 1–3 "worked well"; 4 "handoff worked, but CC not restarted"). Evidence: close × → the old transcript `cb495f65-…` ends with `/exit` at 21:12:05 (R-1 close ends the session); reopen → a NEW transcript `4214b37c-…` starts with `/session-restore` (the real skill, which consumed WP5's `.session.md`), then the **start** button's `/session-start`, then the **recycle** button's `/session-handoff` (wrote a fresh `.session.md` at 21:13, `resume_skill: /session-start`), then `/exit` at 21:13:15. The status log has the handoff `Stop` then `SessionEnd`, then nothing: no `SessionStart`, no `claude`, no `claudesk` tmux server, `.session.md` unconsumed.
    - No-skills state observed at the first open: the auto-resume typed `/session-restore` and CC answered `Unknown command: /session-restore` (operator screenshot); the gate-ON skill row (start, clear, restore, capture, prune, paydown, recycle) was shown on that host anyway, which is the M18 gap.
    - Manual setup of the mini's dev account (operator: "for the tank project, just manually set it up"): no GitHub access there (`Permission denied (publickey)`, no `gh`), so the mccc repo's pushed `main` (`f8e8873`) went over as a git bundle → `~/my-claude-code-customization`, `origin` = the GitHub URL; `./install.sh` → 48 skills + 6 agents linked, `~/.claude/CLAUDE.md` created with the workflow block; the 4 printed permissions merged into `~/.claude/settings.json` (backup `settings.json.bak-mccc-install-2026-11-17`), with both Claudesk hook sets unchanged (10 dev + 10 prod), every top-level key kept and `skipDangerousModePermissionPrompt` still true.
    - ⚠️ Plan change: the stub-skill step is dropped, since the real skills are present. CC loads skills when it STARTS, so the open scratch session must be closed and reopened before the button checks. Real commands still fire only in the scratch folder.
  - [x] P2.4 Auto-resume's three doors (reconnect, `--continue`, `/session-restore`)
    - Operator: Batch B "all good" (close, reopen with `/session-restore`, Detach, reopen = reconnect).
    - Captures: `/session-restore` door ✓ twice with the REAL skill (transcript `4214b37c-…` at 21:12:18, and `31f40dbc-…` at 21:17:09, each consuming the `.session.md` present at the time; `.session.md` absent afterwards). A `--continue` start is observed at 21:17:26 (a `SessionStart` continuing transcript `31f40dbc-…`). The logs do NOT show which click each step was: at 21:17:19 the remote CC got `/exit` (`SessionEnd`), and by the time of the capture no tmux server or ssh master was left. Whether Detach leaves the session running is therefore re-checked with captures at P3.2 (R-3), not inferred here.
  - [x] verify-auto
    - evidence: no code changed in Phase 2 — `git diff --name-only` lists only `.md` files (runtimes, roadmap, backlog, this WIP), so 0 non-doc files. The mini's manual install: `~/.claude/settings.json` parses (json.load ok); 0 broken symlinks under `~/.claude/skills` + `~/.claude/agents`; `~/.claude/CLAUDE.md` has 1 workflow-block marker; the `~/my-claude-code-customization` clone has 0 dirty files.
  - [x] verify-self  (fresh `feature-verify-self-runner`, READ-ONLY re-derivation from persisted evidence: transcripts, `status-channel.log`, both `settings.json`, prod `projects.json`, the installed bundle)
    - [x] O1 installed version — evidence: `CFBundleShortVersionString` 0.9.0; `49107 1 Tue Nov 17 20:45:49 2026 /Applications/Claudesk.app/Contents/MacOS/claudesk` (PPID 1, a LaunchServices launch); bundle mtime 20:45:49 (the updater's replace).
    - [x] O2 remote row + nothing left running — evidence: prod `projects.json` has exactly 1 `ssh://` row (of 31), `ssh://stayman@<host>/Users/stayman/claudesk-scratch-remote`, orchestrated; REGISTRY register lines ws-2…ws-7 for that key; STATUS events for its cwd resolve to them. Now: mini `tmux -L claudesk ls` → no server; no local `/usr/bin/ssh -M`. The live one-session / one-master / PPID check rests on the orchestrator's capture at open time (P2.1 evidence). Leftover: a control-socket FILE `com.claudesk.app/ssh/12bd9fa9` (21:17) held by no process (`lsof` empty), carried to P3.3.
    - [x] O3 hooks — evidence: local `~/.claude/settings.json` {`claudesk-hook.pl`: 10, `claudesk-hook-dev.pl`: 10}; mini {`claudesk-remote-hook.pl`: 10, `claudesk-remote-hook-dev.pl`: 10} over the same 10 events; mini `skipDangerousModePermissionPrompt` = True; `permissions.allow` = exactly the 4 mccc entries.
    - [x] O4 workflow buttons <!-- status: FAILED — accepted non-blocking by operator ruling 2026-11-17 ("not a blocker tho. we can fix it later. for now I just avoid recycle on remote sessions") --> — evidence: no stubs (`~/claudesk-scratch-remote/.claude` holds only an empty `memory/` CC made at 21:12, no `skills/`); `~/.claude/skills` has 48 symlinks into the mccc clone, 0 broken; transcript `4214b37c` has `/session-restore` (L5 02:12:18Z), `/session-start` (L50), `/session-handoff` (L74, 02:13:06–14Z) and `/exit` (L98 02:13:15Z), once each. ✗ Recycle respawn: `Stop` 21:13:14 → `SessionEnd` 21:13:15 → no `SessionStart` until a FRESH open (register ws-5, 21:17:07). The runner rated it BLOCKING per the taxonomy; the operator's ruling makes it non-blocking. → `SURFACE-2026-11-17-REMOTE-RECYCLE-NEVER-RESPAWNS-CC`.
    - [x] O5 auto-resume doors — (c) ✓ the first user turn of `4214b37c` (02:12:18Z) and of `31f40dbc` (02:17:09Z) is `/session-restore`, and `.session.md` is consumed (02:17:12Z `rm`). (b) PARTIAL: two `--continue` starts (21:08:11 into `cb495f65` after its `/exit`; 21:17:26 into `31f40dbc` after its `/exit`), both after a CLEAN exit; the KILLED-uncleanly door was never driven (Batch B ended before the agent's kill step) → **moved to Phase 3 (P3.2a)**. (a) <!-- status: UNVERIFIED: undrivable — live-only (an attach emits no SessionStart); the ws-3→ws-4 and ws-7 reopens show no SessionEnd/SessionStart, which fits a reattach; the operator reported reconnect "all good" -->.
    - [x] O6 drive-mode line — evidence: ssh row `default_drive_mode` "orchestrated"; `cb495f65` has 20× `Claudesk reports the drive mode for this workspace as orchestrated` (no other value), and the turn `reply with only the word ok` (L12, 02:08:31Z) → `ok` (L33).
    - [ ] O7 supervisor check 6  <!-- status: UNVERIFIED: undrivable — needs days of real use on 0.9.0; 0 `adjudicator (` lines at 0.9.0 (only 11 supervisor lines of any kind so far); newest adjudicator verdict is 0.8.0 (~2026-11-03). Dogfood; carried past WP8 on the supervisor backlog entry. -->
    - [x] O8 WP7 MAJOR quick-switch <!-- status: UNVERIFIED: no harness — the catch-up toast is frontend-only and unlogged (no app log; 0 "took too long" hits in app data); buildable: yes (log catch-up outcomes to status-channel.log). The operator observed no red toast. -->
    - [x] align: terminal feel — evidence: none persisted; the remote `tmux.conf` has `status off`, `mouse on`, `terminal-features ',xterm*:RGB'`, and `cc-launch` does `unset TMUX` and sets `CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN=1`. Operator: "all good".
    - [x] align: dots on 3 surfaces — evidence: the backend emitted running → idle → awaiting_input (21:08:50) → running → background_work (21:09:06, bg=1, bg_types=shell) → idle (21:09:37) for the remote cwd. Agreement across the 3 surfaces + the blue overlay was seen only by the operator: "all good".
    - [x] align: Docs + Prompt — evidence: the one-word turn landed (`cb495f65` L12/L33; UPS → Stop on ws-2). Docs listing/refresh leaves no trace. Operator: "all good".
    - [x] align: thumbnails — evidence: none on disk. Operator: "all good".
    - [x] align: no-skills workflow buttons (decision) — evidence: `roadmap.md:180 ### Milestone 18: Remote workflow substrate (planned 2026-11-17, not decomposed)`; decided by the operator.
  - [x] verify-human (F13 — every leaf was answered by the operator live during build; none re-asked)
    - [x] P2.verify-human.1 happy path (terminal feel, Prompt + dots, blue, purple, Docs, thumbnails) — operator: "all good" (P2.2 steps 1–7)
    - [x] P2.verify-human.2 (decision) workflow buttons on a host without the skills — operator: Milestone 18; the tank account set up by hand
    - [x] P2.verify-human.3 (decision) remote Recycle doesn't respawn CC — operator: accepted non-blocking, fix later (`SURFACE-2026-11-17-REMOTE-RECYCLE-NEVER-RESPAWNS-CC`)
    - [x] P2.verify-human.4 (live-only) reconnect after Detach — operator: Batch B "all good"; Detach re-checked with captures at P3.2
    - [x] P2.verify-human.5 (no harness) no "took too long" toast after quick switching — operator: "all good"
    - Carried (not blocking): supervisor check 6 (O7) needs days of real use on 0.9.0, so it stays on the supervisor backlog entry past WP8.
  - [x] verify-codify — no new tests: Phase 2 changed no code (acceptance on the installed build + docs; no integration boundary in code). The one defect found (remote Recycle never respawns) gets its failing test WITH its fix (`SURFACE-2026-11-17-REMOTE-RECYCLE-NEVER-RESPAWNS-CC` suggests the `RemotePorts`/`RemoteTerminal` seam).
    Test scope: full — suite not long (`runtimes.md` → `pnpm verify:auto` Last 120 s)
    - evidence: `pnpm verify:auto` EXIT=0, 50 s; vitest 4045 passed; cargo lib 1362 passed, 0 failed.

- [ ] Phase 3: OUT rows, resilience, and nothing left behind (8.3–8.5)  <!-- status: in-progress -->
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
  - [ ] P3.2a (moved from P2.4) The killed-uncleanly door: with the workspace Detached, the agent runs `tmux -L claudesk kill-session` on the mini; the operator reopens → the remote argv (`ps` on the mini) contains `--continue` and the transcript continues  <!-- status: NOT-STARTED -->
  - [ ] P3.3 Hygiene: no system extension, nothing left on the mini, dev vs prod on the same mini don't cross; clean up (incl. the stale control-socket file `com.claudesk.app/ssh/12bd9fa9` and the scratch folder's CC-made `.claude/memory/`)  <!-- status: NOT-STARTED -->
  - [ ] verify-auto  <!-- status: NOT-STARTED -->
  - [ ] verify-self  <!-- status: NOT-STARTED -->
  - [ ] verify-human  <!-- status: NOT-STARTED -->
  - [ ] verify-codify  <!-- status: NOT-STARTED -->

## Current Node
- **Path:** Feature > Phase 3 > P3.1
- **Active scope:** P3.1
- **Blocked:** none (v0.9.0 installed by the operator 2026-11-17, running since 20:45:49)
- **Unvisited:** none beyond Phase 3
- **Open discoveries:** none

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->
- [RESOLVED-2026-11-17] P1.2 — `/release` step 1's vocabulary check: every observed type is classified. `backlog.md`'s `SURFACE-2026-11-08-QUOTA-AUTO-RESUME-FIRED-…` was a stale duplicate (fixed in `4de4e70`, 2026-11-06, before it was filed); deleted with a CHANGELOG line.
- [SURFACED-2026-11-17] P2.3 — Remote Recycle runs the handoff and `/exit` but never respawns CC → `SURFACE-2026-11-17-REMOTE-RECYCLE-NEVER-RESPAWNS-CC` (medium). An M17 IN row failing; the operator ruled it non-blocking (workaround: don't Recycle a remote session). Must be carried at M17's close.

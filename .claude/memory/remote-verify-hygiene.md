---
name: remote-verify-hygiene
description: Live remote checks: the mini's remote row is a REAL repo (fire real commands only in a scratch remote folder); before stopping an agent-launched dev app, check for the operator's open remote workspaces.
metadata:
  type: project
---

Two hazards specific to live verification of remote workspaces (M17), both hit 2026-11-16 in WP3.

**1. The mini's remote row points at a REAL repo with live workflow state.** The dev
`projects.json`'s only remote row is the operator's `~/my-claude-code-customization` on the mini. A
Phase 4 verify-self check clicked the real **restore** skill button to prove a scrolled-up inject
lands. The remote CC ran `/session-restore` for real. That repo had a live `.session.md`, so before
its drive-mode question it deleted the pointer and stripped an uncommitted footer from an archived WIP.
Both were restored from the remote transcript's own tool results.
- **How to apply:** a live check that fires a REAL command into a remote pane (a skill button,
  `/session-*`, a Prompt send that CC acts on) uses a **scratch remote folder** (add a temporary
  remote row for e.g. `~/claudesk-scratch-remote`, remove it after; restore `projects.json`'s row set).
  On the real row, inject only inert text, or a prompt like "reply with only the word ok".
  The local equivalent is the `../claudesk-scratch/` rule in `docs/lessons/verify-self-tiers.md`.

**2. An agent-launched dev app may be in the operator's use, and a kill orphans remote state.** At
P5.verify-human.1 the operator opened the remote row in the dev app the agent had started, and ran
their own test. At codify the agent stopped the app with `kill` (SIGTERM). A killed app runs no
teardown: its ssh master was left orphaned (PPID 1) and the remote tmux session kept running
(`SURFACE-2026-11-16-REMOTE-LINK-MASTER-ORPHANED-WHEN-THE-APP-IS-KILLED`).
- **How to apply:** before stopping an agent-launched dev app, run `pgrep -fl 'ssh -M'` and
  `ssh <mini> 'zsh -l -s' <<< 'tmux -L claudesk-dev ls'`. If either shows a session, close the
  workspaces through the UI (the bridge `filmstrip-close-*` button) so the close path runs, or ask the
  operator first. After any hard stop, sweep both and clean up what you caused. Related:
  [[lsof-ti-tcp-misses-ipv6-vite]] ("never kill a `target/debug/claudesk` you didn't launch").

**3. A `tauri:dev` rebuild-restart is a hard stop too** (hit twice at M17 WP4, 2026-11-16). The watcher
rebuilds AND restarts the app on any save under `src-tauri/`, with no teardown. With a remote workspace
open, that orphans its `ssh -M` (PPID 1) and leaves the remote tmux session running (detached). A later open
of the same row then runs `new -A` against the leftover session.
- **How to apply:** before editing Rust mid-live-check, close remote workspaces through the UI and stop the
  dev app (`TaskStop`), then relaunch after the edit. Stop it before mutation runs too
  ([[live-dev-app-may-run-a-mutant]]). Sweep after any restart:
  `ps -axo pid,ppid,command | awk '$3=="/usr/bin/ssh" && $4=="-M"'` (match argv exactly, never
  `pgrep -f 'ssh -M'` in a loop, which counts itself) and `tmux -L claudesk-dev ls` on the mini.

**4. An `App.tsx` edit is a hard stop for open workspaces too** (hit twice at M17 WP6, 2026-11-17). Under
`pnpm tauri:dev`, saving `src/App.tsx` (an edit, or an App.tsx mutation run) makes React Fast Refresh RESET
App's state: the workspace list empties, every open workspace unmounts and closes through the NORMAL close
path, and that ENDS a remote session (R-1 `/exit`). It is clean (no orphaned master or tmux session), but the
live check silently loses its workspace; on a real (non-scratch) row it would end the operator's session.
Edits to child components (`RightPanelHost.tsx`, `Workspace.tsx`) hot-swap without this.
- **How to apply:** close remote workspaces (or use only the scratch row) before editing `App.tsx` or
  running App.tsx mutants; after any App.tsx save, reload the webview and reopen before trusting a live read.
  Backlog: `SURFACE-2026-11-17-APP-TSX-FAST-REFRESH-CLOSES-REMOTE-WORKSPACES`.

**5. UPDATE 2026-11-17 (M17 WP8): the mini's dev account now HAS the workflow skills**, installed by hand at the
operator's request: a git bundle of the mccc repo's pushed `main` → `~/my-claude-code-customization` (origin = the GitHub
URL), `./install.sh` (48 skills + 6 agents symlinked, workflow block in `~/.claude/CLAUDE.md`), and the 4 printed
permissions merged into `~/.claude/settings.json` (backup `settings.json.bak-mccc-install-2026-11-17`). Stub skills are
no longer needed. Real workflow commands still fire ONLY in a scratch remote folder (rule #1), since they act for real now.
⚠️ CORRECTED 2026-11-18: the account has no GitHub KEY (no SSH access, no `gh`), but the mccc repo is PUBLIC, so HTTPS
works anonymously. Its clone's `origin` was switched to `https://github.com/StaymanHou/stayman-claude-code-customization.git`
on 2026-11-18, so `git -C ~/my-claude-code-customization pull` works there now (then re-run `install.sh` if skills were
added or renamed). No bundle is needed. Detect + install from Claudesk is Milestone 18. The original note follows (history):

**5. The mini's dev account has NO workflow skills** (found 2026-11-17, M17 WP7 Phase 4: `~/.claude/skills` absent).
A real `/session-handoff`, `/session-restore`, `/session-start` or skill-button command there is an unknown command,
so Recycle ends `failed` and skill buttons do nothing useful (product gap: backlog
`SURFACE-2026-11-17-REMOTE-HOST-WITHOUT-WORKFLOW-SKILLS-MAKES-WORKFLOW-BUTTONS-DEAD`).
- **How to apply:** to drive workflow commands in a remote check, write project-local STUB skills inside the scratch
  remote folder only (`~/claudesk-scratch-remote/.claude/skills/<name>/SKILL.md`, frontmatter `name:` +
  `description:`; e.g. `session-handoff` writes `workflow-system/state/.session.md`, the others just reply a word),
  then CLOSE AND REOPEN the remote workspace: CC loads project skills when it starts, so a session started before the
  stubs existed does not see them. Remove `.claude/` from the scratch folder afterwards. Never install skills into the
  account's `~/.claude/` for a check. Keep remote turns tiny (that account showed 92% of its weekly limit used).

**6. A live REMOTE Recycle check needs a throwaway WIP seeded in the scratch folder first** (hit 2026-11-18, M18 WP1
verify-self). With real skills, `/session-handoff` in the bare scratch folder (README + an empty `workflow-system/state/`)
answers "nothing to hand off" and writes NO `.session.md`, so Recycle correctly stops before its kill + respawn. It looks
like the respawn bug but isn't. No toast was visible minutes later, so don't rely on one.
- **How to apply:** before clicking Recycle, write `~/claudesk-scratch-remote/workflow-system/state/wip/<x>.md` (a tiny task
  with a `## Current Node` whose next action is "reply ok"). The handoff then writes `.session.md`, the respawn fires, and
  `/session-restore` stops at its drive-mode pick when the row has no drive mode: answer it (`tmux -L claudesk-dev send-keys
  -t '=<session>:' Enter`) before checking that `.session.md` was consumed. Remove the WIP (and the empty `wip/`) afterwards,
  so the folder is back to README + an empty `state/`.

**7. Probe a host account WITHOUT Claudesk: your own ControlMaster** (M18 WP3, 2026-11-20). When a check needs only the host
(install scripts, a shell fragment's behaviour, latency of an exec), don't launch the dev app or ride its master. That avoids
every hazard above: orphaned masters, tmux leftovers, rebuild/App.tsx hard stops.
- **Open:** `D=$(mktemp -d /tmp/x.XXXX); ssh -M -S $D/c -o BatchMode=yes -o ControlPersist=no -fN <user>@<host>`. ⚠️ The socket must
  live in a SHORT dir: the session scratchpad path is over the 104-byte Unix-socket limit, and ssh fails with
  `ControlPath too long` / `unix_listener: … too long for Unix domain socket`.
- **Run:** `ssh -S $D/c -o BatchMode=yes -- <user>@<host> zsh -l -s < script.sh` (script on stdin, `zsh -l` for the login PATH).
  ⚠️ A script passed as ARGV is re-split by the remote login shell (it read `R=$(…)` as a local-ish command: "read-only file
  system: /probe-pid"), so argv needs one quote layer: `"zsh -lc '<script>'"` (what `remote_cmd::login_shell` + `quote` do).
- **Close:** `ssh -S $D/c -O exit <user>@<host>; rmdir $D`. Then the `ssh -M` sweep (rule 3). A remaining master whose parent is
  `/Applications/Claudesk.app` is the installed app's (a live workspace such as tank): leave it alone.
- Writes still go only in a scratch dir on the host (a sandbox root such as `~/claudesk-m18-sandbox`, removed after, path-checked
  with `cd -P` against `$HOME` before `rm -rf`). The live account stays read-only: take a baseline before and `cmp` it after.

**8. Hand-adding the scratch remote row to the dev `projects.json`: the timestamps must be INTEGERS** (M18 WP4, 2026-11-20).
A row with `"last_opened_at": null` (or `last_closed_at: null`) fails the WHOLE `list_projects` read ("config parse error:
invalid type: null, expected i64"): the picker shows nothing, not just the bad row, and a bridge `invoke('list_projects')`
rejects. Adding the row through the app's "Add remote project…" form avoids this; hand-editing is faster for a scripted check.
- **How to apply:** copy `last_opened_at` / `last_closed_at` (integer epoch ms) from an existing row, with
  `project_path` `ssh://<user>@<mini-host>/Users/<user>/claudesk-scratch-remote` and `remote: {host, path}`. Edit with the dev
  app STOPPED (every launch rewrites the file, [[projects-json-resorted-on-every-launch]]). Back up the dev `projects.json` and
  `settings.json` (e.g. a gate flip for the check) first, and `cp` both back afterwards; check the shas match the backup.

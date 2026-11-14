---
stage: vision
state: complete
updated: 2026-11-14  # /product-vision revisit: condensed + CC-cockpit direction + remote workspaces
---

# Vision — Claudesk

⚠️ **Condensed 2026-11-14.** The previous text (every revision banner from 2026-05-22 to 2026-08-18 and every "⚠️ corrected" note) is archived **verbatim** at [`archive/revision-log/vision-2026-05-to-11.md`](archive/revision-log/vision-2026-05-to-11.md). Section headings are unchanged there, so an older citation resolves to the same heading. **The as-built record is `arch/<subsystem>.md`** (indexed by `arch.md`). Where this file and `arch/` disagree on what was built, `arch/` wins. This file says what the product is *for*.

> **Revision 2026-11-14 (`/product-vision` revisit, roadmap Next item 3).** The operator made three rulings:
> 1. **Non-coding workspaces are a product direction, not a one-off.** Claudesk is a **cockpit for parallel Claude Code sessions**. A workspace is one CC session in one context, and the IDE right half is attached where the context has a local working tree. F-b (profiles) and M16 (media) were the first steps; remote workspaces are the next.
> 2. **Remote workspaces are a general capability, built against one host first.** A workspace may run its CC on an SSH host. The first host and first consumer is the `tank-sim-lite-demo` Mac mini (accepted inbox request, 2026-11-13; that project's checkpoint is 2026-12-11).
> 3. **PiP click-to-focus and the visual workflow-state view stay deferred.** Neither has shown dogfooding pull.
>
> All six original success metrics are met (Group C exit, M13). Metric 7 below is new.

## Vision

**The problem.** Starting work on any given project takes minutes of repetitive setup. You open a terminal, `cd`, and launch `claude`; you open Sublime Text and load the project; you open Sublime Merge and load it again; sometimes you open a second terminal and `cd` again. The cost is small once and ruinous in aggregate: 20+ projects rotate through the queue, 3–4 are in flight on any given day, and every context switch pays the setup tax again. A second tax sits on top of that one: with several projects in flight, finding the one waiting on input means clicking through windows or switching Spaces. **The scarce resource is the operator's attention across parallel CC sessions,** not keystrokes inside any one of them.

**The newest form of the problem (2026-11-14).** Some projects can't run on the main box. A game project's engine, builds and CC session live on a spare Mac mini, because the main box has to stay light. Today that project is the one place where every tax comes back: an SSH terminal outside Claudesk, no status dot, no auto-resume, no drive mode, and no buttons.

**The solution.** Claudesk is a macOS-only, single-user, open-source **cockpit for parallel Claude Code sessions**. It is one window with many workspaces inside it.

- **One workspace = one CC session in one context.** The context is a local project directory, a CC profile (F-b), or (planned) a project on a remote host. The **left half** is always the CC session, a real PTY terminal in yolo mode by default (a no-yolo setting exists). The **right half** is a lite IDE (editor, diff viewer, second terminal, prompt panel, docs, media), attached where the context has a local working tree.
- **A project picker.** Click a row and the whole environment is up in <10s, as a new workspace inside the existing window. Spawn-time choices live **on the picker row**: the model override, the drive mode, and the announced auto-resume action (with a `⊘` door that opens the workspace without firing it).
- **A Mission Control layout.** The **center stage** holds the focused workspace at full size. A **top filmstrip** shows every open workspace in a user-arranged order: live ~1 fps mirrors, with the focused one shown as an active-marked placeholder so tile positions never renumber. Click a tile or press `⌘⇧`+digit to switch. The strip collapses to mini status tiles.
- **Status surfaces that reach beyond the window.** Every workspace carries one of four states (idle, running, awaiting input, background work) plus an attention overlay that reads blue at every verify-human pause. The state shows on the filmstrip, on a display-only **PiP** NSPanel (Off / On / **Auto**, which summons itself when Claudesk loses focus), and on a **menu-bar** alarm with an actuator menu. All three read one broadcast stream. → `arch/status-channel-and-surfaces.md`
- **A stateful CC controller, not just a terminal.** Claudesk owns each session's lifecycle and reads CC's official hook channel and known workflow files. It **never** infers state from terminal output.
- **An opt-in workflow layer** for operators who run the companion workflow system (gated, default OFF; see Target Audience). It adds the docs viewer, smart auto-resume, the drive mode, a fixed five-button skill row plus **Recycle Session**, and the headless **workflow supervisor**.
- **Escape hatches, permanently.** One-click Sublime Text and Sublime Merge buttons, plus a write-gated time-analytics panel (default OFF).

Built with Tauri 2: one WKWebView, one Rust process, and one PTY host owning N child sessions.

### Load-bearing rulings carried from the archive (do not re-derive)

- **Smart auto-resume has TWO signals, not three.** First, an unclean-exit flag → spawn with `--continue`. Otherwise, `workflow-system/state/.session.md` present → inject `/session-restore`. Otherwise **nothing fires**: `/session-start` is never auto-fired and has its own button. **The unclean flag beats `.session.md`.** ⚠️ The original three-branch spec keyed on *"does CC have a resumable conversation here?"* That question is unqueryable and permanently true, because transcripts never prune. **Never reinstate it.** → `arch/session-resumption.md` → "The two signals".
- **Drive-mode values are `stepping` / `orchestrated` / `autopilot` / `fsd`** (not `step-by-step` / `full-autopilot`). They live **on the picker row only** and are stored in `projects.json`. They reach CC through an env-gated `UserPromptSubmit` hook line and are **never** mirrored into a WIP file.
- **Claudesk reads the workflow's world; it never writes into `workflow-system/`.**
- **`/session-pause` and `/session-resume` do not exist.** They were renamed `/session-handoff` / `/session-restore` at M9 WP5.
- **"Every skill as a button" was refuted by measurement** (11 of 50 skills were ever typed by hand). The skill row is a fixed set of five.

### The direction from here: remote workspaces (2026-11-14)

**A workspace may run its CC session on an SSH host.** These constraints are product-level:

- **Built for one host first, but not hard-wired to one.** The per-workspace config is `{ssh_host, remote_repo_path, tmux_session}` (or its equivalent), stored in Claudesk's own `projects.json` like every other per-project setting. Nothing goes in the repo, and there is no multi-host management screen.
- **The session is the workspace.** For the operator, a remote workspace has the same session-level parity as a local one: the CC terminal; the status dots on all three surfaces (four states plus attention); the Docs and Prompt panels; the drive mode and its hook line; smart auto-resume; the skill, Session-Start and Recycle buttons; and live filmstrip thumbnails. Terminal and status belong to the core tier. The docs, drive mode, auto-resume and buttons follow the workflow gate, the same as for local workspaces.
- **The IDE half is out for now.** The editor, diff viewer, second terminal, ⌘P finder, file tree, project search and Sublime launchers are **absent** on a remote workspace. Time analytics and the supervisor are deferred. Absent means hidden, never greyed out and never erroring (Core Principle 7).
- **A dropped network or a sleeping remote does not lose the session.** The workspace returns to the same CC session without the operator retyping anything.
- **The main box stays light.** No system extension (macFUSE / FUSE-T), and no long-running process on the remote beyond CC, its session host and the hook path. The remote is shared with other workloads.
- **Windows isn't needed, but don't foreclose it without a reason.**

**Left for research and arch** (these are questions, not decisions):
1. What "close workspace" means when the remote keeps CC alive.
2. How the two-signal resume rule maps onto a session that outlives Claudesk. "The remote session still exists" is an **observable** signal, which fits the M12 rule "prefer an explicit user signal over an unobservable inference" (recorded in `arch/session-resumption.md`; it is not an entry in `design-priors.md`).
3. How hook events cross the SSH link, and how the hook is installed on the remote while keeping the dev/prod identifier split.
4. How the docs panel and `.session.md` are read and watched remotely without a mount.
5. Which seam a remote spawn plugs into. `CcSession` is the stated swap seam, and the spawn command is currently a constant in `cc_session`.
6. Which standing guards bind a new workspace kind, for example the workflow-gate OFF invariant.

## Target Audience

**A single operator: the author.** This is a personal tool designed against one person's workflow: heavy Claude Code use, the companion workflow system at `~/.claude/skills/`, daily Sublime use, macOS, 20+ rotating projects, and now more than one Mac. It is open-sourced so anyone with a similar setup can use or adapt it.

**Two tiers, one app (refined 2026-07-20, unchanged here).**
- **The workflow-independent core** is for any Claude Code user, out of the box, with zero config: the picker, the workspaces, the PTY terminals, the IDE half, and the hook-driven status surfaces. **Remote workspaces' terminal and status sit in this tier.**
- **The workflow-orchestration layer** covers everything that assumes the workflow system: the docs viewer, auto-resume, drive mode, skill buttons and the supervisor. It is opt-in behind `workflow_features_enabled` (default OFF), and with the gate OFF the app is **byte-identical** to one that never had the layer. A one-time invite explains how to enable it.

**"No concession" still means** that nothing is built *for* a secondary user at the operator's expense, and the roadmap is not bent for them. The refinement only forbids dead affordances. Remote workspaces follow the same rule: they exist because the operator needs them, and they get no general remote-dev features beyond that. → `design-priors.md` → `gate-substrate-dependent-feature-class-behind-default-off-opt-in`.

## Success Metrics

Metrics name an **outcome**, never a mechanism or "every X". Both shapes were refuted by the build twice (the Group C lesson). Metrics 1–6 are **met** (Group C exit, M13, 2026-08-18). Their as-built details and corrections are in the archive.

1. ✅ **Time-to-productive on a project drops from minutes to <10s.** Pick a project and get a workspace with CC running in the project directory, ready to type.
2. ✅ **The clean-context ritual is one click.** Recycle Session (M13) does handoff → wait for a composite completion marker → respawn → restore. It is also a callable operation.
3. ✅ **The skills the operator actually types by hand are one click.** That is the fixed five-button row (M13), not every skill.
4. ✅ **Finding the CC that is waiting on you takes under 1 second of scanning, with zero clicks, inside the window** (the filmstrip).
5. ✅ **Returning to a project is one click however the last session ended,** and the active drive mode is visible on the picker row at the moment of that click.
6. ✅ **The same <1 s glance works with Claudesk out of focus** (PiP Auto mode and the menu-bar alarm).
7. **A project whose compute lives on another Mac is as one-click and as glanceable as a local one.** Picking it opens a workspace on its CC session. Metrics 4–6 hold for it unchanged. After a network drop or the remote sleeping, the operator is back in the **same** session without retyping anything. *(The open-time budget is set against metric 1's <10s once the probe has measured a warm connection; it is not asserted here.)*

## Core Principles

1. **Lite over featureful.** If it isn't a daily friction, don't build it. Reject scope that turns this into a general-purpose IDE or a remote-development platform.
2. **CC-process-aware and workflow-state-aware, never terminal-scraping.** Session state comes from CC's official hook channel, and workflow state from known files, read-only. This line separates Claudesk from "tmux with a nicer skin." It holds for remote workspaces too: their state crosses the network as hook events, never as parsed output.
3. **The Sublime *features* are sacred, and both Sublime apps stay one click away.** The in-app editor is the primary editing surface and must be a genuine replacement (multi-cursor, ⌘P, palette, project find/replace, splits, minimap). Sublime Text and Sublime Merge stay as permanent buttons, Merge for staging, blame, history and blob-at-revision.
4. **One window, many workspaces, fewer prompt-level rituals.** Never manage OS windows for Claudesk itself. A state that affects how every skill runs is visible at a glance and changeable in one click: spawn-time choices on the picker row, skill buttons in the workspace header.
5. **No per-project config burden.** Projects are added and removed in the UI. Nothing goes in the repo: no `.claudesk.json`, no launcher scripts. A remote workspace's host settings live in `projects.json` with everything else.
6. **Status visibility scales beyond the foreground.** Every session's state is reachable with at most one action from any app, Space or workspace, including sessions running on another machine.
7. **(New 2026-11-14) A surface works or it is absent.** Workspaces now come in kinds (local project, profile, remote). A surface that cannot function for a workspace's kind is **hidden for that workspace**: never greyed out, never empty, never erroring. This extends the no-dead-affordances rule from the workflow gate to workspace kinds.

## Anti-Goals

- Not a VSCode replacement or a general-purpose IDE.
- **Not a remote-development platform.** Remote means the operator's own Macs over SSH. There is no multi-host management screen, no cloud dev environments or containers, no remote editing or diffing (for now), and no system extension on the main box.
- Not cross-platform. macOS only, but avoid needlessly foreclosing a later Windows client.
- Not multi-user; no team or sharing features. Teammates watch over screen sharing.
- Not a Claude Code fork. Claudesk wraps the official CLI.
- Not an extension ecosystem.
- **Not multi-window for Claudesk itself.** The PiP and the menu-bar item are the only auxiliary surfaces. Sublime windows are external apps.
- **The PiP is display-only.** Click-to-focus is a Future Possibility.

## Future Possibilities (not scheduled)

The architecture should leave room for these; none of them is on the roadmap.

- **PiP click-to-focus.** A tile click brings Claudesk forward on that workspace. Still deferred as of 2026-11-14 because display-only hasn't proven insufficient.
- **A visual view of workflow state**: the current state, valid next transitions, drive mode, pending SURFACE items and back-loop history. *(The enforcement half of the old "migrate the state machine into Claudesk" idea was absorbed by the M15 supervisor, which is headless and follows the "absorb the machine, not the skills" ruling. Only the visualization half remains here.)*
- **The deferred remote rows:** editor, diff and file reach on a remote workspace; time analytics and the supervisor for remote sessions; and more than one remote host.
- **Further workspace kinds,** if dogfooding asks for them.

*Shipped since the original list: time-tracking integration (M9, as the time-analytics panel). Resolved: all four 2026-06-15 open design questions (thumbnail cost → M1 probe PASS; PiP mechanics → M5 NSPanel; menu-bar item → M7 tray alarm, popover cut; tab shell → built from scratch in M1).*

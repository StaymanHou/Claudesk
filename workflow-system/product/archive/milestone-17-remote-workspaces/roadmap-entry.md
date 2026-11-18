# Roadmap entry — Milestone 17 (archived verbatim at /product-finalize, 2026-11-17)

### Milestone 17: Remote workspaces (one SSH host first)

**Why:** the vision revisit (2026-11-14) made Claudesk a **cockpit for parallel CC sessions**, and ruled
remote workspaces a general capability built against one host first. The first host and consumer is
the `tank-sim-lite-demo` Mac mini (accepted inbox request
`archive/2026-11-13-tank-sim-lite-demo-remote-workspace.md`). That project won't start agent-driven
game development until this milestone ships, and its **checkpoint is 2026-12-11**.

**Goal:** a workspace whose CC session runs on another Mac over SSH is as one-click and as glanceable
as a local one, and it survives the network or the remote going away (vision Metric 7).

**Scope:** the operator's parity table (2026-11-13), as codified in `vision.md` → "The direction from here".
- **IN:** the CC terminal; the status dots on the filmstrip, menu bar and PiP (four states plus
  attention); the Docs and Prompt panels; the drive mode and its `UserPromptSubmit` line; smart
  auto-resume; the skill, Session-Start and Recycle buttons; live filmstrip thumbnails.
- **OUT:** the editor, diff viewer and second terminal; ⌘P, the file tree, project search and the
  Sublime launchers. These are **hidden** on a remote workspace (Core Principle 7), never greyed
  out or erroring. Time analytics and the supervisor are deferred.
  ✅ **As built (M17 WP6, 2026-11-17):** all of these are absent, plus the supervisor and the
  **turn-marker jump** (operator ruling: absent permanently, no tmux-history rebuild). A chord or menu
  item for an absent surface shows one neutral info notice rather than doing nothing (arch §G).
- **Constraints:** the per-workspace config lives in `projects.json`, with no multi-host screen; no
  system extension on the main box; no long-running remote process beyond CC, its session host and
  the hook path. Windows isn't needed but shouldn't be foreclosed.

**Lifecycle rulings (`/util-grill-me`, 2026-11-14; settled):**
- **R-1: explicit actions keep local parity.** Close (×), **⏸ "Close, resume later"** (`onPauseClose`), Recycle and quit **end**
  the remote session (CC gets `/exit`), as they do locally, with no extra dialog beyond the existing
  active-close confirm. ⏸ leaves the unclean flag set, as it does locally, so the next open **resumes**
  (`--continue` on the remote).
- **R-2: passive events leave the session running on the remote.** A lost connection, a Claudesk
  crash, or the remote sleeping. Reopening **reconnects** to the live session, and that beats both
  resume signals. Only a dead remote session falls back to the two-signal rule (unclean flag →
  `--continue`, else `.session.md` → `/session-restore`, else nothing).
- **R-3: a deliberate Detach / Reconnect control** on remote workspaces leaves the session running
  on purpose and reconnects later.
  ⚠️ **As built (M17 WP5, operator ruling 2026-11-16):** Detach is a control on the remote TILE that
  closes it and leaves the session running ("simply detach and quit; the tile is gone"); there is no
  Detached tile, and Reconnect is reopening the row from the picker.
- **R-4: when the state is genuinely unclear, show a dialog** so the operator chooses deliberately.
  Don't guess.

- ⚠️ **Vocabulary (operator, 2026-11-14): reconnect ≠ resume.** **Reconnect** = the CC session is
  still alive on the remote; Claudesk only connects back to it (tmux attach). No resume command fires.
  **Resume** = the session already ended (`/exit`) on the remote; Claudesk connects and starts CC
  through the existing two-signal rule (unclean flag → `--continue`, else `.session.md` →
  `/session-restore`). Never call the live case "resume" or the dead case "reconnect".

**Defaults taken at the grill (correct at arch/WBS if wrong):**
- A self-update relaunch counts as an explicit quit (R-1).
- Adding a remote project goes through a minimal entry in the picker (host + path), because Open
  Folder can't pick a remote path.
- The remote hook installs automatically, keeping the dev/prod identifier split; remote events stay
  out of the local time analytics.
- F-b profiles stay local-only.
- The Detach / Reconnect control lives in the remote workspace's header. ⚠️ Superseded at WP5: Detach is a tile control; Reconnect is reopening (see R-3).
- WPs are ordered core-first (terminal, status, reconnect, OUT rows hidden), so a partial release
  *could* be cut; full parity remains the exit criterion.

**Probe:** Claudesk's `/product-research` probes the mechanisms Claudesk needs (the terminal over
ssh + a session host, the hook path back to `hook_socket`, remote reads and watches, the reconnect
rule). ⚠️ Whether the tank side runs its own spikes is **tank's call**, and Claudesk's messages
don't steer it (operator, 2026-11-14).

**Exit criteria:** tank's "done" list, verified on an **installed release** on the main box against
the mini:
- A remote workspace opens on the mini's CC.
- Every IN row works, verified row by row by the operator.
- Every OUT row is hidden, with nothing broken.
- After a network drop or the mini sleeping, the workspace reconnects to the same session.
- Close and quit end the session (R-1), and Detach / Reconnect works (R-3).
- No system extension is installed on the main box.

**Follow-up owed:** a sized estimate (WPs + rough days) goes to tank's inbox after `/product-wbs`.

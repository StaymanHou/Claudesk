---
stage: roadmap
state: complete
updated: 2026-11-14  # vision revisit done; M17 remote workspaces added
---

# Roadmap

Claudesk grows in increments you can dogfood, and each one is usable on its own. **Every milestone
through M16.5 has shipped** (M1–M16.5, both Group F asks, and the features inserted after them); M17 is
next. This file holds three things: a one-line index of what shipped, the rulings that still bind
future work, and what comes next.

⚠️ **The full milestone and revision text (1,202 lines) is archived VERBATIM at
[`archive/revision-log/roadmap-2026-06-to-09.md`](archive/revision-log/roadmap-2026-06-to-09.md)**
(condensed 2026-09-29). Section headings are unchanged there, so an older citation like
*"`roadmap.md` → Revision 2026-08-14"* resolves to the same heading in that file. **The as-built
record is `arch/<subsystem>.md`** (indexed by `arch.md`). Where the two disagree, `arch/` wins.

**Conventions (unchanged):**
- Milestones are a **flat, continuous list**, and `## Group` headings are cosmetic only.
- A between-milestone insert is numbered `N.5` (or `N.9`) so the tail does not renumber.
- A **QoL bucket** is an OPEN collection of dogfooding papercuts. There have been four so far
  (M6, M10.5, M11.5, M13.5), and each closed at 4–5 WPs.
- Operator asks may enter as **un-numbered items** (Group F) and get numbered only when scheduled.

## Shipped

| # | Milestone | Closed | What it delivered |
|---|---|---|---|
| M1 | Bare shell + tab substrate (PoC) | 2026-06-19 | Tauri shell, picker, PTY terminal running `claude`, tab substrate; thumbnail probe PASS (live ~1 fps mirrors) |
| M2 | Lite editor + diff viewer | 2026-06-22 | CM6 editor (finder, palette, find/replace, splits, tabs, file tree), git diff viewer, panel hotkeys, Sublime Text + Merge buttons (kept permanently) |
| M3 | CC lifecycle & state plumbing | 2026-06-22 | Hook script + `AF_UNIX` socket + status broadcaster; state comes from hooks, never PTY scraping |
| M4 | Multi-workspace UX | 2026-06-24 | Filmstrip with live mirrors, `⌘⇧`+digit, drag-reorder, collapse, focus indicator. **This was the dogfood-replace point** |
| M5 | Picture-in-picture | 2026-06-27 | NSPanel PiP with 4 layouts and auto-summon on blur; display-only |
| M6 | Friend-requested QoL (bucket) | 2026-06-28 | Stuck-dot fix, split control, terminal zoom, wrap toggle, gitignored-file reach, no-yolo setting |
| M7 | Menu-bar status item | 2026-06-29 | Tray alarm (lit when any workspace is awaiting input) and an actuator menu; the popover was cut as a PiP subset |
| M8 | Demo assets | 2026-06-29 | Synthesized filmstrip and PiP GIFs in the README |
| M9 | Time-analytics panel | 2026-07-16 | Absorbed claude-time: write-gated SQLite, reclassifier, dashboard (default OFF) |
| M10 | In-app auto-updater | 2026-07-18 | minisign-signed updater; Homebrew installs self-update too |
| M10.5 | QoL bucket | 2026-07-19 | PiP top-right default, active-close confirm, SIGHUP-first group kill, UTF-8 fixes |
| M10.9 | Workflow-features opt-in gate | 2026-07-31 | `workflow_features_enabled` (default OFF, byte-identical when off); the two-tier audience |
| M11.5 | QoL bucket | 2026-08-01 | Per-project `--model` override on the picker row, plus pre-M11 guard debt |
| M11 | Workflow-docs markdown viewer | 2026-08-03 | Gated docs panel with live reload |
| M12 | Smart auto-resume + drive mode | 2026-08-12 | Two-signal resume (unclean flag → `--continue`, else `.session.md` → `/session-restore`); drive mode on the picker row, delivered through a hook |
| M13 | Skill orchestration | 2026-08-18 | A fixed five-button skill row, plus Recycle Session as a callable operation. **Group C closed: all six vision metrics met** |
| M13.5 | QoL bucket | 2026-08-26 | Window-state persistence, the BackgroundWork (purple) state, turn-boundary `↑ N/N ↓`, drive mode on the workspace surface |
| M14 | Polish & open-source release | 2026-09-18 | MIT license, a README with two setup tiers, a read-only hotkey reference, Developer-ID signing and notarization (`v0.5.2`) |
| M15 | Workflow supervisor | 2026-09-15 | Typed policy graph, turn-end break detection, auto-fire, `claude -p` adjudicator, context-pressure recycle at 400k tokens |
| F-a | Prompt staging area | 2026-09-22 | CM6 prompt panel, bracketed-paste send (`⌘↵`) and stage-only (`⇧⌘↵`), sent-draft ring |
| F-b | Isolated CC profiles as workspaces | 2026-09-24 | `CLAUDE_CONFIG_DIR` profiles spawned directly, with per-profile hook registration (`arch/profiles.md`) |
| — | Supervisor activity record | 2026-09-28 | `supervisor-activity.log` JSONL, badge hint, `▾` popover, turn `⚙` |
| — | Silent-supervisor fix | 2026-09-28 | Three causes fixed (`778fe72`); shipped in `v0.7.1` |
| — | Analytics week export | 2026-09-29 | Day view 5.7× faster, resumed-session lives, Week default, `claudesk export-week` (`v0.7.1`) |
| M16 | Right-panel media viewer | 2026-10-20 | Images, SVG, sniff-gated PDF, audio and video open in the editor file tab: glance viewer, review player (midpoint frame-step, frame-accurate timecode, reload keeps the playhead), a 4 GiB cap with Open in default app (`arch/right-panel-surfaces.md`) |
| M16.5 | Supervisor hardening, QoL + paydown | 2026-11-08 | Only execution workflows chain; emitted-token rule; full-id adjudicator pin + loud failures; artifact watch reads idle, every verify-human pause reads blue; QoL batch; per-result replace; the 15-WP code-quality paydown; context-pressure recycle only at F15 |

**Carried forward from shipped work. These are not complete, so read them before reading any `[x]` as "done":**
- ⚠️ **M15's live half: firing IS observed on an installed build** (`v0.7.1`, four fires on
  2026-10-12 in `bluecg-maps`), but the on-screen checks (a fire with its `⚙`, a fire while another
  app is focused, Esc recovery) are still unconfirmed. Tracked at
  `SURFACE-2026-09-14-SUPERVISOR-NEVER-OBSERVED-FIRING-IN-A-LIVE-SESSION`. ⚠️ M16.5 WP7 did NOT close
  it: the operator deferred the on-screen checks to ordinary dogfooding (2026-11-04).
- ⚠️ **M16.5 WP9 (recycle only at F15) is unobserved on an installed build.** Replayed against the 4 real
  field recycles; in dogfooding, every `recycle-started` line should carry `edgeId: "F15"`.
- ⚠️ **F-a's motivating case, voice dictation, is ASSUMED WORKING, NOT VERIFIED.** macOS text-input
  services do not engage under `pnpm tauri:dev`, so it needs an installed build.
- ⚠️ **F-b has two checks deferred to the release gate:** an installed-`.app` profile spawn with its
  status dot, and whether `trash::delete` needs a Finder Automation grant.
- ⚠️ **M16 has two checks deferred, NOT passed:** hardened runtime for the media transport and player (a notarized release build; deferred to `/release`), and the operator's `scripture-reading` dogfood review pass (AC-21, deferred 2026-10-20). The installed-origin tier passed on a debug bundle only.
- ⚠️ **M13's dynamic skill registry was NEVER BUILT, and that was deliberate.** The fixed five shipped
  instead. A registry would need an enumerator plus a YAML parser, which reverses the §4c decision
  (the command name is the only stable cross-repo coupling). M15 R-7 declined it. It re-enters only
  as a product decision.

## Standing rulings (settled; do not re-litigate)

Each ruling is one line here. Its full text is in the archive, under the heading named.

- **Ownership boundary with mccc (2026-08-14): "absorb the machine, not the skills."** Claudesk owns
  the drive mode's VALUE and TURN-BOUNDARY enforcement. mccc owns its MEANING and INTRA-TURN
  semantics, and mccc's prose remains the fallback for sessions run without Claudesk. Full absorption
  of mccc was rejected. → *Milestone 15*, *Revision 2026-08-14*.
- **M15 R-1–R-7.** Among them: the stored mode is the authority, and Mode 0 is not a suppressor. The
  recycle threshold is an absolute token count, and no model→window map exists. The verdict lives in
  TypeScript. → `arch/workflow-supervisor.md`.
- **M14 R-1:** sign and notarize, with minisign kept and the trust anchor `774E2E8429FDF78A`
  unchanged. **M14 R-2:** project-list management was **DROPPED, not deferred**. → *Milestone 14*.
- **F-a:** newlines are preserved through bracketed paste, and `slashCommandPayload` is not modified.
  → *F-a decisions — `/util-grill-me`, 2026-09-21*.
- **F-b:** the profile/project model, hook-registration ownership, and self-hosting. → *F-b decisions
  — `/util-grill-me`, 2026-09-23*.
- ⛔ **Turn-output re-orientation (F-c) was DROPPED** (2026-09-15). Re-open it only on a fresh operator
  ask, never by citing the product thesis. → *F-c*.
- **Group C lesson for the next `/product-vision`:** success metrics written as "every X", or that
  name a mechanism, were refuted by the build twice. Metrics that name an outcome survived.
  → *Milestone 13*, Group C exit.
- ⭐ **A `/util-grill-me` pass is the ENTRY step of each operator-requested capability**, not a review
  step. (This was the Group F convention, and it carries forward.)

## Next

✅ **The `/product-vision` revisit is done (2026-11-14)**, so milestones past M16 can be numbered. **Next: Milestone 17, remote workspaces.** Earlier items in this list are archived with their cycles: the mccc asks went out 2026-09-29, and M16.5 closed 2026-11-08 (`archive/milestone-16-5-supervisor-hardening-qol-and-paydown/`).

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
- The Detach / Reconnect control lives in the remote workspace's header.
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

**Held open, not scheduled:**
- The stale minimap (feature-sized; revive as its own feature when the `drawLine` rewrite is worth
  funding). The other QoL seeds and the paydown were absorbed into M16.5.

## Revisions

- **2026-11-14** — `/product-vision` revisit done: vision condensed, the CC-cockpit direction set, and remote workspaces ruled a general capability built one host first. **M17 (remote workspaces) added and scoped** at a `/util-grill-me` pass (lifecycle rulings R-1 to R-4). Its first consumer is `tank-sim-lite-demo`, with a checkpoint on 2026-12-11.
- **2026-11-08** — M16.5 closed (9 WPs; WP9, an operator insert, made the recycle key on the F15 edge). The M15 on-screen checks and WP9's installed check stay deferred to dogfooding. Next: the `/product-vision` revisit.
- **2026-10-20 (b)** — M16.5 scoped at a `/util-grill-me` pass: one bucket of supervisor hardening + the status-dot items + the QoL seeds (minimap excluded) + a closing code-quality paydown; the supervisor gate recorded as met by the 2026-10-12 fires.
- **2026-10-20** — M16 (right-panel media viewer) closed at `/product-finalize`: moved to Shipped, its two deferred checks added to "Carried forward", and its Next entry archived verbatim with the cycle docs. Next in order: the supervisor-hardening bucket (still gated on a live fire), then the `/product-vision` revisit.
- **2026-09-29** — Condensed. All closed milestone and revision text moved verbatim to
  `archive/revision-log/roadmap-2026-06-to-09.md`; the file went from 1,202 lines to about 110.
  Execution order set by the operator: **M16 media viewer** → a supervisor-hardening bucket (gated
  on a live fire) → a `/product-vision` revisit before M17. The mccc asks went to its inbox.
- *Earlier revisions, 2026-06-15 → 2026-09-25, are in the archive under their original headings.*

---
stage: wbs
state: complete
updated: 2026-11-14  # first decomposition of M17
cycle: milestone-17-remote-workspaces
---

# WBS — Milestone 17: Remote workspaces (one SSH host first)

**Scope of this pass:** M17 only (`roadmap.md` → "### Milestone 17"). The design is
`arch/remote-workspaces.md` (PLANNED), the evidence is `research.md` (live probes against the mini,
2026-11-14), and the direction is `vision.md` → "The direction from here".

**Shape:** one probe, then build WPs ordered **core-first**. After **WP6** the app has a remote
terminal, live status, reconnect and the OUT rows hidden. That is a point where a **partial release could
be cut** if the tank checkpoint wants an interim. Full parity (Docs, resume announce, Recycle) lands in
WP7, and WP8 is installed-build acceptance against the mini.

## Rulings (SETTLED at the 2026-11-14 grill; do not re-litigate)

The full text is in `roadmap.md` → M17. In one line each:
- **R-1:** explicit close (×), ⏸ "Close, resume later", Recycle and quit end the session, with local parity and no extra dialog. ⏸ leaves the unclean flag set, so the next open **resumes**.
- **R-2:** passive events leave it running, and a live session is reconnected ahead of both resume signals.
- **R-3:** deliberate Detach / Reconnect.
- **R-4:** a genuinely unclear state gets a dialog.

The grill's defaults are listed in the roadmap and the arch file's §H. They're open to correction here
only if the build disproves one.

## Design-priors consult

- `[a-workspace-is-its-cc-session]` **agrees** with the core-first ordering: the session and its status
  become first-class (WP3–WP5) before any other surface (rule 2, higher confidence).
- `[gate-substrate-dependent-feature-class-behind-default-off-opt-in]` **agrees** that OUT rows are
  *absent*, never greyed out (rule 2). WP6.
- `[reuse-the-established-status-palette-before-inventing-a-hue]` **agrees** with the link overlay
  being the last state's hue dimmed plus a glyph, with no new colour (rule 2). WP4.
- `[simple-version-first-when-the-source-fix-shrank-the-problem]` is **not stretched** to cover polling
  vs. a remote watcher (over-infer guard). Polling won on its own merits: no remote process on a
  shared host.

## Work Packages

### WP1: Probe — the remaining terminal unknowns under tmux on the mini
**Type:** probe
**Milestone:** M17
**Dependencies:** none (research already proved attach, resize, keystrokes and the forwards)
**Size:** S, **~1 day**
**Learning objective:** does a real CC session inside `tmux -L claudesk` on the mini, viewed through Claudesk's xterm.js pane, have parity with a local pane on the things the research **didn't** probe?
**Timebox:** 1 day
**Success criterion:** each item below is PASS, or FAIL with a chosen mitigation written into `arch/remote-workspaces.md`. Nothing is left "probably fine".
**Tasks:**
- [ ] 1.1 **Scrollback** (arch §I, UNPROBED): wheel-scroll a long CC output. Try plain tmux, `terminal-overrides ',xterm*:smcup@:rmcup@'`, and copy-mode-on-wheel. Pick one.
- [ ] 1.2 **Bracketed paste through tmux**: the Prompt panel's `⌘↵` sends bracketed paste. Newlines must survive as one prompt (the F-a ruling).
- [ ] 1.3 **TERM, colours and CC's TUI** inside tmux: `TERM`/`COLORTERM` pass-through, truecolor, the status line hidden (`status off`).
- [ ] 1.4 **`/exit` ends the tmux session** when the session's command is `claude` (the R-1 mechanism). `\r` vs `\n` injection still behaves as `cc-tui-cr-not-lf` says.
- [ ] 1.5 **Spawn-to-ready latency** with a warm master: open → CC prompt visible. This sets vision Metric 7's open-time budget.
- [ ] 1.6 Clean up: no `cd-*` session or socket left on the mini, verified with `tmux -L claudesk ls`.

**WP1 → WP2/WP3 rationale:** a scrollback or bracketed-paste failure would change the terminal design (a different session host or a paste path). Learn that before WP3 builds the spawn path around tmux.

### WP2: Remote rows: data model, identity, and adding one
**Milestone:** M17
**Dependencies:** none (can run in parallel with WP1)
**Size:** M, **~2 days**
**Description:** the data-loss risk is fixed first. Remote rows exist, survive launch, and are keyed safely. arch §A, §H.
**Tasks:**
- [ ] 2.1 `config_store::Project.remote: Option<RemoteTarget { host, path }>`, serde-compatible with every existing `projects.json`. Store-level rejection of `remote` + a non-default `profile`.
- [ ] 2.2 ⚠️ **`prune_missing_projects` exempts remote rows.** The exemption goes in the pruner, with a test that fails when the exemption is deleted (mutation-proven).
- [ ] 2.3 `remote_key` (`ssh://host/path`) as the one identity function. `key_for` passes remote keys through unchanged. Tests show a remote key never collides with a local project at the same path string.
- [ ] 2.4 `remote_cmd::quote`, the single remote-command builder, unit-tested against hostile inputs (spaces, quotes, `$`, backticks, newlines, a leading `-`).
- [ ] 2.5 Picker "Add remote project…" (host + path) with an async preflight: key works, `tmux`/`claude`/`perl` resolve under `zsh -lc`, the path exists. Plain-words errors, including "could not resolve hostname: is Tailscale running?".
- [ ] 2.6 A remote row renders in the picker (host shown) and can be removed. Opening it is a no-op stub until WP3.

**WP2 → WP3 rationale:** WP3 keys sessions and links by `remote_key` and builds commands with `quote`, so both must exist and be tested first. The prune exemption must land before *any* build can create a remote row on the operator's real `projects.json`.

### WP3: The host link and the remote terminal
**Milestone:** M17
**Dependencies:** WP1, WP2
**Size:** L, **~3 days**
**Description:** a remote row opens a working CC pane on the mini, and the link survives drops. arch §B, §C.
**Tasks:**
- [ ] 3.1 `remote_link`: one ControlMaster per host on a worker thread, with a short ControlPath (≤104 bytes, with a test), `ServerAliveInterval 15` × 3, reconnect backoff, and **`rm -f` of the remote socket before every connect**. It broadcasts a `remote-link` state event.
- [ ] 3.2 `SpawnTarget::{Local, Remote}` in `SessionRegistry::spawn`. The local path is byte-identical (the existing env tests stay green). The remote path runs `ssh -S <ctl> -tt … zsh -lc 'exec tmux -L <srv> new -A -s <name> -c <path> "…claude <argv>"'` with WP1's tmux options.
- [ ] 3.3 Resize and input go through the unchanged `PtyCcSession`. R-1 close and quit go through the unchanged `kill()`, which types `/exit` and so ends the tmux session.
- [ ] 3.4 On a link drop, the workspace's terminal reconnects automatically once the master is back, as the same session (marker test as in the research).
- [ ] 3.5 The `MaxSessions` cap: a ninth workspace on one host is refused with a message.
- [ ] 3.6 ⚠️ All new ssh I/O is `async` or on a worker. New async commands go into `sync_commands_do_not_block.rs`'s `ASYNC_COMMANDS` with reasons.

**WP3 → WP4 rationale:** status needs a link to ride (the `-R` forward lives on the master from 3.1).

### WP4: Status over the link: hook install, origin, drive mode, link overlay
**Milestone:** M17
**Dependencies:** WP3
**Size:** M, **~2.5 days**
**Description:** the remote workspace's dot is live on the filmstrip, PiP and tray, and honest while the link is down. arch §D, §E (overlay).
**Tasks:**
- [ ] 4.1 Deploy the hook script to `~/.claudesk/<identifier>/` and register it in the remote `~/.claude/settings.json`. The merge runs locally on the fetched JSON and is written back atomically. ⚠️ Provenance: never remove a hook Claudesk didn't install. Dev and prod stay distinct by basename and socket path.
- [ ] 4.2 An optional `origin` field from `CLAUDESK_ORIGIN`. `tests/hook_pl_output.rs` keeps the **local** output byte-identical and gains a remote case.
- [ ] 4.3 `WorkspaceRegistry` resolves on **(origin, cwd)**. Tests show a remote event never lights a local tile, the reverse, or an unmatched session from another CC on the host.
- [ ] 4.4 ⚠️ `time_store` refuses origin-tagged events at ingestion, with a test.
- [ ] 4.5 Drive mode travels in the remote spawn command line (the closed four values only, through `quote`), and the `UserPromptSubmit` line appears in the remote CC. The picker row shows that a reconnected session keeps its original mode.
- [ ] 4.6 **The link overlay** on `display_state`: Lost or Detached shows the last hue dimmed plus a link glyph on the filmstrip, PiP and tray. `state` is unchanged, and the close/quit and respawn guards still read `state`. After a reconnect the state is `Unknown` until the next event.

**WP4 → WP5 rationale:** the lifecycle dialogs and the reconnect path need a truthful status first, so a reconnected workspace's state reads correctly.

### WP5: Lifecycle: reconnect, detach, the R-4 dialogs, and the resume rule's remote checks
**Milestone:** M17
**Dependencies:** WP3, WP4
**Size:** M, **~2 days**
**Description:** R-2–R-4 as specified in arch §E's table, plus the remote versions of the three file checks the two-signal rule decides on. That avoids research Risk 4, a **silent `--continue` drop**.
**Tasks:**
- [ ] 5.1 On open: `tmux has-session` over the master. **Live → attach, ahead of both signals.** The picker announces it ("Reconnect").
- [ ] 5.2 Dead → the two-signal rule with **remote** `has_session_md`, `transcript::has_any_transcript` (remote slug from the remote realpath) and `folder_trusted`. Each is one dispatch inside the deciding function, not at its callers.
- [ ] 5.3 `CcSession::detach()` (local default: `Unsupported`), the Detach / Reconnect control in the remote workspace's header, and the Detached tile state. The unclean flag is untouched.
- [ ] 5.4 The R-4 dialogs: closing a detached workspace; a quit or close while the link is down (recorded end-intent, then a dialog at the next open); host unreachable at open; an unrecorded live `cd-*` session.
- [ ] 5.5 The unclean-flag interplay is tested: a passive drop leaves it set; if the remote session then dies, reopening resolves to `--continue`.

### WP6: OUT rows absent: the `workspaceSurfaces` funnel
**Milestone:** M17
**Dependencies:** WP2 (it reads `Project.remote`); otherwise independent and can run in parallel with WP3–WP5
**Size:** M, **~1.5 days**
**Description:** arch §G. Every OUT surface is absent on a remote workspace, and the backend refuses local-fs commands for it.
**Tasks:**
- [ ] 6.1 `workspaceSurfaces(project)` in TS and its Rust twin. `availablePanels` and every OUT mount site consult it: editor, diff, second terminal, file tree, ⌘P, project search, Sublime ×2, Finder reveal, media, supervisor.
- [ ] 6.2 Backend typed refusals for `editor_fs` / `git_*` / `fs_index` / `sublime_*` / `finder` / `project_search` on a remote workspace.
- [ ] 6.3 `workspaceSurfacesGuard`, **mutation-proven per site**. The subject list is a floor: grep repo-wide before trusting it.
- [ ] 6.4 ⚠️ `offInvariantGuard` (6 arms / 10 subjects) and `workflowApplicableGuard` stay green **unchanged**. That is the evidence the kind funnel didn't leak into the gate.

**⭐ Partial-release point after WP6:** remote terminal, live status, reconnect, Detach / Reconnect, OUT rows absent. This is cut only if the tank checkpoint asks for an interim; the milestone's exit is still full parity.

### WP7: Remote reads: Docs panel, poller, Recycle
**Milestone:** M17
**Dependencies:** WP3 (master execs), WP5 (it reuses 5.2's remote check helpers)
**Size:** M, **~2.5 days**
**Description:** arch §F. The IN rows that read files work on a remote workspace.
**Tasks:**
- [ ] 7.1 `remote_fs` (async, read-only): `stat`, `read`, `exists`, `list_dir`, with path containment under `RemoteTarget.path` (rejects `..` and absolute escapes **before** quoting).
- [ ] 7.2 A 1.5 s poller over the docs set, `.session.md` and the WIP dir, emitting the **same `fs-change` shape**. Polling stops when the workspace closes or detaches, and nothing long-running is started on the host.
- [ ] 7.3 Docs panel on a remote workspace: `docs::discover` / `docs_read` routed by target, with live reload through the poller (gated as locally).
- [ ] 7.4 Recycle on a remote workspace: the mtime baseline plus the `fs-change` wait over the poller, then the composite marker. An end-to-end Recycle on the mini.
- [ ] 7.5 Skill buttons, Session-Start and the Prompt panel confirmed on a remote workspace (expected to work unchanged through the PTY; confirm, don't assume).

### WP8: Installed-build acceptance against the mini
**Milestone:** M17
**Dependencies:** WP1–WP7
**Size:** S, **~1 day + a `/release`**
**Description:** the exit criteria, on an installed `.app` (dev ≠ installed: GUI PATH, so `ssh` and the agent socket must work from a Finder launch).
**Tasks:**
- [ ] 8.1 `/release`, then install on the main box. ⚠️ **Never propose `brew upgrade` to verify a release** (it kills every running Claudesk).
- [ ] 8.2 Row by row with the operator, each **IN** row on a live remote workspace (`tank-sim-lite-demo` once its repo is on the mini, or a scratch dir there): terminal; dots on all three surfaces including attention; Docs; Prompt; drive-mode line; auto-resume (reconnect, `--continue`, `/session-restore`); skill, Session-Start and Recycle buttons; thumbnails.
- [ ] 8.3 Each **OUT** row is absent, with no errors in the log.
- [ ] 8.4 Resilience: a network drop (Tailscale off/on) reconnects to the same session. Close and quit end it (R-1), and Detach / Reconnect works (R-3).
- [ ] 8.5 No system extension on the main box. Nothing left running on the mini beyond CC, tmux and the master link. Dev and prod against the same mini don't cross.

## Dependency map

```
WP1 (probe) ──┐
              ├─► WP3 (link + terminal) ─► WP4 (status) ─► WP5 (lifecycle) ─► WP7 (reads) ─► WP8 (acceptance)
WP2 (rows) ───┤
              └─► WP6 (OUT absent) ───────────────────────────────────────────────────────────┘
```

- **Critical path:** WP1/WP2 → WP3 → WP4 → WP5 → WP7 → WP8.
- **Parallel track:** WP6 can run any time after WP2. ⭐ The partial-release point is WP1–WP6 done.

## Sizing: the estimate owed to the tank side

| WP | Size | Rough days |
|---|---|---|
| WP1 probe | S | 1 |
| WP2 rows | M | 2 |
| WP3 link + terminal | L | 3 |
| WP4 status | M | 2.5 |
| WP5 lifecycle | M | 2 |
| WP6 OUT absent | M | 1.5 |
| WP7 reads | M | 2.5 |
| WP8 acceptance | S | 1 + a release |
| **Total** | | **~15.5 working days nominal; range 12–21** |

- **Velocity reference:** M16.5 shipped 9 WPs in 19 calendar days.
- **The checkpoint:** started 2026-11-16, the partial-release point (WP1–WP6, about 12 days) lands around
  **2026-11-30 to 12-02**, and full parity around **2026-12-05 to 12-09**. That's inside the 2026-12-11
  checkpoint with little slack.
- **The two places a surprise would push it past the checkpoint:**
  - **WP1:** a scrollback or bracketed-paste failure that forces a different session host. About +2–3 days.
  - **WP3:** link reconnect edge cases. About +1–2 days.

  Both are front-loaded on purpose, so the operator knows by about 2026-11-20 whether the checkpoint is at risk.

## Exit criteria (M17)

These are `roadmap.md` → M17 "Exit criteria", verified in WP8 on an installed release against the mini.
Every IN row works, every OUT row is absent, a drop reconnects to the same session, close and quit end
it, Detach / Reconnect works, and there is no system extension on the main box.

## Probe outcomes

**WP1, Phase 1 (2026-11-14; no CC login needed).** Details are in `arch/remote-workspaces.md` §C.1 and §I.

| Item | Result |
|---|---|
| 1.1 Scrollback | ⚠️ **No full parity.** E (`smcup@:rmcup@`, `mouse off`): native xterm.js scrollback for streamed output, but a burst is lost. C (`mouse on`): complete history via tmux copy-mode, but copy-mode **swallows keystrokes** (mitigated for Claudesk's own injections with cancel-before-inject). Alt-screen + `mouse off`: ruled out. **Chosen and operator-ratified (2026-11-14): C + RGB + mandatory cancel-before-inject;** no `Any` copy-mode binding; E retired. |
| 1.2 Bracketed paste | ✅ The envelope is forwarded intact when the app has `?2004h` on (CC does). ⚠️ It is stripped before then, so multi-line sends must wait for CC to be ready. |
| 1.3 TERM / colour / UTF-8 | ✅ with `terminal-features ',xterm*:RGB'` (without it truecolor degrades to 256). UTF-8 glyphs are exact. `status off`: pane = xterm size. ⚠️ `-L` doesn't isolate `~/.tmux.conf`, so WP3 passes `-f`. |
| 1.4 `/exit` ends tmux | ✅ (Phase 2) `/exit\r` ended CC, the tmux session and server, and the outer ssh. That is the existing `kill()` path. `/exit\n` does not submit. ⚠️ **In inline mode, when the pane is scrolled up, `/exit\r` is swallowed by copy-mode**, and `kill()` would leave the remote session running. The remote close path must cancel copy-mode first (arch §C.1). |
| 1.5 Latency | tmux-ready **1.0 s cold / 0.26 s warm**; **CC-ready 1.30 s cold / 0.55 s warm** (Phase 2). |
| 1.6 Cleanup | ✅ No `claudesk` tmux server, no master socket, `~/.claudesk-probe/` and the probe transcripts removed. Left by design: `~/.claudesk/cc-oauth-token` (the operator's), CC's own `~/.claude.json` / `settings.json` entries. |

**WP1, Phase 2 (2026-11-14; real CC on the mini).** Details are in arch §C.1 and §I.

| Item | Result |
|---|---|
| Auth | ⚠️ **The Keychain login is unreadable over ssh** (`loggedIn: false` under every ssh shape). **Operator decision: a `setup-token` token in `~/.claudesk/cc-oauth-token`, exported remote-side by the spawn.** Probed working under `ssh -tt` and in tmux. WP2.5's preflight gains an auth check. |
| Paste on real CC | ✅ A three-line `stagedPayload` send = **one** user turn in the remote transcript. |
| Colour on real CC | ⚠️→✅ CC sends only 256 colours while `TMUX` is set; **the spawn unsets `TMUX`**, and the cells are then RGB. |
| Scrollback on real CC | ⚠️ A fresh host boots CC's **fullscreen** TUI (the operator's local CC is inline). (A) fullscreen: CC keeps and scrolls its own history, no copy-mode trap. (B) inline (`CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN=1`): history complete in tmux, C as ratified; copy-mode swallows input while scrolled up, and cancel-before-inject fixes it (verified on real CC). **Operator decision (2026-11-14): (B) inline, matching local panes.** WP3 must cancel copy-mode before every injection and before `/exit` on close. |
| First open on a fresh host | Folder-trust dialog (once per untrusted folder), then the Bypass Permissions warning (yolo argv). **The operator accepted the warning on the mini.** It persists as `skipDangerousModePermissionPrompt: true` in the host's `~/.claude/settings.json`, and a yolo start then goes straight to the prompt. ⚠️ WP4's hook merge must preserve that key. WP5 input. |
| Open-time budget | **Operator accepted** CC-ready ~0.5 s warm / ~1.3 s cold as Metric 7's open-time budget (measured in default mode; yolo-mode timing not separately measured). |


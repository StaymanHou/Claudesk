---
drive_mode: autopilot
---

# Feature: M17 WP7 — Remote reads: Docs panel, poller, Recycle

**Workflow:** feature
**State:** verify-codify (all phases complete)
**Created:** 2026-11-17
**Entry:** spec (complex feature)
**WBS:** `workflow-system/product/wbs.md` → "### WP7" (tasks 7.1–7.5). **Design:** `arch/remote-workspaces.md` §F (PLANNED), §G as-built (WP6), §B (the link), §E (lifecycle).

## Problem Statement

A remote workspace (its CC runs on another Mac over SSH + tmux) has two IN surfaces that need to read the
remote project folder, and neither works today:

1. **Docs panel.** WP6 shows a placeholder note ("Docs aren't available on a remote workspace yet.") instead of
   `DocsPanel`, because `docs_list` / `docs_read` read the LOCAL filesystem and are refused for an `ssh://`
   key (`workspace_surfaces::refuse_remote`).
2. **Recycle.** It is shown on a remote workspace (gate ON) but **fails after 180 s with no visible cause until
   then**. Its baseline `stat_file` is refused (so the baseline is `null`, which is safe), but its completion
   marker needs an `fs-change` event for `.session.md`. No local `notify` watcher can see a remote folder, so
   that event never arrives and the operation runs into `RECYCLE_TIMEOUT_MS`.

Both need the same two things: a **read-only, path-confined remote read** (`remote_fs`) and a **change signal**
for a remote folder, delivered in the existing `fs-change` shape so the consumers (`DocsPanel`, `recycleSession`)
stay unchanged.

WP7 also has to confirm that the remaining injection surfaces (skill buttons, Session-Start, the Prompt panel)
work on a remote pane through WP3's cancel-before-inject funnel, including while the pane is scrolled up (7.5).

[Updated 2026-11-17: P3.verify-human.2 rejected spec Assumed #1.] The root problem is unchanged (a remote folder needs a read path and a change signal), but WHEN the change signal runs changed. The poller now runs for a workspace only while that workspace is centre stage AND its Docs tab is the active tab (the gate ON, the link Up). A hidden workspace keeps its last snapshot and costs nothing. Its first tick after a return diffs against that snapshot, so changes made meanwhile are delivered at once, and the operator sees a small toast that the catch-up check started and how it ended (success or failure); only that first catch-up is announced. Consequence for Phase 4: Recycle cannot rely on poller events (the Docs tab may be hidden), so its marker comes from the forced `.session.md` re-stat on `Stop` that AC-5 already specifies. Design prior: `background-work-only-for-what-is-on-screen`.

## User Stories

- As the operator on a remote workspace with the workflow gate ON, I want the Docs panel to list and render the
  remote project's workflow docs, and to update live as CC writes them. Then I can re-orient on a remote project the same
  way I do on a local one (prior `a-session-behaves-the-same-wherever-it-runs`).
- As the operator, I want Recycle on a remote workspace to hand off, restart CC and restore, as it does locally.
  It should not look like it is working for three minutes and then fail.
- As the operator, when the link is down, I want the Docs panel to say so in plain words and keep what it last showed,
  rather than show a raw ssh error or go blank (prior `a-silent-non-action-must-not-read-as-done`).
- As the operator with the gate OFF, I want a remote workspace to read nothing from the remote project folder: no
  poller, no doc reads (M10.9 OFF invariant; WP5's open check already holds this line).

## Acceptance Criteria

**AC-1 `remote_fs` (7.1).** A read-only module over the host's master offers `stat`, `read`, `exists` and
`list_dir`. Every requested path is resolved under `RemoteTarget.path`. `..` segments, absolute paths, and
anything that does not normalize to inside the root are rejected **before** any quoting or exec. Unit tests use hostile
inputs (`..`, `/etc/passwd`, `a/../../b`, embedded newline, a leading `-`), and every remote command string
goes through `remote_cmd` ("no variable value outside `quote`"). Reads are capped at the local
`READ_FILE_MAX_BYTES` and reject non-UTF-8, with the same error classes as `read_file_core`. ⚠️ **Symlink
parity:** a symlink inside the project that resolves outside it is refused, as `read_file_core` refuses one locally
(resolved on the remote, in the same exec).

**AC-2 the poller (7.2).** [Updated 2026-11-17, P3.verify-human.2: "open" → centre stage AND its Docs tab active; see AC-2b.] While a remote workspace is open, the gate is ON and its host link is Up, Claudesk polls
the remote **docs set** every **5 s** (operator, spec review 2026-11-17: 1.5 s is more often than needed; overrides arch §F's 1.5 s, which is resynced at close):
- the files `discover` would return (product singles + `*wbs*.md`, state singles incl. `.session.md`, `wip/*.md`)
- the `wip/` listing itself

A change (created / modified / removed, keyed on mtime + size) goes out as an **`fs-change` event of the
existing shape** (`workspace_id`, project-relative `paths`, `kind`, `git_meta: false`). The first tick only
records a baseline and emits nothing. Polling:
- stops when the workspace closes or detaches;
- pauses with no exec while the link is not Up, and on the first tick after Up it diffs against the last snapshot,
  so changes made during a drop are emitted;
- **starts no long-running remote process** (each tick is one short exec that exits);
- **never connects directly**: poll execs ride the master only, as `close_exec` does, so a drop never turns into
  a direct ssh every 5 s;
- adds **at most one** in-flight side-channel exec per host, whatever the number of remote workspaces on it.
  One batched poll per host per tick covers every open workspace there, which respects the `MaxSessions 10` budget
  that `MAX_REMOTE_SESSIONS_PER_HOST = 8` leaves.

**AC-2b active-only polling + the announced catch-up (P3.verify-human.2, 2026-11-17).** A remote workspace is polled
only while it is centre stage AND its Docs tab is the fronted right-panel tab. Otherwise its subscription is paused: it
is left out of the host's batched exec (a host with no active workspace runs no exec at all) and keeps its last snapshot.
On a return (the workspace comes back to centre stage with Docs fronted, or Docs is fronted again) the panel asks for an
immediate catch-up: the host's worker ticks at once and answers that workspace's result. The panel then shows a small
toast: "Checking the remote docs for changes…", replaced by the result: no changes, N docs changed, or the failure in
plain words (link down, a failed or timed-out check). A success toast clears itself after a few seconds; a failure toast
stays until dismissed or replaced. Only that first catch-up is announced; the steady 5 s polls after it are silent. The
very first activation after the workspace opens takes the baseline and shows no toast (the panel is listing fresh then
anyway).

**AC-3 Docs panel on remote (7.3).** `docs_list` / `docs_read` are routed by target **inside the commands**. That is
the single dispatch at the deciding function (arch §F), so `DocsPanel` is unchanged. A remote target goes through
`remote_fs`; its discovery uses **the same curated-list rules** as local `discover` (one shared pure filter, not a
second copy of the list), so `archive/**` and `CHANGELOG.md` stay excluded on remote too.
`workspaceSurfaces(remote).docsRead` becomes `true`. The WP6 placeholder note and its `data-testid="docs-panel-remote"` branch are
removed. `docs_list` / `docs_read` leave the Rust `REFUSED` set, and `tests/remote_refusal_is_first.rs` (two-way
set pin) plus the frontend `workspaceSurfacesGuard` command mirror are updated with them. Live reload works through
the poller with the panel's existing visible-only / stale-catch-up behaviour. Gate OFF: no Docs tab (as today) and
no reads.

**AC-4 link down on Docs.** With the link not Up, a Docs list or read fails fast (no direct connect, no hang) with
a plain-words message ("The remote host isn't reachable right now."). The panel keeps the last list and content and
shows that message as its existing reload note, never a blank panel and never a raw `ssh:` / `os error` string.

**AC-5 Recycle on remote (7.4).** On a remote workspace, Recycle completes end-to-end on the mini:
- the baseline `.session.md` mtime is read remotely, routed by target at the function that decides;
- `/session-handoff` is injected through `cc_inject`;
- the composite marker is a fresh write, then the next `Stop` over the link. [Updated 2026-11-17: the write is seen by the forced re-stat at `Stop` (below), not by the poller, which only runs while Docs is fronted.];
- the clean mark is set;
- kill and respawn give a new tmux session with no `--continue`;
- `/session-restore` is injected into the fresh session.

⚠️ **Poller lag must not become a false failure.** The machine turns a `Stop` received while it still awaits a fresh
write into `failed`, so on a remote workspace a `Stop` in that state first forces one fresh remote stat of
`.session.md` and feeds any fresh write before the `Stop`. The local path is unchanged (byte-identical). A test
drives the "write lands, `Stop` arrives before the next poll tick" ordering and shows success, not `failed`.

**AC-6 injections confirmed (7.5).** Skill buttons, Session-Start and the Prompt panel (`⌘↵` multi-line) each
land as one command or prompt in a remote pane, both at the bottom and **while scrolled up into copy-mode**, through
WP3's cancel-before-inject funnel. No code change is expected. If one fails, it is a defect fixed in this WP.

**AC-7 gate OFF reads nothing.** With `workflow_features_enabled` OFF, an open remote workspace runs **zero**
poll execs and zero doc reads. The gate is checked **in the backend on every tick** (as WP5's open check reads it),
so a live toggle takes effect without a reopen. `offInvariantGuard` (6 arms / 10 subjects) and
`workflowApplicableGuard` stay green **unedited**.

**AC-8 local unchanged.** A local workspace's Docs panel, watcher and Recycle behave byte-identically to HEAD.
The local `docs_*` path still runs `validate_frontend_root` + `read_file_core`, and the local `discover` output is
unchanged (its existing tests pass unedited).

**AC-9 the 5 WP6 review MINORs, folded in** (`backlog-quality-findings.md` → `# m17-wp6-workspace-surfaces`):
- `surfaces` becomes **required** on `defaultPanel` / `selectPanel` / `reconcilePanel` (fail-closed). It stays defaulted on
  `availablePanels` only, so the OFF-invariant guard's `availablePanels(false)` call stays unedited. All call sites
  pass it.
- `workspaceSurfacesGuard`'s header is narrowed to what the proximity pin checks, and names the DOM tests as the
  containment instrument.
- `WipRead` / `TranscriptTail` get `#[derive(Default)]` and one withhold value each.
- One exported `WorkspaceNotice` type replaces the three inline copies.
- The `workspace_surfaces` module doc stops implying a frontend text contract.

All five are deleted from the backlog on close, with CHANGELOG lines.

**AC-10 gates.** `pnpm verify:auto` is green. New async commands (or sync→async conversions of `docs_list` /
`docs_read`) are listed in `sync_commands_do_not_block.rs`'s `ASYNC_COMMANDS` with reasons. No sync `#[command]`
blocks on ssh. Each new guard form is mutation-proven individually.

## Out of Scope

- Any remote **write**. Claudesk still never writes into `workflow-system/`. The remote write list in arch §F is unchanged.
- The OUT surfaces on remote (editor, diff, tree, finder, search, Sublime, media, supervisor, turn jump), which WP6 ruled absent.
- Watching anything beyond the docs set (no general remote fs watch, no `fswatch`, no FUSE).
- A remote `stat_file` for the editor: the editor is absent on remote. Recycle's baseline gets its own routed read.
- Installed-build acceptance against the mini (WP8).
- `SURFACE-2026-11-17-APP-TSX-FAST-REFRESH-CLOSES-REMOTE-WORKSPACES` (the dev-only hazard; AC-9's `WorkspaceNotice`
  edit touches `App.tsx`, so close remote workspaces before editing it).
- `SURFACE-2026-11-17-AUTO-RESUME-INJECT-ANSWERS-BYPASS-PERMISSIONS-DIALOG-NO-EXIT` (separate high item; it only bears on
  live checks on a fresh account, and the mini's account already accepted the warning).

## Technical Constraints

- **Probe coverage:** the only external dependency is the mini over ssh. WP1 (shipped) probed the terminal, and
  WP3–WP5 shipped `LinkRegistry::exec` / `close_exec`, `remote_cmd` quoting and `ValidTarget`. No new 3rd-party service.
- **Reuse, don't fork:** WP5's open check is the template (`remote_open_check`: `on_blocking_worker`, one exec,
  gate read via `workflow_applicable(read_workflow_features_enabled(..), None)`). Remote commands are built in
  `remote_cmd` and unit-pinned as whole strings.
- ⚠️ **`exec` vs `close_exec`:** `LinkRegistry::exec` uses `ControlMaster=no` and **silently goes direct** when the
  master is gone (CLAUDE.md, WP3). Poll and doc-read execs must use the master-only form (`master_only_exec_argv` /
  `NO_DIRECT_FALLBACK`) and fail fast when the link is not Up.
- **mtime precision:** the remote host is macOS. Use a form that yields ms (Perl's `Time::HiRes::stat`; `perl` is a
  preflight requirement already) so the `f64 mtime_ms` contract matches local `FileMarker` / `DocEntry`.
- **Discovery as a pure filter:** split `docs::discover` into "list the three dirs" (local fs or remote exec) + one pure
  filter over the listing, so the curated rules exist once. `excludes_archive_and_changelog` must keep failing if
  the filter is made recursive.
- **Main thread:** every ssh path is async or on a worker (`sync_commands_do_not_block.rs`). The poller is a worker
  thread per host, never a timer on the main thread.
- **Guards touched deliberately:** `remote_refusal_is_first.rs` (`docs_list` / `docs_read` leave `REFUSED`),
  `workspaceSurfacesGuard` (command mirror + `SITES`), `invokedCommandsAreRegistered` (automatic for new commands).
- **Live verification** uses the scratch remote row `~/claudesk-scratch-remote` (re-add through the picker) and the
  memory `remote-verify-hygiene`: close remote workspaces before `App.tsx` edits; rebuilds are hard stops. The
  agent drives the dev app via the `tauri` MCP bridge, and the operator judges what needs eyes.

## Elicitation

**Asked:** none. Every open point was either discoverable in code or cheap to reverse, so each became an assumption below.

**Assumed** (correct any of these at review):
1. **One batched poller per host**, running while ≥1 remote workspace on that host is open and the gate is ON. It
   is not limited to "only while the Docs tab is visible". `DocsPanel`'s stale-catch-up depends on events still arriving
   while it is hidden, and Recycle needs the signal regardless of the visible tab. Cost: one short exec per host every 5 s.
2. **Gate checked in the backend, per tick**, not only at start, so a live toggle is honoured without frontend wiring
   and without a new OFF-invariant arm.
3. **Link-down Docs behaviour:** keep the last content plus a plain-words reload note (AC-4). No new UI.
4. **Recycle's remote `Stop` race** fixed by a forced re-stat on `Stop` (AC-5), not by shortening the poll interval.
5. **`docs_read` on remote is confined to the project root** (parity with local, which allows any file under the
   root), not narrowed to the curated list. The panel only ever asks for listed paths anyway.
6. **All 5 WP6 MINORs folded in** (AC-9). They are cheap and in the files WP7 touches. Any one can be split back out to the backlog.
7. **7.5 is verification-only** unless a defect turns up.
8. Poll interval is **5 s** (operator correction at spec review; was 1.5 s per arch §F). Recycle does not depend on it
   (AC-5's forced re-stat on `Stop` covers the lag), so the interval only sets Docs freshness: a doc CC writes shows up
   within ~5 s instead of the local watcher's ~200 ms, a bounded difference. One named constant, so it can be retuned.

**Design priors consulted:**
- `[PRIOR: a-session-behaves-the-same-wherever-it-runs]` agrees with live reload and with Recycle at local parity (rule 2).
- `[PRIOR: a-silent-non-action-must-not-read-as-done]` agrees with AC-4's plain-words link-down note and with AC-5 replacing
  the 180 s silent timeout (rule 2).
- `[PRIOR: gate-substrate-dependent-feature-class-behind-default-off-opt-in]` agrees with AC-7 (gate OFF reads nothing, rule 2).

## Open Questions

- [ ] None blocking. The plan settles the mechanism choices (sync→async `docs_*` vs new commands; where the per-host
  poller lives, `remote_link` vs a new `remote_fs::poller`; how Recycle's remote baseline read is exposed).

## Plan notes (mechanism choices the spec left open)

- **Phase order:** the WP6 MINOR cleanup goes **first**. It edits `App.tsx` (`WorkspaceNotice`), and doing it before any
  remote workspace is open for live checks avoids the Fast-Refresh-ends-remote-sessions hazard. Making `surfaces`
  required also lands before Phase 3/4 add new call sites.
- **`docs_list` / `docs_read` become `async`** (same names, so `DocsPanel` is unchanged), and each body runs on
  `crate::blocking::on_blocking_worker` for **both** branches. Both go into `ASYNC_COMMANDS` with reasons. Local branch:
  `validate_frontend_root` + `discover` / `read_file_core`, unchanged.
- **A new routed `docs_stat(root, path)`** (async, the same dispatch) replaces Recycle's `stat_file` call. `stat_file` stays an
  editor command, refused on remote. Local Recycle reads the same file through the same `stat_file_core`.
- **Discovery split:** `docs::discover(root)` = `list_doc_dirs(root)` (local fs) → `filter_docs(listing)` (pure).
  Remote: one exec that prints the three dirs' entries (`name\ttype\tsize\tmtime_ms`) → the same `filter_docs`.
- **`remote_fs`** = new module `src-tauri/src/remote_fs/`. `mod.rs` holds the pure parts: the path-containment check,
  listing-line parsing, and the snapshot diff → `FsChange`. `commands.rs` holds the routed doc commands' remote halves.
  `poller.rs` is the per-host worker. Remote command strings live in `remote_cmd` (constant Perl scripts sent with
  quoted args: `Time::HiRes::stat` for ms, `Cwd::realpath` for the symlink check, a byte cap on read). Execs go through
  a new `LinkRegistry::master_exec` (the master-only argv, Up-only, fail fast: the `close_exec` shape made `pub(crate)`
  for reads), mapped to the plain-words "The remote host isn't reachable right now."
- **The poller:** `remote_poll_start(workspace_id, project_path)` / `remote_poll_stop(workspace_id)`. The frontend calls
  them in `useWorkspaceStatus`'s existing diff loop: start in the `else` of the `fsWatch` branch, stop beside
  `workspace_watch_stop`. There is one worker thread per host with ≥1 subscription, which exits when the last one leaves.
  Each 5 s tick does three things. It reads the gate (`read_workflow_features_enabled`; OFF → skip). It checks the link
  (not Up → skip). It runs ONE exec that lists every subscribed root's doc dirs, then diffs per workspace and emits
  `fs-change`. Interval constant: `REMOTE_POLL_INTERVAL = 5 s`.
- **Recycle's `Stop` race:** in `recycleSession`'s status listener, when `!workspaceSurfaces(projectPath).fsWatch`
  (the poller watches, not `notify`), a `Stop` first awaits one `docs_stat` of `.session.md`. A fresh mtime is fed as a
  `session-md-write`, and then the `Stop` is fed. The local branch feeds the `Stop` directly, as today.

## Work Tree

- [x] Phase 1: WP6 review MINORs folded in (cleanup, no behaviour change)
  **Observable outcomes:**
  - CLI: `pnpm verify:auto` exits 0.
  - CLI: `grep -n "surfaces = LOCAL_SURFACES\|surfaces: WorkspaceSurfaces = LOCAL_SURFACES" src/components/workspace/panelHost.ts` matches **only** `availablePanels`. `./node_modules/.bin/tsc --noEmit` **fails** when one `selectPanel(…)` call site in `RightPanelHost.tsx` drops its `surfaces` argument (mutation, then restored by `cp` aside + `shasum`).
  - CLI: `grep -rn "seq: number; kind" src` finds no inline notice shape outside the one exported `WorkspaceNotice` type.
  - CLI: `cargo test --all-targets` passes, including `remote_refusal_is_first` unedited. `WipRead::default()` / `TranscriptTail::default()` is each the only withhold value in its command.
  - CLI: `offInvariantGuard.test.ts` and `workflowApplicableGuard` are unchanged (`git diff --stat` shows neither file).
  - Browser (dev app, MCP bridge): a local workspace boots, its right panel shows the same tab set as before, and a remote-key render test (`remoteRightPanelLive`) still passes.
  **Alignment questions:**
  - none
  - [x] P1.1 `panelHost.ts`: `surfaces` required on `defaultPanel` / `selectPanel` / `reconcilePanel`. `availablePanels` keeps its default for the OFF-invariant guard. Pass `surfaces` at every call site.
  - [x] P1.2 Export one `WorkspaceNotice` type and use it in `App.tsx`, `CenterStage.tsx` and `Workspace.tsx`. ⚠️ No remote workspace may be open in the dev app during the `App.tsx` edit.
  - [x] P1.3 `#[derive(Default)]` on `WipRead` / `TranscriptTail`, with one withhold value each.
  - [x] P1.4 Doc-only: narrow `workspaceSurfacesGuard`'s header claim, and reword the `workspace_surfaces` module doc so it implies no frontend text contract.
  - [x] verify-auto
    — evidence: `pnpm verify:auto` → EXIT=0 in 58s (vitest 317 files / 4022 tests passed; cargo 1378 passed, 0 failed; lint, format, tsc, check:link, fmt, clippy -D warnings all clean)
    — evidence: `grep -n "= LOCAL_SURFACES" panelHost.ts` → line 155 only (`availablePanels`)
    — evidence: mutant (the openFile `selectPanel` site drops `surfaces`) → `tsc --noEmit` exit 2, `TS2554: Expected 4 arguments, but got 3` at RightPanelHost.tsx:654; restored by `cp` aside, shasum identical, tsc clean again
    — evidence: `grep -rn "seq: number; kind" src` (non-test) → no match; the shape lives once, in `WorkspaceNotice` (`state/workspace.ts`)
    — evidence: `git diff --stat` on `offInvariantGuard.test.ts`, `workflowApplicableGuard.test.ts`, `tests/remote_refusal_is_first.rs` → empty (unedited)
  - [x] verify-self
    — evidence (runner): grep `= LOCAL_SURFACES` → only `availablePanels` (panelHost.ts:155); a 2nd mutant site (`addTerminal`'s `selectPanel` drops `surfacesRef.current`) → tsc `TS2554` at RightPanelHost.tsx:618, EXIT=2, restored (shasum match)
    — evidence (runner): `grep -rn "seq: number; kind" src` → none; `cargo test --all-targets wip` 21 passed, `--test remote_refusal_is_first` 2 passed, `transcript` 24 passed; `src-tauri/tests/` unchanged; `wip_read` / `transcript_tail` withhold = `::default()` only
    — evidence (runner): offInvariantGuard + workflowApplicableGuard unedited, 43/43 pass; `vitest run remoteRightPanelLive panelHost workspaceSurfacesGuard` → 4 files, 91 passed
    — evidence (orchestrator, dev app via tauri MCP bridge, after a webview reload to drop the runner's HMR'd mutant): `#root` has 1 child; opened local `scratch-a` → tab set `prompt, editor*, diff, terminal` (gate OFF in dev; = `availablePanels(false)` local, opening on Editor); clicked diff → terminal → prompt → editor, each became the single `.is-active` tab (every one of those routes through a changed `selectPanel` call); no `docs-panel-remote` node
  - [x] verify-human — zero admissible leaves (F11)
  - [x] verify-codify
    Test scope: full — suite not long (runtimes.md `pnpm verify:auto` Last 58s)
    — evidence: new `remoteRightPanelLive` "each tab click fronts exactly that tab" (consuming surface: the tab row, live render; LOCAL clicks diff/terminal/prompt/editor). Mutant (the Diff tab's onClick selects "editor") → `1 failed`; restored, 18/18 pass
    — evidence: new `panelHostSurfaces` type pin (`@ts-expect-error` on a kind-less call to each of the three fns). Mutant (default `= LOCAL_SURFACES` back on `selectPanel`) → tsc `TS2578: Unused '@ts-expect-error'`, EXIT=2; restored (shasum match)
    — evidence: `pnpm verify:auto` → EXIT=0 in 45s (vitest 317 files / 4024 tests; cargo 1378 passed)

- [x] Phase 2: `remote_fs` + Docs panel reads on a remote workspace (7.1, 7.3 without live reload)
  **Observable outcomes:**
  - CLI: `cargo test remote_fs` passes the hostile-path table (`..`, `/etc/passwd`, `a/../../b`, an embedded newline, a leading `-`, an empty path). Each is rejected before any command string is built, which is asserted with a recording exec double that sees **zero** calls.
  - CLI: `cargo test docs` passes. Local `discover` output is unchanged (its existing tests pass unedited), and `filter_docs` on a listing containing `archive/x.md`, `CHANGELOG.md` and `wip/a.md` returns only the curated entries. `excludes_archive_and_changelog` fails under a recursive-listing mutation.
  - CLI: the `remote_cmd` strings for list / read / stat are pinned whole. A path with `'`, `$`, a backtick or a space round-trips through `quote` (unit).
  - CLI: `tests/remote_refusal_is_first.rs` passes with `docs_list` / `docs_read` removed from `REFUSED` and `docs_stat` routed. `sync_commands_do_not_block.rs` passes with the new async entries.
  - CLI (state-changing, scratch remote folder `~/claudesk-scratch-remote` on the mini only): create `workflow-system/product/vision.md` ("# Remote vision"), `workflow-system/state/wip/demo.md`, `workflow-system/product/archive/old.md` and a symlink `workflow-system/product/leak.md -> /etc/hosts` there over ssh.
  - Browser (dev app, MCP bridge, scratch remote row open, gate ON): the Docs tab lists `vision`, the `wip` entry `demo.md` and nothing from `archive/`. Selecting `vision` renders a heading "Remote vision". `[data-testid="docs-panel-remote"]` is absent.
  - CLI (dev app, invoke via the bridge): `docs_read` of `workflow-system/product/leak.md` on the remote root → an error, never the contents of `/etc/hosts`. `docs_read` of `../x` → an error.
  - Browser (state-changing: stop the link's master with `ssh -O exit` on the dev ControlPath): re-opening the Docs tab or switching docs shows "The remote host isn't reachable right now." as the reload note. The previous list stays, and no `ssh:` / `os error` text appears in the panel (DOM text check). `ps` shows no new direct `ssh <host>` without `-S` during the check.
  - Browser (local workspace): its Docs panel lists and renders as before.
  **Alignment questions:**
  - The Docs panel on a remote workspace, in action: now that you see the remote project's docs listed and rendered, is it what you wanted?
  - (decision) The link-down wording "The remote host isn't reachable right now.", shown above the kept list: right words, right place?
  - [x] P2.1 `remote_cmd`: constant list / read / stat scripts (Perl `Time::HiRes`, `Cwd::realpath` containment, byte cap = `READ_FILE_MAX_BYTES`) plus their builders. Unit-pinned whole.
  - [x] P2.2 `remote_fs` pure core: path containment (reject before quoting), listing parse, and error mapping to `EditorFsError`-equivalent classes plus the link-down message.
  - [x] P2.3 `LinkRegistry::master_exec` (Up-only, master-only argv, fail fast), reusing `close_exec`'s body.
  - [x] P2.4 `docs`: split `discover` into a local lister + the pure `filter_docs`, with a remote lister over `remote_fs`.
  - [x] P2.5 `docs_list` / `docs_read` become async and routed. New `docs_stat`, async and routed. Registered in `lib.rs`. Update `REFUSED`, `remote_refusal_is_first`, `ASYNC_COMMANDS`, and the `workspaceSurfacesGuard` command mirror / `SITES`.
  - [x] P2.6 Frontend: `docsRead: true` on REMOTE, and remove the WP6 note branch in `RightPanelHost`. Check `DocsPanel`'s error path turns a link-down failure into its reload note (not `setError` when a list is already shown).
    — as built (deviations, recorded here for verify-human / the arch resync):
      - `docsRead` is REMOVED from `workspaceSurfaces` rather than flipped to `true`. A flag true for both kinds gates nothing, and keeping it would have left a dead `surfaces.docsRead ?` branch. `DocsPanel` left the guard's OUT mount list, `SITES` and the pins with it.
      - Docs commands are classified in a new `ROUTED` set in `tests/remote_refusal_is_first.rs` (two-way set pin: REFUSED ∪ ROUTED ∪ EXEMPT), and pinned NOT to open with the refusal.
      - The remote read cap is `REMOTE_READ_MAX_BYTES` = 3 MiB, not the local 64 MiB, because the exec's stdout is capped at `MAX_OUTPUT` (4 MiB). The TooLarge words are the same.
      - Local `discover` is unchanged and its tests are unedited. The curated rules are shared as constants + `is_wbs_name` / `is_wip_name`. `filter_listing` is the listing-side twin, tied to `discover` by `filter_listing_agrees_with_discover` (a rich tree) and by `the_listing_script_feeds_the_same_rules_as_local_discover` (the REAL Perl script run locally).
      - `DocsPanel` is unchanged. A link-down list refresh already lands in its reload note with the list kept. A doc read while the link is down shows the plain words in that doc's content area (there is no previous content for a newly picked doc).
  - [x] verify-auto
    — evidence: `pnpm verify:auto` → EXIT=0 in 64s (vitest 317 files / 4024 tests; cargo 1392 passed, 0 failed; lint, format, tsc, check:link, fmt, clippy -D warnings clean)
    — evidence: `cargo test --lib remote_fs` → 13 passed (hostile-path table with zero exec calls; framing; status words; link-down mapping; the REAL Perl list/read/stat scripts run locally against a temp tree: symlink-out and symlinked-dir-out refused, non-UTF-8, missing, directory, over-cap, a hostile file name round-trips, stat mtime within 1 ms of `stat_file_core`)
    — evidence: `cargo test --lib docs::` → 21 passed, incl. `filter_listing_agrees_with_discover` (local `discover` tests unedited)
    — evidence: `cargo test --test remote_refusal_is_first --test sync_commands_do_not_block` → 2 + 16 passed (docs_* in ROUTED, not refused; docs_list / docs_read / docs_stat listed in ASYNC_COMMANDS)
  - [x] verify-self
    — evidence (runner): hostile-path table PASS (`..`, `/etc/passwd`, `a/../../b`, `a\nb`, `""` + 7 more refused with ZERO exec calls; a leading `-` is a legal name that reaches perl only after `--`, quoted, and round-trips via the real script); docs PASS (22 passed; `filter_listing` == `discover` on a rich tree; mutant re-admitting `archive/m10` → `excludes_archive_and_changelog` FAILED, restored, shasum match); guards PASS (`remote_refusal_is_first` 2, `sync_commands_do_not_block` 16; docs_* in ROUTED + ASYNC_COMMANDS, not REFUSED)
    — evidence (runner, FAIL → fixed in place, see `[SHORTCUT-2026-11-17]`): the command strings were checked only by prefix + argument tail, and the stat string not at all. Added `the_command_strings_are_pinned_whole` (assert_eq for read / stat / list)
    — evidence (orchestrator, dev app via bridge, fresh build; state-changing on the scratch remote folder only: created `vision.md`, `wip/demo.md`, `archive/old.md`, symlink `leak.md -> /etc/hosts`; moved the WP5 `.session.md` aside as `.session.md.wp7-aside` so the open would not auto-fire `/session-restore`; added the scratch remote row via `add_remote_project`; set the dev gate ON (it was OFF)): opened the scratch remote row → tabs `docs*, prompt`; Docs lists exactly `Vision`, `demo.md` (no `archive/`, no `leak.md`); opens on `demo.md` ("Demo WIP"); clicking Vision renders heading "Remote vision"; no `docs-panel-remote` node. Screenshot: scratchpad `p2-remote-docs.jpg`
    — evidence (orchestrator, IPC on the remote key): `docs_read leak.md` → "path workflow-system/product/leak.md is outside the workspace root …" (116 ms, refused ON the remote by realpath); `../x` and `/etc/hosts` → the same words in 1 ms (refused locally, no exec); `vision.md` → "# Remote vision…" (131 ms); `docs_stat wip/demo.md` → `{mtime_ms, size: 33}`; `docs_list` → `[vision.md, wip/demo.md]`
    — evidence (orchestrator, link drop: `ssh -O exit` on the scratch host's master while the page polled `docs_list` every 50 ms): OK until the drop, then 11 calls → "The remote host isn't reachable right now." in 1–133 ms each (fail fast, no hang), then OK again ~1.7 s later after the link reconnected. The panel's list stayed (rows vision + wip) and no `os error` / `ssh:` text appeared. A 20 s `ps` watch for `ssh` without `-S` caught only the LINK's own reconnect pre-connect step (`ssh -o BatchMode … -- <host> set -e … mkdir ~/.claudesk/…`, WP3/WP4's connect path), never a read
    — evidence (fresh runner, re-verify of the fixed leaf): `the_command_strings_are_pinned_whole` assert_eq on read / stat / list; mutant (a) swap root/rel in `doc_read_command` → FAILED at the read assert; mutant (b) drop the dir count from `doc_list_command` → FAILED at the list assert; restored, shasum match; `cargo test --lib remote_fs` 14/14. Not pinned by it (stated): the Perl text enters as `quote(PROG)` on both sides; its behaviour is the 8 `LocalShell` tests + the live reads above over the real remote zsh
    — evidence (orchestrator, LOCAL control, relaunched dev app): `scratch-c` (default profile, a scratch `workflow-system/product/vision.md` created for this) → Docs tab front, row `vision`, renders "Local vision" through the async routed `docs_list` / `docs_read`. (`scratch-a` has no Docs tab: its `original-dev` profile is not workflow-applicable, the existing gate behaviour)
    - [x] align: the Docs panel on a remote workspace, in action — evidence: the dev app has the scratch remote workspace open (Docs tab: Vision + demo.md); screenshot `/private/tmp/claude-501/-Users-stayman-Personal-projects-claudesk/fb399e5d-5e6d-485f-b108-a6ce6370c8e2/scratchpad/p2-remote-docs.jpg`
    - [x] align (decision): link-down wording "The remote host isn't reachable right now." — evidence: shown as the error of a list or read while the master is down (fail-fast, 1–133 ms). WHERE: a background list refresh shows it as the panel's reload note above the kept list; picking a doc while down shows it in place of that doc's content
  - [x] verify-human — operator: "all good" (2026-11-17)
    - [x] P2.verify-human.1: the remote Docs panel in the dev app (scratch remote workspace): is this what you meant? — approved
    - [x] P2.verify-human.2: (decision) link-down words + placement — A: keep ("The remote host isn't reachable right now."; reload note over the kept list / in place of a newly picked doc's content)
  - [x] verify-codify
    Test scope: full — suite not long (runtimes.md `pnpm verify:auto` Last 64s)
    — evidence: consuming-surface seam made testable: the three doc commands now share ONE dispatch, `docs::commands::serve(data_dir, exec, root, call)` (local root check extracted as `editor_fs::commands::validate_root_in`, used by `validate_frontend_root` too). New `serve_routes_by_the_root_kind_with_one_exec_per_remote_call`: a REAL project list (a local row + a remote row whose path is a temp dir) — remote list/read/stat via the real Perl script (`LocalShell`), exactly 1 exec per remote call; the local arm reads the disk with ZERO execs; an unknown `ssh://` key and an unknown local root are refused, zero execs. Mutant (`if false && is_remote_key(root)`, every root to the local arm) → FAILED; restored, shasum match, passes
    — evidence: already covered, not duplicated: the remote scripts (8 `LocalShell` tests), link-down mapping, pinned strings, `filter_listing` ≡ `discover`, the frontend remote Docs mount + gate-OFF no `docs_list` (`remoteRightPanelLive`), the guards (`remote_refusal_is_first` ROUTED, `sync_commands_do_not_block`)
    — evidence: `pnpm verify:auto` → EXIT=0 in 60s (vitest 317 files / 4024 tests; cargo 1394 passed, 0 failed)

- [x] Phase 3: The remote poller and live Docs reload (7.2)
  **Observable outcomes:**
  - CLI: `cargo test remote_fs::poller` passes these cases:
    - The snapshot diff emits created / modified / removed with project-relative paths, and nothing on the first tick.
    - Two workspaces on one host make ONE exec per tick (recording double).
    - Gate OFF → zero execs. Link not Up → zero execs, and the first Up tick emits the changes made meanwhile.
    - The last unsubscribe ends the worker thread (`recv_timeout`-bounded join).
  - Browser (dev app, scratch remote row, gate ON, Docs tab on `vision`; state-changing on the scratch remote folder only): append a line to `vision.md` over ssh. Within 10 s the rendered doc shows the new line, with no reload click (`webview_wait_for` on the text).
  - Browser (same setup): `touch workflow-system/state/wip/new-item.md` over ssh → within 10 s the list shows `new-item.md`. `rm` it → within 10 s it is gone.
  - CLI (gate OFF via the settings toggle, dev app): with the remote workspace open, a 20 s window shows **no** poll exec. Run `pgrep -fl "ssh.*-S.*claudesk"` every 2 s, check that no exec carries the poll script marker, and compare with gate ON, where execs appear. Positive control included.
  - CLI: closing the remote workspace (×) → `remote_poll_stop` is called, and within 6 s no further poll execs run for that host.
  - CLI (link drop: `ssh -O exit`): during the drop, no `ssh` process without `-S` appears. After the link is Up again, a doc edited during the drop shows up in the panel.
  - [Added 2026-11-17 at the P3.verify-human.2 back-loop] CLI (dev app, scratch remote row, gate ON): with the remote workspace open but its Docs tab NOT fronted (Prompt in front), a 20 s window shows **zero** poll execs (`pgrep -f CLAUDESK-FS:begin`); fronting Docs → execs appear every 5 s (positive control). Likewise with Docs fronted but a LOCAL workspace at centre stage: zero.
  - [Added] Browser (same setup): edit `vision.md` on the mini while Prompt is fronted, then front Docs → a toast "Checking the remote docs for changes…" appears and is replaced by "Remote docs checked: 1 doc changed." (clears itself after ~4 s), and the edit renders. Fronting Docs again with no change → "Remote docs checked: no changes." The first Docs show after opening the workspace shows NO toast.
  - [Added] Browser (state-changing: `ssh -O exit` on the dev ControlPath with Docs un-fronted, then front Docs before the link is back, or with the link held down): the toast reads "Couldn't check the remote docs: the remote host isn't reachable right now." and stays until dismissed.
  **Alignment questions:**
  - The 5 s poll in action: edit a doc on the remote and watch it appear in the panel. Is that freshness enough?
  - Assumed default (spec #1), in action: the poller runs whenever a remote workspace on that host is open with the gate ON, not only while Docs is visible. Still what you want?
  - [x] P3.1 `remote_fs::poller`: per-host worker, subscription registry (managed state), 5 s tick, gate + link checks per tick, one batched exec, per-workspace snapshot diff → `app.emit(FS_CHANGE_EVENT, FsChange)`.
    — as built: `src-tauri/src/remote_fs/poller.rs`. Pure `snapshot` (the `filter_listing` set keyed on mtime + size), `diff` (one `FsChange` per workspace per tick; `kind` = the single kind, else `Other`), `poll_tick` (gate → link → ONE `doc_list_command` over every root → diff). `RemotePoller` = the registry: `subscribe` starts the host's worker or WAKES it (so a new workspace's baseline is taken at once, not up to 5 s later), `unsubscribe` / `unsubscribe_all` drop the host's channel sender. The lock is never held across an exec (copy out, tick, write back under the worker's generation). 11 tests in `poller/tests.rs`, one of them through the REAL listing script.
  - [x] P3.2 Commands `remote_poll_start` / `remote_poll_stop`. ⚠️ Sync is fine only if they just touch the registry (no ssh). The `sync_commands_do_not_block` guard decides.
    — as built: `remote_fs/poller/commands.rs`, both sync (registry + `projects.json` read only); `sync_commands_do_not_block` 16/16 with no new LEDGER entry. Start refuses a non-`ssh://` key and resolves the row through `target_for`. The production `PollEnv` reads the gate as WP5's open check does (`workflow_applicable(read_workflow_features_enabled, None)`) and the link as `state(host) == Up`. Not in `remote_refusal_is_first`'s scope (a remote-only module).
  - [x] P3.3 Frontend: `useWorkspaceStatus` starts the poller for `!fsWatch` workspaces and stops it beside `workspace_watch_stop`. Add a DOM/unit test that a remote workspace invokes `remote_poll_start` and not `workspace_watch_start`.
    — as built: start AND stop branch on `workspaceSurfaces(path).fsWatch` (a remote workspace no longer gets the no-op `workspace_watch_stop`). `remoteWatcherSkip.test.tsx`: the remote key → `remote_poll_start` only; leaving the list → `remote_poll_stop` for the remote, `workspace_watch_stop` for the local.
  - [x] P3.4 The quit path: the poller registry is dropped and workers are joined or detached without blocking the main thread.
    — as built: `perform_quit_teardown` calls `unsubscribe_all()` just BEFORE `links.stop_all()`. Workers are detached, never joined: each exits at its next wake (`recv_timeout` sees the dropped sender at once).
  - [x] verify-auto
    — evidence: `pnpm verify:auto` → EXIT=0 in 64s (vitest 317 files / 4025 tests; cargo 1405 passed, 0 failed; lint 0 errors (1 pre-existing warning in the untouched `XtermPane.tsx`), format, tsc, check:link, fmt, clippy -D warnings clean)
    — evidence: `cargo test --lib remote_fs::poller` → 11 passed (snapshot = curated set; diff created/modified/removed/Other; baseline emits nothing; 2 workspaces → 1 exec with both roots; gate OFF / link down → 0 execs, first Up tick emits the meanwhile change; cut/failed exec keeps the snapshot; the REAL Perl listing script; worker wake-on-subscribe, last unsubscribe ends the worker with no exec after, gate-OFF worker 0 execs + gate-ON positive control)
    — evidence: `cargo test --test remote_refusal_is_first --test sync_commands_do_not_block` → 2 + 16 passed (the sync `remote_poll_start` / `remote_poll_stop` need no LEDGER entry)
    — evidence: `vitest run remoteWatcherSkip workspaceSurfacesGuard` → 2 files, 32 passed (remote key → `remote_poll_start` only; leaving the list → `remote_poll_stop` / `workspace_watch_stop` by kind)
    — evidence (RE-RUN after the P3.verify-human.2 back-loop): `pnpm verify:auto` → EXIT=0 in 64s (vitest 318 files / 4029 tests; cargo 1410 passed, 0 failed; clippy/fmt clean; lint 0 errors, the same pre-existing `XtermPane.tsx` warning). Two first-run failures fixed on the way: `cargo fmt` (two reflowed lines) and `singleAuthority` "the Docs panel modules carry no WIP phase labels" (a `P3.verify-human.2` label in `DocsPanel.tsx`; reworded, and the new `remoteDocsCatchUp.ts` ADDED to that guard's file list, mutation-proven: a `P3.1` label in it → 1 failed, restored by `cp`, shasum match)
    — evidence (re-run): `cargo test --lib remote_fs::poller` → 16 passed; `vitest run remoteDocsCatchUp remoteRightPanelLive workspaceSurfacesGuard docsPanelWiring` → 90 passed; `sync_commands_do_not_block` 16 passed (`remote_poll_catch_up` in `ASYNC_COMMANDS`)
  - [x] verify-self
    — evidence (runner): all four `cargo test --lib remote_fs::poller` cases PASS (11/11). Each property was mutation-proven ALONE, restored by `cp` + shasum match: (a) gate check removed → 2 failed; (b) `roots.truncate(1)` → 2 failed; (c) removed-paths loop dropped → 2 failed; (d) emit on the baseline → 6 failed; (f) link check removed → 1 failed; (g) the emptied host is never removed → the last-unsubscribe test failed at its 5 s deadline (no hang). Frontend (e): the remote stop calls `workspace_watch_stop` → `remoteWatcherSkip` 1 failed. By reading: the registry lock is never held across `exec.run` (`current_subs` → unlocked `poll_tick` → `write_back` with a generation check). `sync_commands_do_not_block` 16/16. The quit order (`unsubscribe_all` before `links.stop_all`) is confirmed by reading only; no test covers it.
    — evidence (orchestrator, dev app via bridge, fresh launch with the Claude-marker strip; scratch remote row, gate ON; state-changing on the mini scratch folder only): opened the scratch remote → Docs list `Vision`, `demo.md`. The first poll exec came at open +6 s (the subscribe-tick found the link still Connecting and skipped), then one every 5 s.
    — evidence (live reload of content): `echo "Poller line one." >> vision.md` over ssh at 14:48:55 → the rendered doc read "… Poller line one." by 14:49:04, with no click. Selection stayed on Vision.
    — evidence (live list): `touch wip/new-item.md` at 14:49:12 → listed at 14:49:14 (in-page 100 ms watcher). `rm` at 14:49:24 → gone at 14:49:29.
    — evidence (gate OFF, the toggle's own command `workflow_set_features_enabled` invoked from the webview, since the Settings panel sits behind the picker): `pgrep -f CLAUDESK-FS:begin` every 30 ms. Gate ON control: 4 poll execs in 20 s (14:50:25/30/35/40). Gate OFF, workspace still open: **0** in 20 s, and the Docs tab left (tabs = `prompt`). Gate back ON with no reopen: execs resumed (3/3 in 16 s, then 5 in 30 s). ⚠️ One 12 s window right after the ON caught only 1 of an expected 3. Unexplained: the counter samples, and the first ps sampler had visibly missed execs.
    — evidence (link drop, `ssh -S <ctl> -O exit` at 14:49:50, then an edit of vision.md over the agent's own ssh in the same second): the link reconnected by 14:49:51 and the edit rendered at 14:49:55. The panel never showed `os error` / `ssh:`. The only ssh calls without `-S` were the agent's own edit commands and the link's reconnect pre-connect (`ssh -o BatchMode … -- <mini> set -e …`, the WP3 connect path), never a poll or read.
    — evidence (close): × on the remote tile → workspace closed, remote tmux server gone, 0 poll execs in the next 20 s. ⚠️ That zero is confounded: the link also went Down when its last workspace closed, and a still-subscribed worker would show 0 too. Discriminator used instead: `sample <pid>` thread names show `claudesk-remote-poll` while open (1), and **0** 5 s after the close. Link-down never ends a worker; only the last unsubscribe does, so `remote_poll_stop` ended it.
    — evidence: integration boundary = `useWorkspaceStatus` (start/stop) and the Docs panel (the consuming surface of `fs-change`), both driven above.
    - [x] align: the 5 s poll in action — evidence: content edit visible ≤9 s, new WIP item listed in 2 s, removal in 5 s (timings above). The scratch remote workspace is open in the dev app on Vision; screenshot `/private/tmp/claude-501/-Users-stayman-Personal-projects-claudesk/5cc1d8f8-1932-474a-9d1b-f6970f36e1d9/scratchpad/p3-remote-docs-live.jpg`
    - [x] align: spec default #1 (poll whenever a remote workspace on the host is open with the gate ON, not only while Docs is visible) — evidence: polls run while the workspace is open, whichever tab is in front, stop at gate OFF and stop when the last workspace closes (above)
    — evidence (RE-RUN after the P3.verify-human.2 back-loop; runner): `remote_fs::poller` 16/16 and `remoteDocsCatchUp.test.tsx` 4/4. Each new property was mutation-proven ALONE, restored by `cp` + shasum match: (a) `active_subs` returns all subs → 3 failed; (b) `catch_up` does not wake → 3 failed at the 5 s bounded wait, no hang; (c) `pause` no-op → `pausing_every_workspace…` failed; (d) `write_back` never answers → 8 failed; (e) `Changed` reported as `Unchanged` → 1 failed; (f) announce the first catch-up → 2 failed; (g) no pause call when hidden → 1 failed; (h) the error arm does not count as answered → 1 failed; (i) local treated as remote → 1 failed. `sync_commands_do_not_block` 16/16. ⚠️ Not covered by any test (stated by the runner): `Workspace.tsx`'s `autoDismissMs` effect (read-checked: it re-runs per toast object and its cleanup cancels the old timer). Codify target. The runner's note (a stale "both commands are SYNC" module doc in `poller/commands.rs`) was fixed before the live run.
    — evidence (RE-RUN, orchestrator, dev app via bridge, fresh launch; scratch remote row, gate ON; state-changing on the mini scratch folder only; a page-level MutationObserver recorded every toast text with its time):
      - first show after opening (Docs fronted at open) → NO toast;
      - Docs fronted: 2 poll execs in 11 s (control). Prompt fronted: **0** in 20 s;
      - Prompt fronted, edit vision.md (Vision selected), front Docs at 15:30:41 → toast "Checking the remote docs for changes…" → "Remote docs checked: 1 doc changed." (15:30:42) → cleared 15:30:46; the edit rendered at 15:30:42 with NO click;
      - a return with no change → "… checking…" → "Remote docs checked: no changes." → cleared 4 s later;
      - a LOCAL workspace (scratch-c) at centre stage with the remote's Docs still fronted → **0** poll execs in 20 s (screenshot confirmed scratch-c in front);
      - switching back to the remote workspace (filmstrip pointer-down/up; the tile's `click` and a synthetic ⌘⇧1 did not switch, the known bridge limits) → "checking…" → "no changes" → cleared in 4 s. ⚠️ One earlier switch cleared in 7 s instead of 4 s; not reproduced on the rerun (4 s). Unexplained; timer clamping in the unfocused window is the guess (`document.hasFocus()` = false);
      - link drop with Prompt fronted: a page listener on `remote-link` fronted Docs the instant the link reported `lost` (15:33:46) → "Couldn't check the remote docs: the remote host isn't reachable right now." as an ERROR toast, still showing 14 s later (stays until dismissed). The link was `up` again at 15:33:47.
  - [x] verify-human — operator approved both leaves (2026-11-17)
    - [x] P3.verify-human.1: the 5 s poll in action: edit a doc on the remote and watch the panel. Is that freshness enough? — operator: "good" (2026-11-17)
      — at the operator's request the agent appended "## Live edit for the operator" to the remote vision.md at 15:09:00; the open doc showed it by 15:09:06
    - [x] P3.verify-human.2: (spec Assumed #1) the poller runs whenever a remote workspace on the host is open with the gate ON, not only while Docs is visible. Still what you want? — FAILED first; after the fix (active-only polling + the announced catch-up) operator: "all good" (2026-11-17)
      — operator (2026-11-17): "no need to poll unless the workspace and the particular Docs tab is active". Spec Assumed #1 reversed: poll a workspace only while it is centre stage AND its Docs tab is the active right-panel tab (and the gate is ON, the link Up).
      — operator, same reply round: on a return (switching back to the workspace, or reopening its Docs tab) show a small toast that the immediate catch-up poll started, then its result, success or failure. Only the first update after the switch is announced. Captured as design prior `background-work-only-for-what-is-on-screen` (approved as proposed).
      — fix (build, F12 back-loop), as built:
        - Backend (`remote_fs/poller.rs`): `Sub.active`. `subscribe` = PAUSED (no exec). `catch_up(id, target) -> Receiver<CatchUp>` activates (subscribing first if `remote_poll_start` has not landed, keeping an existing snapshot), registers a waiter and WAKES the worker. `pause(id)` leaves the snapshot. A tick copies out only ACTIVE subs, so a host with none runs no exec. `poll_tick` now returns one `CatchUp` per sub (`baseline` / `unchanged` / `changed{paths}` / `gate_off` / `link_down` / `failed{reason}`); `write_back` answers the waiters of the subs the tick included (a waiter registered mid-tick for a sub the tick left out waits for the next tick, its wake already queued).
        - Commands: `remote_poll_catch_up` (async: waits on the blocking pool, bounded by `CATCH_UP_TIMEOUT` = 2 × the list timeout + 2 s; listed in `ASYNC_COMMANDS`) and `remote_poll_pause` (sync, registry only). `remote_poll_start` now subscribes paused.
        - Frontend: `docs/remoteDocsCatchUp.ts`. `useRemoteDocsPolling` (called by `DocsPanel` with `onScreen = visible && panelFront`) runs catch-up when on screen and pause when not; no-op for a local workspace. Announce rule: only after a previous catch-up ANSWERED (any answer, an error included), so the opening activation is silent, StrictMode's double effect included. `catchUpNotice` gives the words: "Checking the remote docs for changes…" then "Remote docs checked: no changes." / "… N docs changed." / "Remote docs checked." (a baseline on a return) as info toasts that clear after `CATCH_UP_TOAST_MS` = 4 s, or "Couldn't check the remote docs: …" as an error toast that stays until dismissed. `gate_off` shows nothing (no Docs tab). The toast is the workspace's existing toast (`RightPanelHost.onDocsNotice` → `Workspace.showDocsNotice`), which gained an optional `autoDismissMs`.
        - Tests: poller 16 (new: paused until catch-up and no exec meanwhile; catch-up answered NOW and delivering what changed while paused; link-down / gate-off answers; only active workspaces in the one exec; pausing every workspace stops execs and keeps the worker; an unsubscribe ends a waiting catch-up). `remoteDocsCatchUp.test.tsx` 4 (the words; silent first show → pause → announced return; error-at-open still counts and a failed return announces; local = no invokes).
        - Assumed (no operator input needed, flag if wrong): the very first activation after opening is silent (nothing to catch up on; the panel lists fresh). A success toast clears itself after 4 s, while a failure stays until dismissed (prior `a-silent-non-action-must-not-read-as-done`).
  - [x] verify-codify
    Test scope: full — suite not long (runtimes.md `pnpm verify:auto` Last 64s)
    — evidence (consuming surface, the REAL `RightPanelHost` + `DocsPanel`, `remoteRightPanelLive.test.tsx`, new describe "a remote workspace's Docs polling follows what is on screen"): the opening show → `remote_poll_catch_up` and NO notice; Prompt → `remote_poll_pause`; Docs again → catch-up + notices ["Checking…", "Remote docs checked: no changes." with `autoDismissMs`]; a workspace not at centre stage → only `remote_poll_pause`; a LOCAL workspace → no `remote_poll_*` at all. Mutants: `onScreen: visible` (the fronted-tab half dropped) in `DocsPanel` → 1 failed; `onNotice={onDocsNotice}` dropped in `RightPanelHost` → 1 failed. Both restored, shasum match.
    — evidence (the toast on a LIVE `Workspace` mount, `injectFailureToast.test.tsx`, new describe "the remote Docs catch-up toast", fake timers): success = info, visible at `CATCH_UP_TOAST_MS - 1`, gone at `CATCH_UP_TOAST_MS`; a failure replacing a self-clearing success stays past 3 × the timeout (error kind); `null` clears. Mutants: auto-dismiss effect removed → 1 failed; only its `clearTimeout` cleanup removed → 1 failed. Restored, shasum match. (`liveWorkspace.tsx`'s RightPanelHost stub gained the `onDocsNotice` prop.)
    — evidence: already covered, not duplicated: the poller registry and tick semantics (16 tests, mutation-proven at verify-self), the hook's announce rule (`remoteDocsCatchUp.test.tsx`), the real listing script (`the_real_listing_script_drives_the_diff`).
    — evidence: `pnpm verify:auto` → EXIT=0 in 71s (vitest 318 files / 4035 tests; cargo 1410 passed, 0 failed). The dev app (pid unchanged) was not restarted by it.

- [x] Phase 4: Recycle on a remote workspace, and the injection confirmations (7.4, 7.5)
  **Observable outcomes:**
  - CLI: `vitest recycleSession` passes:
    - On a remote key, a `Stop` that arrives before any poll-delivered write, with `docs_stat` returning a fresh mtime, yields **success** (not `failed`).
    - With `docs_stat` returning the baseline mtime, the same `Stop` yields `failed`, as today.
    - On a local key the `Stop` is fed without a `docs_stat` call (call-count assertion).
  - CLI: Recycle's baseline read invokes `docs_stat` for both kinds (unit). The local result equals `stat_file`'s on the same file (a temp-dir Rust test of the local branch).
  - Browser + CLI (state-changing: the scratch remote workspace's CC session and its `.session.md` / WIP on the mini scratch folder; the dev app, gate ON): click Recycle on the scratch remote workspace. Then:
    - `.session.md` gains a fresh mtime on the mini (ssh `stat`);
    - the old tmux session `cd-*` is gone and a new one exists (`tmux -L claudesk-dev ls`);
    - the new session's command line has no `--continue`;
    - the pane receives `/session-restore` (the hook channel shows a `UserPromptSubmit` for the new session);
    - the button returns to idle with no failure toast, in well under 180 s.
  - Browser (scratch remote workspace): skill buttons, Session-Start, and the Prompt panel's `⌘↵` with a two-line prompt each land as ONE command / prompt (one `UserPromptSubmit` hook event each). Each is checked both at the bottom and after scrolling the pane up into copy-mode (`tmux -L claudesk-dev display -p '#{pane_in_mode}'` = 1 before the click).
  - CLI: a local workspace's Recycle unit/DOM tests pass unedited.
  **Alignment questions:**
  - Recycle on a remote workspace, end to end (the happy path): click it on the scratch remote and watch the handoff, the restart and the restore. Does it behave the way local Recycle does?
  - [x] P4.1 `recycleSession.readSessionMdMtime` → `docs_stat`.
    — as built: both kinds call `docs_stat` (the backend routes; local = `stat_file_core`, the same answer `stat_file` gave). `workspaceSurfacesGuard`'s `SITES` exemption for `recycleSession.ts` ("its stat_file read … owned by WP7.4") is removed: the file no longer reaches an OUT command, and the guard's no-stale-entries check required the removal. ⚠️ Deviation from the outcome "a local workspace's Recycle unit/DOM tests pass unedited": `recycleSession.test.ts` mocks the command BY NAME, so its 13 `"stat_file"` mocks were renamed `"docs_stat"` (the only edit; every assertion unchanged, 44/44 of the pre-existing tests pass).
  - [x] P4.2 Re-stat on `Stop` when `!workspaceSurfaces(projectPath).fsWatch`, ordered (write first, then `Stop`), with the `settled` / abort checks kept.
    — as built: `awaitCompletion` computes `remote` once; the status listener feeds a LOCAL `Stop` directly (unchanged); a REMOTE `Stop` awaits one `readSessionMdMtime`, re-checks `settled`, feeds `session-md-write` (path `SESSION_MD_REL`) when the stat answered, then the `Stop`. 3 new tests in `recycleSession.test.ts`: remote fresh re-stat → `{ok:true}` with no fs-change at all (2 `docs_stat` calls, the second `{root, path: SESSION_MD_REL}`); remote re-stat = baseline → not ok, no relaunch; local → the `Stop` alone, exactly 1 `docs_stat` (the baseline).
  - [x] P4.3 7.5 confirmation pass on the mini. Any defect found is fixed here (expected: none).
    — verification-only: run inside this phase's verify-self live pass (its outcome 5); a defect found there back-loops F9b to build.
  - [x] verify-auto
    — evidence: `pnpm verify:auto` → EXIT=0 in 52s (vitest 318 files / 4038 tests; cargo 1410 passed, 0 failed; lint 0 errors (the pre-existing `XtermPane.tsx` warning), format, tsc, check:link, fmt, clippy clean)
    — evidence: `vitest run recycleSession recycleAbortOnUnmount workspaceSurfacesGuard` → 80 passed before the new tests; `recycleSession.test.ts` 47 passed with the 3 new remote/local `Stop` tests
  - [x] verify-self
    — evidence (runner, outcome 1 + 3): `recycleSession.test.ts` 47/47 and `recycleAbortOnUnmount` (53 total). Each mutated ALONE, restored by `cp`, shasum match: (a) remote branch removed → remote-success test failed; (b) write fed AFTER the `Stop` → failed; (c) `remote = true` → the local call-count test failed; (d) `"stat_file"` again → 15 failed. Note: the remote "baseline still fails" test also passes under (a), as an "as today" regression check should; the success test is the discriminating one.
    — evidence (runner, outcome 2): the unit half PASSES (remote: 2 `docs_stat` calls, the first the baseline; local: 1). ⚠️ The Rust half is MISSING (`FAILED-cosmetic`, codify target): no test asserts `serve(local, DocsCall::Stat)` equals `stat_file_core` (the routing test's local arm covers only List and Read).
    — evidence (orchestrator, environment finding): the mini's dev account has NO workflow skills (`~/.claude/skills` absent), so a real `/session-handoff` there is an unknown command. Logged as `SURFACE-2026-11-17-REMOTE-HOST-WITHOUT-WORKFLOW-SKILLS-MAKES-WORKFLOW-BUTTONS-DEAD`. For the live checks, project-local STUB skills were added inside the scratch folder only (`~/claudesk-scratch-remote/.claude/skills/{session-handoff,session-restore,session-start}`: handoff writes `.session.md`; restore/start just reply). The workspace was closed and reopened so its CC loaded them.
    — evidence (orchestrator, Recycle on the scratch remote, Docs fronted; page recorder on `workspace-status` + the workspace DOM): click 15:45:31 → `.session.md` mtime 15:45:33 on the mini (`stat`) → `Stop` (TURN_END) 15:45:34 → new tmux session created 15:45:35 (pane pid changed; its command `claude --permission-mode bypassPermissions`, NO `--continue`) → button back to idle 15:45:36, no toast → `/session-restore` landed in the new session (pane: "❯ /session-restore", "⏺ restored"; running → TURN_END 15:45:36–37). ~6 s, far under 180 s.
    — evidence (orchestrator, the same with PROMPT fronted, so the poller is paused and only the forced re-stat can see the write): click 15:47:03 → write 15:47:06 → `Stop` 15:47:06 → respawn 15:47:07 (pane pid 13224, no `--continue`) → idle 15:47:09, no toast → restore landed 15:47:11. `pgrep -f CLAUDESK-FS:begin` over the window: **0** poll execs.
    — evidence (orchestrator, 7.5 injection confirmations, each read from the remote pane with `tmux capture-pane`; copy-mode entered with `tmux copy-mode` + two scroll-ups, `#{pane_in_mode}` = 1 before each copy-mode click): skill button "restore" at the bottom → one "❯ /session-restore" + one reply; in copy-mode → one command + one reply, `pane_in_mode` 0 after. Session-Start ("start") at the bottom → one + one; in copy-mode → `starts=2 replies=2` total, `pane_in_mode` 0. Prompt panel, a two-line prompt sent by ⌘↵: at the bottom → ONE prompt (both lines) + one "⏺ ok"; in copy-mode → ONE prompt + "⏺ ok3", `pane_in_mode` 0; the Send button in copy-mode → ONE prompt + "⏺ ok2". No defect: P4.3 needs no code change.
    — evidence (instrument note, not a product defect): two ⌘↵ attempts appeared to do nothing. Both set the editor text and fired the chord in the SAME synchronous script; `send` reads the draft via `docRef`, which a React effect updates after the editor change, so it saw the previous (empty) draft. With the chord in a separate call it sends. A human never types and presses ⌘↵ in the same tick.
    - [x] align: Recycle on a remote workspace, end to end — evidence: the two runs above (handoff → write → restart with no `--continue` → restore, ~6 s, no toast). The scratch remote workspace is open in the dev app (Prompt fronted) with the stub skills loaded; its pane shows the "restored" replies.
  - [x] verify-human — operator approved (2026-11-17)
    - [x] P4.verify-human.1: Recycle on a remote workspace, end to end (happy path): does it behave the way local Recycle does? — operator: "all good" (2026-11-17)
    - [x] P4.verify-human.2: (decision, FAILED-cosmetic) no Rust test pins local `docs_stat` == `stat_file`: add it at codify (recommended) or accept the gap — operator: A (add it at codify)
  - [x] verify-codify
    Test scope: full — last phase
    — evidence (operator decision P4.verify-human.2 A): new `docs::commands::tests::local_docs_stat_is_stat_files_answer_with_no_exec` — a REAL project list with a local row; `serve(local, DocsCall::Stat(".session.md"))` returns the same `(size, mtime_ms)` as `stat_file_core` on the same file, a missing file is an error both ways (Recycle's "no baseline"), and the exec double saw ZERO calls. Mutant (the local Stat arm zeroes `mtime_ms`) → FAILED; restored, shasum match. (Written with the dev app STOPPED: the scratch remote and scratch-c workspaces were closed through the UI first, then the app stopped; no `ssh -M` and no `claudesk-dev` tmux server left.)
    — evidence: already covered, not duplicated: the remote/local `Stop` handling (`recycleSession.test.ts`, 3 tests, mutation-proven at verify-self), the routed `docs_stat` remote arm (`serve_routes_by_the_root_kind…`), the remote stat script (`the_stat_script_matches_the_local_marker`). Consuming surface: Recycle (`recycleSession`, driven through its real `awaitCompletion` with the IPC/event edges mocked), plus the two live remote Recycles at verify-self.
    — evidence: `pnpm verify:auto` → EXIT=0 in 70s (vitest 318 files / 4038 tests; cargo 1411 passed, 0 failed; clippy, fmt, lint 0 errors)

## Current Node
- **Path:** Feature > ship
- **Active scope:** ship (all four phases complete)
- **Blocked:** none
- **Unvisited:** ship
- **Open discoveries:** SURFACE-2026-11-17-REMOTE-HOST-WITHOUT-WORKFLOW-SKILLS-MAKES-WORKFLOW-BUTTONS-DEAD (backlog, product:arch)

## Discoveries
[SHORTCUT-2026-11-17] P2.verify-self (outcome 3, P2.1) — the remote-read command strings were only prefix/suffix-checked (stat not at all); extended P2.1's test with `the_command_strings_are_pinned_whole` (assert_eq, all three modes); re-verified by a fresh runner subagent with two mutants (both caught), 14/14 after restore.
[SURFACED-2026-11-17] P2.verify-self — process hazard hit by the agent, not a product defect: editing `src-tauri/` (that same test file) while `pnpm tauri:dev` ran with the scratch remote workspace open rebuilt + restarted the app with no teardown, orphaning its `ssh -M` (ppid 1) and leaving the scratch `cd-*` tmux session detached. Cleaned up the same minute (`-O exit` on the orphan, `kill-session` on the scratch session; nothing else on the server). Already memory `remote-verify-hygiene` #3; the agent knew it and still did it. Rule for the rest of WP7: stop the dev app BEFORE any `src-tauri/` edit, including test files.

[SURFACED-2026-11-17] feature-spec — design-priors.md exceeds size guard (356 lines), read by headings + the relevant priors only. Consider summarizing.

[SURFACED-2026-11-17] P4.verify-self — the remote host's account has no workflow skills, so Recycle and the skill buttons on a remote workspace inject commands CC does not know (backlog: SURFACE-2026-11-17-REMOTE-HOST-WITHOUT-WORKFLOW-SKILLS-MAKES-WORKFLOW-BUTTONS-DEAD). Verified with scratch-only stub skills; remove `~/claudesk-scratch-remote/.claude/` at the end of WP7 with the other scratch state.

---
stage: wbs
state: complete
updated: 2026-11-20  # WP1 shipped (411bff8); WP2 shipped (1a71d1b); WP2.5 shipped (e38cdc7); WP3 shipped (0c45070); WP4 shipped (d57aa15); WP5 shipped (9fd2c46); WP6 shipped (d89e24b)
cycle: milestone-18-remote-workflow-substrate
---

# WBS — Milestone 18: Remote workflow substrate

**Scope of this pass:** M18 only (`roadmap.md` → "### Milestone 18"). The design is
`arch/claude-substrate.md` → "Remote hosts (M18)" §R.1–R.9 (PLANNED, `b73e723`). No `research.md` this cycle:
no new library, and the open unknowns are on-host behaviours, which WP3 probes.

**Shape:**
- **First, two independent fixes.** WP1 is remote Recycle and WP2 is fresh-account hardening. A remote workspace is already in daily use
  (tank, since 2026-11-18), and both fixes help it with no dependency on the rest.
- **Then the substrate track:** probe → detect + funnel → Settings readout → Install → Update / Uninstall → acceptance.

## Rulings (SETTLED at the 2026-11-18 grill; do not re-litigate)

- **In-app install** over the host's master, with provenance on the host and a paired Uninstall. The operator called this a one-off, not a prior.
- **Drift readout + an Update button**, Managed installs only. Nothing updates without a click.
- **The grill's defaults** are in `roadmap.md` → M18. Three of them were revised at arch, each cheap to reverse:
  - Docs goes absent on a skill-less host, through the funnel.
  - Drift reads "behind GitHub", with no count.
  - Drift is checked in Settings only, not on open.

  They are listed in §R.1 and §R.4.

## Design-priors consult

- `[PRIOR: gate-substrate-dependent-feature-class-behind-default-off-opt-in]` **agrees** (rule 2): a host without the
  substrate is "inapplicable", so its workflow surfaces are **absent** (not greyed). Gate OFF stays byte-identical.
- `[PRIOR: a-silent-non-action-must-not-read-as-done]` **agrees**: absence on a gate-ON workspace gets one plain-words
  note pointing at Settings (WP4), and is never silent.
- `[PRIOR: paired-actions-need-paired-affordances]` **agrees**: Install ships with Uninstall (WP6 → WP7). The milestone does not
  close with Install alone.
- `[PRIOR: background-work-only-for-what-is-on-screen]` **agrees**: the drift `ls-remote` runs only while Settings →
  Remote hosts is showing (WP5).
- `[PRIOR: a-session-behaves-the-same-wherever-it-runs]` **agrees**: remote Recycle must respawn as local does (WP1),
  and the bypass-dialog withhold applies to both kinds (WP2).

## Work Packages

### WP1: Remote Recycle respawns CC (reproduce-first) ✅ SHIPPED 2026-11-18 (commit 411bff8)
**Description:** Fix `SURFACE-2026-11-17-REMOTE-RECYCLE-NEVER-RESPAWNS-CC`. Today a remote Recycle hands off and `/exit`s, but never
respawns. Run it as a bug fix: reproduce on the dev build against the scratch remote row, find the cause, then fix it inside the
§R.7 constraints. The respawn is a **new** session through the open's spawn path (never a reattach), and Recycle's `/exit` must not
be classified as the operator's close.
**Milestone:** M18
**Dependencies:** none
**Size:** S–M (the cause is unknown; the timebox for diagnosis is half a day, after which the WP escalates rather than guesses)
**Tasks:**
- [x] 1.1 Reproduce on the dev build with the scratch remote row (real workflow skills via a scratch HOME, or stub skills as at M17 WP7). Capture the status-channel log, the tmux state and the session registry across `/exit`.
- [x] 1.2 Locate the cause. Leading suspects: the `/exit` is classified as an explicit close (Ended latched, end-intent written), or `wait_not_closing` never clears.
- [x] 1.3 Fix it, and add a test at the remote seam (`RemotePorts` / `RemoteTerminal`) that fails on the pre-fix behaviour (a HEAD positive control).
- [x] 1.4 Live check: Recycle a remote scratch workspace → a new tmux session → `/session-restore` lands → `.session.md` consumed.
- [x] 1.5 Update `arch/remote-workspaces.md` §E: the Recycle row's KNOWN FAILURE becomes as-built.

**WP1 → WP2 rationale:** both are independent of the substrate track. WP1 goes first because it is the live gap a remote workspace in daily use is
told to avoid ("don't Recycle a remote session").

### WP2: Fresh-account hardening: the bypass-dialog withhold and the `claude` PATH fallback ✅ SHIPPED 2026-11-18 (commit 1a71d1b)
**Description:** §R.6, two items.
- **The bypass-dialog withhold.** Extend the fire-time read so auto-resume's inject is **withheld** under
  `--dangerously-skip-permissions` unless the account's (or profile's) `settings.json` has
  `skipDangerousModePermissionPrompt: true`. This applies to local and remote alike, and says so in the same withheld
  diagnostic as the trust case (`SURFACE-2026-11-17-AUTO-RESUME-INJECT-ANSWERS-BYPASS-PERMISSIONS-DIALOG-NO-EXIT`, **high**).
- **The PATH fallback.** `cc-launch` and the add-remote preflight fall back to `$HOME/.local/bin/claude`, as constant fragments, with a plain-words
  `.zprofile` message (`SURFACE-2026-11-17-REMOTE-CLAUDE-ONLY-ON-INTERACTIVE-PATH`).
**Milestone:** M18
**Dependencies:** none
**Size:** M
**Tasks:**
- [x] 2.1 Live-capture CC's current behaviour: the dialog's default, and the settings key written on accept (re-verify against today's CC, per `cc-hook-capture-beats-docs`).
- [x] 2.2 Local: the fire-time read adds the bypass term (default and profile config dirs). Wire it through `shouldInject`'s existing cancellation read.
- [x] 2.3 Remote: add a constant perl fragment to the open-check exec beside `TRUSTED_KEYS`, plus the decision term.
- [x] 2.4 Withheld diagnostic copy: one line naming the cause and the fix ("accept the warning once in the pane, then run `/session-restore`").
- [x] 2.5 The PATH fallback in `cc-launch` + preflight, and its message.
- [x] 2.6 Tests: mutation-prove each new term on its own (the withhold must go red when the term is deleted). For the remote read, run it against a scratch HOME on the mini that lacks the key.
- [x] 2.7 Update `arch/session-resumption.md` and `arch/remote-workspaces.md` §H to as-built.

**WP2 → WP3 rationale:** the substrate track needs fresh host accounts to install into, and those accounts are exactly what WP2
hardens. Landing WP2 first means every install WP5–WP7 verifies opens onto a CC that can't quit on the bypass dialog.

### WP2.5: Remote panes copy to the Mac's clipboard (added 2026-11-18, operator, while dogfooding tank) ✅ SHIPPED 2026-11-18 (commit e38cdc7)
**Description:** In a remote pane, a drag-select does not reach this Mac's clipboard. Today tmux's `set -g mouse on` (the deployed
`tmux.conf`, config C, ratified at M17 WP1 for wheel scrollback) turns the drag into a tmux copy-mode selection. On mouse-up the
default `MouseDragEnd1Pane` → `copy-pipe-and-cancel` puts the text in tmux's buffer **on the mini** and clears the highlight. The
xterm.js selection never sees the drag. Verified 2026-11-18 on tank's pane: `alternate_on=0 mouse_any_flag=0` (CC is inline and is not
the cause), `mouse=1`. Local panes are unaffected (no tmux).
**Requirement (operator):** select text inside a remote session and copy it to THIS Mac's clipboard. ⚠️ Keep `mouse on`: with
`mouse off` the wheel stops scrolling remote history (the M17 WP1 probe ruled that config out).
**Milestone:** M18
**Dependencies:** none (remote-only, independent of the substrate track)
**Size:** S
**Tasks:**
- [x] 2.5.1 Probe on the scratch remote row (CC 2.1.327, tmux 3.x): does `set -g set-clipboard on` plus a `terminal-features` `clipboard` entry for
  the pane's outer `TERM` make tmux emit OSC 52 to the client on a copy? Capture the raw bytes Claudesk's PTY receives.
- [x] 2.5.2 `tmux.conf` (constant, redeployed on every connect): `set-clipboard on`, the clipboard feature, and drag-end rebound to
  `copy-pipe-no-clear` so the highlight stays.
- [x] 2.5.3 Frontend: an xterm.js OSC 52 handler (`term.parser.registerOscHandler(52, …)`) that writes the decoded text to the
  macOS clipboard. ⚠️ Write only, never answer an OSC 52 READ query: a remote program must not be able to read this Mac's clipboard.
- [x] 2.5.4 Optional escape hatch: `macOptionClickForcesSelection`, so Option+drag gives a native xterm selection, as on a local pane.
- [x] 2.5.5 Live check on the scratch remote row: drag-select → `pbpaste` on this Mac holds the text, the highlight stays, and the wheel
  still scrolls history. Plus an injected command while scrolled up still lands (cancel-before-inject unchanged).
- [x] 2.5.6 Update `arch/remote-workspaces.md` §I (the scrollback/copy-mode section) to as-built.

**As built (probe deltas, `archive/m18-wp2-5-remote-copy-to-mac-clipboard.md`):** tmux already emitted OSC 52 on a copy (`52;;<b64>`), so the root fix was the missing xterm.js handler. 2.5.2 shipped as `set-clipboard on` + a fixed-index RGB line + a live re-source under the login shell. There is no clipboard-feature line (tmux's default) and no drag-end rebind (operator 1A: `copy-pipe-no-clear` swallowed the next typed keys). 2.5.3 writes through Rust `clipboard_write` → `pbcopy` (WKWebView refuses `navigator.clipboard` without activation), on every pane (operator vh2 A).

**WP2.5 → WP3 rationale:** tank is in daily remote use, so this pays off now. It touches only the deployed tmux.conf and the
terminal pane, nothing the substrate track builds on.

### WP3: Probe — remote substrate behaviour on the mini ✅ SHIPPED 2026-11-20 (commit 0c45070)
**Type:** probe
**Milestone:** M18 (before WP4–WP7)
**Dependencies:** none (can run alongside WP1/WP2)
**Size:** S
**Learning objective:** answer the four §R.9 unknowns that decide how WP4–WP7 are built:
- (1) Does killing the local `ssh` of a streaming exec over the master stop the remote `git clone` / `install.sh`?
- (2) Is a second `install.sh` run on an installed account clean (no duplicate `CLAUDE.md` block, no prompt)?
- (3) Does `HOME=<root>` contain every write that `install.sh` / `uninstall.sh` make?
- (4) What do `SUBSTRATE_PROBE` and the host record read add to the open check's exec latency?

Plus: what does `git` do over ssh on a Mac with no Command Line Tools?
**Timebox:** half a day
**Success criterion:** a "Probe outcomes" section below, with one measured answer per question and the design consequence of each.
Unknown (1) decides whether cancel needs a remote pid file. Unknown (2) decides whether Update can be offered as designed, or has to become
Uninstall + Install.
**Tasks:**
- [x] 3.1 Sandbox root on the mini under the dev account (a scratch dir; never the live `~/.claude`). Run a full clone + `install.sh` with `HOME=<root>`. Diff the file list against the root (canonicalized), and confirm nothing landed under the real `$HOME`.
- [x] 3.2 Re-run `install.sh` in the same sandbox and diff (idempotency).
- [x] 3.3 Start a streaming exec over a dev master, kill the local ssh group mid-clone, then check the host process table.
- [x] 3.4 Draft `SUBSTRATE_PROBE`. Time the open-check exec with and without it (≥10 runs). Run it against the live account read-only, and against the sandbox root.
- [x] 3.5 Record the `git` / CLT behaviour on a host without the Command Line Tools (or cite Apple's stub behaviour if no such host exists).
- [x] 3.6 Clean up the sandbox. Confirm the live install's `git status` and `~/.claude` are unchanged (a shasum list taken before and after).

**WP3 → WP4 rationale:** detection is built on the probe's measured exec cost and the shell probe's behaviour on the real host. Building
the funnel first and finding the probe too slow for every open would put the change in the wrong place.

### WP4: Detection and the funnel's third input (+ the absent-host note) ✅ SHIPPED 2026-11-20 (commits 9ce4810, 15d0e7b, d57aa15)
**Description:** §R.1 + §R.2.
- **Detection:** `SUBSTRATE_PROBE` in the open-check exec, with its **parity guard** against `skills_dir_exists`. `OpenFacts.substrate`
  and the host-record read through the local `provenance` parser.
- **The cache:** a per-host `HostSubstrate` in `LinkRegistry`, the `remote-substrate` event, and `useHostSubstrate`.
- **The funnel:** `workflow_applicable(gate, profile, host)` in Rust and TS, updating every consumer at once, with unknown failing closed.
- **The note:** the gated absent-host note in the skill-row slot. It is a new arm-5 subject, so the pin goes to **6 / 11**, and `workflow-gate.md` and `arch.md` update in the same change.
**Milestone:** M18
**Dependencies:** WP3
**Size:** L
**Tasks:**
- [x] 4.1 `SUBSTRATE_PROBE` constant + the parity test (`substrate_probe_agrees_with_skills_dir_exists`, run under a temp HOME, every fixture shape).
- [x] 4.2 `OpenFacts.substrate` + the host-record parse. Gate OFF → not probed (a test pins that the gate-OFF open-check command carries no probe).
- [x] 4.3 `HostSubstrate` cache + `remote-substrate` broadcast. `useHostSubstrate` (seed + listen; local keys return `Local` with no IPC).
- [x] 4.4 The funnel's third input, Rust + TS. Migrate every consumer. Extend `workflowApplicableGuard` so a consumer that drops the host input fails.
- [x] 4.5 The absent-host note + its OFF-invariant subject. Move the pin to 6 / 11, and mutation-prove the new subject on its own.
- [x] 4.6 Live: the gate ON, a scratch remote row whose HOME override lacks the substrate → skill row, Session-Start, Recycle and Docs absent, the note present; the auto `/session-restore` not fired. The live account → all present.
- [x] 4.7 Fix the stale counts: grep for "10 subjects" and "6 arms / 10" repo-wide (`CLAUDE.md`, `arch.md`, `workflow-gate.md`, lessons) and correct every one.

**WP4 → WP5 rationale:** the Settings readout shows the cached `HostSubstrate`. It needs the cache and the record parse before it has
anything to show.

### WP5: Settings → "Remote hosts" (read-only readout + drift) ✅ SHIPPED 2026-11-20 (commits 8033134, 6bd9148, 9fd2c46)
**Description:** §R.4 + §R.5. A new Settings group, shown when at least one remote row exists, with one entry per distinct host.
Each entry shows the state (Absent / Managed / Developer), the short HEAD, and drift (`ls-remote` from the host, run when the group is shown;
"up to date / behind GitHub / can't check: <reason>"). A host whose link is down says so. Settings never brings a link up. No buttons yet.
**Milestone:** M18
**Dependencies:** WP4
**Size:** M
**Tasks:**
- [x] 5.1 Backend: an async `remote_substrate_refresh(host)` (HEAD + `ls-remote` in one exec; the URL comes from the record or a read-only `remote get-url origin`).
- [x] 5.2 The group (`useSettingControl` is not the right shape: it is a readout, not a setting). Lay it out with the other Settings groups and measure its geometry (lesson: a dialog 702px tall in a 599px panel).
- [x] 5.2b The WP4 absent-host note's button lands on this group, not just on Settings (added at WP4 plan, D8: the group did not exist yet).
- [x] 5.3 Refresh only while shown (the prior). A test that unmounting stops further refreshes.
- [x] 5.4 Live: the mini's live account reads **Developer**, `f8e8873`, and up to date (read-only). A sandbox root reads Absent.

**WP5 → WP6 rationale:** Install is a button on this group's Absent entry, and its result lands back in the readout, which must already work.

### WP6: Install over the master ✅ SHIPPED 2026-11-20 (commits 3e657bb, 96f388f, d89e24b)
**Description:** §R.3 install + the §R.6 Developer-tools preflight, in its **guarded** form from "Probe outcomes" (5) (`d=$(xcode-select -p) && [ -n "$d" ] && [ -x "$d/usr/bin/git" ]`; the bare `xcode-select -p` form passes on a no-tools host).
- **The run:** a streaming exec over the master under the shared single-run lock and `RunGuard`. Clone the public HTTPS URL into
  `<root>/.claudesk/vendor/my-claude-code-customization`, run `install.sh` with `HOME=<root>`, then write the record **last**.
- **The root:** injected, with the debug-only `CLAUDESK_REMOTE_SUBSTRATE_ROOT` sandbox override.
- **Output and cancel:** output goes to the existing wizard panel. Cancel follows WP3's answer (1) + the operator's ruling **A** ("Probe outcomes" (1)): local kill + one remote `kill -TERM -- -<pgid>` exec, with the pgid printed as the run's first stream line; Cancel is honoured only during the clone; Install first clears a stale vendor clone.
- **Never touches the local gate.**
**Milestone:** M18
**Dependencies:** WP3, WP5
**Size:** L
**Tasks:**
- [x] 6.1 The streaming-exec transport (`run_streaming` with the master ssh as the program), plus the link-not-Up refusal.
- [x] 6.2 Pure command builders (clone, install, record write), unit-tested for quoting. The record JSON is built by Rust and written by a constant `printf`.
- [x] 6.3 The install sequence, with the record written last. Each failure arm goes through the `terminal` reducer, adapted (no gate revert for remote).
- [x] 6.3b Cancel per ruling A ("Probe outcomes" (1)): the pgid stream sentinel + the remote group-kill exec; a phase sentinel before `install.sh` disables Cancel; `install.sh` + the record write run guarded on the HOST against stream death and an in-flight cancel (`SURFACE-2026-11-20-QUALITY-INSTALL-SH-WINDOW-UNGUARDED-AGAINST-STREAM-DEATH`); a stale vendor clone with no record is removed first. Test each arm.
- [x] 6.4 Sandbox containment test, the remote analogue of `sandbox.rs`: after a sandboxed install, every new host path lies under the root (canonicalized). Assert positively on the set `install.sh` writes; do **not** shasum the whole real `~/.claude` (a live workspace on the account writes there continuously, "Probe outcomes" (3)). The `-newer` sweep is an inverse check with an explicit exclusion list.
- [x] 6.5 The Settings Install button, its output, and its result, which updates `HostSubstrate` and the workspace surfaces live.
- [x] 6.6 Live, dev build, sandbox root: Absent → Install → Managed; a gate-ON workspace whose probe reads the sandbox shows its workflow surfaces without a reopen.

**WP6 → WP7 rationale:** Update and Uninstall act only on a **Managed** install, and only WP6 can create one.

### WP7: Update and Uninstall (the remote refuse-guard)
**Description:** §R.3.
- **Update:** `pull --ff-only` → `install.sh` → record `updated_at`, Managed and behind only. Its shape depends on WP3's answer (2).
- **Uninstall:** through `RemoteUninstallTarget`, whose only constructor is `remote_refuse_guard`, plus an `E0451` test. The preview is
  `uninstall.sh --dry-run`. The order is script → `rm -rf` of the guard-produced path → record deleted last. The `source_guard` allowlist gains its
  module entry. The local gate is untouched.
**Milestone:** M18
**Dependencies:** WP6
**Size:** M–L
**Tasks:**
- [ ] 7.0 FIRST, the two WP6-review MAJORs this WP builds on (added at WP6 finalize): a Cancel whose remote kill fails or lands after the clone can report "Nothing was installed" while the host becomes Managed (`SURFACE-2026-11-20-QUALITY-REMOTE-CANCEL-CAN-REPORT-NOTHING-INSTALLED-WRONGLY`: when the pgid is known, let the stream end by itself); the delete guard misses other `rm` spellings and `*)` lines inside script templates (`SURFACE-2026-11-20-QUALITY-DELETE-GUARD-MISSES-SHELL-SPELLINGS-AND-STAR-LINES`), and 7.2 adds the second remote delete.
- [ ] 7.1 The remote refuse-guard + its pure path checks (`$HOME`, `~/.claude`, ancestors, not-a-dir, no `uninstall.sh`), fed only by the record + a host `pwd -P`. Every refusal arm mutation-proven on its own.
- [ ] 7.2 The `E0451` compile-fail test for `RemoteUninstallTarget`. A test asserts the `rm -rf` builder takes only that type.
- [ ] 7.3 Uninstall: dry-run preview → confirm → run. A failure never clears the record (a test).
- [ ] 7.4 Update: the ff-only pull + re-install + record update. A dirty or non-ff clone stops before `install.sh` with a plain message.
- [ ] 7.5 Live, sandbox root: Managed → Update (after a sandbox-only commit makes it behind) → Uninstall → Absent. The live account's buttons are absent (Developer).

**WP7 → WP8 rationale:** acceptance needs the whole paired set (prior `paired-actions-need-paired-affordances`).

### WP8: Release + installed-build acceptance
**Description:** `/release`, then accept on the installed build against the mini.
- **Read paths on the live account:** detection, Developer state, drift, and the absent-host behaviour on a skill-less scratch row.
- **WP1 / WP2 fixes:** remote Recycle on the scratch row, and the withhold.
- ⚠️ **Install / Update / Uninstall on an installed (prod) build need a host account that doesn't serve a real workspace.** The sandbox override is
  debug-only. The live account is off-limits (§R.8), and the admin account is root-ops only. **Open, for the operator at WP8:**
  - create a disposable account on the mini for this check, or
  - accept those three on the dev-build basis (the M17 WP8 precedent of waived rows).
**Milestone:** M18
**Dependencies:** WP1, WP2, WP7
**Size:** M + a release
**Tasks:**
- [ ] 8.1 `/release` (the Command Line Tools update this Mac needs for `brew audit` comes first; see the M17 handoff note).
- [ ] 8.2 The operator's call on the disposable-account question, then the acceptance rows.
- [ ] 8.3 Record acceptance (redacting identifiers before commit; the repo is public).

## Dependency map

```
WP1 (Recycle) ───────────────┐
WP2 (fresh-account) ─────────┤
WP2.5 (remote copy) ─────────┤
WP3 (probe) → WP4 → WP5 → WP6 → WP7 ─┴→ WP8 (release + acceptance)
```

- **Critical path:** WP3 → WP4 → WP5 → WP6 → WP7 → WP8.
- **Parallel track:** WP1, WP2 and WP2.5 (added 2026-11-18) run in parallel with WP3, or ahead of it. Order chosen by the operator: WP2 → WP2.5 → WP3. A release can be cut after WP1 + WP2 alone if the tank
  workspace needs remote Recycle sooner. That is the operator's call. Nothing in WP3–WP7 depends on it.

## Exit criteria (M18)

- On a host account **without** the workflow system, gate ON: the workflow surfaces are absent and the note points to Settings.
  Gate OFF: byte-identical, with the OFF-invariant pin at 6 / 11.
- From Settings → Remote hosts, Install makes a host Managed, Update brings a behind Managed install current, and Uninstall returns it to
  Absent. The live account (Developer) gets no destructive affordance.
- Remote Recycle respawns and restores, and auto-resume never answers the bypass dialog.
- Accepted on an installed build (with whatever the operator rules for the destructive rows at WP8).

## Probe outcomes

Measured 2026-11-20 on `<user>@<mini-host>` (macOS 26.6, git 2.50.1 Apple), in a sandbox root `~/claudesk-m18-sandbox` over the
probe's own ControlMaster, never a Claudesk master. The live account was only read: its baseline (54 links, `CLAUDE.md` /
`settings.json` shasums, the live clone's HEAD + status) was byte-identical before, during and after. The sandbox is removed. Raw
evidence: `workflow-system/state/archive/m18-wp3-remote-substrate-probe.md` → "Evidence" (once archived).

**(1) Cancel over the master. A local SIGKILL does NOT stop the remote side; a remote process-group kill does.**
- **Measured:** the local `ssh` was SIGKILLed as a group (= `subprocess::kill_group`). The remote `zsh -lc` (a session leader,
  pgid = its pid) **runs on until its next stdout write**, which kills it with SIGPIPE. A `git clone` in flight (with `--progress` or
  `--quiet`) **completed** (`clone_exit=0`). Only the following `echo` died.
- **Measured:** one extra exec, `kill -TERM -- -<pgid>`, left no process in the group at +1 s, and git's own signal handler removed the
  partial clone dir. That exec round trip is 0.13 s.
- **→ WP6:** cancel = SIGKILL the local stream **and** one remote `kill -TERM -- -<pgid>` exec. §R.9.1's contingency becomes the design.
  Simpler than a pid file: the run script's first line prints its pgid as a sentinel (`ps -o pgid= -p $$`), and Rust reads it from
  the stream it already consumes. Then no file is written in the record's dir.
- **→ WP6 (new):** a group kill that lands while `install.sh` runs stops it between two `ln -s`. That leaves workflow links and no record,
  which the §R.2 probe reads as **Developer** (no Uninstall offered). `install.sh` takes 0.45 s; the clone takes about 4 s. **Recommended:**
  cancel is honoured only during the clone. Once `install.sh` starts, the Cancel button disables until the run ends.
  ✅ **Operator ruling (2026-11-20, WP3 verify-human): option A.** This cancel shape (local kill + one remote group-kill exec, pgid as a
  stream sentinel, cancel only during the clone, Install clears a stale vendor clone) is the WP6 design. Rejected: B (uncancellable once
  cloning) and C (cancel any time + `uninstall.sh` cleanup).
- **→ WP6 (new):** if the app dies mid-run (quit, crash), the remote clone **finishes**, and the script then dies at its first stdout
  write after it. That leaves a clone dir with no install and no record (Absent). The next Install's `git clone` then fails on the
  existing dir. Install must handle "clone dir present, no record". Recommended: the run script removes it first (the path is
  Claudesk's own fixed vendor path under the root, never user data).

**(2) `install.sh` re-run. CONTENT-idempotent, no prompt, no duplicate block → Update stays as designed.**
- **Measured:** a second run gives exit 0, no prompt (stdin `/dev/null`), all 55 `[ok]`, every link unchanged, one workflow block, and
  `CLAUDE.md` with the same sha.
- **Not metadata-idempotent:** `CLAUDE.md` is replaced each run (new inode + mtime, mode 0644 → 0600 from `mktemp`), and an existing
  `CLAUDE.md.bak` is **deleted**. The cause is `install.sh` §"Inject workflow snippet" (`cp` → `.bak`, `mv` tmp over it, `rm .bak`).
- **→ WP7:** Update = `pull --ff-only` → `install.sh` → record `updated_at`, unchanged; it does not need to become Uninstall + Install
  (✅ operator-confirmed 2026-11-20).
  The `.bak` loss is upstream (`SURFACE-2026-11-20-INSTALL-SH-RERUN-DELETES-AN-EXISTING-CLAUDE-MD-BAK`, low; send with the next mccc handoff).

**(3) `HOME=<root>` contains every write of `install.sh` and `uninstall.sh`. Yes.**
- **Measured:** a `find $HOME -xdev -newer <marker>` sweep (the root pruned) after install found 103 hits, and after uninstall 2. Every hit is
  another process's runtime state, and **none is a path `install.sh` / `uninstall.sh` writes** (`~/.claude/{skills,agents,hooks}`,
  `~/.claude/CLAUDE.md`, `settings.json`). Every sandbox link resolves into the sandbox clone.
  - Those two windows: the tank workspace's Unreal / Epic files, its repo, and its CC transcript.
  - A later verify-self sweep window: also `~/.claude.json` (CC), `~/.zen/` (a browser), `Library/Application Support/Google` and
    `Library/HTTPStorages`.
  - The install-window sweep files lived in the (now deleted) sandbox; their tallies are in the WIP's Evidence.
- `install.sh` uses `mktemp` in `$TMPDIR`, outside the root, but renames the file into it, so nothing is left outside.
- `uninstall.sh --dry-run` changes nothing, and the real run removes all 55.
- Residue after uninstall: an empty `CLAUDE.md`, `CLAUDE.md.bak`, and empty `skills/` + `agents/` dirs.
- **→ WP6.4:** judge containment on the set `install.sh` writes, plus a `-newer` sweep with an **explicit exclusion list** for CC/tank
  runtime paths (`~/.claude/projects`, `~/.claude.json`, the tank repo, `Library/Application Support/{Epic,Google}`, `Library/HTTPStorages`,
  browser profiles such as `~/.zen/`, Unreal logs). Better still: assert positively on the script-written set, and treat the sweep as an
  inverse check filtered to `~/.claude/` + dotfiles. Do **not** use a shasum of
  the whole real `~/.claude`: the tank workspace writes there continuously, and that would be a false finding.
- **→ WP6:** `install.sh` never writes `settings.json`. It only PRINTS four permissions (and `uninstall.sh` symmetrically only prints).
  Claudesk spawns remote CC with `bypassPermissions`, so nothing needs them. Show the printed lines in the output panel as the local
  wizard does, and edit no settings.

**(4) `SUBSTRATE_PROBE` cost: +16 ms median, inside the budget** (✅ operator-accepted 2026-11-20).
- **Measured:** the real `open_check_command` string, printed by a throwaway test (not retyped), was run over the master 15× without
  and 15× with the probe appended inside the same login-shell script, interleaved, all exit 0.
  - Without: median **0.117 s** (min 0.088, max 0.179).
  - With: median **0.133 s** (min 0.107, max 0.214).
  - Delta: **+16 ms median, +35 ms max**, on the live account's 48-skill tree.
- **Measured (agreement):** the draft below agrees with `workflow_substrate::skills_dir_exists` on all **12** local fixture shapes: none, no
  skills dir, skills is a file, empty, a user's real dir, a dangling link, a repo without an installer, an installer without the marker, the
  marker, a user dir + a marker link, a marker link under a dotfile name, and the skills dir itself a symlink. It also prints the right root.
  A mutated marker fails the comparison (it is mutation-proven: the Rust run failed; the shell-level rerun is saved, marker fixture `yes` → mutated `no`).
- **Measured (live reads):** live account → `yes`, root = the live clone's `pwd -P`, HEAD `f8e8873`, no record → **Developer**. Sandbox root →
  `yes` + the sandbox clone. Empty root → `no`. The record line round-trips (`{"x":1}\n` → `7b2278223a317d0a`).
- **→ WP4.1:** adopt the draft as `remote_cmd::SUBSTRATE_PROBE`. It is one `perl` process, already a dependency of `TRUSTED_KEYS`; a missing perl
  prints nothing → read as unknown → fail closed. The parity test takes these 12 fixtures. ⚠️ **One known divergence to settle there:** for an
  `install.sh` that is not valid UTF-8 but holds the marker, Rust's `read_to_string` fails (`false`) while perl reads bytes (`true`).
  Recommended: make the Rust side read bytes too, since the marker is ASCII.
- The record crosses as one hex line, so a multi-line JSON record survives the line protocol.

```sh
perl -MCwd=abs_path -MFile::Basename=dirname -e '
my $d = "$ENV{HOME}/.claude/skills"; my $root;
if (opendir(my $h, $d)) { for my $n (readdir $h) { next if $n eq "." || $n eq "..";
  my $e = "$d/$n"; next unless -l $e; my $t = abs_path($e); next unless defined $t && -e $t;
  my $r = dirname(dirname($t)); open(my $f, "<", "$r/install.sh") or next; local $/; my $b = <$f>;
  if (defined $b && index($b, "claude-workflow-system") >= 0) { $root = $r; last } } }
if (defined $root) { print "CLAUDESK-OPEN:substrate:yes\nCLAUDESK-OPEN:substrate-root:$root\n";
  if (open(my $g, "-|", "git", "-C", $root, "rev-parse", "HEAD")) { my $s = <$g>; print "CLAUDESK-OPEN:substrate-head:$s" if defined $s } }
else { print "CLAUDESK-OPEN:substrate:no\n" }
if (open(my $j, "<", "$ENV{HOME}/.claudesk/install-record.json")) { local $/; my $x = <$j>;
  print "CLAUDESK-OPEN:record-hex:", unpack("H*", defined $x ? $x : ""), "\n" }' 2>/dev/null
```

**(5) `git` without the Command Line Tools. The real case is not measurable here; `xcode-select -p` alone is too weak a preflight.**
- **Not measured:** the mini has both Xcode and the CLT, and no host without them exists. The real case (the `/usr/bin/git` shim with no developer
  dir, and `xcode-select -p` printing nothing + exiting 2, reproduced below only with a STUB) is **cited, not measured**: per Apple's stub behaviour it prints a "no developer tools were found, requesting install" note, exits
  non-zero, and asks for the GUI installer on the host's console.
- **Measured (simulation that pops nothing):** `DEVELOPER_DIR=/var/empty /usr/bin/git --version` over a non-tty ssh → exit 1,
  `xcrun: error: invalid DEVELOPER_DIR path …`.
- ⚠️ **Measured:** `DEVELOPER_DIR=/var/empty xcode-select -p` prints `/var/empty` and **exits 0**. It does not validate the path.
- **→ WP6 preflight:** `d=$(xcode-select -p 2>/dev/null) && [ -n "$d" ] && [ -x "$d/usr/bin/git" ]`. It checks that the real binary exists
  (Xcode's and the CLT's developer dirs both carry `usr/bin/git`) and never runs the shim, so it can never pop the installer. The refusal names
  `xcode-select --install` at the host's console (§R.6).
  - ⚠️ **The empty-path guard is load-bearing (caught at verify-self).** On a no-tools host `xcode-select -p` prints nothing and exits 2 (cited; stub-measured). The
    naive `test -x "$(xcode-select -p)/usr/bin/git"` then collapses to `test -x /usr/bin/git`, which IS the shim, and **passes**.
  - **Measured** with a stub `xcode-select` (empty stdout, exit 2): the naive form exits 0 (wrong), the guarded form exits 2 (refuses).
    Invalid `DEVELOPER_DIR` → 1. A real developer dir → 0, on this Mac and on the mini.
  - WP6 should unit-test the preflight's three arms with that stub.

**Other timings for WP6's UX:** a public HTTPS clone takes about 3.9 s, `install.sh` 0.45 s, and `uninstall.sh` well under 1 s.

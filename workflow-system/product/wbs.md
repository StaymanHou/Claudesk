---
stage: wbs
state: complete
updated: 2026-11-18  # WP1 shipped (411bff8); WP2 shipped (1a71d1b); WP2.5 added
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

### WP2.5: Remote panes copy to the Mac's clipboard (added 2026-11-18, operator, while dogfooding tank)
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
- [ ] 2.5.1 Probe on the scratch remote row (CC 2.1.327, tmux 3.x): does `set -g set-clipboard on` plus a `terminal-features` `clipboard` entry for
  the pane's outer `TERM` make tmux emit OSC 52 to the client on a copy? Capture the raw bytes Claudesk's PTY receives.
- [ ] 2.5.2 `tmux.conf` (constant, redeployed on every connect): `set-clipboard on`, the clipboard feature, and drag-end rebound to
  `copy-pipe-no-clear` so the highlight stays.
- [ ] 2.5.3 Frontend: an xterm.js OSC 52 handler (`term.parser.registerOscHandler(52, …)`) that writes the decoded text to the
  macOS clipboard. ⚠️ Write only, never answer an OSC 52 READ query: a remote program must not be able to read this Mac's clipboard.
- [ ] 2.5.4 Optional escape hatch: `macOptionClickForcesSelection`, so Option+drag gives a native xterm selection, as on a local pane.
- [ ] 2.5.5 Live check on the scratch remote row: drag-select → `pbpaste` on this Mac holds the text, the highlight stays, and the wheel
  still scrolls history. Plus an injected command while scrolled up still lands (cancel-before-inject unchanged).
- [ ] 2.5.6 Update `arch/remote-workspaces.md` §I (the scrollback/copy-mode section) to as-built.

**WP2.5 → WP3 rationale:** tank is in daily remote use, so this pays off now. It touches only the deployed tmux.conf and the
terminal pane, nothing the substrate track builds on.

### WP3: Probe — remote substrate behaviour on the mini
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
- [ ] 3.1 Sandbox root on the mini under the dev account (a scratch dir; never the live `~/.claude`). Run a full clone + `install.sh` with `HOME=<root>`. Diff the file list against the root (canonicalized), and confirm nothing landed under the real `$HOME`.
- [ ] 3.2 Re-run `install.sh` in the same sandbox and diff (idempotency).
- [ ] 3.3 Start a streaming exec over a dev master, kill the local ssh group mid-clone, then check the host process table.
- [ ] 3.4 Draft `SUBSTRATE_PROBE`. Time the open-check exec with and without it (≥10 runs). Run it against the live account read-only, and against the sandbox root.
- [ ] 3.5 Record the `git` / CLT behaviour on a host without the Command Line Tools (or cite Apple's stub behaviour if no such host exists).
- [ ] 3.6 Clean up the sandbox. Confirm the live install's `git status` and `~/.claude` are unchanged (a shasum list taken before and after).

**WP3 → WP4 rationale:** detection is built on the probe's measured exec cost and the shell probe's behaviour on the real host. Building
the funnel first and finding the probe too slow for every open would put the change in the wrong place.

### WP4: Detection and the funnel's third input (+ the absent-host note)
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
- [ ] 4.1 `SUBSTRATE_PROBE` constant + the parity test (`substrate_probe_agrees_with_skills_dir_exists`, run under a temp HOME, every fixture shape).
- [ ] 4.2 `OpenFacts.substrate` + the host-record parse. Gate OFF → not probed (a test pins that the gate-OFF open-check command carries no probe).
- [ ] 4.3 `HostSubstrate` cache + `remote-substrate` broadcast. `useHostSubstrate` (seed + listen; local keys return `Local` with no IPC).
- [ ] 4.4 The funnel's third input, Rust + TS. Migrate every consumer. Extend `workflowApplicableGuard` so a consumer that drops the host input fails.
- [ ] 4.5 The absent-host note + its OFF-invariant subject. Move the pin to 6 / 11, and mutation-prove the new subject on its own.
- [ ] 4.6 Live: the gate ON, a scratch remote row whose HOME override lacks the substrate → skill row, Session-Start, Recycle and Docs absent, the note present; the auto `/session-restore` not fired. The live account → all present.
- [ ] 4.7 Fix the stale counts: grep for "10 subjects" and "6 arms / 10" repo-wide (`CLAUDE.md`, `arch.md`, `workflow-gate.md`, lessons) and correct every one.

**WP4 → WP5 rationale:** the Settings readout shows the cached `HostSubstrate`. It needs the cache and the record parse before it has
anything to show.

### WP5: Settings → "Remote hosts" (read-only readout + drift)
**Description:** §R.4 + §R.5. A new Settings group, shown when at least one remote row exists, with one entry per distinct host.
Each entry shows the state (Absent / Managed / Developer), the short HEAD, and drift (`ls-remote` from the host, run when the group is shown;
"up to date / behind GitHub / can't check: <reason>"). A host whose link is down says so. Settings never brings a link up. No buttons yet.
**Milestone:** M18
**Dependencies:** WP4
**Size:** M
**Tasks:**
- [ ] 5.1 Backend: an async `remote_substrate_refresh(host)` (HEAD + `ls-remote` in one exec; the URL comes from the record or a read-only `remote get-url origin`).
- [ ] 5.2 The group (`useSettingControl` is not the right shape: it is a readout, not a setting). Lay it out with the other Settings groups and measure its geometry (lesson: a dialog 702px tall in a 599px panel).
- [ ] 5.3 Refresh only while shown (the prior). A test that unmounting stops further refreshes.
- [ ] 5.4 Live: the mini's live account reads **Developer**, `f8e8873`, and up to date (read-only). A sandbox root reads Absent.

**WP5 → WP6 rationale:** Install is a button on this group's Absent entry, and its result lands back in the readout, which must already work.

### WP6: Install over the master
**Description:** §R.3 install + the `xcode-select -p` preflight from §R.6.
- **The run:** a streaming exec over the master under the shared single-run lock and `RunGuard`. Clone the public HTTPS URL into
  `<root>/.claudesk/vendor/my-claude-code-customization`, run `install.sh` with `HOME=<root>`, then write the record **last**.
- **The root:** injected, with the debug-only `CLAUDESK_REMOTE_SUBSTRATE_ROOT` sandbox override.
- **Output and cancel:** output goes to the existing wizard panel; cancel follows WP3's answer (1).
- **Never touches the local gate.**
**Milestone:** M18
**Dependencies:** WP3, WP5
**Size:** L
**Tasks:**
- [ ] 6.1 The streaming-exec transport (`run_streaming` with the master ssh as the program), plus the link-not-Up refusal.
- [ ] 6.2 Pure command builders (clone, install, record write), unit-tested for quoting. The record JSON is built by Rust and written by a constant `printf`.
- [ ] 6.3 The install sequence, with the record written last. Each failure arm goes through the `terminal` reducer, adapted (no gate revert for remote).
- [ ] 6.4 Sandbox containment test, the remote analogue of `sandbox.rs`: after a sandboxed install, every new host path lies under the root (canonicalized), compared with a shasum list of the real `~/.claude` taken before and after.
- [ ] 6.5 The Settings Install button, its output, and its result, which updates `HostSubstrate` and the workspace surfaces live.
- [ ] 6.6 Live, dev build, sandbox root: Absent → Install → Managed; a gate-ON workspace whose probe reads the sandbox shows its workflow surfaces without a reopen.

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

*(WP3 writes here.)*

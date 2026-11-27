---
shape: temporary-wbs
cycle: backlog-paydown-2026-11-27
created: 2026-11-27
status: in-progress
parent-backlog: workflow-system/state/backlog.md (+ workflow-system/state/backlog-quality-findings.md)
---

# Backlog-Paydown Sweep — 2026-11-27 (post-M18, post-v0.10.0)

> ⚠️ **This is NOT a roadmap milestone.** It reserves no milestone number and is not a WP of any
> milestone. **This file is DELETED on completion**; see §"Fold back and delete". Do not resync it
> into `arch.md`.

**Run at:** the clean boundary after `picker-qol-focus-and-scroll` finalized (`c5e97bb`). M18 is
closed and released (`v0.10.0`). `wip/` is empty.

**Inventory:** 46 `backlog.md` entries: 31 SURFACEs + 15 code-quality pointer groups, which hold
**58 findings** in `backlog-quality-findings.md` (57 Claudesk-local, 1 upstream m12 body).
The pile is mostly M17/M18 review MINORs that were rolled forward at both cycle closes.
**Dispositions:** **57 local findings + 6 SURFACEs → Sweep** (10 WPs), **3 → Bury**, **2 →
Delete**, **2 unsent upstream items → sent in WP1** (then they stay Defer, upstream), and the rest
**Defer** (upstream, release/dogfood/watch-gated, trigger-gated, or feature-sized). **1 item was
ruled by the operator** (§Rulings).

**Mode:** 3 (Autopilot; it matches the workspace's drive mode). Unambiguous dispositions were applied
automatically. The defaults taken without asking are listed in §Defaults.

**ID key:** `SURFACE-2026-` is dropped from every ID below. **QF** means the body is in
`backlog-quality-findings.md`; **BL** means it is a `backlog.md` entry.

## ⚠️ Read before any WP that touches a test or a guard

The project's highest-frequency defect class is a **guard whose stated coverage exceeds its actual
coverage** (`docs/lessons/source-text-guards.md`). WP3 and WP4 are mostly guard work.

- **Mutation-prove each guard change INDIVIDUALLY.** Confirm the mutant landed in **executable**
  code (`sed -n '<line>p'`; use `perl -pi -e`, because BSD `sed` has no `\b`). An invalid probe and
  a real hole look identical.
- **Restore from a `cp` backup and verify with `shasum`. Never use `git checkout`**
  (`[[git-checkout-no-ops-on-untracked-file]]`).
- **A closed guard finding names the mutant that now dies.** "Tests added" is not closure.
- **Comments-only claims are proven by the parser-token diff** (`[[prove-comments-only-diff-via-parser-tokens]]`),
  not by eye. A render-unchanged claim (the CSS merge) is proven by `[[prove-render-unchanged-via-head-worktree]]`
  or a computed-style read, not by eye.
- **Re-anchor by SYMBOL**, never by the line a finding cites (`[[cite-code-by-symbol-not-line]]`).
- **Shared test fakes (WP3):** `vi.mock` hoists, so a factory can be imported but the `vi.mock`
  call stays per file. Prove each migrated test still fails on its own mutant after the move.
- **Gate:** `pnpm verify:auto`, with the timeout from `runtimes.md` (currently **315000**).
- **WIP file names:** prefix every WIP slug with `paydown-2026-11-27-` (the earlier sweeps'
  `paydown-2026-11-08-*`, `paydown-2026-11-04-*` and `paydown-wp<N>-*` already sit in `state/archive/`).
- **Path:** a WP marked **feature** runs `/feature-plan` (so `feature-review-quality` sees its
  diff). A WP marked **task** runs `/task-plan`. Every WP that changes production behavior takes the
  feature path.
- **Remote checks (WP9, WP10):** read `[[remote-verify-hygiene]]` first. Scratch remote folder only;
  App.tsx edits and rebuilds are hard stops for open remote workspaces.

## Effort anchor (this project)

Benchmarked against the 2026-11-08 sweep's WPs (`git show ccc0f07^:workflow-system/product/backlog-paydown-wbs.md`)
and M18's archived WPs. One plan → build → ship → review → finalize run takes about a day and is
**M**; anything smaller is **S/XS**. Every item below is S or smaller. WP8, WP9 and WP10 are the
biggest, at S–M.

## Disposition model (applied; reproduced so build sessions rule the same way)

- **Impact** = feature value + maintainability, where maintainability = quality × P(future touch).
  **Effort** = the implementer's time, measured against the anchor above. **Risk** = P(the change
  breaks something the suite won't catch). Risk is suite-relative, so a fix that adds the missing
  test lowers its own risk.
- **Rule 1: cheap + safe → ALWAYS Sweep, no exception.** Closing an entry de-clutters the backlog,
  and that is an impact term in its own right.
- **Severity is an INPUT to impact**, not a sort key.
- **Ordering:** deletions → low risk → high impact → co-location. Effort is not an ordering key, and
  risk outranks impact.

## Rulings (operator, 2026-11-27)

- **R1 — `11-09-NEXT-OPEN-INDICATOR-PREDICTS-CONTINUE-WITH-NO-TRANSCRIPT` (BL): DROP.** Offered:
  fall through to `/session-restore` when `--continue` cannot run, correct only the label, or defer.
  Operator: "drop it". It's an operator veto, so it becomes a **Delete** (WP1), with no axis scoring.
  The mis-prediction stays as-built: display-only, and only for projects with no transcript.

## Defaults taken without asking (flag any that are wrong)

- **D1 — Mode 3**, from the workspace's autopilot drive mode.
- **D2 — `11-17-APP-TSX-FAST-REFRESH-CLOSES-REMOTE-WORKSPACES` → Delete.** Its suggested action
  ("add to the remote-verify hygiene memory") is already done: `remote-verify-hygiene.md` §4
  ("An `App.tsx` edit is a hard stop"). The optional "move App's state into a Fast-Refresh-safe
  module" is not taken; nothing has hit it since the memory landed.
- **D3 — Bury, not Defer, for three low-impact medium-effort items:**
  `11-17-REMOTE-EXEC-COUNT-NEEDS-A-BEHAVIOURAL-HARNESS` (the source guards stand, and their residual
  is already stated), `11-17-REMOTE-SETTLE-COULD-BE-READINESS-ONLY` (a ~1.2 s optimization that needs
  ≥10 cold remote opens to probe, and an unreliable inject is invisible to the suite), and
  QF `11-16-QUALITY-M17WP3-BLOCKING-GUARD-NAME-HEURISTIC-SHAPES-PRODUCTION` (a `syn` receiver-type
  resolver is not cheap, and the three dodges it would remove are harmless).
- **D4 — `QUALITY-M17WP2-REMOTE-PREFLIGHT-HAS-NO-FRONTEND-CALLER`: document it as a deliberate
  diagnostic surface** (the MCP bridge uses it for verification). It is neither deleted nor wired
  to a per-check progress line, which would be a feature.
- **D5 — `QUALITY-M17WP5-DISPLACED-DOC-BLOCKS-AND-FUNNEL-INVARIANT`: move both docs back and AMEND
  the "BOTH doors funnel through here" invariant to name the reconnect door.** The dialogs'
  Reconnect is not re-routed through the funnel, which would be a behavior change.
- **D6 — `QUALITY-M17WP5-SESSION-EXISTS-RECORD-COMMENT`: correct the comment.** Recording `Ended` on
  `SessionExists` is not adopted (narrow window; it changes the next open's dialog).
- **D7 — `QUALITY-PICKER-DISMISS-RESTORES-FOCUS-TO-A-BACKGROUND-WORKSPACE`: skip a restore target
  outside the focused workspace.** The ⌘⇧digit switch is NOT gated while the picker overlay is open,
  since gating it changes what the keys do. Reproduce live first, per the finding.
- **D8 — `QUALITY-CLIPBOARD-CAP-DUPLICATED-UNPINNED`: keep both caps and pin them equal** with a
  test that reads both sources. Dropping the frontend cap would change the WP8 toast design.
- **D9 — `QUALITY-M17WP5-DRIVE-MODES-SECOND-COPY`: derive from `DriveMode`** if it serializes
  cleanly; otherwise add a test that the two sets are equal.
- **D10 — `QUALITY-M17WP3-WIP-LABELS-IN-PRODUCTION-COMMENTS`:** reword every label to its decision
  content (WP2), and widen `singleAuthority`'s absent-rule to the TS modules named there (WP3).
  The Rust files get the reword only; no new Rust guard.
- **D11 — `11-16-TAURI-UNLISTEN-REJECTION-ON-WORKSPACE-OPEN`:** the fix (catch the failed unlisten +
  `cancelled`-guard the handler + a `<StrictMode>` jsdom count test) goes in WP5 now. Its installed-build
  positive control rides the pending v0.10.0 installed-build acceptance; it doesn't block WP5.

## WP1: Bookkeeping (delete, bury, send upstream)  `[impact: Low–Med · effort: XS · risk: Lowest]` · task ✅ SHIPPED 2026-11-27 (commit cde2dc9)

Pure subtraction plus one outbound message.

- **Delete** BL `11-09-NEXT-OPEN-INDICATOR-PREDICTS-CONTINUE-WITH-NO-TRANSCRIPT` (R1) and BL
  `11-17-APP-TSX-FAST-REFRESH-CLOSES-REMOTE-WORKSPACES` (D2). One `**Backlog resolved:**` line each,
  wording the reason (operator drop / already carried by the memory).
- **Bury** (D3) → `backlog-archived.md` with the `← Buried (buried 2026-11-27, backlog-paydown sweep)`
  heading suffix: BL `11-17-REMOTE-EXEC-COUNT-NEEDS-A-BEHAVIOURAL-HARNESS`, BL
  `11-17-REMOTE-SETTLE-COULD-BE-READINESS-ONLY`, QF `11-16-QUALITY-M17WP3-BLOCKING-GUARD-NAME-HEURISTIC-SHAPES-PRODUCTION`
  (move the QF body; keep the m17-wp3 pointer stub while its other findings remain).
- **Send upstream:** one inbox message to mccc (`_ref/claude-customization/workflow-system/inbox/`,
  per the cross-workspace inbox convention; mirror the copy into `workflow-system/outbox/`) carrying
  BL `11-09-F10B-MEASUREMENT-COUNTS-A-CORRECT-FSD-CHAIN-AS-A-STOP` and BL
  `11-20-INSTALL-SH-RERUN-DELETES-AN-EXISTING-CLAUDE-MD-BAK`. Self-contained bodies (evidence, the
  suggested fix, what "done" looks like). Update both entries' Status to "sent <date>, <filename>";
  they stay open until mccc applies them. Write only the inbox file in mccc, and never commit there.
- ⚠️ Check the payload before the send (`test -s` + `head`, `[[check-payload-before-outward-send]]`).

## WP2: Comments and docs only  `[impact: Med · effort: S · risk: Lowest (comments only)]` · task ✅ SHIPPED 2026-11-27 (commit 8b0c4f7)

No executable change; proven by the parser-token diff. Groups the comment MINORs by file.

- QF `11-09-QUALITY-WP5-ANNOUNCEROW-HEADER-CONTRADICTS-MANUAL-ROWS`: re-wrap; restate the rule in both places.
- QF `11-09-QUALITY-WP5-PICKERROW-COMMENT-CARRIES-REVIEW-HISTORY`: trim it to the WHY.
- QF `11-16-QUALITY-M17WP2-HISTORY-NOTES-IN-CODE-COMMENTS`.
- QF `11-16-QUALITY-M17WP3-WIP-LABELS-IN-PRODUCTION-COMMENTS` (+ its WP5 update): ~65 lines across
  `Workspace.tsx`, `injectFailure.ts`, `remote_link/*.rs`, `cc_session/mod.rs`, `remote.rs`. Reword each to its decision content
  (D10; the guard widening is WP3).
- QF `11-16-QUALITY-M17WP4-BRITTLE-PIN-AND-STALE-DOCS`, **docs half** (the module doc's
  canonicalization claim, the run-on `to_update` sentence). The pin half → WP4.
- QF `11-17-QUALITY-M17WP5-STALE-ANNOUNCE-REMOTE-COMMENT`.
- QF `11-17-QUALITY-M17WP5-DISPLACED-DOC-BLOCKS-AND-FUNNEL-INVARIANT` (D5).
- QF `11-17-QUALITY-M17WP5-SESSION-EXISTS-RECORD-COMMENT` (D6).
- QF `11-18-QUALITY-XTERMPANE-LIFECYCLE-FLAG-BLOCK-STALE-COUNT`.
- QF `11-18-QUALITY-STUB-RELAUNCH-ASSUMES-COMMITTED-FIRST-SPAWN`.
- QF `11-20-QUALITY-CC-SESSION-DOC-LINE-WIDTH`.
- QF `11-20-QUALITY-SUBSTRATE-SINK-SETTER-SHAPE`: document the ordering invariant on the setter.
- QF `11-27-QUALITY-PANEL-COMMENT-SAYS-ONE-CHILD`.
- QF `11-16-QUALITY-M17WP2-REMOTE-PREFLIGHT-HAS-NO-FRONTEND-CALLER` (D4).
- QF `11-09-QUALITY-WP6-DOCS-STILL-NAME-SPAWN-BLOCKING`, **docs half** (the five command doc headers
  + the `ASYNC_COMMANDS` reasons). The `SPAWN_BOUNDARIES` entry → WP4.
- BL `11-16-PRUNE-COMMENT-CLAIMS-UNCHANGED-FILE-BUT-IT-RE-SORTS`.

## WP3: Frontend test scaffolding + precision  `[impact: Med · effort: S · risk: Low (test-only)]` · task ✅ SHIPPED 2026-11-27 (commit d9e637f)

- QF `11-18-QUALITY-LIVE-PANE-XTERM-MOCKS-DUPLICATED` + QF `11-18-QUALITY-TERMINAL-FAKE-TRIPLICATED`
  (one theme): one configurable `Terminal` fake + the ResizeObserver/rAF shims in
  `__tests__/liveWorkspace.tsx`, imported by `osc52Live`, `autoResumeFireLive`, `remoteRelaunchIntentLive`.
- QF `11-18-QUALITY-RELAUNCH-LIVE-TEST-ASSERTS-NOT-EQUAL`: `toEqual(["reconnect", "fire"])`; name the
  `reconnect → no-fire` mutant that now dies.
- QF `11-27-QUALITY-CSS-TRIPWIRE-PARSES-BRACES-BEFORE-STRIPPING-COMMENTS` then QF
  `11-27-QUALITY-OVERLAY-PICKER-RULE-SPLIT-IN-TWO` (merge the two rules once the tripwire is robust;
  render unchanged, proven).
- QF `11-18-QUALITY-CLIPBOARD-CAP-DUPLICATED-UNPINNED` (D8): a test reading both sources (`node:fs`).
- `singleAuthority` absent-rule widened to the TS modules from QF `…M17WP3-WIP-LABELS…` (D10), once
  WP2 has scrubbed them. Mutation-prove: re-add one label and watch it fail.

## WP4: Rust test + guard precision  `[impact: Med · effort: S · risk: Low (test-only)]` · task ✅ SHIPPED 2026-11-27 (commit f9efd06)

- QF `11-17-QUALITY-M17WP5-DENSE-BODY-HELPERS-TRIPLICATED` + QF `11-20-QUALITY-CFG-TEST-FENCE-HAND-COPIED`
  (one theme): one `pub(crate)` test helper in `source_guard` (dense body with one cut rule;
  `item_attrs` + `is_cfg_test` covering every `Item` variant), used by all copies, tested once.
  `tests/sync_commands_do_not_block.rs` is an integration test: share by `#[path]` include if
  `pub(crate)` can't reach it.
- QF `11-18-QUALITY-SPAWN-PERMISSION-GUARD-INDENT-BOUND`: anchor inside the `RegisteredSession {` span.
- QF `11-16-QUALITY-M17WP4-BRITTLE-PIN-AND-STALE-DOCS`, **pin half**: narrow it to "Ended is inside the latch".
- QF `11-20-QUALITY-GITCLEAN-MISSES-THE-COMMAND-FORM`: the args form scoped to a git invocation, with
  one-spelling meta-tests and a near-miss.
- QF `11-09-QUALITY-WP6-DOCS-STILL-NAME-SPAWN-BLOCKING`, **guard half**: add `on_blocking_worker` to `SPAWN_BOUNDARIES`.
- QF `11-16-QUALITY-M17WP2-AUTH-CHECK-HARDCODES-TOKEN-PATH`: `assert!(AUTH_CHECK.contains(TOKEN_FILE))` or `concat!`.
- QF `11-17-QUALITY-M17WP5-DRIVE-MODES-SECOND-COPY` (D9).
- QF `11-09-QUALITY-WP5-SHARED-RESOLVER-TESTS-LIVE-IN-TRANSCRIPT`: move the cases into `profiles.rs`.
- QF `11-18-QUALITY-CONF-ASSERT-NO-MESSAGE`.
- QF `11-16-QUALITY-M17WP2-CWD-TRAP-TEST-WRITES-UNDER-SRC-TAURI`: a `.gitignore` entry + comment.

## WP5: Frontend input + listener correctness  `[impact: Med–High · effort: S · risk: Low–Med]` · feature ✅ SHIPPED 2026-11-27 (commit bc161e8)

Holds the sweep's highest-impact item (keystrokes routed to a hidden yolo session).

- QF `11-27-QUALITY-PICKER-DISMISS-RESTORES-FOCUS-TO-A-BACKGROUND-WORKSPACE` (**MAJOR**, D7):
  reproduce live first via the bridge; then a `pickerFocusWiring` case through the real `App`.
- BL `11-16-TAURI-UNLISTEN-REJECTION-ON-WORKSPACE-OPEN` (D11): fix `useTauriListen` + a `<StrictMode>`
  jsdom test counting handler calls per emitted event. Positive control: the test fails on HEAD's hook.
- QF `11-20-QUALITY-HOST-STORE-LATCH-NEVER-RETRIES`: reset `started` in the `catch`.
- QF `11-20-QUALITY-WORKSPACE-THIRD-GATE-HOOK-CALL`: read the gate once.
- QF `11-20-QUALITY-SHORTHOST-CROSS-LAYER-IMPORT`: move `shortHost` to `state/workspaceSurfaces.ts`.
- QF `11-20-QUALITY-RUN-PANEL-LISTENER-COUNT-HARDCODED`: a named count tied to the listen calls.
- QF `11-20-QUALITY-DRIFT-COPY-SAYS-GITHUB-FOR-ANY-ORIGIN`: "its origin" when the origin is not GitHub.

## WP6: Rust small correctness + copy  `[impact: Med · effort: S · risk: Low]` · feature ✅ SHIPPED 2026-11-27 (commit 7f14181)

Subprocess / runner / announce / preflight / remote_ops. Each item comes with a pinning test.

- QF `11-09-QUALITY-WP6-MAX-OUTPUT-CARRIES-THREE-MEANINGS`: separate named constants; restore the
  adjudicator's reason.
- QF `11-09-QUALITY-WP6-LONG-LINE-CUT-WITHOUT-MARKER`: ` […line cut]`.
- QF `11-09-QUALITY-WP6-TRUNCATION-NOTE-IMPLIES-ARRIVAL-ORDER`: reword it and update its two tests.
- QF `11-09-QUALITY-WP5-APPLY-TRUST-REPARSES-PER-ROW`: check the action first, parse once.
- QF `11-16-QUALITY-M17WP2-PRINT-HOME-INTOLERANT-OF-RC-NOISE`: reuse `remote_link::HOME_SENTINEL`'s
  last-sentinel-line rule (one parser, not a copy).
- QF `11-16-QUALITY-M17WP2-PREFLIGHT-CHECK-NAMES-MISLABEL`.
- QF `11-20-QUALITY-CONSENT-REFUSAL-NAMES-AN-UNCHANGED-FOLDER`: pin both wordings.
- QF `11-20-QUALITY-INSTALL-ERA-NAMES-SERVE-ALL-OPS`: rename `RemoteUninstallTarget` along with the
  `E0451` compile-fail test and `arch/claude-substrate.md` R.3 (grep repo-wide first,
  `[[doc-correction-scope-list-is-a-floor]]`).

## WP7: Tray debug readout  `[impact: Low–Med · effort: XS–S · risk: Low (debug-only)]` · task ✅ SHIPPED 2026-11-27 (remote half not run; see its backlog entry)

- BL `11-16-TRAY-HAS-NO-READOUT-FOR-LIVE-VERIFY`: a `#[cfg(debug_assertions)]` command returning
  `TrayState.applied` + the per-workspace map. Register it in the sync-command guard tables. Then
  verify live the local half of the two WP4 tray behaviours (closing an awaiting workspace clears
  the alarm). The remote half (lost remote session keeps it lit) needs the mini: run it if a
  scratch remote row is available, else record it as not run.

## WP8: Workspace notices: kind + slot  `[impact: Med · effort: S–M · risk: Low–Med]` · feature ✅ SHIPPED 2026-11-27 (commit 53bac5a)

One theme: the single `setInjectFailure` red-toast slot is shared by five writers (last writer
wins), and several of them aren't failures at all.

- BL `11-17-REMOTE-OPEN-STARTED-AGAIN-NOTICE-USES-THE-ERROR-STYLE` (+ its M18 WP2 withheld-notices
  addendum): each notice carries its kind; the **error kind wins** in a joined toast. Pin both cases
  on the toast's `data-kind` with a live mount.
- QF `11-16-QUALITY-M17WP4-HOOK-WARNING-SHARES-INJECT-TOAST` (+ WP5 update): a separate slot or a
  once-per-connect latch.
- QF `11-18-QUALITY-OSC52-FAILED-COPY-IS-SILENT`: a refused or failed copy shows a workspace toast;
  soften security-posture's "refused, not truncated (both sides)".
- QF `11-17-QUALITY-M17WP5-CLOSE-NOT-ENDED-TOAST-CAUSE-AND-PROJECT`: reason + project in the payload.
- QF `11-18-QUALITY-WITHHELD-NOTICE-CAUSE-DEFAULT`: make `cause` required.
- QF `11-16-QUALITY-M17WP3-INJECT-REFUSAL-AS-CALLBACK`: `injectCommand` resolves to `string | null`.
- QF `11-17-QUALITY-M17WP5-UNKNOWN-SESSION-TEXT-COUPLING`: a Rust↔TS mirror test (or a typed code).

## WP9: `cc_session` session shape  `[impact: Med–High · effort: S–M · risk: Med]` · feature ✅ SHIPPED 2026-11-27 (commit ee37ae3)

Load-bearing reconnect semantics, pinned by exact-text caller guards. Re-spell the guards in the
same change.

- QF `11-17-QUALITY-M17WP5-RECONNECT-MODE-NESTED-OPTIONS` (**MAJOR**): `enum SessionMode { Unknown,
  None, Mode(DriveMode) }` + `enum RemoteOpen { Start, Attach(SessionMode) }`. Close the B6 mutant
  hole with a behavioural test before the refactor (test first lowers the risk).
- QF `11-16-QUALITY-M17WP3-REMOTE-HOST-STORED-TWICE`: derive the host from `remote` (same shape, same WP).
- QF `11-16-QUALITY-M17WP3-REMOTE-DISPATCH-INSIDE-PTY-CONSTRUCTOR`: move the dispatch to
  `SessionRegistry::spawn`; mind the guards pinning `PtyCcSession::spawn(`.
- Live: one scratch remote open + reconnect + Recycle on the mini (`[[remote-verify-hygiene]]`).

## WP10: Remote link lifecycle  `[impact: Med · effort: S–M · risk: Med]` · feature

Process-lifetime and race fixes; needs the mini for the live half.

- BL `11-16-REMOTE-LINK-MASTER-ORPHANED-WHEN-THE-APP-IS-KILLED`: on launch, reap any `ssh -M` whose
  `-S` is under THIS app's `ssh/` dir (dev and prod dirs differ, so neither reaps the other's) before
  starting a link. Live test: SIGKILL the dev app, relaunch, and no `ssh -M` with its ControlPath survives.
  ⚠️ Kill only by PID you resolved from that ControlPath (`[[lsof-ti-tcp-misses-ipv6-vite]]` spirit:
  never a process you did not identify).
- QF `11-16-QUALITY-M17WP3-STALE-MASTER-PID-AFTER-REAP`: clear `master_pid` on reap/kill.
- QF `11-16-QUALITY-M17WP4-REALPATH-ALIAS-NEVER-CLEARED`.
- QF `11-16-QUALITY-M17WP4-STALE-OVERLAY-EMIT-RACE`: a per-workspace sequence (drop an older update).

## Scope: what is NOT swept (anchors intact)

| Item (BL) | Disposition | Anchor / reason |
|---|---|---|
| `11-09-NEXT-OPEN-INDICATOR-PREDICTS-CONTINUE-WITH-NO-TRANSCRIPT` | **Delete** (R1), executed in WP1 | operator: "drop it" |
| `11-17-APP-TSX-FAST-REFRESH-CLOSES-REMOTE-WORKSPACES` | **Delete** (D2), executed in WP1 | already carried by `remote-verify-hygiene.md` §4 |
| `11-17-REMOTE-EXEC-COUNT-NEEDS-A-BEHAVIOURAL-HARNESS` | **Bury** (D3), executed in WP1 | → `backlog-archived.md` |
| `11-17-REMOTE-SETTLE-COULD-BE-READINESS-ONLY` | **Bury** (D3), executed in WP1 | → `backlog-archived.md` |
| QF `11-16-QUALITY-M17WP3-BLOCKING-GUARD-NAME-HEURISTIC-SHAPES-PRODUCTION` | **Bury** (D3), executed in WP1 | → `backlog-archived.md` |
| `11-09-F10B-MEASUREMENT-COUNTS-A-CORRECT-FSD-CHAIN-AS-A-STOP` | Defer, upstream (**sent in WP1**) | mccc's `measure-f10b-handback-rate.py` |
| `11-20-INSTALL-SH-RERUN-DELETES-AN-EXISTING-CLAUDE-MD-BAK` | Defer, upstream (**sent in WP1**) | mccc's `install.sh` |
| `09-17-OBSERVABLE-OUTCOME-WRITTEN-FOR-A-SURFACE-A-LATER-PHASE-BUILDS` | Defer, upstream | `HANDOFF-to-mccc-2026-09-23-paydown.md` §A.1 |
| `09-15-WIP-FILES-USE-PROSE-HEADERS-NOT-YAML-FRONTMATTER` | Defer, upstream | same handoff §D.8 |
| `09-12-ONE-TRANSITION-HAS-NO-PAUSE-POLICY-ROW-UPSTREAM` | Defer, upstream | same handoff |
| `09-12-THE-TWO-UPSTREAM-COPIES-OF-THE-FEATURE-GRAPH-DISAGREE` | Defer, upstream | Claudesk half done |
| `08-25-PROBE-CHECK-EXEMPTS-ALREADY-INSTALLED-DEPENDENCIES` | Defer, upstream | same handoff §A.4 |
| `08-25-REFUTATION-FROM-TYPINGS-NOT-RUNTIME` | Defer, upstream | same handoff §B.5 |
| `08-28-SUPERSEDED-TEXT-IN-DURABLE-DOCS-HAS-NO-CONVENTION` | Defer, upstream | same handoff §F.10 |
| `08-26-DELETE-ON-RESOLVE-REWRITE-PATH-SKIPS-THE-DELETE` | Defer, upstream (local half done) | same handoff §F.11 |
| `08-25-OBSERVABLE-OUTCOME-ASSERTED-A-GREEN-GATE-ITS-OWN-PHASE-BREAKS` | Defer, upstream | same handoff §A.2 |
| `08-25-A-DELETED-EXPORT-BREAKS-THE-APP-AT-RUNTIME-NOT-JUST-TSC` | Defer, upstream (local half done) | same handoff §A.3 |
| `09-17-REVIEW-QUALITY-DIFF-WINDOW-BREAKS-ON-A-PARKED-FEATURE` | Defer, upstream | same handoff §C.7 |
| `m12-wp1-probe-flag-store-and-announce` pointer (+ its QF body) | Defer, upstream | same handoff §B.6 |
| `09-28-IS-TURN-START-FIRES-ON-MID-TURN-DEQUEUES` | Defer, upstream-blocked | anthropics/claude-code#105187 |
| `09-14-SUPERVISOR-NEVER-OBSERVED-FIRING-IN-A-LIVE-SESSION` | Defer, release + dogfood | on-screen checks; ordinary dogfooding |
| `09-15-SUPERVISOR-DOGFEEDBACK-BATCH-1` | Defer, release + dogfood | its seven checks |
| `09-15-STAGING-AREA-FOR-PROMPT-INPUT` | Defer, operator-owned | reopens on an operator dictation report |
| `11-04-REOPENED-WORKSPACE-CC-PANE-NEVER-PAINTS` | Defer, watch | installed-build sighting only |
| `08-21-STATUS-PATH-KEYS-ON-CWD-ALONE-COLLAPSING-SESSIONS` | Defer, trigger | first real two-sessions-per-repo use |
| `08-18-GUARD-VOCABULARY-MISSES-RECYCLE-AND-SESSION` | Defer, trigger | when a surface first needs its own guard arm |
| `09-18-DOC-COUNT-NEEDS-A-GENERATOR-NOT-A-DETECTOR` | Defer, trigger | "if this drifts again" |
| `07-31-EDITOR-MINIMAP-STALE-ON-FILE-UPDATE` | Defer, feature-sized | a `drawLine` rewrite; a vision-revisit candidate |

**Also not in this sweep, by design:** `/util-prune-claude-md` runs as its own step (the operator
asked for "paydown and prune" together). The v0.10.0 installed-build acceptance and choosing the next
milestone are not backlog items.

## Fold back and delete (on completion)

1. Confirm every WP's findings are RESOLVED: each has a `**Backlog resolved:**` CHANGELOG line, and
   its QF body + BL pointer stub are deleted **in the same commit** (delete-on-resolve). A pointer
   stub is deleted only when its group's last finding goes. `backlogHeadings.test.ts` catches a
   surviving duplicate.
2. Confirm the WP1 Buries landed in `backlog-archived.md`, the two Deletes have their CHANGELOG lines,
   and the mccc message exists in both `_ref/claude-customization/workflow-system/inbox/` and
   `workflow-system/outbox/`.
3. Carry any surviving obligation into its backlog entry, not into this file. Examples: WP5's
   installed-build positive control for the unlisten fix (D11), and WP7's remote tray half if it wasn't run.
4. Delete this file, then commit: `chore(paydown-2026-11-27): fold back and delete the sweep WBS`.

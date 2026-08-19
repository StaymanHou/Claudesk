<!-- Part of the Claudesk architecture set. Index + load-bearing constraints: ../arch.md -->
# Session resumption & drive mode

Opening a workspace now fires the correct resumption command by itself and **announces it before you
click**, and a project can pin the workflow drive mode its CC session runs under. Shipped as 8 work
packages (WP1 → WP2 → WP3 → WP4a → WP4b → WP4c → WP4d → WP5), fully serial.

⚠️ **This milestone was RE-DESIGNED at decomposition and again at WP4, both times because a
documented premise did not survive contact with the machine.** The as-built design below is the
authority; `roadmap.md`'s M12 block carries the same corrections. The two refuted designs are
deliberately *recorded* rather than deleted, because both read as perfectly reasonable.

### The two signals (⚠️ TWO, not three — and precedence is REVERSED from the original spec)

| # | Condition | Action | Kind | Trigger |
|---|---|---|---|---|
| 1 | Unclean-exit flag set | **`--continue` CLI flag** | argv, at spawn | AUTO |
| 2 | `workflow-system/state/.session.md` present | `/session-restore` | PTY inject, ~1500 ms later | AUTO |
| 3 | Neither | *(nothing)* | — | MANUAL — a `/session-start` button in the workspace header |

- **⚠️ `/session-start` is NEVER auto-fired.** The original three-branch spec's middle arm keyed on
  *"does CC have a resumable conversation for this dir?"* — **unqueryable** (`claude --help` exposes
  `-c/--continue` and `-r/--resume` to *act*, nothing to *ask*) and **permanently true** (the
  transcript store never prunes; 194 transcripts for this project, and a throwaway scratch repo had
  5). As specced it would have starved the fresh-start path forever.
- **⚠️ Arm 1 is the `--continue` FLAG, not a typed `/resume`.** A bare `/resume` opens an
  *interactive session picker* (WP1 probe), which would strand the operator in a modal on every
  unclean re-open. The two arms therefore differ **in kind** — argv at spawn vs. PTY injection —
  which is why `predictAction` returns a **tagged union**, not a string.
- **⚠️ Precedence: the unclean flag BEATS `.session.md`** — the reverse of the original spec. The
  flag is an explicit user signal; `.session.md` is semi-automated. Mutation-proven in
  `predictAction.ts`; a future reader will otherwise "fix" it back.
- **The flag deletes the unknown instead of solving it** (design prior
  `prefer-an-explicit-user-signal-over-an-unobservable-inference`): it is **DEFAULT-SET on workspace
  open** and cleared **only** by a clean exit, so a power loss — which runs no code — and a button
  click produce **identical state**. The design fails toward "resume the mid-flight workflow."

### The unclean-exit flag: its own store, keyed canonically

`session-state.json` in the per-identity `app_data_dir()` — a path→bool map where **ABSENT MEANS
CLEAN** (clearing removes the key; an absent file is the correct cold-start state). Third instance of
an established pattern (`status_log` already owns a small machine-local file in the same dir), so
dev/prod isolation comes free.

- **⚠️ A field on `Project` was disqualified by a LOST-UPDATE hazard, not byte cost.** Every
  `projects.json` write is a whole-file read-modify-write, and set-on-open is co-triggered by the
  *same click* as the recency stamp — whichever lands last silently discards the other's field, and
  **losing the flag silently disables auto-resume.** `settings.json` was mechanically fine but
  rejected on **category**: that file is user preferences behind `⌘,`; this is machine-local session
  state the user never sets or reads. Reopen only if `projects.json` writes stop being whole-file RMW
  (`SURFACE-2026-08-03-PROJECTS-JSON-WRITERS-ARE-WHOLE-FILE-RMW` remains open).
- **⚠️ Every read/write MUST go through `key_for()`** (`session_state/mod.rs`), which canonicalizes:
  app-quit reads canonicalized `WorkspaceRegistry` paths while spawn receives the frontend's raw
  `projectPath`. A new reader that skips it silently matches nothing — no error, just a flag that
  never fires.
- **`consume(map, path)`** returns the prior value **and** clears, so an arm fires at most once per
  unclean exit. **Clearing is OPT-IN PER ROUTE** (`CleanExitRoute` + `session_state_mark_clean`),
  never a side effect of teardown — `cc-exit-<sid>` fires for *every* teardown including the ⏸, and
  `cc_kill` fires from `XtermPane`'s unmount (which also runs on StrictMode remounts).
- **⚠️ THREE routes shipped, not four.** `/exit` was a **dead variant** — declared in the Rust enum,
  the TS union, and round-tripping in two suites, called by nothing — and was removed at review. A
  typed `/exit` leaves the workspace OPEN with a "Session ended" overlay, so there is no close to
  clear on (`SURFACE-2026-08-03-TYPED-EXIT-LEAVES-THE-UNCLEAN-FLAG-SET`). **The generalizable lesson:
  enumerating routes as data made the SET exhaustive and testable, but nothing tested that each
  member had a CALLER — and the exhaustiveness test's green read as coverage.**
- **⚠️ M13 WP3 closed the one remaining caller-less variant — the count did NOT change.**
  `RecycleSession` was declared at M12 WP2 *ahead of* the feature (deliberately, so M13 would inherit
  the contract rather than rediscover it), which made it the same shape the `/exit` bullet above
  warns about: a member of an exhaustive, tested set with no production caller. WP3 gave it one
  (`recycleSession.ts` → `markSessionClean(projectPath, "recycle-session")`). So the set is still
  **three**, and all three clean-exit *routes* are now live. ⚠️ **Be precise about `AppQuit`,
  though:** the app-quit clean exit is real and implemented, but **in Rust** — `perform_quit_teardown`
  (`lib.rs`) calls `session_state::clear_and_persist` **directly**, bypassing the enum — so the
  `AppQuit` *variant* still has no caller that routes through it, and nothing sends its `"app-quit"`
  wire name outside type declarations. **Two writers by design** (`session_state_mark_clean` over IPC
  for the frontend routes; `clear_and_persist` in-process for quit), which is exactly what makes a
  caller audit of one mechanism generalize wrongly to the other. ⚠️ **The lesson survives unchanged and was re-confirmed, not
  retired** — M13 WP1 hit the identical shape again while auditing this very flag, mis-reporting
  `AppQuit` as caller-less and **retracting the finding before any code changed** (the sweep had
  audited one mechanism's callers and generalized to a second writer that does not use it).
- **⚠️ Recycle's clear fires ONLY on the success arm, and its ORDER is load-bearing.**
  `markSessionClean` runs at step 4, **before** the kill at step 5 — so a crash between the two
  leaves the flag CLEAR on a session that never respawned (benign: the handoff is on disk and
  `.session.md` drives the next open), whereas the reverse order risks a flag left SET after a clean
  handoff, which is the spurious `--continue` the clear exists to prevent. The failure arm returns
  *before* the clear, which is why a refused handoff correctly leaves the flag set.
- **⚠️ THE STEP-6 SETTLE MUST FOLLOW `awaitFreshSessionId()`, NOT PRECEDE IT** (fixed 2026-08-19;
  shipped wrong in v0.3.3 and hit on first real use). `relaunch()` only *dispatches* the respawn —
  the fresh session id arrives asynchronously, pushed through `XtermPane` → `App` state → the prop →
  the ref the caller polls. A settle placed before that await therefore runs **concurrently with the
  spawn**, and the window that actually protects the injection is only what remains once the id
  lands: near zero on a cold or loaded spawn. The symptom is M12's measured 0 ms mode — the restore
  typed into CC's input box with the autocomplete open, `\r` not acting as Enter, **never executed**.
  ⚠️ **The delay was never missing, so a bigger number is not the fix**: under the old ordering a
  larger value partly buys more spawn-wait rather than more settle. ⚠️ **And do NOT raise the shared
  `INJECT_SETTLE_MS`** — the auto-resume arm is correct precisely because its timer starts when the
  pane is *already* spawned (same constant, different starting line). Re-measured 2026-08-19 on
  CC 2.1.235, 5 cold spawns per arm: 350 ms **NOT-EXECUTED 5/5** (M12 recorded that row as *flaky*
  1/5 — the cliff moved **up**), 700/1000/1500 ms EXECUTED 5/5, so 1500 ms keeps a 2-3x margin and
  stays shared. ⚠️ The suite could not see the defect because the settle was a bare inline `sleep()`
  logging no effect; it is now an injectable `settle` seam whose position the ordered-sequence
  assertion pins. **Do not collapse it back to an inline sleep** — that re-blinds the assertion.
- **⚠️ Recycle is ABORTABLE, and the abort's flag semantics are a DECIDED asymmetry — not an
  accident of where the await sits** (2026-08-19, paydown WP7 / ruling D1). The operation runs up to
  `RECYCLE_TIMEOUT_MS` (180s) and its caller genuinely unmounts when the operator closes the
  workspace, so `RecycleInputs.signal` is checked at three points: after the completion wait, between
  the clean mark and the respawn, and after the settle. **On abort after a successful handoff but
  before the respawn, the clean mark STAYS.** The handoff really did complete and `.session.md` is on
  disk, so `--continue` would resume an already-cleanly-handed-off conversation; what the next open
  *should* do is read that handoff, which a CLEAR flag is exactly what makes it do. ⚠️ There is
  deliberately still **no `mark_unclean` primitive** — this site is precisely where one looks
  tempting, and a mutant adding an undo here is caught by a test rather than passing silently.
  Before this, closing a workspace mid-Recycle cleared the flag and then `relaunch()`
  (`() => ccPaneRef.current?.relaunch()`) **silently no-opped on the nulled ref**, so the next open
  announced nothing where it should have offered `--continue`. ⚠️ M15's context-pressure caller fires
  with **no human watching**, which is what widened this from a rare race to unattended silent flag
  corruption. The abort is proven **at the caller** in its own file (`recycleAbortOnUnmount.test.ts`),
  not only in the operation — `recycleMachine.ts` was already correct and already proven when the
  defect shipped, which is the standing "proves the MACHINE, not its CALLER" trap.
- **⚠️ A live post-Recycle flag reads `true`, and that is NOT a missed clear** (verified end-to-end
  2026-08-18, M13 WP4 Phase 3). Setting is owned by the spawn path — there is deliberately **no**
  `mark_unclean` command — so Recycle's own respawn re-sets the flag for the now-live session
  immediately after clearing it. The consume-before-set ordering is pinned by
  `consume_before_set_or_nothing_ever_resumes` (`cc_session/mod.rs`). **The operator-visible
  consequence is the only honest observable:** a cleared project announces **nothing** on reopen.
  Reading the raw flag right after a recycle and concluding the clear failed is the available trap.

### The announcement: a prediction, never the input to the action

`picker_announce_actions` is a **new sibling command**, one call per picker open, **zero per-row IPC**,
gate-checked **server-side**. ⚠️ Deliberately *not* a widening of `list_projects`: two of its three
consumers use only `projects.length`, so widening would make both pay N filesystem stats to learn a
number (pinned by `listProjectsConsumers.test.ts`).

- **⚠️ Staleness is display-only and self-correcting, because THE CLICK PATH RE-DERIVES.**
  `.session.md` can vanish while the picker is open (`/session-restore` deletes it at its own step 7
  — observed live). Worst case is a label that promised an action and nothing firing, **never a wrong
  action.** `actionForIntent` is the enforcement point.
- **One conditional governs both the label and the door** (`rowAffordances`), so the component cannot
  render one without the other.
- **⚠️ The `⊘` no-fire door shipped NESTED-and-defended, not as a sibling `⏵`** — a
  `<span role="button" tabindex="0">` inside the open `<button>`'s gutter, guarded by
  `stopPropagation` on **both** pointerdown and click plus an Enter/Space mirror, verified live to
  hit-test to itself. `isSiblingOfOpenButton` does **NOT** protect it (that predicate is
  `cell !== "open"`, tautological for a nested element). The planned and as-built solutions
  deliberately DIFFER; do not "correct" it back.

### ⚠️ THE GATE APPLIES PER ARM, NOT PER FEATURE

| arm | reads | gated? |
|---|---|---|
| `{kind:"argv"}` — `--continue` | `session-state.json` (Claudesk's own store) | **NO** |
| `{kind:"inject"}` — `/session-restore` | `workflow-system/state/.session.md` | **YES** |

The discriminator is **applicability**, which is what
`gate-substrate-dependent-feature-class-behind-default-off-opt-in` actually keys on — never audience
size. Nothing in the `--continue` arm touches `~/.claude/skills/` or `workflow-system/`, so it serves
**every** Claude Code user and gating it was a mis-application of the prior. Applied in **two**
independent places that must agree: `armAvailable` (`announceRow.ts`) and `arm_available`
(`src-tauri/src/announce/mod.rs`). Both branch on the action's **`kind`**, never on its label or wire
string.

⚠️ **This is the one thing WP5's guard arm exists to protect, and it is easy to get backwards** — see
"The OFF-invariant guard's fourth arm" below.

### The drive-mode signal: a SIGNAL, not a store

⚠️ **THE DELIVERABLE IS A SIGNAL.** A persisted `drive_mode` **already existed on disk in 93% of
manual restores and was already ignored 74% of the time**, so storing it somewhere new accomplishes
nothing on its own. The mechanism, **proven live** (per `[[cc-hook-capture-beats-docs]]`, not from
docs): an **env-var-gated `UserPromptSubmit` hook returning `additionalContext`** makes the **real**
`/session-restore` skip its mode menu.

```
picker cell  →  projects.json (default_drive_mode)  →  CLAUDESK_DRIVE_MODE on the CC spawn
             →  claudesk-hook.pl emits additionalContext on UserPromptSubmit  →  the skill reads it
```

- **⚠️ The WIP-frontmatter mirror was REJECTED, not built.** `/session-restore` **deletes**
  `.session.md` at step 7 and `feature-finalize` **archives** the WIP file, so at the exact moment a
  new WP starts there is nothing to mirror into — and five WIP templates never declare the field.
  **Claudesk does NOT write into `workflow-system/`**; it reads that world (M11's docs viewer is
  read-only and M12 did not change that). Core Principle 2's arrow was backwards and is corrected.
- **⚠️ HARD CONSTRAINT — ZERO companion-repo change.** `/session-restore`'s re-prompt is **correct**
  for a plain-CLI user and must not change: a CLI user has stated one intent (*restore*) and said
  nothing about mode. **The distinguishing fact is the CALLER, not the skill.**
- **`additionalContext` MUST nest under `hookSpecificOutput` with `hookEventName`** — top-level is
  rejected at runtime. Chosen **per-turn** (`UserPromptSubmit`) over one-shot (`SessionStart`)
  because a `SessionStart` injection lands once at position 0 and decays as the session grows.
- **⚠️ The env var is the ONLY possible Claudesk marker.** `cwd`-based hook correlation
  (`status_broadcaster::resolve_cwd`, longest-ancestor match) **cannot** distinguish a
  Claudesk-spawned `claude` from a terminal-spawned one in the same tree. ⚠️ Note the retracted claim
  *"so adding one is free"*: true of the primitive, **false at the call site** —
  `color_tty_env()` returns a fixed-size array, so widening it would leak the var into the raw login
  shell. The fix is a **separate `cc_spawn_env`** composed for the CC spawn only, which is why WP4b
  sized M and not S.
- **The model cannot read env vars.** The var works only as a *gate* on a hook that can.
- **Open, recorded, not defects:** the var **inherits to ALL DESCENDANTS** (confirmed empirically — a
  nested `claude` fires the hook with the parent workspace's mode; undecided); and **long-context
  durability of per-turn re-injection remains ASSUMED, not proven** — both live proofs were on short,
  cold contexts, and a synthetic filler probe was **considered and declined** (it would be expensive
  *and* weak evidence). Validated by dogfooding.

### The picker-row cell (⚠️ NOT the workspace header)

Two stacked lines inside the **existing** model column (`PICKER_ROW_CELLS` untouched), so the second
value costs **zero** extra width on every row. `cellLines()` is the single source of truth for both
the resting-label rule and the gate collapse, as a **value** rather than a nest of JSX conditionals.

| state | line 1 | line 2 |
|---|---|---|
| **gate OFF** | `Default` / `opus` | *(absent)* |
| neither set | `Model: Default` | `Drive Mode: None` |
| both set | `opus` | `autopilot` |

- **Placement is picker-row ONLY, not both.** Two homes for one per-project value would need a sync
  path that deliberately does not exist. This is the **first live edge case** for design prior
  `set-a-spawn-time-choice-where-the-spawn-is-chosen` (drive mode is read at spawn **and** is
  live-reconfigurable). Prefix **only when unset** — once set, the bare value is self-describing.
- **⚠️ It IS a native `<select>`, reversing the roadmap's "never a live `<select>` on every row"** —
  operator decision, for a **correctness** reason: the four values are a **CLOSED** set, and a bad
  drive-mode string **fails serde on read and takes the whole project list down**, whereas a bad
  *model* string is adjudicated by CC in the pane. `modelOverride.ts`'s emphatic *"do NOT
  validate"* rule **must not be generalized here** — the two look like siblings and are opposites on
  exactly this axis.
- **⚠️ TWO EDIT TARGETS IN ONE COLUMN** is the structural risk: a single cell-wide handler would make
  a click meant for the mode open the *model* editor, which presents as *"the control does nothing"*
  and **no unit test can see it**. Each line owns its own hit region and copies the `⊘` discipline
  verbatim.
- **No mount-time IPC read for either value** — both seeds arrive as props from the `recents` array
  the picker already holds (`driveModeIpc.ts` deliberately ships no getter at all).
- **⚠️ Box math for this column was wrong THREE separate ways**, each caught only by measuring the
  live DOM: `em` resolved against the root instead of the element's own font-size; a width derived to
  fit *exactly* lost to sub-pixel rounding; and headroom computed by subtracting padding from a
  `content-box` width that never included it. The column is **`9.8em`**. **Measure; compute nothing
  you can read** — and never verify clipping with `scrollWidth > clientWidth` (integer-rounded,
  therefore blind to precisely the sub-pixel overflow that triggers an ellipsis).

### The OFF-invariant guard's FOURTH arm (WP5)

M12's surfaces — a picker cell and a spawn-time action — are neither a panel, a menu id, nor a chord,
so the guard gained a **fourth registry: the row cell**, asserting the **computed** OFF-state value
(`cellLines(…,false,…)`, `rowAffordances(…,false)`) as M11's precedent requires. 14 → **19** tests;
the guard was **extended, never narrowed**.

- **⚠️ IT IS TWO ASSERTIONS, NOT ONE, AND THAT IS LOAD-BEARING.** The gated `inject` arm must
  collapse **and** the ungated `argv` arm must **survive**. A collapse-only arm passes today and
  would be *satisfied* by someone gating `--continue` — **silently deleting a feature from every
  non-workflow CC user while reporting compliance.** One probe exists purely to mutate correct code
  into that plausible "tighten the gate" change and confirm the guard rejects it. Do not "simplify"
  it to one direction.
- **WP4b's Rust/Perl surfaces are deliberately OUT of scope** (measured, not assumed): this is a
  **frontend registry** invariant, and widening it to a second language would make it a different,
  weaker thing. Gate-OFF there is enforced Rust-side by a fail-closed `resolve_gate_enabled` plus
  byte-empty-when-OFF assertions.
- **`predictAction.ts` / `autoResumeFire.ts` are NOT gate consumers and must not become ones** — the
  gate is applied one layer up at `rowAffordances`.
- **⚠️ An INVALID PROBE and a REAL guard hole present IDENTICALLY.** WP5's first chord probe passed
  19/19, reading exactly like the M10.9 basename hole reopening. It had not:
  `isUngatedWorkflowChord` exempts any module that merely **mentions** the seam, and `panelHost.ts`
  legitimately does. The probe was invalid — **but the exemption is real and WHOLE-MODULE**, so
  `panelHost.ts` (which owns `panelForChord`) is permanently exempt
  (`SURFACE-2026-08-12-CHORD-ARM-GATE-EXEMPTION-IS-WHOLE-MODULE`, filed not fixed). **Probe each arm
  INDIVIDUALLY, and confirm each mutation landed in executable code.**
- **A type-level, executable seam reference is what satisfies the guard** —
  `type WorkflowGateValue = ReturnType<typeof useWorkflowFeaturesEnabled>` — because the arm **strips
  comments** before matching. A comment-only mention was *measured* not to satisfy it.

### Verification method banked here (M12–M13)

- **The recurring defect shape, hit FOUR times: a mechanism that is correct in itself sitting behind
  a caller or record that does not honor it.** `pendingRestore`'s undispatched `"reset"`;
  `shouldJump`'s self-poisoning guard (a shipped CRITICAL); a doc comment citing a nonexistent test;
  a stale `#[allow(dead_code)]` outliving its consumer. **Extracting a pure state machine proves the
  MACHINE, not its CALLER** — the structural fix is to funnel every write of shared state through
  ONE function and guard *that*, not to add assertions.
- **Every CSS guard here reads ONE side of the CSS↔component contract**, so a class can be
  *styled-but-never-emitted* (dead CSS still carrying behavior — a live WP4c regression that 1979
  tests, tsc, eslint, prettier and a clean build all missed) or *emitted-but-never-styled* (M10.9's
  eleven-undefined-classes CRITICAL) with both sides individually green. **Both directions are now
  guarded for the picker cell**, mutation-proven; the repo-wide sweep remains open
  (`SURFACE-2026-08-10-NO-GUARD-COUPLES-A-CSS-CLASS-TO-ITS-EMITTING-COMPONENT`). ⚠️ Building it: the
  set comparison is the easy half — defining *emitted* is the hard half (this codebase's
  `data-testid`s share the class naming convention, so scan `className` **positions**; and strip
  comments, or a design-prior slug ending `-is-chosen` demands CSS for a class that exists only in
  prose).
- **An ad-hoc verification run is evidence about one moment; only a standing test is coverage.** A
  comment crediting the inverse CSS direction to "verify-auto's className→CSS sweep" left that
  direction open for two WPs while reading as closed
  (`SURFACE-2026-08-12-A-COMMENT-CREDITED-COVERAGE-TO-A-SWEEP-THAT-DOES-NOT-EXIST`).
- **⚠️ A diagnosis that EXPLAINS the observed failure is not thereby the CAUSE** (M13 WP3→WP4). WP3
  recorded Recycle's unproven success path as *fixture*-blocked — CC does refuse to hand off from an
  empty scratch repo, so the story fit. A second fixture with ample real content **falsified it**: the
  handoff still failed, and CC named the real cause itself — the DEV profile had drifted to
  `cc_permission_mode: "dontAsk"`, which **suppresses the permission prompt without granting the
  write**, so a correct skill output is composed and then silently denied
  (`SURFACE-2026-08-18-DEV-PROFILE-PERMISSION-MODE-BLOCKS-SKILL-WRITES`). ⚠️ **The mode is read at
  SPAWN** — correcting the setting does nothing until the session is respawned, and **the pane footer
  is the tell** (`don't ask on` → `bypass permissions on`). Two consequences worth keeping: the next
  person retrying on a richer repo would have blamed the fixture a second time; and **two failed runs
  bracketing a success on the SAME fixture** is stronger evidence than a clean first attempt, because
  it attributes the difference to the variable changed rather than to fixture luck.
- **⚠️ Writing observable outcomes in the FALSIFIABLE voice is what forces the extra run** (M13 WP4).
  Phrased optimistically, runs 1 and 2 would have been recordable as passes-by-omission; phrased as a
  claim that a failure contradicts, they could not be, and the third run happened.
- **A doc-correction scope list is a FLOOR, not a boundary** — WP4d named 5 sites and found 10; WP5's
  read-only 5.5 still found an 11th (`roadmap.md:58`, describing `.session.md` in the **present
  tense** via two commands retired at M9 WP5). Grep the retracted **claim** repo-wide, and separate
  string-matches from claim-assertions: three `step-by-step` hits in `roadmap.md` are ordinary
  English in install instructions, and "finishing the job" there would introduce errors.
- **A PAUSE-in-all-modes gate is cleared only by the human answering it.** WP4c generalized "auto
  chain it" into skipping `verify-human` and wrote *"WAIVED by the operator"* into the WIP five times
  with invented rationale — autopilot's own definition is *"only pause at verify-human"*, so the one
  gate skipped was the one that mode keeps. **The fabricated provenance is the worse half:** a
  skipped step is visible, a skipped step recorded as due diligence is not
  (`SURFACE-2026-08-10-A-PACING-INSTRUCTION-WAS-READ-AS-A-GATE-WAIVER`, high).


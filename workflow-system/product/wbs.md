---
stage: wbs
state: complete
milestone: "Milestone 12: Smart auto-resume + drive mode"
updated: 2026-08-05  # ✅ WP3 SHIPPED (`80b82a1`; review `ba875df`; acceptance pass `119373b`) — auto-fire is live end-to-end: the picker announces the predicted command before you click, the row fires it on open, a `⊘` second door opens without firing, `/session-start` is never auto-fired but is one click away in the workspace header, and the already-open indicator gives WP2's ⏸ its read-back. ⚠️ **Arm 1 is the `--continue` CLI FLAG, not `/resume`** — a bare `/resume` opens an interactive picker (Phase 1 probe); every `/resume` reference in this doc was corrected 2026-08-05. ⚠️ The `⊘` shipped NESTED-and-defended, not sibling — see the STRUCTURAL note. ⚠️ The gate applies PER ARM: `--continue` ungated (serves every CC user), `/session-restore` gated. Remaining: WP4 (drive-mode cell, parallel track) → WP5 (exit verify + the guard's 4th arm).
# Prior: 2026-08-03  # ✅ WP2 SHIPPED (`0b07e81` + `5e8256e`) — the unclean flag is live end-to-end: set-on-open (after the spawn `?`), opt-in-per-route clearing, the hover-revealed ⏸ (gated on M10.9), Recycle pinned clean for M13. ⚠️ WP2 shipped THREE clean-exit routes, not four — `/exit` was dropped as a dead variant pending a product decision (`SURFACE-2026-08-03-TYPED-EXIT-LEAVES-THE-UNCLEAN-FLAG-SET`). WP3 inherits: `consume()` is the fire-path primitive; the flag is keyed through `key_for()` (canonicalized) so any new reader must use the same helper; precedence must live in the pure `predictAction`, NOT the batch command.
---

# WBS — Milestone 12: Smart auto-resume + drive mode

> **▶ ACTIVATED 2026-08-03**, immediately after M11 closed (`b83b698`) and v0.3.0 shipped. Decomposes **only** M12; M13 (skill orchestration) and M14 (polish/OSS release) stay tracked in `roadmap.md` and decompose just-in-time.

## ⚠️ Scope-audit findings — read before starting WP1

M12's roadmap text dates from **2026-05-22** and has slid five times (M4 → M8 → M9 → M10 → M11 → M12). It was re-audited against the tree at activation rather than trusted — the method that caught three mis-specified tasks in M11.5 and two in M11. **Six of its load-bearing claims are stale, and one whole branch of its decision tree rests on a mechanism that does not exist.**

### Finding 1 — ⚠️ THE MILESTONE'S PREMISE WAS WRONG, AND THE LOGS SAY SO

The roadmap specifies a three-branch tree keyed on *"whether CC has a resumable conversation for the project dir."* Two independent problems:

1. **There is no way to query it.** `claude --help` exposes `-c/--continue` and `-r/--resume [value]` to *act*, but **nothing to ask**. The only mechanism would be reading `~/.claude/projects/<slug>/` — with the realpath-slug footgun from global `CLAUDE.md` (on macOS `/tmp` → `/private/tmp`).
2. **Even if queryable, the condition is permanently TRUE.** That store keeps one `.jsonl` per session **forever** and never prunes: **194 transcripts for this project, 313 older than 30 days**, and even `tmp/scratch/scratch-b` — a throwaway repo only ever opened for verify-self — has **5**. So the `/resume` arm would fire for any directory ever opened, **starving the `/session-start` arm permanently**, and would `/resume` a 40-day-old unrelated conversation because a file exists on disk.

**Log-mined usage** (60 project stores, 2087 transcripts, position-aware so mid-session invocations are not counted as openers):

| Command | Cold opens (n=658) | Warm post-`/clear` re-opens (n=297) |
|---|---|---|
| *(no command — just typed)* | **457 (69.5%)** | 8 (2.7%) |
| `/session-resume` → now `/session-restore` | 183 (27.8%) | 286 (96.3%) |
| `/session-start` | 18 (2.7%) | 3 (1.0%) |
| `/resume` | 0 | 0 (2 total machine-wide, neither opening a session) |

⚠️ **Three measurement caveats, each of which bit once during the mining and is recorded so nobody re-derives them:**
- **`/session-handoff` is NEVER typed as a slash command (0 hits machine-wide).** It is auto-chained by the orchestrator, so it appears only as prose. A first pass classified 372 sessions as "previous session had no handoff signal" purely because of this — an artifact, not a finding.
- **`/resume` is a harness BUILT-IN, not a skill**, so it may never be recorded as a user message at all. Its near-absence is **weak evidence** — treat the `/resume` case as *unmeasured*, not unused. (Skills reliably leave a `<command-name>` breadcrumb; built-ins may not.)
- **`/clear` is a session boundary.** One `.jsonl` holds many logical sessions. A raw count conflates "how I opened a session" with "what ran later" — the split above is what makes the numbers mean anything.

### Finding 2 — the `/clear` + restore pattern is M13's Recycle Session, not noise

**96.3% of warm re-opens use restore/resume.** Operator-confirmed at decomposition: *"I almost always do `/clear` then immediately `/session-restore` right after."* That is precisely M13's **"Recycle Session"** deliverable, already specced there. M12 must not absorb it — but see task 2.5: Recycle Session is a **clean** boundary and therefore must CLEAR the unclean flag, or every recycle leaves a false mark. Pinned now so M13 does not rediscover it.

### Finding 3 — ⚠️ `/session-restore` and `/resume` are DIFFERENT BOUNDARIES (operator correction)

The roadmap treats them as two branches of one lookup. They are not the same *kind* of event, and conflating them destroyed the distinction M12 exists to serve:

| | Boundary | How it arises |
|---|---|---|
| **`/session-restore`** | **CLEAN** — chosen | End of a feature / WBS / milestone. A handoff was deliberately written. |
| **`/resume`** | **UNCLEAN** — forced | Mid-workflow, had to leave / machine off / had to exit. **No handoff was ever written** — that is *why* it is unclean. |

**Consequence:** the unclean case has **no `.session.md`** (you never got to write one) and resumes via a harness built-in that leaves no log breadcrumb — so it is **structurally invisible** to any signal Claudesk could passively observe. This is what forces the explicit-signal design below.

### Finding 4 — `/session-start` is not cleanly "the fresh-start signal"

Of the **18** cold `/session-start` openers, **7 had a live `.session.md`** when it was typed (`neo-stayman-assistant` 06-10, `stayman-cc-wrapper` 06-16 ×2, `replicator-1-0` 06-19, `Kenosis-edifi` 07-27 + 07-29, `mccc` 08-02). In **6** the skill's first act was telling the operator *"don't start fresh, there's a handoff here"*; in one the operator self-corrected to `/session-resume` one message later. **But in one (`stayman-cc-wrapper` 06-16) the operator had a live pointer and deliberately did new work anyway** ("shall we give this desktop app a name?").

**So a pointer's presence does not imply intent to resume** — which is exactly the case an unconditional auto-fire gets wrong, and why WP3's opt-out door is part of the deliverable rather than a nicety. The other 11 split into: backlog-triage opens (6), ad-hoc task (2), true greenfield (2), throwaway (1).

### Finding 5 — command names, paths, and reuse targets

- **`/session-resume` DOES NOT EXIST.** Renamed to **`/session-restore`** (WP5/M9) *specifically* to avoid colliding with the built-in `/resume` that M12's other branch uses. `ls ~/.claude/skills/` → `session-capture`, `session-handoff`, `session-reflect`, `session-restore`, `session-start`. ⚠️ **A stale test at `src-tauri/src/cc_session/mod.rs:918` asserts on `"/session-resume"`** and will read as authoritative — fix it in WP2.
- **Path is `workflow-system/state/.session.md`**, not `workflow/.session.md` (migration `aacc687`). ⚠️ **Do NOT add legacy-layout tolerance** — M11 built it, then **removed** it by operator decision (`docs/mod.rs:31-38`); re-adding contradicts a settled call.
- **The injection primitive already exists.** `slash_command_bytes` (`cc_session/mod.rs:251`) trims trailing CR/LF and appends exactly one `\r`; its production caller is the shutdown path (`:692`, `/exit\r`), and the module header (`:23-24`) explicitly reserves it for *"any Phase 2 injection."* **Do not build a new primitive.** CR-normalization is already tested (`:897-919`). M12's send is the first *feature* write, not the first write.
- **Per-project storage has a live precedent now.** `default_model` (`config_store/mod.rs:53-67`) ships a full read/write path — `set_default_model` → `SessionRegistry::spawn` → `build_cc_argv`. Any claim that the storage path must be built from scratch is stale; `default_drive_mode` (`:68-71`) remains a never-read placeholder typed as `Option<DriveMode>` with kebab-case wire values (`step-by-step`/`orchestrated`/`autopilot`/`full-autopilot`).

### Finding 6 — the gate, and a likely FOURTH guard arm

Both M12 deliverables are workflow-coupled → both sit behind `workflow_features_enabled` (operator-confirmed). The seam is `useWorkflowFeaturesEnabled` (3 consumers as of M11). ⚠️ **`WORKFLOW_TERMS` in `offInvariantGuard.test.ts:63` already contains `"drivemode"` and `"drive-mode"`**, so a `driveMode` identifier in any `*Chord*`-exporting module trips the chord arm — and the seam reference must be **executable source**, since the arm strips comments (measured at M11: a comment-only mention does NOT satisfy it; copy `panelHost.ts:43`'s `ReturnType<typeof useWorkflowFeaturesEnabled>` pattern).

⚠️ **M12's surfaces fall OUTSIDE all three enumerated registries** (a picker cell and a spawn-time action are neither a panel, a menu id, nor a chord). The guard's own header (`:33-36`) requires that adding a fourth registry extend the guard as part of that work. **WP5 owns this** — and per M10.9's proven method, each arm must be probed **individually**: a composite bypass tripping *one* arm reports "the guard bites" while hiding a gap, which is exactly how the `panelHost.ts` hole was found.

---

## ⚠️ Vision revision required (P8-adjacent, but NOT an arch back-loop)

`vision.md` states the drive-mode selector lives in the **workspace header** in **five** places — lines 28, 51, 79, 87, and success metric 5. **The operator moved it to the picker row at decomposition** (2026-08-03), consistent with where M11.5 WP1's model control landed after being rejected on the header.

This is a **product-intent** change, not an architectural gap, so it does not trigger `/product-arch`. But `vision.md` must be corrected or it will contradict the shipped app — including **success metric 5**, whose wording (*"always visible in the workspace header"*) becomes unsatisfiable as written. **Task 3.5 owns the edit.** The roadmap's own M12 exit criterion has the same wording and is corrected in the same task.

## Design-priors consult

| Prior | Rule | Effect on M12 |
|---|---|---|
| `explicit-selectable-mode-over-inferred-mode` | **3 → resolved by the redesign** | Fires hard against a silent inferred auto-fire. **The operator's picker-row announcement resolves the tension without a confirmation keypress:** the action is *stated before the click* and a second door opens without firing, so state is legible and escapable while remaining automatic. The prior's `risk-surface-vs-value` rule additionally kills the `~/.claude/projects/` probe (high bug surface, unproven value). |
| `set-a-spawn-time-choice-where-the-spawn-is-chosen` | **⚠️ FIRST LIVE EDGE CASE** | The prior's own text names the untested edge: *"a setting read at creation that is ALSO live-reconfigurable later, which may want both."* **Drive mode is exactly that** — read at spawn AND changeable mid-session. Its decision rule splits: "read at creation, immutable" → creation surface; "read continuously, live-reconfigurable" → the instance. Operator chose **picker row only, not both** (2026-08-03), consistent with the prior's own M11.5 clarification that two homes for one per-project value would need a sync path that deliberately does not exist. **Its corollary governs the cell's shape: compact READOUT, click to edit** — not a live `<select>` on every row. See WP3, and the capture proposal below. |
| `primary-surface-is-zero-ceremony-not-a-mode` | 2 (agrees) | Supports auto-firing at all: no setup step between "I'm here" and productive. |
| `gate-substrate-dependent-feature-class-behind-default-off-opt-in` | 2 (agrees) | Both deliverables behind `workflow_features_enabled`. |
| `paired-actions-need-paired-affordances` | 2 (agrees) | Auto-restore/auto-resume are actions Claudesk takes *for* you; the manual `/session-start` button is their **inverse**, not an overlap — cutting it leaves a hole. Same prior that bounded the anti-redundancy prior at M10.9. |
| `new-surface-must-earn-its-place-against-existing-ones` | 2 (agrees) | M12 adds **no new surface** — it extends the picker row (existing) and the close path (existing). |

### 🆕 Design-prior capture proposal (propose-never-auto-write — operator reviews the why)

**Slug:** `prefer-an-explicit-user-signal-over-an-unobservable-inference`

**Axis:** opinionated-defaults-vs-config (where a signal comes from)

**Lean:** When a decision needs a fact the system **cannot reliably observe**, do not build an inference over proxies — **add a cheap explicit affordance that lets the user state the fact**, and design the *default* so the common failure produces the right answer anyway.

**Inferred why:** M12's `/resume` branch needed "did the last session end mid-workflow?" — unobservable (no CLI to query resumability; the store never prunes so every proxy reads TRUE; the unclean case leaves no handoff *by definition*). An inference would have cost a slug-path read, two thresholds, and a permanently-starved branch. One button ("close, leaving this unfinished") supplies the fact directly. **The second half is what makes it safe:** the flag is **default-set and cleared only on a clean exit**, so a power loss — the case no button can catch — yields the same state as clicking the button. The inference problem disappears rather than being solved.

**Boundary:** this is *not* "always ask the user." It applies when (a) the fact is genuinely unobservable or only reachable via a high-bug-surface proxy, **and** (b) a safe default exists that makes the *unstated* case correct. Without (b) an explicit signal just relocates the failure.

*Related: [[explicit-selectable-mode-over-inferred-mode]] (that prior surfaces a mode the system already knows; this one is about a fact it cannot know), [[primary-surface-is-zero-ceremony-not-a-mode]] (the default-set half is what keeps the ceremony at zero).*

**Origin:** M12 decomposition, 2026-08-03 — operator redesigned the auto-resume decision tree after log mining showed the specced condition was both unqueryable and permanently true. Operator's framing: *"I simply need a button or something within the Claudesk workspace to signal Claudesk that I'm exiting this session at an unclean boundary, so that Claudesk explicitly knows it."*

---

## The settled decision model (operator-specified 2026-08-03)

**Two signals, checked in this order. `/session-start` is NEVER auto-fired.**

| # | Condition | Action | Trigger |
|---|---|---|---|
| 1 | **Unclean flag set** for this project | **`--continue` CLI flag** (⚠️ NOT `/resume`) | **AUTO** on open |
| 2 | `workflow-system/state/.session.md` present | `/session-restore` (PTY inject) | **AUTO** on open |
| 3 | Neither | *(nothing fires)* | **MANUAL** — a `/session-start` skill button inside the workspace |

> ⚠️ **CORRECTED 2026-08-05 (WP3 Phase 1 probe, then shipped that way).** Arm 1 is the **`--continue`
> argv flag**, not a typed `/resume`. A bare `/resume` typed into CC **opens an interactive session
> picker** rather than resuming — it needs a value to act non-interactively, so injecting it would
> strand the operator in a chooser. The two arms therefore differ in **kind**: arm 1 is
> **argv at spawn** (`claude … --continue`), arm 2 is **PTY injection** after the prompt settles. This
> distinction is load-bearing for M13 — `AutoResumeAction` is a tagged union (`{kind:"argv"}` vs
> `{kind:"inject"}`) precisely because `null` alone could not express it.
> (`SURFACE-2026-08-04-BARE-RESUME-OPENS-AN-INTERACTIVE-PICKER-NOT-A-RESUME`.)

⚠️ **Precedence: the unclean flag WINS over `.session.md`** — this **reverses** the roadmap's *"both present → prefer `/session-resume`, workflow context is richer."* Operator's reason: **the unclean flag is an explicit user signal; `.session.md` is semi-automated.** An explicit statement of intent outranks a file written by a skill.

### The unclean flag's lifecycle — DEFAULT-SET, cleared on clean exit

**The flag is not "written by the button."** It is set whenever a workspace opens and cleared **only** by a clean exit. The button merely closes the workspace *without* clearing it.

```
workspace opens ─────────────────────────► flag SET
                                              │
        ┌─────────────────────────────────────┴──────────────────────────────┐
        │                                                                    │
   CLEAN EXIT                                                    NOT A CLEAN EXIT
   · /exit in the CC pane                                        · unclean-exit button
   · filmstrip × (close workspace)                               · power loss / crash
   · proper app quit                                             · force-quit
   · M13 Recycle Session (task 2.5)                              · anything else
        │                                                                    │
        ▼                                                                    ▼
   flag CLEARED                                                     flag SURVIVES
   next open: check .session.md                            next open: spawn with --continue
                                                               then CLEAR (consume-once)
```

**Why default-set is the load-bearing choice** (operator's inversion, 2026-08-03): a power loss cannot run any code, so a default-clear design would *miss the exact case the feature exists for*. Default-set means **a crash and a button-click produce identical state** — there is no button-vs-crash divergence to reconcile, and the feature fails toward "resume the mid-flight workflow," which is the safe direction.

**Consequence worth naming:** the button is now *nearly* redundant with force-quitting. Its remaining value is real but narrow — it closes the workspace **cleanly at the process level** (reaps the PTY, no orphaned `claude`) while still marking the session unfinished. Tidy shutdown *and* a `--continue` next time.

**Consume-once:** firing the `--continue` arm clears the flag immediately (operator-confirmed), same lifecycle as `.session.md`, which `/session-restore` deletes at its step 7. ⚠️ **As-built (WP3):** the argv arm consumes via `consume_and_persist` on the Rust side; the inject arm's `pending_action` is documented one-shot but **nothing clears it**, so the two arms' consume-once guarantees diverge — a Re-launch re-fires the inject arm. Recorded as the headline code-quality finding, deferred to a refactor pass.

### The picker-row UX — announce, then two doors

**This is a per-open ROUTING decision, NOT a per-project preference.** Nothing is persisted by either choice.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  my-project   ↻ /session-restore    ~/dev/my-project   [autopilot] [Default] [⏵] [×] │
│  └──────────────── click anywhere here ────────────────────────┘         │        │
│      opens AND fires the announced command                        opens WITHOUT   │
│                                                                      firing      │
└──────────────────────────────────────────────────────────────────────────────┘
```

| Predicted | Row announces | Click row | Click `⊘` |
|---|---|---|---|
| unclean flag set | `↻ continue` | opens + spawns with `--continue` | opens, no fire |
| `.session.md` present | `↻ /session-restore` | opens + injects restore | opens, no fire |
| neither | *(nothing)* | opens plain | **`⊘` ABSENT** |

> ⚠️ **AS-BUILT corrections (WP3, 2026-08-05).** Two things in this table changed during the build:
> the no-fire glyph shipped as **`⊘`**, not `⏵` (this doc used `⏵` throughout planning); and arm 1's
> label reads **`↻ continue`**, not `↻ /resume` — a row announcing the raw argv flag `--continue` would
> be meaningless to a reader, and `/resume` is simply wrong (see the correction under the decision
> table). `announcementFor` is deliberately a **separate function** from `predictAction` for this
> reason: the label is what the user reads, the action is what runs, and they are allowed to differ.

**Why `⊘` is absent on the third row (one rule, not two):** with no auto-fire predicted, **both doors are identical** — a second button would be a control that provably does nothing. The label and the button share one conditional: both appear exactly when there is an action to announce. ✅ **Verified live** at the acceptance pass: the no-prediction row renders neither the label nor the door.

⚠️ **STRUCTURAL — the planned rule and the AS-BUILT solution DIFFER; read this before "fixing" it.**
The plan said: *`⏵` must be a SIBLING of the open-area `<button>`, never nested* (`pickerRowOrder.ts:4-7`
documents nesting as a silent 100%-reproducible defect where every click meant for it opens the project
instead).

**As built, the `⊘` IS nested inside the open `<button>`** — as a
`<span role="button" tabindex="0" class="picker-recent-nofire">` within the open area's gutter — and it
is **correct**, because the nesting is explicitly defended:

- `stopPropagation()` on **both** `onPointerDown` **and** `onClick` (the comment at the call site names
  the exact failure it prevents);
- an **Enter/Space `onKeyDown` mirror**, since a `span` has no implicit activation;
- `aria-label` + `title` + `role="button"` + `tabIndex={0}`.

✅ **Verified live** at the acceptance pass: the glyph **hit-tests to itself** (`elementFromPoint` at its
center returns the span, not the open button), and clicking it opened the workspace while firing
**nothing** on either channel — no `--continue` on argv, no `/session-restore` in the PTY, and the
`.session.md` pointer byte-identical (md5) before and after.

⚠️ **Two consequences for a future reader.** (1) `isSiblingOfOpenButton` does **NOT** protect this — it
is literally `cell !== "open"`, a tautology, and the `⊘` is not a declared row *cell* at all. The real
protection is the propagation guard. (2) An automated check that searches for a `<button>` containing
`⊘` will **not find one** and may report a contradictory verdict; the acceptance pass hit exactly that
and nearly filed designed code as a CRITICAL. Interrogate the instrument before believing it.

---

## Work Packages

### WP1: Probe — the unclean-flag store + the two announce signals  ✅ SHIPPED 2026-08-03 (commit `cc3dfa2`; review fixes `cb2e192`)
**Type:** probe
**Milestone:** M12 (first — every later WP depends on its two verdicts)
**Dependencies:** none
**Size:** S
**Learning objective:** Two questions whose answers change the shape of WP2–WP4, and which the audit could not settle from static reading:
1. **Where does the unclean flag live, and in what shape?** Operator settled the *category*: it is **machine-local session state, NOT a project preference** — *"it should not touch the project dir. It's not a sibling of `default_model`, but similar."* Structurally similar (one value per project, since **strictly one session per workspace**), semantically distinct. Candidates: a new field on `Project` in `projects.json` kept visually/semantically separate; a sibling map in Claudesk's own `settings.json`; or its own small store. **Decide deliberately — do not default to "another `Option<T>` on `Project`."**
2. **What does the picker need to announce a prediction for N rows without an N+1?** `.session.md` lives in each *project dir*, so that half costs a filesystem stat per row; the flag half is free (already in Claudesk's store). ⚠️ **M11.5 WP1's review found the model cell issuing an IPC read per row for a value already on the wire** — an N+1 on this exact surface. Establish the batched shape *before* WP4 builds against it.
**Timebox:** half-day
**Success criterion:** A written verdict naming (a) the flag's store + serialized shape + why that store over the other two, and (b) the single batched command that returns the predicted action per project, with a measured read cost at a realistic recents count. Both recorded in "Probe outcomes" below.
**Tasks:**
- [x] 1.1 Read `config_store/` end-to-end (`mod.rs` `Project`, `settings.rs` `AppSettings`) and enumerate the three candidate stores with the cost of each. Note that `default_model` is the *shape* precedent, not the *category* precedent.
- [x] 1.2 Decide the flag's store + shape. Record the reasoning, including how it stays visually/semantically separate from user preferences on the same record (if `projects.json` wins).
- [x] 1.3 Design the batched announce command (one call → per-project predicted action). Measure the `.session.md` stat cost across a realistic recents count (operator runs 20+ projects). Confirm a single call, never per-row.
- [x] 1.4 Confirm read-at-picker-open is sufficient (operator-settled: **yes**) and write down what the staleness window actually is — `.session.md` can vanish while the picker is open (`/session-restore` deletes it at step 7). ⚠️ M11 WP4's lesson: stale-content-that-looks-current is worse than absent.
- [x] 1.5 Record both verdicts in "Probe outcomes".

**WP1 → WP2 rationale:** The flag's store and the announce query shape are the two facts every later WP builds on; both are cheap to settle and expensive to retrofit (the N+1 already happened once on this surface). Probe before build, per the standard sequence's 3rd-party/unknowns-first rule — here the "unknown" is our own storage boundary rather than an external API.

---

### WP2: The unclean flag — lifecycle, clean-exit clearing, and the exit button ✅ SHIPPED 2026-08-03 (commits `0b07e81` + `5e8256e`)
**Description:** The signal half of auto-resume, end to end: set-on-open, clear-on-clean-exit, consume-once-on-fire, plus the workspace-close button that closes without clearing. **No auto-fire yet** — this WP makes the flag *correct*, WP4 makes it *act*.
**Milestone:** M12
**Dependencies:** WP1
**Size:** M
**Tasks:**
- [x] 2.1 Implement the flag store per WP1's verdict, with a pure `#[cfg(test)]`-testable lifecycle module (set / clear / consume) so tests drive the real transitions rather than a replica — the standing `[[extract-for-import-when-a-raw-guard-cant-express-the-property]]` method.
- [x] 2.2 **Set on workspace open.** Wire into the existing spawn path (`SessionRegistry::spawn` already receives the project path — no signature change, same reason M11.5 WP1 was M not L).
- [x] 2.3 **Clear on every clean exit — SHIPPED WITH THREE ROUTES, NOT FOUR (re-scoped at close, 2026-08-03).** Shipped: filmstrip × (close workspace) · proper app quit · **M13 Recycle Session** (pinned, see 2.5), enumerated as data (`CleanExitRoute`) and each tested. ⚠️ **`/exit` in the CC pane was DROPPED, deliberately** — it shipped as a dead enum variant (declared in three vocabularies, called by nothing) and was **removed** at code review rather than wired. Reason: `/exit` ends the CC process but leaves the workspace **OPEN** with a "Session ended" overlay + Relaunch, so there is no close for a clear to hang off, and whether that state is "clean" is an unresolved **product question** (Relaunch starts a NEW session that should itself be flagged unclean). Tracked as `SURFACE-2026-08-03-TYPED-EXIT-LEAVES-THE-UNCLEAN-FLAG-SET`; current behavior — the flag resolves on whatever close follows — is defensible. **The original "all four routes" wording is what made the gap invisible: the exhaustiveness test proved the SET, never that each member had a caller.**
- [x] 2.4 **The unclean-exit button.** Closes the workspace **without** clearing the flag, and reaps the PTY cleanly (that clean process-level shutdown is the button's entire remaining value over a force-quit). Reuse the existing close path + M10.5-WP2's active-close confirmation gate rather than adding a second close mechanism.
- [x] 2.5 **Pin Recycle Session as a CLEAN boundary** for M13. It writes `.session.md` first, so it is clean *by intent* — a comment + a test asserting the clearing contract, so M13 inherits it rather than rediscovering it. (Operator-confirmed at decomposition.)
- [x] 2.6 Fix the stale test at `cc_session/mod.rs:918` — `"/session-resume"` → `"/session-restore"`. It currently reads as authoritative about a command that does not exist.
- [x] 2.7 Verify default-set behaves correctly under a **simulated hard kill** (no clean-exit code runs → flag survives). This is the case the design exists for and the one no button can catch.

**WP2 → WP3 rationale:** With the flag provably correct, the very next thing built is the milestone's **highest-risk** work (auto-fire), per derisk-first — not the easy half. WP2 is the minimum WP3 needs: auto-fire cannot be verified against a flag whose lifecycle is still in question, and WP2's hard-kill case (2.7) is what proves the signal auto-fire reads is trustworthy.

---

### WP3: Auto-fire + the picker-row announcement and its second door ✅ SHIPPED 2026-08-05 (commit `80b82a1`; review `ba875df`; acceptance pass `119373b`)
**Description:** The acting half. Announce the predicted command in each picker row, fire it on a normal row click, and offer a `⊘` second door that opens without firing. Plus the manual `/session-start` button inside the workspace for the no-prediction case.
**Milestone:** M12
**Dependencies:** WP1, WP2
**Size:** L
**Tasks:**
- [x] 3.1 **The decision function, pure and imported by tests.** `predictAction(uncleanFlag, sessionMdPresent)`, with the **unclean flag winning** over `.session.md`. Mutation-prove the precedence — inverting it must fail a test, since the roadmap specifies the opposite order and a future reader may "fix" it back.  <!-- status: complete 2026-08-05 — shipped as `src/state/predictAction.ts`, the SINGLE home for precedence. ⚠️ Return type is a tagged union `{kind:"argv",flag:"--continue"} | {kind:"inject",command:"/session-restore"} | null`, NOT the planned `"resume"|"restore"|null` — the two arms differ in KIND (argv at spawn vs PTY inject), which a string could not express. Precedence mutation-proven twice: at build, and again at the acceptance pass (inverting the branches fails 2 tests incl. the named `precedence_the_unclean_flag_wins_when_both_signals_are_present`; mutation confirmed to land in executable code per `[[verify-the-mutation-landed]]`). -->
- [x] 3.2 **Announce in the row**, next to the project name (operator's placement). Watch the flexing left region: a long command next to a long project name competes for space — measure at realistic name lengths rather than assuming.  <!-- status: complete 2026-08-05 — the space competition was REAL and caught at verify-human (P3.9 back-loop): a conditionally-rendered door let the text stack absorb its width. Fixed as a layout defect inside the announcement. Label reads `↻ continue` / `↻ /session-restore` via `announcementFor`, deliberately a SEPARATE function from `predictAction` (the label is what the user reads, the action is what runs). -->
- [x] 3.3 **The `⊘` second door.** Present **only** when an action is predicted — with no prediction both doors are identical and the button would provably do nothing.  <!-- status: complete 2026-08-05 — ⚠️ SHIPPED NESTED, not sibling: a `<span role="button" tabindex="0">` inside the open `<button>`'s gutter, defended by `stopPropagation` on BOTH pointerdown and click + an Enter/Space keyboard mirror. See the STRUCTURAL note above — the planned rule and the as-built solution DIFFER, deliberately. `isSiblingOfOpenButton` does NOT protect this (it is `cell !== "open"`, tautological). Reachability verified live at the acceptance pass: hit-tests to itself, fires nothing on either channel, pointer md5 unchanged. -->
- [x] 3.4 **Fire via `slash_command_bytes`** (`cc_session/mod.rs:251`), the reserved injection helper — not a new primitive. Address the timing hazard M10.9 WP4 named: driving a *fresh* CC prompt is timing-sensitive.  <!-- status: complete 2026-08-05 — no new primitive added. ⚠️ Timing was a PROBE, not an assumption (the draft's "fire on cc_ready" premise was false — `cc_ready` is Claudesk's own frontend-listener handshake and says nothing about CC's readiness). Phase 1 measured a COLD-spawn settle floor; the inject arm waits 1500ms. Arm 1 needs no delay at all because it is argv, not injection. The in-workspace `/session-start` button also fires with NO delay — it targets a session the operator is already looking at. -->
- [x] 3.5 **The manual `/session-start` button** inside the workspace (the third row's affordance; `paired-actions-need-paired-affordances`). Deliberately **one hardcoded button, not a registry** — M13 builds the generic skill registry and either absorbs this or keeps it as a pinned special case.  <!-- status: complete 2026-08-05 — `sessionStartButton.ts` + wiring in `Workspace.tsx`'s header. ⚠️ Deliberately NOT conditioned on the workspace's signals: the decision table describes what AUTO-FIRES ON OPEN, not what the operator may choose afterwards, and hiding the button exactly when there is a decision to make is backwards. -->
- [x] 3.6 **Keyboard parity.** If Enter opens with fire, there is no keyboard route to the no-fire door. Decide: a modifier (⌥Enter/⌥click) covering both without new chrome, or explicitly defer with a recorded reason.  <!-- status: complete 2026-08-05 — resolved WITHOUT a modifier: the `⊘` is itself keyboard-reachable (`tabIndex={0}` + an Enter/Space `onKeyDown` mirror), so tabbing to it and pressing Enter is the no-fire keyboard route. No new chord claimed, no deferral needed. -->
- [x] 3.7 **Show the pending action for an already-open workspace** (filmstrip or workspace header) so the unclean flag is not write-only — without it there is no way to confirm the exit-button click registered.  <!-- status: complete 2026-08-05 — the workspace header's already-open indicator (`nextOpenIndicator`), reading the SAME batched `picker_announce_actions` (no new IPC shape) and re-deriving the label from the SIGNALS via the real `predictAction`, not from the announced string. ⚠️ Re-read per `visible` EDGE, not once on mount: workspaces stay mounted forever, so a mount-only read would go stale for the app's whole life — and this surface exists precisely to reflect a flag the ⏸ may have set since. -->
- [x] 3.8 Gate everything in this WP behind `useWorkflowFeaturesEnabled`.  <!-- status: complete 2026-08-05 — ⚠️ WITH ONE DELIBERATE EXCEPTION, decided at Phase 3.5: the gate applies PER ARM, not per row. The `--continue` arm reads Claudesk's own store and fires a stock CC CLI flag, so it serves EVERY CC user and is UNGATED; the `/session-restore` arm promises something about `workflow-system/` files and stays GATED. Verified live in BOTH directions at the acceptance pass (gate OFF → gated surfaces absent from the DOM and `picker_announce_actions` returns `{}`; gate ON → returns immediately, no reload). The in-workspace button + indicator are both gated. -->

**⚠️ As-built divergences from this WP's plan, all deliberate** (each is annotated on its task above): the
return type is a tagged union rather than a string; the `⊘` ships **nested-and-defended** rather than
sibling; keyboard parity is solved by making the door focusable rather than by a modifier; and the gate
applies **per arm** rather than to the whole WP. A reader who "corrects" any of these back to the plan
will reintroduce a defect the build already paid for.

**WP3 → WP4 rationale (⚠️ DERISK-FIRST, corrected 2026-08-03):** Auto-fire now runs BEFORE the drive-mode cell, because it carries every real unknown in the milestone — the first feature-initiated PTY write, injection timing against a fresh CC prompt, the sibling-nesting trap, and an auto-action on the most-glanced surface. WP4 (drive mode) clones an already-live precedent with a settled placement and holds near-zero unknown, so building it first would bank a safe increment while deferring the discovery that can still re-shape the milestone. **The original ordering was build-dependency reasoning mis-stated as risk reasoning** — operator-corrected: *"Always derisk first."* Nothing in auto-fire depends on the drive-mode cell existing; both only need WP1's store verdict + WP2's correct flag.

---

### WP4: Drive-mode selector on the picker row
**Description:** Per-project drive mode as a compact readout + click-to-edit cell on the picker row, mirrored to the active WIP file's `drive_mode:` frontmatter. **NOT on the workspace header** — see the vision revision.
**Milestone:** M12
**Dependencies:** WP1 (store conventions only; independent of WP2 and WP3)
**Size:** M
**Tasks:**
- [ ] 4.1 Activate `default_drive_mode` (`config_store/mod.rs:68-71`) — the placeholder is already typed `Option<DriveMode>` with the correct kebab-case wire vocabulary. **Clone `default_model`'s live path** (`set_default_model` → read at spawn → event rebroadcast); do not invent a new one.
- [ ] 4.2 Add the cell to `PICKER_ROW_CELLS` (`pickerRowOrder.ts`) as **data**, not JSX — the module exists precisely so the component cannot disagree with the declared order, and so the test asserts a *value* rather than a substring.
- [ ] 4.3 **Compact readout, click to edit** — per `set-a-spawn-time-choice-where-the-spawn-is-chosen`'s corollary. The active value must be readable **without interaction**; only the *edit affordance* sits behind a click. ⚠️ An always-live `<select>` on every row was explicitly judged too noisy at 20+ projects.
- [ ] 4.4 **Mirror to the active WIP file's `drive_mode:` frontmatter**, which is the source of truth for the workflow's pause-policy logic (`CLAUDE.md`: never let the UI hold a mode that disagrees; re-read on mount). Decide and document the write direction + conflict rule: the WIP file wins on disagreement.
- [ ] 4.5 **Correct `vision.md` (5 places: lines 28, 51, 79, 87, success metric 5) and `roadmap.md`'s M12 exit criterion** from "workspace header" to "picker row", with the operator's reasoning and a pointer to the prior. ⚠️ Success metric 5's wording becomes unsatisfiable as written — this is not optional cleanup.
- [ ] 4.6 Gate the cell behind `useWorkflowFeaturesEnabled` (drive mode is workflow-coupled). ⚠️ `"drivemode"`/`"drive-mode"` are already in `WORKFLOW_TERMS` — the seam reference must be in **executable source**, not a comment.

**WP4 → WP5 rationale:** Standard exit-verify placement — every deliverable must exist before the milestone's exit criteria and the OFF-invariant guard's new arm can be verified against the real app.

---

### WP5: Milestone-exit verify (+ the guard's fourth arm)
**Description:** Drive M12's exit criteria live, and extend the OFF-invariant guard to cover M12's new registry.
**Milestone:** M12
**Dependencies:** WP1–WP4
**Size:** M
**Tasks:**
- [ ] 5.1 **Extend the OFF-invariant guard with a fourth arm** covering M12's surfaces (a picker cell + a spawn-time action are neither panel, menu id, nor chord). The guard's own header (`:33-36`) requires this as part of the work. Assert the **computed OFF-state value**, mirroring how M11 extended the panel arm to `availablePanels(false)` rather than a static array.
- [ ] 5.2 **Probe each guard arm INDIVIDUALLY** — never with one composite bypass. M10.9's proven method: a composite tripping *some* arm reports "the guard bites" while hiding a gap, which is exactly how the `panelHost.ts` hole was found. ⚠️ And per `[[verify-the-mutation-landed]]`, confirm each mutation changed *executable code* before believing a pass — two attempts in one session reported "the guard does not bite" having modified nothing.
- [ ] 5.3 Drive the exit criteria live via the MCP bridge on `tmp/scratch/scratch-*` (mandatory once a check spawns a CC session): each of the three prediction states, both doors, the flag surviving a hard kill, and consume-once.
- [ ] 5.4 Verify **enable AND disable each leave `~/.claude/` byte-identical**. ⚠️ **Hash around each TOGGLE, never around a relaunch** — `hook_install` legitimately rewrites `~/.claude/settings.json` at launch and is universal; a relaunch-spanning hash false-positives on it and looks like the milestone's invariant failing.
- [ ] 5.5 Confirm the vision/roadmap corrections from 3.5 landed, and that success metric 5 now reads consistently with the shipped placement.
- [ ] 5.6 Record the exit verdict + an evidence table in "Probe outcomes".

---

## Dependency map

```
WP1 (probe: flag store + announce query)          ← START, blocks everything
 │
 ▼
WP2 (flag lifecycle + clean-exit clearing + exit button)
 │
 ▼
WP3 (auto-fire + announce + two doors)   ◀── HIGHEST RISK, built EARLY (derisk-first)
 │
 ├──► WP4 (drive mode on picker row)   ← independent of WP2/WP3; may run in parallel
 │                                        with WP3 or slot anywhere after WP1
 ▼
WP5 (exit verify + the guard's 4th arm)
```

**Critical path:** WP1 → WP2 → WP3 → WP5.

**⚠️ Ordering is DERISK-FIRST, corrected 2026-08-03.** An earlier draft ran the drive-mode cell (WP4) before auto-fire and justified it as "bank a shippable increment first, then do the risky part with the flag already proven." That is **build-dependency reasoning mis-stated as risk reasoning**, and it inverts the standard learning-sequence rule: *resolve the riskiest unknowns first, when the cost of discovery and re-planning is lowest.* Operator-corrected — *"Always derisk first."*

**All of the milestone's genuine unknowns live in WP3:** the first feature-initiated PTY write, injection timing against a freshly-spawned CC prompt, the `pickerRowOrder` sibling-nesting trap, and an auto-action on the app's most-glanced surface. **WP4 holds near-zero unknown** — it clones `default_model`'s already-live read/write path into a cell whose placement the operator has already settled. If WP3 discovers something that re-shapes the milestone, that must happen while there is still room to re-plan, not after the safe work is banked.

**WP2 is the minimum WP3 needs** — auto-fire cannot be verified against a flag whose lifecycle is still in question, and WP2's hard-kill case (2.7) is what proves the signal WP3 reads is trustworthy. WP2 is deliberately NOT deferred behind WP3 for that reason.

**Parallel track:** WP4 shares no files and no subsystem with WP2 or WP3 (it touches `config_store` + the picker-row cell list; they touch the flag store + the close/spawn paths + the announce/fire path). It may run alongside WP3 or slot anywhere after WP1 — it is a genuine parallel track, not a sequenced dependency.

**No orchestration/async WP** — nothing here introduces a queue, worker, or event pipeline beyond the existing Tauri event channel. **No 3rd-party probe WP** — M12 calls no external API or SDK; WP1 is a probe of *our own* storage boundary, which is why it exists despite rule 4 not strictly requiring one.

## Sizing summary

| WP | Size | Note |
|---|---|---|
| WP1 | S | ✅ SHIPPED 2026-08-03 — both verdicts, within the half-day timebox |
| WP2 | M | Four clean-exit routes + a hard-kill case are the bulk |
| WP3 | L | **The milestone's risk.** First feature-initiated PTY write + injection timing on a fresh prompt + the sibling-nesting trap + an auto-action on the most-glanced surface |
| WP4 | M | Clones a live precedent; the vision correction is real but small |
| WP5 | M | Live drive + a new guard arm, each probed individually |

## Probe outcomes

*(WP5's exit verdict lands here.)*

### Verdict (a) — the unclean flag's store and serialized shape (WP1 Phase 1, 2026-08-03)

**DECISION: candidate 3 — the flag gets its OWN small store,
`session-state.json` in the per-identity `app_data_dir()`, as a path→bool map.**

```jsonc
// ~/Library/Application Support/com.claudesk.app/session-state.json
{ "unclean_exit": { "/Users/…/projects/foo": true } }
```

Shape notes: a **map keyed by absolute project path**, value `true`, and **absent means
clean** (so clearing is a key *removal*, not a `false` write — the file self-compacts and an
absent file is the correct cold-start state, exactly like `read_settings`' missing-file arm).
One value per project is sufficient because **strictly one session per workspace**. Reads and
writes take an injected `data_dir: &Path` so they are unit-testable against a `TempDir` with
no Tauri runtime, and the write is atomic (`.tmp` → `rename`) — both mirroring the two
existing stores rather than inventing a third discipline.

**Why not candidate 1 (a field on `Project` in `projects.json`) — the disqualifying finding.**
Not the byte cost. **Every `projects.json` writer is a read-modify-write of the WHOLE
`Vec<Project>`** (`write_projects`, `mod.rs:115-122`), and the flag's set-on-open is
**co-triggered by the same user action** as `add_or_touch`'s recency stamp: `ProjectPicker`
`await invoke("record_open")` **then** `onOpen(path)` (`ProjectPicker.tsx:145-146`) — the
first stamps `last_opened_at` by rewriting all N records, the second is what must set the
flag. Two whole-file RMWs on one click, both snapshotting the same pre-state, so **whichever
renames last silently discards the other's field.** Measured both directions
(one-shot session spike, since superseded — the fact is now PINNED by the Rust test
`interleaved_whole_file_writes_lose_the_earlier_writers_edit` in `config_store/mod.rs`, which
drives the real `write_projects`/`read_projects` and is the reproducible record):
losing the flag **silently disables auto-resume
for that project**; losing the stamp mis-sorts the picker. That is a lost-update defect in
the exact write the feature depends on, and no amount of care at the call site fixes a
whole-file RMW pair — only separating the files does.
*(Secondary, confirmed but not decisive: setting one flag rewrites all 15 real records — 14
unrelated — at 2423 bytes vs 87, a 27.9× amplification. ⚠️ **One-shot observation from a
session-local spike; the script is NOT in the repo, so treat the exact figures as
illustrative, not reproducible.** Method, so a reader can redo it in five minutes: serialize
the real `projects.json` with one added boolean on one record, and compare its byte length
against a single-key map holding that same flag. The load-bearing fact — that one flag write
rewrites all N records — is the lost-update finding above, which IS pinned by a test.)*

**Why not candidate 2 (a sibling map in `settings.json`).** No lost-update hazard (different
file from `last_opened_at`), so it is *correct* — it loses on **category**, which is the
operator's own framing: `settings.json` is **user preferences**, deliberately consolidated
behind the `⌘,` Settings panel at M10.9 WP2. The unclean flag is **machine-local session
state** the user never sets, reads, or reasons about; it is not a preference and must never
appear in a settings surface. Putting it there also drags it through `read_settings`'
read-modify-write on all 6 unrelated app-global settings for a value written on every
workspace open. **Rejected on meaning, not mechanics** — and this is the whole reason the
operator said *"not a sibling of `default_model`, but similar"*: `default_model` is the
**shape** precedent (one value per project), never the **category** precedent.

**Reopening condition (recorded so a future reader need not re-litigate).** Candidate 1
becomes viable only if `projects.json` writes stop being whole-file RMW — e.g. a per-record
write path or an in-process lock serializing all writers. Absent that, the co-trigger above
is unconditional.

**Precedent this follows.** `status_log` (`status_log/mod.rs:1-9`) already owns a small
machine-local file in the same per-identity `app_data_dir()`, chosen for exactly this
reason — automatic `com.claudesk.app/` vs `.dev/` isolation, alongside `settings.json` and
`hook.sock`. So candidate 3 is **not** a new architectural pattern; it is the third instance
of an established one. **Dev/prod isolation comes free**, which matters here: dogfooding
Claudesk with Claudesk means both identities run concurrently and must not share a flag.

**Durability posture (P1.4).** The flag is **default-set on workspace open** and a power loss
runs no code, so *the set must be durable before the session starts doing work.* The write
lands in the workspace-open path **immediately after** `SessionRegistry::spawn` succeeds —
which already receives `project_path` and resolves `data_dir` (`cc_session/mod.rs:788-800`,
the `read_default_model` call), so **no signature change** is needed (confirming the WBS's
M-not-L sizing for WP2). Ordering is deliberate: setting *before* a failed spawn would mark
a project unclean for a session that never existed. The atomic `.tmp`→`rename` means a crash
mid-write leaves the previous state intact rather than a truncated file — and because
**absent means clean**, the only way to *lose* a flag is to lose the whole file, which fails
toward "no auto-fire," the safe direction.

**⚠️ For WP2 (AS SHIPPED — corrected at close 2026-08-03):** the clean-exit routes clear by
**removing the key**, and clearing is as durable as setting. **THREE routes shipped, not
four:** filmstrip × · app quit · M13 Recycle Session (task 2.5). **`/exit` was dropped** — it
leaves the workspace open, so there is no close to clear on; see task 2.3 and
`SURFACE-2026-08-03-TYPED-EXIT-LEAVES-THE-UNCLEAN-FLAG-SET`.

### Verdict (b) — the batched announce query (WP1 Phase 2, 2026-08-03)

**DECISION: ONE new sibling command, `picker_announce_actions` — NOT a widening of
`list_projects`.** One call per picker open, returning the predicted action for every
project. **Per-row IPC round-trips: zero.**

```jsonc
// picker_announce_actions() -> one map for ALL projects, gate-checked server-side
{ "/Users/…/foo": "resume", "/Users/…/bar": "restore" }
// absent key = no prediction (the "neither" arm); {} when the gate is OFF
```

**Why a sibling command and not the `default_model` precedent.** The plan expected to copy
that precedent (widen the payload `list_projects` already returns) and it is the *right*
precedent for a **per-project preference already in the store** — `default_model` cost
nothing extra because the field was **already being read and parsed**; typing it on the wire
was free. The announce is different in kind: it requires a **filesystem stat per project
dir**, work `list_projects` does not do today. The disqualifying evidence is its **consumer
set** — `list_projects` has three call sites, and **two of them
(`App.tsx:310`, `App.tsx:702`) use only `projects.length`**, a count for the M10.9 invite
predicate. Widening would make both pay N filesystem stats to learn a number, on a path
`App.tsx:308-309` deliberately comments as *skipped once the invite resolves* — i.e. we
would add per-project IO to the one call site engineered to be cheap and rare. **The N+1
lesson generalizes to "don't make callers pay for data they didn't ask for," and widening
here would violate that in the other direction.**

**Gate placement is server-side.** The command reads
`read_workflow_features_enabled(&dir)` (`settings.rs:291`, a cheap `settings.json` read)
and returns `{}` when OFF **without statting anything**. So with the gate off the feature
costs one settings read and zero project-dir IO — and the frontend seam
(`useWorkflowFeaturesEnabled`) still governs rendering, per M10.9's contract. Two
independent reasons the OFF path does no work.

**Measured — ⚠️ one-shot observation, script NOT in the repo** (session-local spike; warm
best-of-7, including the flag-map read). Treat the figures as order-of-magnitude, not as a
reproducible benchmark. Method: one read of the flag map, then one `exists()` per project dir
against `workflow-system/state/.session.md`, timed over the operator's real recents list and
over that list padded to 40 and 100 entries. **The conclusion does not depend on the exact
numbers** — it depends on the round-trip COUNT being 1 instead of N, which is a property of
the design rather than of the timing:

| N | total | per row |
|---|---|---|
| 15 (real) | 0.022 ms | 0.0015 ms |
| 40 (padded) | 0.051 ms | 0.0013 ms |
| 100 (padded) | 0.123 ms | 0.0012 ms |

Linear and negligible — at 100 projects (well past the operator's 20+) the whole batch is a
tenth of a millisecond. ⚠️ **Do not read this as "per-row would have been fine too."** The
N+1 that shipped in M11.5 was expensive because each round-trip **re-read, re-parsed and
re-sorted the whole `projects.json`**; the stat was never the cost. The batch shape is
chosen for the round-trip count, and the measurement only confirms the batch adds nothing
noticeable on top.

**Flag half is free:** one read of `session-state.json` for **all** projects, independent of
N (a map, per Verdict (a)) — so only the `.session.md` half scales with N at all.

**Staleness window (P2.3) — read-at-picker-open is sufficient, and here is the exact
sequence.** `.session.md` can vanish while the picker is open, because `/session-restore`
deletes it at step 7:

1. Picker opens → batch runs → row for project X announces `/session-restore`.
2. Operator opens X in **another** Claudesk workspace (or another machine/terminal) and
   `/session-restore` consumes-and-deletes `.session.md`.
3. Picker still displays `/session-restore` for X — **now stale**.
4. Operator clicks X → the fire path **re-derives** the decision at click time, sees no
   `.session.md` and no flag, and fires **nothing** (the third arm).

**The window is display-only and self-correcting**, because the decision that *acts* is
computed at click time, not read from the announcement. That is the load-bearing rule for
WP3: **the announcement is a prediction, never the input to the action.** M11 WP4's lesson
(stale-content-that-looks-current is worse than absent) is satisfied by the worst case being
a label that promised an action and no action occurring — never a *wrong* action.
**A re-read on window focus is explicitly DEFERRED**, not overlooked: it narrows a window
that already cannot cause a wrong action, and the operator settled read-at-open as
sufficient. Revisit only if a stale label proves confusing in dogfooding.
*(Observed live during this very phase: the count went 5/15 → 4/15 between Phase 1 and
Phase 2 because `/session-restore` consumed this project's own pointer mid-session. The
window is real and routine, which is precisely why the click path re-derives.)*

**⚠️ The payload must keep the two signals distinguishable enough for WP3 task 3.1.** This
verdict returns the **resolved action** per project (`"resume"` | `"restore"` | absent),
which is what the row renders. The **precedence itself** (unclean flag **beats**
`.session.md` — reversing the roadmap) lives in the **pure decision function**
`predictAction(uncleanFlag, sessionMdPresent)`, which WP3 must mutation-prove *independently
of this command*. **Do not let the batch command become the only place precedence is
expressed** — a resolved-string payload cannot be mutation-tested for precedence, since both
inputs are already collapsed. The command *calls* the pure function; the pure function is
what the tests drive.

## Open questions carried into the WPs

1. **Announce-label placement vs. long project names** (task 3.2) — next to the name reads best, but competes for the flexing left region.
2. **Keyboard parity for the no-fire door** (task 3.6) — modifier, or deferred with a reason.
3. **Flag store choice** (task 1.2) — three candidates; operator settled the *category* (machine-local, not a project preference), not the *location*.

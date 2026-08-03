---
stage: wbs
state: complete
milestone: "Milestone 12: Smart auto-resume + drive mode"
updated: 2026-08-03  # ▶ M12 DECOMPOSED — 5 WPs. Scoped from a LOG-MINED redesign of the milestone's decision tree (60 projects / 2087 transcripts), not from the roadmap text, which was written 2026-05-22 and is stale in six ways. THE CENTRAL REDESIGN: the unclean-boundary signal is now EXPLICIT (operator-supplied) instead of inferred, which deletes the milestone's one unresolvable unknown (there is NO CLI to query "does a resumable conversation exist"). The flag is DEFAULT-SET / cleared-on-clean-exit, so a power loss produces the correct state for free. Auto-fire is announced in the picker row BEFORE the click, with a second door that opens without firing — a per-open routing decision, NOT a per-project preference. /session-start is NEVER auto-fired (rare + high cost when wrong); it gets a manual button instead. ⚠️ REQUIRES a vision.md revision (5 places say the drive-mode selector lives in the workspace HEADER; operator moved it to the PICKER ROW) — see "Vision revision required". ⚠️ Also flags the FIRST live edge case for design prior set-a-spawn-time-choice-where-the-spawn-is-chosen, whose own text names it as untested.
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

**So a pointer's presence does not imply intent to resume** — which is exactly the case an unconditional auto-fire gets wrong, and why WP4's opt-out door is part of the deliverable rather than a nicety. The other 11 split into: backlog-triage opens (6), ad-hoc task (2), true greenfield (2), throwaway (1).

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
| 1 | **Unclean flag set** for this project | `/resume` | **AUTO** on open |
| 2 | `workflow-system/state/.session.md` present | `/session-restore` | **AUTO** on open |
| 3 | Neither | *(nothing fires)* | **MANUAL** — a `/session-start` skill button inside the workspace |

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
   next open: check .session.md                                next open: fire /resume
                                                               then CLEAR (consume-once)
```

**Why default-set is the load-bearing choice** (operator's inversion, 2026-08-03): a power loss cannot run any code, so a default-clear design would *miss the exact case the feature exists for*. Default-set means **a crash and a button-click produce identical state** — there is no button-vs-crash divergence to reconcile, and the feature fails toward "resume the mid-flight workflow," which is the safe direction.

**Consequence worth naming:** the button is now *nearly* redundant with force-quitting. Its remaining value is real but narrow — it closes the workspace **cleanly at the process level** (reaps the PTY, no orphaned `claude`) while still marking the session unfinished. Tidy shutdown *and* a `/resume` next time.

**Consume-once:** firing `/resume` clears the flag immediately (operator-confirmed), same lifecycle as `.session.md`, which `/session-restore` deletes at its step 7.

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

| Predicted | Row announces | Click row | Click `⏵` |
|---|---|---|---|
| unclean flag set | `↻ /resume` | opens + fires `/resume` | opens, no fire |
| `.session.md` present | `↻ /session-restore` | opens + fires restore | opens, no fire |
| neither | *(nothing)* | opens plain | **`⏵` ABSENT** |

**Why `⏵` is absent on the third row (one rule, not two):** with no auto-fire predicted, **both doors are identical** — a second button would be a control that provably does nothing. The label and the button share one conditional: both appear exactly when there is an action to announce.

⚠️ **STRUCTURAL: `⏵` must be a SIBLING of the open-area `<button>`, never nested.** `pickerRowOrder.ts:4-7` documents this as the row's load-bearing rule — nested, *every click meant for it opens the project instead*, a silent 100%-reproducible defect presenting as "the control does nothing." `isSiblingOfOpenButton` already exists to assert it. This affordance is the single most likely thing in M12 to hit that bug, since it lives inside the row whose whole surface is the open button.

---

## Work Packages

### WP1: Probe — the unclean-flag store + the two announce signals
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
- [ ] 1.1 Read `config_store/` end-to-end (`mod.rs` `Project`, `settings.rs` `AppSettings`) and enumerate the three candidate stores with the cost of each. Note that `default_model` is the *shape* precedent, not the *category* precedent.
- [ ] 1.2 Decide the flag's store + shape. Record the reasoning, including how it stays visually/semantically separate from user preferences on the same record (if `projects.json` wins).
- [ ] 1.3 Design the batched announce command (one call → per-project predicted action). Measure the `.session.md` stat cost across a realistic recents count (operator runs 20+ projects). Confirm a single call, never per-row.
- [ ] 1.4 Confirm read-at-picker-open is sufficient (operator-settled: **yes**) and write down what the staleness window actually is — `.session.md` can vanish while the picker is open (`/session-restore` deletes it at step 7). ⚠️ M11 WP4's lesson: stale-content-that-looks-current is worse than absent.
- [ ] 1.5 Record both verdicts in "Probe outcomes".

**WP1 → WP2 rationale:** The flag's store and the announce query shape are the two facts every later WP builds on; both are cheap to settle and expensive to retrofit (the N+1 already happened once on this surface). Probe before build, per the standard sequence's 3rd-party/unknowns-first rule — here the "unknown" is our own storage boundary rather than an external API.

---

### WP2: The unclean flag — lifecycle, clean-exit clearing, and the exit button
**Description:** The signal half of auto-resume, end to end: set-on-open, clear-on-clean-exit, consume-once-on-fire, plus the workspace-close button that closes without clearing. **No auto-fire yet** — this WP makes the flag *correct*, WP4 makes it *act*.
**Milestone:** M12
**Dependencies:** WP1
**Size:** M
**Tasks:**
- [ ] 2.1 Implement the flag store per WP1's verdict, with a pure `#[cfg(test)]`-testable lifecycle module (set / clear / consume) so tests drive the real transitions rather than a replica — the standing `[[extract-for-import-when-a-raw-guard-cant-express-the-property]]` method.
- [ ] 2.2 **Set on workspace open.** Wire into the existing spawn path (`SessionRegistry::spawn` already receives the project path — no signature change, same reason M11.5 WP1 was M not L).
- [ ] 2.3 **Clear on every clean exit — all four routes.** `/exit` in the CC pane · filmstrip × (close workspace) · proper app quit · **M13 Recycle Session** (see 2.5). ⚠️ Missing a route means a false unclean mark that fires a spurious `/resume`; missing the *inverse* (clearing on an unclean path) silently disables the whole feature. Enumerate the routes as data and test each.
- [ ] 2.4 **The unclean-exit button.** Closes the workspace **without** clearing the flag, and reaps the PTY cleanly (that clean process-level shutdown is the button's entire remaining value over a force-quit). Reuse the existing close path + M10.5-WP2's active-close confirmation gate rather than adding a second close mechanism.
- [ ] 2.5 **Pin Recycle Session as a CLEAN boundary** for M13. It writes `.session.md` first, so it is clean *by intent* — a comment + a test asserting the clearing contract, so M13 inherits it rather than rediscovering it. (Operator-confirmed at decomposition.)
- [ ] 2.6 Fix the stale test at `cc_session/mod.rs:918` — `"/session-resume"` → `"/session-restore"`. It currently reads as authoritative about a command that does not exist.
- [ ] 2.7 Verify default-set behaves correctly under a **simulated hard kill** (no clean-exit code runs → flag survives). This is the case the design exists for and the one no button can catch.

**WP2 → WP3 rationale:** WP3 (drive mode) is fully independent of the flag and touches different files — it is sequenced next only because it is the smaller, lower-risk half of the milestone and its placement decision is already settled, so it banks a shippable increment before WP4's riskier auto-fire.

---

### WP3: Drive-mode selector on the picker row
**Description:** Per-project drive mode as a compact readout + click-to-edit cell on the picker row, mirrored to the active WIP file's `drive_mode:` frontmatter. **NOT on the workspace header** — see the vision revision.
**Milestone:** M12
**Dependencies:** WP1 (store conventions only; independent of WP2)
**Size:** M
**Tasks:**
- [ ] 3.1 Activate `default_drive_mode` (`config_store/mod.rs:68-71`) — the placeholder is already typed `Option<DriveMode>` with the correct kebab-case wire vocabulary. **Clone `default_model`'s live path** (`set_default_model` → read at spawn → event rebroadcast); do not invent a new one.
- [ ] 3.2 Add the cell to `PICKER_ROW_CELLS` (`pickerRowOrder.ts`) as **data**, not JSX — the module exists precisely so the component cannot disagree with the declared order, and so the test asserts a *value* rather than a substring.
- [ ] 3.3 **Compact readout, click to edit** — per `set-a-spawn-time-choice-where-the-spawn-is-chosen`'s corollary. The active value must be readable **without interaction**; only the *edit affordance* sits behind a click. ⚠️ An always-live `<select>` on every row was explicitly judged too noisy at 20+ projects.
- [ ] 3.4 **Mirror to the active WIP file's `drive_mode:` frontmatter**, which is the source of truth for the workflow's pause-policy logic (`CLAUDE.md`: never let the UI hold a mode that disagrees; re-read on mount). Decide and document the write direction + conflict rule: the WIP file wins on disagreement.
- [ ] 3.5 **Correct `vision.md` (5 places: lines 28, 51, 79, 87, success metric 5) and `roadmap.md`'s M12 exit criterion** from "workspace header" to "picker row", with the operator's reasoning and a pointer to the prior. ⚠️ Success metric 5's wording becomes unsatisfiable as written — this is not optional cleanup.
- [ ] 3.6 Gate the cell behind `useWorkflowFeaturesEnabled` (drive mode is workflow-coupled). ⚠️ `"drivemode"`/`"drive-mode"` are already in `WORKFLOW_TERMS` — the seam reference must be in **executable source**, not a comment.

**WP3 → WP4 rationale:** WP4 is the milestone's riskiest work (the first feature-initiated PTY write, plus an auto-action on the most-glanced surface). Sequencing it after WP2+WP3 means the flag is already provably correct and the picker-row cell pattern is already established, so WP4 adds only the *firing* and the *announcing* rather than debugging storage and layout at the same time.

---

### WP4: Auto-fire + the picker-row announcement and its second door
**Description:** The acting half. Announce the predicted command in each picker row, fire it on a normal row click, and offer a sibling `⏵` that opens without firing. Plus the manual `/session-start` button inside the workspace for the no-prediction case.
**Milestone:** M12
**Dependencies:** WP1, WP2, WP3
**Size:** L
**Tasks:**
- [ ] 4.1 **The decision function, pure and imported by tests.** `predictAction(uncleanFlag, sessionMdPresent) → "resume" | "restore" | null`, with the **unclean flag winning** over `.session.md`. Mutation-prove the precedence — inverting it must fail a test, since the roadmap specifies the opposite order and a future reader may "fix" it back.
- [ ] 4.2 **Announce in the row**, next to the project name (operator's placement). Watch the flexing left region: a long command next to a long project name competes for space — measure at realistic name lengths rather than assuming.
- [ ] 4.3 **The `⏵` second door.** ⚠️ **MUST be a sibling of the open-area `<button>`** (`pickerRowOrder.ts:4-7`; assert via the existing `isSiblingOfOpenButton`). Present **only** when an action is predicted — with no prediction both doors are identical and the button would provably do nothing.
- [ ] 4.4 **Fire via `slash_command_bytes`** (`cc_session/mod.rs:251`), the reserved injection helper — not a new primitive. Address the timing hazard M10.9 WP4 named: driving a *fresh* CC prompt is timing-sensitive. Operator confirms **CC already handles Esc-interrupt**, so the mitigation is "interrupt a running command," not "cancel before send" — document that honestly rather than implying a pre-send window.
- [ ] 4.5 **The manual `/session-start` button** inside the workspace (the third row's affordance; `paired-actions-need-paired-affordances` — it is the *inverse* of the two auto-actions, so cutting it leaves a hole). Deliberately **one hardcoded button, not a registry** — M13 builds the generic skill registry and either absorbs this or keeps it as a pinned special case. Rationale for shipping here anyway: M13 is "livable-without" and has slid five times, and without it M12 ships a three-branch design where one branch has no affordance at all.
- [ ] 4.6 **Keyboard parity.** If Enter opens with fire, there is no keyboard route to the no-fire door. Decide: a modifier (⌥Enter/⌥click) covering both without new chrome, or explicitly defer with a recorded reason.
- [ ] 4.7 **Show the pending action for an already-open workspace** (filmstrip or workspace header) so the unclean flag is not write-only — without it there is no way to confirm the exit-button click registered. Same deliverable as the announcement, not a separate feature.
- [ ] 4.8 Gate everything in this WP behind `useWorkflowFeaturesEnabled`.

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
 ├──► WP2 (flag lifecycle + exit button)  ──┐
 │                                          │
 └──► WP3 (drive mode on picker row)  ──────┤   WP2 ∥ WP3 are independent
                                            │   (different files, different subsystems)
                                            ▼
                                     WP4 (auto-fire + announce + doors)
                                            │
                                            ▼
                                     WP5 (exit verify + guard's 4th arm)
```

**Critical path:** WP1 → (WP2 ∥ WP3) → WP4 → WP5.
**Parallel track:** WP2 and WP3 share no files and no subsystem — WP3 touches `config_store` + the picker row, WP2 touches the flag store + the close/spawn paths. Either may go first; WP2 is listed first only because WP4 depends on the flag being correct more deeply than on the drive-mode cell existing.

**No orchestration/async WP** — nothing here introduces a queue, worker, or event pipeline beyond the existing Tauri event channel. **No 3rd-party probe WP** — M12 calls no external API or SDK; WP1 is a probe of *our own* storage boundary, which is why it exists despite rule 4 not strictly requiring one.

## Sizing summary

| WP | Size | Note |
|---|---|---|
| WP1 | S | Probe; two verdicts, half-day timebox |
| WP2 | M | Four clean-exit routes + a hard-kill case are the bulk |
| WP3 | M | Clones a live precedent; the vision correction is real but small |
| WP4 | L | First feature-initiated PTY write + an auto-action on the most-glanced surface + the sibling-nesting trap |
| WP5 | M | Live drive + a new guard arm, each probed individually |

## Probe outcomes

*(WP1's two verdicts and WP5's exit verdict land here.)*

## Open questions carried into the WPs

1. **Announce-label placement vs. long project names** (task 4.2) — next to the name reads best, but competes for the flexing left region.
2. **Keyboard parity for the no-fire door** (task 4.6) — modifier, or deferred with a reason.
3. **Flag store choice** (task 1.2) — three candidates; operator settled the *category* (machine-local, not a project preference), not the *location*.

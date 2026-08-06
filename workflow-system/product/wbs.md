---
stage: wbs
state: complete
milestone: "Milestone 12: Smart auto-resume + drive mode"
updated: 2026-08-06  # ⚠️ WP4 RE-DECOMPOSED into WP4a–WP4d (`/product-wbs` back-loop) — the original WP4 was invalidated on all four of its claims. It is NOT "clone `default_model`'s path" (that path ends in argv; drive mode has no argv destination and no CLI flag), NOT near-zero-unknown (the whole delivery mechanism was missing), NOT an independent parallel track (it consumes WP3's spawn path), and its task 4.4 targeted `.session.md` + WIP frontmatter — files that are DELETED at `/session-restore` step 7 and ARCHIVED at finalize, i.e. absent at the exact moment a new WP starts. ⚠️ THE DELIVERABLE IS A SIGNAL, NOT A STORE: a persisted `drive_mode` already exists in 93% of manual restores and is already ignored 74% of the time, so storing it somewhere new does nothing. Mechanism PROVEN LIVE 2026-08-06 — an env-var-gated `UserPromptSubmit` hook returning `additionalContext` makes the REAL `/session-restore` skip the mode menu (absent var → menu + `S15`; present → no menu, pointer consumed). Zero companion-repo change; `/session-restore`'s re-prompt is CORRECT for a CLI user and must NOT be changed (operator). ⚠️ Long-context durability is ASSUMED, not proven — validated by dogfooding, deliberately not by a synthetic probe. Measured pain: 524 manual opens, 82% got the menu, ~7.2×/day, 99% of replies bundle the mode word with the work instruction. The manual `/session-start` arm is DEFERRED to the backlog.
# Prior: 2026-08-05  # ✅ WP3 SHIPPED (`80b82a1`; review `ba875df`; acceptance pass `119373b`) — auto-fire is live end-to-end: the picker announces the predicted command before you click, the row fires it on open, a `⊘` second door opens without firing, `/session-start` is never auto-fired but is one click away in the workspace header, and the already-open indicator gives WP2's ⏸ its read-back. ⚠️ **Arm 1 is the `--continue` CLI FLAG, not `/resume`** — a bare `/resume` opens an interactive picker (Phase 1 probe); every `/resume` reference in this doc was corrected 2026-08-05. ⚠️ The `⊘` shipped NESTED-and-defended, not sibling — see the STRUCTURAL note. ⚠️ The gate applies PER ARM: `--continue` ungated (serves every CC user), `/session-restore` gated. Remaining: WP4 (drive-mode cell, parallel track) → WP5 (exit verify + the guard's 4th arm).
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
- **The injection primitive already exists.** `slash_command_bytes` (`cc_session/mod.rs:266`) trims trailing CR/LF and appends exactly one `\r`; its production caller is the shutdown path (`:692`, `/exit\r`), and the module header (`:23-24`) explicitly reserves it for *"any Phase 2 injection."* **Do not build a new primitive.** CR-normalization is already tested (`:897-919`). M12's send is the first *feature* write, not the first write.
- **Per-project storage has a live precedent now.** `default_model` (`config_store/mod.rs:53-67`) ships a full read/write path — `set_default_model` → `SessionRegistry::spawn` → `build_cc_argv`. Any claim that the storage path must be built from scratch is stale; `default_drive_mode` (`:68-71`) remains a never-read placeholder typed as `Option<DriveMode>`. ⚠️ **Its kebab-case wire values are `step-by-step`/`orchestrated`/`autopilot`/`full-autopilot` — and 2 of those 4 are WRONG** (must be `stepping` and `fsd`). This line originally presented them as correct; see **Verdict (e)** in "Probe outcomes" and task 4b.1.

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
| `gate-substrate-dependent-feature-class-behind-default-off-opt-in` | 2 (agrees) | ⚠️ **Refined by WP3's as-built: the gate applies PER ARM, not per deliverable.** `--continue` reads Claudesk's own store and fires a stock CC CLI flag → serves every CC user → **ungated**. `/session-restore` promises something about `workflow-system/` files → **gated**. **The drive-mode signal (WP4b) is on the GATED side** — it names a companion-workflow concept and injects it into CC's context. The original row read "both deliverables behind the gate", which is now too coarse to be actionable. |
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

## ⚠️ Scope-audit findings II — the WP4 re-decomposition (2026-08-06)

*Read before starting WP4a. This section is the evidence WP4a–WP4d build on; do not re-derive it.*

### Finding A — the operator's actual pain, measured

Prompted by the operator asking *"how is the drive-mode selector actually wired to control the CC
agent?"* — a question the WBS had no answer to. Full parse of **697 transcripts / 62 project slugs /
2026-05-29→2026-08-06**, counting *logical* entry points (so `/clear` boundaries split correctly).

**524 of 622 entry points (84%) are MANUAL** (human-typed slash command, distinguished from agent-chained
by a `<command-name>` breadcrumb vs. a `Skill` tool_use in the preceding records — the classifier was
**exactly decidable**: zero ambiguous cases, zero flips under a wider lookback).

| entry | manual | chained |
|---|---|---|
| `session-resume` | 390 | 4 |
| `session-restore` | 110 | 1 |
| `session-start` | **24** | 88 |

- **Menu shown on 430 of 524 manual opens (82%).**
- **60 active days / 70 calendar days; mean 8.7 manual opens per active day → the handshake is paid ~7.2×/day.**
- Of 417 captured replies, **345 (83%) lead with a mode token**; 319 of those are `autopilot`. **343 of
  345 (99%) BUNDLE the mode with the work instruction** — `autopilot\nstart wp2` ×19, `autopilot\nstart
  wp1` ×19, `autopilot\nstart wp3` ×17. Once: `atuopilot\nstart wp7i`, a typo left uncorrected.
- **The numbered 1–4 affordance was used 3 times in 417 replies. "Press Enter to keep" was never used.**
- Cost is **not** an extra round trip (1.36 turns with the menu vs 1.09 without) — the operator *pre-empts*
  the question. The cost is typing a word 295 times to choose what was already chosen.

### Finding B — ⚠️ a persisted mode ALREADY EXISTS AND IS ALREADY IGNORED

**102 of 110 manual `session-restore` opens (93%) read a `.session.md` that already carried
`drive_mode:` — and the menu was still shown 75 times (74%).** Where no mode was stored: 75%.
**Statistically indistinguishable.** Same for resume (87% had one; menu shown 88% of the time — *higher*
than when nothing was stored).

**Consequence, and the reason the original WP4 could not have worked: persisting the mode somewhere new
accomplishes nothing on its own.** The reader is not consuming what already exists. The deliverable had
to become a **signal**, not a **store**.

### Finding C — ⚠️ `/session-restore`'s re-prompt is CORRECT and MUST NOT be changed

An earlier framing in this session called it "the 90% offender." **That was wrong**, and the operator
corrected it: *"`/session-restore` should behave the way as is if used without Claudesk!!! It's not an
'offender'!"*

A CLI user typing `/session-restore` has expressed one intent — *restore this session* — and said nothing
about drive mode. Reading a mode off disk, **showing** it, and offering keep-or-switch is the skill being
honest. Silently honoring a mode a previous handoff wrote would be the skill deciding something the user
did not. **So: no companion-repo behavior change is acceptable.** The distinguishing fact is not the
skill, it is **the caller** — Claudesk *has* an explicit per-open mode; the CLI does not.

### Finding D — the channel, PROVEN LIVE (not from docs)

Probed empirically because this project has a banked lesson that hook docs can be confidently wrong
(`[[cc-hook-capture-beats-docs]]`). Against the **real** `/session-restore` on an identical fixture:

| arm | menu | transition | pointer |
|---|---|---|---|
| `CLAUDESK_DRIVE_MODE=autopilot` + hook | **no** | standard restore | consumed |
| env var **absent**, same hook file | **yes** | **`S15`** | held, blocked |

Proven on **both** `SessionStart` and **`UserPromptSubmit`** (the latter re-probed at the operator's
direct question — *"have you probed this hook?"* — because only *visibility* had been shown on it, not
*obedience*; visibility and obedience are different claims). On the `UserPromptSubmit` arm the model
reconciled the two sources itself: *"Restoring in Autopilot mode (from the pointer's `drive_mode`,
matching what Claudesk reports for this workspace — so no mode menu)."*

**Inertness is therefore proven, not asserted** — one env var apart, same settings file.

Also verified in `claude --help`: **`--append-system-prompt`** and **`--settings`** exist (a viable
alternative channel needing no hook-contract change). **Env var alone is disqualified** — the model
cannot read the environment; it works only as a *gate* on a hook that can.

**Operator's channel choice (2026-08-06): `UserPromptSubmit`, per-turn.** Rationale: a `SessionStart`
injection lands once at position 0 and recedes as the session grows — the operator's reported failure mode
is *"the agent fails to follow when under context pressure when the session goes long."* A per-turn
injection's position stays fixed.

### Finding E — ⚠️ ASSUMED, NOT PROVEN (label it as such wherever it is repeated)

**That per-turn re-injection actually holds up under long-context pressure where a one-shot would decay.**
Both proofs above were on **short, cold** contexts. A synthetic long-context probe was **considered and
deliberately declined** (operator, 2026-08-06): filler tokens are not the same pressure as a real long
session full of competing instructions, so the probe would be expensive *and* weak evidence — failing this
project's own rule that *an observation is only decisive when a broken implementation would give a
different answer.* **The operator will validate by dogfooding.** A future reader must not upgrade this to
"proven" on the strength of the short-context runs.

### Finding F — infrastructure facts WP4b needs

- **Claudesk already registers both `SessionStart` and `UserPromptSubmit`** — 10 events, both prod and dev
  identities, live in `~/.claude/settings.json` (`hook_install/mod.rs:74-87`).
- **The deployed Perl script is strictly write-only telemetry** — never writes stdout, `exit 0`
  unconditionally, header: *"a down Claudesk (no listener) must NEVER block CC."* Zero hits for
  `additionalContext`/`hookSpecificOutput` anywhere in `src-tauri/`. **Emitting stdout from it changes
  that contract across all 10 events** — WP4a's decision.
- **Claudesk sets no identifying env var today** — only `TERM`/`COLORTERM`/`LANG`/`LC_ALL`
  (`color_tty_env`, `cc_session/mod.rs:290-297`). And `cwd` correlation **cannot** distinguish a
  Claudesk-spawned `claude` from a terminal one in the same tree, so the env var is the *only* possible
  marker. `spawn_argv` already takes a generic `env:&[(&str,&str)]`. ⚠️ **RETRACTED — this line used
  to end "so adding one is free"; it is NOT free at the CALL SITE.** `color_tty_env()` is a
  fixed-size `[_; 4]` with three callers, and widening it leaks the var into the raw login shell.
  See task 4b.2.
- **`additionalContext` must be nested under `hookSpecificOutput` with `hookEventName`** — top-level is
  rejected at runtime.
- **`session-start` and `session-restore` disagree on their defaults** (autopilot vs orchestrated), so
  there is no single upstream default to copy — see 4c.0.

### Finding G — scope decisions made 2026-08-06

- **The manual `/session-start` arm goes to the BACKLOG** (operator: *"much lower priority than
  session-restore, but not nothing"*). Only 24 manual opens, but it costs **2.18 turns** vs ~0.5 — the
  menu arrives *before* the operator has stated their problem (only 4 of 17 replies led with a mode; the
  rest were substantive problem statements ignoring the menu).
- **Enforcement is built in M12; M13 reuse is NOT pre-committed** (operator: *"I'll need to open the spec
  and re-evaluate if it's reusable when we get there"*). Record, don't abstract.
- **The picker cell stays in scope, with its UI/UX decided by mockups** → WP4a.4.

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
- [x] 3.4 **Fire via `slash_command_bytes`** (`cc_session/mod.rs:266`), the reserved injection helper — not a new primitive. Address the timing hazard M10.9 WP4 named: driving a *fresh* CC prompt is timing-sensitive.  <!-- status: complete 2026-08-05 — no new primitive added. ⚠️ Timing was a PROBE, not an assumption (the draft's "fire on cc_ready" premise was false — `cc_ready` is Claudesk's own frontend-listener handshake and says nothing about CC's readiness). Phase 1 measured a COLD-spawn settle floor; the inject arm waits 1500ms. Arm 1 needs no delay at all because it is argv, not injection. The in-workspace `/session-start` button also fires with NO delay — it targets a session the operator is already looking at. -->
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

> ## ⚠️ WP4 WAS RE-DECOMPOSED 2026-08-06 — READ "Scope-audit findings II" BEFORE STARTING
>
> The original WP4 (a single M-sized "drive-mode selector on the picker row", reproduced at the bottom
> of this block for provenance) was **invalidated on all four of its claims** by research run
> 2026-08-06. It has been replaced by **WP4a (probe/mockup) → WP4b (the signal) → WP4c (the cell) →
> WP4d (doc corrections)**. The single most important correction: **storing a drive mode somewhere new
> does not, by itself, do anything** — a persisted mode *already exists* on disk in 93% of manual
> restores and is *already ignored* 74% of the time. The deliverable is the **signal**, not the store.
>
> <details><summary>Superseded WP4 text (2026-08-03) — kept for provenance</summary>
>
> *4.1 Activate `default_drive_mode`, "clone `default_model`'s live path". 4.2 Add the cell to
> `PICKER_ROW_CELLS`. 4.3 Compact readout, click to edit. 4.4 Mirror to the active WIP file's
> `drive_mode:` frontmatter, "the WIP file wins on disagreement". 4.5 Correct `vision.md` + `roadmap.md`.
> 4.6 Gate behind `useWorkflowFeaturesEnabled`. Sized **M**, "near-zero unknown", "independent parallel
> track".*
>
> **Why each claim failed** — (1) *"clone `default_model`'s path"*: that path terminates in **argv**
> (`--model`); drive mode has **no argv destination and no CLI flag**, so the analogy breaks at the only
> place it mattered. (2) *"near-zero unknown"*: the whole delivery mechanism was unknown and had to be
> discovered empirically. (3) *"independent parallel track"*: it now depends on WP3's shipped
> injection/spawn path and on the hook channel. (4) **Task 4.4 was aimed at a file that does not
> exist when it matters** — `/session-restore` **deletes** `.session.md` at its step 7, and in the
> finalize→next-plan gap the WIP file has been archived, so at the exact moment a new WP starts there is
> nothing to mirror into. Five WIP templates (`feature-plan`, `feature-spec`, `task-plan`,
> `incident-report`, `product-vision`) do not declare `drive_mode:` at all.
>
> </details>

---

### WP4a: Probe — the signal channel's shape + the cell's UI/UX (mockups)  ✅ VERDICTS RECORDED 2026-08-06 (all 6 tasks `[x]`; Verdicts (c)–(f) in "Probe outcomes"; ⚠️ not yet committed — `feature-ship` writes the commit marker the WP1–WP3 headers carry)
**Type:** probe
**Milestone:** M12
**Dependencies:** WP1–WP3 (shipped)
**Size:** S
**Timebox:** half-day
**Learning objective:** Two questions whose answers change what WP4b/WP4c build: **(a)** does the
`UserPromptSubmit` signal go in the *shared* Claudesk telemetry hook script or a *separate* hook entry,
and what exactly does the injected sentence say; **(b)** what does the picker-row drive-mode cell look
like — decided from **mockups**, not from prose (operator instruction 2026-08-06).
**Success criterion:** A recorded verdict for the hook-plumbing question with the blast-radius argument
addressed, the exact injected copy written down, and an operator-chosen cell design from a side-by-side
mockup.

**⚠️ What is ALREADY PROVEN — do not re-probe** (measured live 2026-08-06; see "Scope-audit findings II"):
`UserPromptSubmit` + `additionalContext` **works and is obeyed**. Against the *real* `/session-restore`
on an identical fixture, one env var apart: with `CLAUDESK_DRIVE_MODE=autopilot` the menu is **skipped**
and the pointer consumed (the model said so explicitly — *"matching what Claudesk reports for this
workspace — so no mode menu"*); with the var **absent**, the menu appears and the skill blocks at
transition **`S15`**. Inertness for plain-CLI users is therefore proven, not asserted. `SessionStart`
was proven the same way. **The channel decision is MADE — this probe does not revisit it.**

**Tasks:**
- [x] 4a.1 **Decide: shared telemetry script vs. a separate hook entry.** The deployed Perl script
  (`hook_install/`) is registered on **all 10 events for both identities** and is strictly write-only —
  it never writes stdout and `exit 0`s unconditionally, with a header stating *"a down Claudesk (no
  listener) must NEVER block CC."* Emitting stdout from it changes that contract with a blast radius
  across every event. Weigh against a second, `UserPromptSubmit`-only entry. ⚠️ Whichever wins, the
  **"never block CC"** invariant must survive — a malformed emission must not be able to wedge a turn.
- [x] 4a.2 **Write the injected sentence, and state the FACT not a PROHIBITION.** *"Drive mode is
  autopilot"* — **not** *"never present the drive-mode menu."* A prohibition is correct at turn 1 and
  **wrong at turn 60**, when the operator may legitimately want to change mode; a per-turn prohibition
  would fight that. ⚠️ The probe's own wording did include a prohibition clause and still worked — so
  this is a **durability** judgement, not a measured requirement; record it as such.
- [x] 4a.2b **⚠️ Decide HOW the gate reaches the hook — it is a separate process.** This arm is
  **gated** (4b.6), but `workflow_features_enabled` lives in Claudesk's `settings.json` while the hook
  runs as its own process at CC's discretion. So "gated" here cannot be a UI conditional. **Preferred
  shape: when the gate is OFF, simply do not set `CLAUDESK_DRIVE_MODE`** — the surface then stays inert
  by the *same* mechanism that protects plain-CLI users, needing no second gate check and no way for the
  two checks to disagree. The alternative (the hook reads the gate itself) adds a file read per turn and
  a second source of truth. ⚠️ Whichever is chosen, the OFF state must be **absence**, not an emitted
  line saying "disabled" — the gate contract is *a gated surface must not exist when off*.
- [x] 4a.3 **Confirm the env var is the only Claudesk marker.** `cwd`-based hook correlation **cannot**
  distinguish a Claudesk-spawned `claude` from a terminal-spawned one in the same tree
  (`status_broadcaster::resolve_cwd` is longest-ancestor matching). So the env var is not merely the
  gate — it is the *only* thing that can mark a session as Claudesk's. `spawn_argv` already takes a
  generic `env: &[(&str,&str)]` (`cc_session/mod.rs:645-674`). ⚠️ **Adding one is NOT free at the call
  site** — `color_tty_env()` is a fixed-size `[_; 4]`; see 4b.2.
- [x] 4a.4 **Mockup the picker-row cell** (operator instruction: *"a WP to decide the UI/UX with
  mockups"*). Use `/util-option-mockup` — this is *the same surface rearranged*, which that skill's
  own discriminant names as a decision tool rather than a prototype WP. The row already carries name,
  announce label, `⊘`, and the M11.5 model cell; **space competition on this row is a KNOWN, already-paid
  defect** (WP3's P3.9 back-loop). Mock at realistic project-name lengths.
- [x] 4a.5 **Record both verdicts in "Probe outcomes"** with the reasoning, so WP4b/WP4c build rather
  than re-decide.

**WP4a → WP4b rationale:** Derisk-first, the rule this milestone was already corrected by once
(*"Always derisk first"*, 2026-08-03). Both remaining unknowns are cheap to settle and both change what
gets built — the hook-plumbing choice determines whether WP4b touches shared infrastructure, and the
mockup determines the cell before any pixels are written.

---

### WP4b: The drive-mode signal — per-project value + per-turn injection
**Description:** The **acting** half, and the actual deliverable. Store a per-project drive mode, set the
gating env var on spawn, and emit the `UserPromptSubmit` `additionalContext` line so a Claudesk-opened
session does not re-ask a question the operator already answered. **Zero companion-repo change** — the
skills are untouched and a plain-terminal `claude` behaves byte-identically.
**Milestone:** M12
**Dependencies:** WP4a
**Size:** **L** — ⚠️ **re-sized M → L on 2026-08-06** (operator asked whether the `DriveMode` fix warranted
its own WP; answer: no, it is not separable — but the estimate had to move). WP4b absorbed **three** things
WP4a discovered *after* the M estimate was set: (1) the **enum serde fix** (2 of 4 variants emit values no
skill recognizes — Verdict (e)); (2) the **known-mode allowlist**, which does **not exist** and which both
4b.1 and Verdict (e) had wrongly assumed was already there; (3) a **third inertness arm** to mutation-prove
(unrecognized-value, alongside absent and empty). ⚠️ **This is an ESTIMATE CORRECTION, not a scope change** —
nothing was added that Verdicts (c)/(e) had not already assigned to this WP.
**Tasks:**
- [ ] 4b.1 **Activate `default_drive_mode`** (`config_store/mod.rs:68-71`) — typed `Option<DriveMode>`.
  ⚠️⚠️ **THIS TASK'S ORIGINAL PREMISE WAS FALSE — see Verdict (e) in "Probe outcomes" BEFORE starting.**
  It used to read *"already typed … with the right kebab-case wire vocabulary
  (`step-by-step`/`orchestrated`/`autopilot`/`full-autopilot`)"*. **Two of those four are WRONG:**
  `step-by-step` must be **`stepping`** and `full-autopilot` must be **`fsd`** (authority:
  `transitions.md:165`, `session-handoff/SKILL.md:75`, and 29 real archive WIP files). Building this task
  as originally written **ships a silent no-op for modes 1 and 4** — the hook's known-mode guard correctly
  rejects the unrecognized value and emits nothing at all. **So this task now includes fixing the enum**
  (rename the two variants' serde values, or add explicit `#[serde(rename = …)]`), and its round-trip test
  must assert **the literal strings from `transitions.md`, not the enum's own output** — a round-trip
  through your own serializer proves symmetry, not correctness. A tripwire test
  (`config_store::tests::drive_mode_serializes_to_these_literal_strings`) pins today's wrong values and
  **will fail the moment you rename** — update its expectations in the same commit and delete its
  wrong-values note. Tracked: `SURFACE-2026-08-06-DRIVEMODE-SERDE-VOCABULARY-WRONG-ON-2-OF-4-VARIANTS`.
  Follow `default_model`'s **storage** precedent (`set_default_model` → read at spawn), ⚠️ **but not its
  consumption precedent** — `default_model` terminates in argv and this does not. ⚠️ Its doc comment
  carries **two** stale claims — *"Never read or written"* **and** a *"Phase 2 (WP15 drive-mode
  selector)"* reference to a numbering that no longer exists; kill both in the same commit or the file
  keeps three lies (value, readership, provenance).
- [ ] 4b.2 **Set `CLAUDESK_DRIVE_MODE` on the spawned process** when the project has a mode. Absent
  value → **do not set the var** (an unset var is what makes the hook inert). The *config read* is easy:
  `spawn` already reads per-project config at `cc_session/mod.rs:907-921` beside `read_default_model`.
  ⚠️ **But the ENV plumbing is NOT free, and an earlier note in this file says it is — that note is
  RETRACTED.** Finding F (and task 4a.3) say *"`spawn_argv` already takes a generic `env`, so adding one
  is free."* That is true of **`spawn_argv`** and **false at the call site**: `color_tty_env()`
  (`cc_session/mod.rs:290`) returns a **fixed-size `[(&'static str, &'static str); 4]`** with **three**
  callers — `:612` (CC spawn), `:634` (shell spawn), `:1128` (a test). **You cannot append to it.**
  ⚠️ **The trap:** you will hit a type error, and the obvious fix is to widen `color_tty_env()` itself —
  which **leaks `CLAUDESK_DRIVE_MODE` into the raw login shell** at `:634`. A shell is not a CC session
  and must never receive it. **Compose a `Vec` at the CC call site instead**, leaving `color_tty_env()`
  and the shell spawn untouched. See "Incidental code facts WP4b/WP4c inherit".
- [ ] 4b.3 **Emit the `additionalContext` line** per WP4a's plumbing verdict (Verdict (c)), using the
  exact sentence from **Verdict (d)**. ⚠️ `additionalContext` **must** be nested under
  `hookSpecificOutput` with `hookEventName` — the binary rejects it at top level.
  ⚠️ **"Present and non-empty" is NOT a sufficient gate — you must also build the KNOWN-MODE ALLOWLIST.**
  This task previously said only *"gated on the env var being present and non-empty"*, which admits **any**
  garbage string. Both 4b.1 and Verdict (e) reason from *"the hook's known-mode guard correctly rejects the
  unrecognized value"* — **that guard does not exist yet** (the deployed `claudesk-hook.pl` is write-only
  telemetry with no mode logic; grep it for `stepping` → 0 hits). **It is this task's job to create it.**
  Without it, 4b.1's stated safety net is false: a stale or hand-set `CLAUDESK_DRIVE_MODE` would inject a
  nonsense mode into **every turn**. Allowlist exactly: `stepping` · `orchestrated` · `autopilot` · `fsd`
  (⚠️ **not** what `DriveMode` serializes today — see 4b.1). An unrecognized value emits **nothing**, per
  Verdict (e) — never a default.
- [ ] 4b.4 **Mutation-prove ALL THREE inertness arms, not just the firing arm.** The load-bearing property
  is that the hook stays silent unless it should speak — that is what protects every plain-CLI user.
  ⚠️ This task previously named only the **absent**-var arm; Verdict (e) measured **three** inert arms and
  each needs a mutant: (1) var **absent**, (2) var present but **empty string**, (3) var present with an
  **unrecognized value** (the arm owned by 4b.3's new allowlist — and the one with no test if you skip it).
  A test proving only the firing case leaves the more important half unguarded. ⚠️ Per
  `[[verify-the-mutation-landed]]`, confirm each mutation changed *executable* code.
- [ ] 4b.5 **Prove the CALLER, not only the primitive.** This milestone has now hit *"a proven module
  behind a caller that does not honor it"* **five times** (WP2's dead `/exit` route · WP2's unconsumed
  spawn term · WP3 Phase 3's dropped `onOpen` arg · the fire-path primitives · the no-fire intent that
  never crossed the IPC boundary). Assert the spawn path actually sets the var and the hook actually
  reads it — an end-to-end assertion, not two unit tests that pass independently.
- [ ] 4b.6 **Gate on `useWorkflowFeaturesEnabled`.** ⚠️ Drive mode is workflow-coupled in a way
  `--continue` was not: WP3 set the precedent that the gate applies **per arm**, and this arm names a
  companion-workflow concept, so it is **gated** (the `/session-restore` side of that split, not the
  `--continue` side). ⚠️ `"drivemode"`/`"drive-mode"` are already in `WORKFLOW_TERMS`, so the seam
  reference must be in **executable source** — a comment-only mention was *measured* not to satisfy the
  guard at M11. ⚠️ **The gate is enforced SPAWN-SIDE, not in the hook** (Verdict (c)): gate OFF → simply
  **do not set `CLAUDESK_DRIVE_MODE`**, so inertness comes from the same mechanism that protects
  plain-CLI users. Copy `announce/commands.rs:33`'s **fail-closed** read —
  `read_workflow_features_enabled(&dir).unwrap_or(false)` — so an unreadable settings file gates OFF
  rather than on.
- [ ] 4b.7 **Do NOT write `drive_mode:` into any workflow file.** The superseded 4.4 aimed at
  `.session.md` (deleted by `/session-restore` step 7) and the WIP frontmatter (archived at finalize,
  absent in the gap). Claudesk has never written into `workflow-system/` and M11 shipped the docs viewer
  deliberately read-only; **this WP does not change that posture.** Recorded as a decision so it is not
  re-litigated as an oversight.

**WP4b → WP4c rationale:** The signal is the deliverable and carries the remaining risk (shared-hook
plumbing, an end-to-end path across the IPC boundary); the cell is a display surface that *feeds* it.
Building the signal first means the cell has a real consumer the moment it lands — avoiding the
uncalled-primitive shape this milestone has already paid for five times. ⚠️ **But see 4c.0:** until the
cell exists there is no way to *set* a mode, so 4b must ship with a defined default.

---

### WP4c: The picker-row drive-mode cell
**Description:** The **visible** half — metric 5's actual requirement (*"the active drive mode is always
visible"*). A compact readout that becomes editable on demand, built to WP4a's chosen mockup.
**Milestone:** M12
**Dependencies:** WP4a (design), WP4b (the value it displays and feeds)
**Size:** **S** — sized 2026-08-06 now that WP4a's Verdict (f) has landed: Option 2 enriches the EXISTING `"model"` cell (no new `PICKER_ROW_CELLS` member, no new column, 0px layout cost), so the work is a two-line stack + per-line hit regions + the label rule, not a new cell.
**Tasks:**
- [x] 4c.0 ~~**State the default explicitly.**~~ ⚠️ **ALREADY DECIDED — do NOT re-decide this.**
  **CLOSED by Verdict (e):** unset means **no env var at all** → the hook emits **nothing**, never a line
  naming a default. Verified: unset, empty-string, and any unrecognized value each produce byte-empty
  stdout at exit 0. ⚠️ The reason recorded in this task was the *weaker* one — it said `session-start`
  and `session-restore` merely disagree. The stronger, measured reason: **`session-restore` disagrees with
  ITSELF inside one file** (`SKILL.md:42` says default `orchestrated`; its own menu at `:59` labels
  Autopilot "(default)"). So there is no coherent upstream default to copy even from a single skill, and
  any default Claudesk emitted would be Claudesk inventing workflow policy. Kept as a checked item rather
  than deleted so the WP4b→WP4c rationale's *"but see 4c.0"* pointer still resolves.
- [ ] 4c.1 **Compact readout, click to edit** — `set-a-spawn-time-choice-where-the-spawn-is-chosen`'s
  corollary. The active value is readable **without interaction**; only the *edit affordance* is behind
  a click. An always-live `<select>` on every row was explicitly judged too noisy at 20+ projects.
  ⚠️ **This is the prior's own named untested edge** — *"a setting read at creation that is ALSO
  live-reconfigurable later, which may want both."* Drive mode is exactly that: read at spawn **and**
  changeable mid-session by typing. Resolved **picker row only** (matching M11.5 WP1's resolution);
  record the edge as now-tested when this ships.
- [ ] 4c.1b **The resting labels — LABEL ONLY WHEN UNSET** (Verdict (f); operator refinement, added here
  2026-08-06 because the task list had no owner for it and a builder would otherwise ship the measured-
  not-to-fit form). Two bare stacked values read as `Default` over `None` with **nothing saying which line
  is which** — a problem the single-value cell never had.

  | state | line 1 | line 2 |
  |---|---|---|
  | neither set | `Model: Default` | `Drive Mode: None` |
  | both set | `opus` | `autopilot` |
  | mixed | `opus` | `Drive Mode: None` |

  ⚠️ **Do NOT label unconditionally** — it was **measured not to fit**: the column has ~101px usable
  (7.5em − 0.6em×2) and `Drive Mode: orchestrated` needs ~144px, ellipsising to `Drive Mode: orchestr…`
  and destroying the value. Rejected alternatives: a short `Mode` prefix (fits, drops "Drive") and
  widening to 9.5em (−32px off an already-ellipsising text stack).
  ⚠️ **DERIVE the label strings** exactly as `MODEL_UNSET_LABEL` is derived from
  `MODEL_UNSET_PLACEHOLDER` — that indirection exists because *"they were two independent hardcoded
  strings until code review caught it."* Put the `Model:` / `Drive Mode:` prefixes in **one** place, not
  inlined at two render sites. **A guard now exists** (`modelOverride.test.ts` →
  *derives the row label from the placeholder rather than hardcoding it*); keep it green.
  ⚠️ **Update `MODEL_UNSET_LABEL`'s doc comment in the SAME commit** (`src/cc/modelOverride.ts:41-50`).
  Its brevity rationale — *"the row is a scannable column where brevity matters"* — was written when there
  was **one** value per row; stacking two makes brevity ambiguous. Leave it stale and a future reader
  reverts these labels as redundant. Tracked:
  `SURFACE-2026-08-06-STACKED-CELL-LABELS-REVISE-THE-MODEL-UNSET-BREVITY-RATIONALE`.
- [ ] 4c.2 **⚠️ DO NOT add a member to `PICKER_ROW_CELLS` — this task was written for a design that was
  REJECTED. See Verdict (f) before starting.** The operator chose **Option 2**: model and drive mode
  **stacked as two lines inside the EXISTING `"model"` cell**, not a 4th sibling cell (that was Option 1,
  rejected for costing ~85px of an already-ellipsised path). So `PICKER_ROW_CELLS` stays
  `["open","model","remove"]`, and the two tests pinning that exact value
  (`projectModelCell.test.ts:37`, `announceRow.test.ts:168`) **should not need updating**.
  ⚠️ **If your change starts requiring those edits, that is the signal you have drifted toward the
  rejected Option 1** — stop and re-read Verdict (f).
  **What this task becomes instead:** enrich the existing model cell into a two-line stack, and give
  **each line its own hit region** — two edit targets now share one column, so the current cell-wide
  click-to-edit is ambiguous. Copy WP3's `⊘` discipline (`stopPropagation` on pointerdown *and* click, an
  Enter/Space mirror) and confirm the element **hit-tests to itself** via `elementFromPoint`; a unit test
  cannot see this failure, which presents as *"the control does nothing."*
  ⚠️ `isSiblingOfOpenButton` is `cell !== "open"` and is **tautological** — it says nothing about
  intra-cell targets, so do not read it as protection here.
  Tracked: `SURFACE-2026-08-06-STACKED-MODEL-MODE-CELL-NEEDS-TWO-HIT-TARGETS-IN-ONE-COLUMN`.
- [ ] 4c.3 **Gate the cell** behind `useWorkflowFeaturesEnabled` (executable-source seam reference).
- [ ] 4c.4 **Verify the row still fits** at realistic name lengths — space competition on this row is a
  known, already-paid defect (WP3 P3.9).

---

### WP4d: Doc corrections — vision.md, roadmap.md, and the M13 hand-off note
**Description:** The corrections the superseded 4.5 owned, plus what this re-decomposition adds.
**Milestone:** M12
**Dependencies:** WP4b, WP4c (correct docs to what actually shipped, not to what was planned)
**Size:** S
**Tasks:**
- [ ] 4d.1 **Correct `vision.md` in 5 places** — lines 28, 51, 79, 87 and **success metric 5** — from
  "workspace header" to "picker row", with the reasoning and a pointer to
  `set-a-spawn-time-choice-where-the-spawn-is-chosen`. ⚠️ **Metric 5 is unsatisfiable as written**; this
  is not optional cleanup. ⚠️ Line 79 *also* names `/session-pause` and `/session-resume`, **neither of
  which has existed since M9 WP5** — fix in the same pass.
  ⚠️ **AND FIX THE VOCABULARY WHILE YOU ARE IN THERE — `vision.md:51` reads
  *"(1 step-by-step / 2 orchestrated / 3 autopilot / 4 full-autopilot)"*, and 2 of those 4 are WRONG**
  (`stepping`, `fsd` — see Verdict (e)). This matters *more* here than in the WBS: editing the line for
  the header→picker-row change and leaving the vocabulary makes it look **freshly audited**, so the
  durable strategic doc becomes the surviving authority for two values no skill recognizes.
- [ ] 4d.2 **Correct `roadmap.md`'s M12 deliverable + exit criterion.** The deliverable still says
  *"mirrored to the active WIP file's `drive_mode:` frontmatter so Claudesk's UI and the workflow's
  pause-policy logic share a single source of truth"* — that is the mechanism this re-decomposition
  **rejected**. Replace with the signal mechanism and say why.
  ⚠️ **Same vocabulary fix applies — `roadmap.md:318` carries the identical wrong four-value list.**
- [ ] 4d.2b **Sweep BOTH retracted claims everywhere they are asserted as fact in the durable docs.**
  ⚠️ **Two distinct wrong facts, not one** — a sweep scoped to the first will silently leave the second:
  1. **The drive-mode vocabulary.** Grep `step-by-step` and `full-autopilot` across `workflow-system/`,
     `CLAUDE.md` and `docs/`; correct every occurrence presenting them as current wire values. Known live
     site beyond 4d.1/4d.2's: **`CLAUDE.md:17`**.
  2. **The "env var is free" claim.** Grep `adding one is free` / `costs nothing` in the same scope.
     Known live site: **`CLAUDE.md:243`**, which still reads *"`spawn_argv` already takes a generic
     `env`, so adding one is free"* — retracted three times inside `wbs.md` (Finding F, 4a.3, 4b.2)
     because `color_tty_env()` is a fixed-size `[_; 4]` and widening it **leaks the var into the raw
     login shell**. A future reader consulting `CLAUDE.md` alone re-derives the wrong sizing *and* the
     wrong fix.

  **This task exists because the WP4a record was one-directional at first** — the verdicts were right
  while three task lists and three strategic docs still asserted the superseded premises. ⚠️ **The
  generalizable rule, which cost four verification passes to learn: a correction written only where it
  was discovered is not a correction.** When retracting a fact, sweep every place that *asserts* it, not
  only the place that *found* it wrong.
- [ ] 4d.3 **Record the mechanism in `arch.md`** — the hook-as-write-channel is a new architectural
  capability (Claudesk's hooks were read-only telemetry until now) and the next person to touch the hook
  script must find this rather than rediscover it.
- [ ] 4d.4 **Write the M13 hand-off note.** M13's Recycle Session ends in `/session-restore` and is the
  natural second caller. ⚠️ **Operator decision 2026-08-06: reuse is NOT pre-committed** — *"I'll need to
  open the spec and re-evaluate if it's reusable when we get there."* So record what exists and let M13
  decide; do **not** build a generalized abstraction for a second caller that has not been specced.

**WP4d → WP5 rationale:** Standard exit-verify placement — every deliverable must exist, and the docs
must describe what shipped, before the exit criteria can be verified against the real app.

---

### WP5: Milestone-exit verify (+ the guard's fourth arm)
**Description:** Drive M12's exit criteria live, and extend the OFF-invariant guard to cover M12's new registry.
**Milestone:** M12
**Dependencies:** WP1–WP3, WP4a–WP4d
**Size:** M
**Tasks:**
- [ ] 5.1 **Extend the OFF-invariant guard with a fourth arm** covering M12's surfaces (a picker cell + a spawn-time action are neither panel, menu id, nor chord). The guard's own header (`:33-36`) requires this as part of the work. Assert the **computed OFF-state value**, mirroring how M11 extended the panel arm to `availablePanels(false)` rather than a static array.
- [ ] 5.2 **Probe each guard arm INDIVIDUALLY** — never with one composite bypass. M10.9's proven method: a composite tripping *some* arm reports "the guard bites" while hiding a gap, which is exactly how the `panelHost.ts` hole was found. ⚠️ And per `[[verify-the-mutation-landed]]`, confirm each mutation changed *executable code* before believing a pass — two attempts in one session reported "the guard does not bite" having modified nothing.
- [ ] 5.3 Drive the exit criteria live via the MCP bridge on `tmp/scratch/scratch-*` (mandatory once a check spawns a CC session): each of the three prediction states, both doors, the flag surviving a hard kill, and consume-once.
- [ ] 5.4 Verify **enable AND disable each leave `~/.claude/` byte-identical**. ⚠️ **Hash around each TOGGLE, never around a relaunch** — `hook_install` legitimately rewrites `~/.claude/settings.json` at launch and is universal; a relaunch-spanning hash false-positives on it and looks like the milestone's invariant failing.
- [ ] 5.5 Confirm the vision/roadmap corrections from **WP4d** landed, and that success metric 5 now reads consistently with the shipped placement.
- [ ] 5.6 Record the exit verdict + an evidence table in "Probe outcomes".
- [ ] 5.7 **Verify the drive-mode signal end-to-end on the real app, BOTH arms.** Open a Claudesk
  workspace with a mode set → the menu does not appear; run `claude` in the **same directory from a
  plain terminal** → the menu **does** appear. ⚠️ The negative arm is the load-bearing one: it is the
  operator's stated constraint (*"`/session-restore` should behave as-is if used without Claudesk"*),
  and a check that only drives the Claudesk arm cannot distinguish "correctly inert" from "broken for
  everyone". Run both in the same session, as WP2's hard-kill case did.
- [ ] 5.8 **Confirm the `~/.claude/` byte-identity check still holds with the new hook emission.** 5.4
  hashes around each *toggle*; the signal adds a per-turn stdout write, which must not alter
  `settings.json` at all. ⚠️ **WP4a DID choose the shared script** (Verdict (c), operator-approved — this conditional is now always true): re-run 5.4 with particular care — the
  contract change touches all 10 events.

---

## Dependency map

```
WP1 ✅ (probe: flag store + announce query)       ← START, blocks everything
 │
 ▼
WP2 ✅ (flag lifecycle + clean-exit clearing + exit button)
 │
 ▼
WP3 ✅ (auto-fire + announce + two doors)   ◀── HIGHEST RISK, built EARLY (derisk-first)
 │
 ▼
WP4a (probe: hook plumbing verdict + cell mockups)   ◀── re-decomposed 2026-08-06
 │
 ▼
WP4b (the signal: per-project value + env var + per-turn injection)   ◀── THE DELIVERABLE
 │
 ▼
WP4c (the picker-row cell — metric 5's "always visible")
 │
 ▼
WP4d (doc corrections + the M13 hand-off note)
 │
 ▼
WP5 (exit verify + the guard's 4th arm)
```

**Critical path:** WP1 → WP2 → WP3 → **WP4a → WP4b → WP4c → WP4d** → WP5. ⚠️ **There is no longer a
parallel track** — the 2026-08-03 decomposition called WP4 "independent of WP2/WP3"; the re-decomposition
makes it strictly sequential, because the signal consumes WP3's spawn path and the cell feeds the signal.

**⚠️ Ordering is DERISK-FIRST, corrected 2026-08-03.** An earlier draft ran the drive-mode cell (WP4) before auto-fire and justified it as "bank a shippable increment first, then do the risky part with the flag already proven." That is **build-dependency reasoning mis-stated as risk reasoning**, and it inverts the standard learning-sequence rule: *resolve the riskiest unknowns first, when the cost of discovery and re-planning is lowest.* Operator-corrected — *"Always derisk first."* **The same rule is why WP4a precedes WP4b/WP4c** rather than the cell being built first.

**⚠️ The claim "all of the milestone's genuine unknowns live in WP3" was FALSE, and this is the
re-decomposition's central correction.** WP4 was sized **M / "near-zero unknown" / "clones an
already-live precedent"** — and every part of that was wrong. Drive mode has **no argv destination**, so
the `default_model` analogy breaks at the only point that mattered; the delivery mechanism did not exist
and had to be found empirically; and the planned frontmatter mirror targeted a file that is **deleted by
`/session-restore` step 7** and **absent in the finalize→next-plan gap**. The lesson generalizes past
this instance: *"clones an existing path"* is a claim about **storage**, and it says nothing about
**consumption** — the two ends of a feature can have entirely different risk profiles, and a WP sized on
the familiar end will be mis-sized.

**WP2 is the minimum WP3 needs** — auto-fire cannot be verified against a flag whose lifecycle is still in question, and WP2's hard-kill case (2.7) is what proves the signal WP3 reads is trustworthy. WP2 is deliberately NOT deferred behind WP3 for that reason.

**No orchestration/async WP** — nothing here introduces a queue, worker, or event pipeline beyond the existing Tauri event channel. **No 3rd-party probe WP** — M12 calls no external API or SDK; WP1 and WP4a are probes of *our own* boundaries (a storage boundary, then a hook/IPC boundary), which is why they exist despite rule 4 not strictly requiring one.

## Sizing summary

| WP | Size | Note |
|---|---|---|
| WP1 | S | ✅ SHIPPED 2026-08-03 — both verdicts, within the half-day timebox |
| WP2 | M | ✅ SHIPPED 2026-08-03 — three clean-exit routes (not four) + a hard-kill case |
| WP3 | L | ✅ SHIPPED 2026-08-05. **The milestone's risk** as scoped at the time: first feature-initiated PTY write + injection timing on a fresh prompt + the sibling-nesting trap + an auto-action on the most-glanced surface |
| ~~WP4~~ | ~~M~~ | ⚠️ **SUPERSEDED 2026-08-06** — re-decomposed into WP4a–WP4d. The "M / near-zero unknown / clones a live precedent" sizing was wrong on all counts |
| WP4a | S | Probe: hook-plumbing verdict + cell mockups. Half-day timebox; the channel is already decided |
| WP4b | **L** | **The actual deliverable.** Per-project value + env var + per-turn injection, **+ the `DriveMode` serde fix + the known-mode allowlist (does not exist yet)**, with **all three** inertness arms mutation-proven. ⚠️ Re-sized M→L 2026-08-06 — estimate correction after WP4a, not a scope change |
| WP4c | **S** | Sized 2026-08-06 by Verdict (f): Option 2 enriches the existing `"model"` cell — no new row cell, 0px layout cost |
| WP4d | S | Doc corrections (5 vision places incl. the unsatisfiable metric 5) + arch.md + the M13 note |
| WP5 | M | Live drive + a new guard arm each probed individually + the two-arm signal check (5.7) |

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

---

### Verdict (c) — hook plumbing: SHARED SCRIPT, emission above the line-44 early exit (WP4a Phase 1, 2026-08-06)

**DECISION: add the drive-mode emission to the existing `claudesk-hook.pl`, NOT a separate
`UserPromptSubmit`-only hook entry.** Operator-approved.

⚠️ **This choice was ARGUED from code, then its safety was MEASURED. Do not read it as "measured".**
The shared-vs-separate decision itself rests on two facts read out of the registration code; what the
20-check evidence script proved is that the resulting shape is *safe*, not that the alternative is worse.

**The two facts, neither of which was in the WBS when the question was posed:**
1. **A separate entry needs a separate SCRIPT FILE, ×2 identities.** `merge_claudesk_hooks` and
   `remove_claudesk_hooks` both detect via `group_is_claudesk` → `script_basename_of_command`, matching the
   **basename exactly**. A second entry reusing `claudesk-hook.pl`'s basename is **indistinguishable from
   the first**: merge finds the existing group and no-ops; uninstall strips both or neither. The real cost
   is a second bundled resource + deploy call + per-identity basename pair + a second marker family through
   merge/remove/self-heal — **larger** than the emission it was meant to avoid.
2. **The blast radius is a measured 1-of-10, not a structural 10-of-10.** With the gate ON, exactly one of
   the 10 registered events emits; the other nine are byte-silent (and the mutant removing the event filter
   correctly fails).

**Proven by a 25-check evidence script (mutation-tested):** happy path nests correctly under
`hookSpecificOutput`; **8 abuse arms** all exit 0 with no partial JSON; OFF → byte-empty; dead socket → the
signal still emits (the two concerns are independent); telemetry **byte-identical to the real script across
6 event shapes**.

⚠️ **The evidence script itself was NOT retained** — it lived in an ephemeral session scratchpad and is
deliberately not tracked (a throwaway probe fixture should not become a tracked artifact beside the real
demo pipeline). What survives is this record plus the two permanent tests the probe *did* land:
`never_blocks_cc_on_degraded_inputs` and `notification_forwards_notification_type`
(`src-tauri/tests/hook_pl_output.rs`), which guard the never-block-CC property WP4b must not regress.
**Do not go looking for `check.sh`; re-derive from those tests if a re-run is ever needed.**

⚠️ **TWO IMPLEMENTATION CONSTRAINTS WP4b MUST HONOR — both mutation-proven:**
- **`claudesk-hook.pl:44` does `exit 0 if $sock_path eq ''` BEFORE reading stdin.** The emission must go
  **above** it, which means **the stdin drain moves up and is shared** by both concerns. Appending after
  line 44 silently kills the signal whenever `CLAUDESK_HOOK_SOCK` is absent.
- **Never-block-CC rests on ONE construct: the outer `eval {}`.** Removing the *inner* `eval` around
  `decode_json` changes nothing (the outer one catches it — they are **redundant, not layered**); removing
  **both** makes malformed stdin exit **2** with a Perl error, i.e. a wedged CC turn. Do not "simplify"
  the outer guard as redundant.

**The gate reaches the hook by ABSENCE** (task 4a.2b): gate OFF → **do not set `CLAUDESK_DRIVE_MODE`**.
Inertness then comes from the same mechanism that protects every plain-CLI user (proven: unset *and*
empty-string both → byte-empty). Rejected: having the hook read the gate itself — a settings read per turn
on CC's critical path, plus a second source of truth that can disagree with the spawn side. Spawn-side
check should copy `announce/commands.rs:33`'s fail-closed `read_workflow_features_enabled(&dir).unwrap_or(false)`.

**The env var is the only possible Claudesk marker** (task 4a.3): `WorkspaceRegistry::resolve_cwd`
(`status_broadcaster/mod.rs:240-252`) filters registered paths by ancestry and takes the longest match — it
has **no notion of which process spawned `claude`**, so a terminal-launched session inside an open
workspace's tree resolves identically.

---

### Verdict (d) — the injected sentence (WP4a Phase 2, 2026-08-06)

```
Claudesk reports the drive mode for this workspace as <mode>.
```

`<mode>` ∈ **`stepping` · `orchestrated` · `autopilot` · `fsd`** (⚠️ see Verdict (e) — **not** what
`DriveMode` serializes to today). Operator-approved.

**Why this over the plainer *"Drive mode for this workspace is X"*:** it **attributes the source**, which
does two things a bare assertion cannot — it reads as standing environmental context rather than a fresh
instruction at turn 60, and it gives the model something to **reconcile** `.session.md`'s own `drive_mode:`
against. That reconciliation was observed happening spontaneously in the original probe (*"from the
pointer's `drive_mode`, matching what Claudesk reports for this workspace — so no mode menu"*).

⚠️ **STATES A FACT, NOT A PROHIBITION — and this is a DURABILITY JUDGEMENT, NOT A MEASURED REQUIREMENT.**
The probe's own wording **did** include a prohibition clause and **still worked**. No experiment here
distinguishes the two forms. The reasoning (a prohibition is correct at turn 1 and wrong at turn 60, when
the operator may legitimately want to change mode) rests on the long-context claim that is itself
**ASSUMED** — see Finding E. **Do not upgrade either to "proven."**

---

### Verdict (e) — an unset mode emits NOTHING, and `DriveMode`'s vocabulary is WRONG (WP4a Phase 2, 2026-08-06)

**Absence on the wire = no `additionalContext` line at all**, never a line naming a default. Verified:
unset, empty-string, and any unrecognized value each → **byte-empty stdout, exit 0**.

⚠️ **The reason is stronger than Finding F recorded.** Finding F says `session-start` and `session-restore`
disagree on their defaults. In fact **`session-restore` disagrees with ITSELF, inside one file**: step 4
priority 4 says *"Default to `orchestrated` (Mode 2)"* (`SKILL.md:42`) while its own menu 17 lines later
labels **`3 Autopilot`** as *"(default)"* (`:59`). There is no coherent upstream default to copy even from
one skill, so any default Claudesk emitted would be **Claudesk inventing workflow policy**. Emitting
nothing leaves the skill's own resolution chain intact — which is what "zero companion-repo change" means
in practice. *(Filed against the companion repo as
`SURFACE-2026-08-06-SESSION-RESTORE-CONTRADICTS-ITSELF-ON-THE-DEFAULT-DRIVE-MODE`, low. ⚠️ **Not
Claudesk's to fix.**)*

**⚠️ WP4b BLOCKER — `DriveMode` serializes 2 of 4 variants to values NO SKILL RECOGNIZES:**

| Mode | Claudesk emits today | What skills actually read | |
|---|---|---|---|
| 1 | `step-by-step` | **`stepping`** | ❌ |
| 2 | `orchestrated` | `orchestrated` | ✓ |
| 3 | `autopilot` | `autopilot` | ✓ |
| 4 | `full-autopilot` | **`fsd`** | ❌ |

**This invalidates task 4b.1's stated premise** (*"already typed `Option<DriveMode>` with the right
kebab-case vocabulary and just needs activating"*). Authority — three independent sources agreeing:
`transitions.md:165`, `session-handoff/SKILL.md:75`'s writer template, and **29 real archive WIP files**
(28 `autopilot`, 1 `orchestrated`). **Concrete failure it would ship:** selecting mode 4 emits
`full-autopilot` → the hook's known-mode guard correctly rejects it → **the feature silently does nothing
for that mode**. Mode 1 fails identically. Measured: 0 bytes.

⚠️ **WP4a's own Phase 1 fixture had the same class of bug** (a third, *different* wrong vocabulary), which
is exactly why its "4 modes round-trip" check passed while both sides were consistently wrong.
**A round-trip test proves SYMMETRY, not CORRECTNESS** — it cannot see a vocabulary both sides share and
both get wrong. Only comparison against the external consumer caught it. **WP4b's round-trip test must
assert the literal strings from `transitions.md`, not the enum's own output.** A tripwire test
(`drive_mode_serializes_to_these_literal_strings`) now pins today's wrong values and **fails the moment
WP4b renames**, with an assertion message naming the new expectation. Tracked as
`SURFACE-2026-08-06-DRIVEMODE-SERDE-VOCABULARY-WRONG-ON-2-OF-4-VARIANTS` (medium).

---

### Verdict (f) — the picker-row cell: stacked in the existing column (WP4a Phase 3, 2026-08-06)

**DECISION: model + drive mode STACKED as two lines inside the existing 7.5em `.picker-recent-model`
column.** Compact readout; clicking a line makes *that line* editable. **No live `<select>` on any row.**
Operator-chosen from a 4-option side-by-side mockup drawn in real tokens at the true 592px row width —
saved at `docs/reference/m12-wp4a-drive-mode-cell-options.html`.

⚠️ **THE REFRAME THE DRAWING PRODUCED, which prose had hidden:** the question was *"which option preserves
the path?"* — and that frame is **false**. The path is **already ellipsised today** and the headline is
**already over budget**. Measured on the rendered DOM: **7 of 8** names ellipsise, **all 8** paths clip,
even a **26-char** name clips in one option, and only one name escapes — by exactly 0px. No option protects
a healthy row; each chooses **which already-strained thing strains further**.

| option | usable name/path (**measured**) | Δ vs current |
|---|---|---|
| 1 · 4th sibling cell | 260.5px | −85px |
| **2 · stacked (CHOSEN)** | **341.7px** | **0px** |
| 3 · 2nd headline badge | 341.7px | 0px (but headline ~554px into ~346px) |
| 4 · live `<select>` (trap) | 241.8px | −104px |

**Why Option 2:** the cell **already has two lines of vertical room** (the name/path stack is taller than
the one-line model readout), so the second line is **free** — no width taken, no row growth, ×16 rows. Its
cost is **semantic, not spatial**: two unrelated settings share one column.
**Why not Option 3** (also 0px): its headline is ~554px into ~346px, degrading a 37-char name to a stub —
and it would put an interactive control inside the open-button's headline beside `.picker-recent-announce`,
a readout whose CSS comment states it is *"a READOUT, not a control."*

**Resting labels — label ONLY when unset** (operator refinement): `Model: Default` / `Drive Mode: None`
when unset; bare `opus` / `autopilot` once set; mixed rows are legitimate. The fully-labeled form was
**measured not to fit**: the column has ~101px usable and `Drive Mode: orchestrated` ≈ **144px**, which
would ellipsise to `Drive Mode: orchestr…` — destroying the value. ⚠️ This **revises** `MODEL_UNSET_LABEL`'s
standing brevity rationale (`src/cc/modelOverride.ts:41-50`), which assumed **one** value per row; WP4c
must update that doc comment in the same commit or a future reader reverts the labels as redundant.

**⚠️ THREE THINGS WP4C INHERITS:**
1. **Two edit targets now live in one column** → the existing cell-wide click-to-edit becomes **ambiguous**.
   Give each line its own hit region and verify by **clicking each one** (the WP3 `⊘` precedent:
   `stopPropagation` on pointerdown *and* click, an Enter/Space mirror, then confirm the element
   **hit-tests to itself** via `elementFromPoint`). A unit test cannot see this.
   → `SURFACE-2026-08-06-STACKED-MODEL-MODE-CELL-NEEDS-TWO-HIT-TARGETS-IN-ONE-COLUMN`.
2. **Option 2 does NOT add a member to `PICKER_ROW_CELLS`** — it enriches the existing `"model"` cell. The
   two tests pinning that array (`projectModelCell.test.ts:37`, `announceRow.test.ts:168`) should **not**
   need updating. If a WP4c change starts requiring those edits, **the implementation has drifted toward
   the rejected Option 1.**
3. **Derive the new labels**, as `MODEL_UNSET_LABEL` is derived from `MODEL_UNSET_PLACEHOLDER` — that
   indirection exists because *"they were two independent hardcoded strings until code review caught it."*
   → `SURFACE-2026-08-06-STACKED-CELL-LABELS-REVISE-THE-MODEL-UNSET-BREVITY-RATIONALE`.

⚠️ **THE SAVED MOCKUP CONTAINS TWO KNOWN ERRORS — this verdict governs, the artifact does not.**
(i) It draws the unset model cell as `inherit`; the product renders **`Default`** (`inherit` appears
nowhere in the UI). (ii) Its cost table says Option 1 costs `−102px`; the **measured** figure is −85px, so
that option's penalty is **overstated** there. Neither changes the decision — Option 2 costs 0px either
way — but WP4c must read the constants and this section, not the drawing.

*(⚠️ Lettering note: the WIP file `m12-wp4a-signal-channel-and-cell-probe.md` numbers these verdicts
(a)–(h) in its own local sequence. This file's letters continue WP1's — WP4a's (c)/(d)/(e)/(f) here map to
the WIP's (a)+(b)+(c) / (d) / (e)+(f) / (g)+(h) respectively.)*

#### Incidental code facts WP4b/WP4c inherit (WP4a, 2026-08-06)

Found while probing; each would otherwise be rediscovered mid-build.

- ⚠️ **`color_tty_env()` returns a FIXED-SIZE `[(&'static str, &'static str); 4]`**
  (`cc_session/mod.rs:290`) with **three** call sites — `:612` (CC spawn), `:634` (shell spawn), `:1128`
  (a test). Finding F's *"`spawn_argv` already takes a generic `env`, so adding one is free"* is true of
  **`spawn_argv`** and **not** of the call site: the new var **cannot be appended to that array**. The CC
  call site must compose a `Vec`, and ⚠️ **the shell spawn must NOT receive the var** — a raw login shell
  is not a CC session.
- **`default_drive_mode`'s doc comment carries TWO stale claims, not one.** WP4b already owns *"Never read
  or written"*; it **also** says *"Reserved for Phase 2 (WP15 drive-mode selector)"* — a pre-M12 numbering
  that no longer exists. Kill both in the same commit as the serde fix, or the file keeps three lies
  (value, readership, provenance) where a reader will trust at least one.
- **`hook_pl_output.rs` gained a degraded-path helper.** `run_hook_capture_line` asserts the exit-0
  contract at line 80, but only reaches it on payloads that **successfully connect to a socket** (its
  reader thread blocks on `accept()`) — so never-block-CC was asserted on the **happy path only**. WP4a
  added `run_hook_degraded()` (binds no socket, captures stdout + exit status) plus
  `never_blocks_cc_on_degraded_inputs` (6 arms) and `notification_forwards_notification_type`.
  ⚠️ **WP4b's stdout emission must keep that test green** — it is now the guard on the property Verdict (c)
  proved rests on a single `eval {}`.
- **`MODEL_UNSET_LABEL` is now guarded.** It previously had **zero** test references despite existing only
  to be *derived* from `MODEL_UNSET_PLACEHOLDER`; a hardcoded `"Inherit"` passed all 1924 tests. Two tests
  now pin the derivation and the literal `"Default"`. ⚠️ **Known limitation, stated so nobody over-trusts
  it:** a hardcode that happens to *equal* the derivation's output still passes — undetectable at runtime
  by construction.
- **Do NOT build a new PTY-injection primitive** (restated because it is easy to re-derive wrongly):
  `slash_command_bytes` (`cc_session/mod.rs:266`) trims trailing CR/LF and appends exactly one `\r`. WP3
  already made the first feature write through it.

## Open questions carried into the WPs

*Updated 2026-08-06. **All four live questions are now CLOSED by WP4a** — see Verdicts (c)–(f) in "Probe
outcomes". The three original questions were closed earlier by shipped WPs. Everything here is kept for
provenance.*

<details><summary>Closed by WP4a (2026-08-06)</summary>

1. ~~**Shared telemetry hook script vs. a separate `UserPromptSubmit` entry** (task 4a.1)~~ — CLOSED by
   **Verdict (c): SHARED SCRIPT**, on two registration-code facts the question did not know: a separate
   entry needs a separate *script file* ×2 identities (detection is basename-exact), and the blast radius
   is a **measured 1-of-10**, not a structural 10-of-10.
2. ~~**The injected sentence's exact wording** (task 4a.2)~~ — CLOSED by **Verdict (d)**:
   `Claudesk reports the drive mode for this workspace as <mode>.` ⚠️ Fact-not-prohibition remains a
   **durability judgement, not a measured requirement** — the framing in this question was correct and
   survives the verdict.
3. ~~**The picker-row cell's design** (task 4a.4)~~ — CLOSED by **Verdict (f)**: model + mode stacked in
   the existing 7.5em column, decided from a 4-option mockup, plus label-only-when-unset.
4. ~~**What "unset" means** (task 4c.0)~~ — CLOSED by **Verdict (e): emit NOTHING.** ⚠️ The reason is
   stronger than this question stated: it is not only that `session-start` and `session-restore` disagree —
   **`session-restore` disagrees with ITSELF inside one file** (`:42` says default `orchestrated`; its own
   menu at `:59` labels Autopilot "(default)").

</details>

**Deliberately NOT open** — do not reopen these as if they were gaps: the **channel** (`UserPromptSubmit`,
operator-chosen, obedience proven live on both arms); **whether to change the companion repo** (no —
`/session-restore`'s re-prompt is correct for a CLI user); **whether M13 reuses the primitive** (recorded,
not pre-committed — the operator evaluates it at M13's spec); and **long-context durability** (assumed,
validated by dogfooding, deliberately not probed synthetically).

<details><summary>Closed (2026-08-03 decomposition)</summary>

1. ~~**Announce-label placement vs. long project names** (task 3.2)~~ — CLOSED by WP3: the space
   competition was real, caught at verify-human (P3.9 back-loop), and fixed as a layout defect.
2. ~~**Keyboard parity for the no-fire door** (task 3.6)~~ — CLOSED by WP3 **without** a modifier: the
   `⊘` is itself focusable with an Enter/Space mirror.
3. ~~**Flag store choice** (task 1.2)~~ — CLOSED by WP1: its own `session-state.json` in the per-identity
   `app_data_dir()`, chosen on a lost-update hazard rather than the predicted byte cost.

</details>

---
stage: wbs
state: complete
updated: 2026-08-14
milestone: 13
---

# WBS — Milestone 13: Skill orchestration

**Scope of this pass:** Milestone 13 only. Future milestones (M14 polish/OSS release, M15 workflow supervisor) are tracked in `roadmap.md` and are deliberately **not** decomposed here — M15 in particular is probe-gated and its design is contingent on findings that do not exist yet.

**Milestone goal:** Common workflow operations are clicks, not typed slash commands.

**Closes Group C** — carries the last two of six vision success metrics (#2 Recycle Session is one click; #3 no slash-command typing for common skills). The other four are met.

**Everything here sits behind M10.9's `workflow_features_enabled` gate.**

---

## ⚠️ Pre-decomposition findings — measured this session, not assumed

Three facts were established by reading the real machine before sizing any WP. Each changes a WP.

### Finding 1 — the skill directory is 61 entries, and 11 of them are BROKEN SYMLINKS

`~/.claude/skills/` holds **59** entries; the project-local `.claude/skills/` holds **2** (`clear-build-cache`, `release`). Total **61**.

⚠️ **Eleven of the 59 are dangling symlinks** — `RENAMED-brownfield`, `RENAMED-getting-started`, `RENAMED-product` (→ a deleted `/var/folders/…/tmp.Q3ZCt3e9X3/`), plus `tutorialX-*` ×4 and `zz-*` ×4 (→ a deleted `/tmp/mut/`). All eleven are July-27 mutation-testing leftovers. `head` on their `SKILL.md` returns **nothing**; `ls` on their directory returns **nothing**.

**Consequences, all load-bearing:**
- A scanner that reads `<dir>/SKILL.md` per entry hits an **I/O error on 11 of the 61** entries (so **50 are invocable**). Error handling would be the **modal case** on the operator's real machine. ⚠️ **SUPERSEDED 2026-08-14 by Q1's verdict — read the Probe outcomes before acting on this bullet.** The verdict is a *fixed* 5-button set, which needs **no directory enumeration at all**, so this consequence is now conditional on WP2 choosing scanner-option (ii); under (i) it does not apply. ⚠️ Quote the ratio as **11-of-61 entries / 50 invocable**, not "11 of 61 skills" — the dead entries are not skills.
- ⚠️ **This is a ready-made test fixture.** The probe does not need to synthesize a broken-skill directory; one exists, with two distinct breakage flavors (dangling symlink to a deleted tmp dir, in two different tmp roots). Use it, then *also* build a synthetic fixture — the real one will eventually be cleaned up and the test must not silently start proving nothing (`SURFACE-2026-08-12`-style: a guard that passes because its subject vanished).
- A naive "render every entry" ships **61 buttons, 11 firing dead commands**.

### Finding 2 — 61 buttons is not "no slash-command typing", it is a worse launcher

The roadmap line reads *"render each skill as a clickable button."* Taken literally at 61 entries that is a wall of buttons, and typing `/fea` + tab beats scanning it. ⚠️ **The deliverable's own exit criterion ("no slash-command typing for **common** skills") contains the answer — "common", not "all".**

`[PRIOR: new-surface-must-earn-its-place-against-existing-ones] leaning a CURATED set over an exhaustive scan — flag if wrong.` The prior's decision rule applies directly: *for each item, can the existing surface already do this?* The existing surface is **typing the slash command**, which already reaches all 61 perfectly well. The irreducible non-overlap of a button surface is **not reachability** — it is *not having to remember the name and not having to type it for the handful you fire constantly*. A 61-button wall delivers a strict *subset* of the fuzzy-matcher's value while costing more screen. Scope to exactly the non-overlap.

⚠️ **This is a genuine scope question the roadmap does not settle, so WP1 must settle it with the operator rather than a WP silently picking.** It is deliberately framed as a probe verdict, not a build decision.

### Finding 3 — the four existing guard arms, and what satisfies the fifth

`src/state/__tests__/offInvariantGuard.test.ts` enumerates **four registries** (its own header, lines 41–49): PANEL (`availablePanels(false)`), MENU ID (`MENU_IDS`), CHORD (modules exporting `*Chord*`), ROW-CELL (`cellLines(…, false, …)` + `rowAffordances(…, false)`). A skill-button surface is **none of them** ⇒ ⚠️ **M13 owns a FIFTH arm**, per the header's own standing rule ("adding another one should extend this guard as part of that work").

Measured properties the fifth arm must respect — each already paid for by a real defect:
- ⚠️ Assert the **computed OFF-state value** (the row-cell arm's shape), never merely the absence of a literal. The header explicitly says: if a registry becomes dynamic, assert the OFF-state value of that computation rather than deleting the assertion.
- ⚠️ **Probe each arm INDIVIDUALLY.** A composite bypass that trips *some* arm reports "the guard bites" while hiding a gap.
- ⚠️ **An invalid probe and a real hole present IDENTICALLY.** The chord arm's gate-exemption is **whole-module**, which is how a valid-looking probe passed 19/19 at WP5 (`SURFACE-2026-08-12-CHORD-ARM-GATE-EXEMPTION-IS-WHOLE-MODULE`).
- ⚠️ A **type-level, executable** seam reference satisfies the guard; the arm **strips comments**, so a comment-only mention was *measured* not to.
- The chord arm was rebuilt **per-export** (not per-module) at the 2026-08-12 paydown WP2; that file is now at **26 tests** (⚠️ **corrected at WP1 P1.9** — this said 24, measured `grep -c "it("` = 26; the four registries listed in its header at lines 41–49 are confirmed accurate). Read its header before extending.

---

## Reuse inventory — verified present, do NOT rebuild

| Seam | Location | Status |
|---|---|---|
| `slashCommandPayload(command)` + `injectCommand(sessionId, command)` | `src/components/workspace/autoResumeFire.ts:145` / `:165` | ⚠️ **THE seam a BUTTON must use.** `injectCommand` → `invoke("cc_input", { sessionId, data: slashCommandPayload(cmd) })`. This is what the existing `/session-start` button uses (`Workspace.tsx:169`) and what M12 WP3 consumed. ⚠️ The `invoke` **MUST** have a `.catch` — an unhandled Tauri rejection vanishes silently. **No retry, deliberately** (detecting a miss would need CC output-reading, which `arch.md` forbids). |
| `slash_command_bytes(command)` | `src-tauri/src/cc_session/mod.rs:266` | The **Rust-side** CR rule, and ⚠️ **NOT reachable from the frontend** — it is not a `#[tauri::command]` and has exactly **one** production caller (`:966`, the shutdown `/exit`). `slashCommandPayload` is its deliberate **TS mirror**, pinned byte-for-byte by `autoResumeFire.test.ts` so the two cannot drift. ⚠️ **CORRECTED 2026-08-14** (code-quality review, CRITICAL): an earlier draft of this row called it "**the** injection primitive — all injection goes through it," which is **false** and would have sent WP2 to a function no button can call. Two implementations of one rule is the *intended* design; keep both in step, do not "unify" them. |
| `sessionStartButton.ts` | `src/components/workspace/sessionStartButton.ts` (6.2 KB) + a 15.7 KB test | The **single-button precedent**. M13 either absorbs it into the registry or keeps it pinned — ⚠️ decide explicitly, do not leave two mechanisms. |
| `session_state::consume` | `src-tauri/src/session_state/mod.rs` | Returns-and-clears the unclean-exit flag. |
| `key_for()` | `src-tauri/src/session_state/` | ⚠️ **Every** read/write of the unclean-exit flag goes through it — a reader that skips it silently matches nothing (no error, just a flag that never fires). |
| `useWorkflowFeaturesEnabled` | `src/state/useWorkflowFeaturesEnabled.ts` | ⚠️ The **only** gate door. Never `invoke()` ad hoc, never the raw wrapper. The guard bites at the **type declaration**. |
| Skill frontmatter | `~/.claude/skills/*/SKILL.md` | Confirmed shape: `name:`, `description:`, optional `argument-hint:`. The `name:` is the slash command. |

⚠️ **Drive-mode-signal reuse is NOT pre-committed** (operator, 2026-08-06: *"I'll need to open the spec and re-evaluate if it's reusable when we get there."*). Recycle re-spawns CC, so it gets `CLAUDESK_DRIVE_MODE` **free from the ordinary spawn path if it spawns through `cc_spawn_env`**. ⚠️ The question is *"does Recycle's respawn go through `cc_spawn_env`?"* — **not** *"how do we generalize the injector?"* Build **no** abstraction for an unspecced caller.

---

## Work Packages

### WP1: Probe — registry scope, scan robustness, and the Recycle completion protocol
**Type:** probe
**Milestone:** 13 (FIRST — gates WP2, WP3, WP4)
**Dependencies:** none
**Size:** M
**Timebox:** 1 day

**Learning objective:** Answer the four questions that would each force a rebuild if guessed wrong.

**Q1 — Which skills does the button surface show?** (⚠️ **An operator decision, not an agent one** — see Finding 2. Present the measured 61-entry reality + the "common, not all" reading of the exit criterion, and get a verdict.) Candidate shapes, cheapest first: (a) a **curated fixed set** of the handful actually fired constantly; (b) **workflow-state-relevant** buttons (what the state machine says can come next) — ⚠️ note this leans on M15's state model and would couple M13 to unbuilt work; (c) a **fuzzy palette** over all 61 — ⚠️ but that re-implements the harness's own `/`-matcher, which the anti-redundancy prior argues against; (d) exhaustive scan, grouped by prefix. **Record the verdict and the rejected options with reasons.**

**Q2 — How does the scanner behave on the real directory?** 61 entries, 11 dangling symlinks, two tmp roots. Establish: does a broken entry get **skipped silently**, surfaced as a diagnostic, or fail the scan? ⚠️ **Silent-skip is the wrong default** — it makes an 11-entry hole invisible, and the operator would never learn their skill dir is dirty. Determine the honest behavior and whether the dirty-entry count is worth surfacing.

**Q3 — What is Recycle's completion protocol?** ⚠️ **The hard part of the whole milestone, and the roadmap line hides it in four words** (*"wait for `.session.md` write completion"*). Claudesk must know a **skill running inside CC** finished. Its channels today are the hook socket (`Stop` → idle) and file-watching. Determine, empirically, for each of the 5 sequence steps: what observable signal marks completion, and what the timeout/failure behavior is. ⚠️ **`Stop` fires on every turn end, not just on the handoff finishing** — so `Stop` alone cannot mean "the handoff is done." Establish whether `.session.md` **existence** (it is created by `/session-handoff` and deleted by `/session-restore`) is a sufficient and *unambiguous* marker, including the case where a **stale `.session.md` already exists** before Recycle starts.

**Q4 — Does Recycle's respawn go through `cc_spawn_env`?** Read the code and answer yes/no. If yes, the drive-mode signal is free and **nothing is built**. ⚠️ Do not generalize the injector either way.

**Success criterion:** A written verdict per question in this file's "Probe outcomes" section, each with the evidence that produced it. Q1 carries an explicit operator sign-off. Q3 carries an observed signal table, not a proposed one.

**Tasks:**
- [x] 1.1 Measure the real scan: enumerate both dirs, classify each entry (valid / dangling symlink / missing `SKILL.md` / unparseable frontmatter), report counts.
- [x] 1.2 Present Q1's options to the operator with the 61-entry reality and the "common, not all" exit-criterion reading; record the verdict + rejected alternatives.
- [x] 1.3 Instrument a real `/session-handoff` in a **scratch workspace** (`tmp/scratch/scratch-{a,b,c}` — mandatory once a check spawns/answers a CC session) and record every observable signal with timestamps: hook events, `.session.md` create/write/close, CC exit.
- [x] 1.4 Repeat 1.3 with a **stale `.session.md` pre-existing** to test marker ambiguity.
- [x] 1.5 Read `cc_spawn_env`'s call graph; answer Q4 yes/no in one sentence with the call path.
- [x] 1.6 Decide the `sessionStartButton.ts` disposition (absorb vs keep pinned) and record it.
- [x] 1.7 Write "Probe outcomes" into this file.

---

### WP2: Skill buttons — a tiny fixed set, and the gated surface
**Description:** A small fixed button row + the **fifth OFF-invariant guard arm**, in the shape WP1's Q1 verdict selected.
**Milestone:** 13
**Dependencies:** WP1 (Q1 decided what is rendered; Q2's scan is now optional — see below)
**Size:** M → ⚠️ **re-size candidate: S.** The scan was the bulk of the M. Re-size deliberately at plan time rather than inheriting M by default.

⚠️ **Q1 IS ANSWERED — WP1 Phase 3, measured from 2470 transcripts, operator sign-off 2026-08-14. Do not re-derive; do not re-open the shape.** Full data + rejected options: `workflow-system/state/wip/m13-wp1-probe.md` → "Phase 3 — Q1".

**The measured reality:** of **577** manual (operator-typed) workflow-skill invocations across all history, **`/session-restore` is 531 (92.0%)**, `/session-start` is 25 (4.3%), and *all nine others combined* are 21 (3.6%). Only **11 skills were EVER typed manually** — of **50 invocable** ones (61 directory entries minus the 11 dead symlinks). ⚠️ *Quote it as 11-of-50, not 11-of-61: the 61 figure counts entries, 11 of which cannot be invoked at all, so 11-of-61 overstates the case.* ⚠️ **Zero manual invocations of any `feature-*`, `task-*`, or `product-*` skill, ever** — those are the *agent's* vocabulary (agent-side: `feature-build` 910, `feature-verify-auto` 884, …), fired by auto-chaining. **A per-skill registry would have surfaced the agent's vocabulary, not the operator's.**

**THE VERDICT — a TINY FIXED SET of exactly 5:** `/session-start` · `/session-capture` · `/util-prune-claude-md` · `/util-backlog-paydown` · **Recycle Session** (WP3). ⚠️ **Five, not "3–5"** (tightened 2026-08-14 at code-quality review): the "3–5" phrasing came from the option text the decision was made *from*, not from the decision — the operator selected this determinate list. **No member is conditional**, and the three low-frequency ones are in **deliberately** (see the ≤3-invocations note below), so dropping any is a scope reduction requiring its own decision, not an implementation detail. ⚠️ A 6th is under discussion — see the open question below — but the *floor* is these five.

- ⚠️ **`/session-restore` is deliberately EXCLUDED despite being 92%** — it is **already automatic**: M12's open-time auto-fire + announce injects it when `.session.md` is present (`predictAction.ts:140`), so the operator does not type it. A button duplicating an *automatic* path is the redundancy `[PRIOR: new-surface-must-earn-its-place-against-existing-ones]` forbids. **Do not "fix" this omission; it is the decision.**
  - ⚠️ **CORRECTED 2026-08-14** (caught by the Phase 3 verify-self adversarial pass): an earlier draft justified this with *"M12 auto-fire **plus `sessionStartButton.ts`**"*, claiming that module gave `/session-restore` a manual door. **That was FALSE.** `sessionStartButton.ts` exports `SESSION_START_COMMAND = "/session-start"` and its sole caller renders a `/session-start` button — it fires a skill **already in the set**. ⚠️ **`/session-restore` has NO manual click door at all**; it reaches CC only via the automatic arm. The exclusion still stands on the auto-fire half alone (that is the 92% case — an operator who types `/session-restore` today is working around the absent auto-fire, not exercising a button), but it now rests on **one** support, not two. **⚠️ If M13 ever wants a manual restore door, that is a NEW decision, not a correction of this one.**
- ⚠️ **Recorded honestly: three of the four skill buttons were fired ≤3 times EVER.** The operator accepted that knowingly, so metric #3 is carried by a **visible surface** rather than closed by argument. Do not silently re-litigate it as dead weight — but do not *widen* the set either.
- **Rejected:** cutting WP2 entirely (agent's recommendation — operator wanted a visible surface); workflow-state-relevant buttons (couples M13 to **unbuilt, probe-gated M15**); a fuzzy palette over all 61 (re-implements the harness's `/`-matcher — the prior fires against it); the exhaustive 61-button wall (worse than typing; 11 entries are dead symlinks).

⚠️ **THE SCAN IS NOW OPTIONAL — this is the biggest change to WP2 and it must be decided, not defaulted.** A **fixed** set whose 4 *skills* are known up front (Recycle is not a skill) needs no enumeration of `~/.claude/skills/`, so Q2's 61-entry scan and its 11-dangling-symlink error handling are **no longer load-bearing for the button surface**. Choose explicitly: **(i)** hard-code the 4 and drop the scanner entirely, or **(ii)** keep a cheap per-skill *existence* check so a button never fires a dead command. ⚠️ **(ii) looks smaller but quietly reintroduces path resolution and the broken-symlink case** — if chosen, it is an existence check on 4 known paths, **never** a directory enumeration.

⚠️ **ONE OPEN QUESTION lands on WP2's doorstep — decide it at plan time, do not silently skip it.** `SURFACE-2026-08-14-SESSION-RESTORE-HAS-NO-MANUAL-DOOR`: `/session-restore` is **92% of manual usage and has no click affordance at all** (only M12's automatic arm). Q1's verdict excluded it from the set, and the operator confirmed that exclusion — **but the confirmation was of the exclusion, not of the absence of a manual door**, which no one ever decided. ⚠️ **This is NOT a re-opening of Q1** (the *shape* — a tiny fixed set — is settled); it asks only whether a 5th member belongs. Adding it while the row is already being built is near-zero cost; a later cycle is not. ⚠️ **Before deciding, measure how many of the 531 typed invocations had `.session.md` present** — that is the real demand signal and it is derivable from the same transcripts.

**⚠️ The dominant risk here is not the scan — it is that the registry is exactly the shape `CLAUDE.md` warns about.** *"Enumerating routes/skills as data makes the SET testable but does NOT prove each member has a CALLER."* M12 shipped a `/exit` clean-exit variant that round-tripped through two test suites while being called by **nothing**, and the exhaustiveness test's green **read as coverage**. A skill registry is that shape at larger scale. ⚠️ **Read WP4's CHANGELOG entry from the 2026-08-12 paydown sweep before building** — that WP was entirely this theme, and it found a guard *enforcing* the defect.

**Tasks:**
- [ ] 2.1 ⚠️ **DECIDE FIRST: scanner or no scanner** (the (i)/(ii) choice above), and record the decision. If (ii): an existence check on **4 known paths**, never an enumeration; no frontmatter parsing is needed for a fixed set, since the command string is known. ⚠️ If (i): **delete this task** rather than building a scanner nothing consumes — an unused scanner is precisely the dead-code shape WP1 P1.8 was hunting. ⚠️ No `unwrap()`; `?` with `thiserror`.
- [ ] 2.2 Frontend: the **5** fixed buttons (4 skills + Recycle — see the verdict above; ⚠️ **not "3–5"**, no member is optional), consuming the gate **only** via `useWorkflowFeaturesEnabled` (type-level, executable reference — the guard strips comments).
- [ ] 2.3 Wire each button through **`injectCommand`** (`autoResumeFire.ts:165`) to the **active** workspace's CC pane — the same seam the existing `/session-start` button uses. ⚠️ **NOT `slash_command_bytes`**: that is Rust-side, is not a `#[tauri::command]`, and no button can reach it (⚠️ **CORRECTED 2026-08-14** — this task previously named it, which would have forced either a stall or a brand-new Tauri command, i.e. the second injection path the next sentence forbids). ⚠️ Never a second injection path. ⚠️ Keep the `.catch` — an unhandled rejection is a silent dead click.
- [ ] 2.4 **The fifth guard arm.** Assert the **computed** OFF-state value of the skill-button surface. Follow the row-cell arm's shape; read the file's header first (**26 tests** as of 2026-08-14, per-export chord arm).
- [ ] 2.5 ⚠️ **Mutation-prove the fifth arm INDIVIDUALLY** — bypass only this arm, confirm red, confirm the mutant landed in **executable** code (`sed -n '<line>p'` it). ⚠️ An invalid probe and a real hole look identical.
- [ ] 2.6 ⚠️ **Prove each rendered button has a live CALLER**, not merely an entry in the set. A test that only asserts set membership is the M12 dead-`/exit` trap. Funnel every send through ONE function and guard *that*.
- [ ] 2.7 Apply the `sessionStartButton.ts` disposition from 1.6.

---

### WP3: Recycle Session — the callable operation
**Description:** The 6-step recycle sequence as a **programmatically callable operation**, per the roadmap's 2026-08-14 scope note.
**Milestone:** 13
**Dependencies:** WP1 (Q3's completion protocol is the whole design; Q4 settles the drive-mode question)
**Size:** L

⚠️ **Built as a callable operation with the button as ONE caller** — not as a click handler with the sequence inlined. M15 deliverable 4 (context-pressure recycle) is a non-click caller. Retrofitting a programmatic entry point later is the predictable-and-avoidable version of this cost. **This does not widen M13's user-visible scope** — the button is still the only surface M13 ships.

⚠️ **Recycle MUST CLEAR the unclean-exit flag** — it is a clean boundary, so without the clear every recycle leaves a false mark and the next open fires a spurious `--continue`. Use `session_state_mark_clean(path, route)` with a **new `CleanExitRoute` variant**. ⚠️ **Clearing is OPT-IN PER ROUTE, never a side effect of teardown**, and every read/write goes through `key_for()`.

⚠️ **Manually triggered only, never automatic** (roadmap-explicit). M15 may call it programmatically; M13 ships no automatic trigger.

⚠️ **Q3 IS ANSWERED — WP1 Phase 2, three real captured handoffs, operator-confirmed 2026-08-14. Build against this; do not re-derive it.** Full evidence + the signal table: `workflow-system/state/wip/m13-wp1-probe.md` → "Phase 2 — Q3".

**No single completion marker exists.** Each candidate is killed by a measured fact:
- **`Stop` alone** — run 2 emitted a clean `Stop` having performed **zero tool calls and written nothing**; its trace is a strict subsequence of a successful run's.
- **`.session.md` existence** — was already TRUE at t=0 in two of three runs. It answers "was there ever a handoff", never "did *this* one finish".
- **⚠️ The `.session.md` write itself** — ⚠️ **THIS is the trap in the roadmap's four words.** The file lands, then the skill keeps working for **9.01s (run 3) / 12.19s (run 1)** appending the handoff marker to the WIP file. Firing here kills CC mid-skill and truncates that annotation. **The file write completing is NOT the handoff completing.**

**THE CONFIRMED DESIGN — a composite with an ordering constraint:**

> A `.session.md` write event (CREATE **or** MODIFY, ignoring `*.tmp.*`) whose **mtime is strictly newer than a baseline sampled BEFORE Recycle began** — **followed by the NEXT `Stop`**.

- The mtime-vs-pre-sampled-baseline clause defeats the stale-file case (run 3's delta was 102s).
- The next-`Stop`-after-that-write clause waits out the 9–12s tail.
- ⚠️ **Sample the baseline before starting.** A baseline read after the operation begins can race the write.
- ⚠️ **The failure arm is MANDATORY, and run 2 is its exact shape:** `Stop` arrived **with no fresh write** ⇒ **FAILED, surfaced to the operator.** Never "keep waiting" (hangs forever) and never "done" (recycles away the work Recycle existed to preserve).
- ⚠️ **The Edit tool CAN write via temp+rename** (`<file>.tmp.<pid>.<hash>` CREATE→DELETE→MODIFY) — observed once, not on every Edit. A state-dir watcher must tolerate that form without firing on the transient.

**Tasks:**
- [ ] 3.1 Model the sequence as an explicit **state machine** (a pure function over observed signals → next action), separate from any UI. ⚠️ The composite marker above is *why* this must be a machine over a sequence and not a file poll. ⚠️ `?raw` guards verify structure, never runtime — anything involving async/event ordering must be **extracted to a pure function and asserted as a value**.
- [ ] 3.2 Implement each step's wait against Q3's **observed** signal table above, with an explicit timeout + failure surface per step. ⚠️ A hung step must be visible, not silent.
- [ ] 3.3 ⚠️ **CORRECTED at WP1 P1.7 — the variant ALREADY EXISTS; this task is WIRING, not adding.** `CleanExitRoute::RecycleSession` is present in the Rust enum (`session_state/mod.rs:351`), in `CleanExitRoute::ALL` (3 variants), with wire name `"recycle-session"` (`:369`), in the TS union (`cleanExit.ts:39`), and pinned by a test named *"RECYCLE SESSION is a CLEAN boundary — pinned for M13 (P2.5)"* (`cleanExit.test.ts:109`). It was pinned **deliberately** ahead of M13 so Recycle would inherit the contract rather than rediscover it. **Production callers today: zero.** So: send the existing route from Recycle's funnel, clearing through `key_for()`. ⚠️ Opt-in at this route only. ⚠️ **Do not read the existing tests' green as evidence the route works end-to-end** — it is the same set-vs-caller shape that hid the M12 dead `/exit` variant. Task 3.6's negative arm is what actually proves the wiring.

⚠️ **Note on the OTHER two variants, established at WP1 P1.8 (and a corrected error worth inheriting):** `WorkspaceClose` clears via the **IPC** path (`markSessionClean` → `session_state_mark_clean`); `AppQuit` clears **in-process** from `perform_quit_teardown` via `clear_and_persist`, never crossing IPC — correctly, since the paths come from a Rust-side registry. WP1 initially recorded `AppQuit` as uncalled and filed it as a defect; that was **wrong and was retracted before any code changed**, because the sweep audited the IPC command and generalized to a second writer that does not use it. ⚠️ **The flag has TWO writers by design.** When WP3 wires Recycle, decide *which* writer it uses (Recycle is frontend-initiated, so likely IPC) — and when tasks 3.4/3.5 build the caller-side guard, guard the **state-mutating funnel (`clear_and_persist`/`clear`)**, not enum membership or a single command's call sites, or the guard reproduces WP1's error in test form.
- [ ] 3.4 The button (one caller) + the programmatic entry point (the seam M15 will call). ⚠️ **Funnel both through ONE function and guard that function** — the recurring four-times-hit defect is a correct mechanism behind a caller that does not honor it.
- [ ] 3.5 ⚠️ **A caller-side guard, not only a machine-side one.** Extracting a pure state machine proves the MACHINE, not its CALLER — hit twice in M11 WP4, one a shipped CRITICAL. Guard the single funnel.
- [ ] 3.6 Verify the flag actually clears on a real recycle, and that a **subsequent open fires no `--continue`** (the negative arm — assert it just as hard).
- [ ] 3.7 Handle the stale-`.session.md` case from 1.4.

---

### WP4: Milestone exit verify + Group C close
**Description:** Verify both exit criteria live, then confirm Group C's metrics 2 and 3 are met.
**Milestone:** 13
**Dependencies:** WP2, WP3
**Size:** S

**Tasks:**
- [ ] 4.1 Exit criterion 1 — no slash-command typing for common skills (against Q1's curated set, live).
- [ ] 4.2 Exit criterion 2 — Recycle Session is a single click, end-to-end on a real session.
- [ ] 4.3 ⚠️ **The negative arm, asserted as hard as the positive:** gate OFF ⇒ no skill buttons, no Recycle button, nothing. Run all **five** guard arms individually.
- [ ] 4.4 Update `vision.md`'s success-metric status: 2 and 3 → met; Group C closes at M13.
- [ ] 4.5 ⚠️ Resync the `arch/` set **by subsystem, not by milestone** — the registry and Recycle belong in existing subsystem docs (`process-and-pty.md` for injection; `session-resumption.md` for the flag route; `workflow-gate.md` for the fifth arm). **Do not add a milestone section to `arch.md`.**
- [ ] 4.6 Confirm the WP1 probe outcomes still hold as-built; correct any that did not survive contact.

---

## Learning-sequence ordering

**Standard sequence adaptation.** Steps 1 (environment) and 2 (3rd-party probes) do not apply as written — the dev environment is long-proven, and there is no external API here. **The `~/.claude/skills/` directory and the CC process are the "external systems"**, and both get probed in WP1 before anything assumes their shape. Step 3 (UI validation) is folded into WP1's Q1 because the *scope* question (which skills appear) dominates the layout question. Steps 4–5 do not apply — nothing async wraps a synchronous path here.

**WP1 → WP2 rationale:** Q1 decides *what the surface renders*; Q2 decides *how a broken entry behaves*. Building the scan first and asking later means a 61-button wall gets built and thrown away, and the 11-dangling-symlink case gets discovered as a runtime error on the operator's machine instead of as a fixture.

**WP1 → WP3 rationale:** Q3 **is** Recycle's design. The roadmap compresses the hardest part into four words ("wait for `.session.md` write completion"), and Claudesk has no completion protocol for a skill running inside CC. Designing the sequence before observing the real signals is how you get a state machine that waits on the wrong event — and `Stop` fires on *every* turn end, which is the trap.

**WP2 ∥ WP3:** independent after WP1 — different surfaces, different backends, no shared state. Parallelizable if desired.

**WP2/WP3 → WP4 rationale:** the exit verify needs both surfaces present to assert the negative arm across all five guard arms at once.

## Dependency map

```
WP1 (probe) ──┬──> WP2 (registry + 5th guard arm) ──┐
              │                                      ├──> WP4 (exit verify + Group C close)
              └──> WP3 (Recycle, callable) ──────────┘
```

**Critical path:** WP1 → WP3 → WP4 (WP3 is the L; WP2 is M and can run alongside).

## Sizing note

Total **M + M + L + S**. The L is WP3, and it is L *because of the completion protocol*, not because of the byte injection (which is one existing function call).

⚠️ **RESOLVED at WP1 Phase 2 (2026-08-14): WP3 STAYS L, operator-confirmed.** The re-size to M was conditional on Q3 finding *an unambiguous marker*. **It found none** — the answer is a composite requiring a pre-sampled baseline, an ordering constraint between two signal kinds, a temp-file exclusion, and a mandatory failure arm. That is more design than the L estimate assumed, not less. The estimate held; no split needed.

## Cross-milestone notes

- **M15 (workflow supervisor) depends on WP3's callable seam.** That is why the scope note exists. M15 is otherwise **not decomposed** — it is probe-gated and its design is contingent.
- **Two open backlog items sit adjacent to M13**, neither blocking. ⚠️ **Both were examined at WP1 Phase 3 and both stay OPEN and UNLINKED** — the earlier suggestions to fold them in did not survive the examination:
  - `SURFACE-2026-08-03-TYPED-EXIT-LEAVES-THE-UNCLEAN-FLAG-SET` (`backlog.md`) — ⚠️ **do NOT fold into Q3** (this note previously advised doing so). Q3 detects completion of an operation *Claudesk initiated*; the `/exit` question classifies a boundary the *operator* created with nothing in flight. They **share the word "clean", not a mechanism** — Q3's composite marker cannot even be applied, since `/exit` produces no `.session.md` write to observe. It remains a standalone product question, and its option (b) (current behavior) is still defensible.
  - `SURFACE-2026-08-06-MANUAL-SESSION-START-MODE-MENU-INTERRUPTS-BEFORE-INTENT` — **touched by Q1** (`/session-start` IS in the chosen button set) but ⚠️ **not fixed by it, and WP2 must not claim it is**. The measured friction is *sequencing* (the mode menu precedes the operator's intent), a property of the skill's own prompt flow, not of the invocation door. Re-measure after the button ships.
- **Two seeded DEV-profile test values remain** — `scratch-a` → `autopilot`, `scratch-c` → `opus`. Prod untouched. Useful for WP1/WP3 verification.

## Probe outcomes

**WP1 complete 2026-08-14.** Evidence for every verdict below: `workflow-system/state/wip/m13-wp1-probe.md` (measurements, capture logs, rejected options). Q1 and the WP3 sizing carry explicit operator sign-off.

### Q1 — which skills does the button surface show? → **A TINY FIXED SET (exactly 5)**

Measured across **2470 transcripts**, separating operator-typed invocations (`user` role, `<command-name>`) from agent auto-chained ones (`assistant` role, `Skill` tool_use) — a discriminator **verified on a file containing both shapes** before counting.

**577 manual workflow-skill invocations, 11 distinct skills of the 50 invocable** (61 entries − 11 dead symlinks)**:** `/session-restore` **531 (92.0%)** · `/session-start` 25 (4.3%) · all others combined 21 (3.6%).

⚠️ **Zero manual `feature-*` / `task-* `/ `product-*` invocations, ever.** Those are the agent's vocabulary (`feature-build` 910 agent-side). **A per-skill registry would have surfaced the agent's vocabulary, not the operator's** — which is why the roadmap's "render each skill as a button" line does not survive contact with the data.

**Set:** `/session-start` · `/session-capture` · `/util-prune-claude-md` · `/util-backlog-paydown` · Recycle. ⚠️ **`/session-restore` excluded despite being 92% — already AUTOMATIC** (M12's open-time auto-fire; ⚠️ **NOT** `sessionStartButton.ts`, which fires `/session-start` — see the correction in WP2 above). Full rejected-option table in WP2 above and in the WIP.

### Q2 — how does the scanner behave on the real directory? → **MEASURED, but now largely MOOT**

**61 entries** (59 global + 2 project-local), **50 valid / 11 dangling symlinks** — matching the pre-decomposition finding exactly. Two breakage flavors in the real dir (two dead tmp roots); a **synthetic fixture** exercised six classes, four of which the real dir cannot produce (`missing-skill-md`, `no-frontmatter` ×2 forms, `no-name-field`, `not-a-directory`). Frontmatter shape confirmed: `name:` + `description:` on all 50, `argument-hint:` on 48 (absent on both project-local skills — genuinely optional).

⚠️ **Q1's verdict demotes this.** A fixed 4-skill set needs no enumeration, so the dangling-symlink handling is no longer load-bearing. Retained here because WP2's (i)/(ii) decision may still want a per-path existence check. ⚠️ **Also measured: the classifier collapses "no frontmatter" and "unterminated frontmatter"** into one class (`SURFACE-2026-08-14-SKILL-SCAN-COLLAPSES-TWO-FRONTMATTER-ERRORS`) — only relevant under (ii).

### Q3 — what is Recycle's completion protocol? → **NO SINGLE MARKER; a COMPOSITE (operator-confirmed)**

Three real `/session-handoff` runs captured against a fresh CC in `tmp/scratch/scratch-a`, hook events + filesystem events on one monotonic clock. **The full signal table, the killed candidates, and the mandatory failure arm are in WP3 above** — that is where WP3 will read them. Headline: `Stop` alone is meaningless (run 2 emitted one having written nothing), existence is true before the operation starts, and **the `.session.md` write lands 9–12s BEFORE the skill finishes**.

### Q4 — does Recycle's respawn go through `cc_spawn_env`? → **YES, one unbroken path**

`XtermPane` → `cc_spawn` → `SessionRegistry::spawn` → `resolve_cc_spawn_env` (`cc_session/mod.rs:1092`, **the only production call site**) → `cc_spawn_env` → `PtyCcSession::spawn`. `spawn` takes the **already-composed** env, so composition cannot be re-decided at the spawn site. **If Recycle respawns via `cc_spawn`, the drive-mode signal is free and nothing is built.** ⚠️ No abstraction built either way, per the standing instruction.

### Cross-cutting findings that change other WPs

1. ⚠️ **WP3 task 3.3 was WRONG as written** — `CleanExitRoute::RecycleSession` **already exists** (enum, `ALL`, wire name, TS union, and a test pinning it "for M13"). The task is **wiring**, not adding. Corrected in place.
2. ⚠️ **The unclean-exit flag has TWO writers by design** — `session_state_mark_clean` (IPC, used by `WorkspaceClose`) and `clear_and_persist` (in-process, used by `AppQuit`). WP1 initially mis-reported `AppQuit` as caller-less and filed it as a defect; **that finding was RETRACTED before any code changed**, because the sweep audited one mechanism's callers and generalized to a second writer that does not use it. ⚠️ **WP3's caller-side guards (3.4/3.5) must guard the state-mutating primitive, not one command's call sites**, or they reproduce that error in test form.
3. ⚠️ **`sessionStartButton.ts` disposition → the verdict is KEEP PINNED, but the REASONING was corrected 2026-08-14 and the correction matters more than the verdict.** An earlier draft argued the two surfaces serve **disjoint** skills. ⚠️ **They do not — they OVERLAP.** `sessionStartButton.ts` fires `/session-start`, and `/session-start` is **in the new button set**. That is precisely the *"two mechanisms serving one skill"* case the WBS calls "the problem". **So WP2 must NOT simply add a second `/session-start` button beside the existing one.** The disposition is: **`sessionStartButton.ts` IS the `/session-start` button** — WP2 either renders the new row *around* it or moves it into the row, but **exactly one `/session-start` affordance may exist when it is done.** ⚠️ Task 2.7 must be executed against this corrected reading, not the "disjoint" one.

### Sizing outcomes

- **WP3 stays L** — operator-confirmed. The re-size to M was conditional on finding an unambiguous marker; none exists.
- **WP2 M → S candidate** — the scan was the bulk of its M. Decide at plan time; do not inherit M by default.

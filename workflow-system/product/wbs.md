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
- A scanner that reads `<dir>/SKILL.md` per entry hits an **I/O error on 11 of 61** entries. Error handling is not a polish task here — it is the **modal case on the operator's real machine**.
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
- The chord arm was rebuilt **per-export** (not per-module) at the 2026-08-12 paydown WP2; that file is now at **24 tests** (was 19). Read its header before extending.

---

## Reuse inventory — verified present, do NOT rebuild

| Seam | Location | Status |
|---|---|---|
| `slash_command_bytes(command)` | `src-tauri/src/cc_session/mod.rs:266` | ⚠️ **The** injection primitive. Trims trailing CR/LF, appends exactly one `\r`. **All injection goes through it** (arch load-bearing line). First consumed M12 WP3. |
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
- [ ] 1.1 Measure the real scan: enumerate both dirs, classify each entry (valid / dangling symlink / missing `SKILL.md` / unparseable frontmatter), report counts.
- [ ] 1.2 Present Q1's options to the operator with the 61-entry reality and the "common, not all" exit-criterion reading; record the verdict + rejected alternatives.
- [ ] 1.3 Instrument a real `/session-handoff` in a **scratch workspace** (`tmp/scratch/scratch-{a,b,c}` — mandatory once a check spawns/answers a CC session) and record every observable signal with timestamps: hook events, `.session.md` create/write/close, CC exit.
- [ ] 1.4 Repeat 1.3 with a **stale `.session.md` pre-existing** to test marker ambiguity.
- [ ] 1.5 Read `cc_spawn_env`'s call graph; answer Q4 yes/no in one sentence with the call path.
- [ ] 1.6 Decide the `sessionStartButton.ts` disposition (absorb vs keep pinned) and record it.
- [ ] 1.7 Write "Probe outcomes" into this file.

---

### WP2: Skill registry — scan, model, and the gated surface
**Description:** The backend scan + the frontend button surface, in the shape WP1's Q1 verdict selected. Includes the **fifth OFF-invariant guard arm**.
**Milestone:** 13
**Dependencies:** WP1 (Q1 decides what is rendered; Q2 decides scan-failure behavior)
**Size:** M

**⚠️ The dominant risk here is not the scan — it is that the registry is exactly the shape `CLAUDE.md` warns about.** *"Enumerating routes/skills as data makes the SET testable but does NOT prove each member has a CALLER."* M12 shipped a `/exit` clean-exit variant that round-tripped through two test suites while being called by **nothing**, and the exhaustiveness test's green **read as coverage**. A skill registry is that shape at larger scale. ⚠️ **Read WP4's CHANGELOG entry from the 2026-08-12 paydown sweep before building** — that WP was entirely this theme, and it found a guard *enforcing* the defect.

**Tasks:**
- [ ] 2.1 Rust: scan both skill dirs, parse `name:`/`description:`/`argument-hint:` from frontmatter, return a typed list + a diagnostics count. Per Q2's verdict on broken entries. ⚠️ No `unwrap()`; `?` with `thiserror`.
- [ ] 2.2 Frontend: the button surface in Q1's chosen shape, consuming the gate **only** via `useWorkflowFeaturesEnabled` (type-level, executable reference — the guard strips comments).
- [ ] 2.3 Wire each button through `slash_command_bytes` to the **active** workspace's CC pane. ⚠️ Never a second injection path.
- [ ] 2.4 **The fifth guard arm.** Assert the **computed** OFF-state value of the skill-button registry. Follow the row-cell arm's shape; read the file's header first (24 tests, per-export chord arm).
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

**Tasks:**
- [ ] 3.1 Model the sequence as an explicit **state machine** (a pure function over observed signals → next action), separate from any UI. ⚠️ `?raw` guards verify structure, never runtime — anything involving async/event ordering must be **extracted to a pure function and asserted as a value**.
- [ ] 3.2 Implement each step's wait against Q3's **observed** signal table, with an explicit timeout + failure surface per step. ⚠️ A hung step must be visible, not silent.
- [ ] 3.3 Add the new `CleanExitRoute` variant; clear the flag through `key_for()`. ⚠️ Opt-in at this route only.
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

Total **M + M + L + S**. The L is WP3, and it is L *because of the completion protocol*, not because of the byte injection (which is one existing function call). If WP1's Q3 finds an unambiguous marker, WP3 may re-size to M; if it finds none, WP3 grows and may need splitting. ⚠️ **That re-size is the expected outcome of a probe doing its job** — record it rather than defending the original estimate.

## Cross-milestone notes

- **M15 (workflow supervisor) depends on WP3's callable seam.** That is why the scope note exists. M15 is otherwise **not decomposed** — it is probe-gated and its design is contingent.
- **Two open backlog items sit adjacent to WP3**, neither blocking: `SURFACE-2026-08-03-TYPED-EXIT-LEAVES-THE-UNCLEAN-FLAG-SET` (`backlog.md:109` — whether a typed `/exit` counts as clean is an unanswered *product* question next to Recycle's flag work) and `SURFACE-2026-08-06-MANUAL-SESSION-START-MODE-MENU-INTERRUPTS-BEFORE-INTENT` (`:53` — 24 of 524 opens; a skill-button surface is where it would be fixed). ⚠️ Consider folding the first into WP1's Q3, since both concern what "clean" means at a boundary.
- **Two seeded DEV-profile test values remain** — `scratch-a` → `autopilot`, `scratch-c` → `opus`. Prod untouched. Useful for WP1/WP3 verification.

## Probe outcomes

*(WP1 writes here. Empty until the probe runs — an empty section is honest; a pre-filled one would be confabulation.)*

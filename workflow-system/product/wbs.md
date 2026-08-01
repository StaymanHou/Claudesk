---
stage: wbs
state: complete
updated: 2026-07-31
milestone: "Milestone 11.5 — QoL polish bucket (per-project model override + pre-M11 guard debt)"
---

# WBS — Milestone 11.5: QoL polish bucket

Decomposes **Milestone 11.5 only** (`roadmap.md` → "Milestone 11.5"). Future milestones (M11 docs viewer — decomposition parked at `m11-wbs-parked.md` — M12, M13, M14) stay tracked in `roadmap.md` and are decomposed just-in-time.

All four deliverables are **workflow-independent lite-IDE core**, so **nothing in this milestone touches M10.9's `workflow_features_enabled` gate as a consumer** — WP4 *repairs the guard that protects it* but adds no gated surface. The `useWorkflowFeaturesEnabled` seam still ends this milestone with **zero consumers**, as designed; M11's Docs tab remains the first.

---

## Scope-audit findings (read before planning any WP)

Three things the roadmap's deliverable text asserts were checked against the code, and **one is materially wrong**. Correcting it is why WP1 is sized M rather than S and why it carries a probe task.

### ⚠️ Finding 1 — the "exact precedent to mirror" does NOT exist as described (reshapes WP1)

`roadmap.md` says the model override's *"exact precedent to mirror, not reinvent"* is **"the M6 permission-mode dropdown (per-workspace, persisted, applied at spawn) + `default_drive_mode` in `projects.json`."** Verified against the source, that precedent is **two half-precedents, neither of which is per-project**:

| Claimed precedent | What the code actually is | Reusable? |
|---|---|---|
| M6 permission-mode dropdown | **App-global.** Lives in `AppSettings.cc_permission_mode` (`config_store/settings.rs`), read at spawn in `SessionRegistry::spawn` (`cc_session/mod.rs:721-729`), surfaced in the `⌘,` Settings panel + a View-menu radio. There is **no per-workspace permission mode.** | The **shape** (typed value → persisted → read-at-spawn → `--flag` → pure `build_cc_argv` → event-rebroadcast) is an excellent template. The **storage location and the app-global surface are not.** |
| `default_drive_mode` in `projects.json` | Exists on `Project` (`config_store/mod.rs:53`) but is documented **"Reserved for Phase 2 (WP15). Never read or written in Phase 1 — present so the on-disk shape is forward-stable."** It is a typed placeholder with **no read path, no write path, and no UI.** | Proves the `Project` struct is the right home and that adding an `Option<T>` field is forward-compatible. Provides **no** working per-project read/write/surface code to copy. |

**Consequence:** `default_model` is the **first genuinely per-project, read-at-spawn setting in Claudesk.** WP1 must build a per-project read/write path that does not exist yet, not clone one. Two specifics fall out:

- **The read seam is already in the right place.** `SessionRegistry::spawn(app, project_path)` (`cc_session/mod.rs:721`) *already receives* `project_path`, so a per-project read needs no signature change — it reads the project record by path alongside the existing app-global permission-mode read. This is why the work is M, not L.
- **The permission-mode analogy still governs *argv*.** Extend the pure `build_cc_argv` (`cc_session/mod.rs:303`) rather than assembling args at the call site. Note the existing function passes `--permission-mode` **unconditionally** (even for `Default`, deliberately, "to keep the mapping uniform"); `--model` must behave **oppositely — omitted entirely when unset**, because "inherit CC's global default" has no representable flag value. That asymmetry is a deliberate deviation from the precedent and must be pinned by a test.

*(Roadmap correction is WP1 task 1.7 — the deliverable text should say "mirror the permission-mode **mechanism**; the per-project **storage** is new.")*

### ⚠️ Finding 2 — the minimap prime suspect is confirmed present, but is only *half* an explanation (keeps WP2 reproduce-first)

`editorExtensions.ts:217` does read `showMinimap.compute([], () => ({ … }))` — the empty deps array is real, exactly as the roadmap predicted from a static read. **This does not license skipping reproduction.** `compute([])` freezes the *facet value* (the config object, incl. the `create`d container); whether the minimap's **content** re-renders is governed by `@replit/codemirror-minimap`'s own update cycle reading the document from the view, which the frozen config does not obviously prevent. So the deps array explains a frozen *config*, and the reported symptom is stale *content* — those are only the same bug if the package derives content from the config snapshot. Reproduce first, both sources (external disk reload **and** local typing), then fix the mechanism the reproduction actually implicates. The roadmap's warning stands and is upheld here.

### ✅ Finding 3 — the chord-arm defect is exactly as filed, and the fix target is confirmed

`offInvariantGuard.test.ts:134` filters candidates with `if (!/hord[A-Za-z]*\.tsx?$/i.test(base)) return false;` where `base` is the **basename**. `src/components/workspace/panelHost.ts` exports `panelForChord` (line 78) and does not match `/hord/`, so it is skipped — proven at M10.9 WP5.2 probe 5b (an identical ungated workflow chord predicate placed there passes 10/10). There are **12 non-test `*hord*.ts` modules** today (`settingsChord`, `newTerminalChord`, `closeTerminalChord`, `newWorkspaceChord`, `chordEvent`, `workspaceSwitchChord`, `newFileChord`, `searchChord`, `dashboardChord`, `finderChord`, `closeTabChord`, `tabSwitchChord`) plus `panelHost.ts` as the one known miss — so the candidate set is small enough that a content-based selector is cheap, and large enough that hardcoding a file list would rot.

---

## Work Packages

### WP1: Per-project CC default-model override — ✅ SHIPPED 2026-07-31 (commits `e0c28ac` + review fixes `df8e002`)
**Description:** A `default_model: Option<String>` field on the `Project` record in `projects.json`, surfaced as a **visible control on each project's picker row** (per `[[explicit-selectable-mode-over-inferred-mode]]` — the value reads without interaction; ⚠️ **as-built**: planned for the workspace header, relocated to the picker row at Phase 2 verify-human, 2026-07-31), read at spawn time and passed to CC as `--model <value>`. **Unset = the field is omitted from argv entirely**, so CC applies its own global default and every existing project is untouched. Solves the operator's framing: *the global CC default means you forget to switch models back after using one on a project.*
**Milestone:** 11.5
**Dependencies:** none (first WP — the operator's lead ask, so it goes first; see the ordering rationale)
**Size:** M
**Tasks:**
- [x] 1.1 **Probe (≤30 min, inline — not a separate WP):** run `claude --help` and record what `--model` actually accepts (alias vs. full ID vs. both) and whether an invalid value fails at spawn or is silently ignored. This is a **local CLI read, not a 3rd-party network integration** — per the §"3rd-party probe" rule below it does not warrant its own probe WP, but the answer decides task 1.4's control shape and the failure copy, so it is task #1. *(Precedent: `[[feedback_read_help_before_cli_matrix]]` — five seconds of `--help` collapses matrix rows.)*
- [x] 1.2 Add `default_model: Option<String>` to `Project` (`config_store/mod.rs`), `#[serde(default, skip_serializing_if = "Option::is_none")]` so existing `projects.json` files round-trip byte-identically when unset. Add a round-trip test proving an unset field does not appear on disk and an existing file without the key still parses.
- [x] 1.3 Build the per-project read/write path (**new — no precedent to copy, per Finding 1**): a getter keyed by project path + a setter that persists to `projects.json` preserving all other fields. Mirror the *discipline* of `settings.rs`'s field-preserving writes, not its app-global storage.
- [x] 1.4 Extend the pure `build_cc_argv` (`cc_session/mod.rs:303`) to take the optional model and append `--model <value>` **only when `Some` and non-empty after trim**. Pin with tests: `None` → argv contains no `--model` (the deliberate asymmetry with `--permission-mode`, which is always passed); `Some("x")` → exactly one `--model x` pair; `Some("  ")` → treated as unset.
- [x] 1.5 Read the project's `default_model` in `SessionRegistry::spawn` (`cc_session/mod.rs:721`) alongside the existing permission-mode read — **no signature change needed**, `project_path` is already a parameter. A read failure or missing project record degrades to `None` (inherit CC's default), never to an error that blocks the spawn.
- [x] 1.6 Surface the control **on each project's picker row**, right-aligned (⚠️ **AS-BUILT CORRECTION 2026-07-31** — this task said *workspace header*; it was built there, the operator **rejected the placement at Phase 2 verify-human**, and it now lives on the picker row as a compact **click-to-edit label**. The prior still holds: the *value* is visible without interaction on every row; only the *edit affordance* is behind a click. See design prior `set-a-spawn-time-choice-where-the-spawn-is-chosen`), with an explicit "Default (CC's own)" placeholder for unset. **No hardcoded model-ID list** — per the roadmap constraint, prefer free-text entry with a recently-used/derived suggestion list so the control cannot rot on the next CC release. Show the active value without requiring a click. Communicate that a change applies to the **next** spawn (same semantics as the permission mode) rather than silently doing nothing to the running session.
- [x] 1.7 Correct `roadmap.md`'s M11.5 deliverable text per **Finding 1** (the precedent is the permission-mode *mechanism*; the per-project *storage* is new), and correct M14's stale "default CLI args for `claude`" line as the roadmap itself instructs (it lists PiP + permission-mode as future work; both shipped at M5/M6, and this WP consumes the `--model` part).
- [x] 1.8 Verify: the choice persists across relaunch, an unset project spawns with no `--model` in its argv (checkable via `ps`), and a set project spawns with the chosen value.

**Design-prior note:** `[PRIOR: explicit-selectable-mode-over-inferred-mode]` fires on **rule 2 (agrees with the common-sense default)** — the roadmap already mandates a visible workspace control, and the prior independently points there. Taken with higher confidence, no disclosure needed in the build. Its *continuous → discrete* face does **not** fire here (over-infer guard, rule 5): the roadmap's no-hardcoded-list constraint requires an open value set, so "a few discrete presets" is not available; the prior governs *visibility of the choice*, which is honored.

---

### WP2: Editor minimap stale on file update (reproduce-first)
**Description:** The editor minimap does not re-render when file content changes; the document text updates correctly, so the minimap stops corresponding to the buffer it summarizes — **actively misleading as a navigation aid, which is worse than absent**. Resolves `SURFACE-2026-07-31-EDITOR-MINIMAP-STALE-ON-FILE-UPDATE`.
**Milestone:** 11.5
**Dependencies:** none (independent of WP1 — different subsystem, no shared files)
**Size:** S–M *(S if the deps array is the whole story; M if the package's update cycle is implicated — Finding 2 is why this is a range and not a point)*
**Tasks:**
- [ ] 2.1 **Reproduce first, in both directions** — this is the load-bearing task and gates everything after it. Confirm staleness on (a) an **external disk reload** (the common Claudesk case: CC edits the file underneath the editor) and (b) **local typing**. Record which reproduce. *Why both:* if typing is also stale, the bug is broader than the reload path and the fix target changes. Use `/feature-reproduce`'s red-green discipline — a failing check before any fix.
- [ ] 2.2 Write the failing test that encodes the reproduction (red). Prefer asserting an observable value over a `?raw` source guard — per the M10.9 WP2 lesson, `?raw` guards verify **structure, never runtime**, and one such guard there passed while the behavior was broken.
- [ ] 2.3 Diagnose against the reproduction, starting from the confirmed suspect (`editorExtensions.ts:217`'s `showMinimap.compute([], …)`) **but not assuming it is sufficient** — check `@replit/codemirror-minimap`'s own update cycle to establish whether the frozen facet value actually prevents content re-render, or whether something else does (Finding 2).
- [ ] 2.4 Fix the mechanism the reproduction implicates. **Constraint:** if the fix recreates the container, it MUST preserve the `cm-minimap-narrow` marker class, or the 90px width clip in `App.css` silently regresses (the WP11 override is scoped by that class). Add a check that pins the class through the fix.
- [ ] 2.5 Green the test; verify live in the running app on both change sources that reproduced.
- [ ] 2.6 **Do not touch** the `EditorSplit` `checkDisk` → `diskDecision` → `reloadFromDisk` path unless the reproduction implicates it. The roadmap explicitly clears it as not-suspect (consistent with the text updating correctly), and it is shared machinery.

**Note on `dashboard/Minimap.tsx`:** unrelated — that is the M9 timeline component. This WP is the **editor** minimap (`@replit/codemirror-minimap` via `editorExtensions.ts`). Named here because the collision has bitten before.

---

### WP3: Time-tracking states it is offline + local-only
**Description:** A short reassurance line on the `time_tracking_enabled` setting stating that capture is offline and stored locally. The feature has **always** been local-only (a local SQLite `time_store`, no network path) — nothing in the UI ever said so, which is a trust gap for a privacy-conscious user toggling it on. Resolves `SURFACE-2026-07-20-TIME-TRACKING-OFFLINE-LOCAL-ONLY-MESSAGING`.
**Milestone:** 11.5
**Dependencies:** none
**Size:** XS
**Tasks:**
- [ ] 3.1 Write the copy into the **existing per-setting help-line slot** in the `⌘,` Settings panel (`components/settings/SettingsPanel.tsx`) — M10.9 WP2 already built that slot, which is why this is cheaper than when filed. Roadmap's candidate copy: *"Offline · stored locally on this Mac, visible only to you"* (exact wording at build time).
- [ ] 3.2 **Copy-only — no data-flow change.** Do not touch `time_store`, the write gate, or the capture path. If the copy cannot be written truthfully without a code change, that is a finding to surface, not a scope expansion to absorb.
- [ ] 3.3 Optionally extend to the dashboard empty-state (roadmap says "optionally") — include only if it costs nothing; skip rather than grow the WP.
- [ ] 3.4 Re-verify the M9 `PRIVACY-TEST-COINCIDENTAL-SUBSTRING` self-consistency test still holds (it asserts on privacy-related strings; new copy is exactly what could trip it).
- [ ] 3.5 Add a control-wiring check consistent with the panel's existing per-setting test discipline (`settingsPermissionModeWiring.test.ts` is the shape).

**⚠️ Flagged for the operator, non-blocking:** this claim is **machine-scoped, and there is a known caveat worth not contradicting.** Per `[[time-tracking-capture-is-machine-global]]`, a tracking-ON Claudesk logs **all** CC sessions on the machine, including those of another Claudesk instance. "Offline · stored locally · visible only to you" is **true** (no network, local SQLite, single-user) and does not contradict that — but if you want the copy to also convey *scope* ("all CC activity on this Mac"), say so and I will widen it. Proceeding with the roadmap's copy intent as written; this is a copy-precision call, not a correctness one.

---

### WP4: OFF-invariant guard — chord arm selects by content, not basename
**Description:** The OFF-invariant guard's chord arm selects candidate files by **basename** (`/hord[A-Za-z]*\.tsx?$/i` at `offInvariantGuard.test.ts:134`), so it skips `panelHost.ts` — the module that owns `panelForChord` and the most natural home for an M11 Docs chord. Select by **content**. Resolves `SURFACE-2026-07-28-QUALITY-WP2-CHORD-ARM-MISSES-PANELHOST` (MAJOR, from M10.9 WP2's review; **upgraded from review-inference to proven defect** at M10.9 WP5.2 probe 5b).
**Milestone:** 11.5
**Dependencies:** none
**Size:** S
**Tasks:**
- [ ] 4.1 Replace the basename filter with a **content-based** predicate that identifies a chord-predicate module by what it *does* (e.g. reads a chord-shaped keyboard event / exports a chord-mapping function), so a module is selected for owning chord logic rather than for being named `*Chord*`. Verify against the current tree: it must still select the **12 existing non-test `*hord*` modules** (`settingsChord`, `newTerminalChord`, `closeTerminalChord`, `newWorkspaceChord`, `chordEvent`, `workspaceSwitchChord`, `newFileChord`, `searchChord`, `dashboardChord`, `finderChord`, `closeTabChord`, `tabSwitchChord`) **and additionally** `panelHost.ts`.
- [ ] 4.2 **Mutation-prove the arm bites at its new reach** — the WP's actual deliverable. Per M10.9 WP3.5a's lesson (*"for a safety-critical property, a guard must be mutation-proven, not merely present"* — three guards there looked like proof and were not), and per the exit criterion: temporarily place an ungated workflow-coupled chord predicate in **`panelHost.ts`** and confirm the guard **fails**; revert. Re-run the WP5.2 probe that passed 10/10 and confirm it now fails.
- [ ] 4.3 **Probe arm-by-arm, never with one composite bypass** — the method note from M10.9 WP5.2, which is exactly how this hole was found: a composite bypass tripping *some* arm reports "the guard bites" while hiding a gap. Confirm the other four arms (panel · menu-id · raw-command bypass · wrapper bypass) still bite **individually** after the change.
- [ ] 4.4 Guard against the opposite failure — **false positives**. The existing matcher is deliberately word-boundary-based because a substring match on `docs` fired on `docstring`; a broader *file selector* raises the same risk from the other side. Confirm the full frontend suite (~1400 tests) stays green and no legitimate module is newly flagged. A guard that cries wolf gets deleted by the next person who trips it — that reasoning is in the test's own comments.
- [ ] 4.5 Update the arm's explanatory comment to state the selector is content-based and why (the basename version's proven miss), so the next reader does not "simplify" it back.

**⚠️ Schedule note — this WP is why the whole bucket precedes M11.** M11 landing its Docs tab is precisely the moment this arm must fire, and `panelHost.ts` owns `panelForChord`. A guard that cannot see the module it is guarding is decorative. **This WP must be complete before M11 begins.**

---

## Learning-Sequence Ordering

**Standard sequence deviation — stated rationale.** The standard ordering (environment → 3rd-party probes → UI prototypes → sync backend → async) **does not apply to a QoL bucket** and is deliberately deviated from:
- **Environment:** already proven — Claudesk has shipped 12 milestones on this toolchain. Nothing to prove.
- **3rd-party probes:** no external API/SDK/service is involved. WP1 touches the **local `claude` CLI**, already a shipped dependency spawned by `PtyCcSession` since M1 — a `--help` read (task 1.1) is the right-sized instrument, not a probe WP. See §"3rd-party integration rules" below.
- **UI prototypes:** no multi-screen flow is being designed. WP1 adds one control to an existing header; WP3 fills an existing help-line slot. Per `/util-option-mockup`'s discriminator, neither is even a *decision-tool* case — nothing spatial varies.
- **Async/orchestration:** none introduced anywhere in this milestone.

**The four WPs are mutually independent** — no shared files, no shared subsystems:

| WP | Subsystem | Primary files |
|---|---|---|
| WP1 | CC spawn + project config | `config_store/mod.rs`, `cc_session/mod.rs`, ~~workspace header~~ → **picker row** (`components/picker/`, relocated at verify-human 2026-07-31) |
| WP2 | CodeMirror editor | `editor/editorExtensions.ts`, `App.css` |
| WP3 | Settings copy | `settings/SettingsPanel.tsx` |
| WP4 | Test infrastructure | `state/__tests__/offInvariantGuard.test.ts` |

So ordering is by **operator value and deadline**, not by technical dependency:

- **→ WP1 first:** the operator's explicit lead ask, requested "sooner than later," and the largest of the four. It also carries the only real unknown in the milestone (Finding 1's absent precedent + task 1.1's `--help` question), so front-loading it resolves the riskiest thing while re-planning is cheapest — the learning-sequence principle applied to the *bucket's own* risk profile rather than to a generic build stack.
- **WP1 → WP2 rationale:** WP2 is the only WP with a genuinely unknown root cause (Finding 2: the confirmed suspect explains a frozen config, while the symptom is stale content). Second position gives its reproduce-first step room to expand the WP from S to M without threatening the deadline-bearing WP4, which sits behind it and is fully understood.
- **WP2 → WP3 rationale:** WP3 is XS, fully specified, and zero-risk (copy into an existing slot). It sits after the two unknowns so it can absorb a slip without becoming the reason the bucket slips.
- **WP3 → WP4 rationale:** WP4 is last in *sequence* but **hard-gated on the milestone exit**, not on M11 being imminent — it is the one item with an external deadline (M11's Docs tab), and it is fully understood with a known target file and a known mutation-proof. Last position is safe **only because** it is dependency-free and can be pulled forward if anything ahead of it slips. **If the bucket is cut short for any reason, WP4 ships anyway** — it is the non-negotiable item, since a decorative guard at M11 time is the failure this bucket exists to prevent.

**Ordering is advisory except for WP4's completion.** Any WP may be pulled forward; the only hard constraint is that WP4 completes before M11 begins.

---

## 3rd-Party Integration Rules — compliance

**No WP calls an external API, uses a new 3rd-party SDK, or depends on an external service.** Checked explicitly rather than assumed:

- **WP1** invokes the local **`claude` CLI**, already spawned by `PtyCcSession` since M1 — an existing, shipped, in-process dependency, not a new integration. Its `--model` flag is a **local CLI surface**, read via `--help` (task 1.1). The rule's purpose is to prevent designing a data model around *assumed* remote I/O shapes; here the "shape" is one string flag whose accepted values are readable in seconds, and the roadmap's no-hardcoded-list constraint means we deliberately **avoid** encoding that value set at all. A probe WP would produce a document to justify a decision already made.
- **WP2** touches `@replit/codemirror-minimap`, an already-integrated pinned dependency (M2/WP11). Task 2.3 reads its update cycle — that is diagnosis inside a shipped integration, not a new one.
- **WP3** and **WP4** are internal (copy; test infrastructure).

**No planning gap. No probe WP required.** This is a deliberate, reasoned conclusion, not an omission — recorded here so a later reader can check the reasoning rather than re-derive it.

---

## Dependency Map

```
WP1 (per-project model override)  ─┐
WP2 (minimap stale)               ─┤   all four independent —
WP3 (time-tracking copy)          ─┤   no shared files, no shared subsystems
WP4 (chord-arm guard fix)         ─┘
                                    │
                                    ▼
                        M11.5 milestone exit
                                    │
                                    ▼
             M11 (docs viewer) ◄── HARD GATE: WP4 must be complete
```

- **Critical path:** none technically. The *schedule-critical* item is **WP4** (external deadline: M11's Docs tab).
- **Parallel tracks:** all four are fully parallelizable. Sequential execution is chosen for focus, not forced by dependencies — a single operator with one attention budget, which is the project's own thesis.
- **No WP is XL.** Largest is WP1 (M). No splitting required.

---

## Open bucket status

Per `roadmap.md`, M11.5 is an **OPEN collection bucket** in the M6/M10.5 tradition — papercuts hit during the work may be appended as WP5+ before or during execution.

**The bucket's value is that it stays tight.** M10.5 closed at 4 WPs without accreting, and every addition pushes out the model override the operator asked for "sooner than later." The roadmap records five items **considered and deliberately scoped out** at the 2026-07-31 scoping pass — the rest of the `?raw`-guard family, the remaining M10.9 MINORs, per-result/per-file replace, turn-output re-orientation, and split-pane cursor reset. **Do not re-absorb them here without an explicit operator decision**; each has a recorded reason.

**Standing advisory, not part of this WBS:** ~19 deferred code-quality finding groups have been rolling forward since M5. `/util-backlog-paydown` exists for exactly this between-milestone moment. The M11.5 scoping pass already considered and **scoped out** a full paydown sweep — noted here so the option is visible, not to reopen it.

**Two items worth folding in opportunistically (zero new scope, only if a WP already opens the file):** `SURFACE-2026-07-29-CFG-TEST-SPLIT-BLINDS-SOURCE-GUARDS` is a **partial** resolution — `workflow_install/` got all three remedies, but `workflow_gate/commands.rs:76` and `workflow_substrate/commands.rs:87` still use the vulnerable `split("#[cfg(test)]")`. Two-line fix each. No WP here is expected to open those files, so this is genuinely opportunistic — **do not add a WP for it.**

---

## Exit Criteria (from `roadmap.md`, mapped to WPs)

| Exit criterion | WP | Verification |
|---|---|---|
| Opening a workspace spawns CC with that project's chosen model (unset → CC's own default) | WP1 | `ps` shows `--model <value>` for a set project and **no** `--model` for an unset one (1.8) |
| The choice is visible **on the picker row** and persists across relaunch | WP1 | ✅ MET — picker-row cell (1.6, relocated from the header at verify-human); relaunch persistence verified live (1.8) |
| The model control does not depend on a hardcoded model-ID list | WP1 | Free-text + derived suggestions, no enumerated ID set (1.6) |
| The editor minimap tracks the buffer through **both** an external disk reload and local typing | WP2 | Red-green: a test failing on today's behavior (2.1/2.2), green after the fix (2.5) |
| The `time_tracking_enabled` setting states capture is offline and local-only | WP3 | Copy in the per-setting help line (3.1); privacy self-consistency test holds (3.4) |
| The OFF-invariant guard's chord arm selects by content and is **mutation-proven to bite** on a chord added in `panelHost.ts` | WP4 | Content selector (4.1); mutation proof — the WP5.2 probe that passed 10/10 must now **fail** (4.2) |

**Milestone-exit note:** no separate exit-verify WP. M11.5 is a bucket of independent papercuts, each with its own verification, not a system whose *integration* needs proving — unlike M5/M7/M9/M10.9, whose exit WPs verified emergent cross-component behavior. WP4's mutation proof is the one exit-shaped check, and it lives inside WP4 where the change is.

**Deferred-to-`/release` carry (inherited, not new):** the installed-`.app` fresh-profile first-run check rides the next `/release` gate per `[[installed-build-verify-deferred-to-release]]`, along with `SURFACE-2026-07-31-SUBSTRATE-DETECTION-CANNOT-TELL-MCCC-FROM-THE-USERS-OWN-SKILLS` (fixed on `main`, still live in released v0.2.9). **WP1 is PATH/spawn-adjacent, so it inherits the standing `CLAUDE.md` convention:** a feature touching external-process spawning must be smoke-tested from a freshly-built installed `.app`, not just `pnpm tauri:dev`. Per the design prior, that check is **deferred to the release gate** rather than blocking WP1's verify-human — flagged so it is not lost.

---

## Architecture assessment

**No architectural gaps. No `/product-arch` back-loop needed (P9, not P8).**

Each WP extends a shipped, documented seam rather than introducing a new one:

- **WP1** — `Project` (`config_store/mod.rs`) already carries an `Option` field precedent (`default_drive_mode`) proving the on-disk shape is forward-stable; `SessionRegistry::spawn` already receives `project_path`; `build_cc_argv` is already the pure argv seam. The **new** element — a per-project read-at-spawn path — is *within* the existing `config_store` + `cc_session` boundary and adds no cross-module coupling. It does add the project's **first working per-project setting**, which is worth recording in `arch.md` at close (as-built) but is not a gap to design up front.
- **WP2** — a bug fix inside the M2 editor extension array.
- **WP3** — copy into the M10.9 WP2 Settings panel's existing per-setting slot.
- **WP4** — a test-infrastructure fix, no production code.

Nothing here touches the `CcSession` trait boundary, the hook channel, the status broadcaster, or the gate seam's contract.

**One doc-resync item for close:** WP1's per-project read path is a genuine as-built architectural addition (the first per-project setting with a live read/write path). Record it in `arch.md` at `/product-finalize` — flagged now so the close does not have to rediscover it.

### ⚠️ WP1 as-built — the specific content `/product-finalize` must record in `arch.md` (written at WP1 Phase 3, 2026-07-31)

Five things, because the WBS's own prediction was only partly right and the differences are the load-bearing part:

1. **The per-project read/write path (as predicted).** `Project.default_model: Option<String>` in `config_store/mod.rs` with `skip_serializing_if` (unset ⇒ key absent from disk, so every pre-M11.5 `projects.json` round-trips byte-identically) + `read_default_model` / `set_default_model`, both keyed by verbatim project path. **Claudesk's first per-project setting with a live read/write path** — `default_drive_mode` remains the never-read placeholder it always was, and the two must not be confused.
2. **The argv asymmetry is a deliberate, tested contract, not an inconsistency.** `build_cc_argv(mode, model)` passes `--permission-mode` **unconditionally** (every mode has a spellable flag value, `default` included) but **omits `--model` entirely when unset**, because "inherit CC's own default" has *no* representable flag value. **Proven on live processes at Phase 3**, not just in unit tests: set → `claude --permission-mode dontAsk --model sonnet`; unset → `claude --permission-mode dontAsk` with **no `--model` token at all**.
3. **A new pure seam: `resolve_spawn_model`.** The never-block-a-spawn degradation rule was extracted out of `SessionRegistry::spawn` specifically so it is testable — nothing in this repo can construct an `AppHandle`, so anything left inside `spawn` is verifiable only on a running app. Every degraded read (no app-data dir / unreadable / malformed / no record) resolves to `None` = inherit CC's default; a config fault must never turn a workspace open into a dead click.
4. **⚠️ The UI surface is the PICKER ROW, not the workspace header — and this reverses what the WBS and roadmap both specified.** Built on the header, **rejected by the operator at Phase 2 verify-human**, relocated to a right-aligned click-to-edit cell on each project's picker row. **One surface only, deliberately:** two homes for one per-project value would need a sync path, and there is intentionally **no broadcast event** for this setting (unlike the app-global permission mode, which has one because it has a second surface in the View menu). New design prior: `set-a-spawn-time-choice-where-the-spawn-is-chosen`.
5. **No client-side validation, by design.** The value is stored and forwarded verbatim; CC adjudicates and reports an unusable model precisely, inside the very pane the user is watching. Record this as a *decision* — a future reader will otherwise read the missing validator as an oversight and "fix" it, reintroducing a list that rots on every CC release.

## Session Handoff — 2026-08-01 07:32
Handed off. See `workflow-system/state/.session.md` to restore.

**WP1 shipped (1 of 4); both carried repairs are now CLOSED** — (A) `format:check` green on `main` (`64e212f`, `34718a4`) and (B) the picker per-row IPC N+1, resolving + deleting `SURFACE-2026-07-31-QUALITY-WP1-PER-ROW-IPC-REFETCHES-DATA-ALREADY-ON-THE-WIRE` (`e77afe0`, `fcb5f07`, `12d906f`). The pre-WP2 queue is empty. **Next: WP2 (editor minimap stale — reproduce-first, root cause NOT confirmed) via `/feature-plan`.**

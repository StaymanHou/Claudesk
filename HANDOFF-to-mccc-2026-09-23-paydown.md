# Hand-off to mccc — the 2026-09-23 paydown's upstream backlog, consolidated

**From:** Claudesk, backlog-paydown 2026-09-23 (WP2)
**Date:** 2026-09-23
**Status:** ⚠️ **Not applied.** This note is written *in the Claudesk repo*; every edit it asks for belongs to a session running *in the mccc repo*. Same posture as `HANDOFF-to-mccc-m15-wp2.md` and `-m15-wp4.md`. Editing mccc from here would silently dirty a different git repository, because `_ref/claude-customization/` and every `~/.claude/skills/` entry are symlinks into it.

**Why one note:** twelve Claudesk backlog entries plus one code-quality finding (13 asks) are workflow-system prose or policy that Claudesk cannot fix. Each surfaced during real Claudesk work and each is small, but they were scattered across the backlog, so no mccc-rooted session ever saw them together. **Each entry stays OPEN in Claudesk's `backlog.md`**, re-anchored to this file; this note resolves none of them. When an ask lands in mccc, the Claudesk entry is deleted with a `**Backlog resolved:**` line.

⚠️ **Read the two older handoffs first.** `HANDOFF-to-mccc-m15-wp2.md` (delete `check-structure.sh` Phase 9; the four `AGENTS.md` feature-graph copies are stale) and `HANDOFF-to-mccc-m15-wp4.md` (pin the Work Tree schema) are also still unapplied. §G below overlaps the first.

---

## A. `feature-plan` (and `feature-spec`): four plan-time rules

1. **An Observable Outcome must name a surface THAT phase builds.** (`SURFACE-2026-09-17-OBSERVABLE-OUTCOME-WRITTEN-FOR-A-SURFACE-A-LATER-PHASE-BUILDS`) A Phase-1 outcome said to observe the unsent-input watermark "via the pure module's exported state". No such surface exists until a later phase: the live instance is a private `useRef`. The outcome was mechanically verifiable in form and unsatisfiable in fact. **Ask:** beside the existing "mechanically verifiable" rule, add: *"which `data-testid` or URL does this outcome assert on, and which leaf creates it?"* If the answer is a later phase's leaf, the outcome belongs to that phase.

2. **A phase that deliberately breaks a consumer may not claim a green gate.** (`SURFACE-2026-08-25-OBSERVABLE-OUTCOME-ASSERTED-A-GREEN-GATE-ITS-OWN-PHASE-BREAKS`) An outcome asserted `tsc --noEmit` exits 0 in the same sentence that called the phase's deletion "a compile error at every call site". **Ask:** when a phase's tasks break a consumer that a later phase fixes, its gate outcome must be an **expected-failure shape**, not a whole-gate pass. Optionally, `feature-verify-auto` should read "outcome asserts a green gate its own plan breaks" as a **plan defect**, not a test failure.

3. **Deleting an ES-module export and migrating its consumers must land in the SAME phase.** (`SURFACE-2026-08-25-A-DELETED-EXPORT-BREAKS-THE-APP-AT-RUNTIME-NOT-JUST-TSC`, upstream half) A missing ESM export is a **runtime** module-resolution failure, not only a `tsc` error: `SyntaxError: Importing binding name 'inertAfter' is not found` blanked the whole app while `verify:auto` and `tsc` were both green, and a verify cycle was voided. **Ask:** in `feature-plan`, "does this phase remove or rename an export an un-migrated consumer still imports?" is a **hard blocker** on splitting across phases. After any phase that deletes something, a **boot smoke test** (load the app, assert `#root` has children) runs before any live observation is accepted. *(Claudesk is building its own whole-app boot test locally in paydown WP3; the rule is the upstream half.)*

4. **Widen the probe trigger to already-installed dependencies.** (`SURFACE-2026-08-25-PROBE-CHECK-EXEMPTS-ALREADY-INSTALLED-DEPENDENCIES`) `feature-spec` §2 / `feature-plan` §3 gate the probe on "3rd-party / new". M13.5 WP3 skipped a probe because xterm was already installed, and the API then misbehaved under this runtime's conditions. That cost three build/verify rounds. **Ask:** require a probe *"when the feature depends on runtime BEHAVIOUR of any API — including an already-installed one — that no existing code in this repo exercises under the same conditions."* Mechanical form: *"does any shipped code already call this API in this context?"* (For WP3: `grep` found zero prior uses.)

## B. Verification-method rules (`feature-verify-human`, `feature-research`, `feature-verify-codify`)

5. **A refutation needs one runtime contradiction before it may close, escalate, or delete work.** (`SURFACE-2026-08-25-REFUTATION-FROM-TYPINGS-NOT-RUNTIME`) M13.5 WP3 declared a mechanism refuted by reading xterm's doc comments. It escalated the WP out of its milestone and annotated working code as dead. One live property read would have contradicted it. **Ask:** reading a type, doc comment or spec is evidence *for* a refutation, never sufficient on its own. Mechanical form: *"which single value, read live, would prove this refutation wrong? Go read it."*

6. **Rewrite an observable when a verdict reverses the assumption it encoded.** (Claudesk finding `SURFACE-2026-08-03-QUALITY-WP1-PHASE2-OBSERVABLE-LEFT-UNAMENDED`, in `backlog-quality-findings.md`) A phase's verdict correctly overturned its own observable's premise, and the observable was left as written. A later mechanical audit then reads the mismatch as an unfinished phase. **Ask (low value alone):** `feature-verify-codify` prompts to reconcile any observable a verdict reversed.

## C. `feature-review-quality`: the diff window

7. **The `BASE_SHA^..SHIP_SHA` window breaks on a parked feature, including emptily.** (`SURFACE-2026-09-17-REVIEW-QUALITY-DIFF-WINDOW-BREAKS-ON-A-PARKED-FEATURE`) `BASE_SHA` is the earliest commit touching the WIP file, which assumes the feature's commits are contiguous. Park a feature mid-flight and the window swallows every unrelated commit in between, or it can come out **empty**. An empty window yields a clean review of nothing. **Ask:** (a) derive the window as a **commit set**, e.g. the WIP's own recorded ship SHAs, or `git log -- <wip-path>` intersected with commits touching source. A `--first-parent` or date-bounded window does NOT fix it, because the interleaving is temporal, not topological. (b) **Fail loudly on an empty diff.** Checked 2026-09-23: §1's "Identify the feature's earliest commit" step still uses `main..HEAD`, falling back to the WIP file's earliest commit on `main`. This project always commits on `main`, so it always takes the fallback, which is the path that breaks.

## D. `feature-verify-human`: the auto-skip gate's schema

8. **Gate (a) reads a YAML field most WIPs don't carry.** (`SURFACE-2026-09-15-WIP-FILES-USE-PROSE-HEADERS-NOT-YAML-FRONTMATTER`) Gate (a) reads `drive_mode` from the WIP's YAML frontmatter and treats absence as Mode 2, which never auto-skips. Claudesk's feature WIPs carry their state in prose headers, so the gate can never fire here. Nobody declared the mismatch. **Ask:** one ruling across both repos. Either (i) the Work Tree schema mandates YAML frontmatter with `drive_mode` (and `HANDOFF-to-mccc-m15-wp4.md`'s schema pin covers it), or (ii) the gate falls back to the session's active drive mode. Checked 2026-09-23: gate text is unchanged at `feature-verify-human/SKILL.md:69-71`.

## E. `session-restore`: two defaults in one file

9. **Step 4 says the default is Mode 2; the menu labels Mode 3 "(default)".** (`SURFACE-2026-08-06-SESSION-RESTORE-CONTRADICTS-ITSELF-ON-THE-DEFAULT-DRIVE-MODE`) Still true as of this session's load of the skill (step 4 priority 4 vs the mode menu). **Ask:** pick one and make both sites agree. Evidence for which: 28 of 29 sampled Claudesk archives ran `autopilot`.

## F. `CLAUDE.snippet.md`: two conventions for what closing skills write

10. **Superseded text in durable docs has no convention.** (`SURFACE-2026-08-28-SUPERSEDED-TEXT-IN-DURABLE-DOCS-HAS-NO-CONVENTION`) One session left 16 supersede markers in three styles across five docs, including strikethrough **and** a `> **CORRECTED**` block on the same claim. **Ask:** a short `### Superseded text in durable docs (GLOBAL)` section. Its default: correct in place (git holds the history), and keep a visible marker only where a reader would otherwise act on the stale version. Add a pointer from `product-finalize` §2. Mechanize only the "never both" case: `check-structure.sh` flags `~~` on or directly above a `CORRECTED`/`Superseded` line. Do not try to mechanize the judgment.

11. **The delete-on-resolve REWRITE path does not say to remove the old body.** (`SURFACE-2026-08-26-DELETE-ON-RESOLVE-REWRITE-PATH-SKIPS-THE-DELETE`) The partial-resolution carve-out says "rewrite the entry" but not "replace it". In practice a new body was inserted beside the old one, leaving two contradictory bodies for one ID. ⚠️ **Scale evidence, measured 2026-09-23:** 22 of 100 code-quality finding bodies in Claudesk were resolved-but-undeleted, most by one earlier paydown whose CHANGELOG lines claimed them. So were 10 of 34 pointer stubs, whose counts no longer matched their bodies, and one claimed closure covered only one of two arms. The shape: a sweep that resolves **sub-items of a grouped entry** removes no heading, so nothing prompts the delete. **Ask:** (a) state that a rewrite **replaces** the body in place, leaving exactly one `## SURFACE-<ID>` block per ID; (b) state that resolving a sub-item of a grouped entry **rewrites that entry in the same commit**; (c) optionally have `check-structure.sh` (or the consuming project) assert no SURFACE ID appears as a heading twice.

## G. `transitions.md` / `AGENTS.md`: policy-table gaps

12. **`I2` (report → triage) has no pause-policy row.** (`SURFACE-2026-09-12-ONE-TRANSITION-HAS-NO-PAUSE-POLICY-ROW-UPSTREAM`) An exhaustive resolution of all 111 edges against all 58 policy rows found one dispatchable edge with no governing row. `P13` also has no row, but it is terminal and owes none. Claudesk's typed model returns an explicit `unmapped / no-row-upstream` for `I2` and deliberately does **not** invent a row, because that would be Claudesk deciding mccc's policy. **Ask:** add an `I2` row to the incident table.

13. **The four `AGENTS.md` feature-graph copies disagree with `transitions.md`.** (`SURFACE-2026-09-12-THE-TWO-UPSTREAM-COPIES-OF-THE-FEATURE-GRAPH-DISAGREE`) Already fully specified in `HANDOFF-to-mccc-m15-wp2.md`: `F10` targets `verify-self` in the authority and `verify-human` in the copies; `F9b`/`F10b`/`F30` are missing from the copies; and Phase 9 does not catch it. Checked 2026-09-23: `AGENTS.md:94` still sends F10 to verify-human, and Phase 9 still exists. Claudesk's own exposure is closed, since its graph is transcribed from `transitions.md` only.

---

## Not included (and why)

- `SURFACE-2026-09-17-F10B-STOPPED-BEFORE-VERIFY-HUMAN-INSTEAD-OF-CHAINING-INTO-IT`: **already fixed upstream** (`07ff3ba`), with measurement tooling in `f25a509`. What remains is dogfooding measurement, not an mccc ask.

# Feature: M14 WP4 — Two-tier setup documentation

**Workflow:** feature
**State:** COMPLETE 2026-09-18 — shipped 9acae28, review fixes b5e1267; NOT pushed (operator's call)
**Created:** 2026-09-18

## Problem Statement

M14's two-tier setup-doc deliverable is the last open work package in the M14 remainder
(WP0/WP1/WP2/WP3/WP5 all closed). Its `Dependencies: WP2` gate is now satisfied — `v0.5.2` shipped
Developer-ID signed + Apple-notarized and is **installed on the operator's machine**, so the install
story is final and documentable. The README today describes the product well but is **stale in three
places that WP2/WP3/M15 made wrong**: the Status block's "Still ahead" line still names a settings
UI, signing+notarization, and the workflow supervisor as unshipped (all three have now shipped);
tier 2 is described in the Philosophy section as a *design principle* but is never given
**operating instructions** (how to enable the gate, what it turns on, that enabling the UI is
strictly separate from installing the substrate); and tier 1 is never stated as a **complete,
first-class product on its own** — a stranger who never installs the workflow system currently has
to infer their own tier from a philosophy bullet. The job is to make both tiers readable as
standalone setup paths and to correct every stale claim, verifying each instruction by following it
literally rather than trusting the WBS's task text.


**[Updated 2026-09-18 — F9b re-entry from verify-self]** Problem statement **unchanged** in
substance: WP4 is still "make both tiers readable and correct every stale claim." What changed
is the understanding of the *failure mode*, and it sharpens the statement's second half.
Correcting a stale claim is not a find-and-replace over a remembered phrasing — **the same
claim recurs in different word orders**, and a grep for one ordering reports a clean sweep
while leaving the canonical statement of the claim untouched. Worse, a partial correction can
leave a document **contradicting itself** (frontmatter saying "corrected to 9" above a line
still saying 8), which is a strictly worse state than the uncorrected original. The corrective
discipline is therefore: grep the **claim's load-bearing token** (here, the bare number beside
the subject noun), not a phrase; and after any correction, re-read the *named* site rather
than trusting the pattern.


**[Updated 2026-09-18 — SECOND F9b re-entry]** Problem statement still unchanged in substance.
The method insight advances a third time, and the three failures form a ladder worth naming
because each fix exposed the next blindness:
1. **phrasing-blind** — grepped `"6 arms / 8 subjects"`; missed *"8 subjects across the 6 arms"*.
2. **token-blind** — fixed by going token-level, but only for the token **8**; missed two more.
3. **value-blind** — still only searched for the value I was correcting **away from**; missed a
   doc stale at **seven**, the *pre-M13.5* value.
⚠️ **The generalization: a correction sweep must be VALUE-AGNOSTIC.** Searching for "the wrong
number I know about" cannot find a doc that is wrong in a different direction — and an older
doc is *more* likely to be stale at an older value, not the current-but-one. The correct
predicate matches the **claim's nouns** (`registries` / `arms` / `subjects`) and reads every
hit, letting the number be whatever it is.


**[Updated 2026-09-18 — THIRD F9b re-entry]** Problem statement still unchanged in substance.
The ladder gains a fourth rung, and the last two are a different KIND of blindness from the
first two — not "wrong search value" but "wrong search SPACE":
4. **file-type-blind** — every sweep was scoped to `*.md`. The artifact all those docs cite as
   THE AUTHORITY is a `.ts` file, whose header comments assert 5 registries / 7 subjects while
   its own code asserts `.toBe(9)` across 6 arms. No `.md` sweep could ever see it.
5. **cross-reference-blind** — correcting doc A can FALSIFY a claim in doc B *about* doc A.
   `closed-cycles:38` says *"`arch.md`'s 'arms 1–5 are TAKEN' line is STALE"*; my own fix made
   `arch.md` read 1–6, so the claim about it is now false. The tokens here are a RANGE (`1–5`),
   not a count, so no count-sweep — however value-agnostic — could see it either.
⚠️ **Generalization: after correcting a claim in file A, search for claims ABOUT file A**, and
**scope doc sweeps by where the authority LIVES, not by file extension.** A `.ts` file's
comment block is documentation.

**Scope corrections applied at plan time** (both from the session handoff; each would otherwise have
cost a wasted pass):

1. ⚠️ **WBS task 4.3's `xattr` sweep is ALREADY DONE by WP2 — verified, not re-done.** A repo-wide
   grep confirms exactly **5** surviving README `xattr` sites and **all 5 are correct**: line 86
   (historical note — releases before v0.5.2 needed it), lines 314 + 326 (build-from-source, where a
   contributor's local `pnpm tauri build` genuinely *is* unsigned), lines 332 + 343 (explaining the
   change). **Deleting them would make the README wrong.** Task 4.3 is a verify-and-tick, not work.
2. ⚠️ **The WBS undercounted the stale "default CLI args for `claude`" claim.** Task 4.2 says
   "here and in `roadmap.md`" (2 sites); a repo-wide grep finds **6 live sites across 4 files** —
   `roadmap.md` ×4 (lines 211, 281, 477, 594, 814 region), `wbs.md` ×2 (76, 520), `CLAUDE.md` (239),
   `context.md` (38). This is the **fourth** WBS undercount this milestone (spawn surface 9 not 5;
   `UpdaterError` 3 variants not 2; doc-correction scope 8 live files not 2), so every count in this
   plan was established by grep, not inherited.

**No 3rd-party dependency** — this is a documentation work package against files in this repo. No
probe required.

## Work Tree

- [x] Phase 1: Correct every stale claim (the retraction pass)  <!-- status: done -->
  **Observable outcomes:**
  - CLI: `grep -c "Still ahead: a settings UI" README.md` → `0` (the stale future-work line is gone
    or rewritten). Positive control: `grep -c "Status: daily-driver ready" README.md` → `1`, proving
    the Status block still exists and the zero above is a *correction*, not a deletion of the block.
  - CLI: `grep -rn "default CLI args" --include="*.md" . | grep -v archive/ | grep -v node_modules`
    → every surviving hit is inside a **strike-through / superseded / corrected** construction, not
    a live forward-looking claim. Checked by reading each hit, not by count alone — ⚠️ a bare
    `grep -c → 0` cannot distinguish an instruction from a prohibition against re-adding it
    (`docs/lessons/source-text-guards.md` entry 14), and these corrections deliberately leave
    "this was stale, here is the truth" notes behind.
  - CLI: `grep -c "xattr" README.md` → `5` (exactly the five correct survivors; **not** 0 — a 0 here
    is a FAILURE, it means the correct build-from-source instructions were wrongly deleted).
  - CLI: `pnpm verify:auto` exits 0 (no guard regression from the doc edits).
  - [x] P1.1 Rewrite README's Status-block "Still ahead" line: signing + notarization shipped
        (v0.5.2), the Settings UI shipped narrowed to hotkeys (M14 WP3), the workflow supervisor
        shipped (M15, v0.5.0). State what is genuinely still ahead, or drop the forward-look.  <!-- status: done -->
  - [x] P1.2 Correct the stale "default CLI args for `claude`" claim at **all 6 live sites** across
        `roadmap.md`, `wbs.md`, `CLAUDE.md`, `context.md` — PiP shipped M5, permission-mode shipped
        M6, the per-project `--model` override shipped M11.5 **on the picker row, not in Settings**.
        ⚠️ Several of these sites are *instructions to correct the line*, which become self-resolving
        once corrected; retire the instruction, don't just satisfy it.  <!-- status: done -->
  - [x] P1.3 Verify (don't re-do) WBS task 4.3: confirm the 5 surviving README `xattr` sites are the
        correct ones, tick 4.3 in `wbs.md` with a note that WP2 discharged it.  <!-- status: done -->
  - [x] P1.4 Sweep for any *other* stale shipped/unshipped claim the two named ones mask — grep the
        README + `context.md` for forward-looking language ("still", "not yet", "deferred",
        "planned", "coming") and check each against `git tag` / `CHANGELOG.md`. ⚠️ The task list is a
        FLOOR (`doc-correction-scope-list-is-a-floor`).  <!-- status: done -->
  - [x] verify-auto  <!-- status: done -->
  - [x] verify-self  <!-- status: done — subagent 4/4 PASS, 0 BLOCKING, 0 COSMETIC -->
  - [x] verify-human  <!-- status: done — operator approved 2026-09-18 ("all good"), incl. the roadmap 281/816 keep-as-historical-rationale call -->
  - [x] verify-codify  <!-- status: done — NO test written by deliberate decision (lessons entry 14); see ## Codify Decision -->

- [x] Phase 2: Tier 1 — the lite-IDE core setup path  <!-- status: done -->
  **Relevance check (before Phase 2):**
  - Requester still needs this: yes — WP4's tier-1 deliverable is untouched by Phase 1.
  - Requirements unchanged: yes — operator approved Phase 1 with no scope change.
  - Solution still feasible: yes — every tier-1 capability verified against a real shipped module.
  - No superior alternative discovered: yes.
  **Verdict:** proceed
  **Observable outcomes:**
  - CLI: README contains a tier-1 section whose prerequisites list does **not** mention the companion
    workflow system — verified by reading the section, and mechanically by
    `awk` extracting the tier-1 section and `grep -c "workflow system\|~/.claude/skills"` → `0`
    within that range.
  - CLI: every capability named in the tier-1 section maps to a shipped surface — each of picker,
    workspaces, PTY terminal, editor, diff, file tree, search, status surfaces, PiP, menu-bar,
    time analytics resolves to a real module under `src/components/` or `src-tauri/src/`
    (checked by `ls`/`grep`, one per claim).
  - CLI: every relative link in the tier-1 section resolves — `test -e` on each link target exits 0.
  - CLI: `pnpm verify:auto` exits 0.
  - [x] P2.1 Write the tier-1 setup path: install → prerequisites → first launch → add a project →
        what you get. ⚠️ **It must read as complete on its own** — a stranger who never installs the
        workflow system is a first-class user, not a degraded one. No "but you're missing…" framing,
        no forward-references to tier 2 as the real product.  <!-- status: done -->
  - [x] P2.2 Enumerate tier-1 capabilities against the **actual shipped surface**, not the vision
        doc: picker, workspaces, PTY terminal, editor/diff, file tree, search, hook-driven status
        surfaces (filmstrip / PiP / menu-bar), time analytics, in-app updater, Sublime/Finder
        launchers. Verify each against a real module before naming it.  <!-- status: done -->
  - [x] P2.3 State plainly that tier 1 needs **only** the Claude Code CLI + (optionally) Sublime —
        no `~/.claude/skills/`, no companion repo, no config.  <!-- status: done -->
  - [x] verify-auto  <!-- status: done -->
  - [x] verify-self  <!-- status: done — subagent 5/5 PASS, 0 BLOCKING, 0 COSMETIC; incl. independent gate check (22 chords: 1 gated/21 ungated) + cellLines trace proving the model override is ungated -->
  - [x] verify-human  <!-- status: done — operator approved 2026-09-18 ("ok"), incl. the Prerequisites Optional-split scope call and the 17-row capability table -->
  - [x] verify-codify  <!-- status: done — guard written (5 tests), 4 mutants proved individually; mutant 4 survived at first (entry-12 hole) and was fixed -->

- [x] Phase 3: Tier 2 — the opt-in workflow layer  <!-- status: done -->
  **Relevance check (before Phase 3):**
  - Requester still needs this: yes — tier-2 docs are WP4's other half.
  - Requirements unchanged: yes — operator approved Phases 1-2 with no scope change.
  - Solution still feasible: yes — gated surfaces enumerable from the OFF-invariant guard.
  - No superior alternative discovered: yes.
  **Verdict:** proceed
  **Observable outcomes:**
  - CLI: the tier-2 section names the gate by its real setting name — `grep -c "workflow features"`
    (case-insensitive) within the tier-2 range → ≥1, and the named Settings group title matches the
    string in `SettingsPanel.tsx` (`grep -c 'title="Workflow features"' src/components/settings/SettingsPanel.tsx` → `1`).
  - CLI: every gated surface the docs claim is gated is actually gated — each named surface appears
    in `src/state/__tests__/offInvariantGuard.test.ts`'s enumerated arms (the authoritative list:
    **6 arms / 9 subjects** — arms 4, 5 and 6 each own two; ⚠️ this outcome ITSELF said "8" until
    2026-09-18, the fifth stale site). Conversely, no surface named as gated is absent from that guard.
  - CLI: the five skill buttons named in the docs match `SKILL_BUTTONS` exactly —
    `grep -c "label:" src/components/workspace/skillButtons.ts` → `5`, and each label
    (`start`/`restore`/`capture`/`prune`/`paydown`) appears in the docs.
  - CLI: `pnpm verify:auto` exits 0.
  - [x] P3.1 Write the tier-2 section: what `workflow_features_enabled` turns on, where the toggle
        lives (`⌘,` → **Workflow features** group), and the pointer to the companion workflow system
        repo.  <!-- status: done -->
  - [x] P3.2 ⚠️ **[PRIOR: `gate-substrate-dependent-feature-class-behind-default-off-opt-in`] —
        document the gate as a first-class concept**: that it is **default OFF**, that with it OFF
        the app is **byte-identical** to one that never had the features (no dead affordances), and
        that **enabling the UI is strictly separate from installing the substrate** — the toggle
        does not install anything, and the substrate's presence does not flip the toggle.  <!-- status: done -->
  - [x] P3.3 Enumerate the gated surfaces from the **OFF-invariant guard**, which is the
        authoritative list, not from memory: docs viewer panel, workflow menu items, gate-dependent
        chords (⌘⇧K), picker-row cells (drive mode + supervisor readout + announce affordances), the
        fixed-five skill-button row, and the Recycle button. ⚠️ The guard pins **6 arms / 9 subjects**
        — if the docs name a surface not in it, one of the two is wrong.  <!-- status: done -->
  - [x] P3.4 Document that the **Keyboard shortcuts** Settings group is itself gate-aware — it
        *omits* gate-dependent chords when OFF rather than greying them, which is the same
        no-dead-affordance rule applied to the hotkey list (WP3 Phase 2.3).  <!-- status: done -->
  - [x] verify-auto  <!-- status: done -->
  - [x] verify-self  <!-- status: done — subagent 8/8 PASS, 0 BLOCKING, 0 COSMETIC; all 4 adversarial probes held -->
  - [x] verify-human  <!-- status: done — operator approved 2026-09-18 ("proceed"), incl. the per-arm auto-resume nuance being documented in the README -->
  - [x] verify-codify  <!-- status: done — guard EXTENDED with tier-2 half (+5 tests, 10 total); 8 mutants proved individually -->

- [x] Phase 4: Follow every instruction literally from a clean state  <!-- status: done -->
  **Relevance check (before Phase 4):**
  - Requester still needs this: yes — the audit is WP4's last task.
  - Requirements unchanged: yes — operator approved Phases 1-3.
  - Solution still feasible: yes — v0.5.2 is installed, so the install story is verifiable live.
  - No superior alternative discovered: yes.
  **Verdict:** proceed
  **Observable outcomes:**
  - CLI: every command in the README's Install / Prerequisites / Develop / Build-from-source blocks
    is executed or dry-run-checked; each either exits 0 or its non-zero exit is explained in the doc
    (e.g. `brew trust` on an already-trusted tap).
  - CLI: every relative link in the README resolves — a link-checker pass over all
    `](path)` targets, `test -e` each, → 0 missing.
  - CLI: every external URL in the README returns a non-4xx status (spot-checked with `curl -sI`).
  - CLI: `pnpm verify:auto` exits 0.
  - Browser: the `⌘,` Settings panel's group titles match what the tier-2 docs name them — read via
    the `tauri` MCP bridge against the running app, gate toggled OFF then ON, confirming the
    documented before/after (hotkey list shrinks, skill row disappears).
  - [x] P4.1 Execute the tier-1 install path literally, top to bottom, recording actual output.
        ⚠️ **Do NOT run `brew upgrade --cask claudesk`** — it deletes and rewrites the running bundle,
        killing every live session (`never-propose-brew-upgrade-to-verify-a-release`). Verify the
        commands' *shape and correctness* without executing the destructive one.  <!-- status: done -->
  - [x] P4.2 ⚠️ **PARTIAL — see note.** Execute the tier-2 enable path literally against the **installed v0.5.2** — open `⌘,`,
        toggle the gate, confirm the documented surfaces appear/disappear as written.  <!-- status: done -->
        ⚠️ **What was actually verified vs. not.** VERIFIED: the installed artifact is v0.5.2,
        Developer-ID signed, hardened runtime, `spctl` → `accepted / source=Notarized Developer
        ID`; and every documented gate behaviour was verified in CODE (`defaultPanel`,
        `showRecycleButton`, `workspaceSupervisorReadout`, `armAvailable`, the Rust
        `the_gate_write_path_never_reaches_the_users_claude_directory` test) plus by the
        10-test README guard. **NOT done: no one toggled the gate in the live installed app
        and watched the surfaces appear/disappear.** Deliberate — the operator's Claudesk is
        running real sessions, and flipping app-global settings underneath it is not a change
        an agent should make unasked. **This is the residue that belongs at verify-human**,
        and it is a one-minute check: `⌘,` → Workflow features → toggle, watch the Docs tab
        and skill row appear, toggle back.
  - [x] P4.3 ✅ **FIXED on 3rd F9b re-entry; re-verify gate PASSED (6/6 sub-checks).** Link + command audit across the whole README: relative links resolve, external URLs
        live, commands are current (⚠️ dead links and stale commands are exactly what the 2026-09-06
        pass already had to fix once — re-check, don't assume).  <!-- status: done -->
  - [x] P4.4 Tick WP4's tasks in `wbs.md` and record the four-undercount note for the milestone
        retrospective.  <!-- status: done -->
  - [x] verify-auto  <!-- status: done — 3rd re-run; comments-vs-code reconciliation + zero-executable-change proof -->
  - [x] verify-self  <!-- status: done — 4 runs; 3 BLOCKING found+fixed, 5th site fixed in-place under the shortcut (gates 1-3 held), final 5/5 PASS -->
  - [x] verify-human  <!-- status: done — operator approved 2026-09-18 ("proceed"), INCLUDING the proposal to write a count guard at verify-codify -->
  - [x] verify-codify  <!-- status: done — guard BUILT + mutation-tested + NOT shipped (1/4 mutants caught); SURFACE filed for a generator approach -->

## Current Node
- **Path:** Feature > ship (complete)
- **Active scope:** none — shipped as 9acae28; review-quality complete (2 MAJOR fixed); ready for /feature-finalize
- **Not pushed:** deliberate — the project rule is commit on completion, push only when the operator asks
- **Blocked:** none
- **Unvisited:** then Phase 2 (tier 1 — lite-IDE core), Phase 3 (tier 2 — opt-in workflow layer), Phase 4 (follow every instruction literally)
- **Open discoveries:** 1 — `SURFACE-2026-09-18-DOC-COUNT-NEEDS-A-GENERATOR-NOT-A-DETECTOR` (the detector guard failed mutation testing; a generator is the viable shape)

## Codify Decision — Phase 1 (no test written, deliberately)

**No integration boundary** — Phase 1 changed only markdown prose (5 docs). No code, endpoint, UI
surface, CLI command, or job was touched, so no consuming-surface test is owed.

**Decision: write NO durable guard for Phase 1's corrections.** This is a deliberate
no-coverage call, not an oversight, and the reasoning is the project's own `docs/lessons/
source-text-guards.md` **entry 14** — which was written by THIS milestone one work package ago
(M14 WP2, 2026-09-18) after the identical guard shape failed twice on correct work.

**The concrete demonstration (run at codify time, not assumed):** a naive
`grep -c "default CLI args" → 0` guard **fails today, against the work the operator just
approved** — 10 correct occurrences survive, each a deliberate `✅ … was corrected` /
`~~strikethrough~~` supersession marker. Entry 14's exact trap: *the match is real, at the right
site, and means the OPPOSITE of what the assertion assumes*. Removal work leaves notes saying not
to bring the thing back, and a count cannot tell a prohibition from the instruction it forbids.

**Why the region-scoping remedy does not rescue it either.** Entry 14's fix — scope the assertion
to a fenced code block, where an executable instruction would actually live — works for `xattr`
because `xattr` IS a command. It does not transfer here: a stale *prose claim* has no
syntactically distinguishable home, so there is no window to scope to. The guard would have to
encode editorial intent ("is this sentence forward-looking or retrospective?"), which is exactly
the shape entry 14 and `extract-for-import-when-a-raw-guard-cant-express-the-property` both say a
source-text predicate cannot express.

**What protects this instead:** the claims Phase 1 corrected are anchored to shipped releases
(`git tag`), which is a signal the docs cannot drift against silently — and Phase 4's link +
instruction audit re-walks the whole README from a clean state. Phases 2 and 3 DO get mechanical
outcomes, because their claims are checkable against real code artifacts (the OFF-invariant
guard's arms, `SKILL_BUTTONS`, the Settings group titles) rather than against editorial intent.

**Existing coverage checked:** 6 test files match "README", all using it as a *filename fixture*
(path-labelling, fuzzy-match, language detection). None assert README prose; none would be
weakened or duplicated by this decision.

## Codify Decision — Phase 2 (guard WRITTEN)

**No integration boundary** — README prose only.

**Decision: WRITE a guard** — the opposite call from Phase 1, and the difference is the
point. Phase 1's claims were about *editorial intent* (is this sentence forward-looking?),
which no source-text predicate can express. Phase 2's central claim is **mechanical**:
*does the tier-1 section promise a surface that is gated OFF?* That has a typed answer in
production data (`requiresWorkflowGate`, `AVAILABLE_PANELS`), so it is exactly the case
`extract-for-import-when-a-raw-guard-cant-express-the-property` says to test for real.

**New file:** `src/components/settings/__tests__/readmeTierOneHonesty.test.ts` (5 tests).
Imports `CHORD_REGISTRY` / `visibleChords` / `AVAILABLE_PANELS` from **production**, not
stubs. Reads README via `node:fs` (not a Vitest `?raw` import —
`vitest-raw-import-css-returns-processed-not-text`).

**The direction that bites (entry 13).** The guard is driven from the REGISTRY side, not
the README side. The failure it exists to catch is not "someone edits the README" but
"**a future milestone gates a new chord and the tier-1 section silently starts
overclaiming**" — nobody editing `chordRegistry.ts` will think to re-read the README.

**Mutation-proved, each mutant run INDIVIDUALLY and confirmed to land in executable code:**

| # | Mutant | Result |
|---|---|---|
| 1 | README names the gated `⌘⇧K` docs chord | **CAUGHT** (2 tests failed) |
| 2 | Tier-1 heading renamed → window empties | **CAUGHT** — vacuous-pass trap closed |
| 3 | `file-finder` (⌘P) flipped to `requiresWorkflowGate: true` | **CAUGHT** — the reverse direction works |
| 4 | `"docs"` added to `AVAILABLE_PANELS` | ⚠️ **SURVIVED at first** |

⚠️ **Mutant 4 initially SURVIVED (EXIT=0, 5/5 green) — a real hole, found only because
mutants were run individually.** Cause: a window-wide `toContain("docs")` matched the word
inside the URL `https://docs.claude.com`. This is `source-text-guards.md` **entry 12** —
*a substring that OCCURS in the window is not ANCHORED to the site*. Fixed by anchoring the
assertion to the one table row that enumerates the panel tabs; re-ran the same mutant
against the fixed guard → **EXIT=1, hole closed**, and the unmutated baseline still passes.

**Restores were done with `cp` + `shasum` verification, never `git checkout`**
(`git-checkout-no-ops-on-untracked-file`). All three mutated files confirmed byte-identical
to their backups afterwards.

## Test Triage — readmeTierOneHonesty.test.ts ("names no gated chord in the tier-1 section")

Classification: **Code regression — the test is correct, the newly-written Phase 3 content
exposed a latent defect in the test's own window function.**
Confidence: high
Evidence: `tierOneWindow()` bounded the section with `rest.search(/\n## /)`, but Phase 3
added `### Tier 2 …` — a **`###` sibling**, which that pattern does not match. The window
therefore ran past the end of tier 1 and swallowed the whole tier-2 section, so the guard
correctly reported that its window contained `⌘⇧K`. The ASSERTION was right; the WINDOW was
wrong. Written at Phase 2, when tier 1 was the last `###` before a `##` — true then, false
the moment a sibling subsection was added one phase later.
Action: fix the window function to terminate at the next heading of **any** level `##` or
`###` (whichever comes first), then re-run the Phase 2 mutation probes to confirm the guard
still bites with the corrected boundary. No assertion is weakened — the fix narrows the
haystack to what it always claimed to be.

⚠️ **Worth recording beyond the fix:** this is the guard catching a real defect on its
first encounter with content it was not written against — which is the argument for having
written it. Had it been a prose review instead, tier 1's window would silently have
included tier 2's gated surfaces from here on.

## Codify Decision — Phase 3 (guard EXTENDED, not duplicated)

**No integration boundary** — README prose + a test's own window helper.

**Decision: EXTEND the Phase 2 guard with a tier-2 half** rather than write a second
README-reading file. Checked first that nothing already covered it: the OFF-invariant guard
reads no README (`grep -c README` → 0), and the only "Tier 2" string in any test was a
*comment* in the Phase 2 guard about the boundary bug — not an assertion. Real gap.

**The gap is the INVERSE of Phase 2's, and it is entry 13's exact shape.** Tier 1 asserts an
ABSENCE (no gated surface promised as free). Tier 2 asserts a PRESENCE (the section actually
names what the gate turns on). With only the tier-1 half, **a future milestone that gates a
NEW surface stays green** — nothing leaked into tier 1, so the absence-assertion still holds,
while tier 2 silently stops describing the product. That failure is invisible precisely
because "nothing appeared where it shouldn't" remains true.

**+5 tests (10 total).** `tierOneWindow()` generalized to `sectionWindow(heading)` so both
tiers share one bounded-extraction helper with the corrected `/\n#{2,3} /` terminator.

**Mutation-proved — 8 mutants, each run INDIVIDUALLY and confirmed landed:**

| # | Mutant | Result |
|---|---|---|
| 1-4 | the Phase 2 tier-1 set, re-run after the `sectionWindow` refactor | **ALL STILL BITE** |
| 5 | `⌘⇧K` removed from tier-2 (gated chord undocumented) | **CAUGHT** |
| 6 | `/util-backlog-paydown` dropped from the tier-2 list | **CAUGHT** |
| 7 | tier-2 promises `/session-handoff`, which the row does not ship | **CAUGHT** |
| 8 | the "OFF by default" promise deleted | **CAUGHT** |

⚠️ **Probe-validity incident worth recording.** On the first pass, mutants 5 and 6 emitted
NO `EXIT=` line: the bash helper was chained with `&&` after a `grep -c` that returned 0 and
exited nonzero, so **the tests never ran at all**. The mutations had landed, and a careless
read of "no failure reported" would have scored them as surviving — or worse, as passing.
Re-ran both with the exit code captured independently; both bite. This is
`invalid-probe-and-real-hole-look-identical` arriving through a shell-plumbing door rather
than a `sed` one.

**Restores:** `cp` + `shasum` verification on all three mutated files, never `git checkout`.

## Test Triage — verify-self (b): arch.md:71 still states the retracted claim

Classification: **Code regression — the verification is correct, the Phase 4 correction was
incomplete.** Not a test defect; a real uncorrected doc claim.
Confidence: high
Evidence: `workflow-system/product/arch.md:71` reads *"there are **8 subjects** across the 6
arms (arm 4 owns two derivations, arm 5 two predicates, **arm 6 one**), pinned as
`armSubjects.length === 8` at `offInvariantGuard.test.ts:931`"*. Three errors in one clause:
(1) **8 → 9**; (2) **arm 6 owns TWO**, not one — the supervisor toggle landed at M14 WP0
*after* that sentence was written; (3) the citation `:931` points at an unrelated
`readFileSync` — the assertion is at **:1004**.
⚠️ **The doc now CONTRADICTS ITSELF**: I corrected arch.md's frontmatter to say *"the
guard-arm line corrected to 6 arms / 9 subjects"* while the line it refers to still says 8.
That is worse than the original defect — a reader checking the frontmatter's claim against
the line finds a disagreement with no way to tell which is right.

⚠️ **Root cause, and it is the milestone's signature failure a SEVENTH time.** I grepped the
PHRASING `"6 arms / 8 subjects"`. Line 71 says *"**8 subjects** across the 6 arms"* — same
claim, different word order, invisible to my pattern. **Grepping a phrasing is not grepping a
claim.** The backlog entry had even NAMED this exact site (`arch.md:71`), and I still missed
it by pattern-matching instead of reading the named location.

Action: back-loop **F9b** to build, scoped to **P4.3**. The in-place-fix shortcut's gate 1
fails — this is not a trivial extension of a just-written leaf, it is the correction the
audit was supposed to have performed. Fix all three errors, cite the symbol not the line
number (`cite-code-by-symbol-not-line`), and re-grep on the CLAIM rather than a phrasing.

**F9b re-entry outcome (2026-09-18).** The verify-self BLOCKING fail was real and my
correction was incomplete. Fixed `arch.md:71`'s three errors (8→**9**; *arm 6 owns one*→**two**;
`:931`→**cite the symbol** `it("still polices all six registries")`).

⚠️ **The claim-based re-grep then found TWO MORE live sites the phrasing-grep had missed** —
`arch/workflow-supervisor.md:234` (`armSubjects.length === 8`, plus the same drifted `:931`)
and `docs/lessons/closed-cycles-m13-m13-5.md:38` ("SIX arms / EIGHT subjects"). **Five live
sites total, not the four I claimed** — CHANGELOG corrected accordingly.

⚠️ **A pre-existing MAJOR finding had already diagnosed ALL of this and was still `pending`:**
`SURFACE-2026-09-17-QUALITY-ARM-SUBJECT-COUNT-STALE-IN-TWO-AUTHORITIES` named `arch.md:71`
exactly, prescribed citing the symbol instead of `:931`, and warned *"grep the retracted claim
repo-wide first."* Following the finding I had in hand would have prevented the back-loop.
Now fully performed and resolved (CHANGELOG-first, then deleted; the coupled `backlog.md`
pointer rewritten 7→6 findings / 3→2 MAJOR per the partial-resolution carve-out).

**Re-verify gate:** 0 live assertions of the wrong count in any word order; positive control
confirms all four authority docs now assert 9. `pnpm verify:auto` EXIT=0 (201 files / 2726).

## Test Triage — verify-self (2nd BLOCKING): arch/workflow-gate.md never touched

Classification: **Code regression — the verification is correct; the correction was incomplete
for the THIRD time, in a new way.** Not a test defect.
Confidence: high
Evidence: `workflow-system/product/arch/workflow-gate.md` — which **`arch.md:24` designates as
THE authority** for the OFF-invariant guard, and which `arch.md:71` cross-links to — carries
three stale PRESENT-TENSE assertions with no correction note: line 12 *"asserts absence across
the **FIVE** registries"* (actual **6**); the registry table (lines 16–21) lists only arms 1–5,
**omitting arm 6 entirely**; and line 28 *"All **seven** subjects (arm 4 owns two derivations,
arm 5 two predicates)"* (actual **9**, and it omits arm 6's two). `git status` on that file is
empty — it was never touched.

⚠️ **WHY BOTH PRIOR SWEEPS WERE BLIND TO IT — a NEW failure mode, not a repeat.** Pass 1
grepped a *phrasing* (`"6 arms / 8 subjects"`). Pass 2 fixed that by going token-level, but
still searched only for the token **8** — and this file states the count as **SEVEN**, the
*pre-M13.5* value. **A doc can be stale at an OLDER value than the one you are correcting.**
Searching for "the wrong number I know about" cannot find a doc that is wrong in a different
direction. The subagent found it by widening the token set to `seven`, which I had not done.

⚠️ **This is the third recurrence of the same class in one work package** (phrasing-blind →
token-blind → value-blind), and the sixth and seventh undercount of the milestone.

Action: back-loop **F9b**, scoped to **P4.3**. Fix all three assertions. Then re-sweep with a
**value-agnostic** predicate: find every live claim about the guard's arm/subject counts
regardless of which number it states, by matching the *nouns* (`registries`/`arms`/`subjects`)
and reading each hit — not by searching for any particular wrong value. The in-place-fix
shortcut's gate 1 fails (not a trivial extension of a just-written leaf).

**2nd F9b re-entry outcome (2026-09-18).** Fixed `arch/workflow-gate.md`'s three stale
assertions (**FIVE**→SIX registries; registry table gained its missing **arm 6 /
WORKSPACE-HEADER** row; **seven**→**nine** subjects) and added an auditable ⚠️ CORRECTED note
recording that the file had drifted to the *pre-M13.5* shape.

**The value-agnostic sweep then examined 24 live files** matching the claim's NOUNS
(`registries`/`arms`/`subjects`) with the number left free. Three candidates were read
individually and **deliberately left unchanged** — all three are correct:
- `arch.md:71` *"7 subjects across the 5 arms"* — inside `previously read *"…"*`, a retraction.
- `arch/right-panel-surfaces.md:68` *"not a sixth arm"* — about a PROPOSED guard, not a count.
- `roadmap.md:239` *"the guard's five arms"* — a record of what was **verified at M10.9 WP5**,
  when there genuinely were five. Changing it would falsify the historical record, exactly as
  with the archives.
- `workflow-gate.md:46` *"all five arms were bypassed individually"* — the M11.5 WP4
  mutation-proof, accurate as history.

⚠️ **Instrument limit, recorded honestly:** a noun-based checker cannot separate a COUNT
assertion from an ORDINAL ("a **seventh** arm is owed"), an INDEX ("arm 4 owns two"), a
MILESTONE ref ("M13.5 WP4"), or a HISTORICAL record. It flagged 11; reading showed 0 real. The
sweep's value is that it *surfaces candidates a value-scoped grep cannot see* — the verdict
still comes from reading each one.

**Re-verify gate:** the three assertions read back correct; the surviving `"All **seven**
subjects"` string is inside the CORRECTED note as a quoted retraction (polarity verified, not
assumed). `pnpm verify:auto` EXIT=0 (201 files / 2726 tests).

## Test Triage — verify-self (3rd BLOCKING): a false cross-ref + the guard file's own header

Classification: **Code regression — the verification is correct; the correction was incomplete a
THIRD time, at a NEW KIND OF SITE.** Not a test defect.
Confidence: high
Evidence — two sites, and the second is the important one:

**(1) `docs/lessons/closed-cycles-m13-m13-5.md:38` — a CROSS-REFERENCE made false by my own fix.**
It asserts in the present tense: *"`arch.md`'s \"arms 1–5 are TAKEN\" line is STALE"*. But
`arch.md:71` now reads **"arms 1–6 are TAKEN"**; its only `1–5` sits inside its own retraction
quote. ⚠️ **I edited this very line this work package** (git diff confirms) and carried the stale
clause through untouched. ⚠️ **NEW SHAPE: correcting doc A can FALSIFY a claim in doc B *about*
doc A.** A count-sweep cannot see this — the numbers here are `1–5`, a range, not a count.

**(2) `src/state/__tests__/offInvariantGuard.test.ts` — THE GUARD'S OWN HEADER, untouched
(`a46ae89`).** Three present-tense assertions in its comments: `:52` *"THE FIVE REGISTRIES"*,
`:65` *"reconciles SEVEN subjects against FIVE registries"*, `:597` *"`WORKFLOW_TERMS` is shared
by all five arms"* — while its executable code asserts `.toBe(9)` across **6** arms.
⚠️ **The file every doc cites as THE AUTHORITY contradicts itself: comments 5/7, code 6/9.**
⚠️ **NEW SHAPE: I scoped every sweep to `*.md`.** The authority is a `.ts` file. All three passes
were structurally incapable of seeing it.

⚠️ **The ladder is now four rungs, each fix exposing the next blindness:**
phrasing-blind → token-blind → value-blind → **file-type-blind + cross-reference-blind**.

Action: back-loop **F9b**, scoped to **P4.3**. Fix the cross-reference, fix the guard header's
three comment assertions (the code is already right — only the prose lies), and re-sweep
**across `.ts` as well as `.md`**, plus check cross-references *about* any file I edited.
In-place-fix gate 1 fails (not a trivial extension of a just-written leaf).

**3rd F9b re-entry outcome (2026-09-18).** Both sites fixed.

**(1) The false cross-reference** — `closed-cycles-m13-m13-5.md:38` now strikes through the
retracted claim and records that `arch.md` was corrected to "arms 1–6" at M15 WP5 and to 9
subjects at M14 WP4. It also corrects a second embedded prediction: the line said M15's
supervisor was *"the likely author of exactly such a surface"* — **it was not**; the supervisor
shipped headless and owns no arm.

**(2) The guard file's own header** — three comment assertions corrected: `THE FIVE REGISTRIES`
→ **SIX**; `SEVEN subjects against FIVE registries` → **NINE against SIX** (with an inline
CORRECTED note); and `WORKFLOW_TERMS is shared by all five arms` → **arms 1–3**.
⚠️ **That third one was wrong even when there WERE five arms** — `WORKFLOW_TERMS` feeds arms 1–3
only, as both line 720 of the same file and `workflow-gate.md` state. A pre-existing error the
count-correction surfaced incidentally.
⚠️ **COMMENTS ONLY — zero executable lines changed**, proven by diffing the non-comment lines of
the file before and after. The guard still asserts `.toBe(9)`; I must not alter what a
load-bearing guard checks while fixing its prose.

**The widened sweep (`.ts`/`.tsx`/`.rs` + `.md`) found 19 non-`.md` hits** — the blind spot that
hid site (2). Two were read individually and left alone, correctly: `:718` *"no registry that
arms 1–5 walk"* is the justification written AT THE MOMENT arm 6 was added (accurate in
context), and `:1022` *"seven ARMS"* is a past-tense account of a review finding. The rest are
the M15 supervisor's own "six arms" — a DIFFERENT concept (policy arms, not guard arms).

**The cross-reference sweep** (claims *about* files this WP edited) found 5; all five reference
CLAUDE.md rules this WP did not touch (port cleanup, the verify:auto gate, structure-vs-runtime,
pure-function assertions). None falsified.

**Re-verify gate: 6/6 sub-checks pass.** `pnpm verify:auto` EXIT=0 (201 files / 2726 tests).

[SHORTCUT-2026-09-18] P4.3 — the FIFTH stale site was the WIP file itself (lines 164, 180:
"6 arms / 8 subjects", live present-tense). Fixed IN PLACE under the verify-self shortcut rather
than a 4th F9b back-loop: gate 1 holds (a two-token correction to text this WP wrote, inside the
WIP file, not the deliverable), gate 2 holds (re-verified by a FRESHLY SPAWNED subagent, not by
re-reading my own state), gate 3 is this entry. ⚠️ **Line 164 was the dangerous one — it sat
inside a Phase 3 CLI Observable Outcome**, i.e. the criterion a verifier checks AGAINST, so the
stale value was positioned to propagate back into the docs it was written to validate.
⚠️ **The fifth blind spot is TRACKING STATUS, not file type**: every sweep enumerated tracked
files, and the WIP file is UNTRACKED (absent from `git ls-files`). Four passes were structurally
blind to it. Narrative mentions at lines 40/395/438/550 are correct and deliberately untouched.

## Codify Decision — Phase 4 (the doc-count guard: BUILT, MUTATION-TESTED, NOT SHIPPED)

**No integration boundary** — Phase 4 changed prose only.

**The operator approved writing a doc-count guard. I built it, mutation-tested it, and am
NOT shipping it — because the mutation testing showed it does not work.** Recording the
attempt and the evidence, because the negative result is the useful artifact.

**What was built:** `guardCountInDocs.test.ts` — derives the truth from production
(parsing `armSubjects`, deliberately NOT reading `.toBe(9)`, which would be circular),
WALKS doc roots rather than hardcoding a file list, and matches the claim form-agnostically
(digits / `six` / `SIX`).

**Mutation results — 1 of 4 caught:**

| # | Mutant | Result |
|---|---|---|
| 1 | `CLAUDE.md` digit form 9→8 | **CAUGHT** |
| 2 | `workflow-gate.md` word form SIX→FIVE registries | ⚠️ **SURVIVED** |
| 3 | the guard header's own NINE/SIX→SEVEN/FIVE (**the real pass-3 defect**) | ⚠️ **SURVIVED** |
| 4 | add a 7th arm to `armSubjects` | ⚠️ **PROBE INVALID — never landed** |

⚠️ **Mutants 2 and 3 are the two defects that actually cost passes 2 and 3.** A guard that
catches only the digit form does not address the problem it was written for.

**Root cause, measured not guessed.** Two independent holes:
1. **Per-line subject filter.** Both stale lines STATE the count without NAMING the guard on
   that line — the subject sits a sentence earlier. Widening to a 9-line window fixed the
   subject test but immediately produced two new false positives inside the guard file.
2. **The EXEMPT list is unavoidably over-broad.** The token `M1[0-9](\.\d)? WP\d` (a
   milestone ref like "M13 WP2") exempts **21 of 117** candidate lines — **17%** — including
   the M2 line carrying the real stale claim. Narrowing it re-admits the historical records
   (`roadmap.md`'s "five arms" from M10.9 WP5) that must NOT be flagged.

**Why this is a genuine design limit, not a tuning problem.** The guard must separate
*"this doc asserts the count is N"* from *"this doc records that the count WAS N"* — and the
project's docs deliberately contain both, often in adjacent sentences, because every
correction leaves a retraction note beside the corrected claim (`source-text-guards.md`
entry 14). The discriminator is **authorial intent**, which a source-text predicate cannot
express — precisely what
`extract-for-import-when-a-raw-guard-cant-express-the-property` says to stop attempting.
Shipping it as-is would be worse than nothing: **green while blind to 2 of the 3 real defect
shapes**, i.e. a guard that certifies the exact drift it was built to prevent.

**What ships instead:** the file is NOT added. The durable mitigation actually landed
earlier in this WP — the counts are now correct at every live site, the guard file's header
agrees with its own code, and citations point at a SYMBOL rather than a drifting line number,
which is what made the number re-derivable in the first place. A `SURFACE` is filed for a
mechanism that could work (a single generated line, or a `<!-- count -->` marker the docs
include and a test regenerates) — a **generator**, not a detector.

## Code-Quality Review — m14-wp4-two-tier-setup-docs

**Reviewed:** ship commit `9acae28` (single-commit feature). **Verdict: 0 CRITICAL / 2 MAJOR / 3 MINOR.**

### Both MAJORs were FIXED, not backlogged (autopilot would have auto-backlogged them)

**MAJOR 1 — `sectionWindow` failed OPEN. [FIXED]** The reviewer mutation-tested the guard
independently and found that inserting a `### Also in tier 1` subsection naming the gated
`⌘⇧K` left the suite **10/10 GREEN**. ⚠️ **I reproduced it before acting** — confirmed
EXIT=0 with the leak present. The window STOPPED at the sibling heading and simply excluded
content a reader plainly reads as tier 1; a leak outside the window is invisible to every
assertion over it. ⚠️ **The reviewer's diagnosis is sharper than the finding**: this is the
SAME window-boundary defect fixed at Phase 3, recurring one heading level down, because that
fix patched the SYMPTOM (`##`→`#{2,3}`) instead of the SHAPE. Now bounded by its PEERS (the
next tier heading or the next `## `), so descendant subsections stay INSIDE the window.
⚠️ **Note the asymmetry that made this dangerous**: the Phase 3 version failed CLOSED (false
alarm, visible); this one failed OPEN (false green, silent).

**MAJOR 2 — two tests were the same assertion. [FIXED]** `visibleChords(true) \
visibleChords(false)` is **provably identical** to `CHORD_REGISTRY.filter(requiresWorkflowGate)`
— verified by reading `visibleChords`: it returns `CHORD_REGISTRY` when enabled and filters
exactly `requiresWorkflowGate` when not. The second test could never fail when the first
passed: zero mutation coverage, presented as independent protection. **Re-aimed at the PANEL
registry** via `availablePanels()` — a genuinely different derivation that was unguarded on
the tier-1 side.

⚠️ **The re-aimed test FIRED on its first run — entry 12 a second time in one file.**
`\bdocs\b` matched inside the tier-1 URL `https://docs.claude.com`. A word boundary is no
defence when the token is a whole word inside a URL. Anchored to the panel-tab row, the same
remedy its sibling already used.

### Mutation re-proof after the fixes (each run individually)

| # | Mutant | Result |
|---|---|---|
| R1 | **the reviewer's mutant** — `###` sibling in tier 1 naming `⌘⇧K` | **NOW CAUGHT** (was 10/10 green) |
| R2 | gate `⌘P` — reverse direction | **CAUGHT** |
| R3 | panel baseline drift (`docs` into `AVAILABLE_PANELS`) | **CAUGHT** |
| R4 | tier-1 heading renamed — vacuity control | **CAUGHT** |

`pnpm verify:auto` EXIT=0 (201 files / 2726 tests). All mutated files restored and
`shasum`-verified.

### MINOR findings — auto-backlogged per drive_mode=autopilot

1. **Unanchored label matching** (`w.includes(e.label)` on `⌘P`/`⌘T`/`⌘N`) — harmless today
   since the only gated label is `⌘⇧K`, but not as rigorous as the backtick-anchored
   slash-command test in the same file.
2. **Stale `Current Node`** — `Unvisited:` still listed closed phases and cited commit
   `9f5d1d5` (pre-amend; the shipped SHA is `9acae28`). ⚠️ **Fixed inline** — Current Node is
   authoritative and the reviewer correctly called it the costliest small defect in the file.
3. **File location** — the guard lives under `settings/__tests__/` but imports nothing from
   `settings/`; `state/__tests__/` beside the OFF-invariant guard it mirrors would be easier
   to find.

### Assessment (reviewer's, verbatim summary)

"Well-built work… the new guard is a genuine, non-vacuous, bidirectional check driven from
typed production data… Declining to ship the doc-count guard after it caught 1 of 4 mutants
is the single best judgment call in the diff… Net: this advances the codebase and accrues no
meaningful debt beyond the one window-boundary gap."

### If you disagree
Mark any finding `[DISMISSED]` in this section before `/feature-finalize` archives the WIP.

## Retrospect

- **What changed in our understanding:** That a *documentation* work package can carry the same
  verification difficulty as code, and for a reason that generalizes: **correcting a claim stated
  as prose in N places is a search problem, and every search predicate has a blind spot.** This WP
  hit five distinct ones in sequence, each fix exposing the next — phrasing-blind (grepped a word
  order) → value-blind (searched only the wrong number I knew about) → file-type-blind (swept
  `*.md` while the authority was a `.ts` header) → cross-reference-blind (my own fix falsified a
  claim in doc B *about* doc A) → tracking-blind (every sweep enumerated tracked files; the stale
  claim sat in the untracked WIP). None was a repeat; each was structurally invisible to the one
  before. The transferable rule: **sweep by the claim's NOUNS with the number left free, across
  every file type, tracked or not — and after correcting file A, search for claims ABOUT file A.**

- **Assumptions that held:** The plan's phase split (retract → tier 1 → tier 2 → audit) was right,
  and Phase 4's "follow every instruction literally" earned its place — it found three defects the
  task text never named, including a "Checks" block that was not the real gate. The decision to
  verify the install story against the **real installed artifact** (v0.5.2, `spctl` → notarized)
  rather than the source tree was the strongest evidence produced all WP.

- **Assumptions that were wrong:**
  1. ⚠️ **That a guard is always the right answer to drift.** I proposed, and the operator approved,
     a doc-count guard. Built and mutation-tested, it caught **1 of 4** mutants — missing both
     real-world defect shapes. Its exempt list needs a milestone-reference token to skip historical
     records, and that token exempts **21 of 117** candidate lines (17%), including one carrying a
     live stale claim. The discriminator is authorial intent; a source-text predicate cannot express
     it. **Not shipping it was the right call, and finding that out cost less than shipping it
     would have.**
  2. ⚠️ **That fixing a boundary bug once fixes its shape.** Phase 3 fixed `sectionWindow`'s
     terminator `##`→`#{2,3}` and I recorded the lesson in the file's own comment. Code review then
     mutation-tested it and found the SAME defect one heading level down — and this time it failed
     **OPEN** (10/10 green with a gated chord leaked into tier 1) where the first had failed
     **closed** (visible false alarm). A patch to the symptom is not a fix to the shape.
  3. **That "8 subjects" was the only stale value.** It was stale at *seven* in one authority doc —
     an older value than the one I was correcting away from.

- **Approach delta:** Four F9b back-loops on a single leaf (P4.3), plus one in-place fix under the
  verify-self shortcut, plus two MAJORs fixed at code review rather than auto-backlogged. The plan
  anticipated none of this — it budgeted Phase 4 as a link-and-command audit. The overrun was
  entirely the count correction, and it was worth it: the count is load-bearing (`CLAUDE.md` tells
  a future session "a new surface owns the seventh arm", a rule computed off it). ⚠️ **Every
  verification pass that found something was a FRESH subagent invocation** — my own re-reads never
  found the next site. That is the single most reusable process observation here.

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->
[SURFACED-2026-09-18] Phase 4 (P4.3 link audit) — `roadmap.md` line 26 links to
`wp4-thumbnail-probe-outcome.md`, which moved to
`workflow-system/product/archive/phase-1-bare-shell-poc/` when M1 was cycle-archived; the link was
never re-anchored. **Pre-existing — NOT a Phase 1 regression** (Phase 1's diff does not touch that
line). Found by verify-auto's link check over the 5 changed files; 15 relative links checked, this
is the only break. Fix at P4.3, where the audit widens to the whole README + product docs.

[SURFACED-2026-09-18] Phase 4 (P4.3 audit) — `CLAUDE.md` says the OFF-invariant guard pins
"6 arms / 8 subjects" at two sites (lines 184, 191); the guard itself asserts `.toBe(9)`.
Found by the Phase 3 verify-self subagent checking framing it was handed rather than
trusting it; independently confirmed by grep. Load-bearing (CLAUDE.md tells a future
session "a new surface owns the seventh arm"). Logged as
`SURFACE-2026-09-18-OFF-INVARIANT-GUARD-SUBJECT-COUNT-STALE-IN-CLAUDE-MD`. **Out of scope
for Phase 3** — a CLAUDE.md defect, not a tier-2 doc defect.

# Feature: M12 WP4a — Probe: the drive-mode signal channel's shape + the picker cell's UI/UX

**Workflow:** feature
**State:** verify-codify (ALL PHASES COMPLETE) — ready for `/feature-ship`
**Created:** 2026-08-06
**WBS:** `workflow-system/product/wbs.md` → "WP4a" (size S, half-day timebox)
**Type:** probe — the deliverable is **two recorded verdicts + an operator-chosen mockup**, not shipped
production code.

## Problem Statement

M12's WP4 was re-decomposed 2026-08-06 because the deliverable is a **signal, not a store** (a persisted
`drive_mode` already exists in 93% of manual restores and is already ignored 74% of the time). The
*channel* for that signal is already **proven live** — an env-var-gated `UserPromptSubmit` hook returning
`hookSpecificOutput.additionalContext` makes the real `/session-restore` skip the mode menu — so this
probe does **not** revisit it. What remains genuinely undecided are two questions whose answers change
what WP4b and WP4c build: **(a)** does the emission go in Claudesk's *shared* 10-event telemetry Perl
script or a *separate* `UserPromptSubmit`-only hook entry, what exactly does the injected sentence say,
and how does the `workflow_features_enabled` gate reach a hook that runs as its own process; and **(b)**
what does the picker-row drive-mode cell look like, decided from **side-by-side mockups** rather than
prose (operator instruction 2026-08-06). Both are cheap to settle and both are upstream of code, which is
why derisk-first ordering puts them here.

## Evidence base — read, do not re-derive

`wbs.md` → **"Scope-audit findings II"** (Findings A–G) is the evidence this WP builds on. The four
constraints that bound every task below:

1. **ZERO companion-repo change.** `/session-restore`'s re-prompt is **correct** for a plain-CLI user
   (Finding C, operator-emphatic). The distinguishing fact is the **caller**, not the skill.
2. **This arm is GATED** behind `workflow_features_enabled`. ⚠️ `"drivemode"`/`"drive-mode"` are already
   in `WORKFLOW_TERMS`, so any seam reference must be in **executable source** — a comment-only mention
   was *measured* not to satisfy the guard at M11.
3. **Claudesk does NOT write into `workflow-system/`.** The frontmatter-mirror mechanism was rejected.
4. **Long-context durability is ASSUMED, not proven** (Finding E). Both live proofs were short + cold.
   A synthetic probe was considered and **declined**. Do not upgrade this to "proven" anywhere.

**Already proven — do NOT re-probe:** `UserPromptSubmit` + `additionalContext` works *and is obeyed*
(Finding D: one env var apart, same settings file → menu vs. no menu, `S15` vs. consumed pointer).
`additionalContext` must nest under `hookSpecificOutput` with `hookEventName`; top-level is rejected.

## Code facts established at plan time (so build does not re-discover them)

Read during planning; each one shapes a task:

- **`src-tauri/resources/claudesk-hook.pl`** — 151 lines, strictly write-only telemetry. `exit 0`
  unconditionally; writes its JSON line to the **socket handle** (`print $sock $line`, line 128), so
  **stdout is currently untouched by every path**. ⚠️ Line 44: `exit 0 if $sock_path eq ''` — an absent
  `CLAUDESK_HOOK_SOCK` makes the script exit **before reading stdin**. A shared-script design must place
  any stdout emission *before* that early exit, or the signal dies whenever the socket var is absent.
- **`CLAUDESK_EVENTS`** (`hook_install/mod.rs:74-87`) — a `[&str; 10]` const, registered for **both**
  identities. `merge_claudesk_hooks` iterates it and keys detection on the script **basename**
  (`script_basename_of_command`, exact `==`, never substring — the documented "substring trap"). A second
  hook entry therefore needs either a distinct basename or a deliberate decision about how detection
  distinguishes it.
- **`spawn_argv`** (`cc_session/mod.rs:646-674`) takes `env: &[(&str,&str)]` and loops `cmd.env(k,v)` —
  adding a var is free, as Finding F says. ⚠️ But `color_tty_env()` returns a **fixed-size
  `[(&'static str,&'static str); 4]`** (`:290`) with **three** call sites (`:612` CC spawn, `:634` shell
  spawn, `:1128` a test), so the new var cannot simply be appended to that array — the CC call site must
  compose a `Vec`. The shell spawn must **not** get the var.
- **`read_workflow_features_enabled(&dir)`** (`config_store/settings.rs:291`) is the server-side gate
  read, already used by WP3's announce command (`announce/commands.rs:33`,
  `.unwrap_or(false)` — fail-closed). This is the precedent for a spawn-time gate check.
- **`default_drive_mode`** (`config_store/mod.rs:68-71`) is already `Option<DriveMode>` with kebab-case
  serialization. ⚠️ Its doc comment carries **two** inaccuracies: "Never read or written" (already
  flagged for WP4b.1) **and** a stale "Phase 2 (WP15 drive-mode selector)" reference to a pre-M12
  numbering. Both should die in the same commit that activates the field.
- **`PICKER_ROW_CELLS`** (`components/picker/pickerRowOrder.ts`) is `["open","model","remove"]` as data,
  mapped by the component. Its header documents the nesting rule and states plainly that
  `isSiblingOfOpenButton` is **tautological** (`cell !== "open"`) and cannot prove anything — matching
  what CLAUDE.md warns. Two existing tests pin the exact array value, so **adding a cell will fail
  `projectModelCell.test.ts:37` and `announceRow.test.ts:168`** — expected, and those updates belong to
  WP4c, not here.

## Scope guard — what this WP does NOT do

Probes decide; they do not build. Explicitly **out of scope**, each already owned elsewhere:

- Activating `default_drive_mode`, setting the env var, or emitting any `additionalContext` → **WP4b**.
- Adding the cell to `PICKER_ROW_CELLS` or writing any picker JSX → **WP4c**.
- Correcting `vision.md` / `roadmap.md` / the `default_drive_mode` doc comment → **WP4d**.
- The OFF-invariant guard's fourth arm → **WP5**.
- Re-probing whether `additionalContext` is obeyed (Finding D), or probing long-context durability
  (Finding E — deliberately declined).

A **throwaway** hook fixture written under the scratchpad to settle 4a.1 is in scope; anything landing in
`src-tauri/` or `src/` is not.

## Work Tree

- [x] Phase 1: The hook-plumbing verdict — shared script vs. separate entry  <!-- status: done — all children [x], 2026-08-06 -->
  **Observable outcomes:**
  - CLI: a throwaway fixture hook script (scratchpad, NOT `src-tauri/`) is driven with a
    `UserPromptSubmit` JSON payload on stdin under both arms; for the chosen shape, `echo '<payload>' |
    <script>` exits **0** and stdout parses as JSON containing
    `hookSpecificOutput.hookEventName == "UserPromptSubmit"` + a non-empty `additionalContext`.
  - CLI: **the never-block-CC invariant holds under abuse** — with the socket path pointing at a
    non-existent path, with stdin empty, and with stdin containing malformed JSON, the script still
    exits **0** every time (`echo $?` → 0), and in the malformed case emits **no** partial/invalid JSON
    on stdout (stdout is either empty or a single valid JSON object).
  - CLI: **the OFF state is absence** — with `CLAUDESK_DRIVE_MODE` unset, the script's stdout is
    **byte-empty** (`| wc -c` → 0), not a JSON object saying "disabled".
  - CLI: `grep -c additionalContext src-tauri/resources/claudesk-hook.pl` → **0** and
    `git status --short src-tauri/ src/` → empty (the probe changed no production file).
  - [x] P1.1 Drive the shared-vs-separate decision against the real script's constraints: the
    line-44 early exit, the 10-event blast radius, `script_basename_of_command`'s exact-match detection,
    and the dual-identity registration. Write the argument down **before** picking.  <!-- status: done -->
  - [x] P1.2 Build the throwaway fixture for the chosen shape in the scratchpad and drive the four
    outcome checks above (happy path + the three abuse arms + the absence arm).  <!-- status: done -->
  - [x] P1.3 Settle 4a.2b: **how the gate reaches the hook process.**  <!-- status: done -->
  - [x] P1.4 Confirm 4a.3: the env var is the **only** possible Claudesk marker.  <!-- status: done -->

### ✅ VERDICT (a) — hook plumbing: **SHARED SCRIPT**, emission placed above the socket early-exit

**Chosen:** add the drive-mode emission to the existing `claudesk-hook.pl`, **not** a separate
`UserPromptSubmit`-only hook entry.

**The argument, written before the pick (P1.1).** Two facts found in the registration code decide it,
and neither was in the WBS:

1. **A separate entry needs a separate SCRIPT FILE, ×2 identities.** `merge_claudesk_hooks` and
   `remove_claudesk_hooks` both key on `group_is_claudesk`, which matches by **script basename**
   (`script_basename_of_command`, exact `==`). A second entry reusing `claudesk-hook.pl`'s basename is
   therefore **indistinguishable from the first**: merge would find the existing group and treat the new
   one as already-present (silent no-op), and uninstall would strip both or neither. So "just add one
   more registration" is really: a second bundled resource, a second `deploy_hook_script` call, a second
   per-identity basename pair (`claudesk-signal.pl` / `claudesk-signal-dev.pl`), and a second marker
   family threaded through merge + remove + the idempotency and self-heal paths. That is a **larger**
   change to the same registration surface than the emission itself.
2. **The blast radius is a measured 1-of-10, not a structural 10-of-10.** The feared radius came from the
   script being registered on all 10 events. But the emission is guarded by an event check, so with the
   gate ON, **exactly 1 of the 10 events emits and the other 9 are byte-silent** (measured; and the
   mutant that removes the event filter correctly fails, so the check bites).

**What was PROVEN, not argued** (`scratchpad/wp4a/check.sh`, 20/20, re-runnable):

| # | Property | Result |
|---|---|---|
| A | Happy path emits `hookSpecificOutput.{hookEventName,additionalContext}`, exit 0 | PASS |
| B | OFF (var unset **or** empty) → stdout **byte-empty**, not a "disabled" object | PASS |
| C | Never-block-CC under abuse: empty stdin · malformed JSON · dead socket · malformed+dead | exit 0, **no partial JSON** |
| C+ | Dead socket → the **signal still emits** (the two concerns are independent) | PASS |
| D | Blast radius: exactly **1 of 10** registered events emits | PASS |
| E | Telemetry **byte-identical** to the real script across **6** event shapes (`prompt`, `notification_type`, tool pair, `agent_type`, `source`, `reason`) | PASS |
| — | Unrecognized mode → emits nothing (no default invented) | PASS |
| — | All 4 kebab-case modes round-trip into the sentence | PASS |

⚠️ **The load-bearing implementation constraint WP4b must honor.** The real script does
`exit 0 if $sock_path eq ''` **at line 44, before it reads stdin**. So the emission cannot simply be
appended — it must go **above** that early exit, which means **the stdin drain moves up and is shared**
by both concerns. Placing the emission after line 44 would silently kill the signal for any session
where `CLAUDESK_HOOK_SOCK` is absent. Property C+ above is the regression test for exactly this.

⚠️ **The never-block-CC property rests on ONE construct: the outer `eval {}` wrapping the signal block.**
Mutation-proven — removing the *inner* `eval` around `decode_json` changes nothing (the outer one catches
it; they are redundant, not layered), but removing **both** makes malformed stdin exit **2** with a Perl
error on stderr, i.e. a wedged CC turn. WP4b must not "clean up" the outer `eval` as redundant.

### ✅ VERDICT (b) — the gate reaches the hook by ABSENCE (P1.3)

**Chosen shape:** when `workflow_features_enabled` is OFF, Claudesk **simply does not set
`CLAUDESK_DRIVE_MODE`** at spawn. The hook then takes the same inert path that already protects every
plain-CLI user — proven by property B (unset **and** empty-string both → byte-empty stdout).

**Why not have the hook read the gate itself:** it adds a settings-file read *per turn* on CC's critical
path, and creates a **second source of truth** that can disagree with the spawn-side check. The
absence shape has one decision point, and it satisfies the gate contract literally — *a gated surface
must not exist when off* — because there is no emission at all rather than an emission saying "disabled".

**Precedent to follow at the spawn site:** `announce/commands.rs:33` reads
`read_workflow_features_enabled(&dir).unwrap_or(false)` — **fail-closed** on any read error. WP4b's
spawn-side check should use the same call and the same `unwrap_or(false)`.

### ✅ VERDICT (c) — the env var is the only possible marker (P1.4)

Confirmed by reading `WorkspaceRegistry::resolve_cwd` (`status_broadcaster/mod.rs:240-252`): it filters
registered paths by `is_path_ancestor` and takes the **longest** match. It has **no notion of which
process spawned `claude`** — a terminal-launched session inside an open workspace's tree resolves to that
workspace identically. So cwd correlation cannot mark a session as Claudesk's; the env var can.

⚠️ **Fact WP4b inherits (found at plan time, re-confirmed here):** `color_tty_env()`
(`cc_session/mod.rs:290`) returns a **fixed-size `[(&str,&str); 4]`** with **three** call sites — `:612`
(CC spawn), `:634` (shell spawn), `:1128` (a test). The new var cannot be appended to that array; the CC
call site must compose a `Vec`, and **the shell spawn must NOT receive the var** (a raw login shell is
not a CC session).
  - [x] verify-auto  <!-- status: done — 4 scoped checks, 2026-08-06 -->
  - [x] verify-self  <!-- status: done — 4/4 outcomes PASS, subagent-verified, 2026-08-06 -->
  - [x] verify-human  <!-- status: done — operator APPROVED both verdicts, 2026-08-06 -->
    - [x] P1.verify-human.1 Verdict (a): shared script, emission above the line-44 early exit — **APPROVED**  <!-- status: done -->
    - [x] P1.verify-human.2 Verdict (b): gate reaches the hook by ABSENCE (unset var) — **APPROVED**  <!-- status: done -->
  - [x] verify-codify  <!-- status: done — 2 new tests, 3 mutants, full suite green, 2026-08-06 -->

  **verify-codify (2026-08-06).** ⚠️ **The premise handed to this step was that there was probably
  nothing to codify** (a probe phase, zero production files changed, evidence in a scratchpad script).
  That was half right — and checking it found a **real** gap worth permanent coverage.

  **The coverage audit corrected a claim I had made one step earlier.** `src-tauri/tests/hook_pl_output.rs`
  (M9 WP2) has driven the **real** hook script as a subprocess since M9, asserting the emitted payload
  across 6 tests — including **both** fields my hand-written fixture dropped. So the backlog item I filed
  during build ("nothing verifies the payload it emits") was **wrong**, and is corrected in place. *A
  transcription failure tells you about the transcription, not about the coverage of the thing
  transcribed.*

  **What the audit did find — three real gaps, the first load-bearing:**
  1. ⚠️ **never-block-CC was asserted on the HAPPY PATH ONLY.** Line 80's `assert!(status.success())`
     lives inside `run_hook_capture_line`, which can only be called with a payload that **successfully
     connects to a socket** (its reader thread blocks on `accept()`). So the arms that actually threaten
     the contract — no socket, malformed JSON, empty stdin — were **unreachable** by that assertion.
  2. **`notification_type` entirely uncovered** — the field the broadcaster gates AwaitingInput on.
  3. **stdout never asserted** — which matters *now*, because WP4b adds a stdout emission.

  **Written (2 tests + 1 helper), highest level that runs reliably — integration, not unit:**
  `run_hook_degraded()` (binds no socket, captures stdout + exit status) ·
  `never_blocks_cc_on_degraded_inputs` (6 arms: socket var absent · socket path missing · empty stdin ·
  truncated JSON · non-JSON garbage · JSON array not object — each must exit 0 and emit either nothing or
  ONE complete valid JSON object) · `notification_forwards_notification_type`.

  **Mutation-proven, each mutant attributed to its own test** (and each confirmed to have landed in
  *executable* code before believing the result, per `[[verify-the-mutation-landed]]`):

  | Mutant | Result |
  |---|---|
  | Remove the `eval` around `decode_json` | `never_blocks…` **FAILS** |
  | `exit 0` → `exit 3` on the missing-socket path | `never_blocks…` **FAILS** |
  | Drop `notification_type` forwarding | `notification_forwards…` **FAILS** |

  ⚠️ **The first mutant is the one that did NOT bite in the scratchpad fixture**, where an outer `eval`
  masked it. The real script has no such outer guard — so this test catches a genuine wedged-turn
  regression that the probe's own harness could not have detected.

  **Full suite:** 808 cargo tests (0 fail, was 788), `clippy --all-targets -- -D warnings` clean, 1924
  frontend tests (0 fail). No triage entries — zero failures. Production script restored **byte-identical
  to HEAD** after the mutants (verified via `git diff --exit-code` plus 4 structural markers).

  **verify-human (2026-08-06): APPROVED, both decisions, no corrections.** ⚠️ **Deliberately NOT
  auto-skipped**, though gates (b)/(c)/(d) were clean and (a) was ambiguous (the WIP frontmatter carries no
  `drive_mode` field, which by the letter of gate (a) means "treat as Mode 2, do not auto-skip"). The
  reason is the skill's own **"Known limitation — probe/decision-artifact false positive"**: this phase's
  load-bearing deliverable *is* a human decision ACK, so auto-skipping would have let WP4b and WP4c
  inherit an architectural choice the operator never saw. A read-time veto you must notice retroactively
  is a poor substitute for the decision gate the WBS put here on purpose (task 4a.5, and both checks were
  written as *decisions* at plan time). Verdict (a) also commits to editing the one file whose failure mode
  is a wedged CC turn, registered on 10 events × 2 identities.

  No design prior captured — the operator **confirmed** the proposed verdicts rather than correcting them,
  and the capture discriminant requires a correction/rejection carrying a transferable why.

  **verify-self results (2026-08-06):** **4/4 PASS, 0 BLOCKING, 0 COSMETIC.** Verified by a one-shot
  `feature-verify-self-runner` subagent using its own commands (not by re-reading `check.sh`, which is
  itself the artifact under test). **No integration boundary** — the phase adds isolated new artifacts
  only and modified zero files under `src-tauri/`/`src/`. No dev URL: every outcome is CLI-observable, so
  there was no running-app surface to point at.

  The subagent went **beyond** the orchestrator's own coverage in three ways worth keeping:
  - **Two additional abuse arms** — a JSON **array** instead of an object, and non-JSON garbage. Both
    byte-empty stdout, exit 0. (8 abuse arms total.)
  - **The write-failure log path exercised in a writable dir** — the `- HOOK write-failed` trace appends,
    the drive-mode signal **still emits**, and exit stays 0. This is the strongest available evidence that
    the two concerns are genuinely independent (not merely untangled on the happy path).
  - **Confirmed the fixture is a real copy, not a symlink** to production — which is what makes the
    "telemetry byte-identical" claim non-circular.

  It also independently re-derived the discriminating test for the missing-`+x` trap: the same env shape
  yields **125 bytes** with valid stdin, so the 0-byte OFF/malformed arms are real executions rather than
  a script that never ran. ⚠️ It hit **the same backgrounded-listener race** the orchestrator did (both
  scripts returning symmetric-empty — the non-decisive shape) and fixed it the same way, plus a cwd slip
  that ran the OUTCOME 4 checks from the scratchpad. Both self-corrected before reporting.

  **verify-auto results (2026-08-06):** 4 scoped checks, all pass. (1) `perl -c` on the fixture → OK;
  (2) `bash -n check.sh` → OK; (3) `perl -c` on the real `claudesk-hook.pl` → OK (unmodified);
  (4) clean re-run of `check.sh` after the 4 mutants were applied+reverted → **20/20, exit 0**.
  Plan outcomes checked literally: `grep -c additionalContext` on the real script → **0**;
  `git status --short src-tauri/ src/` → **empty**. ⚠️ `perl -c` is a **weak** signal here — it passed on
  both earlier broken fixtures too (each dropped a telemetry field group); the behavioral re-run is what
  carries the evidence.

- [x] Phase 2: The injected sentence — exact copy  <!-- status: done — all children [x], 2026-08-06 -->
  **Observable outcomes:**
  - CLI: the exact injected string is recorded verbatim in the WIP file, and driving the Phase 1 fixture
    with `CLAUDESK_DRIVE_MODE=autopilot` emits **that exact string** as `additionalContext` (byte-compare
    against the recorded copy, not a paraphrase).
  - CLI: the recorded copy **states the fact, not a prohibition** — it contains the mode value and does
    **not** contain any of `never`, `do not`, `don't`, `must not` (`grep -ciE 'never|do not|don'\''t|must not'`
    → 0). Rationale recorded: a prohibition is right at turn 1 and **wrong at turn 60**, when the operator
    may legitimately want to change mode.
  - CLI: all four `DriveMode` variants round-trip — for each of the 4 kebab-case values, the fixture emits
    an `additionalContext` naming that mode (4/4), and an **unrecognized** value emits nothing and exits 0.
  - [x] P2.1 Write the sentence. Record it verbatim.  <!-- status: done -->
  - [x] P2.2 Decide what an **unset/absent** mode means on the wire.  <!-- status: done -->

### ✅ VERDICT (d) — the injected sentence, verbatim

```
Claudesk reports the drive mode for this workspace as <mode>.
```

Where `<mode>` is one of **`stepping` · `orchestrated` · `autopilot` · `fsd`** (see Verdict (e) — this is
NOT the vocabulary Claudesk's enum currently emits).

**Why this wording**, against three candidates that all satisfied the no-prohibition rule:
- **It states a FACT, not a prohibition** — the P2.1 requirement. `grep -ciE 'never|do not|don't|must not'`
  → 0. A prohibition (*"never present the drive-mode menu"*) is correct at turn 1 and **wrong at turn 60**,
  when the operator may legitimately want to change mode; a per-turn prohibition would fight that.
- **It ATTRIBUTES the source** (*"Claudesk reports…"*) rather than asserting bare state. Two reasons: a
  model at turn 60 can recognize it as standing environmental context rather than a fresh instruction; and
  it is what lets the model **reconcile** this against `.session.md`'s own `drive_mode:` — which Finding D
  observed happening spontaneously (*"from the pointer's `drive_mode`, matching what Claudesk reports for
  this workspace — so no mode menu"*). The rejected bare form (*"Drive mode for this workspace is X"*)
  gives the model nothing to reconcile *with*.

⚠️ **HONESTY REQUIREMENT (carried from the plan, and it must not be dropped):** the *probe's own* wording
in Finding D **did include a prohibition clause and still worked.** So fact-not-prohibition is a
**durability JUDGEMENT, not a measured requirement.** No experiment here distinguishes the two forms —
the long-context claim that motivates the preference is itself ASSUMED (Finding E). Do not upgrade this.

### ✅ VERDICT (f) — an unset mode emits NOTHING (no default invented)

Absence on the wire = **no `additionalContext` line at all**, never a line naming a default. Verified:
unset, empty-string, and any unrecognized value each produce **byte-empty stdout, exit 0**.

**The reason is stronger than Finding F recorded, and it was measured here:** Finding F says
`session-start` and `session-restore` disagree on their defaults. In fact **`session-restore` disagrees
with ITSELF, inside one file** — step 4 priority 4 says *"Default to `orchestrated` (Mode 2)"*
(`SKILL.md:42`) while its own menu five lines later labels **`3 Autopilot`** as *"(default)"*
(`SKILL.md:59`). There is therefore no coherent upstream default to copy even from a single skill, and any
default Claudesk emitted would be Claudesk inventing policy for the workflow system. Emitting nothing
leaves the skill's own resolution chain intact — which is exactly the "zero companion-repo change"
constraint.

### ⚠️ VERDICT (e) — **`DriveMode`'s serialized vocabulary is WRONG on 2 of 4 variants** (WP4b blocker)

Found while writing the sentence; **this invalidates a WBS premise.** The WBS says `default_drive_mode`
"is already typed `Option<DriveMode>` with the right kebab-case vocabulary and just needs activating"
(4b.1). It is **not** the right vocabulary:

| Mode | Claudesk `DriveMode` serializes to | Workflow system's ACTUAL value | |
|---|---|---|---|
| 1 | `step-by-step` | **`stepping`** | ❌ |
| 2 | `orchestrated` | `orchestrated` | ✓ |
| 3 | `autopilot` | `autopilot` | ✓ |
| 4 | `full-autopilot` | **`fsd`** | ❌ |

**Authority (three independent sources, all agreeing):** `transitions.md:165` — *"stored … as `drive_mode:
stepping \| orchestrated \| autopilot \| fsd`"*; `session-handoff/SKILL.md:75`'s writer template —
`<stepping|orchestrated|autopilot|fsd>`; and **29 real archive WIP files**, which carry only `autopilot`
(28) and `orchestrated` (1).

**The concrete failure this would have shipped:** selecting mode 4 in the picker emits
`full-autopilot`, which is not a value any skill recognizes → the guard rejects it → **nothing is emitted
and the feature silently does nothing for that mode.** Measured: `full-autopilot` → 0 bytes.
⚠️ **My own Phase 1 fixture had this bug too** (`step-by-step`/`full-self-drive` — matching *neither*
vocabulary), which is why Phase 1's "4 modes round-trip" PASS did not catch it: the fixture and the enum
were consistently wrong together. **A round-trip test proves symmetry, not correctness** — it cannot
detect a vocabulary both sides share and both get wrong. Only comparing against the external consumer did.

**WP4b must fix the enum** (rename the two variants' serde values, or add explicit
`#[serde(rename = "…")]`), and its round-trip test must assert against the **literal strings from
`transitions.md`**, not against the enum's own output.

**Evidence added for this (`check.sh` §E2, now 24 checks):** the three non-canonical values
(`step-by-step`, `full-autopilot`, `full-self-drive`) must each emit **0 bytes**. If any ever emits, the
enum was activated without being fixed.

⚠️ **One check in `check.sh` was NARROWED in this phase, and the reason matters.** The
"production tree untouched" arm asserted `git status --short src-tauri/ src/` was **empty** — which
correctly **FAILED** once verify-codify legitimately added tests to `src-tauri/tests/hook_pl_output.rs`.
The invariant a probe actually needs is *"the script I am reasoning about is pristine"*, not *"the tree is
clean"* — a probe may absolutely add tests. Narrowed to assert (a) `claudesk-hook.pl` has **0 diff vs
HEAD** and (b) **no non-`tests/` file** under `src-tauri/`/`src/` is modified. **Mutation-proven after
narrowing:** appending one line to the real script makes it FAIL with `TOUCHED (diff_lines=1)`. The
narrowing was verified to be a *scope* correction, not a weakening — the only dirty path at the time was
the test file.
  - [x] verify-auto  <!-- status: done — 4 scoped checks + targeted regression, 2026-08-06 -->
  - [x] verify-self  <!-- status: done — 3/3 outcomes PASS, subagent-verified, 2026-08-06 -->
  - [x] verify-human  <!-- status: done — operator APPROVED all 3, 2026-08-06 -->
    - [x] P2.verify-human.1 Verdict (d): the sentence's wording — **APPROVED**  <!-- status: done -->
    - [x] P2.verify-human.2 Verdict (f): absence emits nothing — **APPROVED**  <!-- status: done -->
    - [x] P2.verify-human.3 Verdict (e): the `DriveMode` vocabulary fix belongs to **WP4b** — **APPROVED**  <!-- status: done -->
  - [x] verify-codify  <!-- status: done — 1 tripwire test, mutation-proven, full suite green, 2026-08-06 -->

  **verify-codify (Phase 2, 2026-08-06).** Two of the three approved verdicts (the sentence, absence-
  emits-nothing) describe **text that does not exist in production yet** — WP4b writes the emitter, so
  WP4b codifies them. The third is a **bug in code that ships today**, and it *was* codifiable here
  without touching the enum.

  **Written: 1 test — `drive_mode_serializes_to_these_literal_strings`** (`config_store/mod.rs`).
  ⚠️ **It deliberately pins the values that are KNOWN WRONG**, as a **tripwire for WP4b**, not an
  endorsement. Rationale: a test asserting the *correct* strings would be **red on `main`** (worse than no
  test), and making it green means renaming the variants — production work the operator assigned to WP4b.
  So it asserts today's reality and **fails the moment WP4b renames**, with an assertion message naming
  the new expectation. **Mutation-proven twice** (before and after `cargo fmt`): adding
  `#[serde(rename = "stepping")]` / `#[serde(rename = "fsd")]` fails it with
  `left: ["stepping", …, "fsd"]` vs `right: ["step-by-step", …, "full-autopilot"]`.

  ⚠️ **Why this test was needed at all — the third instance of one failure shape in this WP.** The
  pre-existing `drive_mode_field_is_reserved_and_round_trips` writes `DriveMode::Autopilot` and reads back
  `DriveMode::Autopilot`, **never inspecting the JSON** — it passes identically whether the on-disk value
  is `autopilot`, `full-autopilot`, or `banana`. **Proven directly:** it passed *through* the rename
  mutation that the new test caught. Also confirmed: **no test in that file reads `projects.json` as
  text**. The three instances, all the same lesson —

  | # | The check | What it compared | Blind to |
  |---|---|---|---|
  | 1 | `drive_mode_…round_trips` | enum → serde → enum | the string itself |
  | 2 | WP4a's Phase 1 fixture "4 modes round-trip" | fixture ↔ its own vocabulary | a vocabulary both sides share and both get wrong |
  | 3 | `check.sh`'s substring arm | emission ↔ the mode name it was built from | copy drift |

  **A comparison against yourself proves symmetry, not correctness.** Each needed an *external* referent:
  `transitions.md`'s literal strings, and the WIP-recorded copy.

  **Full suite:** 809 cargo (0 fail), `clippy --all-targets -- -D warnings` clean, `cargo fmt --check`
  clean, 1924 frontend (0 fail). No triage entries — zero failures. ⚠️ `cargo fmt` reformatted my Phase 1
  test file too (written before fmt ran); verified **additions only, zero deletions** (`git diff --stat`:
  +217/−5, the −5 being `wbs.md`'s handoff footer), and the tripwire re-mutation-tested *after* formatting.
  Production hook script confirmed pristine.

  **verify-human (Phase 2, 2026-08-06): APPROVED, all 3, no corrections.** ⚠️ Deliberately NOT
  auto-skipped, same reasoning as Phase 1 (the skill's own "probe/decision-artifact false positive"
  limitation, plus gate (a) is ambiguous — no `drive_mode` in this WIP's frontmatter).

  ⚠️ **The operator chose WP4b (not WP4a) as the home for the `DriveMode` fix**, which keeps this probe's
  scope guard intact — no production code in a probe WP. The offered alternative (fix it here as a
  one-liner, since the probe already knows the correct values) was **declined by not being taken**; WP4b
  task 4b.1 owns it, tracked by
  `SURFACE-2026-08-06-DRIVEMODE-SERDE-VOCABULARY-WRONG-ON-2-OF-4-VARIANTS`.

  No design prior captured — all three were **confirmations** of proposed verdicts rather than
  corrections, so the capture discriminant (a correction carrying a transferable why) is not met.

  **verify-self results (Phase 2, 2026-08-06): 3/3 PASS, 0 BLOCKING, 0 COSMETIC.** No integration
  boundary — Phase 2 changed only the scratchpad fixture + evidence script (the one dirty `src-tauri/`
  path is the *test* file from Phase 1's verify-codify).

  ⚠️ **The subagent found a REAL WEAKNESS IN `check.sh` that this WP had not noticed, and it is the most
  valuable output of this step.** The "4 known modes round-trip" arm was a **substring** match
  (`case "$AC" in *"$M"*`) that **never read the WIP file** — so it *could not detect copy drift*: any
  rewording still containing the mode name would have passed. The byte-compare that *did* catch drift
  existed only as a one-off shell command in verify-auto, i.e. **not in the re-runnable artifact.**
  Fixed here: the arm now reads the recorded sentence out of VERDICT (d) and byte-compares per mode.
  **Mutation-proven** — changing one word (`workspace`→`project`) now fails 4 checks that previously all
  passed. `check.sh` is now **25/25**.

  This is the same failure shape as the `DriveMode` bug found in Phase 2's build: **a check that compares
  a thing against itself proves symmetry, not correctness.** The substring arm compared the emission
  against the mode name it was built from; the round-trip test compared the enum against a fixture sharing
  its vocabulary. Both needed an *external* referent — here, the WIP-recorded copy.

  The subagent also **mutation-tested each of its own checks** (copy drift · prohibition scan · allowlist
  widening), confirming each mutant landed in executable code via `sed -n` before believing a result, and
  used a positive control (`fsd` → 140 bytes) to rule out the never-ran false pass. It tested **13**
  non-canonical values where the orchestrator tested 3 — adding case variants (`STEPPING`, `Autopilot`),
  whitespace-padded values, the empty string, and the numeric `1`–`4` (the affordance the log study found
  the operator never uses). All 13 → 0 bytes, exit 0.

  **verify-auto results (Phase 2, 2026-08-06):** 4 scoped checks + 1 targeted regression, all pass.
  (1) `perl -c` + `bash -n` on the two changed files → OK. (2) **Exact-copy byte-compare** — the expected
  string is **extracted from the WIP verdict (d)** and `<mode>` substituted, *not* hardcoded, so a drift
  between the recorded copy and the emitted copy would fail: BYTE-EQUAL. (3) prohibition-word grep on the
  **emitted** string → 0 hits. (4) 4/4 canonical variants round-trip; `bogus-mode`, `step-by-step` and
  `full-autopilot` each → 0 bytes. (5) targeted `cargo test --test hook_pl_output` → **8/8**, which also
  confirms Phase 1's mutation cycle left the production script correctly restored. Full suite deliberately
  NOT re-run (out of scope for verify-auto; it ran green at Phase 1 verify-codify).

- [x] Phase 3: The picker-row cell mockup + operator choice  <!-- status: done — all children [x], 2026-08-06 -->
  **Observable outcomes:**
  - Browser: a side-by-side mockup artifact renders **≥3 distinct cell designs** for the same row, each
    shown at **realistic project-name lengths** (including the longest name in the operator's real
    recents) and in the app's dark tokens; the page does not scroll horizontally.
  - Browser: each mockup option shows the row's **full existing cell load** — name + announce label +
    `⊘` + the M11.5 model cell + `×` — so space competition is visible rather than asserted. ⚠️ Row
    space competition is a **KNOWN, already-paid defect** (WP3's P3.9 back-loop), so a mockup that hides
    it is useless.
  - Browser: each option shows **both** states of the compact-readout-then-edit interaction (resting
    readout + the editing affordance), since "click to edit, never a live `<select>` on every row" is the
    already-decided corollary of design prior `set-a-spawn-time-choice-where-the-spawn-is-chosen`.
  - CLI: the operator's chosen option + the reason is recorded in the WIP file, and
    `git status --short src/` is empty (no picker code was written in this WP).
  - [x] P3.1 Build the mockup via `/util-option-mockup`.  <!-- status: done -->
  - [x] P3.2 Record the operator's choice + reason.  <!-- status: done -->

### ✅ VERDICT (g) — the cell is **OPTION 2: model + mode STACKED in the existing 7.5em column**

**Operator-chosen 2026-08-06** from a 4-option side-by-side mockup drawn in Claudesk's real tokens at the
true 592px row width. Artifact saved durably at
**`docs/reference/m12-wp4a-drive-mode-cell-options.html`** (published:
`https://claude.ai/code/artifact/eb863686-65da-4134-8722-6d4f37536f70`). ⚠️ Per the mockup skill's
lifecycle rule, **this written verdict governs; the artifact is not a spec** and must not drift into being
treated as one.

**Shape:** the existing `.picker-recent-model` column (7.5em) becomes a two-line stack — model on line 1,
drive mode on line 2, right-aligned, chrome-less. Resting state is a **compact readout**; clicking a line
makes *that line* editable in place. **No live `<select>` on any row** (the constraint, and Option 4 was
drawn specifically to show its cost).

**⚠️ THE REFRAME THE DRAWING PRODUCED — do not lose this, it is the reason Option 2 wins.** The question
was framed as *"which option preserves the path?"* That frame is **false**: the path is **already
ellipsised today** (70-char path ≈ 462px into ~346px available) and the headline is **already over budget**
(37-char name ≈ 274px + announce badge cap 192px ≈ 466px into 346px). No option protects a healthy row —
each one chooses **which already-strained thing strains further**. Invisible in prose; that is what the
mockup was for.

**Measured axis** — ⚠️ **all figures est. from the mockup's geometry, NOT instrumented on a running app**
(no app was running and one was not launched merely to measure a mockup):

| option | usable name/path | Δ vs current | row height | headline over budget? |
|---|---|---|---|---|
| current (3 cells) | ~346px | — | ~67px | **yes, already** (~466/346) |
| 1 · 4th sibling cell | ~243px | **−102px** | ~67px | yes, worse |
| **2 · stacked (CHOSEN)** | **~346px** | **0px** | **~67px** | **unchanged** |
| 3 · 2nd headline badge | ~346px | 0px | ~67px | **yes, ~554/346** |
| 4 · live `<select>` (trap) | ~243px | −102px | ~67px | yes, worse |

**Why Option 2, concretely:** the cell **already has two lines of vertical room**, because the name/path
text stack is taller than the one-line model readout. The second line is therefore **free** — no width
taken from the text stack, no row growth, ×16 rows. Its cost is **semantic, not spatial**: two unrelated
settings share one column.

**Why Option 3 was rejected although it also costs 0px** — it read well in prose and the drawing killed
it: the headline is ~554px into ~346px, so the 37-char name degrades to a stub; and it would place an
**interactive control inside the open-button's headline, immediately beside `.picker-recent-announce`** —
a readout whose CSS comment states it is *"a READOUT, not a control: no border, no hover, not
focusable."* Option 3 undoes that distinction one element over.

**⚠️ LOAD-BEARING CONSEQUENCE WP4c INHERITS (exposed by the drawing, not predicted by the WBS):**
Option 2 puts **two edit targets inside one 7.5em column**, so the model cell's existing click-to-edit
becomes **ambiguous** unless each line owns its own hit region. WP4c must give the two lines separate
hit-targets rather than inheriting one cell-wide click handler. ⚠️ This is the *same* class of defect
`pickerRowOrder.ts` was created for (a click landing on the wrong target, presenting as *"the control
does nothing"*) — and note that file's own warning: `isSiblingOfOpenButton` is **tautological**
(`cell !== "open"`) and protects nothing here.

**Also for WP4c:** Option 2 **does not add a member to `PICKER_ROW_CELLS`** — it enriches the existing
`"model"` cell. So the two tests pinning that array's exact value
(`projectModelCell.test.ts:37`, `announceRow.test.ts:168`) **should NOT need updating**, unlike every
other option. If a WP4c change starts requiring those edits, the implementation has drifted from this
verdict toward Option 1.

### ✅ VERDICT (h) — the resting labels: **label ONLY when unset** (operator, 2026-08-06)

| state | line 1 | line 2 |
|---|---|---|
| neither set | `Model: Default` | `Drive Mode: None` |
| both set | `opus` | `autopilot` |
| mixed | `opus` | `Drive Mode: None` |

**The operator's ask, verbatim:** *"the default placeholder text should say 'Model: default', 'Drive Mode:
None', or something along the line."* The **problem it identifies is real and Option 2 created it**: with
two *bare* values stacked in one column, `Default` over `None` is **unlabeled** — nothing tells you which
line is which. A single-value cell never had that problem.

⚠️ **This REVISES the standing rationale in `modelOverride.ts`, so read that comment carefully before
"fixing" this.** `MODEL_UNSET_LABEL`'s doc says the row label is *"deliberately shorter… the row is a
scannable column where brevity matters."* That reasoning is sound but assumed **one value per row**;
stacking two makes brevity produce ambiguity. The verdict keeps brevity where it still works (set values)
and spends width only where it is needed (unset values).

**Why not the fully-labeled form the operator first proposed** — measured, not assumed: the column has
**~101px usable** (7.5em − 0.6em×2 padding). `Model: Default` ≈ 84px **fits**, but
`Drive Mode: orchestrated` ≈ **144px** and ellipsises to `Drive Mode: orchestr…`, **destroying the value**
— the one part that must survive. Rejected alternatives: a short prefix (`Mode  orchestrated`, fits
everything but drops the word "Drive" from the row), and widening the column to ~9.5em (costs ~32px off a
text stack that is *already* ellipsising). The operator chose the third: **no width cost, at the price of
rows differing in shape** between a labeled unset row and a bare set row.

**⚠️ A MOCKUP ERROR THIS EXPOSED — the artifact shows FAKE content in one place.** The mockup drew the
unset model cell as `inherit`. The real product renders `MODEL_UNSET_LABEL` = **`"Default"`**, derived as
`MODEL_UNSET_PLACEHOLDER.split(" (")[0]` from `"Default (CC's own)"` (`src/cc/modelOverride.ts:39-50`).
`inherit` appears **nowhere** in the UI — it is only prose in code comments. This is exactly the
*"fake content destroys the density signal"* pitfall the mockup skill names, and it is a live reminder that
the saved artifact is **not** a spec: **this written verdict governs**. WP4c should read the real constants,
not the drawing. *(The artifact is deliberately left as-drawn rather than retouched — it is the historical
record of what was decided from, and its own error is instructive.)*

**For WP4c — do not hardcode either string.** `MODEL_UNSET_LABEL` is derived from
`MODEL_UNSET_PLACEHOLDER` precisely so a copy change to one cannot leave the other stale — the comment
records that *"they were two independent hardcoded strings until code review caught it."* The drive-mode
labels must follow the same derivation discipline, and the `Model:`/`Drive Mode:` prefixes belong in one
place, not inlined at the two render sites.
  - [x] verify-auto  <!-- status: done — 6 scoped checks, 2026-08-06 -->
  - [x] verify-self  <!-- status: done — 2 BLOCKING defects found + fixed in place, re-verified, 2026-08-06 -->
  - [x] verify-human  <!-- status: done — operator chose Option 2 + label-only-when-unset, 2026-08-06 -->
    - [x] Operator picks one cell design from the side-by-side mockup — **Option 2**  <!-- status: done -->
    - [x] Resting-label copy refinement — **label only when unset** (operator-initiated)  <!-- status: done -->
  - [x] verify-codify  <!-- status: done — 2 tests written after DISPROVING the no-op claim, 2026-08-06 -->

  **verify-codify (Phase 3, 2026-08-06): 2 tests written.** ⚠️ **This step was entered with my own
  reasoning that there was NOTHING to codify — and that reasoning was WRONG.** It is recorded here rather
  than quietly dropped, because the way it failed is the reusable part.

  **The claim I made at verify-self:** *"the deliverable is a decision plus a reference artifact; there is
  no production behavior to regress; WP4c codifies when the real cell ships."* Two of those three clauses
  are true. The false one: **Verdict (h) is not purely about future code.** It builds directly on
  `MODEL_UNSET_LABEL` — a constant that **ships today**.

  **What testing the claim found (rather than confirming it):** `MODEL_UNSET_LABEL` had **ZERO test
  references anywhere in the repo**, despite existing *only* to be a derived short form of
  `MODEL_UNSET_PLACEHOLDER`. Its doc comment records why the derivation exists — *"they were two
  independent hardcoded strings until code review caught it"* — and nothing guarded that.
  **Mutation-proven before writing anything:** replacing it with a hardcoded `"Inherit"` passed **all 1924
  tests**. ⚠️ And `inherit` is precisely the wrong word **this WP's own mockup printed**, in a published
  artifact used to make a product decision. The drift the derivation prevents is not hypothetical — it
  already happened once in this WP, in a document.

  **Written: 2 tests** in `src/cc/__tests__/modelOverride.test.ts` —
  `derives the row label from the placeholder rather than hardcoding it` (asserts the *relationship*:
  prefix, shorter, equals the split, no surviving parenthetical) and
  `renders the unset row label as the product's actual word` (pins the literal `"Default"`, since the
  derivation alone cannot catch both constants being renamed together).

  **Mutation results — 3 mutants, and the middle one is an HONEST LIMITATION, not a pass:**

  | mutant | result |
  |---|---|
  | `= "Inherit"` (the one that passed 1924 tests before) | **2 tests FAIL** ✓ |
  | `= "Default"` — right word, **not derived** | **passes** ⚠️ |
  | `.split("(")` — wrong delimiter | **2 tests FAIL** ✓ |

  ⚠️ **The second mutant is undetectable at runtime by construction:** a hardcode that happens to equal the
  derivation's output is indistinguishable from the derivation. Catching it needs a source-text guard —
  which this repo has repeatedly measured to be the weaker instrument (three `?raw` guards in M10.9/M11
  passed while broken). Recorded as a known gap rather than papered over with a guard that would give false
  confidence.

  **Why WP4c should care:** it adds a **second** label to this same cell under Verdict (h), doubling the
  drift surface. The guard now exists *before* the second label lands, not after.

  **Still correctly NOT codified:** the mockup itself. The artifact is explicitly *not a spec* (the written
  verdict governs), so pinning its markup would pin a document allowed to drift while the verdict does not.
  Its two BLOCKING defects are fixed with causes written into the file's own comments — the durable form for
  a one-off document.

  **Suite:** 1926 frontend (+2, 0 fail), 809 cargo (0 fail), `tsc --noEmit` clean, `format:check` clean.
  Lint: 1 pre-existing **warning** in `XtermPane.tsx` (spread in a `useEffect` dep array) — untouched by
  this WP, 0 errors. No triage entries.

  **verify-self results (Phase 3, 2026-08-06): 2 PASS, 2 BLOCKING FAIL → both FIXED IN PLACE and
  re-verified.** ⚠️ **This is the step that earned its keep** — verify-auto's grep-based checks passed the
  same artifact 6/6 while it was, in fact, **illegible**. Only rendering it caught that.

  **Defect 1 (BLOCKING) — no `<meta charset>`, so every glyph mojibaked.** `document.characterSet` resolved
  to **`windows-1252`**; **58 mojibake sequences** page-wide; ⊘ → `âŠ˜` and × → `Ã—`. The file's bytes were
  valid UTF-8 all along (`e2 8a 98`) — purely a missing declaration. ⚠️ **Why it was invisible:** the
  *publish* pipeline supplies its own `<head>`, so the **published** copy rendered fine while the
  **saved** `docs/reference/` copy — the durable one, the whole point of saving it — was broken. Any future
  artifact written for both destinations needs the charset line explicitly.
  ⚠️ Graded **BLOCKING, not cosmetic**, because the two illegible glyphs were the **⊘ and ×** — two of the
  five cells this mockup exists to compare.

  **Defect 2 (BLOCKING) — the page scrolled horizontally.** `.frame` was `width:592px` with
  `max-width:none`, so its own `overflow-x:auto` **could never engage** (scrollWidth always == clientWidth,
  **0 of 8** frames self-scrolled) and the overflow escaped to the body: `documentElement` scrollWidth 616 >
  clientWidth 600, a **real 11–16px pan** (`window.scrollX === 16`), breaking below a 616px viewport.

  **Fixes applied (in-place shortcut — all three gates held; see the `[SHORTCUT-…]` entry in
  `## Discoveries`):** the charset line; `.frame` → `max-width:100%` with the true 592px moved onto `.row`;
  a new `.row-wrap` so the magenta reference line tracks the **row** rather than the shrinking frame; and a
  `.table-scroll` wrapper on the comparison table.

  ⚠️ **THE `.row-wrap` WAS NOT IN THE FIX I FIRST WROTE — I caught it by asking what my own fix broke.**
  `.refline` was absolutely positioned against `.frame`; once `.frame` became shrinkable, the line would
  have drifted off the × column at any viewport below 616px while the row stayed 592px. The shared
  reference line is precisely what makes these frames *a comparison rather than three separate pictures*,
  so silently losing it would have defeated the artifact while every other check passed.

  ⚠️ **AND THE FIRST FIX WAS INCOMPLETE — a fresh subagent found the page STILL panned at 380px.** With
  the frames corrected, the unwrapped comparison `<table>` became the **binding constraint**
  (min-content ~366.5px + 24px body padding ≈ 391px). Attribution was decisive rather than guessed:
  hiding the table alone restored 380px to clean, while neutralizing the `.frame` fix ballooned the pan to
  247px — proving my fix was load-bearing *and* that a second, previously-masked defect existed.
  **The durable lesson: removing the largest overflow source UNMASKS the next one, so "no horizontal
  scroll" must be RE-MEASURED after each fix, never inferred from the fix you just made.**

  **Final measurement (orchestrator-run, 7 viewports — 1200/700/616/600/480/380/320):** every one
  `scrollWidth == clientWidth`, `pan === 0`; frames self-scroll 8/8 at ≤616px; the table self-scrolls at
  380/320px; **`.row` is exactly 592px at every width** (the artifact's load-bearing geometry survived);
  refline drift a constant **1.41px**. ⚠️ 320px was **not** in the original outcome list — added because the
  380px failure showed the sweep's floor was untested.

  **⚠️ TWO OF MY FOUR ESTIMATES WERE WRONG, and the record is corrected accordingly** (measured on the
  rendered DOM; my figures were CSS arithmetic, never instrumented):

  | option | my estimate | measured | Δ |
  |---|---|---|---|
  | 1 · 4th cell | ~243px | **260.5px** | **+17.5** |
  | 2 · stacked (CHOSEN) | ~346px | 341.7px | −4.3 |
  | 3 · 2nd badge | ~346px | 341.7px | −4.3 |
  | 4 · live select | ~243px | 241.8px | −1.2 |

  **Option 1's penalty was OVERSTATED** — it costs ~17.5px less than the mockup's `−102px` claim says.
  ⚠️ This does **not** change Verdict (g): Option 2 still costs **0px** and Option 1 still costs ~85px of an
  already-ellipsising path. But the artifact's own table now overstates one option's cost, which is another
  reason **the written verdict governs, not the drawing**.

  **The mockup's central thesis was CONFIRMED, and harder than drawn:** **7 of 8** `.name` elements
  ellipsise and **all 8** `.path` elements clip. Even a **26-char** name clips in Option 3 (194px into
  112px). Only one name escapes, at exactly 176/176px — zero margin. The row is over budget *today*, before
  anything is added.

  **verify-auto results (Phase 3, 2026-08-06):** 6 scoped checks, all pass. (1) HTML well-formedness via a
  real parser (unclosed-tag/stray-close walk) → **0 errors**. (2) No CSS garbage — the `--anno-dim:#a3traight`
  typo caught during build is gone; ⚠️ my first grep for it **false-positived on the word "straight"** in
  prose, so it was re-checked against the malformed hex specifically. (3) Every `var()` resolves —
  3 used, 3 defined, none undefined-without-fallback. (4) **4 options** (≥3 required), the trap included.
  (5) **All 8 frames** carry the full cell load (name · path · gutter · model/stack/select · ×), verified by
  splitting the file per frame rather than counting occurrences globally — ⚠️ a global count of
  `.picker-recent-name` read **0** because the artifact uses short local class names, which would have been a
  false FAIL had I not checked per-frame. (6) Real project names present including the 37-char longest;
  7 state captions covering resting **and** editing for every option. Scope: `git status --short src/` →
  **0 lines** (no picker code written).

  ⚠️ **verify-human was taken EARLY and out of order for this phase, deliberately.** The phase's only
  human check *is* the operator's choice, and the choice had to happen at the mockup — that is what a
  decision instrument is for. So P3.1/P3.2 and verify-human resolved in the same exchange; verify-self
  still runs after, on the artifact's mechanical properties.

- [x] Phase 4: Record both verdicts in "Probe outcomes"  <!-- status: done — all children [x], 2026-08-06 -->
  **Observable outcomes:**
  - CLI: `workflow-system/product/wbs.md` → "Probe outcomes" gains a WP4a section containing the
    hook-plumbing verdict, the gate-reaches-the-hook shape, the verbatim injected copy, the
    unset-mode meaning, and the chosen cell design — each with its reasoning, so WP4b/WP4c **build
    rather than re-decide**.
  - CLI: the recorded text labels long-context durability **ASSUMED, not proven**
    (`grep -c 'ASSUMED' <the new section>` → ≥1) and does **not** claim the shared-vs-separate choice was
    measured if it was argued rather than measured.
  - CLI: `git status --short` shows changes confined to `workflow-system/` (no `src/`, no `src-tauri/`).
  - [x] P4.1 Write the WP4a "Probe outcomes" section with both verdicts + reasoning.  <!-- status: done -->
  - [x] P4.2 Record the incidental code facts WP4b/WP4c inherit.  <!-- status: done -->

  **Phase 4 output (2026-08-06):** `wbs.md` gained **Verdicts (c)–(f)** + an
  `#### Incidental code facts WP4b/WP4c inherit` block, and all **six** WP4a tasks (4a.1–4a.5, incl. 4a.2b)
  are marked `[x]`. The four **"Open questions carried into the WPs"** are now all CLOSED, each collapsed
  into a `<details>` with a pointer to the verdict that closed it and a note where the *answer* turned out
  stronger than the question assumed.

  ⚠️ **LETTERING COLLISION, resolved deliberately — do not "fix" it.** This WIP numbers its verdicts
  **(a)–(h)** in a local sequence; `wbs.md` already had **(a)** and **(b)** from WP1. So the WBS entries
  continue *its* sequence as **(c)–(f)**, and a mapping note is written into `wbs.md` itself
  (`(c)←(a)+(b)+(c)`, `(d)←(d)`, `(e)←(e)+(f)`, `(f)←(g)+(h)`). Renumbering this WIP instead would have
  invalidated every cross-reference written during Phases 1–3.

  ⚠️ **The two constraints from the task brief were honored explicitly, not just intended:** the
  shared-vs-separate choice is labelled **ARGUED from code, with its safety measured** — not "measured";
  and long-context durability is labelled **ASSUMED** wherever it appears. Verdict (d) carries the
  fact-not-prohibition caveat verbatim (the probe's own wording included a prohibition and still worked).
  - [x] verify-auto  <!-- status: done — 6 scoped checks, 2026-08-06 -->
  - [x] verify-self  <!-- status: done — 4 passes; 7 BLOCKING found + fixed; 4th pass clean, 2026-08-06 -->
  - [x] verify-human  <!-- status: done — operator APPROVED, 2026-08-06 -->
    - [x] P4.verify-human.1 The record is sufficient for WP4b/WP4c — **APPROVED**  <!-- status: done -->
  - [x] verify-codify  <!-- status: done — 1 guard written after DISPROVING the no-op claim (again), 2026-08-06 -->

  **verify-codify (Phase 4, 2026-08-06): 1 test written.** ⚠️ **I entered this step believing there was
  nothing to codify — for the SECOND time in this WP, that was wrong.** Phase 3's version of the same
  mistake is recorded above; this is the repeat, and the repeat is the more interesting datum.

  **Why the reasoning fails the same way twice:** "the phase only produced prose" is true and irrelevant.
  **Prose that makes factual claims about SHIPPING CODE is testable** — the claim is the specification.
  Phase 4 made three such claims; two were already guarded (the hook's line-44 ordering, via
  `hook_pl_output.rs`; `PICKER_ROW_CELLS`' exact value, via two pinning tests). **The third was not.**

  ⚠️ **MEASURED BEFORE WRITING ANYTHING: injecting `CLAUDESK_DRIVE_MODE` into `color_tty_env()` — the
  precise wrong fix WP4b's builder is warned about — passed ALL 809 TESTS.** The trap the WBS names by
  consequence (*"leaks the var into the raw login shell"*) had **zero** mechanical protection. And
  `spawn_shell` had no test referencing its env at all.

  **Written: `color_tty_env_carries_nothing_beyond_color_and_locale`** (`cc_session/mod.rs`) — an
  **exact-set** assertion on the env's key names, deliberately *not* a denylist on
  `CLAUDESK_DRIVE_MODE`: a denylist catches only the one name someone thought of, whereas the real
  property is *"this env is exactly the color+locale concern, and it reaches BOTH spawn paths."* Adding a
  genuinely shared var stays legitimate — it just becomes a deliberate edit to the expected list with the
  shell spawn considered.

  **Mutation-proven, 2 mutants:**

  | mutant | result |
  |---|---|
  | Append `CLAUDESK_DRIVE_MODE` (**passed 809 tests minutes earlier**) | **FAILS** ✓ |
  | Drop a locale var (the M10.5 WP4 mojibake regression) | **compile error** — stronger than a test |

  **Suite:** 810 cargo (+1, 0 fail), clippy `--all-targets -- -D warnings` clean, `cargo fmt --check`
  clean, 1926 frontend. No triage entries.

  **Correctly NOT codified:** the verdicts' prose, the cross-references, and the WP4b re-size. Those are
  decisions and estimates, not behaviors — nothing regresses if the wording changes.

  **verify-human (Phase 4, 2026-08-06): APPROVED.** Operator also accepted the standing
  long-context-durability caveat (**ASSUMED, not proven** — unchanged by this WP).

  ⚠️ **OPERATOR QUESTION: should the `DriveMode` fix be its own WP?** Asked because WP4a surfaced it as a
  WP4b blocker *after* WP4b was sized. **Answered: NO — keep it inside WP4b, but RE-SIZE WP4b M → L.**
  Reasoning, recorded so it is not re-litigated:
  - **It is not separable work.** Verdict (e)'s failure mode is *"modes 1 and 4 emit nothing"* — and WP4b
    **is** the emission. A separate WP would have no independent verification surface: the enum fix's only
    observable is the signal WP4b builds, so it would have to land first and be verified through WP4b anyway.
  - **The allowlist belongs to 4b.3 regardless**, and the correct vocabulary is its *input*. Splitting them
    puts one half of a single guard in each WP.
  - **It is three changes to ONE deliverable** (enum values · allowlist · third inert arm), not a second
    deliverable — which is the WBS's own test for what earns a WP.

  **What WAS warranted: WP4b re-sized M → L**, since its size predates all three additions. ⚠️ Recorded as
  an *estimate correction*, not a scope change — nothing was added to WP4b that Verdict (e)/(c) had not
  already assigned to it.

  **verify-self (Phase 4, 2026-08-06) — THE MOST VALUABLE STEP IN THIS WP, and the one I got wrong
  three times.** ⚠️ Verify-auto had passed the same file 6/6 on string-presence. The substantive question
  — *could WP4b/WP4c actually BUILD from this?* — was **FAIL**, three passes running.

  **The recurring defect, named once because it recurred four times: THE RECORD WAS ONE-DIRECTIONAL.**
  Every verdict was individually correct, reasoned, and measured. But a builder does not enter at
  "Probe outcomes" — they enter at **`### WP4b`**, because the task list *is* the build instruction. And
  the task lists still asserted the premises the verdicts had overturned, 450 lines away, with no pointer.
  **A correction written only in the place that discovers it is not a correction; it is a second opinion.**

  | pass | found | severity |
  |---|---|---|
  | 1 | 4b.1 (wrong vocabulary as fact) · 4c.0 (re-asks a closed question) · 4c.2 (instructs the drift signal) · line 65 · `slash_command_bytes:251`→`:266` · `check.sh` cited as re-runnable but not retained | 3 BLOCKING |
  | 2 | **the known-mode guard does not exist and no task builds it** · the resting-label decision had no owning task · `vision.md:51` + `roadmap.md:318` + `CLAUDE.md:17` | 3 BLOCKING |
  | 3 | `color_tty_env()` — 4b.2 still said the env addition is "free" | 1 BLOCKING + 1 COSMETIC |

  ⚠️ **The single worst one was pass 2's:** both 4b.1 *and* Verdict (e) reason from *"the hook's known-mode
  guard rejects the unrecognized value"* — and **that guard existed only in my prose.** Zero hits for
  `stepping` in the deployed hook; 4b.3 said merely *"present and non-empty"*, which admits any string.
  The safety net both documents leaned on was **fictional**, and no task created it. 4b.3 now owns it, and
  4b.4 now mutation-proves **three** inert arms (absent · empty · unrecognized) rather than one.

  ⚠️ **Pass 3's had the nastiest failure mode:** 4b.2 called the env addition "free" (inherited from
  Finding F). A builder hits a type error on the fixed-size `[_; 4]` and the obvious fix — widening
  `color_tty_env()` — **leaks `CLAUDESK_DRIVE_MODE` into the raw login shell**. Now retracted at all three
  sites (Finding F, 4a.3, 4b.2) with the trap named by its consequence.

  **✅ PASS 4 — CLEAN. 5/5 PASS, 0 BLOCKING.** The one-directional shape **does not recur**, verified by a
  method worth reusing: the subagent **enumerated all 30 retraction/supersession markers in the file and
  traced each to the task that BUILDS it**, rather than re-reading tasks and hoping to notice. Every
  corrected verdict is now mirrored in its building task. It also swept all **14** cost-framing claims by
  reading (not grepping — two of my greps had already missed a hit on whitespace) and classified each: 3
  concern env plumbing and all 3 are now corrections; the other 11 are unrelated and true in context.

  **3 residuals, all COSMETIC, all fixed rather than deferred:**
  - `CLAUDE.md:243` still carried the retracted *"adding one is free"* claim, and 4d.2b's sweep was scoped
    to **vocabulary only** — so nothing owned it. ⚠️ **This is the same pattern the sweep exists to close**,
    which is why it was worth fixing now: 4d.2b now covers **two** distinct retracted facts and states the
    generalizable rule.
  - WP4a's header had no completion marker (WP1–WP3 all carry `✅ SHIPPED <date> (commit …)`). Marked
    `✅ VERDICTS RECORDED` — ⚠️ deliberately **not** "SHIPPED", since there is no commit yet; `feature-ship`
    writes that.
  - Two conditionals on a probe that has returned: WP4c's *"sized after WP4a's mockup verdict"* → now
    **S** with the reason, and task 5.8's *"If WP4a chose the shared script"* → now *"WP4a DID choose it."*

  **Fixes applied in place** (shortcut gates held; see the `[SHORTCUT-…]` entry): 9 corrections across
  4b.1, 4b.2, 4b.3, 4b.4, 4b.6, 4c.0, 4c.1b (new), 4c.2, 4d.1, 4d.2, 4d.2b (new), Finding F, 4a.3, line 65,
  and the `:251`→`:266` line number (which was stale in **three** pre-existing places — I propagated it
  into a fourth by copying without checking).

  **verify-auto results (Phase 4, 2026-08-06):** 6 scoped checks, all pass. (1) All four verdicts (c)–(f)
  + the incidental-facts block present, each with its required content. (2) Long-context durability
  labelled **ASSUMED** in 3 places incl. Verdict (d)'s *"Do not upgrade either to 'proven.'"* (3) The
  shared-vs-separate choice carries the explicit disclaimer *"ARGUED from code, then its safety was
  MEASURED. Do not read it as 'measured'"* — and the only other "measured" inside Verdict (c) is the
  blast radius, which genuinely was. (4) Markdown structure intact: balanced ``` fences, 3/3
  `<details>`, **0** ragged tables. (5) Scope: **0 unexpected paths** — everything is `workflow-system/`,
  `docs/reference/`, or one of the three test files already reviewed at their own gates. (6)
  `pnpm format:check` clean, and `wbs.md` remains Prettier-ignored as intended.

  ⚠️ **Two of my own greps returned a false 0** (unquoted alternation passed to `grep -c` without `-E`,
  and a case mismatch on "emit NOTHING"). Both were re-checked against the file's actual text before being
  called a pass — the content was present in each case. Same instrument-discipline failure as Phases 1–3;
  it is now four phases running.

## Evidence artifacts (Phase 1)

Session scratchpad — `…/282c9121-…/scratchpad/wp4a/`:
- **`check.sh`** — the 20-check re-runnable evidence script (A/B/C signal arms, D blast radius,
  E telemetry byte-equivalence, production-tree-clean). Exit 0 = all pass.
- **`fixture2-hook.pl`** — the fixture, **derived by patching the real script** (a Python patch that
  moves the stdin drain up and inserts the signal block), *not* transcribed by hand. This matters: the
  first hand-written fixture silently dropped two telemetry field groups.
- **`listen.pl`** (written by `check.sh`) — a minimal AF_UNIX listener used to capture the telemetry line.

⚠️ **Deliberately NOT copied into `tooling/`.** A throwaway probe fixture should not become a tracked
artifact next to the real demo pipeline; the plan's scope guard says nothing lands outside
`workflow-system/`. `SURFACE-2026-08-06-HOOK-SCRIPT-EDITS-SILENTLY-CHANGE-THE-TELEMETRY-PAYLOAD` points
WP4b at §E as the prototype for a **tracked** guard, which is where that code belongs.

⚠️ **Instrument failures worth knowing (three in this phase, each produced a wrong reading first):**
1. A listener using `alarm` + an accept-loop received nothing from **either** script — a check where
   broken and working give the same answer, i.e. not decisive. Rewritten to a single blocking `accept`.
2. `./fixture2-hook.pl` without `+x` gave **8 false passes** (zero bytes because it never ran). Always
   invoke `perl <script>` explicitly.
3. `env $ENVP` with `ENVP="A=1 B=2"` collapses both pairs into **one value** in zsh
   (`CLAUDESK_DRIVE_MODE` became `autopilot CLAUDESK_HOOK_SOCK=…`), producing a false **FAIL** on the
   dead-socket arm. Use explicit inline assignments.

## Current Node
- **Path:** Feature > ALL PHASES COMPLETE → `/feature-ship`
- **Active scope:** **Phases 1–3 COMPLETE `[x]`; Phase 4 impl + verify-auto + verify-self + verify-human
  all complete** (4 verification passes; 7 BLOCKING sufficiency failures found and fixed; pass 4 clean;
  operator APPROVED the record as sufficient). **WP4b re-sized M → L** at the operator's prompting.
  All seven verdicts
  are recorded in `wbs.md` → "Probe outcomes" as (c)–(f) plus an incidental-code-facts block, and all six
  WP4a tasks are `[x]` there. Remaining: Phase 4's own verify chain.
- **Blocked:** none
- **Unvisited:** none — Phase 4 is the last phase.
- **Open discoveries:** 3
  1. `SURFACE-2026-08-06-DRIVEMODE-SERDE-VOCABULARY-WRONG-ON-2-OF-4-VARIANTS` (**medium**) — ⚠️ **a WP4b
     blocker**: invalidates task 4b.1's stated premise. Modes 1 and 4 serialize to values no skill
     recognizes, so the feature would silently do nothing for them.
  2. `SURFACE-2026-08-06-SESSION-RESTORE-CONTRADICTS-ITSELF-ON-THE-DEFAULT-DRIVE-MODE` (low) — external
     (companion repo). ⚠️ Do NOT fix from Claudesk; zero-companion-change is a hard M12 constraint.
  3. `SURFACE-2026-08-06-HOOK-SCRIPT-NEVER-BLOCK-CC-WAS-ONLY-ASSERTED-ON-THE-HAPPY-PATH` (low) — its two
     coverage gaps are **fixed** in this WP; the entry survives only until `feature-finalize` can
     CHANGELOG-then-delete it in one commit. Its original claim was wrong; corrected in place.

## Notes on phasing

**Why 4 phases and not 1.** The two verdicts are independent and gate different downstream WPs (hook
plumbing → WP4b; cell design → WP4c), and each carries its own verify-human question the operator must
answer. Phase 3 depends on Phase 1 only for sequencing, not for information — it could run in parallel,
but this milestone is explicitly **serial** and a half-day timebox does not benefit from parallelism.

**Timebox discipline.** WP4a is sized **S / half-day**. Phases 1–2 are argument + a throwaway fixture;
Phase 3 is a mockup; Phase 4 is writing prose into `wbs.md`. If Phase 1 starts to look like it needs
production hook infrastructure to answer, that is the WBS's named escalation signal — stop and escalate
to `/feature-spec` rather than growing the probe (it touches a hook registered on 10 events × 2
identities).

**Verify-self reachability.** Phases 1, 2 and 4 are CLI-observable and fully agent-drivable (a fixture
script + `grep`/`git status`). Phase 3's mockup is a rendered artifact the **operator** judges — the
choice is definitionally theirs, so verify-human is the real gate there, not a shortfall in agent
verification.

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->

[SHORTCUT-2026-08-06] P4.1/P4.2 — Three verify-self passes found BLOCKING sufficiency failures in
`wbs.md` (the WP4b/WP4c/WP4d task lists still carried premises Verdicts (c)–(f) had overturned). All fixed
**in place** rather than via F9b: 9 corrections across 4b.1–4b.6, 4c.0/4c.1b/4c.2, 4d.1/4d.2/4d.2b,
Finding F, 4a.3, line 65, and a stale `slash_command_bytes` line number. **Gates:** (a) trivial — prose
cross-references inserted into text written moments earlier in this same phase, no code touched
(`git status --short src/` empty of new changes); (b) re-verified by **freshly-spawned**
`feature-verify-self-runner` subagents, which found a further gap on each of passes 2 and 3 — the fourth
pass is the confirmation; (c) this entry. ⚠️ Two of the fixes were themselves incomplete on first attempt
(a whitespace-mismatched pattern missed Finding F's copy of the retracted claim), which is why each pass
re-swept rather than trusting the prior one.

[SHORTCUT-2026-08-06] P3.1 — Two BLOCKING verify-self defects in
`docs/reference/m12-wp4a-drive-mode-cell-options.html` were fixed **in place** rather than via the F9b
back-loop: (1) added the missing `<meta charset="utf-8">` (the page rendered as windows-1252, mojibaking
the ⊘ and × the mockup compares); (2) made `.frame` `max-width:100%` with the true 592px moved onto `.row`,
added `.row-wrap` so the reference line tracks the row not the shrinking frame, and wrapped the comparison
table in `.table-scroll` (the body panned 11–16px below a 616px viewport). **Gates:** (a) trivial —
one meta tag + three CSS rules, all inside the file P3.1 just wrote, no other file touched; (b) re-verified
by a **freshly-spawned** `feature-verify-self-runner`, which found the first fix INCOMPLETE (the table was a
second, previously-masked overflow source) — then by an orchestrator-run 7-viewport sweep
(1200/700/616/600/480/380/320) confirming `scrollWidth == clientWidth` and `pan === 0` at every width, the
row still exactly 592px, refline drift constant at 1.41px; (c) this entry. Artifact republished so the
shared copy matches the fixed file.

[SURFACED-2026-08-06] Phase 2 → **WP4b task 4b.1 (blocker)** — `DriveMode`'s serde vocabulary is wrong on
**2 of 4** variants: `step-by-step` should be `stepping`, `full-autopilot` should be `fsd`. This
**invalidates the WBS's premise** that the field "just needs activating" with "the right kebab-case
vocabulary." Authority: `transitions.md:165`, `session-handoff/SKILL.md:75`, and 29 real archive files.
Modes 1 and 4 would **silently emit nothing**. ⚠️ My own Phase 1 fixture shared the bug (a third, different
wrong vocabulary), which is why Phase 1's "4 modes round-trip" PASS missed it — **a round-trip test proves
symmetry, not correctness.** Logged as
`SURFACE-2026-08-06-DRIVEMODE-SERDE-VOCABULARY-WRONG-ON-2-OF-4-VARIANTS` (medium).

[SURFACED-2026-08-06] Phase 2 → **external / companion repo** — `session-restore/SKILL.md` states two
different defaults **within one file**: step 4 says `orchestrated` (`:42`), its own menu labels
`3 Autopilot` as "(default)" (`:59`). Strengthened P2.2's verdict (no coherent upstream default exists to
copy, so absence must emit nothing) rather than blocking it. ⚠️ **Not Claudesk's to fix** — zero
companion-repo change is a hard M12 constraint; mention in the next handoff. Logged as
`SURFACE-2026-08-06-SESSION-RESTORE-CONTRADICTS-ITSELF-ON-THE-DEFAULT-DRIVE-MODE` (low).

[SURFACED-2026-08-06] Phase 1 → **RESOLVED at this WP's verify-codify** — ⚠️ **The original wording of this
discovery was WRONG.** It claimed "nothing verifies the payload `claudesk-hook.pl` emits." In fact
`src-tauri/tests/hook_pl_output.rs` has driven the **real** script as a subprocess since **M9 WP2**,
asserting the emitted payload across 6 tests — including **both** fields my hand-transcription dropped
(`prompt`, and the `tool_name`/`tool_use_id` pair) plus a privacy invariant. **I filed the item from my own
fixture failures without checking whether a test already existed; the check was one `grep`.** The lesson is
narrower and more useful than the one I first wrote down: *a transcription failure tells you about the
transcription, not about the coverage of the thing transcribed.*

What the coverage audit **did** find were three real, narrower gaps, all now closed — see the
verify-codify block above. The load-bearing one: **never-block-CC was asserted on the happy path only**,
because line 80's exit-0 assertion sits inside a helper that requires a successful socket connection.
Tracked as `SURFACE-2026-08-06-HOOK-SCRIPT-NEVER-BLOCK-CC-WAS-ONLY-ASSERTED-ON-THE-HAPPY-PATH` (low),
which `feature-finalize` should CHANGELOG + delete.
</content>
</invoke>

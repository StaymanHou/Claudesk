# Hand-off to mccc — M15 WP2: delete `check-structure.sh` Phase 9

**From:** Claudesk, M15 WP2 (the state machine as executable code)
**Date:** 2026-09-12
**Status:** ⚠️ **Not applied.** This note is written *in the Claudesk repo* and the edit is left to a session running *in the mccc repo*. See "Why this is a note, not a commit" below.

---

## The ask, in one line

**Delete Phase 9 from `tests/check-structure.sh`.** It polices a four-way duplication that no longer needs to exist — and, measurably, is not doing so.

---

## Why Phase 9 can go

Phase 9 (`[Phase 9] Orchestrator pause-policy cheat-sheet presence`, plus the Phase 9b drift check) exists to keep the pause-policy cheat-sheet in sync across the four `agents/<workflow>-workflow/AGENTS.md` files and the per-skill SKILL.md blocks.

Claudesk has now **absorbed the graph and the policy matrix as typed code** (`src/state/workflowMachine/`), per the ownership boundary settled 2026-08-14: *Claudesk owns the drive mode's VALUE and TURN-BOUNDARY enforcement; mccc owns its MEANING and INTRA-TURN semantics.* The duplication Phase 9 polices is therefore no longer load-bearing for enforcement — the enforcement reads the typed model, not the markdown.

This is the "genuine simplification, not a transfer" the WBS anticipated (task 2.9).

---

## ⚠️ The measured finding that turns this from tidiness into correctness

**The four copies are already out of sync with `transitions.md`, and Phase 9 did not catch it.** Measured 2026-09-12 against the live source:

| | `transitions.md` (the authority) | `agents/feature-workflow/AGENTS.md` |
|---|---|---|
| `F10` target | `verify-auto → ` **`verify-self`** | `verify-auto → ` **`verify-human`** |
| `F9b`, `F10b`, `F30` | present | **absent entirely** |
| state table | includes `verify-self` | **12 rows, `verify-self` absent** — though it appears 7× in the file's prose |

`AGENTS.md` predates `verify-self` being a state. Phase 9 keeps the four copies consistent **with each other**, which is not the same as keeping them consistent with the authority — and the authority is what drifted away from them.

**Claudesk transcribed exclusively from `transitions.md`** for exactly this reason. Had it merged the copies, a wrong `F10` target would have gone straight into the lookup that the WP3 detector's verdict *is* — a wrong edge target is a wrong policy row is a wrong fire.

---

## ⚠️ ONE genuine gap in `transitions.md` — a question for you, not a fix for us

Resolving all 111 edges against all 58 policy rows found **one transition that is dispatchable and has no governing pause-policy row**:

| Edge | From → To | Why there's no row | Dispatchable? |
|---|---|---|---|
| **`I2`** | `report → triage` | The incident table's `triage (I2→I3 / I2→I13)` row governs the exits **from** triage, not the entry **into** it | ⚠️ **YES** |

⚠️ **An earlier draft of this note also listed `P13` (product-finalize → EXIT). That was over-broad and is retracted** — `P13` is *terminal*, so no pause-policy row is owed and its absence is correct, not a gap. (Caught at code-quality review, when the gap classifier was corrected to key on an edge's target rather than its workflow.) Worth one line of your attention only as a documentation note: the product table does have a row for **P14** (the back-loop) but none for **P13**, which is fine.

**`I2` matters because it is dispatchable** — a supervisor that defaulted "no row found" to AUTO would fire `/incident-triage` with no policy sanctioning it. Claudesk does not do that — `resolvePolicy` returns an explicit `{outcome: "unmapped", reason: "no-row-upstream"}` whose union arm structurally has **no `cell` field**, so it cannot be mistaken for a verdict — and a standing test pins this id so a second gap appearing upstream fails loudly.

**The open question is yours:** should `I2` PAUSE like every other incident row, or AUTO?

(Also recorded in Claudesk's backlog as `SURFACE-2026-09-12-ONE-TRANSITION-HAS-NO-PAUSE-POLICY-ROW-UPSTREAM`.)

---

## What Claudesk took, and what it deliberately left

**Phase 3d (the `TRANSITION:` regex contract) — PORTED, and mccc keeps its copy.** Claudesk now owns a vitest equivalent (`src/state/__tests__/workflowMachineUpstreamContract.test.ts`). mccc should keep Phase 3d: skills still emit the token, and `verify.sh` still consumes it. This is a second copy by design, not drift — the two are compared when Claudesk can see `_ref/`.

**Phase 18 — only (a) and (c) ported.** Its eight sub-checks split cleanly:

| Sub-check | Disposition |
|---|---|
| (a) S22/S23 edges exist | ✅ ported — Claudesk owns the graph |
| (c) exit-chain pause-policy rows | ✅ ported — Claudesk owns the policy |
| (b) reflect's row names the fork | ✗ stays — mccc prose |
| **(d) all 4 `AGENTS.md` carry the block** | ⚠️ ✗ **this IS the duplication being deleted** |
| **(e) all 4 `AGENTS.md` re-point prose** | ⚠️ ✗ **same duplication** |
| (f) `session-capture`'s gate prose | ✗ stays — **INTRA-TURN semantics, mccc's half of the boundary** |
| (g) `CLAUDE.snippet.md` re-point | ✗ stays — mccc prose |
| (h) `tutorial-*-tour` boundary guard | ✗ stays — mccc skill prose |

⚠️ **(f) is the one worth calling out.** `session-capture`'s drive-mode-conditional confirmation gate is *behavior within a state*. Porting it would have crossed the ownership boundary. Claudesk models the **policy cell** for that row (autopilot/FSD `[PROJECT]` auto-writes, `[GLOBAL]` still confirms) because that is a turn-boundary chaining decision; the gate's *implementation* stays yours.

⚠️ **The two `behavior-within-state` rows were likewise left upstream** — `transitions.md:453` (reflect's candidate filter) and `:454` (session-capture's gate). Claudesk asserts their **absence** from its absorbed graph so a future transcription pass cannot quietly import them.

---

## Why this is a note, not a commit

⚠️ **Every entry under `~/.claude/skills/` is a symlink into the mccc source repo.** Editing an installed skill — or any mccc file — from a Claudesk session writes into a *different git repository*, silently. Nothing in the Claudesk session reports it; it surfaces later as unexplained dirt in another project.

So: the edit is yours to make, from a session rooted in mccc. Claudesk's `git status` for the mccc repo was checked before and after this work and stayed clean.

(Recorded in Claudesk's backlog as `SURFACE-2026-09-11-EVERY-INSTALLED-SKILL-IS-A-SYMLINK-INTO-THE-MCCC-SOURCE-REPO`, priority `high`.)

---

## Suggested order

1. **Answer the `I2` question** (PAUSE or AUTO) and add the row to `transitions.md`.
2. **Delete Phase 9** (and Phase 9b) from `tests/check-structure.sh`.
3. **Keep Phase 3d.** Keep Phase 18's (b), (f), (g), (h); drop (d) and (e) along with Phase 9, since they pin the same duplication.
4. Consider whether the four `AGENTS.md` cheat-sheet tables still earn their place once nothing checks them. They remain useful as the **no-Claudesk floor** (bare-terminal sessions), which was the explicit reason full absorption of mccc was rejected — but they are now prose-for-humans, not a machine contract.

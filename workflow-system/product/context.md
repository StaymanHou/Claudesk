---
stage: context
state: complete
updated: 2026-09-15
---

# Context

Project CLAUDE.md generated at `CLAUDE.md` (project root).

**Active milestone:** **Milestone 14 — the REMAINDER** (decomposed 2026-09-15 into 5 WPs at `workflow-system/product/wbs.md`). ⚠️ **M14 is SPLIT — do NOT decompose it as a whole**: its release half (MIT LICENSE + README correctness pass + release note) shipped as a single task in `v0.4.0`, deliberately skipping `/product-wbs`, and **2 of its 4 roadmap deliverables are already `[x]`.** What remains: signing + notarization, hotkey configuration, the two-tier setup docs, and repo metadata.

**First work package:** **WP1 — Probe: Apple Developer enrollment, cert issuance, and the notarization toolchain.** ⚠️ **It is a hard gate on WP2**, and its first two tasks are **operator-only** (enrollment + cert generation; an agent cannot perform them). ⚠️ **The gate is CALENDAR-bound, not effort-bound** — Apple's approval is **24h published but reportedly 2–7+ weeks in 2026** (researched at the WP1 pass), and no amount of agent work shortens it. Size S in agent effort.

**Entry point:** WP1 is a probe, not a feature. ⚠️ **Start task 1.1 (enrollment) FIRST regardless of what is built next** — it is the long pole. **WP3 (hotkeys) and WP5 (repo metadata) are independent parallel tracks** with no dependency on the signing chain, and are the right work to run while approval is pending.

## What this pass changed

- **`CLAUDE.md` → `## Current Milestone`** rewritten from "M15 closed, M14's remainder is next" to the **as-decomposed** reality, carrying the **two operator rulings** taken at decomposition (below) with their consequences and risks. The M15 close status is retained beneath them, demoted from lead to context.
- **`CLAUDE.md` → `## Milestone 15`** retitled from *"the active cycle"* to **CLOSED**, with a banner marking it **reference, not active work** — its constraints still bind anyone touching the supervisor, but the live half was never observed.
- **`CLAUDE.md` → execution-order line** now points at the decomposition and names the critical path plus the two parallel tracks, so a future session does not re-derive the ordering.
- **`roadmap.md` → the two open M14 deliverable lines** annotated in place with R-1 and R-2.

## The two rulings (do not re-litigate)

- **R-1 — signing REVERSES the recorded M10 decision.** `arch/build-update-release.md` records *"Unsigned + minisign, not notarized — $99 NOT purchased, a deliberate accepted cost"* and had reconciled M14's deliverable down to *"inherit and document that decision"* — while explicitly naming M14 as the home of *"a future notarize-yes reversal (and its removal of the self-quarantine-clear step)."* **That reversal is now taken**, which flips the deliverable from documentation to **implementation**. ⚠️ **minisign STAYS; notarization is ADDITIVE** — the trust anchor `774E2E8429FDF78A` must not change or existing installs are stranded (task 2.7 is that migration check). **Payoff:** deletes the self-quarantine-clear mechanism (Rust + frontend + 2 test files) and **six README `xattr` sites**. ⚠️ **Highest technical risk: hardened runtime is mandatory for notarization and may break subprocess spawning (`claude`, `subl`, PTY)** — probed at task 1.6; **a break there is a NO-GO that returns to planning**, not something WP2 works around. It would be invisible in `pnpm tauri:dev`.
- **R-2 — Settings NARROWED to hotkey configuration only.** **Project-list management is DROPPED from M14** — dropped, *not* deferred; if wanted later it re-enters as new work, not as an unticked M14 leftover. ⚠️ **EXTEND the `⌘,` panel M10.9 WP2 built.** ⚠️ **11 `*Chord.ts` predicate modules already exist** sharing a `chordEvent.ts` type — WP3 **centralizes what exists**; it does not write keyboard handling from scratch, which is why it sized M rather than L.

## Design priors consulted

- **[PRIOR: `explicit-selectable-mode-over-inferred-mode`] fired on WP3, rule 3, leaning LOW-SURFACE** — its risk-surface-vs-value clause (*prove the value at the low-surface version first*). A hotkey editor's value here is **operator-unproven** (the operator's own bindings already work; this is friend-facing), so WP3 ships a legible list + per-binding reset + cheap rebinding, and **explicitly excludes** record-any-chord capture, per-workspace scopes, and conflict-resolution UI. **Disclosed in `wbs.md` as overridable — flag if wrong.**
- **[PRIOR: `gate-substrate-dependent-feature-class-behind-default-off-opt-in`] fired on WP4, rule 2 (agrees)** — the two-tier doc structure *is* this prior's shape. The docs must document the gate as a **first-class concept** (OFF is byte-identical; enabling the UI is strictly separate from installing the substrate), not bury the workflow features as undocumented extras.
- **Over-infer guard applied:** neither prior governs signing (a release-infrastructure/cost tradeoff → `arch.md` territory per the capture contract's exclusions) nor repo metadata.

## Booked corrections (carried into the WPs, not yet made)

- ✅ **RESOLVED 2026-09-18 (M14 WP2 Phase 3):** `arch/build-update-release.md`'s "Unsigned + minisign, not notarized" bullet and its "M14 overlap — reconciled" bullet have been rewritten — both are now struck-and-superseded with the reversal recorded, alongside 4 further sites the original scope list did not name. ~~still state the SUPERSEDED decision~~ — rewritten at **task 2.6**. ⚠️ **`doc-correction-scope-list-is-a-floor`: grep the retracted claim repo-wide first**; the two named sites are a floor, not the scope.
- ⚠️ **M14's "default CLI args for `claude`" line is stale** — M11.5 consumed most of it and it still misstates **PiP (shipped M5)** and **permission-mode (shipped M6)** as future work; the per-project `--model` override shipped **M11.5 on the picker row, not in Settings**. Corrected at **task 4.2**.

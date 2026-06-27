---
stage: design-priors
state: active
updated: 2026-06-27
---

# Design Priors — Claudesk

Terse, transferable statements of how the operator resolves recurring **product-design** tradeoffs, each paired with its *why*. Directional and overridable, never decisive. See `~/.claude/CLAUDE.md` → "Design priors (GLOBAL)" for the consult/capture contract and `arch.md` → "File Schema: Design Priors Format" for the schema.

---

## operator-helpful-friend-misfiring-as-offswitchable-setting

**Axis:** opinionated-defaults-vs-config (anti-persona-aware)

**Lean:** When a behavior clearly helps the operator's own setup but would misfire on a friend-user's divergent setup, ship it as an **off-switchable setting defaulting to the operator's benefit** — not as a hard behavior change, and not omitted for safety.

**Why:** Claudesk is built for the operator's exact workflow (single-monitor, the scenario-3/4 "leave Claudesk to monitor CC elsewhere" pattern) but is open-sourced to friends whose setups diverge (e.g. multi-monitor, where a blur-triggered auto-summon misfires because macOS gives no "visible on the other display" signal). A setting that defaults ON for the operator resolves the tension without a vision reversal and without handing the primary user a worse default. The operator gets the helpful behavior out of the box; the divergent friend turns it off.

**Origin:** M5 WP5 spec (2026-06-27) — PiP auto-summon/dismiss adopted as an opt-in setting (default ON) rather than hard behavior, specifically because multi-monitor friend-users would hit the blur-misfire the operator never will.

---

## explicit-selectable-mode-over-inferred-mode

**Axis:** opinionated-defaults-vs-config (legibility of state)

**Lean:** When a feature has a mode that is currently *inferred* from how the user arrived at a state — and that inference can produce an unreachable, confusing, or dead-end state — prefer making the mode an **explicit, directly-selectable control** (e.g. a tri-state Off/On/Auto) over patching the inference rules to cover the edge cases.

**Why:** Surfacing state beats inferring it. In the M5 WP5 PiP case, the panel's regime (manual-pinned vs system-driven) was inferred from a hidden `origin` flag (Manual vs Auto, set by *how* the panel was shown) plus a `manual_off` suppression flag — which combined into a dead-end where, once the user touched the toggle, there was no gesture to return to the auto-summon+auto-dismiss regime without relaunching. An explicit Off/On/Auto control the user sets directly is legible (you can see + pick the regime), has no unreachable states, and removes the side-effect bookkeeping. Consistent with the project's standing "make the state visible, not inferred" leanings (the drive-mode selector in the workspace header; the status dot reads the hook channel, never PTY-scraped inference — vision Core Principle 2).

**Origin:** M5 WP5 verify-human (2026-06-27) — the operator rejected three boolean-patching fixes for the manual-off-can't-return-to-auto dead-end in favor of "give that toggle 3 states: off, on, auto." Related: [[operator-helpful-friend-misfiring-as-offswitchable-setting]] (the same feature; that prior is about the *default*, this one about *surfacing the mode explicitly*).

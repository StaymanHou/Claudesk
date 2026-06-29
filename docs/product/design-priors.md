---
stage: design-priors
state: active
updated: 2026-06-29
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

**Lean:** Prefer a **legible, directly-selectable control** over state that the user can't see and set. Two faces of the same lean:
- **Inferred → explicit.** When a mode is *inferred* from how the user arrived at a state — and that inference can produce an unreachable, confusing, or dead-end state — make it an explicit control (e.g. a tri-state Off/On/Auto) rather than patching the inference rules to cover the edge cases.
- **Continuous → discrete.** When a control's real use is **switching between a small set of intents** (not fine-tuning), prefer a few **directly-selectable presets / collapse states** over a continuous free-drag/slider — even at the cost of fine precision. A continuous control makes the user *operate a mechanism* (aim, drag, judge) on every switch and stores opaque "where did I leave it" state; discrete presets model the intent and stay predictable. (Add the continuous escape hatch later only if a real precision need surfaces — reversible follow-up.)

**Decision rule (the load-bearing one):** the choice is a **risk-surface-vs-value** calculus, not just a taste/legibility call. When a feature's value is *unclear or low* — e.g. a friend-request the operator doesn't personally need — prefer the **lower-UI/UX-bug-surface implementation** and don't take on the broader failure surface the "richer" version drags in. The richer continuous/inferred version isn't merely less legible; it has *more ways to break* (in WP3: 0-width reflow, nested-drag-handle mis-grabs, drag-timing-vs-fit races) — and that bug surface isn't worth paying down for an uncertain payoff. Prove the value at the low-surface version first; escalate to the richer one only when demand is real.

**Why:** Surfacing state beats inferring it, naming a few intents beats exposing an infinite range — and capping the bug surface beats chasing precision nobody asked for. In the M5 WP5 PiP case, the panel's regime (manual-pinned vs system-driven) was inferred from a hidden `origin` flag (Manual vs Auto, set by *how* the panel was shown) plus a `manual_off` suppression flag — which combined into a dead-end where, once the user touched the toggle, there was no gesture to return to the auto-summon+auto-dismiss regime without relaunching. An explicit Off/On/Auto control the user sets directly is legible (you can see + pick the regime), has no unreachable states, and removes the side-effect bookkeeping. In the M6 WP3 case, the friend's real need was attention-switching between "CC focus / editor focus / balanced" — a free-drag divider would force him to operate a handle and remember a pixel, *and* add a second nested drag handle next to the file-tree rail, *and* open up a wider reflow/timing bug surface (0-width fit, drag-vs-fit races) — all for a feature the operator doesn't personally need and whose value was unproven. Collapse toggles + a few ratio presets model the three intents directly, were less code than the drag clone, and cap the bug surface until the value justifies more. Consistent with the project's standing "make the state visible, not inferred" leanings (the drive-mode selector in the workspace header; the status dot reads the hook channel, never PTY-scraped inference — vision Core Principle 2).

**Origin:** M5 WP5 verify-human (2026-06-27) — the operator rejected three boolean-patching fixes for the manual-off-can't-return-to-auto dead-end in favor of "give that toggle 3 states: off, on, auto." Broadened M6 WP3 spec (2026-06-27) — the operator reframed a planned free-drag split divider into discrete collapse-toggles + 3 ratio presets, specifically for predictability and to avoid nested drag handles. Related: [[operator-helpful-friend-misfiring-as-offswitchable-setting]] (the same M5 feature; that prior is about the *default*, this one about *surfacing the mode explicitly*).

---

## new-surface-must-earn-its-place-against-existing-ones

**Axis:** focus-vs-breadth (anti-redundancy / "lite over featureful")

**Lean:** Before building a NEW surface (panel, window, indicator, view) that overlaps an already-shipped one, force it to justify itself on what it can do that the existing surface **cannot** — and scope the new surface down to *exactly that irreducible non-overlap*, cutting everything the existing surface already covers. A new surface that delivers a strict *subset* of an existing one is redundancy, not a feature, no matter what the roadmap says. If the unique core is "capability," build that capability; if it's only *location / ambient presence / zero-allocation*, build the **minimal** thing that exploits the location and nothing more.

**Decision rule:** (1) List what the new surface would do. (2) For each item, ask "can the existing surface already do this (or be made to, cheaply)?" (3) Keep ONLY the items that are genuine non-overlap; if the *only* survivor is "it's in a place the user already looks," that's a real-but-narrow virtue → ship a minimal ambient/actuator version, not a second dashboard. (4) If nothing survives, cut or defer the surface — the roadmap is editable; a subset-surface is the opposite of "lite." Cost reminder: two overlapping surfaces must *always agree* — that's ongoing sync code + a second place every bug shows, paid forever.

**Why:** Claudesk's thesis is *attention is the scarce resource* and *lite over featureful* (vision Core Principle 1). Two surfaces showing the same thing split the glance and double the maintenance for no new information. The menu-bar item (M7) was planned as a third status surface (dot + popover list + navigate-on-click) — but PiP (M5) shipped unconditionally and, in `On`+`minimal`, already delivers a near-zero-pixel, all-Spaces, over-fullscreen, always-on aggregate-status surface. Capability-by-capability the menu bar was a strict *subset* of PiP. Its ONE irreducible edge was **location**: the menu bar is a strip the user already passively watches all day, present even at zero workspaces, requiring no summon and no allocated screen region. So M7 was shrunk to exploit *only* that: a single 2-state ambient **alarm** ("is any project AwaitingInput?") + a right-click **actuator** menu (Show/Toggle-PiP/Quit — acts on the app, which display-only PiP can't) — and the popover/list/navigate half (the part that re-implemented PiP) was cut wholesale, deleting the `tauri-plugin-positioner` dep, the popover webview, and its blur-probe risk. An alarm + an actuator do not overlap a display dashboard; a second dashboard would have.

**Origin:** M7 spec debate (2026-06-29) — the operator pushed back that the planned menu-bar status item looked redundant after PiP shipped, rebutting each claimed virtue (always-on, zero-pixel, system-wide reach) as already met by PiP's `On`/`minimal`/all-Spaces behavior, and noting "the roadmap can always be changed." Agreed; M7 was shrunk to center solely on the one surviving virtue — *"the menu bar is a surface you're already looking at, passively, all day"* — yielding an ambient 2-state alarm + actuator menu, with the PiP-duplicating popover/list/navigation cut. Related: [[explicit-selectable-mode-over-inferred-mode]] (its risk-surface-vs-value rule — prefer the lower-surface version when value is uncertain — points the same direction: cut the high-surface popover half).

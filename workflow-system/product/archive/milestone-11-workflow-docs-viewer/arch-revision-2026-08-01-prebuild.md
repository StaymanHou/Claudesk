---
shape: archived-arch-section
archived: 2026-08-03
source: workflow-system/product/arch.md
---

# Revision 2026-08-01 — M11 architecture (the PRE-BUILD back-loop)

Superseded by `arch.md` -> "Milestone 11 architecture (AS-BUILT 2026-08-03)", which states it wins wherever the two differ. Archived 2026-08-03 (size guard).

**Nothing here was reversed** — both decisions shipped as sanctioned; the as-built section records them with more precision (render-time reconcile, evicts to `defaultPanel(gate)`).

⚠️ Four passages were kept in `arch.md` as a stub because they exist ONLY here: the 13/13 measured delegation evidence (cited BY NAME from the M10.9 gate section), the shape of the eventual registration-site fix, and the stale-comment actionable.

---


**Entered via P8** (wbs → arch back-loop) at the operator's direction, *"even if it may change nothing."* It did not change the milestone's shape — **no new component, dependency, webview, data store, or async layer beyond what M11's WBS already names** — but it changed two things that would otherwise have been discovered mid-build, and it corrected one overstatement this session put into the record. Recording a no-change verdict with its evidence is the point of the exercise; a back-loop that finds nothing is only wasted if nothing was *checked*.

**Milestone:** 11 (workflow-docs markdown viewer). **Scope discipline:** M12–M14 are explicitly out of scope; nothing below designs for them.

### Decision 1 — `AVAILABLE_PANELS` / `RightPanel` become **gate-derived**, and the enforcement point already exists

M11's Docs tab must not exist while `workflow_features_enabled` is OFF. Measured at M11's activation audit: adding `"docs"` to the **`RightPanel` union alone** already fails the OFF-invariant guard's chord arm, because M11.5 WP4 put `panelHost.ts` in that arm's scope. So the registry cannot stay statically `"docs"`-bearing.

**The blast radius is small and was measured, not estimated.** Outside `panelHost.ts` itself there is exactly **one** runtime consumer — `RightPanelHost.tsx` (`import { panelForChord, selectPanel, type RightPanel }`, and `useState<RightPanel>("editor")`). The other two hits are a comment and the seam module's own doc.

**The load-bearing find: `selectPanel` is already the enforcement point.** It has carried a graceful no-op since M2 WP5 —

```ts
if (!AVAILABLE_PANELS.includes(target)) return current;
```

— built for the "never flip to an unmounted (blank) slot" failure mode (`SURFACE-2026-06-20-QUALITY-WP5-TERMINAL-SEAM-UNTESTED`), and **all 10 `setPanel` call sites route through it** (7 direct-select, the `panelForChord` chord path, 3 tab clicks). A gate-derived `AVAILABLE_PANELS` therefore needs **no new enforcement machinery**: with the gate OFF, `"docs"` is absent from the array and every path into the panel — chord, tab, programmatic — becomes a no-op through code that already ships and is already tested. **This is why the gate-derived shape is the right call rather than a separate gated module:** it reuses a proven runtime guard instead of adding a parallel one.

**⚠️ The one hazard, named here so WP2 does not discover it live: `selectPanel` guards transitions INTO a panel, never a panel already front.** The gate is runtime-toggleable (`⌘,` Settings), so a user can have Docs front and then switch the gate off — leaving `panel === "docs"` with `"docs"` no longer in `AVAILABLE_PANELS` and no code path that corrects it. Nothing today resets `panel`. WP2 must add an explicit reconciliation (on gate-off, if the current panel is no longer available, fall back to `"editor"`), and it should be **behavior-tested**, not left to the type system — the union will still *permit* `"docs"` at runtime because the value is already in `useState`.

**Guard consequence, deliberate:** making the array dynamic means the guard's panel arm must assert the **OFF-state value of that computation** rather than the static array. The guard's own header already sanctions exactly this (*"If M11 makes AVAILABLE_PANELS dynamic, update this test to assert the OFF-state value of that computation rather than deleting the assertion"*). **Extending the guard is in scope; weakening it is not** — M11.5 WP4 pinned the chord arm's reach and its offender predicate as standing tests precisely so a narrowing dodge fails loudly.

### Decision 2 — the registration-site guard gap is **NOT** paid before M11, and its severity is corrected down

`SURFACE-2026-08-01-QUALITY-WP4-ARM-GUARDS-PREDICATES-NOT-REGISTRATION` observes that the OFF-invariant guard scans chord *predicate modules*, while chord *listeners* mount in `App.tsx` / `Workspace.tsx` / `RightPanelHost.tsx` / `PickerOverlay.tsx` / `EditorPanel.tsx` — none of which the arm selects. The mechanism claim is **correct**. The severity attached to it at WP4's review — and amplified by this session's own close notes into *"the next `panelHost.ts`"* — is **not**, and is corrected here.

**Measured across every non-test keydown registration site in `src/`:**

| Site | Predicate delegations | Inline chord matching |
|---|---|---|
| `App.tsx` | 4 (`workspaceSwitchIndex`, `isDashboardChord`, `newWorkspaceChord`, `isSettingsChord`) | 0 |
| `RightPanelHost.tsx` | 7 (incl. `panelForChord`, `tabSwitchIndex`) | 0 |
| `Workspace.tsx` | 1 (`terminalZoomForChord`) | 0 |
| `EditorPanel.tsx` | 1 (`isPaletteChord`) | 0 |
| `PickerOverlay.tsx` | 0 | 0 |
| **Total** | **13** | **0** |

The only two inline `e.key ===` comparisons in the whole set are **`"Escape"`** (dismissal, in `App.tsx` and `PickerOverlay.tsx`) — not chords. **The delegate-to-a-predicate-module convention holds 13/13 with zero exceptions.**

**Why that changes the verdict.** The `panelHost.ts` gap was a *live, existing, invisible* module — probe 5b proved a real violation passed 10/10 against real code. This gap is **conditional on a future author first breaking a 13/13 convention** by inlining chord matching at a registration site. Those are different risk classes, and the earlier framing ("the same shape", "the next `panelHost.ts`") flattened a real difference in likelihood. Two further mitigations compound it: the **panel arm is an independent second net** (a Docs *panel* cannot reach the user without appearing in `AVAILABLE_PANELS`, and Decision 1 makes that computation itself guarded), and a chord with no panel is a chord to nowhere.

**The decision:** M11 proceeds without paying it. WP2 keeps the Docs chord in a **predicate module**, where the arm already sees it — which the 13/13 convention makes the path of least resistance anyway. **The cheaper and more durable fix, when it is paid, is not a sixth arm** but a guard that pins *the convention itself*: assert no registration site performs inline chord matching. That protects the property which makes the current predicate-module arm sufficient, and is a much smaller change than scanning handler bodies for gated-ness. Recorded on the SURFACE entry.

**Stale comment to fix in WP2 (found here):** `App.tsx:855` explains the invite's non-gating by saying the guard checks *"`*chord*.ts` modules"* — true when written, **false since M11.5 WP4** made the arm content-based. The reasoning it records is still correct; only the mechanism description rotted.

### Key Decisions

- **`AVAILABLE_PANELS` / `RightPanel` become gate-derived for M11** — rather than a separate gated module — because `selectPanel`'s existing no-op guard is already the single enforcement point that all 10 `setPanel` paths route through. Reuse a proven runtime guard over adding a parallel one.
- **The guard's panel arm gets extended, not weakened**, to assert the OFF-state value of the now-dynamic computation. Sanctioned in advance by the guard's own header.
- **WP2 must reconcile a front panel that becomes unavailable at runtime** (gate toggled off while Docs is front) — `selectPanel` does not cover this, and nothing resets `panel` today. Behavior-tested, not type-asserted.
- **The registration-site guard gap is deferred and down-severitied** on measured evidence (13/13 predicate delegation, 0 inline chord matches); when paid, the right shape is a convention guard, not a sixth arm.
- **No P6 back-loop to `/product-research`** — no unknowns emerged. The markdown-renderer choice remains WP1's probe, which is where the WBS already puts it.

**Net effect on M11's shape: none.** The WBS's 5 WPs, dependency map, and sizing stand as activated. This revision adds two constraints inside WP2 (the runtime-reconciliation requirement, the guard-extension obligation) and removes one piece of pre-M11 work the session had been treating as near-mandatory.


import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { availablePanels } from "../../components/workspace/panelHost";
import { MENU_IDS } from "../../menu/menuBridge";
import { cellLines } from "../../cc/driveMode";
import { rowAffordances } from "../../components/picker/announceRow";
import type { AnnounceMap } from "../predictAction";

// ═══════════════════════════════════════════════════════════════════════════════
// M10.9 WP2 — THE OFF-INVARIANT GUARD (WP2's load-bearing deliverable).
//
// The invariant: with `workflow_features_enabled` OFF, Claudesk must be byte-identical
// in observable behavior to a build that never had the workflow features. No empty
// tabs, no greyed controls, no dead menu items, no live chords.
//
// ── WHY THIS TEST EXISTS NOW, BEFORE THERE IS ANYTHING TO GATE ────────────────
// M10.9 ships with ZERO gated surfaces. Every "is OFF clean?" check therefore passes
// trivially today — and would keep passing even if M11 wired its Docs tab straight
// into AVAILABLE_PANELS with no gate at all. The invariant's whole value is at
// M11/M12/M13 time, which is precisely when nobody will remember to write this test.
// A gate without an enforceable seam is a comment.
//
// So this guard is written against the SEAM, not against M11's specifics: it
// enumerates the registries through which this app can surface UI and asserts no
// workflow-coupled entry exists in any of them while OFF. It keeps working when M11
// lands — M11 must either stay out of these registries, or extend this test
// deliberately (see "WHEN M11 LANDS" below).
//
// ── WHAT IT CAN AND CANNOT PROVE ──────────────────────────────────────────────
// CAN:    the seam is the only door. No workflow panel / chord / menu id is
//         registered unconditionally, and no module bypasses the hook to read the
//         setting directly.
// CANNOT: byte-identity of a compiled build. This is a source- and registry-level
//         invariant, not a binary diff. A surface rendered through a channel this
//         test does not enumerate would slip past. The mitigation: the registries
//         below are the only ways this app surfaces UI today, and adding another one
//         should extend this guard as part of that work.
//
// ── THE FOUR REGISTRIES (the fourth added at M12 WP5) ─────────────────────────
//   1. PANEL      — `availablePanels(false)`, the right-panel tab set
//   2. MENU ID    — `MENU_IDS`, the native app menu
//   3. CHORD      — modules exporting a `*Chord*` identifier
//   4. ROW-CELL   — the picker row's per-project cells: `cellLines(…, false, …)` and
//                   `rowAffordances(…, false)`. Added at M12 WP5 because M12's surfaces
//                   (a picker cell + a spawn-time action) are none of the first three,
//                   and this header's own rule above required extending the guard as
//                   part of that work.
//
// ── WHEN M11 LANDS ────────────────────────────────────────────────────────────
// M11's Docs tab MUST NOT appear in the static AVAILABLE_PANELS array. It must be
// added conditionally behind `useWorkflowFeaturesEnabled()`. If M11 makes
// AVAILABLE_PANELS dynamic, update this test to assert the OFF-state value of that
// computation rather than deleting the assertion.
//
// WP5.2 proves this guard bites by temporarily bypassing it and confirming a failure.
//
// ── WHEN M12 LANDS (measured at WP4b, 2026-08-07) ─────────────────────────────
// M12 splits across two work packages with DIFFERENT relationships to this guard,
// and conflating them is the easy mistake:
//
//   WP4b (the drive-mode SIGNAL) is deliberately OUT OF SCOPE, and that is correct.
//   Its surfaces are a Rust spawn-time env var (`CLAUDESK_DRIVE_MODE`, composed in
//   `cc_session::cc_spawn_env`) and a Perl hook — this guard scans neither `.rs` nor
//   `.pl`, and WP4b adds ZERO frontend surface. Gate-OFF for that WP is enforced
//   Rust-side instead, by a fail-closed `resolve_gate_enabled` plus byte-empty-when-OFF
//   assertions. Do NOT "fix" this guard to reach into src-tauri/: it is a frontend
//   registry invariant, and widening it to a second language would make it a different,
//   weaker thing. MEASURED, not assumed: the allowlist is all `src/**`.
//
//   WP4c (the picker-row drive-mode CELL) IS in scope — it is a real frontend surface,
//   and WP5 owns adding the fourth arm for it. Note `WORKFLOW_TERMS` already contains
//   "drivemode"/"drive-mode", so a `driveMode` identifier in any *Chord*-exporting
//   module trips the chord arm TODAY, before that arm exists.
//
// The lesson generalizing both: this guard's scope is the FRONTEND registries. A
// backend-only feature being absent from it is not a hole — but that has to be written
// down, or the next reader re-derives it and reasonably concludes the guard is broken.
//
// ── ⚠️ M12 WP5 BUILT THE FOURTH ARM, AND THE GATE IS PER-ARM ──────────────────
// The obvious phrasing of a fourth arm — "nothing M12 surfaces while the gate is OFF" —
// is WRONG, and would go red on correct code. M12's auto-resume gate applies **per arm**
// (operator decision 2026-08-05, `announceRow.ts`'s `armAvailable`):
//
//   `{kind:"argv"}`   `--continue`        reads Claudesk's OWN store   → UNGATED
//   `{kind:"inject"}` `/session-restore`  reads `workflow-system/`     → GATED
//
// So the arm asserts BOTH directions: the gated arm collapses while OFF, and the ungated
// arm SURVIVES while OFF. An arm that only checked "collapses" would pass while being
// over-broad, and the first person to widen it would silently break a feature that
// serves every Claude Code user. This is why the arm below is two assertions, not one.
//
// Also deliberately NOT demanded by the arm: `predictAction.ts` and `autoResumeFire.ts`
// are not gate consumers, and must not become ones. The gate is applied one layer up at
// `rowAffordances`. Recorded so the arm is not "satisfied" by wiring a gate where none
// belongs.
//
// ── ARM SELECTION IS BY CONTENT, NOT FILENAME (M11.5 WP4) ─────────────────────
// The chord arm originally selected candidates by BASENAME and provably missed
// `components/workspace/panelHost.ts` — the module owning `panelForChord`. It now selects
// by exported identifier; see exportsChordIdentifier() for why that specific predicate and
// not the tempting `metaKey` one. Probe arms INDIVIDUALLY when checking this guard: a
// composite bypass that trips *some* arm reports "the guard bites" while hiding a gap,
// which is exactly how the basename hole was found.
//
// ── ⚠️ THE CHORD ARM IS PER-EXPORT, NOT PER-MODULE (paydown WP2, 2026-08-12) ───
// Selecting the right MODULE was only half the problem. Two successive whole-module
// exemption predicates were built here and BOTH passed the full suite 19/19 while blind to
// a real violation — the second one measured, not inferred:
//
//   1. `!/useWorkflowFeaturesEnabled/` exempted any module MENTIONING the seam. It excused
//      exactly one module — `panelHost.ts` — and for a reason unrelated to gating: that
//      module is pure, so it imports the symbol as a TYPE only, while its real gate is
//      `panelForChord`'s `enabled ? "docs" : null`. The arm was reading a type import as
//      proof of gating. (`SURFACE-2026-08-12-CHORD-ARM-GATE-EXEMPTION-IS-WHOLE-MODULE`.)
//   2. Requiring genuine gate-value evidence, but still module-wide, was ALSO holed:
//      appending an ungated `skillPaletteChord` to `panelHost.ts` left the suite green,
//      because one correctly-gated sibling export exempted the entire file.
//
// So the arm now scans EXPORT BY EXPORT (`ungatedWorkflowExports`), and the scoping to
// chord-shaped exports is load-bearing in the other direction: an unscoped per-export scan
// flagged four non-chord exports on the untouched tree (`RightPanel`, `AVAILABLE_PANELS`,
// `selectPanel`, `reconcilePanel`) — false positives, which is how a guard gets deleted.
// Both directions are standing meta-tests below, not throwaway probes.
// ═══════════════════════════════════════════════════════════════════════════════

/** Terms that identify a workflow-coupled surface. Deliberately broad on WHAT counts as
 *  workflow-coupled — the guard should fire on a near-miss and be narrowed deliberately
 *  rather than miss one and ship silently.
 *
 *  Matched on WORD BOUNDARIES, not as bare substrings. Learned the hard way: a substring
 *  match on "docs" fires on the word "do{cs}tring" in an unrelated chord test. A guard
 *  that cries wolf gets deleted by the next person who trips it, so the matcher has to be
 *  precise even though the term list is broad. */
const WORKFLOW_TERMS = ["workflow", "docs", "skill", "drivemode", "drive-mode"];

/** Strip comments before matching source text.
 *
 *  Shared by the chord arm and the wrapper-bypass arm. A file that documents *why* it
 *  avoids something must not be flagged for naming it — and the alternative (rewording an
 *  explanation to dodge a grep) would trade real reasoning for a passing test.
 *
 *  This is load-bearing for the chord arm, not merely tidy: `paletteCommands.ts` carries a
 *  stale `workflow/archive/…` doc path in a comment (pre-dating the 2026-07-28 layout
 *  migration), and it is selected by the content predicate below. Without stripping, the
 *  arm goes red on prose the moment it is widened — which the header calls out as the
 *  failure that gets a guard deleted. */
function stripComments(src: string): string {
  return src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

/** True iff `src` exports an identifier containing `Chord` — i.e. the module owns chord
 *  logic, whatever its filename says.
 *
 *  ── Why CONTENT, not basename (a PROVEN miss, do not "simplify" this back) ──
 *  Selecting by basename skipped `panelHost.ts`. Provenance is in the file header; the RULE
 *  is: a guard that cannot see the module it guards is decorative.
 *
 *  ── Why THIS predicate and not "reads a keyboard event" (M11.5 WP4 audit) ──
 *  The tempting content test — "the module reads `metaKey`" — is WRONG: it drops
 *  `closeTerminalChord.ts`, whose export takes three pre-computed booleans
 *  (`{isCloseChord, terminalFocused, canClose}`) and never touches a keyboard event. It is
 *  the only chord module with no `metaKey`, so that predicate would widen reach on one
 *  module while silently narrowing it on another — a net loss disguised as a fix.
 *  Matching the EXPORTED IDENTIFIER is a strict superset instead: it selects all 12
 *  modules the basename filter found, plus `panelHost.ts` (via `panelForChord` and
 *  `PanelChordEvent`). Nothing that was in scope dropped out.
 *
 *  ⚠️ It is a NAME test on identifiers, not a behavioral one — say so plainly, because the
 *  header once oversold it as a category change. The root cause (reach depends on a naming
 *  convention nobody is obliged to follow) survives; what changed is WHICH convention, from
 *  filename to exported-identifier name. The reach gain and the proven miss it closes are
 *  both real, and a true content predicate was rejected above for a measured reason — but
 *  the honest framing is "selected by exported-identifier name, not by filename."
 *  (`SURFACE-2026-08-01-QUALITY-WP4-SELECTOR-IS-NAME-NOT-CONTENT`.)
 *
 *  ── Declaration forms (paydown WP2, 2026-08-12) ──
 *  The form list was `function|const|interface|type`, which missed `export default function`,
 *  `export async function`, `export class`, `export let`, and `export enum` — the SAME
 *  blind-spot class this arm exists to close, relocated from filename shape to declaration
 *  keyword. Measured on the real tree: `export default function` appears in 8 non-test files
 *  and `export async function` in 9, so these are live idioms rather than hypotheticals.
 *  Each added form is mutation-proven INDIVIDUALLY in the meta-tests below — as one composite
 *  probe would report "the selector widened" while any single form stayed blind.
 *  (`SURFACE-2026-08-01-QUALITY-WP4-CHORD-SELECTOR-MISSES-EXPORT-FORMS`.) */
function exportsChordIdentifier(src: string): boolean {
  // ⚠️ Case-SENSITIVE on the identifier (`Chord` or `chord`), not the `i` flag
  // (`SURFACE-2026-08-01-QUALITY-WP4-MINOR-CLUSTER` #1) — the same laxity `namesWorkflowTerm`
  // below deliberately avoids after `i` re-admitted `docstring`. Measured: 15 modules before
  // and after, nothing dropped, and `CHORD_MAP` is now correctly excluded.
  //
  // Stated honestly: this does NOT eliminate every false positive. `unchorded` and `chordata`
  // still match, because `[A-Za-z]*chord` must accept a lowercase-prefixed identifier for
  // `isSearchChord` and friends to be selected. Tightening further would risk dropping a real
  // chord export, which is the one direction that actually disarms the arm. All of these fail
  // SAFE — a false positive only widens the candidate set, and the per-export offender filter
  // is what decides. So this is consistency with the file's documented rule, not a bug fix.
  return /export\s+(?:default\s+)?(?:async\s+)?(?:function|const|let|var|class|enum|interface|type)\s+[A-Za-z]*(?:Chord|chord)/.test(
    src,
  );
}

/** The chord arm's offender test: is this module source an UNGATED workflow chord?
 *
 *  Extracted from the arm's `.filter()` at M11.5 WP4 codify so it can be asserted as a
 *  VALUE. The arm itself asserts `offenders === []`, which passes both when this predicate
 *  works and when it is broken to always-false — the vacuity shape this file's meta-tests
 *  exist to catch. M10.9 WP5.2 and M11.5 WP4 Phase 2 each proved it fires by throwaway
 *  probe, but as the meta-test header says: "a probe is not coverage."
 *
 *  Comments are stripped first — a module that merely MENTIONS a workflow term in prose is
 *  not a registered chord. A module that consumes the seam is legitimately gated.
 *
 *  ⚠️ The RULE: a bare mention of the seam is not gating, and one gated export does not
 *  excuse its siblings — hence the per-export scan below. Why both were learned the hard way
 *  is in the file header ("THE CHORD ARM IS PER-EXPORT"); both directions are mutation-proven
 *  in the meta-tests. */
function isUngatedWorkflowChord(rawSrc: string): boolean {
  return ungatedWorkflowExports(rawSrc).length > 0;
}

/** True iff this ONE export body consumes the gate value (rather than merely naming the seam).
 *
 *  Evidence accepted — each is the gate reaching a DECISION:
 *    - `useWorkflowFeaturesEnabled(` — the hook is actually CALLED (note the paren; a bare
 *      mention or a `import type` is not)
 *    - `enabled ? … : …` / `enabled && …` / `if (enabled)` — the value reaches a branch
 *
 *  ⚠️ Deliberately NOT accepted: `WorkflowGateValue`, or `enabled` merely appearing in a
 *  parameter list. Those are type signatures, and `panelHost.ts` is the proof of why they
 *  cannot count — it is a pure module whose gate arrives as a parameter, so a signature-level
 *  match would exempt it (and every future export beside it) without any gate being honored. */
function consumesGateValue(exportBody: string): boolean {
  return (
    /useWorkflowFeaturesEnabled\s*\(/.test(exportBody) ||
    /\benabled\b\s*(\?|&&)/.test(exportBody) ||
    /\bif\s*\(\s*!?\s*enabled\b/.test(exportBody)
  );
}

/** The chord arm's PER-EXPORT offender scan: which exports of this module are ungated
 *  workflow surfaces?
 *
 *  ⚠️ Per-export, NOT per-module — two whole-module predicates were each proven holed here
 *  (file header, "THE CHORD ARM IS PER-EXPORT"). Do not "simplify" this back to a
 *  whole-module test; both mutation directions are pinned in the meta-tests.
 *
 *  Splitting on `export ` is coarse but honest for this codebase: chord modules are flat
 *  top-level functions, and a nested `export` inside a function body does not occur here. */
function ungatedWorkflowExports(rawSrc: string): string[] {
  const src = stripComments(rawSrc);
  // Everything before the first `export` is imports/types — not a surface, but its text must
  // not leak into the first export's body either, so it is dropped rather than prepended.
  const segments = src.split(/^export\s/m).slice(1);
  return (
    segments
      .map((body) => ({
        body,
        name: /^(?:async\s+)?(?:function|const|class|interface|type)\s+([A-Za-z_$][\w$]*)/.exec(
          body,
        )?.[1],
      }))
      // ⚠️ Only CHORD-shaped exports are in scope, and the scoping is what keeps the per-export
      // split honest. `panelHost.ts` also exports a `RightPanel` type union containing "docs",
      // an `AVAILABLE_PANELS` constant, and `selectPanel` / `reconcilePanel` — all of which name
      // a workflow term and none of which consume the gate, because none of them REGISTERS a
      // surface (the first two are data; the latter two receive an already-gated panel set).
      // Scanning every export flagged all four on the untouched tree — four false positives that
      // would have made this arm cry wolf, which the file's header names as how a guard gets
      // deleted. The arm's subject is chords: an export whose NAME says chord, or whose body
      // reads a keyboard event.
      .filter(
        ({ body, name }) =>
          /chord/i.test(name ?? "") ||
          /\b(metaKey|shiftKey|altKey|ctrlKey)\b/.test(body),
      )
      .filter(({ body }) => namesWorkflowTerm(body) && !consumesGateValue(body))
      .map(({ body, name }) => name ?? body.split("\n")[0].trim().slice(0, 40))
  );
}

/** True iff `haystack` contains any workflow term as a whole word.
 *
 *  A "boundary" is a non-letter (space, `_`, `-`, `.`, quote, edge) **or a case
 *  transition**. So all of these hit — `docs`, `WORKFLOW_DOCS`, `view.panel.docs`,
 *  `docsList`, `DocsPanel`, `showDocsTab`, `openSkillPalette`, `workflow_gate`,
 *  `drive-mode` — while these do not: `docstring`, `skillful`, `unskilled`, `workflowy`,
 *  `predocs`, `reskilled`.
 *
 *  ── Why it is built this way (two bugs, opposite directions) ──
 *  The camelCase half is load-bearing and was MISSING at first. The panel and menu-id
 *  arms match against IDENTIFIERS, which are camelCase by convention, so a `docsList`
 *  panel — exactly how M11 would name a Docs surface — slipped straight through the
 *  original `([^a-z]|$)` version. The arm most likely to fire at M11 time was the one
 *  that would have missed.
 *
 *  The obvious fix (add `[A-Z]` to the trailing class, keep the `i` flag) is WRONG: `i`
 *  makes `[A-Z]` match lowercase too, which re-admits `docstring`. So the match is
 *  case-SENSITIVE and tries each term's three realistic casings explicitly, with a
 *  lowercase-before-Uppercase lead allowed only for the Capitalised form.
 *
 *  Both directions are pinned by the meta-tests below — narrowing this to kill a false
 *  positive must not silently disarm the arms. */
function namesWorkflowTerm(haystack: string): boolean {
  return WORKFLOW_TERMS.some((term) =>
    // lower `docs`, Capitalised `Docs`, UPPER `DOCS` — the three casings an identifier,
    // a constant, or prose realistically uses.
    [term, term[0].toUpperCase() + term.slice(1), term.toUpperCase()].some(
      (variant) => {
        // A Capitalised variant may also be preceded by a lowercase letter — that IS the
        // case transition in `openSkillPalette` / `showDocsTab`.
        const lead = /^[A-Z]/.test(variant)
          ? "(^|[^A-Za-z]|[a-z])"
          : "(^|[^A-Za-z])";
        return new RegExp(`${lead}${variant}([^A-Za-z]|[A-Z]|$)`).test(
          haystack,
        );
      },
    ),
  );
}

describe("OFF-invariant: no workflow surface is registered while the gate is off", () => {
  it("registers no workflow panel in the OFF-state panel set", () => {
    // M11 WP2 made the panel registry GATE-DERIVED, which this test's header anticipated
    // ("If M11 makes AVAILABLE_PANELS dynamic, update this test to assert the OFF-state
    // value of that computation rather than deleting the assertion"). So the subject is
    // now `availablePanels(false)` — the computed OFF value — not the static array.
    //
    // Asserting the COMPUTATION rather than the constant is what keeps this honest: a
    // future gated panel that forgets its gate lands in `availablePanels(false)` and is
    // caught here, whereas checking only the `AVAILABLE_PANELS` literal would pass while
    // the derivation leaked the panel through.
    for (const panel of availablePanels(false)) {
      expect(
        namesWorkflowTerm(panel),
        `panel "${panel}" looks workflow-coupled but is unconditionally available — ` +
          `gate it behind useWorkflowFeaturesEnabled() instead of adding it to AVAILABLE_PANELS`,
      ).toBe(false);
    }
  });

  it("the panel set is genuinely gate-DERIVED, not a constant that ignores the gate", () => {
    // Anti-vacuity companion to the arm above. `availablePanels(false)` containing no
    // workflow panel is satisfied just as well by a derivation that ignores its argument
    // and always returns the ungated baseline — in which case the assertion above would
    // pass forever while the Docs panel could never appear at all, and the arm would be
    // guarding nothing. Pinning that ON differs from OFF is what makes the OFF assertion
    // load-bearing rather than trivially true.
    const off = availablePanels(false);
    const on = availablePanels(true);

    expect(
      on.length,
      "turning the gate ON must add at least one panel — otherwise the derivation is a " +
        "constant and the OFF-state assertion above proves nothing",
    ).toBeGreaterThan(off.length);
    // And the panels it adds are exactly the workflow-coupled ones (the reverse direction:
    // the gate must not be smuggling in unrelated panels).
    for (const panel of on.filter((p) => !off.includes(p))) {
      expect(
        namesWorkflowTerm(panel),
        `panel "${panel}" is added by the gate but does not look workflow-coupled — the ` +
          `gate should only ever admit workflow surfaces`,
      ).toBe(true);
    }
  });

  it("registers no workflow menu id in MENU_IDS", () => {
    // A menu item is registered at app-menu BUILD time (Rust) and mapped in MENU_IDS
    // (TS). A workflow menu item present while OFF is a dead affordance — the exact
    // thing the milestone forbids.
    for (const [key, id] of Object.entries(MENU_IDS)) {
      expect(
        namesWorkflowTerm(`${key} ${id}`),
        `menu id ${key}="${id}" looks workflow-coupled but is unconditionally ` +
          `registered — a menu item present while the gate is OFF is a dead affordance`,
      ).toBe(false);
    }
  });

  it("matches no workflow chord (no chord predicate module is workflow-coupled)", () => {
    // A live chord whose handler early-returns still SWALLOWS the keystroke — that is
    // "registered-with-a-no-op-handler", explicitly forbidden by the seam contract.
    // Chord modules are selected by CONTENT (see chordModules() / exportsChordIdentifier);
    // none may be workflow-coupled unless its listener is mounted in an `enabled &&` branch.
    const offenders = chordModules()
      .filter((f) => isUngatedWorkflowChord(readFileSync(f, "utf8")))
      .map(relFromSrcRoot);
    expect(
      offenders,
      "these chord modules look workflow-coupled but are not gated behind the seam",
    ).toEqual([]);
  });

  // ── ARM 4: THE PICKER ROW'S PER-PROJECT CELLS (M12 WP5) ────────────────────
  // M12 surfaced UI through a channel the first three arms do not enumerate: the picker
  // row. Two derivations own the OFF-state shape, and both are asserted as COMPUTED
  // VALUES — the same discipline M11 applied when it made the panel arm read
  // `availablePanels(false)` instead of a static array. A future gated row surface that
  // forgets its gate lands in one of these values and is caught here.

  it("renders no workflow line in the OFF-state picker cell", () => {
    // `cellLines` is the single source of truth for the stacked model/drive-mode cell.
    // With the gate OFF it must return exactly the pre-M12 shape: ONE line, for the
    // model, carrying no drive-mode prefix. Not a hidden line, not a disabled line, not
    // a reserved empty row — absent, per the seam contract.
    //
    // Every combination of the two persisted values is checked, because the gate must
    // win regardless of what is stored: a project with a drive mode already saved (the
    // realistic case after a user disables the gate) must still render the OFF shape.
    for (const model of [null, "opus"]) {
      for (const mode of [null, "autopilot", "fsd"] as const) {
        const off = cellLines(model, mode, false, "Default");

        expect(
          off.length,
          `gate OFF must yield exactly one line (model=${model}, mode=${mode}) — a ` +
            `second line is a workflow surface existing while the gate is off`,
        ).toBe(1);

        for (const line of off) {
          expect(
            line.kind,
            `line kind "${line.kind}" is workflow-coupled but present while OFF`,
          ).toBe("model");
          expect(
            namesWorkflowTerm(line.text),
            `OFF-state line text "${line.text}" names a workflow term — the drive-mode ` +
              `prefix must not leak into the ungated single-line shape`,
          ).toBe(false);
        }
      }
    }
  });

  it("the picker cell is genuinely gate-DERIVED, not a constant that ignores the gate", () => {
    // Anti-vacuity companion, exactly parallel to the panel arm's. "OFF yields one line"
    // is satisfied just as well by a derivation that ignores its argument and always
    // returns one line — in which case the drive-mode line could never appear at all and
    // the assertion above would guard nothing.
    const off = cellLines("opus", "autopilot", false, "Default");
    const on = cellLines("opus", "autopilot", true, "Default");

    expect(
      on.length,
      "turning the gate ON must add a line — otherwise the derivation is a constant and " +
        "the OFF-state assertion above proves nothing",
    ).toBeGreaterThan(off.length);
    // ...and the line it adds is the workflow-coupled one (the reverse direction: the
    // gate must not be smuggling in something unrelated).
    expect(
      on.some((l) => l.kind === "driveMode"),
      "the gate must admit the drive-mode line specifically",
    ).toBe(true);
  });

  it("announces no GATED auto-resume arm on an OFF-state picker row", () => {
    // The `inject` arm promises something about `workflow-system/state/.session.md` — a
    // file a non-workflow user does not have. While OFF it must collapse COMPLETELY:
    // no announcement, no `⊘` no-fire door, no action. A rendered-but-inert announcement
    // would be exactly the "present-but-disabled" shape the seam contract forbids.
    const path = "/tmp/proj";
    const announce: AnnounceMap = { [path]: "restore" };
    const off = rowAffordances(path, announce, false);

    expect(
      off.announcement,
      "a gated arm must not announce while the gate is OFF",
    ).toBeNull();
    expect(
      off.showNoFireDoor,
      "a gated arm must not render its second door while the gate is OFF",
    ).toBe(false);
    expect(
      off.action,
      "a gated arm must not fire while the gate is OFF",
    ).toBeNull();
  });

  it("still announces the UNGATED arm while OFF — the arm must not be over-broad", () => {
    // ⚠️ THE LOAD-BEARING HALF OF THIS ARM. The `argv` arm (`--continue`) reads
    // Claudesk's own `session-state.json` and fires a stock Claude Code CLI flag, so it
    // serves EVERY CC user and is ungated by operator decision (2026-08-05).
    //
    // Without this assertion, an over-broad fourth arm — "nothing M12 announces while
    // OFF" — would pass today and would be *satisfied* by someone gating `--continue`,
    // silently removing a feature from every non-workflow user. The guard would report
    // the regression as compliance. So the arm pins the gate's SHAPE, not merely its
    // restrictiveness.
    const path = "/tmp/proj";
    const announce: AnnounceMap = { [path]: "continue" };
    const off = rowAffordances(path, announce, false);

    expect(
      off.announcement,
      "the ungated --continue arm must still announce while the gate is OFF — it reads " +
        "Claudesk's own store and serves every Claude Code user",
    ).not.toBeNull();
    expect(
      off.action?.kind,
      "the ungated arm must still fire, as the argv kind",
    ).toBe("argv");
    expect(
      off.showNoFireDoor,
      "the ungated arm keeps its second door — label and door are one decision",
    ).toBe(true);
  });
});

/** The only files permitted to name the raw gate command.
 *
 *  ⚠️ Module-scoped so the allowlist-shape test below asserts against THIS array rather than a
 *  hand-copied duplicate of it. It previously built its own `ALLOWED_SAMPLE` and checked that
 *  invented paths were absent from the literal it had just written — a test of its own fixture,
 *  green no matter what the real allowlist said
 *  (`SURFACE-2026-07-28-QUALITY-WP2-ALLOWLIST-TEST-HALF-TAUTOLOGICAL`). */
const ALLOWED = [
  "src/state/workflowGate.ts",
  "src/state/useWorkflowFeaturesEnabled.ts",
  "src/state/__tests__/workflowGateContract.test.ts",
  "src/state/__tests__/offInvariantGuard.test.ts",
];

describe("OFF-invariant: the seam is the only door", () => {
  it("no module bypasses the seam to read the setting directly", () => {
    // A second call site is a second source of truth: it would not re-render on the
    // broadcast, and it is invisible to the guard above. The seam module and its own
    // tests are the only legitimate places the raw command name appears.
    const offenders = sourceFiles()
      .filter((f) => {
        const src = readFileSync(f, "utf8");
        return (
          src.includes("workflow_get_features_enabled") ||
          src.includes("workflow_set_features_enabled")
        );
      })
      .map(relFromSrcRoot)
      .filter((rel) => !ALLOWED.includes(rel));

    expect(
      offenders,
      "these files invoke the gate command directly — consume useWorkflowFeaturesEnabled() instead",
    ).toEqual([]);
  });

  it("no module imports the raw GETTER either — the wrapper is a bypass too", () => {
    // BLIND SPOT CLOSED at WP3 review-quality (2026-07-29). The scan above matches the raw
    // COMMAND STRINGS, so a bypass through the typed wrapper `getWorkflowFeaturesEnabled()`
    // was completely invisible to it — and WP3's `App.tsx` did exactly that, shipping a
    // one-shot read that never re-synced on the broadcast. The staleness happened to be
    // masked by an unrelated flag, which is worse than a visible bug: the guard reported
    // clean while the property it describes ("it would not re-render on the broadcast",
    // three lines up) was already violated.
    //
    // The SETTER is deliberately not covered here: the invite's `[Enable]`-equivalent and
    // the Settings control both legitimately persist the gate, and `setWorkflowFeaturesEnabled`
    // has no staleness failure mode (a write needs no subscription). Only the READ path can
    // silently diverge from the broadcast, so only the read path is guarded.
    const ALLOWED_GETTER = [
      "src/state/workflowGate.ts",
      "src/state/useWorkflowFeaturesEnabled.ts",
      "src/state/__tests__/workflowGateContract.test.ts",
      "src/state/__tests__/offInvariantGuard.test.ts",
      // The Settings panel's control genuinely owns a read+write pair through
      // `useSettingControl`, which does its own seed+listen — so it is a mirror surface,
      // not a bypass. It re-syncs on the broadcast like the hook does.
      "src/components/settings/SettingsPanel.tsx",
    ];
    // Comments STRIPPED before matching (shared helper, hoisted at M11.5 WP4 when the
    // chord arm came to need it too). A file that documents *why* it avoids the raw getter
    // must not be flagged for naming it — and the alternative (rewording the explanation to
    // dodge a grep) would trade real reasoning for a passing test.
    const offenders = sourceFiles()
      .filter((f) =>
        stripComments(readFileSync(f, "utf8")).includes(
          "getWorkflowFeaturesEnabled",
        ),
      )
      .map(relFromSrcRoot)
      .filter((rel) => !ALLOWED_GETTER.includes(rel));

    expect(
      offenders,
      "these files read the gate through the raw getter — a one-shot read does NOT re-sync " +
        "on WORKFLOW_FEATURES_ENABLED_EVENT. Consume useWorkflowFeaturesEnabled() instead, " +
        "or (for a mirror surface with its own seed+listen) add the file to ALLOWED_GETTER " +
        "with a comment saying why it re-syncs.",
    ).toEqual([]);
  });

  it("the allowlist grants exact paths, never a directory prefix", () => {
    // The bypass scan subtracts an allowlist. If that subtraction ever became a
    // prefix/startsWith/glob match, everything under src/state/ (or worse, src/) would be
    // silently exempt and the scan would be decorative. Verified once by probe during
    // verify-self; pinned here so it stays true. Each entry must name a FILE, and a
    // sibling in the same directory must not be covered by it.
    const guardSrc = readFileSync(
      resolveFromSrcRoot("state/__tests__/offInvariantGuard.test.ts"),
      "utf8",
    );
    expect(guardSrc).toContain("!ALLOWED.includes(rel)");
    expect(guardSrc).not.toMatch(/ALLOWED\.some\([^)]*startsWith/);

    // ⚠️ Asserted against the REAL module-scoped `ALLOWED`, not a copy of it. This used to
    // build its own `ALLOWED_SAMPLE` duplicating the array four lines away and then check that
    // invented paths were absent from that literal — which is a test of the fixture, true by
    // construction and green even if the real allowlist had been widened to `src/`.
    // (`SURFACE-2026-07-28-QUALITY-WP2-ALLOWLIST-TEST-HALF-TAUTOLOGICAL`.)
    //
    // Every entry must name an exact FILE, so a near-miss sibling in the same directory — or a
    // path that merely shares a prefix — must NOT be covered.
    for (const sneaky of [
      "src/state/anotherGateReader.ts",
      "src/state/__tests__/sneaky.test.ts",
      "src/state/workflowGate.helper.ts", // shares a prefix with an allowlisted file
      "src/state/", // the directory itself
    ]) {
      expect(
        ALLOWED.includes(sneaky),
        `${sneaky} must not be allowlisted — only the four exact seam paths are`,
      ).toBe(false);
    }

    // ...and the allowlist is non-empty and exact-length, so a future edit that widens it has
    // to come through this test rather than past it.
    expect(ALLOWED).toHaveLength(4);
    expect(ALLOWED.every((p) => p.endsWith(".ts") || p.endsWith(".tsx"))).toBe(
      true,
    );
  });

  it("the seam module states the contract a future surface must follow", () => {
    // The contract is only enforceable if it is findable. Pin the three prohibited
    // shapes so a refactor cannot quietly drop the explanation.
    const hookSrc = readFileSync(
      resolveFromSrcRoot("state/useWorkflowFeaturesEnabled.ts"),
      "utf8",
    );
    expect(hookSrc).toContain("MUST NOT EXIST WHEN THE GATE IS OFF");
    expect(hookSrc).toContain("rendered-then-hidden");
    expect(hookSrc).toContain("present-but-disabled");
    expect(hookSrc).toContain("registered-with-a-no-op-handler");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// META-TESTS — the guard checking its own machinery.
//
// Every assertion above is of the form "this set contains no offender." That shape has a
// specific and silent failure mode: if the set is EMPTY, or the matcher never matches,
// the assertion passes while checking nothing. A vacuous guard is worse than no guard,
// because it reads as coverage in a review.
//
// These properties were each proven once by a throwaway probe during verify-self and then
// reverted. That proof does not survive into CI — so it is re-established here as standing
// tests. Written at codify precisely because a probe is not coverage.
// ═══════════════════════════════════════════════════════════════════════════════

describe("the guard is not vacuous", () => {
  it("walks a non-trivial set of source files", () => {
    // If sourceFiles() ever resolved to the wrong root or returned [], all three registry
    // assertions above would pass having scanned nothing. 50 is a deliberately loose floor
    // (the tree held 258 at the time of writing) — it catches "broken to empty", which is
    // the real failure mode, without breaking on ordinary file-count churn.
    const files = sourceFiles();
    expect(
      files.length,
      "sourceFiles() returned a suspiciously small set — the guard may be scanning nothing",
    ).toBeGreaterThan(50);
    // ...and it is really rooted at src/, not somewhere adjacent.
    expect(files.every((f) => f.startsWith(srcRoot()))).toBe(true);
    // Sanity: it can actually see the seam module it is supposed to police.
    expect(files.map(relFromSrcRoot)).toContain("src/state/workflowGate.ts");
  });

  it("the chord arm's content selector reaches panelHost.ts and does not shrink", () => {
    // M11.5 WP4. The chord arm is only as good as its candidate set, and that set was
    // silently WRONG for one release: the basename filter it used to carry missed
    // `panelHost.ts`, proven by M10.9 WP5.2 probe 5b (an ungated workflow chord placed
    // there passed the full guard 10/10). Phase 2 mutation-proves the arm bites there now,
    // but a probe is not coverage — so the REACH itself is pinned here.
    //
    // Two directions, both of which have a real failure behind them:
    const selected = chordModules().map(relFromSrcRoot);

    // (1) The module the old selector missed. This is the whole point of the WP.
    expect(
      selected,
      "the chord arm must reach panelHost.ts — it owns panelForChord, the most natural " +
        "home for an M11 Docs chord, and the basename selector provably missed it",
    ).toContain("src/components/workspace/panelHost.ts");

    // (2) No SHRINKAGE. A tempting "content" predicate (match files that read `metaKey`)
    // would drop closeTerminalChord.ts, whose export takes three pre-computed booleans and
    // never reads a keyboard event — widening reach on one module while narrowing it on
    // another. The exported-identifier predicate is a strict superset of the 12 modules the
    // basename filter found; assert the ones a naive rewrite would lose.
    for (const mustKeep of [
      "src/components/workspace/closeTerminalChord.ts", // no metaKey at all
      "src/components/workspace/chordEvent.ts", // shared type module, no predicate
      "src/components/settings/settingsChord.ts",
      "src/components/workspace/workspaceSwitchChord.ts",
    ]) {
      expect(
        selected,
        `${mustKeep} was in scope under the basename selector and must stay in scope`,
      ).toContain(mustKeep);
    }

    // ...and the set is a plausible size (15 at the time of writing: 12 + panelHost +
    // paletteCommands + terminalFontZoom).
    //
    // ⚠️ The floor was `>= 13` while the test was named "does not shrink" — it tolerated
    // losing 2 of 15 modules (13%), i.e. precisely the shrinkage it claimed to forbid
    // (`SURFACE-2026-08-01-QUALITY-WP4-MINOR-CLUSTER` #2). The four `toContain` assertions
    // above already cover specific shrinkage better, so a loose floor added nothing except a
    // false sense of a bound. It is now exact: a selector change that moves this number must
    // be a deliberate edit here, with the new count justified.
    expect(
      selected.length,
      "the chord-module set changed size — if a selector widening added a module this is " +
        "expected, but update the count deliberately; a SHRINK silently disarms this arm",
    ).toBe(15);
  });

  it("the chord arm's offender predicate FIRES on an ungated workflow chord", () => {
    // M11.5 WP4 codify. The arm asserts `offenders === []`, which passes just as happily
    // when the predicate is broken to always-false. M10.9 WP5.2 and this WP's Phase 2 each
    // proved it fires by injecting a real violation into panelHost.ts and confirming the
    // guard failed — but both were throwaway probes, reverted. Per this file's own meta-test
    // header ("a probe is not coverage"), the property is re-established as a standing test.
    //
    // The fixture is the EXACT shape of the M10.9 WP5.2 probe 5b that passed 10/10 against
    // the old basename selector: an ungated workflow chord predicate in a module that owns
    // chord logic but is not named *Chord.ts.
    const ungatedDocsChord = `
export function docsChord(e: { metaKey: boolean; key: string }): boolean {
  return e.metaKey && e.key.toLowerCase() === "k";
}
`;
    expect(
      isUngatedWorkflowChord(ungatedDocsChord),
      "an ungated workflow chord must be flagged — this is the violation the arm exists to catch",
    ).toBe(true);

    // ⚠️ A bare seam IMPORT is NOT gating, and must still be flagged. This fixture used to
    // assert the opposite — it imported the hook, never consumed it, and expected `false`,
    // which is exactly the whole-module escape hatch of
    // `SURFACE-2026-08-12-CHORD-ARM-GATE-EXEMPTION-IS-WHOLE-MODULE`. Under that contract the
    // only real module it exempted (`panelHost.ts`) was excused by a *type-only* import while
    // its actual gate lived elsewhere, so the arm was reading the wrong evidence.
    const importsButNeverConsumes = `
import { useWorkflowFeaturesEnabled } from "../../state/useWorkflowFeaturesEnabled";
export function docsChord(e: { metaKey: boolean; key: string }): boolean {
  return e.metaKey && e.key.toLowerCase() === "k";
}
`;
    expect(
      isUngatedWorkflowChord(importsButNeverConsumes),
      "importing the seam without consuming the gate value is NOT gating — still an offender",
    ).toBe(true);

    // ...and the ways a module legitimately passes must NOT be flagged, so the predicate is
    // not simply always-true (which would make the arm cry wolf). This is `panelHost.ts`'s
    // real shape: a pure module that takes the gate value as a parameter and BRANCHES on it.
    const gatedDocsChord = `
export function panelForChord(e: { metaKey: boolean; key: string }, enabled = false) {
  if (!e.metaKey) return null;
  return e.key.toLowerCase() === "k" ? (enabled ? "docs" : null) : null;
}
`;
    expect(
      isUngatedWorkflowChord(gatedDocsChord),
      "a chord that branches on the gate value is legitimately gated and must NOT be flagged",
    ).toBe(false);

    // The hook-calling shape (a React module) is equally legitimate.
    const hookCallingChord = `
import { useWorkflowFeaturesEnabled } from "../../state/useWorkflowFeaturesEnabled";
export function useDocsChord() {
  const enabled = useWorkflowFeaturesEnabled();
  return (e: { metaKey: boolean; key: string }) =>
    enabled && e.metaKey && e.key.toLowerCase() === "k";
}
`;
    expect(
      isUngatedWorkflowChord(hookCallingChord),
      "a module that CALLS the hook and branches on it is gated and must NOT be flagged",
    ).toBe(false);

    const ordinaryChord = `
export function isSearchChord(e: { metaKey: boolean; key: string }): boolean {
  return e.metaKey && e.key.toLowerCase() === "f";
}
`;
    expect(
      isUngatedWorkflowChord(ordinaryChord),
      "an ordinary non-workflow chord must NOT be flagged",
    ).toBe(false);
  });

  it("the chord selector reaches every declaration form, each proven individually", () => {
    // Paydown WP2 (2026-08-12), closing
    // `SURFACE-2026-08-01-QUALITY-WP4-CHORD-SELECTOR-MISSES-EXPORT-FORMS`.
    //
    // ⚠️ Asserted form-by-form, NOT as one composite string containing all of them. A single
    // fixture exercising every form at once passes as soon as ONE matches, so a form that
    // stayed blind would be reported as covered — the same composite-probe error the arm's own
    // header warns about for arms. `it.each` gives each form its own named failure.
    //
    // These are live idioms, not hypotheticals: measured on the tree at the time of writing,
    // `export default function` appears in 8 non-test files and `export async function` in 9.
    const forms: Array<[string, string]> = [
      [
        "export default function",
        "export default function docsChord(e) { return e.metaKey; }",
      ],
      [
        "export async function",
        "export async function docsChord(e) { return e.metaKey; }",
      ],
      ["export class", "export class DocsChordHandler {}"],
      ["export let", "export let docsChord = (e) => e.metaKey;"],
      ["export var", "export var docsChord = (e) => e.metaKey;"],
      ["export enum", "export enum DocsChordKind { Open }"],
      ["export function", "export function docsChord(e) { return e.metaKey; }"],
      ["export const", "export const docsChord = (e) => e.metaKey;"],
      [
        "export interface",
        "export interface DocsChordEvent { metaKey: boolean }",
      ],
      ["export type", "export type DocsChordKey = string;"],
    ];
    for (const [form, fixture] of forms) {
      expect(
        exportsChordIdentifier(fixture),
        `the selector must reach \`${form}\` — a declaration form it cannot see is a blind spot of the same class the arm exists to close`,
      ).toBe(true);
    }

    // ...and it must not select a module with no chord export at all, so the widening did not
    // simply make the predicate always-true.
    expect(
      exportsChordIdentifier(
        "export function isSearchThing(e) { return e.metaKey; }",
      ),
    ).toBe(false);
  });

  it("the select-then-filter SEAM composes — a fixture flows through both halves", () => {
    // `SURFACE-2026-08-01-QUALITY-WP4-MINOR-CLUSTER` #3: the two halves of the arm were each
    // tested alone, but never composed. `exportsChordIdentifier` decides WHICH modules are
    // scanned and `ungatedWorkflowExports` decides WHICH of their exports offend — so a
    // fixture that the selector rejects can never reach the offender filter, and a hole in
    // the seam between them is invisible to either test on its own.
    //
    // This drives the same fixture through the real composition, in both directions.
    const ungatedInSelectedModule = `
export function panelForChord(e: { metaKey: boolean; key: string }, enabled = false) {
  return e.metaKey && e.key.toLowerCase() === "k" ? (enabled ? "docs" : null) : null;
}
export function skillPaletteChord(e: { metaKey: boolean; shiftKey: boolean; key: string }) {
  return e.metaKey && e.shiftKey && e.key.toLowerCase() === "j";
}
`;
    // Half 1 must SELECT it...
    expect(
      exportsChordIdentifier(ungatedInSelectedModule),
      "the selector must reach this module, or the offender filter never runs on it",
    ).toBe(true);
    // ...and half 2 must FLAG it. Both are required; either alone passes vacuously.
    expect(ungatedWorkflowExports(ungatedInSelectedModule)).toEqual([
      "skillPaletteChord",
    ]);

    // The inverse seam failure: a module the selector does NOT reach is never scanned, so an
    // ungated workflow chord inside it would go unseen. Pinned so a future narrowing of the
    // selector — which cannot fail the offender tests — fails HERE.
    const notAChordModule = `
export function openDocsThing(e: { metaKey: boolean; key: string }) {
  return e.metaKey && e.key.toLowerCase() === "k";
}
`;
    expect(
      exportsChordIdentifier(notAChordModule),
      "this fixture is deliberately outside the selector — if it starts matching, the seam " +
        "test below no longer proves what it claims",
    ).toBe(false);
    // It WOULD be flagged if it were ever selected — which is exactly why selector reach is
    // the load-bearing half, and why the reach test above enumerates declaration forms.
    expect(ungatedWorkflowExports(notAChordModule)).toEqual(["openDocsThing"]);
  });

  it("no keydown registration site does inline chord matching (the convention guard)", () => {
    // Paydown WP2 (2026-08-12), closing
    // `SURFACE-2026-08-01-QUALITY-WP4-ARM-GUARDS-PREDICATES-NOT-REGISTRATION`.
    //
    // ⚠️ This is deliberately NOT a sixth arm scanning handler bodies for gated-ness — that
    // was the item's ORIGINAL suggestion and it was explicitly superseded (M11 arch back-loop,
    // 2026-08-01, severity corrected MAJOR→low on measured evidence). The chord arm guards
    // predicate MODULES, not registration SITES, and that is sufficient *precisely because*
    // every registration site delegates to a predicate module. This test protects that
    // premise, which is a far smaller change than re-implementing the arm at every listener.
    //
    // The distinction that makes it work: a CHORD is a modifier + key match. Bare
    // `e.key === "Escape"` / `"Enter"` / `" "` dismissals and confirmations are NOT chords and
    // are legitimately inline — there are many, and flagging them would make this cry wolf.
    // So the offender shape is a modifier (`metaKey`/`ctrlKey`/`altKey`) tested in the same
    // module as a `key ===` comparison, at a site that registers a listener.
    // ⚠️ Test files are excluded, and the omission is load-bearing rather than tidy: without
    // it THIS FILE is the only offender the scan reports. Its fixtures above contain both a
    // modifier read and a `key ===` comparison, so the guard matches its own test data — the
    // Rust-side twin of `[[raw-guard-identifier-satisfied-by-own-comments]]`. A test file
    // registers no listeners, so it cannot be a registration site by construction.
    const registrationSites = sourceFiles().filter((f) => {
      if (/__tests__|\.test\.tsx?$/.test(f)) return false;
      const src = stripComments(readFileSync(f, "utf8"));
      return /addEventListener\(\s*["']keydown["']|onKeyDown/.test(src);
    });

    // Vacuity check: if this resolved to [] the assertion below would pass having scanned
    // nothing — the exact failure mode this file's meta-tests exist to catch.
    expect(
      registrationSites.length,
      "found no keydown registration sites at all — the scan is broken, not the code clean",
    ).toBeGreaterThan(5);

    const inlineChordSites = registrationSites
      .filter((f) => {
        const src = stripComments(readFileSync(f, "utf8"));
        const hasModifier = /\be\.(metaKey|ctrlKey|altKey)\b/.test(src);
        const hasKeyCompare = /\.key\s*===|\.key\.toLowerCase\(\)\s*===/.test(
          src,
        );
        return hasModifier && hasKeyCompare;
      })
      .map(relFromSrcRoot);

    expect(
      inlineChordSites,
      "these registration sites match a chord inline instead of delegating to a predicate " +
        "module — that is what makes the chord arm's module-level scan sufficient, so an " +
        "inline match is a hole the arm cannot see",
    ).toEqual([]);
  });

  it("the chord arm is PER-EXPORT — a gated export does not excuse an ungated sibling", () => {
    // Paydown WP2 (2026-08-12), codified because it is the property two previous predicates
    // silently lacked, and the second failure was invisible without exactly this test.
    //
    // ⚠️ Both predecessors passed the whole suite 19/19 while blind to this violation:
    //   1. `!/useWorkflowFeaturesEnabled/` exempted any module MENTIONING the seam.
    //   2. Requiring real gate-value evidence, but module-wide, still exempted the whole file
    //      as soon as ONE export gated correctly.
    // `panelHost.ts` is the module that matters: `panelForChord` legitimately gates
    // (`enabled ? "docs" : null`), and under (2) that single correct branch excused every
    // other export beside it — including a newly added ungated one.
    //
    // The fixture is that exact shape: one properly-gated chord and one ungated workflow
    // chord in the SAME module. A module-level predicate cannot fail this; a per-export one
    // must, and must name the offending export rather than just the file.
    const mixedModule = `
export function panelForChord(e: { metaKey: boolean; key: string }, enabled = false) {
  return e.metaKey && e.key.toLowerCase() === "k" ? (enabled ? "docs" : null) : null;
}
export function skillPaletteChord(e: { metaKey: boolean; shiftKey: boolean; key: string }) {
  return e.metaKey && e.shiftKey && e.key.toLowerCase() === "j";
}
`;
    expect(
      ungatedWorkflowExports(mixedModule),
      "an ungated workflow chord must be caught even when a SIBLING export gates correctly",
    ).toEqual(["skillPaletteChord"]);

    // The inverse: a module where every workflow-naming chord export gates is clean, so the
    // per-export split does not manufacture false positives.
    const allGated = `
export function panelForChord(e: { metaKey: boolean; key: string }, enabled = false) {
  return e.metaKey && e.key.toLowerCase() === "k" ? (enabled ? "docs" : null) : null;
}
export function isSearchChord(e: { metaKey: boolean; key: string }) {
  return e.metaKey && e.key.toLowerCase() === "f";
}
`;
    expect(ungatedWorkflowExports(allGated)).toEqual([]);
  });

  it("the chord arm does not flag non-chord exports that merely name a workflow term", () => {
    // The other half of the per-export split, and the reason it is SCOPED to chords. When
    // first written it scanned every export and flagged four on the untouched tree —
    // `RightPanel` (a type union containing "docs"), `AVAILABLE_PANELS` (a constant),
    // `selectPanel` and `reconcilePanel` (which receive an already-gated panel set). None
    // registers a surface; all four were false positives, the failure mode this file's header
    // names as how a guard gets deleted.
    const dataExports = `
export type RightPanel = "editor" | "diff" | "terminal" | "docs";
export const AVAILABLE_PANELS: readonly RightPanel[] = ["editor", "diff", "terminal", "docs"];
export function selectPanel(panel: RightPanel, available: readonly RightPanel[]) {
  return available.includes(panel) ? panel : available[0];
}
`;
    expect(
      ungatedWorkflowExports(dataExports),
      "data and panel-plumbing exports are not chords — flagging them makes the arm cry wolf",
    ).toEqual([]);
  });

  it("the chord arm ignores workflow terms that appear only in COMMENTS", () => {
    // M11.5 WP4, codified because it is load-bearing and currently unasserted. Widening the
    // chord arm to select by content pulled in `paletteCommands.ts`, which carries a stale
    // `workflow/archive/…` doc path in a comment (pre-dating the 2026-07-28 layout
    // migration). The arm passes today ONLY because it strips comments first — measured:
    // without stripping the arm reports exactly 1 offender, with stripping it reports 0.
    //
    // Why this matters more than it looks: if someone drops the strip, the arm goes red on
    // PROSE, and the tempting fix is to narrow the selector back toward filenames — which
    // would silently re-open the panelHost.ts hole this WP exists to close. So the property
    // is pinned as behavior (a prose-only mention must not flag) rather than as a grep for
    // the stripComments call, which would rot on the first refactor.
    const proseOnly = [
      "// see workflow/archive/m2-wp1-cm6-probe.md for the original probe",
      "/* Handles the docs tab? No — see docs/lessons/ for why not. */",
      "{/* a skill button would live here once M13 lands */}",
    ];
    for (const comment of proseOnly) {
      const module = `${comment}\nexport function isThingChord(e: { key: string }) {\n  return e.key === "x";\n}\n`;
      // The raw text names a workflow term...
      expect(
        namesWorkflowTerm(module),
        `test fixture is wrong — ${comment} should name a workflow term before stripping`,
      ).toBe(true);
      // ...but after stripping, the arm sees nothing workflow-coupled.
      expect(
        namesWorkflowTerm(stripComments(module)),
        `a workflow term appearing ONLY in a comment must not flag the module — ` +
          `otherwise the arm goes red on prose and gets "fixed" by narrowing the selector`,
      ).toBe(false);
    }

    // And the inverse must still hold: a term in REAL CODE is still caught. Without this,
    // a stripComments() that ate everything would pass the assertions above.
    const realOffender = `export function docsChord(e: { key: string }) {\n  return e.key === "d";\n}\n`;
    expect(
      namesWorkflowTerm(stripComments(realOffender)),
      "stripping must not swallow executable code — a real workflow chord must still flag",
    ).toBe(true);
  });

  it("the row-cell arm asserts the REAL derivations, not a local re-implementation", () => {
    // M12 WP5. The row-cell arm imports `cellLines` and `rowAffordances` from production
    // and drives them. That is deliberate and it is the property worth pinning: the
    // failure mode this repo has already paid for four times is a *proven module behind a
    // caller that ignores it* — and the test-side version of the same mistake is a guard
    // that re-implements the rule it is checking, inheriting the code's blind spot
    // (`[[extract-for-import-when-a-raw-guard-cant-express-the-property]]`).
    //
    // So: assert the imported functions are the production ones by checking a property
    // only the real implementations have — the gate flips the shape, and the drive-mode
    // vocabulary is the closed set the Rust enum serializes to. A stub written to satisfy
    // the arm above would not survive both.
    expect(typeof cellLines, "cellLines must be imported, not stubbed").toBe(
      "function",
    );
    expect(
      typeof rowAffordances,
      "rowAffordances must be imported, not stubbed",
    ).toBe("function");

    // The real `cellLines` prefixes the model line only when a value is UNSET and the
    // gate is ON — a rule no stub would incidentally reproduce.
    const onUnset = cellLines(null, null, true, "Default");
    expect(onUnset.map((l) => l.kind)).toEqual(["model", "driveMode"]);
    expect(onUnset[0].text).toContain("Default");
    expect(onUnset[0].isUnset).toBe(true);

    // And the real `rowAffordances` derives label and door from ONE decision, so they
    // agree in both polarities. (Pinned here rather than only in announceRow's own tests
    // because THIS arm's correctness depends on it: a row that announced without a door
    // would make the OFF-state assertions above ambiguous.)
    const path = "/tmp/proj";
    const announced = rowAffordances(path, { [path]: "continue" }, true);
    expect(announced.announcement !== null).toBe(announced.showNoFireDoor);
    const silent = rowAffordances(path, {}, true);
    expect(silent.announcement !== null).toBe(silent.showNoFireDoor);
  });

  it("the matcher fires on real workflow terms", () => {
    // The positive direction. Without this, narrowing the regex too far (the natural
    // over-correction after a false positive) would silently disarm every arm.
    for (const hit of [
      // bare + separator-delimited
      "docs",
      "workflow",
      "skill",
      "drive-mode",
      "view.panel.docs",
      "WORKFLOW_DOCS",
      "workflow_gate",
      // camelCase identifiers — THE case that was broken. These are how a real M11
      // surface would be named, and the panel/menu-id arms match identifiers, so a
      // matcher that misses these misses the arms most likely to fire.
      "docsList",
      "DocsPanel",
      "showDocsTab",
      "openSkillPalette",
      "workflowDocsChord",
    ]) {
      expect(namesWorkflowTerm(hit), `expected "${hit}" to match`).toBe(true);
    }
  });

  it("the matcher does NOT fire on innocent words that merely contain a term", () => {
    // The regression this pins actually happened: a substring matcher fired on the word
    // "do{cs}tring" in an unrelated chord test, and a guard that cries wolf is one the
    // next person deletes. Word-boundary matching is what makes the broad term list safe.
    for (const miss of [
      "docstring",
      "Docstring", // the capitalised form must not sneak past the case-sensitive variants
      "skillful",
      "unskilled",
      "reskilled",
      "workflowy",
      "predocs",
      "paradoxical",
    ]) {
      expect(namesWorkflowTerm(miss), `expected "${miss}" NOT to match`).toBe(
        false,
      );
    }
  });
});

// ── helpers ──────────────────────────────────────────────────────────────────

function srcRoot(): string {
  return fileURLToPath(new URL("../..", import.meta.url));
}

function resolveFromSrcRoot(rel: string): string {
  return join(srcRoot(), rel);
}

function relFromSrcRoot(abs: string): string {
  return `src/${abs.slice(srcRoot().length)}`.replace(/\/+/g, "/");
}

/** Every non-test source module that owns chord logic, selected by CONTENT.
 *
 *  `__tests__` is excluded because a test file that merely names a term is not a
 *  registered chord — and test prose is where the false positives live. */
function chordModules(): string[] {
  return sourceFiles().filter(
    (f) =>
      !f.includes("__tests__") &&
      exportsChordIdentifier(readFileSync(f, "utf8")),
  );
}

/** Every .ts/.tsx file under src/, recursively. */
function sourceFiles(dir: string = srcRoot()): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full));
    } else if (/\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { availablePanels } from "../../components/workspace/panelHost";
import { MENU_IDS } from "../../menu/menuBridge";

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
//         test does not enumerate would slip past. The mitigation: the three
//         registries below are the only ways this app surfaces UI today, and adding
//         a fourth should extend this guard as part of that work.
//
// ── WHEN M11 LANDS ────────────────────────────────────────────────────────────
// M11's Docs tab MUST NOT appear in the static AVAILABLE_PANELS array. It must be
// added conditionally behind `useWorkflowFeaturesEnabled()`. If M11 makes
// AVAILABLE_PANELS dynamic, update this test to assert the OFF-state value of that
// computation rather than deleting the assertion.
//
// WP5.2 proves this guard bites by temporarily bypassing it and confirming a failure.
//
// ── ARM SELECTION IS BY CONTENT, NOT FILENAME (M11.5 WP4) ─────────────────────
// The chord arm originally selected candidates by BASENAME and provably missed
// `components/workspace/panelHost.ts` — the module owning `panelForChord`. It now selects
// by exported identifier; see exportsChordIdentifier() for why that specific predicate and
// not the tempting `metaKey` one. Probe arms INDIVIDUALLY when checking this guard: a
// composite bypass that trips *some* arm reports "the guard bites" while hiding a gap,
// which is exactly how the basename hole was found.
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
 *  This arm used to select candidates by basename (`/hord[A-Za-z]*\.tsx?$/i`). That skipped
 *  `components/workspace/panelHost.ts` — the module owning `panelForChord`, the app's
 *  panel-select chord mapper and the most natural home for an M11 Docs chord. M10.9 WP5.2
 *  probe 5b proved the gap rather than inferring it: an ungated workflow chord predicate
 *  placed there passed the full guard 10/10, while the identical violation in a
 *  `*Chord.ts` file failed correctly. A guard that cannot see the module it guards is
 *  decorative, and M11 landing its Docs tab is exactly when this arm must fire.
 *
 *  ── Why THIS predicate and not "reads a keyboard event" (M11.5 WP4 audit) ──
 *  The tempting content test — "the module reads `metaKey`" — is WRONG: it drops
 *  `closeTerminalChord.ts`, whose export takes three pre-computed booleans
 *  (`{isCloseChord, terminalFocused, canClose}`) and never touches a keyboard event. It is
 *  the only chord module with no `metaKey`, so that predicate would widen reach on one
 *  module while silently narrowing it on another — a net loss disguised as a fix.
 *  Matching the EXPORTED IDENTIFIER is a strict superset instead: it selects all 12
 *  modules the basename filter found, plus `panelHost.ts` (via `panelForChord` and
 *  `PanelChordEvent`). Nothing that was in scope dropped out. */
function exportsChordIdentifier(src: string): boolean {
  return /export\s+(?:function|const|interface|type)\s+[A-Za-z]*Chord/i.test(
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
 *  not a registered chord. A module that consumes the seam is legitimately gated. */
function isUngatedWorkflowChord(rawSrc: string): boolean {
  const src = stripComments(rawSrc);
  return namesWorkflowTerm(src) && !/useWorkflowFeaturesEnabled/i.test(src);
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
});

describe("OFF-invariant: the seam is the only door", () => {
  it("no module bypasses the seam to read the setting directly", () => {
    // A second call site is a second source of truth: it would not re-render on the
    // broadcast, and it is invisible to the guard above. The seam module and its own
    // tests are the only legitimate places the raw command name appears.
    const ALLOWED = [
      "src/state/workflowGate.ts",
      "src/state/useWorkflowFeaturesEnabled.ts",
      "src/state/__tests__/workflowGateContract.test.ts",
      "src/state/__tests__/offInvariantGuard.test.ts",
    ];
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
    // A near-miss sibling of an allowlisted file must NOT be treated as allowed.
    const ALLOWED_SAMPLE = [
      "src/state/workflowGate.ts",
      "src/state/useWorkflowFeaturesEnabled.ts",
      "src/state/__tests__/workflowGateContract.test.ts",
      "src/state/__tests__/offInvariantGuard.test.ts",
    ];
    for (const sneaky of [
      "src/state/anotherGateReader.ts",
      "src/state/__tests__/sneaky.test.ts",
      "src/state/workflowGate.helper.ts",
    ]) {
      expect(
        ALLOWED_SAMPLE.includes(sneaky),
        `${sneaky} must not be allowlisted — only the four exact seam paths are`,
      ).toBe(false);
    }
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
    // paletteCommands + terminalFontZoom). A loose floor — it catches "broken to empty" and
    // "narrowed back to a handful", not ordinary churn.
    expect(
      selected.length,
      "the chord-module set shrank unexpectedly — a narrowed selector silently disarms this arm",
    ).toBeGreaterThanOrEqual(13);
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

    // ...and the two ways a module legitimately passes must NOT be flagged, so the
    // predicate is not simply always-true (which would make the arm cry wolf):
    const gatedDocsChord = `
import { useWorkflowFeaturesEnabled } from "../../state/useWorkflowFeaturesEnabled";
export function docsChord(e: { metaKey: boolean; key: string }): boolean {
  return e.metaKey && e.key.toLowerCase() === "k";
}
`;
    expect(
      isUngatedWorkflowChord(gatedDocsChord),
      "a chord module that consumes the seam is legitimately gated and must NOT be flagged",
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

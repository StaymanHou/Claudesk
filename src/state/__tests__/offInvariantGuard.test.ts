import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { AVAILABLE_PANELS } from "../../components/workspace/panelHost";
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
  it("registers no workflow panel in AVAILABLE_PANELS", () => {
    // M11's Docs tab is the first real test of this. AVAILABLE_PANELS is static today,
    // so its contents ARE the OFF-state contents.
    for (const panel of AVAILABLE_PANELS) {
      expect(
        namesWorkflowTerm(panel),
        `panel "${panel}" looks workflow-coupled but is unconditionally available — ` +
          `gate it behind useWorkflowFeaturesEnabled() instead of adding it to AVAILABLE_PANELS`,
      ).toBe(false);
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
    // Chord predicates live in *hord*.ts modules; none may be workflow-coupled unless
    // its listener is mounted inside an `enabled &&` branch.
    const offenders = sourceFiles()
      .filter((f) => {
        const base = f.split("/").pop() ?? "";
        // Chord PREDICATE modules only — a test file that merely names a term is not a
        // registered chord (and __tests__ prose is where the false positives live).
        if (!/hord[A-Za-z]*\.tsx?$/i.test(base)) return false;
        if (f.includes("__tests__")) return false;
        const src = readFileSync(f, "utf8");
        // Flag a chord module that names a workflow term AND is not itself gated (a
        // legitimately gated chord module would consume the seam).
        return (
          namesWorkflowTerm(src) && !/useWorkflowFeaturesEnabled/i.test(src)
        );
      })
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
    // Comments STRIPPED before matching. A file that documents *why* it avoids the raw
    // getter must not be flagged for naming it — and the alternative (rewording the
    // explanation to dodge a grep) would trade real reasoning for a passing test. This is
    // the fourth instance in this feature of a source-scanning assertion matching prose;
    // strip first, then match.
    const stripComments = (src: string) =>
      src
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");

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

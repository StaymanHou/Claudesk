// M14 WP0 Phase 2 — the supervisor toggle's CSS↔component contract, BOTH directions.
//
// ⚠️ **`arch.md` records that every CSS guard in this repo reads ONE side, and that both
// directions have shipped real defects:** a class *emitted but never styled* (M10.9's
// eleven-undefined-classes CRITICAL) and a class *styled but never emitted* (dead CSS still
// carrying behavior — a live WP4c regression that 1979 tests, tsc, eslint, prettier and a clean
// build all missed). The repo-wide sweep is still open
// (`SURFACE-2026-08-10-NO-GUARD-COUPLES-A-CSS-CLASS-TO-ITS-EMITTING-COMPONENT`); this covers the
// two classes WP0 adds.
//
// ⚠️ Read via `node:fs`, NOT a `?raw` import: `vitest-raw-import-css-returns-processed-not-text`
// records Vite's CSS plugin intercepting raw imports of `.css` and returning processed output.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const css = readFileSync(resolve(__dirname, "../../../App.css"), "utf8");
const component = readFileSync(resolve(__dirname, "../Workspace.tsx"), "utf8");

/** The component with comments stripped — a class named only in prose is not emitted. */
const emitted = component
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

/** Every class the toggle emits → the CSS selector that must style it. Load-bearing: direction 1
 *  iterates it, and the reverse test below fails on an emitted toggle class missing from it. */
const CLASSES = {
  "workspace-header-supervisor": ".workspace-header-supervisor {",
  // ⚠️ The COMPOSED selector, not the bare `is-off` token: `is-off` is a generic modifier name
  // that could well exist elsewhere in the stylesheet, so matching it alone would pass while
  // THIS component's modifier was unstyled (`raw-guard-substring-must-be-unique-to-its-site`).
  "is-off": ".workspace-header-supervisor.is-off {",
  "workspace-header-supervisor-suppressed":
    ".workspace-header-supervisor-suppressed {",
} as const;

/** The class tokens inside the toggle's `className` attributes — literal and template forms. */
function toggleClassTokens(src: string): string[] {
  const tokens: string[] = [];
  for (const m of src.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
    // In a template, replace each `${…}` with the string literals inside it (` is-off`).
    const text = (m[1] ?? m[2]).replace(/\$\{([^}]*)\}/g, (_x, expr: string) =>
      [...expr.matchAll(/"([^"]*)"/g)].map((q) => ` ${q[1]} `).join(""),
    );
    tokens.push(...text.split(/\s+/).filter(Boolean));
  }
  return tokens;
}

describe("direction 1 — every class the component EMITS is styled", () => {
  for (const [cls, selector] of Object.entries(CLASSES)) {
    it(`.${cls} is emitted and has a CSS rule`, () => {
      expect(emitted, `the component must emit ${cls}`).toContain(cls);
      expect(css, `…and App.css must define ${selector}`).toContain(selector);
    });
  }

  it("every toggle class the component emits is listed in CLASSES", () => {
    // The reverse half, and what makes CLASSES a coverage pin rather than a list only this file
    // reads: a new toggle class added without a CLASSES entry (and therefore without a CSS
    // check) fails here.
    const emittedToggle = toggleClassTokens(emitted).filter(
      (t) => t.startsWith("workspace-header-supervisor") || t === "is-off",
    );
    // Set EQUALITY, not just ⊆: it also fails if the className scan stops seeing a class it
    // should (e.g. the template-literal `is-off`), so the scan cannot go quietly blind.
    expect(
      [...new Set(emittedToggle)].sort(),
      "Workspace.tsx's toggle classes must be exactly CLASSES — a new class needs an entry " +
        "(with its selector); a missing one means the className scan went blind",
    ).toEqual(Object.keys(CLASSES).sort());
  });
});

describe("direction 2 — every class App.css STYLES is actually emitted", () => {
  // ⚠️ The direction that shipped a live regression: dead CSS reads as working styling while the
  // component that was meant to emit it no longer does.
  it("no supervisor-toggle rule is orphaned", () => {
    const ruleNames = [
      ...css.matchAll(/\.(workspace-header-supervisor[\w-]*)/g),
    ].map((m) => m[1]);
    expect(
      ruleNames.length,
      "the guard must find real rules to check",
    ).toBeGreaterThan(0);

    for (const name of new Set(ruleNames)) {
      expect(
        emitted,
        `App.css styles .${name} but Workspace.tsx never emits it — either the component ` +
          `stopped rendering it (dead CSS still carrying behavior) or the rule is a typo`,
      ).toContain(name);
    }
  });
});

describe("⚠️ the toggle reuses the STATUS-DOT palette, and ON is the coloured state", () => {
  // ⚠️ OPERATOR CORRECTION, Phase 2 verify-human 2026-09-17. The first implementation coloured
  // OFF and greyed ON — the inverse of what the rest of the app teaches. The status dot means
  // ACTIVE with Claude brand orange and QUIET with grey; a supervised workspace is the active
  // case. Pinned because a future edit "tidying" the palette would silently re-invert the
  // meaning while every behavioral test stayed green.
  const rule = (selector: string) => {
    const at = css.indexOf(selector);
    expect(at, `${selector} is missing from App.css`).toBeGreaterThan(-1);
    return css.slice(at, css.indexOf("}", at));
  };

  it("ON uses the SAME orange as .status-dot-running", () => {
    // ⚠️ Read the dot's colour out of the stylesheet rather than hardcoding it twice — that way
    // a future palette change fails this test instead of leaving the two silently divergent.
    const dot = rule(".status-dot-running {");
    const dotColor = /background-color:\s*(#[0-9a-fA-F]{6})/.exec(dot)?.[1];
    expect(
      dotColor,
      "could not read .status-dot-running's colour",
    ).toBeTruthy();

    expect(
      rule(".workspace-header-supervisor {"),
      `the supervised state must reuse the status dot's active colour (${dotColor}), not a ` +
        `near-miss hue — an almost-right colour erodes the mapping the operator has learned`,
    ).toContain(`color: ${dotColor}`);
  });

  it("OFF uses the SAME grey as .status-dot-idle", () => {
    const dot = rule(".status-dot-idle {");
    const dotColor = /background-color:\s*(#[0-9a-fA-F]{6})/.exec(dot)?.[1];
    expect(dotColor).toBeTruthy();
    expect(rule(".workspace-header-supervisor.is-off {")).toContain(
      `color: ${dotColor}`,
    );
  });

  it("⚠️ the two states are NOT the same colour — and ON is not the grey one", () => {
    // The anti-inversion assertion. If someone swaps the two rules, this fails.
    const on = rule(".workspace-header-supervisor {");
    const off = rule(".workspace-header-supervisor.is-off {");
    const idleGrey = /background-color:\s*(#[0-9a-fA-F]{6})/.exec(
      rule(".status-dot-idle {"),
    )?.[1] as string;
    expect(on).not.toContain(`color: ${idleGrey}`);
    expect(off).toContain(`color: ${idleGrey}`);
  });

  it("borrows neither the alarm blue nor the background purple", () => {
    // Those hues carry their own meanings (AwaitingInput / BackgroundWork) and must not be
    // reused here — `semantic-distance-not-just-visual-distance-for-status-colour`.
    const both =
      rule(".workspace-header-supervisor {") +
      rule(".workspace-header-supervisor.is-off {");
    expect(both.toLowerCase()).not.toContain("#539bf5");
    expect(both.toLowerCase()).not.toContain("#a371f7");
  });
});

// ⚠️ THE CONSUMING-SURFACE GUARD (integration boundary: Workspace.tsx).
//
// The extracted modules are unit-tested, but "the module is correct" says nothing about whether
// the COMPONENT calls it — the standing local defect shape (*a mechanism correct in itself behind
// a caller that does not honor it*), hit four times here with one shipped CRITICAL. These assert
// the wiring at the one place it can go wrong, and they are source-level because the wiring lives
// inside a `useCallback` that no unit test can reach.
describe("⚠️ Workspace.tsx actually wires the toggle through", () => {
  it("routes the click through `supervisorToggleAction`, not an inline flip", () => {
    // An inline `!(ref.current ?? true)` would work today and silently lose the `revertTo`
    // distinction the moment someone "simplified" the revert to `!next`.
    expect(emitted).toMatch(
      /supervisorToggleAction\(\s*supervisorEnabledRef\.current/,
    );
  });

  it("⚠️ reverts with the action's `revertTo`, never with a recomputed value", () => {
    // Destructured as `revertTo: previous`, then passed to the failure arm. Asserting the
    // DESTRUCTURE plus the restore call is what makes a recomputation visible here.
    expect(emitted).toMatch(/revertTo:\s*previous/);
    expect(emitted).toMatch(/setSupervisorEnabled\(previous\)/);
  });

  it("⚠️ the failure arm exists at all — a bare `void write()` would strand the optimistic UI", () => {
    expect(emitted).toMatch(
      /setProjectSupervisorEnabled\([\s\S]{0,120}?\.catch\(/,
    );
  });

  it("passes the supervisor ref to useSupervisor as the third per-turn condition", () => {
    // Without this line the toggle persists, renders and flips — and changes nothing.
    expect(emitted).toMatch(/supervisorEnabledRef,/);
  });

  it("reads the stored value on workspace reveal", () => {
    expect(emitted).toMatch(
      /getProjectSupervisorEnabled\(workspace\.project_path\)/,
    );
  });

  // M14 WP0 Phase 3 (D-5) verify-codify — added after a SURVIVING MUTANT, not as confirmation.
  //
  // ⚠️ THE HOLE THIS CLOSES, measured: making the marker's conditional read the raw watermark
  // (`supervisorReadout.suppressed || unsentInput`) instead of the gated derivation left the
  // ENTIRE SUITE GREEN at 2709 — including a purpose-built jsdom render test written minutes
  // earlier in this same verify-codify. That render test cannot see it: under a closed gate
  // `workspaceSupervisorReadout` returns null, so the whole badge subtree — mutated line and
  // all — is never evaluated. And `useWorkflowFeaturesEnabled` seeds asynchronously, so server
  // rendering can only ever reach the gate-OFF shape. The one arm where the mutant bites is the
  // one arm a render test cannot reach.
  //
  // ⚠️ So this is NOT a weaker substitute for a behavioral test that was available — it is the
  // only mechanism that reaches this property at all, which is the documented reason the
  // `?raw`-guard idiom exists here rather than being lint-bait. The behavioral half was closed
  // LIVE instead: MCP-bridge verify-self drove type→marker-appears / Esc→marker-disappears with
  // a positive control, and the operator confirmed it hands-on at verify-human.
  it("⚠️ the SUPPRESSED marker renders off the DERIVATION, never off the raw watermark", () => {
    // The conditional must name the derivation. A mutant that ORs in the component's own
    // `unsentInput` state bypasses the gate and the toggle at once: it would paint a ⏸ on a
    // workspace whose supervisor is OFF, and on one whose gate is closed entirely.
    expect(
      emitted,
      "the marker's conditional must be `supervisorReadout.suppressed &&` — if this fails, the " +
        "render site is deriving suppression itself rather than reading the gated, " +
        "mutation-proven derivation, and the OFF invariant no longer holds at this element",
    ).toMatch(/\{supervisorReadout\.suppressed && \(/);

    // ⚠️ And the marker's JSX must not reference the raw watermark state AT ALL. Asserted as a
    // separate negative because the positive above still passes if someone ORs a second term in
    // (`supervisorReadout.suppressed || unsentInput`) — which is the exact surviving mutant.
    const markerJsx = emitted.slice(
      emitted.indexOf("{supervisorReadout.suppressed"),
      emitted.indexOf("workspace-header-supervisor-suppressed") + 400,
    );
    expect(
      markerJsx,
      "the marker's JSX names the component's raw `unsentInput` state — that is the surviving " +
        "mutant this guard exists to kill",
    ).not.toMatch(/\bunsentInput\b/);
  });

  it("the marker guard above is not vacuous — it found its anchor", () => {
    // ⚠️ `String.slice` on a missing needle silently yields a window starting at -1, so the
    // negative assertion above would pass over near-empty text if the anchor ever moved. Pin
    // that both anchors are actually present and ordered.
    const condAt = emitted.indexOf("{supervisorReadout.suppressed");
    const classAt = emitted.indexOf("workspace-header-supervisor-suppressed");
    expect(
      condAt,
      "the marker's conditional anchor is missing",
    ).toBeGreaterThan(-1);
    expect(classAt, "the marker's class anchor is missing").toBeGreaterThan(
      condAt,
    );
  });
});

describe("the guard is not vacuous", () => {
  it("actually read both files", () => {
    expect(css.length).toBeGreaterThan(1000);
    expect(emitted.length).toBeGreaterThan(1000);
    // Sanity: the strip did not eat the source.
    expect(emitted).toContain("workspace-header");
  });
});

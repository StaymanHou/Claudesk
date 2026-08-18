import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { hasBaseRule } from "../../../test-support/cssRule";

// ── The CSS↔component contract, for MODIFIER selectors ──────────────────────────────────────
//
// `SURFACE-2026-08-10-NO-GUARD-COUPLES-A-CSS-CLASS-TO-ITS-EMITTING-COMPONENT`: every CSS guard
// in this repo reads exactly ONE side of the contract, so a class can be styled-but-never-emitted
// (dead CSS still carrying real behavior) or emitted-but-never-styled (the M10.9 WP3.5a
// eleven-undefined-classes CRITICAL) with both sides individually green.
//
// ⚠️ SCOPE — this covers `.block.is-*` / `.block.has-*` MODIFIER selectors only, and that scope
// is a measurement rather than a guess. `App.css` is ~4100 lines with 298 top-level class
// blocks, but only **13** modifier selectors — and modifiers are the ones carrying behavior
// (a base class is visible on screen the moment it is wrong; a modifier fires only mid-
// interaction, which is exactly why the `is-editing` regression shipped). The full 298-class
// bidirectional check remains open, deliberately: see the backlog entry, which this test
// narrows rather than closes.
//
// ⚠️ THE HARD PART IS DEFINING "EMITTED", and a hand audit got it wrong first.
// `.diff-line.is-add` and `.diff-line.is-remove` look like orphans to any literal search:
// `HunkView.tsx` emits them as `` `diff-line is-${line.origin}` ``, so the strings `is-add` and
// `is-remove` appear NOWHERE in the source. A guard that flagged them would be reporting a false
// positive on correct code — the failure mode that gets a guard deleted. So an interpolated
// modifier is recognized by its template shape and checked against the union type that feeds it.

const SRC = fileURLToPath(new URL("../../../", import.meta.url));

function sourceFiles(dir = SRC, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) {
      if (entry !== "__tests__") sourceFiles(p, out);
    } else if (/\.tsx?$/.test(entry)) {
      out.push(p);
    }
  }
  return out;
}

function stripComments(src: string): string {
  return src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

const css = readFileSync(join(SRC, "App.css"), "utf8");
const componentSource = sourceFiles()
  .map((f) => stripComments(readFileSync(f, "utf8")))
  .join("\n");

/** Every `.block.is-x` / `.block.has-x` selector defined in the stylesheet. */
function modifierSelectors(): Array<{ base: string; modifier: string }> {
  const found = new Map<string, { base: string; modifier: string }>();
  for (const m of css.matchAll(/^\.([a-z0-9-]+)\.((?:is|has)-[a-z0-9-]+)/gm)) {
    found.set(`${m[1]}.${m[2]}`, { base: m[1], modifier: m[2] });
  }
  return [...found.values()].sort((a, b) =>
    `${a.base}${a.modifier}`.localeCompare(`${b.base}${b.modifier}`),
  );
}

/**
 * Is `modifier` emitted for `base` anywhere in the component tree?
 *
 * Two shapes count, and the second is why a literal search is not enough:
 *   1. the literal (`"is-active"`, `` `panel-tab ${x ? "is-active" : ""}` ``)
 *   2. an INTERPOLATED suffix — `` `diff-line is-${line.origin}` `` — where the modifier is
 *      composed at runtime from a union type, so the full class name never appears in source.
 */
function isEmitted(base: string, modifier: string): boolean {
  // ⚠️ BOUNDARY match, not `includes(modifier)`. A plain substring test is satisfied by any
  // LONGER modifier sharing the stem — measured: renaming the emitted `is-editing` to
  // `is-editingRENAMED` (i.e. no longer emitting `is-editing` at all) left this audit green,
  // because the renamed string still contains the original. That is the same prefix-shadowing
  // hole `hasRule` exists to avoid on the CSS side, reproduced on the component side.
  // A class name may be followed only by a non-name character: a quote, backtick, space,
  // `$`, `{`, etc. — never a letter, digit, or `-`.
  const escaped = modifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (new RegExp(`${escaped}(?![\\w-])`).test(componentSource)) return true;
  // Interpolated: `<base> is-${…}` / `<base> has-${…}` in a template literal.
  const prefix = modifier.startsWith("is-") ? "is-" : "has-";
  const interpolated = new RegExp(
    `${base}[^\`]*\\b${prefix}\\$\\{`,
    // Template literals may span lines.
    "s",
  );
  return interpolated.test(componentSource);
}

describe("every CSS modifier selector is actually emitted by a component", () => {
  it("finds a non-trivial set of modifier selectors (anti-vacuity)", () => {
    // If the selector scan broke to [], every assertion below would pass having checked
    // nothing — the emptiness trap this repo's guards keep tripping.
    expect(modifierSelectors().length).toBeGreaterThanOrEqual(10);
  });

  it.each(modifierSelectors())(
    "$base.$modifier is emitted",
    ({ base, modifier }) => {
      expect(
        isEmitted(base, modifier),
        `App.css styles .${base}.${modifier} but no component emits it. A styled-but-never-` +
          `emitted modifier is dead CSS that still reads as a live style hook — the exact shape ` +
          `of the .picker-recent-model.is-editing regression (a <button>→<div> conversion ` +
          `orphaned the rule, and the input rendered with the wrong padding). Either emit it or ` +
          `delete the rule.`,
      ).toBe(true);
    },
  );

  it("the interpolated shape is recognized (the false-positive guard)", () => {
    // `.diff-line.is-add` is emitted ONLY as `` `diff-line is-${line.origin}` ``, so a literal
    // search finds nothing. Pinned explicitly: if `isEmitted` is ever "simplified" to a plain
    // substring test, this fails instead of the audit above turning red on correct code.
    expect(componentSource).not.toContain("is-add");
    expect(isEmitted("diff-line", "is-add")).toBe(true);
    expect(isEmitted("diff-line", "is-remove")).toBe(true);
  });

  it("a modifier that is genuinely absent IS flagged (the guard bites)", () => {
    // The negative control. Without it, `isEmitted` broken to always-true would leave every
    // assertion above green — a vacuous audit that reads as coverage.
    expect(isEmitted("picker-recent-model", "is-nonexistent-modifier")).toBe(
      false,
    );
  });

  it("each styled base class exists as a rule (the inverse direction, spot-checked)", () => {
    // The other half of the contract for this set: the base each modifier qualifies must
    // itself be styled, or the modifier is qualifying nothing.
    // ⚠️ `hasBaseRule`, not `hasRule` (paydown WP5) — the sharpest case of the four. "The base
    // each modifier qualifies must itself be styled" is EXACTLY the base-rule question, and
    // `hasRule` here can be satisfied by a SIBLING MODIFIER of the very base being checked.
    //
    // ⚠️ **The stronger question found one real exemption, and it is an exemption rather than a
    // defect.** `.file-tree-file` has no base rule and does not need one: `FileTree.tsx` always
    // emits it as `"file-tree-row file-tree-file"`, so `.file-tree-row` carries the styling and
    // this class exists purely as a semantic hook for `.is-active`. Listed explicitly — with the
    // co-emitted class that styles it — rather than weakening the assertion, so a base class that
    // is genuinely unstyled still fails.
    const STYLED_BY_A_CO_EMITTED_CLASS: Record<string, string> = {
      "file-tree-file": "file-tree-row",
    };
    for (const { base } of modifierSelectors()) {
      const via = STYLED_BY_A_CO_EMITTED_CLASS[base];
      if (via !== undefined) {
        // The exemption is only valid while the class that styles it still has a base rule —
        // otherwise both are unstyled and the exemption hides it.
        expect(
          hasBaseRule(css, via),
          `.${base} is exempt because .${via} styles it, but .${via} has no base rule either`,
        ).toBe(true);
        continue;
      }
      expect(
        hasBaseRule(css, base),
        `.${base} has no BASE rule of its own — a modifier alone qualifies nothing`,
      ).toBe(true);
    }
  });
});

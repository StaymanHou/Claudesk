import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

// M12 WP3 Phase 3, verify-codify (2026-08-05) — the ⏵ gutter's STRUCTURE, asserted on a
// parsed DOM rather than on source text.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⚠️ WHAT THIS FILE DELIBERATELY DOES NOT TEST, AND WHY — READ BEFORE ADDING A CASE
//
// The defect this phase fixed (P3.9) was GEOMETRIC: `.picker-recent-text` is
// `flex: 1 1 auto`, so on a row with no prediction it ABSORBED the conditionally-rendered
// gutter's width — 369px of text stack without a badge vs 331px with one, which made a
// 37-char project name truncate while a LONGER 35-char name on the adjacent row rendered
// in full.
//
// **That property cannot be tested here, and a test claiming to is worse than no test.**
// jsdom has no layout engine. Measured, not assumed (2026-08-05):
//
//     <div style="display:flex;width:400px">
//       <span style="flex:1 1 auto"/><span style="flex:0 0 30px"/>
//     </div>
//     → getBoundingClientRect().width === 0 for BOTH children, and for the row.
//
// So `expect(stackA.width).toBe(stackB.width)` would pass as `0 === 0` — on the FIXED code
// and on the BROKEN code alike. That is the vacuous-guard failure mode this repo has paid
// for repeatedly (`[[guard-predicate-completeness-vs-mutation-landing]]`): a passing check
// with an under-determined predicate is not evidence.
//
// The geometric property's real proof is the live MCP-bridge measurement recorded in the
// WIP's build log — distinct stack widths 2 → 1, all rows 329px — plus the mutation-proven
// CSS/JSX guards in `announceRow.test.ts`. This file covers the one arm those miss: that
// the gutter is a REAL SIBLING of the text stack and always present, checked on a parsed
// tree instead of by matching source characters.
//
// Repo posture, same as `stickyHeaderStacking.test.ts`: structure → vitest, live layout →
// the bridge + verify-human.

const html = (row: string): Document =>
  new JSDOM(`<!doctype html><html><body>${row}</body></html>`).window.document;

/**
 * The row's shipped structure, transcribed from `ProjectPicker.tsx`'s `case "open"`.
 *
 * ⚠️ A transcription, and that limit is real: this is a REPLICA, so it cannot catch the
 * component diverging from it (`[[extract-for-import-when-a-raw-guard-cant-express-the-property]]`
 * warns that a test re-implementing the code shares its blind spot). What guards the
 * divergence is `announceRow.test.ts`'s source guard on the real file — which
 * mutation-testing showed fails when the conditional is hoisted back out. The two are
 * complementary: that one pins the source, this one pins what the shape MEANS.
 */
const row = (opts: { announcing: boolean }): string => `
<button type="button" class="picker-recent" data-testid="picker-recent">
  <span class="picker-recent-text">
    <span class="picker-recent-headline">
      <span class="picker-recent-name">proj</span>
      ${opts.announcing ? '<span class="picker-recent-announce">↻ continue</span>' : ""}
    </span>
    <span class="picker-recent-path">/Users/x/proj</span>
  </span>
  <span class="picker-recent-gutter"${opts.announcing ? "" : ' aria-hidden="true"'}>
    ${opts.announcing ? '<span role="button" tabindex="0" class="picker-recent-nofire">⏵</span>' : ""}
  </span>
</button>`;

describe("the ⏵ gutter's structure (parsed DOM, not source text)", () => {
  it("the gutter exists on an announcing row AND on a silent one", () => {
    // THE P3.9 INVARIANT, stated structurally: presence is unconditional. If someone
    // hoists the conditional back out, the silent row loses the element entirely and the
    // text stack re-absorbs its width.
    for (const announcing of [true, false]) {
      const doc = html(row({ announcing }));
      expect(
        doc.querySelectorAll(".picker-recent-gutter").length,
        `gutter missing for announcing=${announcing}`,
      ).toBe(1);
    }
  });

  it("the CONTROL exists only on an announcing row", () => {
    // The other half of the pairing: the box is unconditional, the control is not. With no
    // prediction both doors are identical, so a control there would provably do nothing.
    expect(
      html(row({ announcing: true })).querySelectorAll(".picker-recent-nofire")
        .length,
    ).toBe(1);
    expect(
      html(row({ announcing: false })).querySelectorAll(".picker-recent-nofire")
        .length,
    ).toBe(0);
  });

  it("the gutter is a SIBLING of the text stack, not inside it", () => {
    // Nesting the gutter inside `.picker-recent-text` would put it back inside the flexing
    // region and reintroduce the width competition from the other direction.
    const doc = html(row({ announcing: true }));
    const gutter = doc.querySelector(".picker-recent-gutter");
    const stack = doc.querySelector(".picker-recent-text");
    expect(gutter?.parentElement?.className).toBe("picker-recent");
    expect(stack?.contains(gutter as Node)).toBe(false);
    expect(gutter?.previousElementSibling).toBe(stack);
  });

  it("the control is nested INSIDE the gutter, which is inside the open button", () => {
    // The operator's spec: the title box auto-fires, with the no-fire escape hatch inside
    // it. `closest("button")` must be the open button — that is the containment the spec
    // asks for, and it is what makes `stopPropagation` necessary rather than optional.
    const doc = html(row({ announcing: true }));
    const control = doc.querySelector(".picker-recent-nofire");
    expect(control?.parentElement?.className).toBe("picker-recent-gutter");
    expect(control?.closest("button")?.className).toBe("picker-recent");
  });

  it("there is exactly ONE <button> in the row — the control is never a nested button", () => {
    // ⚠️ `pickerRowOrder.ts`'s documented trap. A <button> inside a <button> is invalid
    // HTML whose failure mode is SILENT: the inner control's clicks surface on the outer
    // handler, so it looks like the control does the WRONG thing rather than like it is
    // broken. Asserted on the parsed tree, where a nested button is unambiguous — a source
    // grep can only count the spellings you thought of.
    for (const announcing of [true, false]) {
      const doc = html(row({ announcing }));
      expect(doc.querySelectorAll("button").length).toBe(1);
      const control = doc.querySelector(".picker-recent-nofire");
      if (control) {
        expect(control.tagName).toBe("SPAN");
        expect(control.getAttribute("role")).toBe("button");
        expect(control.querySelectorAll("button").length).toBe(0);
      }
    }
  });

  it("an EMPTY gutter is aria-hidden; a populated one is not", () => {
    // A reserved spacing box is not content. Announcing it would add a meaningless node to
    // every non-announcing row.
    expect(
      html(row({ announcing: false }))
        .querySelector(".picker-recent-gutter")
        ?.getAttribute("aria-hidden"),
    ).toBe("true");
    expect(
      html(row({ announcing: true }))
        .querySelector(".picker-recent-gutter")
        ?.hasAttribute("aria-hidden"),
    ).toBe(false);
  });

  it("the path is a sibling of the headline, so the badge never shares its line", () => {
    // The badge lives on the NAME's line (operator decision) — measured, because on the
    // path's line it took 140px and halved the path (369→184px). This pins the placement
    // that decision produced.
    const doc = html(row({ announcing: true }));
    const headline = doc.querySelector(".picker-recent-headline");
    const path = doc.querySelector(".picker-recent-path");
    expect(headline?.querySelector(".picker-recent-announce")).not.toBeNull();
    expect(
      path?.contains(doc.querySelector(".picker-recent-announce") as Node),
    ).toBe(false);
    expect(path?.previousElementSibling).toBe(headline);
  });

  it("jsdom cannot resolve flex geometry — the reason no width test lives here", () => {
    // ⚠️ A META-TEST, and it earns its place. It records WHY the geometric property is
    // absent, executably: if a future jsdom gains a layout engine this test FAILS, which is
    // the signal to add the real width assertions rather than to keep trusting this file's
    // header comment. Documenting a limitation in prose lets it go stale silently; asserting
    // it makes the limitation itself falsifiable.
    const doc = html(
      `<div id="r" style="display:flex;width:400px">
         <span id="a" style="flex:1 1 auto"></span>
         <span id="b" style="flex:0 0 30px"></span>
       </div>`,
    );
    const w = (id: string) =>
      doc.getElementById(id)!.getBoundingClientRect().width;
    expect(
      [w("r"), w("a"), w("b")],
      "jsdom resolved a flex width — it may now support the P3.9 geometry assertions " +
        "that were deliberately omitted from this file; see the header comment",
    ).toEqual([0, 0, 0]);
  });
});

describe("the CSS the structure depends on (read from disk, never ?raw)", () => {
  // ⚠️ `.css?raw` resolves to processed output (or an empty string) under Vitest — Vite
  // routes CSS through its style pipeline, not the raw-text loader
  // (`[[vitest-raw-import-css-returns-processed-not-text]]`). Read straight off disk.
  const rawCss = readFileSync(
    fileURLToPath(new URL("../../../App.css", import.meta.url)),
    "utf8",
  );

  // ⚠️ COMMENTS STRIPPED BEFORE ANY MATCHING, AND THIS WAS A REAL BUG IN THIS FILE.
  //
  // Caught by mutation testing during verify-codify: the first version matched
  // `/flex:\s*1\s+1\s+auto/` against the RAW `.picker-recent-text` block. That block
  // contains the string `flex: 1 1 auto` TWICE — once as the declaration, once inside the
  // comment explaining why the declaration exists. Changing the DECLARATION to
  // `flex: 0 0 auto` (the defect's mechanism) left the suite at 11/11 GREEN, because the
  // regex still matched the comment.
  //
  // So the guard passed exactly when the code it names had been removed — precisely
  // `[[raw-guard-identifier-satisfied-by-own-comments]]`. A well-commented CSS block is
  // MORE likely to hit this, not less: the better the comment quotes the property, the more
  // reliably it satisfies the assertion on the property's behalf.
  const css = rawCss.replace(/\/\*[\s\S]*?\*\//g, "");

  /** A rule's body with comments already gone. Anchored on `selector + " {"` so a
   *  prefix-sibling (`.picker-recent` vs `.picker-recent-text`) cannot match. */
  const ruleBody = (selector: string): string => {
    const i = css.indexOf(selector + " {");
    expect(i, `rule "${selector}" not found in App.css`).toBeGreaterThanOrEqual(
      0,
    );
    return css.slice(i, css.indexOf("}", i));
  };

  it("the CSS is readable AND comment-stripping did not empty it (non-vacuity)", () => {
    // Two failure modes, both of which would make every assertion below pass trivially: an
    // empty read, and a comment-stripping regex that over-matched and ate the whole file.
    expect(rawCss.length).toBeGreaterThan(10_000);
    expect(css.length).toBeGreaterThan(5_000);
    expect(css).toContain(".picker-recent-gutter");
  });

  it("comment-stripping actually removes prose (meta-guard)", () => {
    // Proves the mechanism above is live rather than a no-op. If the strip regex breaks,
    // this fails here instead of silently re-opening the hole it was added to close.
    expect(rawCss).toContain("/*");
    expect(css).not.toContain("/*");
    // And specifically: the phrase that satisfied the old assertion on the code's behalf is
    // gone from the haystack the assertions actually read.
    expect(ruleBody(".picker-recent-text")).not.toContain("the P3.9 defect");
  });

  it("the row is a flex row, or the reserved gutter reserves nothing", () => {
    const block = ruleBody(".picker-recent");
    expect(block).toContain("display: flex");
    expect(block).toContain("flex-direction: row");
  });

  it("the text stack flexes, which is WHY the gutter must be unconditional", () => {
    // The mechanism of the original defect, pinned so its removal is visible: a stack that
    // flexes absorbs whatever its sibling does not occupy. Mutation-proven — changing this
    // declaration now fails, which it did NOT before comments were stripped.
    expect(ruleBody(".picker-recent-text")).toMatch(/flex:\s*1\s+1\s+auto/);
  });
});

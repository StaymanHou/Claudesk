import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import panelSrc from "../SettingsPanel.tsx?raw";

// M10.9 WP3 Phase 4 — the routed-to-group highlight: three discrete blinks (operator,
// 2026-07-29, replacing a single 1.6s fade that read as an ambient glow rather than a cue).
//
// ## What this file exists to prevent
// The blink duration lives in TWO places that must agree: `HIGHLIGHT_MS` in SettingsPanel.tsx
// (when React removes the class) and the `settings-group-flash` keyframe duration in App.css
// (how long the animation runs). Nothing else couples them, and a mismatch degrades silently:
//   - timer LONGER than the animation → the class lingers after the blinks finish, leaving the
//     group inertly styled;
//   - timer SHORTER → React yanks the class mid-blink and the cue truncates.
// Neither throws, neither fails a type check, and both look "fine" in a static screenshot.
//
// CSS is read via `node:fs`, NOT `?raw` — per memory
// `[[vitest-raw-import-css-returns-processed-not-text]]`, Vite's CSS plugin intercepts `?raw`
// on .css files and returns processed output rather than the file text.

const css = readFileSync(
  fileURLToPath(new URL("../../../App.css", import.meta.url)),
  "utf8",
);

/** The `.settings-group-highlight { … }` rule body. */
function highlightRule(): string {
  const start = css.indexOf(".settings-group-highlight {");
  expect(start).toBeGreaterThan(-1);
  return css.slice(start, css.indexOf("}", start));
}

/** The `@keyframes settings-group-flash { … }` block (to its closing brace). */
function keyframesBlock(): string {
  const start = css.indexOf("@keyframes settings-group-flash");
  expect(start).toBeGreaterThan(-1);
  // Keyframes nest one level, so walk to the matching brace rather than the first one.
  let depth = 0;
  for (let i = css.indexOf("{", start); i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}") {
      depth--;
      if (depth === 0) return css.slice(start, i + 1);
    }
  }
  throw new Error("unterminated @keyframes settings-group-flash");
}

describe("the highlight blinks three times", () => {
  it("has three distinct peaks in the keyframes", () => {
    // The operator asked for 3 blinks, not one fade. Count the tinted stops: each peak sets a
    // non-transparent background, and there must be exactly three.
    const block = keyframesBlock();
    const peaks = block.match(/background-color:\s*rgba\(120,\s*165,\s*240/g) ?? [];
    expect(peaks).toHaveLength(3);
  });

  it("returns to transparent between blinks and at the end", () => {
    // Without the troughs, three "peaks" would be one continuous tint. Without the final
    // transparent stop, the animation would snap off instead of resolving.
    const block = keyframesBlock();
    const troughs = block.match(/background-color:\s*transparent/g) ?? [];
    expect(troughs.length).toBeGreaterThanOrEqual(4); // 0%, between×2, 100%
    expect(block).toMatch(/100%\s*\{\s*background-color:\s*transparent/);
  });

  it("completes in ~1.2s, matching the operator's 1-1.5s ask", () => {
    expect(highlightRule()).toContain("animation: settings-group-flash 1.2s");
  });

  it("LOAD-BEARING — HIGHLIGHT_MS matches the CSS animation duration exactly", () => {
    // The cross-file coupling this file exists for. Parse BOTH sides and compare as numbers
    // rather than asserting two literals independently — that would pass if someone changed
    // one and updated only the test's other assertion.
    const tsMatch = panelSrc.match(/const HIGHLIGHT_MS = (\d+);/);
    expect(tsMatch).not.toBeNull();
    const tsMs = Number(tsMatch![1]);

    const cssMatch = highlightRule().match(
      /animation:\s*settings-group-flash\s*([\d.]+)s/,
    );
    expect(cssMatch).not.toBeNull();
    const cssMs = Math.round(Number(cssMatch![1]) * 1000);

    expect(tsMs).toBe(cssMs);
  });

  it("respects prefers-reduced-motion with a STATIC tint, not by dropping the cue", () => {
    // Removing the highlight entirely under reduced-motion would be an accessibility
    // regression dressed as compliance: the user still needs to know which group they were
    // routed to. The media block must kill the animation AND keep a visible background.
    const at = css.indexOf("@media (prefers-reduced-motion: reduce)");
    expect(at).toBeGreaterThan(-1);
    const block = css.slice(at, at + 400);
    expect(block).toContain(".settings-group-highlight");
    expect(block).toContain("animation: none");
    expect(block).toContain("background-color: rgba(120, 165, 240");
  });
});

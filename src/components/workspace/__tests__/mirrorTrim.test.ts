import { describe, it, expect } from "vitest";
import { trimTrailingBlankRows } from "../mirrorTrim";

// Mirror fill-from-bottom (SURFACE-2026-06-25-FILMSTRIP-MIRROR-BANNER-OCCLUDED-AT-SESSION-START).
//
// trimTrailingBlankRows drops TRAILING blank rows from a serializeAsHTML() block so a sparse
// fresh session's real content bottom-anchors at the tile edge (clear of the header overlay)
// instead of being pushed up under it. These cases pin the contract: trailing-blank trimmed,
// fully-populated unchanged, all-blank safe, whitespace-forms recognized, interior blanks kept.
//
// The fixtures mirror @xterm/addon-serialize's HTMLSerializeHandler output structure:
//   <html><body><!--StartFragment--><pre><div style='...'>ROWS</div></pre><!--EndFragment--></body></html>
// where each ROW is exactly one `<div><span>…</span></div>` and a blank cell is a literal space.

const PREFIX =
  "<html><body><!--StartFragment--><pre>" +
  "<div style='color: #d4d4d4; background-color: #1e1e1e; font-family: monospace; font-size: 11px;'>";
const SUFFIX = "</div></pre><!--EndFragment--></body></html>";

/** A content row with the given text. */
const row = (text: string) => `<div><span>${text}</span></div>`;
/** A blank row: spaces only (how serializeAsHTML renders an empty line). */
const blankRow = (n = 10) => `<div><span>${" ".repeat(n)}</span></div>`;

const wrap = (rows: string[]) => PREFIX + rows.join("") + SUFFIX;

describe("trimTrailingBlankRows", () => {
  it("drops trailing blank rows, keeping only content rows (last emitted row is non-blank)", () => {
    const html = wrap([row("$ claude"), row("Welcome"), blankRow(), blankRow(), blankRow()]);
    const out = trimTrailingBlankRows(html);
    // The three trailing blanks are gone; the two content rows remain in order.
    expect(out).toBe(wrap([row("$ claude"), row("Welcome")]));
    // The last row element in the output is the last content row, not a blank.
    const rows = out.match(/<div>[\s\S]*?<\/div>/g)!;
    expect(rows).toHaveLength(2);
    expect(rows[rows.length - 1]).toContain("Welcome");
  });

  it("returns a fully-populated block (no trailing blanks) unchanged", () => {
    const html = wrap([row("line one"), row("line two"), row("line three")]);
    expect(trimTrailingBlankRows(html)).toBe(html);
  });

  it("does not throw and collapses an all-blank block to no rows (returns original — nothing to occlude)", () => {
    // All rows blank = a fresh terminal before any output. There's no content to bottom-
    // anchor, so returning the original (empty-looking) block is fine — the contract is only
    // 'don't blank a block that HAS content'. Must not throw.
    const html = wrap([blankRow(), blankRow(), blankRow()]);
    expect(() => trimTrailingBlankRows(html)).not.toThrow();
    // Every row is blank → nothing kept differs from 'all trailing trimmed'; we return the
    // input unchanged (end === rows.length short-circuit) rather than emitting an empty block.
    expect(trimTrailingBlankRows(html)).toBe(html);
  });

  it("recognizes whitespace-only trailing rows in several forms (spaces, &nbsp;, empty span, <br>)", () => {
    const spaceRow = "<div><span>   </span></div>";
    const nbspRow = "<div><span>&nbsp;&nbsp;</span></div>";
    const emptySpanRow = "<div><span></span></div>";
    const brRow = "<div><span><br></span></div>";
    const html = wrap([row("real"), spaceRow, nbspRow, emptySpanRow, brRow]);
    expect(trimTrailingBlankRows(html)).toBe(wrap([row("real")]));
  });

  it("preserves interior blank rows (a blank line BETWEEN content is real content)", () => {
    const html = wrap([row("top"), blankRow(), row("bottom"), blankRow(), blankRow()]);
    // Only the two TRAILING blanks are trimmed; the interior blank between top/bottom stays.
    expect(trimTrailingBlankRows(html)).toBe(
      wrap([row("top"), blankRow(), row("bottom")]),
    );
  });

  it("returns malformed / unstructured input unchanged (never throws, degrades to pre-fix)", () => {
    expect(trimTrailingBlankRows("")).toBe("");
    expect(trimTrailingBlankRows("not html at all")).toBe("not html at all");
    // Missing the styled row-region wrapper → structure unrecognized → returned verbatim.
    const noWrapper = "<pre><div><span>x</span></div></pre>";
    expect(trimTrailingBlankRows(noWrapper)).toBe(noWrapper);
  });
});

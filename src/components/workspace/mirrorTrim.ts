// Mirror fill-from-bottom — trim trailing blank rows from a serializeAsHTML() block.
//
// WHY (SURFACE-2026-06-25-FILMSTRIP-MIRROR-BANNER-OCCLUDED-AT-SESSION-START): the
// filmstrip + PiP live mirrors render `serializeAsHTML({ scrollback: 40 })` scaled down
// and BOTTOM-anchored (`.filmstrip-tile-mirror` / `.pip-tile-mirror`: bottom:0 +
// transform-origin:bottom-left). But serializeAsHTML emits the FULL active screen (~40
// rows) even for a fresh session with only ~10–20 rows of real content — the trailing
// rows are blank. Bottom-anchoring a block whose LAST rows are blank pushes the real (top)
// content up to the tile's top edge, under the header overlay → the CC banner is occluded
// at session start. Trimming the trailing blank rows makes the block END at its last real
// row, so the existing bottom-anchor then places real content at the tile bottom (fill
// from the bottom first), and once output overflows the tile it tails normally — unchanged.
//
// This is the SHARED seam: it wraps the ONE serializeAsHTML() call (the serializer thunk in
// XtermPane.tsx), which feeds the shared mirrorFrame → both the filmstrip (readMirrorFrame)
// AND the PiP (pip-mirror emit). One trim covers both surfaces.
//
// Pure string→string (no DOM / no xterm import) so it's vitest-pinnable, matching the repo
// posture (mirrorTail.test.ts already treats the serialized HTML as text). We rely on the
// serializeAsHTML output structure (verified against @xterm/addon-serialize's
// HTMLSerializeHandler):
//   <html><body><!--StartFragment--><pre><div style='...'>ROWS</div></pre><!--EndFragment--></body></html>
// where each ROW is exactly one `<div><span>…</span></div>` (`_rowEnd`), and a BLANK cell
// emits a literal space (`_nextCell`), so a blank row's text is whitespace-only.
//
// CONTRACT: drop TRAILING blank rows only; interior blank rows (a blank line BETWEEN real
// content) are preserved. Never throws — if the expected structure isn't found (a future
// xterm markup change, or empty input) the input is returned UNCHANGED, so the mirror
// degrades to the pre-fix behavior rather than blanking.

// One serialized row: `<div>…</div>`. Non-greedy body; `[\s\S]` so it spans the inner
// `<span>`s (which never themselves contain a nested row `<div>` — spans hold text only).
const ROW_RE = /<div>[\s\S]*?<\/div>/g;

// The styled outer wrapper `<div style='…'>` that OPENS the row region (emitted by
// _beforeSerialize). It carries a `style='…'` attribute, so it never matches ROW_RE
// (which is the bare `<div>` the per-row _rowEnd emits) — the split below keys on it.
const ROW_REGION_OPEN_RE = /<div style='[^']*'>/;

/** A row is blank when its visible text (tags stripped) is empty or whitespace-only. */
function isBlankRow(rowHtml: string): boolean {
  // Strip tags, decode the two entities serializeAsHTML emits (`&amp;` `&lt;`), and the
  // no-break space just in case a future path emits one; whitespace-only → blank.
  const text = rowHtml
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&nbsp;/g, " ");
  return text.trim() === "";
}

/**
 * Return `html` with its TRAILING blank rows removed. Interior blank rows are kept. On any
 * structural surprise (no styled row-region wrapper, no rows) the input is returned
 * unchanged — never throws, never blanks the mirror.
 */
export function trimTrailingBlankRows(html: string): string {
  if (!html) return html;

  // Split at the styled row-region opener so we keep the exact prefix
  // (`<html>…<pre><div style='…'>`) and suffix (`</div></pre>…</html>`) verbatim — we only
  // touch the rows BETWEEN them. If the opener isn't present, the structure isn't what we
  // expect; leave it alone.
  const openMatch = html.match(ROW_REGION_OPEN_RE);
  if (!openMatch || openMatch.index === undefined) return html;

  const regionStart = openMatch.index + openMatch[0].length;
  // The row region ends at the wrapper close `</div></pre>`; the trailing `</div>` before
  // `</pre>` is the styled wrapper's own close, NOT a row.
  const closeIdx = html.lastIndexOf("</div></pre>");
  if (closeIdx === -1 || closeIdx < regionStart) return html;

  const prefix = html.slice(0, regionStart);
  const rowsBlock = html.slice(regionStart, closeIdx);
  const suffix = html.slice(closeIdx); // begins with `</div></pre>…`

  const rows = rowsBlock.match(ROW_RE);
  if (!rows || rows.length === 0) return html; // no per-row divs found → leave unchanged

  // Drop trailing blank rows; stop at the first (from the end) non-blank row.
  let end = rows.length;
  while (end > 0 && isBlankRow(rows[end - 1])) end--;

  // Nothing to trim (last row is already content) → return the original verbatim.
  if (end === rows.length) return html;
  // All rows blank (a fresh terminal before any output) → there's no content to bottom-
  // anchor, so trimming buys nothing and an empty block is a needless structural change.
  // Leave it unchanged; a blank block renders blank either way — the contract is only
  // 'don't push CONTENT under the header', and here there is none.
  if (end === 0) return html;

  return prefix + rows.slice(0, end).join("") + suffix;
}

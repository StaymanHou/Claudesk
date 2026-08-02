// M11 WP3 — pure frontmatter split for the Docs render path.
//
// ── Why this exists at all ──────────────────────────────────────────────────────
// WP1 measured that BOTH candidate renderers mangle a leading YAML block identically:
// the opening `---` becomes an `<hr>`, and the closing `---` turns the YAML lines above
// it into a setext `<h2>`. So a doc that opens with frontmatter renders with a rule and a
// giant heading made of `shape: runtime-registry`-style keys — worse than useless on a
// re-orientation surface, where the frontmatter often carries the `updated:` date and the
// `drive_mode:` a reader is looking for.
//
// The fix is renderer-agnostic and deliberately NOT a plugin: split the block off before
// the renderer ever sees it, then render it ourselves as a styled header. `remark-frontmatter`
// was considered and rejected at WP1 — it correctly CONSUMES the fence but emits nothing,
// which leaves the panel without the YAML it exists to show.
//
// Kept pure (no React, no DOM) so it is vitest-testable as a value — the repo posture of
// pure logic → vitest, live DOM → the MCP bridge.

/** A document split into its optional leading YAML block and the markdown body. */
export interface SplitDoc {
  /** The YAML text BETWEEN the fences, fences excluded. `null` when there is none. */
  frontmatter: string | null;
  /** Everything after the closing fence — or the whole input when there is no block. */
  body: string;
}

/**
 * The leading-frontmatter matcher, validated at WP1 against 6 real edge cases.
 *
 * Anchored at `^` so only a block at the very start of the file counts, non-greedy so it
 * stops at the FIRST closing fence, and `\r?\n` throughout so CRLF files match.
 *
 * ⚠️ Each piece is load-bearing; see the tests for the cases that pin them:
 *   - `^` — a `---` appearing later in the body is body content (a thematic break), not
 *     frontmatter. Dropping the anchor would eat an arbitrary mid-document span.
 *   - `[\s\S]*?` non-greedy — a doc with several `---` lines keeps only the first block.
 *   - `(?![\r\n])` — the NON-BLANK FIRST LINE guard, and the subtle one. Without it a
 *     leading THEMATIC BREAK is misread as frontmatter: `---\n\nProse.\n\n---\n` matches,
 *     capturing `\nProse.\n` as "YAML" and deleting a real paragraph from the body. WP1
 *     named this edge case; the obvious pattern does NOT actually handle it (measured
 *     here, not assumed — the first draft of this module failed exactly that test). YAML
 *     frontmatter opens with a `key:` line, never a blank one, so requiring a non-newline
 *     immediately after the opening fence separates the two shapes cleanly.
 */
const FRONTMATTER_RE = /^---\r?\n(?![\r\n])([\s\S]*?)\r?\n---\r?\n?/;

/**
 * Split a leading YAML frontmatter block off a markdown document.
 *
 * Returns `{ frontmatter: null, body: src }` unchanged when there is no leading block —
 * the overwhelmingly common case for non-workflow markdown, and the reason this never
 * throws or reports an error: absence is normal, not a failure.
 *
 * ⚠️ **Known boundary, measured at WP1 and deliberately not handled:** an EMPTY block
 * (`---\n---`) does not match, because the pattern requires a newline-terminated line
 * between the fences. Such a doc falls through to the renderer's mangling path. WP1
 * surveyed 54 frontmatter-bearing docs in this repo's real corpus and **0** had one, so
 * the added branch would be untested-in-practice complexity guarding a case that does not
 * occur. Recorded rather than silently accepted so a future reader knows it was a choice.
 */
export function stripFrontmatter(src: string): SplitDoc {
  const m = FRONTMATTER_RE.exec(src);
  if (m === null) return { frontmatter: null, body: src };
  return { frontmatter: m[1], body: src.slice(m[0].length) };
}

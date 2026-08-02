// M11 WP3 — classify a link in a rendered doc, so the delegated click handler knows what
// to do with it.
//
// Three destinations, three behaviors: an in-doc anchor scrolls the panel, a cross-doc
// relative link switches the selected doc, and an external link opens in the real browser.
// The one thing that must NEVER happen is the webview navigating away — Claudesk's window
// has no back button, so a hijacked webview is an unrecoverable state.
//
// Pure (no DOM, no React) so the ordering is assertable as a value. That matters here more
// than usual: this is a security-adjacent classifier where the failure mode is silent.

/** What a link in a rendered doc points at. */
export type HrefClass =
  /** `#heading` — scroll within the currently-rendered doc. */
  | "anchor"
  /** `wbs.md`, `../product/roadmap.md`, `wbs.md#frag` — switch the selected doc. */
  | "cross-doc"
  /** `https:`, `mailto:`, `//host` — hand to the OS browser, never the webview. */
  | "external"
  /** Empty or whitespace-only — not actionable; the handler should do nothing. */
  | "empty";

/**
 * Classify an `href`, per WP1's measured table.
 *
 * ⚠️ **ORDER IS LOAD-BEARING** and was validated against 8 real link shapes at WP1:
 * `#` first, then any `scheme:`, then `//`, then treat the rest as relative. Reordering
 * these silently misroutes links rather than failing.
 *
 * | href | class |
 * |---|---|
 * | `#heading` | anchor |
 * | `wbs.md`, `workflow-system/product/roadmap.md`, `wbs.md#frag` | cross-doc |
 * | `https://…`, `http://…`, `mailto:…` | external |
 * | `//evil.example.com` | **external** |
 *
 * ⚠️ **The protocol-relative case (`//host`) is why this must NOT be
 * `href.startsWith("http")`.** It is external but carries no scheme, so a naive check
 * classifies it as a relative path and routes it into the local-file loader — which at
 * best 404s and at worst asks the backend to read an attacker-shaped path. WP1 called this
 * out specifically; it is pinned by a test that names the naive predicate.
 *
 * A `javascript:` href also lands in `external` by the scheme rule. That is intentional
 * and safe here: `external` means "hand to `openUrl`, never the webview", and the renderer
 * already strips such hrefs before they reach the DOM (`docsRender.test.tsx`), so this is
 * belt-and-braces rather than the primary control.
 */
export function classifyHref(href: string): HrefClass {
  const raw = href.trim();
  if (raw === "") return "empty";

  // 1. In-doc anchor. First because `#a:b` would otherwise look scheme-ish.
  if (raw.startsWith("#")) return "anchor";

  // 2. Any absolute scheme (`https:`, `mailto:`, `file:`, `javascript:`). Checked before
  //    `//` so `https://x` is matched by its scheme rather than its slashes — same answer
  //    here, but the ordering keeps the rules independent.
  //    RFC 3986: scheme = ALPHA *( ALPHA / DIGIT / "+" / "-" / "." ), and the colon must
  //    precede any `/` or `?` — otherwise `docs/a:b.md` (a legal relative path) reads as a
  //    scheme.
  const colon = raw.indexOf(":");
  if (colon > 0) {
    const beforeColon = raw.slice(0, colon);
    const noPathSeparatorFirst = !/[/?#]/.test(beforeColon);
    if (noPathSeparatorFirst && /^[a-z][a-z0-9+\-.]*$/i.test(beforeColon)) {
      return "external";
    }
  }

  // 3. Protocol-relative — external despite having no scheme. See the warning above.
  if (raw.startsWith("//")) return "external";

  // 4. Everything else is a relative path to another doc in the set.
  return "cross-doc";
}

/**
 * The CSS selector that finds an in-doc anchor target for `href`.
 *
 * `href` is an anchor href as authored (`#probe-outcomes`); the leading `#` is stripped and
 * the remainder escaped.
 *
 * ⚠️ **`CSS.escape` is load-bearing, not decoration.** Heading ids generated from real
 * markdown routinely contain characters that are syntactically meaningful in a selector —
 * a heading like `## 3. The 90% path` yields an id starting with a DIGIT, which is an
 * invalid selector on its own and makes `querySelector` **throw**, taking the whole click
 * handler down rather than merely failing to scroll. Dots, colons and parentheses from
 * heading text do the same. Escaping turns every one of them into a literal match.
 *
 * Extracted from the click handler so this is assertable as a value — the handler itself
 * needs a live DOM, but the selector it builds does not.
 */
export function anchorSelector(href: string): string {
  return `#${CSS.escape(href.replace(/^#/, ""))}`;
}

/**
 * GitHub-style slug for a heading's text — the `id` an in-doc anchor targets.
 *
 * ⚠️ **This exists because `react-markdown` emits NO heading `id`s by default**, which
 * makes every in-doc `#anchor` link a dead click. Found live at Phase 3 verify-self, not by
 * unit tests: `anchorSelector`'s tests proved the SELECTOR was well-formed but never that
 * anything existed to select. Long WBS/WIP docs lean on their tables of contents, so this
 * is the common case, not an edge one.
 *
 * Mirrors GitHub's algorithm, which is what markdown authors write links against:
 * lowercase, strip anything that is not a word character / space / hyphen, then spaces to
 * hyphens. `## Probe outcomes` → `probe-outcomes`; `## 3. The 90% path` → `3-the-90-path`.
 *
 * Deliberately NOT a new dependency (`rehype-slug` would do this): it is six lines, and
 * WP1's verdict makes adding rehype plugins a decision to weigh rather than a reflex.
 */
export function headingSlug(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-");
}

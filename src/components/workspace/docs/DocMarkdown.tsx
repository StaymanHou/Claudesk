// M11 WP3 — the markdown render itself, isolated from the panel's fetch/selection state.
//
// ── Why this is its own component ───────────────────────────────────────────────
// It is a PURE function of `source`: no hooks, no IPC, no state. That makes the render
// output assertable as a VALUE via `renderToStaticMarkup` (from the `react-dom/server`
// that already ships with the installed `react-dom`) — which is how WP3 pins the render
// without adopting a component-render harness and without re-opening
// SURFACE-2026-07-31-NO-REACT-COMPONENT-RENDER-HARNESS. Keeping it separate from
// `DocsPanel` is what preserves that property; folding it back in would couple the
// assertions to the panel's async lifecycle.
//
// ── ⚠️ THE ONE RULE THIS FILE DEPENDS ON: never add `rehype-raw` ────────────────
// The app ships with `"security": { "csp": null }` (tauri.conf.json), so there is NO
// Content-Security-Policy and anything that executes in the webview gets the full
// `__TAURI_INTERNALS__` IPC surface. There is no second line of defense behind this file.
//
// TWO INDEPENDENT CONTROLS, and it is worth knowing they are REDUNDANT rather than
// layered — measured at WP3 verify-self across three configurations, scoring the parsed
// DOM of an 11-section hostile fixture:
//
//   raw + sanitize  → 0 live vectors   (sanitizer catches what raw admits)
//   raw alone       → 6 live vectors   (script, iframe, object, embed, style tag+attr)
//   neither         → 0 live vectors   (react-markdown's default HTML escaping)
//
// So EITHER control alone is sufficient today, and each is load-bearing exactly when the
// other is absent. ⚠️ An earlier version of this comment claimed the default escaping was
// the real guarantee and `rehype-sanitize` was mere defense-in-depth; the middle row shows
// that is backwards once `rehype-raw` is present. Do not reason about one control without
// checking the other — that asymmetry is what makes "0 vectors" easy to misread.
//
// The rule stands regardless: adding `rehype-raw` removes the escaping control and leaves
// the app depending on sanitizer configuration alone, which is the situation WP1 chose this
// renderer specifically to avoid (Option A's recipe needed three individually-necessary
// options plus a hand-written hook, each silent when omitted).
//
// If a future doc genuinely needs inline HTML, that is a decision to RE-OPEN WP1's verdict
// (`workflow-system/product/wbs.md` → "Probe outcomes"), not a plugin to add here. The
// absence of `rehype-raw` is pinned by `docsRenderDeps.test.ts` (both `dependencies` and
// `devDependencies`, each arm mutation-proven), because nothing in the type system can
// enforce it — and NOT by the hostile-fixture test, which passes with raw added so long as
// the sanitizer remains.

import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import { stripFrontmatter } from "./frontmatter";
import { headingSlug } from "./classifyHref";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

/** Flatten a heading's children to plain text, so the slug matches what a reader sees. */
function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (node && typeof node === "object" && "props" in node) {
    return textOf((node as { props: { children?: ReactNode } }).props.children);
  }
  return "";
}

/** Heading renderers that attach a GitHub-style `id`, so in-doc anchors have a target.
 *
 * ⚠️ Without these, `react-markdown` emits headings with NO id and every `#anchor` link in
 * a doc is a dead click — found live at Phase 3 verify-self. Defined at module scope (not
 * inline in the JSX) so the object identity is stable across renders and does not force
 * the renderer to rebuild its component map on every keystroke-driven re-render.
 */
const HEADING_COMPONENTS = Object.fromEntries(
  (["h1", "h2", "h3", "h4", "h5", "h6"] as const).map((tag) => [
    tag,
    ({ children, ...rest }: ComponentPropsWithoutRef<"h1">) => {
      const Tag = tag;
      return (
        <Tag id={headingSlug(textOf(children))} {...rest}>
          {children}
        </Tag>
      );
    },
  ]),
);

interface DocMarkdownProps {
  /** The doc's full raw text, frontmatter included — this component does the split. */
  source: string;
}

/**
 * Render one doc: its YAML frontmatter as a styled header block, then its body as
 * formatted read-only markdown with GFM (tables, task lists, strikethrough).
 *
 * Read-only by construction: no editing affordance, no `contentEditable`, and no write
 * path of any kind. Editing a doc stays in the Editor panel or in CC
 * (`new-surface-must-earn-its-place-against-existing-ones`).
 *
 * The frontmatter is rendered as a `<pre>` rather than parsed into fields on purpose — it
 * is shown so a reader can see `updated:` / `drive_mode:` / `shape:` at a glance, and
 * parsing YAML to re-present it would add a dependency plus a failure mode (a malformed
 * block would render as nothing) to gain formatting nobody asked for.
 */
export function DocMarkdown({ source }: DocMarkdownProps) {
  const { frontmatter, body } = stripFrontmatter(source);

  return (
    <div className="doc-markdown" data-testid="doc-markdown">
      {frontmatter !== null && (
        <pre className="doc-frontmatter" data-testid="doc-frontmatter">
          {frontmatter}
        </pre>
      )}
      <div className="doc-markdown-body">
        <Markdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeSanitize]}
          components={HEADING_COMPONENTS}
        >
          {body}
        </Markdown>
      </div>
    </div>
  );
}

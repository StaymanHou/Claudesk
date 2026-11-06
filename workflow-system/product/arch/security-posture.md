<!-- Part of the Claudesk architecture set. Index + load-bearing constraints: ../arch.md -->
# Security & trust posture

**Operator decision, stated directly: "I want raw HTML to be blocked."** Recorded here because
the app's security posture had been an *unwritten* scaffold default (`"csp": null`) that every
feature was re-deriving from scratch — which is the defect
`SURFACE-2026-08-01-APP-SHIPS-WITH-CSP-NULL-NO-SECOND-LINE-OF-DEFENSE` actually names.

### The rule

**No feature may construct a DOM element from raw HTML found in document content.** Not
dangerous tags — *any* tags. A `<details>` collapsible admitted "just for convenience" violates
this as surely as a `<script>`; the rule is deliberately blunt so it needs no threat model to
apply. Documenting HTML stays fully supported: fenced code blocks render it as text.

### Why this is not markdown's default, and what enforces it

⚠️ **Markdown deliberately permits raw HTML** — CommonMark spec, and the reason GitHub renders
`<img>` / `<details>` / `<kbd>` in READMEs. A bare `<script>…</script>` on its own line in a plain
`.md` file is a *valid HTML block*, and a spec-compliant renderer passes it through. **Measured
2026-08-02, both directions:** with `rehype-raw` enabled, a plain markdown file yields a live
`<script>` element with executable content; without it, zero elements from the same input.

Enforcement is **structural, not configured** — `react-markdown` escapes raw HTML unless
`rehype-raw` is added.

> **⚠️ Correction recorded at the M11 close (2026-08-03) — the two controls are REDUNDANT, not layered, and "structural, not configured" must not be read as "escaping is the real guarantee and `rehype-sanitize` is only defense-in-depth."** Measured at WP3 verify-self on the **parsed DOM** across three configurations: `rehype-raw` + `rehype-sanitize` → **0** live vectors; **`rehype-raw` alone → 6** live vectors (`script`, `iframe`, `object`, `embed`, `style` tag **and** attribute); neither → 0. So each control alone suffices *today*, and each is load-bearing **exactly when the other is absent** — the framing above inverts the moment someone adds `rehype-raw`. Never reason about one control without checking the other. The corrected note lives beside the code at `DocMarkdown.tsx:17-31`.

Three independent pins:

1. **`docsRender.test.tsx` → "RAW HTML IS BLOCKED"** — asserts no element is constructed for
   `script`/`img`/`iframe`/`details`/`summary`/`b`. ⚠️ It fails on **benign** tags too, which is
   what distinguishes it from the hostile-fixture test (that one asserts *0 live vectors* and
   would still pass if benign raw HTML were admitted). Mutation-proven.
2. **`docsRenderDeps.test.ts`** — `rehype-raw` absent from `dependencies` AND `devDependencies`.
   Both arms mutation-proven. It is absent from `pnpm-lock.yaml` too, so not even transitive.
3. **The hostile fixture** — 16 vector classes scored on the parsed DOM, with a negative control
   requiring every class to fire on unrendered input.

**Wanting inline HTML in a doc is a decision to re-open WP1's renderer verdict** (`../archive/`
M11 wbs → "Probe outcomes"), not a plugin to add. The stakes: the app ships with **no CSP**, so
anything that executes gets the full `__TAURI_INTERNALS__` IPC surface.

### CSP status — deliberately still `null`, and why that is now acceptable

The operator agreed a CSP *should* exist as a second line of defense. It is **not set in this
WP**, and that is a sequencing call rather than a rejection:

- A CSP here would require **`style-src 'unsafe-inline'`** — 14 files use inline `style={{…}}`
  and CodeMirror/xterm inject stylesheets at runtime — so it would **not** block the CSS vector
  class (`style="background:url(javascript:…)"`). Partial backstop, not a replacement for the
  escaping above.
- It is **app-wide**: the terminal, editor, diff, PiP NSPanel, dashboard and updater all render
  under it, so it needs a full-surface live verification pass that a docs-viewer WP has no reason
  to run. A too-strict CSP fails **silently** (a blank panel, an unpainted terminal), which is the
  worst way to discover it.

**Filed as `SURFACE-2026-08-02-SET-A-CSP-AS-SECOND-LINE-OF-DEFENSE`** with the proposed policy and
the surface list. Until it lands, the rule above is the *only* line of defense — which is exactly
why it is pinned three ways rather than asserted in a comment.


### Media transport (M16) — the asset protocol adds no new reach

M16 turned on Tauri's **asset protocol** so the webview can load project media by URL
(`protocol-asset` feature; `tauri.conf.json` → `assetProtocol {enable: true, scope: {allow: [],
requireLiteralLeadingDot: false}}`). The measured statement, from the M16 WP1 probe (both the dev
origin and a bundled `tauri://localhost` build):

- **The CSP statement:** with `"csp": null`, a root-scoped asset scope admits webview reads **only
  inside roots that `editor_fs` already exposes for read AND write**. The asset protocol serves GET
  only. So it adds **no new reach** — **provided the static scope stays `[]`**. ⚠️ Pinned by
  `src-tauri/tests/asset_protocol_scope.rs` (mutation-proven). A non-empty static `allow` would
  break this statement.
- **Roots enter the scope only through `stat_media`.** It runs both `editor_fs` guard layers
  (`validate_root`, then `resolve_within`) and only then calls `allow_directory(<validated canonical
  root>, true)`. A root stays allowed until quit, which adds no reach because `editor_fs` already
  reads and writes it (spec A-5). The frontend builds an asset URL only from the canonical path
  `stat_media` returned (`assetUrlFor`).
- **Symlinks resolve before matching.** An in-root symlink escaping the root and an absolute
  out-of-root path are both refused; an in-root→in-root symlink loads. Pinned on our side by
  `stat_media_refuses_every_escape` (`editor_fs`, `TempDir`, including the escaping-leaf-symlink
  case).
- ⚠️ **Dot-paths LOAD** (`requireLiteralLeadingDot: false`, M16 WP2 A-2). This **reverses** the
  default the probe measured: about 65 `.playwright-mcp` screenshots across 9 projects were the
  main dot-path case. It widens nothing beyond roots `editor_fs` already reaches, since `fs_index`
  already lists those files.

**Two element rules the transport depends on — both are load-bearing under `csp: null`:**

1. ⚠️ **SVG renders through `<img>` ONLY.** Measured: SVG in `<img>` does not run its script; the
   same SVG in `<object>` does. A view-as-text toggle shows the source in CodeMirror.
2. ⚠️ **The PDF `<iframe>` is gated on the backend `%PDF-` sniff (`MediaStat.pdf_magic`), not on the
   file name.** Tauri's asset handler serves an unknown extension as `text/html`, and a live
   positive control showed an HTML file named `evil.pdf` **running its script** in an ungated
   iframe. A `.pdf` without the magic gets the info card.
   ⚠️ **The PDF `<iframe>` has NO `sandbox`, by measurement (2026-11-06, paydown WP10), so the sniff
   is the ONLY control on it.** A real PDF swapped into fresh iframes on both `http://localhost:1420`
   (dev) and `tauri://localhost` (a debug bundle): `sandbox=""`, `allow-same-origin`, `allow-scripts`
   and even `allow-scripts allow-same-origin` each fired `load` and rendered **blank**, while
   no-sandbox controls before and after rendered. The sandbox flag set itself disables WebKit's PDF
   viewer (a plugin), and no token re-enables it, so defense-in-depth here is not available without
   replacing the native viewer (e.g. a pdf.js render).

Both are pinned by `mediaNoScriptElements.test.tsx`: a rendered check over every `mediaKind`
extension (the population is derived, not listed) that SVG is never `<object>`/`<embed>` even with
`pdf_magic` set, plus a source check that `<object>`/`<embed>` appear nowhere in the media modules
and `<iframe>` exactly once, inside `PdfView`. The same file also asserts the rendered PDF iframe
has **no** `sandbox` attribute: jsdom cannot see a blank PDF, so an added sandbox would otherwise
ship with every gate green.

**Open in default app** (`open_in_default_app`) is an external spawn of `/usr/bin/open` on a path
that passed the same two guard layers, so it can only open a file inside a known project.

⚠️ **Hardened runtime is unmeasured for this transport** — deferred to `/release`, not passed (the
probe's bundle was ad-hoc, linker-signed).

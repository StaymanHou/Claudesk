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


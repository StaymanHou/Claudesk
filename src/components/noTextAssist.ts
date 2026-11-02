// M16.5 WP5 (5.1) — the props that turn off WebKit's text assistance on an input whose
// content is a NAME, not prose: a filter, a search pattern, a file/dir name, a path, a
// command query or a model id.
//
// Why all four: in WKWebView `spellCheck={false}` alone does not reliably stop macOS
// AUTOCORRECT, which is a separate attribute (`autocorrect`, Safari-only). A pending
// correction is committed on blur, and a mousedown on a list row blurs the input — so
// typing `eos` into the picker filter and clicking the `eos` row rewrote the filter to
// `Eon`, the row unmounted before `click` fired, and the click was lost
// (SURFACE-2026-10-19-PICKER-FILTER-AUTOCORRECT-HIJACKS-THE-ROW-CLICK).
//
// ⚠️ Do NOT spread this on a prose surface. The Prompt panel (CodeMirror) keeps its text
// checking on purpose: dictated prose benefits from it.

/** Spread onto `<input>`s that hold names, paths, patterns or commands — never prose. */
export const NO_TEXT_ASSIST = {
  spellCheck: false,
  autoCorrect: "off",
  autoCapitalize: "off",
  autoComplete: "off",
} as const;

---
name: app-ships-with-no-csp
description: Claudesk ships with "security":{"csp":null} — no Content-Security-Policy — so any HTML reaching the DOM executes with full __TAURI_INTERNALS__ IPC access and a sanitizer is the ONLY line of defense.
metadata:
  type: project
---

`src-tauri/tauri.conf.json` sets `"security": { "csp": null }`. **There is no Content-Security-Policy.** Consequence, measured not theorized (M11 WP1, 2026-08-01): anything that executes in the webview gets the full `__TAURI_INTERNALS__` surface — i.e. every registered Tauri command. So for any feature that renders HTML it did not author, **the sanitizer is the entire security boundary**; there is no second line of defense behind it.

**Why this is easy to get wrong:** a plan written from the outside will say "confirm this runs under the app's CSP" — a question with *no answer*. The real question inverts: *with no backstop, what does this renderer/parser do with hostile input on its own?* Reframing it that way is what made M11's renderer choice decidable.

**Concretely measured against an 11-section hostile fixture** (`marked` + DOMPurify **defaults**): 4 live vectors survived — a live `<style>`, two `style`-attribute CSS vectors (`background:url(javascript:…)`, `width:expression(…)` — DOMPurify's default `ALLOWED_ATTR` includes `style` and it does not parse CSS), and an `<img src="data:image/svg+xml;base64,…">` decoding to `<svg onload="alert(1)">` that **neither `FORBID_TAGS` nor the strictest `ALLOWED_URI_REGEXP` removes** (DOMPurify treats `data:` on `<img>` as an allowed-data-URI tag and bypasses the URI regexp). Unsanitized, the same fixture leaked 20.

**Practical rules:**
- Any surface rendering non-authored HTML must sanitize, and the sanitization must be **proven with a hostile fixture**, not assumed from a library's reputation.
- Score the **parsed live DOM**, never source text — see [[guard-predicate-completeness-vs-mutation-landing]].
- Today no shipped surface renders untrusted HTML, which is why nothing has forced the question. **M11's Docs viewer is the first**, which is why it chose `react-markdown` (escapes raw HTML by default, 0 vectors with no config) over `marked`+DOMPurify (needs 3 config options + a hand-written `afterSanitizeAttributes` hook, each silent if omitted).

The posture itself is **undecided and unrecorded** as a deliberate choice — it currently reads as a scaffold default nobody revisited. Filed as `SURFACE-2026-08-01-APP-SHIPS-WITH-CSP-NULL-NO-SECOND-LINE-OF-DEFENSE` (medium, arch-level): either set a CSP appropriate to an app that loads no remote content, or record `csp: null` in `arch.md` with its rationale and the compensating controls each HTML-rendering feature must implement.

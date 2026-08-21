---
name: read-logs-console-captures-nothing
description: mcp__tauri__read_logs{source:"console"} captures NOTHING for Claudesk — it returns empty whether or not JS errors occurred, so an empty read is a false green, not evidence. Verify any "no console errors" claim with a self-tested tap plus DOM-mount evidence.
metadata:
  type: reference
---

`mcp__tauri__read_logs{source:"console"}` against Claudesk returns **empty output regardless of
what the webview actually logged**. Because "no console errors on load" is a standing Observable
Outcome shape in this project's feature plans, that empty result reads as a PASS — a **false green
produced by a dead instrument**, which is worse than an error.

⚠️ **Measured 2026-08-21** (M13.5 WP1 verify-self): the reader returned empty; a `console.error`,
`console.warn` and `console.log` were then emitted **deliberately** via
`webview_execute_js`; the reader **still returned empty**. So the earlier empty read carried zero
information. The positive control is what exposed it — without it the outcome would have been
marked PASS on nothing.

**What to use instead**, for a "no JS errors on load" outcome:

1. **A self-tested tap.** Patch `console.error`/`console.warn` onto an array, add `error` +
   `unhandledrejection` listeners, then **emit a probe and assert the tap caught it** before
   trusting any later emptiness (`selftestWorked: true`). A tap you have not proven works is the
   same failure again one level up. ⚠️ It can only prove the STEADY state — it installs after the
   page's own scripts have run, so it cannot see load-time errors.
2. **DOM-mount evidence for the load-time half.** A load-time JS error in this React app leaves
   `#root` unmounted, so `#root.children.length >= 1` + rendered text + no `vite-error-overlay`
   is the positive signal. (M13.5 WP1 used: root mounted with 1 child, 808 chars of picker text,
   no overlay, no `Uncaught|SyntaxError|ReferenceError|TypeError` in body text.)
3. **Backend stderr separately** — the app's own `eprintln!` trail goes to the `pnpm tauri:dev`
   log, not the console channel, so grep that file for `panic` / plugin errors.

Same class as [[xterm-dom-reads-fake-a-blank-pane]] (instrument silence is not absence; run a
positive control) but a **different instrument**: there the selector hit the wrong nodes, here the
tool captures nothing at all. Note also that `Object.keys(__TAURI_INTERNALS__)` lists only
`plugins` while `invoke` **is** present but non-enumerable — a key-listing tap reports absence
where the property exists, so `typeof x.invoke === 'function'` is the honest check.

Related: [[mcp-bridge-tools-not-exposed-to-subagents]],
[[verify-self-stub-cannot-cross-subprocess-boundary]],
[[guard-predicate-completeness-vs-mutation-landing]].

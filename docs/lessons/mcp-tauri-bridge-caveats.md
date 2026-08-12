# MCP `tauri` bridge — driving live verify-self

**Established 2026-06-26 (M5 WP2); extended through 2026-08-06.** A dev-only MCP bridge
(`tauri-plugin-mcp-bridge`, `#[cfg(debug_assertions)]`-gated, binds `127.0.0.1:9223`; MCP server
declared in `.mcp.json`) attaches to the **real running WKWebView with live Tauri IPC**.

This is what dissolves the bare-Vite dead end described in
[`verify-self-tiers.md`](verify-self-tiers.md): the agent can drive live verify-self itself rather
than carrying every visual/DOM check to the operator.

## The basic loop

1. `pnpm tauri:dev` (background)
2. `mcp__tauri__driver_session{start, port: 9223}`
3. Drive the live workspace — `webview_dom_snapshot`, `webview_execute_js` (read live status-dot
   class / confirm `__TAURI_INTERNALS__`), `webview_interact{click}` (pick a project → a real
   workspace mounts), `webview_screenshot`.

**For a frontend/workspace-UI feature, prefer driving live verify-self through the bridge over
carrying the visual/DOM checks to verify-human.**

## Fidelity boundaries

- **High fidelity:** DOM-read, JS-exec, click, screenshot.
- **Low fidelity:** raw xterm terminal typing. `webview_keyboard` reaches the CC prompt but
  synthetic Enter doesn't commit to the PTY — so trigger status *transitions* via IPC/click, never
  by typing into CC.
- **Still genuinely operator-only:** anything needing the **installed** `.app` (GUI-PATH spawn
  parity), and backend-process outcomes the webview can't see (`pgrep` for a reaped `claude`).

## Caveats

### (a) Tool names are `mcp__tauri__*`
NOT the Playwright-MCP names that `feature-verify-self-runner` assumes. Drive these directly; don't
spawn that runner.

### (b) `tauri.dev.json` inline dev capability must re-list base perms
It must re-list `core:default` etc. or it suppresses them and `cc_spawn` breaks.

### (c) PiP NSPanel reachability — RESOLVED (M5 WP3, 2026-06-26)
The bridge **does** reach the PiP NSPanel webview via `webview_*{windowId: 'pip'}` (confirmed
driving the real panel: `__TAURI_INTERNALS__` present, DOM/screenshot readable). So the agent drives
live verify-self for *both* the main webview and the PiP panel.

### (d) Teardown port-cleanup (M6 WP7, 2026-06-28)
After a bridge session, run:

```bash
lsof -ti tcp:1420 tcp:9223 | xargs -r kill -9
```

*in addition to* `mcp__tauri__driver_session{stop}` + `TaskStop` on the `tauri:dev` task. A
`TaskStop`'d `pnpm tauri:dev` can leave **vite still bound to 1420**, which silently fails the *next*
`pnpm tauri:dev` at `beforeDevCommand` with "Port 1420 is already in use" — the tauri build then
exits non-zero before the bridge binds, so it **looks like a build failure and is really a stale
port**. Make port-cleanup the **default** teardown, not a recovery step.

(1420 = Vite dev server; 9223 = the `tauri-plugin-mcp-bridge` WebSocket.)

⚠️ See also `[[lsof-ti-tcp-misses-ipv6-vite]]`: `lsof -ti tcp:1420` misses Vite's IPv6-only listener
— and **never kill a `target/debug/claudesk` you didn't launch**; "port in use" usually means the
operator has the app open.

**The fire-then-poll pattern.** A `webview_execute_js` script that calls
`__TAURI_INTERNALS__.invoke(...)` times out the bridge's eval (it doesn't await the promise). Kick
the invoke, store its result on a `window.__x` global in `.then`, then read it back on a follow-up
sync script.

### (e) Driving a live CC turn (M9 WP2, 2026-07-07)
To trigger a real status transition you often need to inject into a workspace's CC PTY via
`cc_input`. Two gotchas:

1. **The real PTY session id is NOT the DOM `data-session-id`.** The `data-session-id` attribute
   (e.g. `ws-1-term-0`) is the terminal *display* id; the backend PTY session id (e.g. `cc-1`) lives
   only in the workspace-list React state as `cc_session_id`. No global exposes it — walk the React
   fiber tree from a mounted element up through `.return`, scanning each fiber's `memoizedState`
   hook chain for a state object with a `workspaces` array, and read `workspaces[i].cc_session_id`.
2. **`cc_input` is REJECTED by `mcp__tauri__ipc_execute_command`** with
   `"Unsupported Tauri command: cc_input"` — the bridge's IPC tool has an allowlist. Drive such
   commands from inside the webview via
   `__TAURI_INTERNALS__.invoke('cc_input', { sessionId, data })` in `webview_execute_js` instead
   (base64-encode `data`; end the prompt with `\r` (0x0d) not `\n` per the raw-mode CR-is-Enter
   fact; use the fire-then-poll pattern from caveat (d) since the invoke eval times out).

To observe the transition, install a `setInterval` sampler in the webview that records status-dot
class changes, then read the samples back after the turn — this captures the full
`idle→running→idle` sequence that a single snapshot would miss.

### (g) `webview_interact{click}` can fail on a missing ref helper
Fails with `undefined is not an object (evaluating 'window.__MCP__.resolveRef')`. Fall back to a
plain `el.click()` inside `webview_execute_js`. ⚠️ That bypasses hit-testing, so when *reachability*
is the point, pair it with geometry + `elementFromPoint`.

Also: read `lib.rs`'s invoke handler for real command names rather than guessing (two guesses were
wrong in one session — the real names were `workflow_substrate_installed` / `workflow_get_invite`).

### (h) ⚠️ A freshly-opened CC pane reads BLANK for seconds and it means nothing (incident, 2026-08-06)

A `webview_screenshot` (or any DOM/buffer read) of a just-opened workspace is **uninformative for
the first several seconds**: the pane mounts with **zero characters** before CC emits its first
bytes. Measured on two builds, window untouched, 500 ms sampling: first content arrived **~3.8 s
after mount** on one build and **~10.5 s after the click** on another. A black capture inside that
window is a **faithful photo of an empty terminal**, not a defect — and the pane paints **unaided**,
with no resize/click/focus needed.

⚠️ **This has produced five false verdicts across three sessions**, including a P1 incident
(`workflow-system/state/archive/incident-post-wp3-blank-cc-pane.md`) that paused a release and ran a
full bisect against a regression that did not exist.

**The rule: never call a CC pane blank from one sample.** Install a `setInterval` sampler from T+0 —
the same technique caveat (e) already prescribes for status transitions — and require **two
consecutive stable reads** before concluding anything.

⚠️ **When a screenshot and a text-layer read disagree, the first question is which instrument is
lying and whether the two sampled the same instant.** Comparing a buffer read from one moment
against a screenshot from another moment (on a different spawn) produced three successive wrong
conclusions in a single session: a WKWebView compositing failure, then a lying instrument, then a
paint stall. All three were single samples taken at unaligned moments; a T+0 time series was cheap
and available from the start.

## Related

- [`verify-self-tiers.md`](verify-self-tiers.md) — what the agent can and cannot observe, and when
  to carry an outcome to the operator.
- [`sandboxed-home-verification.md`](sandboxed-home-verification.md) — verifying `$HOME`-dependent
  features without touching the operator's real home.
- Memory: `[[mcp-bridge-tools-not-exposed-to-subagents]]` — `mcp__tauri__*` reaches the
  orchestrator but **not** spawned subagents, which silently fall back to bare Vite.

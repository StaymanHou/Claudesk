# verify-self tiers — what the agent can prove, and what the operator must

Five interlocking rules about *where* verification evidence can legitimately come from in this
project. They evolved across M5–M15 and are easiest to read together.

## 1. Installed-build smoke test (dev-vs-installed parity)

`pnpm tauri:dev` inherits the launching terminal's full environment (PATH, env vars); the installed
Finder/Dock-launched `.app` inherits only the minimal launchd environment
(`PATH=/usr/bin:/bin:/usr/sbin:/sbin`, no user shell PATH).

A feature can therefore pass **all** dev-mode + agent-mechanism verification yet be broken in a real
install. Real case, 2026-06-24: the installed app couldn't spawn `claude` because `~/.local/bin`
wasn't on the GUI PATH — **never reproduced in `tauri:dev`**.

⚠️ **Any feature touching PATH, environment variables, or external-process spawning MUST be
smoke-tested from a freshly-built installed `.app` launched from Finder/Dock — not just
`pnpm tauri:dev` — before it's considered done.** Part of the dogfood-readiness bar.

The PATH case specifically is now mitigated app-wide by `src-tauri/src/env_path/`, but the
verification posture stands for the whole class.

> **Scheduling note.** Per `[[installed-build-verify-deferred-to-release]]`, the operator defers
> installed-`.app` manual verification to the `/release` gate rather than per-feature verify-human.

## 2. Backend-lifecycle features are operator-only at the live tier

For a feature whose observable outcomes include backend process lifecycle (PTY spawn/reap, `pgrep`
for a killed `claude`/shell, hook-socket behavior, anything needing the real `.app`), the agent
cannot drive verify-self end-to-end: there's usually no running app in-session, and a bare Vite
browser (the dev-seam `?ws=` / `__seedWorkspace` path) shows the React frontend but **not** the Tauri
backend, so `pgrep`-class outcomes are unobservable there.

**The correct posture is NOT to spawn a Playwright subagent against a non-existent surface.** It is:

1. Verify the slice the agent CAN do statically — `tsc --noEmit`, `eslint`, `pnpm vite build`
   (catches broken imports/JSX across the change), and a wiring trace of the connected path.
2. **Carry** the live + backend outcomes into the phase's verify-human checklist, where the operator
   drives `pnpm tauri:dev` (or the installed `.app`).

This is the verify-self-tier corollary of rule 1 (which governs done-ness). Together they say: **the
agent proves the code compiles and wires correctly; the operator proves the process behavior on the
real app.** (Recurred every phase of QoL-WP1 close-workspace, 2026-06-25.)

⚠️ **Rule 2 is substantially relaxed by the MCP bridge** — see
[`mcp-tauri-bridge-caveats.md`](mcp-tauri-bridge-caveats.md). The agent *can* now drive the live
WKWebView and the PiP panel. What remains operator-only is narrower: the installed `.app`, and
backend-process outcomes the webview cannot see.

## 3. Scratch workspaces for verify-self (dev-only)

When an agent drives live verify-self through the MCP bridge, it picks a project from the picker → a
**real** CC session spawns in that project's directory. To keep that off real work, three throwaway
git repos live at `tmp/scratch/scratch-{a,b,c}` (each its own repo with a baseline commit, so
diff/git-status surfaces have content). `tmp/` is gitignored.

**Prefer opening these for verify-self over real projects.** Mandatory once a check drives a status
*transition* or anything that spawns/answers a CC session (Phase 2/3 of M5 onward); read-only
DOM/click checks against a real recent are harmless, but the scratch dirs are still the default.

First use: "Open folder…" → `tmp/scratch/scratch-a` to add them to the picker recents; thereafter
they're one click.

## 4. ⚠️ Extracting a pure state machine proves the MACHINE, not its CALLER

This repo's standing method — extract behavioral logic into a pure module so tests import and drive
the real code (`[[extract-for-import-when-a-raw-guard-cant-express-the-property]]`) — is right and
works. **But it has a repeatable blind spot, hit twice in M11 WP4:** a fully mutation-proven module
can sit behind a caller that never invokes it correctly.

- `pendingRestore.ts` had 20 tests and a proven `"reset"` transition while **no caller dispatched
  it**.
- `shouldJump` was proven while the jump arm poisoned its own input:
  `setChosen(decision.selected)` made the guard `chosen === null` false forever, so the first jump
  disabled every later one — **a shipped CRITICAL**.

Both were invisible to the `?raw` wiring arms, because both were *absences*, and a source-text guard
can only enumerate shapes you thought of.

**The fix is structural, not more assertions: funnel every write of a shared piece of state through
ONE function** — WP4 now routes the row click and the in-doc link handler through a single
`chooseDoc`, so forgetting the paired dispatch is impossible by construction rather than by vigilance
at each call site — then guard *that* single writer.

**Corollary for planning:** when a verify step names *"does the caller honor the contract?"* as the
risk, extracting the contract does not answer it. Only a caller-side guard does.

## 5. ⚠️ Where `tauri:dev` is NOT a faithful stand-in — check these BEFORE reading a failure

Rule 1's GUI-PATH gap is one member of a class: the dev build differs from the shipped app in ways
that make a **working feature read as broken**. Each gap below has produced a false FAIL (or a
misdiagnosis) at least once. When a live check fails, rule these out before believing the result.

**(a) macOS text-input services do not engage at all.** Dictation refused to start under
`pnpm tauri:dev` in every probe arm, **including a plain `<textarea>`**, and in the dev app's own
code editor, while the same CM6 code worked concurrently in the installed app (F-a WP1, 2026-09-21).
Likely mechanism: `tauri:dev` runs a bare adhoc-signed Mach-O under `target/debug/` with **no
`.app` bundle identity**, and text-input services attach to a real bundle. Treat dictation, and
plausibly autocorrect, the emoji picker and the character palette, as **installed-build-only**
outcomes; carry them to the `/release` gate (rule 1's scheduling note). ⚠️ Killed hypotheses, do
not re-propose: a CM6/contenteditable problem, a WKWebView/Tauri limit, a missing entitlement,
`spellcheck="false"`. The F-a probe harness is kept dev-only (`?cm6probe&mode=dictation`) so the
measurement can still be taken on an installed build. That build must come through the in-app
updater, **never `brew upgrade`**, which kills running sessions.

**(b) A CC session spawned by an agent-launched Claudesk emits NO hook events.** The child inherits
`CLAUDE_CODE_CHILD_SESSION`, which turns transcript saving off (the pane prints the warning), and
the hook chain never fires. A full live turn left the status label at `Unknown` (M15 WP3,
2026-09-13), so a naive read is a **false FAIL**. This extends
`[[agent-launched-app-cannot-verify-continue]]` from `--continue` to the whole hook channel.
**Working technique:** write hook JSON straight to the dev app's socket,
`~/Library/Application Support/com.claudesk.app.dev/hook.sock`, one JSON object per line in the
shape the hook script sends. That replaces only the CC process: the real `hook_socket` →
`status_broadcaster` → `workspace-status` → webview path runs (`status-channel.log` shows
`outcome=emitted`). No helper script exists yet (`tooling/autofire-timing/probe.py` only *mentions*
the socket). The third time this is hand-rolled, write one under `tooling/`. To **observe** the
event in the webview, register the listener
through the app's own bundled module: `await import("/node_modules/@tauri-apps/api/event.js")`
inside an injected `<script type="module">`. A bare `@tauri-apps/api/event` specifier does not
resolve, and there is no `window.__TAURI__`. ⚠️ The
`__internal_unstable_listeners_object_id__` registry reads **EMPTY while events are flowing**, so a
tap on it is an invalid probe, not a negative result (bridge caveat (l) is the same trap).

**(c) The dev profile's settings can drift from prod, and one of them decides whether skills can
write.** The dev profile (`com.claudesk.app.dev`) once sat at `cc_permission_mode: "dontAsk"`
while prod ran `bypassPermissions`. `dontAsk` stops the prompting **without granting the write**,
so a CC session composes a correct `/session-handoff` and is then silently denied (M13 WP4,
2026-08-18). The failure was first misattributed to the fixture, and a richer fixture would have
failed the same way. ⚠️ **Before any live check that needs a workflow skill to WRITE, read the
pane footer:** `⏵⏵ bypass permissions on` is the faithful state; `⏵⏵ don't ask on` means the
check cannot pass. The mode is read at **spawn**, so a change needs a respawn. *(Ruled 2026-09-23:
the dev profile is NOT auto-seeded from prod. The divergence is a check-first item, not code.)*

**(d) osascript cannot safely address the dev build while prod runs.** See bridge caveat (m) in
[`mcp-tauri-bridge-caveats.md`](mcp-tauri-bridge-caveats.md): drive the dev build **only** through
the MCP bridge.

## Related

- [`mcp-tauri-bridge-caveats.md`](mcp-tauri-bridge-caveats.md) — the live-driving capability that
  relaxes rule 2.
- [`sandboxed-home-verification.md`](sandboxed-home-verification.md) — the `$HOME`-injection
  technique for `~/`-touching features.

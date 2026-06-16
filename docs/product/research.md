---
stage: research
state: complete
updated: 2026-06-15
---

> Revision 2026-06-15: Re-entered research from vision back-loop after the vision pivoted from multi-window to single-window-with-tabbed-workspaces (filmstrip + center stage + PiP). The four open design questions in the revised `vision.md` are answered here. Original Phase 1 stack findings (Tauri 2 + portable-pty + xterm.js + React + Vite) stand unchanged and are preserved below. New material is in the **"2026-06-15 revision — Tabbed workspace model"** section. Roadmap is invalidated: filmstrip-thumbnail rendering strategy and PiP/menu-bar surfaces materially change Phase 1 and Phase 2 milestones, so this skill exits via P4 (back-loop to roadmap), not P5.

# Research

**Phase Focus:** Phase 1 (Bare Shell PoC) — Tauri shell on macOS, embedded terminal running Claude Code in the project dir, project picker, hotkey-pop to Sublime Text. The research also surfaces a cross-cutting Phase 2 finding (how to drive CC programmatically) that is too consequential to leave for the next phase's research; it is documented here under "Cross-phase finding."

**Phase Focus (2026-06-15 revision):** Cross-phase — the tabbed-workspace model and the status surfaces (filmstrip, PiP, menu-bar) touch Phase 1 (tab shell from day one) AND Phase 2 (filmstrip-as-status-indicator replaces the prior cross-window indicator). Architectural choices made here must hold for both phases.

### Recommended Stack

- **Tauri 2 (stable, 2.9.x line)** — Rust desktop framework with native WebView (WKWebView on macOS). Production-ready, ~3MB bundle vs. Electron's ~96MB, ~50% lower RAM use. Aligns directly with the vision's "lite over featureful" principle. Toolchain: rustc ≥1.77, Node 20 LTS.
- **`tauri-plugin-pty` + `portable-pty`** for the embedded terminal backend — the idiomatic 2026 choice for Tauri terminal emulators. `portable-pty` is part of the WezTerm ecosystem (2.8K dependents on crates.io); `tauri-plugin-pty` wraps it with a JS API close to node-pty's so xterm.js code Just Works. **This is a course-correction from the roadmap.md text** ("xterm.js + node-pty via Tauri sidecar pattern"): node-pty would require shipping a Node.js sidecar inside the Tauri bundle, defeating the bundle-size advantage. portable-pty runs natively in the Rust core.
- **xterm.js (`@xterm/xterm`)** for the terminal frontend — same component VS Code's integrated terminal uses; WebGL rendering addon for performance; fit addon for resize handling. The de facto choice with no live competitor.
- **React 19 + TypeScript + Vite** for the frontend — matches the Tauri 2026 community consensus (e.g., the Terax reference project ships this exact stack) and is what the lite editor in Phase 3 (likely Monaco or CodeMirror 6) will need anyway.
- **`tauri-plugin-global-shortcut`** for the Sublime Text / Sublime Merge hotkey-pop — official plugin, supports macOS, registers via `Shortcut::new()` in Rust or `register()` in JS.
- **Sublime invocation:** `subl` for Sublime Text, `smerge` for Sublime Merge. For Sublime Text: prefer passing the project root dir (`subl <project-path>`) for projects without a `.sublime-project` file, or `subl --project <path>.sublime-project` when one exists; flags `--new-window` and `--background` available. For Sublime Merge: `smerge <project-path>` opens the repo at that path.
- **Project picker persistence:** flat JSON file at `~/Library/Application Support/stayman-cc-wrapper/projects.json` (Tauri's `tauri-plugin-fs` + `path::app_data_dir()`). No per-project config file in the project itself — matches the "no per-project config burden" principle.

### Trade-offs

- **Tauri vs. Electron.** Tauri wins on every dimension we care about (bundle size 25x smaller, memory 30-40MB vs 200-300MB idle, startup <500ms vs 1-2s). The trade-off is ecosystem maturity — Electron has a decade of packaging/updater know-how; Tauri's is younger but mature enough for a single-developer tool. Verdict: Tauri.
- **WKWebView vs. Chromium.** Native WebView means slightly different CSS/font rendering than Electron's bundled Chromium. For a single-user macOS-only tool this is a non-issue (we test on one engine; cross-platform parity isn't a goal). Verdict: accepted.
- **portable-pty pre-1.0 + bus factor (1 owner, 2.8K dependents).** API may change between versions; long-term support has a single point of failure. Mitigated by pinning a version and by the fact that the core PTY API surface we need (spawn, read, write, resize, wait) is small and stable. Verdict: accepted; pin and monitor.
- **xterm.js bundle weight.** xterm.js + addons is the heaviest single piece of frontend JS we'll ship. No real alternative — the only competitive terminal renderer is a custom one, far out of scope. Verdict: accepted.
- **Sublime CLI shape difference.** `subl` takes either a dir, files, or `--project <project-file>`; `smerge` takes a dir. Wrapper must handle both shapes per app. Verdict: small CLI-shim layer in Rust, not a real cost.

### Cross-phase finding (Phase 2 architecture-relevant; do NOT defer to next research cycle)

**How the wrapper actually drives Claude Code is decided here, not in Phase 2.** The roadmap implies a single approach ("send `/session-resume` to the active CC pane"). Research surfaces two architecturally different paths, and the choice affects Phase 1 (which we're building first):

1. **PTY-driven interactive TUI (CHOSEN).** Spawn `claude` inside a pty via `portable-pty`, render output via xterm.js, and write bytes back into the pty for human-style input — including slash commands typed as `/session-resume\n`. The wrapper *is* the terminal, so injecting bytes is no more illegitimate than a human typing them. For *state detection* (knowing when `/session-pause` finished writing `.session.md`), use **file watching** (`tauri-plugin-fs-watch` or `notify` in Rust), NOT PTY output parsing. This is the architectural line: byte-injection for input is fine; output-text-scraping for state is forbidden. The 2026 ACP/acpx criticism of "PTY scraping" is specifically about parsing CC's output to infer state — file-watching sidesteps that entirely.

2. **Agent SDK / `@anthropic-ai/claude-agent-sdk` (REJECTED for primary path; HEDGED for future).** TypeScript SDK with `query()`-style structured calls and streamed JSON message events. Avoids PTY entirely. The Q1 2026 Dispatch / Channels / Remote Control primitives extend this. But: the SDK doesn't render the familiar interactive TUI, and not all slash commands are dispatchable through it (notably `/clear` is not; built-ins like `/compact` are). Our vision is explicit: left half is **the familiar CC TUI in yolo mode**, so we need the TUI. Verdict: stay PTY-driven for v1.

**Hedge for the future.** The Agent SDK + Remote Control direction is clearly Anthropic's strategic future. Build the wrapper's "send command to CC" code path behind a thin Rust interface (`trait CcSession { fn send_input(&self, bytes: &[u8]); fn on_output(...); fn wait_for_exit(...); }` or similar) so we can swap in an SDK-backed implementation later without touching the UI. Note also: the **`/rc` (remote-control) command exposed in the live CC TUI** in Q1 2026 makes a session available to claude.ai for remote drive — this is a parallel capability we may want to expose in the wrapper UI down the line, separate from our own byte-injection path.

### Risks

- **Claude Code CLI changes break us.** CC is on an active release cadence. PTY shape, slash command set, and even auth flows have shifted between versions. Mitigation: pin a CC version in development; treat the wrapper-to-CC integration as a stable seam to be re-tested on each CC upgrade.
- **Claude Code subscription auth + headless/wrappers policy.** Anthropic has scoped Max subscription usage to first-party Claude Code invocations in past policy changes. We are wrapping the *interactive CLI itself* (not the SDK / not the API), so the wrapper sees a normal subscription session — but a future policy change could require API-key auth for wrapper-driven sessions. Mitigation: design assumes the user authenticates `claude` independently before launching the wrapper; we never touch credentials.
- **macOS code-signing / notarization cost for distribution.** Required for Phase 4 release. Apple Developer Program is $99/year. Single-user dev unsigned build is fine for personal use; this becomes a Phase 4 problem, not now.
- **portable-pty single-owner bus factor** (see Trade-offs).
- **WKWebView CSS quirks vs. Chromium.** Phase 3 lite-editor work (Monaco/CodeMirror 6) is where this would bite if at all. Mitigation: dogfood early on actual macOS, don't develop against Chromium in a browser tab and discover WebKit issues at the end.
- **`/session-pause` file-write race.** Auto-resume on project open depends on `workflow/.session.md` being fully written before we read it. The file-watcher must wait for write completion (debounced; or check for a marker line). Designable but worth flagging.

### Roadmap impact (original 2026-05-18)

**No invalidation; one correction.** Phases 1–4 stand. The only roadmap text that needs a correction is Phase 1's "xterm.js + node-pty via Tauri sidecar pattern" — replace with "xterm.js + `tauri-plugin-pty` (portable-pty)". This will be applied during arch (P5) — the roadmap doesn't need a P4 back-loop since the phase structure, milestones, and exit criteria are unchanged.

---

## 2026-06-15 revision — Tabbed workspace model

The vision pivoted from N independent wrapper windows (one per project) to a single window hosting N workspaces (one per project), with a Mission Control-inspired layout: center-stage workspace + top filmstrip of live thumbnails (collapsible to mini status tiles) + a user-toggled, display-only picture-in-picture mini player for when the wrapper window is out of focus. Four open design questions were flagged in the revised `vision.md`; the next four subsections answer them.

### Q1: Live thumbnail cost — what's the cheapest faithful filmstrip rendering?

**Constraint discovered during research (this is the deal-breaker, not a minor cost concern).** Browsers cap **WebGL contexts at ~16 per page**, and xterm.js's WebGL renderer takes one context per terminal instance. Hyper's docs document this explicitly: "you can't have more than 16 terminals visible simultaneously" with the WebGL addon ([xterm.js#4175](https://github.com/xtermjs/xterm.js/issues/4175), [xterm.js#4379](https://github.com/xtermjs/xterm.js/issues/4379)). Practical browsers cut off lower — Chrome's WebGL2 hard cap is ~16, but contexts beyond ~8 start being lost as the browser evicts the oldest. We will routinely have 4+ workspaces open and the vision allows for many more. Naive "every workspace gets its own xterm + WebGL renderer" hits this wall.

**Recommended approach (verified safe with xterm.js): renderer-tier swap on focus, not snapshot.**

- **Center-stage workspace:** xterm.js + **WebGL renderer** (`@xterm/addon-webgl`). One WebGL context. Smooth, GPU-accelerated.
- **Background workspaces:** xterm.js + **DOM renderer** (default; the canvas renderer is deprecated). Zero WebGL contexts. The DOM renderer is significantly faster in 2026 than it was at xterm.js 4.0 and is the documented fallback when WebGL is dropped.
- **On focus change** (user clicks a filmstrip thumbnail → that workspace promotes to center stage): dispose the outgoing workspace's WebglAddon (it falls back to DOM automatically), then `loadAddon(new WebglAddon())` on the incoming workspace. xterm.js explicitly supports this — `WebglAddon.dispose()` is implemented and well-trodden; the only known caveat is a race condition during terminal teardown ([xterm.js#5181](https://github.com/xtermjs/xterm.js/issues/5181)) which we won't hit because we're not destroying the terminal, just swapping its renderer.

**For the filmstrip thumbnail itself, two viable strategies — recommend (b):**

- **(a) Render the background xterm at filmstrip-thumbnail size and DOM-zoom it.** Each background workspace's xterm.js is sized at, say, ~200px wide and 100px tall, mounted into the filmstrip. The terminal *itself* is the thumbnail. Simplest mental model. Cost: each background xterm still does layout + cursor-blink + ANSI parse work even when small.
- **(b) Render at full size in a hidden container, downscale via CSS transform.** Each background workspace's xterm.js renders at full size (e.g., 80×24 cells) in an off-screen mounted container; the filmstrip thumbnail is a CSS-transformed (`scale(0.15)`) live mirror. Costs slightly more memory but the terminal sees its real geometry, no resize churn when promoted to center stage, and the DOM renderer is fast enough that the per-frame cost is negligible. **Recommended.**

**Snapshot fallback (`canvas.toDataURL`-style) — REJECTED.** Two problems: (1) the WebGL renderer's canvas is opaque and reading from it stalls the GPU pipeline; (2) the DOM renderer doesn't have a single canvas to snapshot. The renderer-tier swap above is strictly simpler.

**Pause-when-fully-hidden.** A workspace in a *collapsed* filmstrip (mini status tiles only — no thumbnail visible) shouldn't render at all. xterm.js doesn't have a first-class "pause rendering" API but we can `terminal.element.style.display = 'none'` which suppresses the render loop. The PTY still produces output; the terminal buffers it; when promoted back to thumbnail/center, the buffered output flushes in one tick.

**Memory ceiling check.** xterm.js docs note "the buffer can take up significant memory, particularly for applications that launch multiple terminals with large scrollbacks." Default scrollback is 1000 lines. For 8 workspaces × 1000 lines × ~80 cols × ~8 bytes/cell, we're at ~5 MB of buffer memory total — negligible. If we ever crank scrollback to 10K+, we should revisit.

**Verdict.** The filmstrip is feasible with N=8 workspaces. Center-stage gets WebGL; backgrounds get DOM; collapsed filmstrip tiles render nothing. No snapshot trickery needed.

### Q2: PiP window mechanics on macOS via Tauri — what's the actual implementation path?

**Choice: use `tauri-nspanel` v2.1, not a regular Tauri window.** A regular `WebviewWindow` with `alwaysOnTop: true` and `visibleOnAllWorkspaces: true` *almost* works but has documented gaps: it doesn't draw over fullscreen apps in release builds ([tauri#5566](https://github.com/tauri-apps/tauri/issues/5566), [tauri#11488](https://github.com/tauri-apps/tauri/issues/11488)), and it competes for keyboard focus (Spotlight-style HUDs aren't supposed to). The fix the Tauri community has converged on is `tauri-nspanel`, a plugin that wraps Tauri's `NSWindow` as an `NSPanel` and exposes the macOS-native floating-panel semantics ([`ahkohd/tauri-nspanel`](https://github.com/ahkohd/tauri-nspanel)).

**Configuration for our PiP use case:**

```rust
use tauri_nspanel::{PanelBuilder, PanelLevel};

PanelBuilder::new(&app, "pip")
    .url(WebviewUrl::App("pip.html".into()))
    .no_activate(true)              // clicks don't steal focus from current app
    .level(PanelLevel::Floating)    // above normal windows
    .build();
```

Combined with `NSWindowCollectionBehaviorCanJoinAllSpaces | NSWindowCollectionBehaviorFullScreenAuxiliary | NSWindowCollectionBehaviorStationary` on the underlying `NSWindow` (which `tauri-nspanel` lets us set), this gives: visible on every Space, draws over fullscreen apps, doesn't steal focus on click, stays put when the user switches Spaces. Exactly the PiP semantics we want.

**Display-only is easy here.** Since v1 PiP is display-only (no click-to-focus), `no_activate(true)` is *all* we need — the panel can't accidentally pull focus because we never wire up the focus path. If we later add click-to-focus (Future Possibility), `tauri-nspanel`'s `make_key_and_order_front_regardless` covers it.

**Caveats.**
- `tauri-nspanel` is single-maintainer (`ahkohd`), actively maintained as of May 2026, used in several published Tauri menubar/Spotlight apps. Bus factor risk is real but smaller than rolling our own `NSWindow` bridge.
- The v2.1 builder API is the current target; previous versions used a `to_panel()` conversion idiom which still works but is being phased out.
- Tauri 2 already has a tracking issue requesting first-party NSPanel support ([tauri#13034](https://github.com/tauri-apps/tauri/issues/13034)), so this dependency may become unnecessary in a future Tauri release.

**Entitlements / signing.** No special entitlements required. The `NSWindowCollectionBehaviorCanJoinAllSpaces` flag is standard `NSWindow` API, no sandbox or Mac App Store paperwork needed. Code-signing is a Phase 4 problem regardless.

**Verdict.** `tauri-nspanel` v2.1 with `no_activate(true)` + `PanelLevel::Floating` + the all-spaces collection behavior is the path. Phase 2 dependency.

### Q3: Menu-bar item — warranted or not?

**Recommendation: YES, build a menu-bar status item, but keep it minimal.**

The argument from the vision: "wrapper hidden / minimized / on a different Space, and PiP is toggled off" → neither the filmstrip nor a display-only PiP is visible → the user is back to context-switching to find the awaiting-input project. The menu-bar item solves this case for the cost of about a day's work.

Tauri 2 has **first-class built-in tray-icon support** (`tauri::tray::TrayIconBuilder`) — no third-party plugin needed for the basics. The macOS-specific bits are well-documented:

- `setIconAsTemplate` for proper macOS template-image styling (auto-adapts to light/dark menu bar).
- `tauri-plugin-positioner` with the `tray-icon` feature for popover-style "click the menu-bar icon → small status window appears below it" UX (`Position::TrayBottomCenter`).
- `LSUIElement` Info.plist toggle to *hide* an app from the Dock — **we don't want this**, since the wrapper is also a regular Dock app. Tauri supports having both a Dock app *and* a menu-bar icon simultaneously.

**Scope for the v1 menu-bar item.** Display-only, same shape as PiP:

- Icon in the menu bar shows an **aggregate status dot** — green if all workspaces are idle, blue if any is running, amber if any is awaiting-input. (Three-state dot matches CC's `Stop` / `UserPromptSubmit` / `Notification` hook events.)
- **Left-click** opens a small popover (positioned via `tauri-plugin-positioner`) listing every open workspace with per-workspace status dot + project name. Clicking a row brings the wrapper window forward AND switches center stage to that workspace.
- **Right-click** opens a native menu: Show wrapper window / Toggle PiP / Quit.

This menu-bar item makes the PiP optional rather than mandatory. PiP is for "I want to keep an eye on it while I work in another app"; menu-bar is for "I forgot to keep an eye on it." Both surfaces draw from the same status broadcast (see Q5 below).

**Known regression to watch.** A bug report ([tauri#13770](https://github.com/tauri-apps/tauri/issues/13770)) flags the macOS tray icon disappearing under Tauri 2.6.2 on macOS 26. We'll pin Tauri 2.9.x+ and verify on macOS 26 during Phase 2 build.

**Cost.** Building the menu-bar item is *cheaper* than building the PiP — tray-icon API is built into Tauri core, no plugin dependency. Recommend we build the menu-bar item FIRST in Phase 2 and treat PiP as the second status surface (or even defer PiP to Phase 4 if the menu-bar item proves sufficient — see Q5).

**Verdict.** Build the menu-bar item. Re-evaluate PiP's necessity after the menu-bar item ships.

### Q4: Tab-shell patterns in Tauri — build from scratch or use multiwebview?

**Recommendation: build from scratch in the frontend (Pattern 1), not multi-webview (Pattern 2).**

Tauri 2 supports two patterns:

1. **HTML/JS-only tabs in a single WebviewWindow** — your React app manages tab state, swaps the visible workspace in the DOM, mounts/unmounts components as workspaces open/close. Tauri sees one window with one webview. **Stable.**
2. **Multi-webview in a single window** — Tauri 2 has experimental `add_child(webview_builder, position, size)` API that puts multiple isolated webviews into one window ([tauri/examples/multiwebview](https://github.com/tauri-apps/tauri/tree/dev/examples/multiwebview)). Each webview is a sandbox. **Unstable — requires `unstable` feature flag in `Cargo.toml`; API is still in flux as of Tauri 2.10.x.**

For our use case Pattern 1 is unambiguously the right choice:

- All workspaces share the same domain (the wrapper app itself) — no untrusted content, no need for webview-level isolation.
- xterm.js handles many concurrent terminal instances in a single document fine (with the renderer-tier swap from Q1). Multi-webview wouldn't make this easier.
- We need *cross-workspace* state (filmstrip, PiP, menu-bar) to read every workspace's status simultaneously. In Pattern 1 it's just shared React state. In Pattern 2 each webview is isolated and we'd need to round-trip through the Rust backend for every status update — strictly worse.
- Pattern 2 is `unstable`, which means upgrade pain on every Tauri release.

**Tab-shell prior art.** No standout published Tauri 2 tab-shell reference project — the Terax terminal we cited in the original research uses a single workspace per window. The general React pattern is: a top-level component holds an array of workspace records (each with its own PTY id, xterm.js instance ref, status); the center-stage area mounts the focused workspace; the filmstrip iterates over the rest. React's [`keepAlive`](https://github.com/CJY0208/react-activation) or equivalent stays-mounted pattern is needed so background workspaces don't tear down when not in the center stage. **This isn't research output, it's standard React; flagged here only to confirm there's no Tauri-specific trick.**

**Verdict.** Build the tab shell in React, single WebviewWindow, no multi-webview. Background workspaces stay mounted (`display: none` style hiding, not unmount).

### Q5: Status broadcast architecture (cross-cutting, not in vision but required by all three status surfaces)

Three surfaces consume CC idle/running/awaiting status: **filmstrip** (in-window), **PiP** (`tauri-nspanel` window), **menu-bar item** (tray icon + popover). They must agree, in real time, with low latency.

**Recommended: single Rust-side status broadcaster, three subscribers.**

```
[CC hook handler in ~/.claude/settings.json]
        │
        ▼
[wrapper Rust process — status broadcaster (Tauri event channel)]
        │           ├──► filmstrip React state (main webview)
        │           ├──► PiP webview (NSPanel)
        │           └──► menu-bar tray icon + popover webview
```

- Hook events from CC (`UserPromptSubmit` / `Stop` / `Notification`) write a single JSON line to a Unix socket the wrapper listens on (preferred) OR a shared status file the wrapper polls/watches.
- The wrapper's Rust core normalises this into a `WorkspaceStatusUpdate { workspace_id, state: Idle|Running|AwaitingInput, last_event_at }` event.
- The wrapper broadcasts the update via Tauri's event channel (`app_handle.emit("workspace-status", ...)`); the main React webview, PiP webview, and menu-bar popover webview each subscribe.

The Unix-socket vs shared-file question that was tagged "deferred to WP9b probe" in the prior session pause now has more weight — with three concurrent consumers, the Unix socket's cleaner concurrency (no file-lock contention, no debounce-write-completion juggling) wins decisively. **Recommend Unix socket from day one of Phase 2** (no need to probe; the multi-surface broadcaster makes the decision for us).

### Architectural decisions to record in arch.md

Summarizing the four answers above into the architecture deltas that need to land in `arch.md`:

1. **Tab shell.** Single Tauri `WebviewWindow`. All workspaces are React components in one webview. Background workspaces stay mounted, hidden via `display: none`.
2. **xterm.js renderer tiering.** Center-stage workspace: `@xterm/addon-webgl`. Background workspaces: DOM renderer (default). Swap WebglAddon on focus change. Collapsed-filmstrip workspaces: hide via `display: none` to suppress the render loop (PTY output still buffered).
3. **Filmstrip thumbnail strategy.** Full-size xterm rendering in an off-screen container, CSS-transformed `scale(0.15)` mirror inserted into the filmstrip.
4. **PiP window.** `tauri-nspanel` v2.1 plugin, `PanelBuilder` with `no_activate(true)` + `PanelLevel::Floating` + `NSWindowCollectionBehaviorCanJoinAllSpaces | NSWindowCollectionBehaviorFullScreenAuxiliary | NSWindowCollectionBehaviorStationary`. User-toggled. Display-only in v1.
5. **Menu-bar item.** Native Tauri tray icon (`tauri::tray::TrayIconBuilder`), aggregate-status dot, left-click popover positioned via `tauri-plugin-positioner` (with `tray-icon` feature), right-click native menu. Built in Phase 2 BEFORE PiP — if it proves sufficient, PiP may be deferred.
6. **Status broadcaster.** Rust-side single broadcaster. CC hook events arrive via Unix socket (decided; no longer a WP9b probe). Tauri event channel fans out to three subscribers: main webview (filmstrip), PiP webview, menu-bar popover webview.

### Risks (added by the 2026-06-15 revision)

- **`tauri-nspanel` single-maintainer bus factor.** Same shape as `portable-pty`. Mitigation: pin to v2.1, monitor [tauri#13034](https://github.com/tauri-apps/tauri/issues/13034) for upstream NSPanel support so we can migrate when it lands. Verdict: accepted.
- **Tauri 2.6.2 / macOS 26 tray-icon regression** ([tauri#13770](https://github.com/tauri-apps/tauri/issues/13770)). Mitigation: pin Tauri to a known-good version (2.9.x), retest on each Tauri upgrade. Verdict: accepted, monitor.
- **xterm.js WebglAddon swap-on-focus race.** [xterm.js#5181](https://github.com/xtermjs/xterm.js/issues/5181) describes a race during terminal disposal where the WebglAddon recreates the DOM renderer mid-teardown. We swap renderers on a still-alive terminal, which sidesteps the specific case, but the larger lesson is "don't swap renderers while the terminal is being disposed." Mitigation: gate renderer-swap on the workspace's lifecycle state (refuse to swap if the workspace is closing). Verdict: accepted.
- **Renderer swap latency on focus change.** Swapping from DOM to WebGL takes a few hundred ms in the worst case (WebGL context creation, texture atlas upload). For the filmstrip-click → center-stage swap this may be visible. Mitigation: keep WebGL "warm" by also using WebGL for the two workspaces flanking the center stage if total WebGL contexts ≤ 4; eagerly upgrade on hover. Defer the exact heuristic to Phase 2 implementation. Verdict: accepted, design space identified.
- **Workspace cap.** With 1 WebGL context for center-stage + DOM for everything else, the *hard* cap is roughly 16 workspaces (browser WebGL context limit, assuming we ever want >1 simultaneous WebGL terminal). Realistic working cap with snappy switching: 8. Beyond that, switching latency and DOM rendering perf both degrade. The vision targets 4–8 concurrent workspaces, so this isn't a constraint in practice. Add a soft warning in the UI if the user opens >8 workspaces. Verdict: accepted.

### Roadmap impact (2026-06-15 revision) — **INVALIDATES roadmap; back-loop to P4**

This revision changes both Phase 1 and Phase 2 enough that the roadmap needs to be re-written, not just edited:

- **Phase 1 must include the tab shell.** The original Phase 1 milestone "Tauri app skeleton (macOS bundle, launches, shows one window)" stays, but the embedded-terminal milestone now ships with the tab-shell substrate. A workspace is one tab; Phase 1's exit criterion of "Click a project → working CC session in the project dir <10s" is updated to "Click a project → workspace opens *in the current wrapper window* with working CC session <10s." Multi-workspace switching is still Phase 2 work, but the *substrate* must exist in Phase 1 so Phase 2 doesn't reshape the foundation. (Single-workspace usage in Phase 1 is just N=1 of the tab model.)
- **Phase 2 "Always-visible cross-window CC status indicator" milestone is REPLACED** by three milestones: (a) filmstrip + center-stage with renderer-tier swap, (b) menu-bar status item with popover, (c) PiP NSPanel (display-only).
- **WP9b "hook script writes to shared file vs Unix socket — decision deferred"** is RESOLVED: Unix socket from day one. Update WBS during roadmap.
- **The CC hook handler that was a Phase 2 wrapper component now serves three consumers** instead of one. Architecturally cleaner if introduced via a Rust-side broadcaster from the start of Phase 2.

The roadmap skill needs to rewrite Phase 1's third milestone, Phase 2's status-indicator and surrounding milestones, and the Phase 2 exit criteria to reflect three status surfaces (filmstrip / menu-bar / PiP) instead of one (cross-window indicator). Exit via **P4 → roadmap (back-loop)**.

### References (2026-06-15 revision adds)

- **xterm.js multi-instance & renderer:**
  - WebGL context limit / dozens of terminals — https://github.com/xtermjs/xterm.js/issues/4379
  - Wide-container perf, WebGL caveats — https://github.com/xtermjs/xterm.js/issues/4175
  - WebglAddon dispose & DOM fallback — https://github.com/xtermjs/xterm.js/issues/2254
  - Race condition in terminal.dispose / renderer swap — https://github.com/xtermjs/xterm.js/issues/5181
  - @xterm/addon-webgl README — https://github.com/xtermjs/xterm.js/blob/master/addons/addon-webgl/README.md
  - xterm.js overview — https://deepwiki.com/xtermjs/xterm.js/1-overview

- **Tauri 2 NSPanel / floating window:**
  - `tauri-nspanel` plugin — https://github.com/ahkohd/tauri-nspanel
  - PanelBuilder API docs — https://docs.aremu.dev/tauri-nspanel/tauri_nspanel/builder/struct.PanelBuilder.html
  - First-party NSPanel tracking issue — https://github.com/tauri-apps/tauri/issues/13034
  - NSWindow.CollectionBehavior — https://developer.apple.com/documentation/AppKit/NSWindow/CollectionBehavior-swift.struct
  - Always-on-top + spaces bug — https://github.com/tauri-apps/tauri/issues/11488
  - Fullscreen z-order regression — https://github.com/tauri-apps/tauri/issues/5566
  - Tao collection-behavior request — https://github.com/tauri-apps/tao/issues/890

- **Tauri 2 menu-bar / tray:**
  - Official tray namespace — https://v2.tauri.app/reference/javascript/api/namespacetray/
  - Window menu docs — https://v2.tauri.app/learn/window-menu/
  - "Building a Menubar App with Tauri v2" — https://dev.to/hiyoyok/building-a-menubar-app-with-tauri-v2-what-nobody-tells-you-9a2
  - "Menubar Mini-Dash Pattern" — https://dev.to/hiyoyok/building-a-mini-dashboard-widget-in-tauri-the-menubar-mini-dash-pattern-4m6h
  - Tauri 2.6.2 / macOS 26 tray-icon regression — https://github.com/tauri-apps/tauri/issues/13770

- **Tauri 2 tabs / multi-webview:**
  - Multi-webview official example — https://github.com/tauri-apps/tauri/tree/dev/examples/multiwebview
  - Multi-webview support PR — https://github.com/tauri-apps/tauri/issues/2975
  - Window and webview management — https://deepwiki.com/tauri-apps/tauri/2.3-window-and-webview-management
  - Splittable tab application discussion — https://github.com/orgs/tauri-apps/discussions/6464

### References (original 2026-05-18)

- **Tauri 2 (general):**
  - Tauri 2.0 stable release announcement — https://v2.tauri.app/blog/tauri-20/
  - Tauri release notes (2.9.x line, current Dec 2025) — https://v2.tauri.app/release/
  - macOS application bundle docs — https://v2.tauri.app/distribute/macos-application-bundle/
  - Tauri vs Electron 2026 comparison — https://www.pkgpulse.com/guides/electron-vs-tauri-2026
  - Tauri vs Electron — bundle/RAM/perf — https://tech-insider.org/tauri-vs-electron-2026/
  - Tauri 2 macOS code-signing guide — https://dev.to/tomtomdu73/ship-your-tauri-v2-app-like-a-pro-code-signing-for-macos-and-windows-part-12-3o9n

- **Embedded terminal stack:**
  - `tauri-plugin-pty` on crates.io — https://crates.io/crates/tauri-plugin-pty
  - `portable-pty` docs.rs — https://docs.rs/portable-pty/latest/portable_pty/
  - `portable-pty` crates.io — https://crates.io/crates/portable-pty
  - `marc2332/tauri-terminal` reference repo — https://github.com/marc2332/tauri-terminal
  - Terax (production Tauri terminal, 7MB) — https://github.com/crynta/terax-ai
  - Terax case study — https://betterstack.com/community/guides/ai/terax-ai/

- **Tauri global shortcut plugin:**
  - Official plugin docs — https://v2.tauri.app/plugin/global-shortcut/
  - JS API reference — https://v2.tauri.app/reference/javascript/global-shortcut/
  - Crate — https://crates.io/crates/tauri-plugin-global-shortcut

- **Sublime CLIs:**
  - Sublime Text `subl` official docs — https://www.sublimetext.com/docs/command_line.html
  - Sublime Merge `smerge` official docs — https://www.sublimemerge.com/docs/command_line

- **Claude Code programmatic control:**
  - Official headless docs — https://code.claude.com/docs/en/headless
  - Agent SDK slash commands — https://platform.claude.com/docs/en/agent-sdk/slash-commands
  - Remote Control official docs — https://code.claude.com/docs/en/remote-control
  - CLI commands & interaction modes (DeepWiki) — https://deepwiki.com/anthropics/claude-code/2.3-cli-commands-and-interaction-modes
  - Programmatic bypass / `--print` gist — https://gist.github.com/JacobFV/2c4a75bc6a835d2c1f6c863cfcbdfa5a
  - `acpx` (ACP-based agent client) — https://github.com/openclaw/acpx
  - Channels vs Dispatch vs Remote Control (MindStudio) — https://www.mindstudio.ai/blog/claude-code-channels-vs-dispatch-vs-remote-control
  - Q1 2026 update roundup — https://www.mindstudio.ai/blog/claude-code-q1-2026-update-roundup

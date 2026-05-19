---
stage: research
state: complete
updated: 2026-05-18
---

# Research

**Phase Focus:** Phase 1 (Bare Shell PoC) — Tauri shell on macOS, embedded terminal running Claude Code in the project dir, project picker, hotkey-pop to Sublime Text. The research also surfaces a cross-cutting Phase 2 finding (how to drive CC programmatically) that is too consequential to leave for the next phase's research; it is documented here under "Cross-phase finding."

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

### Roadmap impact

**No invalidation; one correction.** Phases 1–4 stand. The only roadmap text that needs a correction is Phase 1's "xterm.js + node-pty via Tauri sidecar pattern" — replace with "xterm.js + `tauri-plugin-pty` (portable-pty)". This will be applied during arch (P5) — the roadmap doesn't need a P4 back-loop since the phase structure, milestones, and exit criteria are unchanged.

### References

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

---
workflow: feature
type: research
milestone: M8 — Demo assets (filmstrip & PiP value showcase)
wp: WP1 — Probe: agent capture/render pipeline + format decision + scenario-stageability
created: 2026-06-29
state: research
---

# M8 WP1 — Capture/render pipeline probe (research phase)

> **Research-first probe.** WP1 of M8 is a genuine feasibility probe (see `docs/product/wbs.md`). This file holds the research that grounds the probe's GO/NO-GO + format + toolchain decision. The remaining WP1 tasks (1.2 prove end-to-end, 1.4/1.5 scenario staging, 1.6 scratch-d, 1.7 re-decompose) follow once research establishes the candidate approaches.

## Research questions

1. **Capture:** What are the agent-drivable ways to capture the macOS GUI (full screen / display / window region) to video, programmatically (no interactive UI)? What's the macOS Screen-Recording (TCC) permission model per approach — does a Finder/Dock-launched vs terminal-launched capturer change the prompt?
2. **Render:** What pipelines turn a capture into a README-embeddable GIF and/or MP4? Quality/size tradeoffs at README width (~800–1000px).
3. **Embedding:** How does GitHub render GIF vs MP4 inline (README + release pages)? Size limits, autoplay/loop, in-repo vs attachment.
4. **Format decision input:** Given 1–3, what format(s) for a ~10–15s filmstrip loop vs a longer PiP "doing other work" sequence?

## ⚠️ Scope steer (2026-06-29, operator) — REAL SCREEN CAPTURE RULED OUT

The operator ruled out recording the real screen / screenshots of the live `.app`. **The deliverable is a *synthesized animation* of Claudesk's UI (hi-fi or lo-fi), not a screen recording.** This removes the riskiest WP1 unknown (the macOS Screen-Recording TCC permission) entirely. WP1's GO/NO-GO is now about *which animation pipeline*, not *can we capture the screen*.

> Archived-as-moot: the TCC/`screencapture -V`/`ffmpeg avfoundation`/`scap` research (screen-capture permission model) is no longer the path. Kept only as the record of *why* we pivoted. The key fact that would have bitten us: Screen Recording permission attaches to the **terminal hosting the agent**, can't be pre-granted/queried from CLI, re-prompts ~monthly + on reboot — an unattended agent run blocks on a modal. Synthesizing an animation sidesteps all of it.

## Research

### Render half is proven (host test, today)
Empirical ffmpeg test on this host (synthetic 6s 1000w `testsrc2` clip — a *worst-case* high-detail/high-motion stressor; real flat-color UI animation compresses far smaller):

| Output | Size | Notes |
|---|---|---|
| MP4 (libx264, yuv420p) | **1358 KB** | high fidelity, but see embed constraint |
| GIF naive (fps12, scale 1000, single-pass) | 2562 KB | baseline |
| GIF palettegen/paletteuse (fps12, 1000w, bayer dither) | 3840 KB | *higher* here only because synthetic noise defeats the palette; on flat UI art palettegen wins decisively + avoids "swarming" |

→ The PNG-frames→GIF and →MP4 ffmpeg pipelines work on this host regardless of capture method. `gifski` not installed (optional `brew install` for marginally better GIF). `vhs`/`agg`/`asciinema(+agg)` for the terminal half: asciinema present; `vhs`+`agg` are `brew install` candidates.

### GitHub embedding constraint (decides format) — hard finding
- **Animated GIF (or WebP/AVIF) via `![](path.gif)` / `<img>`: autoplays + loops, zero clicks, committed in-repo.** Loop must be baked (`-loop 0`). This is the only inline, autoplay, self-contained, versioned-in-repo path. Practical size target **< ~3MB each** (git history keeps binaries forever).
- **MP4 does NOT render as a player from a committed repo path** — GitHub's sanitizer strips `<video>`. The *only* MP4-player path is **drag-dropping** the file into an issue/PR/release editor → GitHub mints a `user-attachments/assets/<uuid>` CDN URL that renders a player (controls, **no autoplay, no loop**). That upload is a **manual operator step the agent cannot do via commit**, and the URL isn't a versioned repo artifact.
- **Verdict:** GIF/WebP is the **primary deliverable** (agent can produce + commit + it autoplays). MP4 is at most a click-to-play *extra* requiring an operator drag-drop. → The demos should target **looping GIF** (the filmstrip/PiP "ambient motion" story *wants* autoplay-loop anyway).

### The fidelity fork (repo-grounded)
Every no-capture approach is a **recreation/diagram**, not footage of the real `.app`. Critically, Claudesk's status-dot UI **bisects cleanly**:
- **Reusable as-is** (pure, no Tauri/xterm coupling): `src/components/workspace/WorkspaceStatusIndicator.tsx` + `src/state/workspaceStatus.ts` (`statusPresentation` pure) + the dot CSS in `src/App.css` (~L527–592: `.status-dot-running` = Claude brand `#d97757`, `.status-dot-awaiting`, `@keyframes status-breathe`/`status-blink`). **Real dots, real colors/animations, fed mock status data → pixel-identical to the app.** This is exactly the "attention moving as dots change" value prop.
- **NOT reusable without a live backend**: the terminal *mirror* (`serializeAsHTML()` of a live xterm buffer), Tauri IPC (`invoke`/`listen`), `pip_resize`/`pip_move` NSPanel calls. The terminal half must be **faked** regardless of tool (static pane, or a hand-authored asciinema/vhs terminal clip composited in).

### Animation approaches surveyed (lo-fi → hi-fi), agent-drivable, → README GIF

| # | Approach | Fidelity | Agent-driv. | Determinism | Effort | Notes |
|---|---|---|---|---|---|---|
| 1 | **SVG + SMIL/CSS** | Lo-fi diagram | High | Excellent (`setCurrentTime` seek) | Moderate | Only one that can embed as a *living* `<img>` SVG in README; GIF fallback for release pages (camo CSP blocks SVG there). Rasterize via Playwright seek→screenshot. |
| 2 | **HTML/CSS + Playwright frame-capture** *(reuse real React+CSS)* | **Hi-fi** | High | Excellent (WAAPI `getAnimations()`+`currentTime` seek) | Med-High (HTML harness) | **The hi-fi "reuse the real UI" path for this repo.** Mount real `WorkspaceStatusIndicator`+dots with mock data; seek-per-frame screenshot loop → ffmpeg. Captures Chromium not WKWebView, but dots are pixel-identical (same component+CSS). |
| 3 | Remotion (React→video) | Hi-fi | High | Excellent | High | **AVOID** — source-available **not OSS** (forkers at 4+ ppl need a license to rebuild the demo — a wart for an OSS repo); Webpack-vs-Vite + Tauri-stub reconciliation costs more than #2. |
| 4 | Lottie JSON | Lo/mid vector | High | High | Low-Mod | Dominated by #5 (Revideo is maintained+MIT+same capability). |
| 5 | **Revideo** (MIT fork of Motion Canvas) | Lo/mid stylized | High | Excellent | Low-Mod | The **stylized/branded explainer** option: `npm init @revideo`, TS scenes, `renderVideo()` headless. Use if operator wants brand mograph over real-app fidelity. (Motion Canvas itself: render is browser-button-only, NOT headless → not agent-drivable. Manim: math-viz-shaped, heavy deps → skip.) |
| 6 | **asciinema+agg / vhs** (terminal half) | **Hi-fi terminal** | Very High | Highest (hand-authored) | Low | For the CC-pane specifically. Agent hand-writes the `.cast` NDJSON (nothing real runs) → `agg pane.cast pane.gif`. Composite into chrome via ffmpeg `overlay`. vhs outputs GIF+MP4+WebM but `Type"claude"`+`Enter` runs a real shell — use the `Hide`+`cat transcript`+`Show` trick for canned output. |

### ffmpeg recipes (shared)
```bash
# PNG seq → looping GIF (two-pass palette; bayer dither best for flat UI art; stops "swarming")
ffmpeg -framerate 15 -i f_%04d.png -vf "scale=720:-1:flags=lanczos,palettegen=stats_mode=diff" palette.png
ffmpeg -framerate 15 -i f_%04d.png -i palette.png \
  -lavfi "scale=720:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=3" -loop 0 out.gif
# PNG seq → MP4 (Safari/QuickTime-safe): -c:v libx264 -crf 18 -pix_fmt yuv420p, even dims, +faststart
```
Consider animated **WebP/AVIF** for README (same `![]()` syntax, autoplay+loop, ~3–15× smaller than GIF).

### Recommendation (per-demo, not one tool for both)
1. **Filmstrip demo → Approach 2** (HTML/CSS + Playwright WAAPI capture) reusing the real `WorkspaceStatusIndicator` + dot CSS with a mock status timeline. Pixel-identical dots = the actual value prop, all-MIT, macOS-native, deterministic.
2. **Terminal content inside either demo → Approach 6** (asciinema+agg, hand-authored `.cast`), composited into the chrome via ffmpeg `overlay`. Highest determinism, lowest effort, no real-`claude`/auth risk.
3. **If operator prefers a stylized/branded explainer over real-app fidelity → Approach 5 (Revideo).** Whole-different aesthetic; decide at the look-and-feel checkpoint.
4. **Situational → Approach 1 (SVG)** for a light conceptual diagram + the unique living-`<img>`-in-README trick.
5. **Avoid Remotion (#3)** — license + bundler friction.

**Two things WP1's hands-on step (1.2) must still verify on this machine:** (a) does a committed animated SVG actually animate on github.com (only matters if we go Approach 1); (b) `pnpm exec playwright install chromium` launches clean under the non-interactive agent shell on Apple Silicon (the gating dep for Approaches 1/2). Plus: confirm a real looping GIF renders autoplay on a GitHub README before depending on it.

### What this does to the WBS (preview of task 1.7)
- WP1 success criterion shifts from "GO/NO-GO on agent-driven *capture*" to "GO/NO-GO + chosen *animation pipeline* + format." Capture-permission tasks (old 1.1 TCC, 1.4/1.5 MCP-bridge scenario staging of the real app) are **obviated** — there's no real app to stage; the scenario is authored in the animation. New WP1 hands-on: stand up the HTML harness reusing the real components + prove one sample GIF.
- WP2 (filmstrip) / WP3 (PiP) become "author the timeline + render," not "stage + capture the real app." WP3's higher-risk "another app backdrop" unknown **dissolves** — PiP-over-another-app is depicted in the animation (a faux backdrop layer), not staged live.
- `scratch-d` (old task 1.6) is **no longer needed** — no real workspaces to open.


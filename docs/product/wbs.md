---
stage: wbs
state: complete
milestone: Milestone 8 — Demo assets (filmstrip & PiP value showcase)
updated: 2026-06-29
---

# WBS — Milestone 8: Demo assets (filmstrip & PiP value showcase)

> **Scope: Milestone 8 only.** Per the WBS just-in-time rule, this decomposes only the immediate next milestone. Future milestones (M9 time-analytics, M10 docs-viewer, M11 auto-resume, M12 skill-orch, M13 polish) stay tracked in `roadmap.md` and are decomposed JIT when reached.
>
> **✅ WP1 PROBE RESOLVED 2026-06-29 — WBS re-decomposed (was provisional below WP1).** M8's output is *marketing/communication assets* (animated GIF), not working software, and it is **agent-produced end-to-end** (Claude Code drives author/render/embed; the operator verifies at checkpoints). WP1 was a genuine feasibility probe; the operator then **ruled out real screen capture** and chose a **synthesized hi-fi animation** approach. The probe is answered (see "## Probe outcomes — WP1" below): GO, format = **looping GIF**, pipeline = **HTML harness reusing the real status-dot CSS → Playwright seek-per-frame screenshot → ffmpeg palettegen**. WP2–WP5 below are now the **re-decomposed real shape** (no longer provisional). *(`SURFACE-2026-06-29-DEMO-ASSETS-FILMSTRIP-AND-PIP`; roadmap Revision 2026-06-29b; research in `workflow/wip/m8-wp1-capture-pipeline-probe.md`.)*

## Milestone goal (from roadmap)

Two short demo recordings that *show*, not tell, the two hardest-to-explain value props of the shipped multi-workspace UX — both of which serve the vision's **Core Principle 6** (status visibility scales beyond the foreground) and the *attention-is-the-scarce-resource* thesis (memory `[[claudesk-philosophy]]`):

- **(a) Filmstrip** — multitasking ~4 CC-driven projects at once; the operator's attention moving between them as their status dots change; a tile click promoting a project to center stage. *In-window* status visibility.
- **(b) PiP** — staying in deep/mentally-intensive work (or watching YouTube) in another app while an always-on-top PiP keeps CC's progress monitorable in the corner; a dot flipping to awaiting-input as the monitorable signal. *Out-of-window* status visibility.

Assets are for the README, the GitHub release pages, and the M13 open-source launch.

## Design-priors consult

Read `docs/product/design-priors.md` (3 priors, all about UI surfaces / modes / config). **None fires on M8's WP boundaries** — M8 builds no UI surface, ships no setting, infers no mode. The over-infer guard (rule 5) applies: the recorded priors are about *product-design* tradeoffs in the app, not about how to decompose a demo-asset milestone. WP decomposition here follows common sense (rule 1). The relevant *thesis* anchor is `[[claudesk-philosophy]]` (attention is scarce) — which is the demos' subject matter, not a decomposition lean.

---

## Probe outcomes — WP1 (RESOLVED 2026-06-29)

**Verdict: GO** on agent-produced demo assets — via a **synthesized hi-fi animation**, NOT a screen recording. (Operator ruled out real screen capture mid-probe; that removed the riskiest unknown — the macOS Screen-Recording TCC permission — entirely.)

- **(a) Approach:** **HTML/CSS harness that reuses Claudesk's real status-dot CSS** (`src/App.css` ~L527–599: `#d97757` running / `#539bf5` awaiting / breathe+blink keyframes) fed mock status data, driven by **Playwright seek-per-frame screenshot** (`document.getAnimations()` → pause + set `currentTime` per frame = frame-accurate, deterministic), stitched to GIF by **ffmpeg palettegen/paletteuse**. Dots render *pixel-identical to the real app*; only the terminal pane is faked (no live PTY needed). Bake-off proven: a hi-fi sample read clearly as the real product and the operator picked it over a lo-fi stylized alternative.
- **(b) Format: looping GIF** (committed in-repo, `![]()`/`<img>` → autoplays + loops inline on github.com, zero clicks; loop baked via `-loop 0`). **MP4 rejected for the embed**: GitHub strips `<video>` from committed paths; the only MP4-player path is a manual operator drag-drop yielding a non-loop, click-to-play `user-attachments` CDN URL — not a versioned artifact, not autoplay. GIF *is* the right fit anyway (the "ambient motion" story wants autoplay-loop). Optional WebP for extra size headroom (same embed syntax).
- **(c) Budget:** target **< ~3MB each** (git history keeps binaries forever); ~800–1000px wide, ~6–12s, 15fps. **Empirically a non-issue** — flat UI compresses tiny: the hi-fi sample was **53–70KB GIF / 30KB WebP** (≈100× under budget). Lo-fi was larger (220–340KB) only due to a gradient backdrop.
- **(d) Toolchain (all MIT/Apache, fits the Vite repo):** Node + **Playwright** (frame capture) + **ffmpeg** (palettegen/paletteuse GIF). `gifski` optional, not needed. asciinema/`agg` or `vhs` available if a hand-authored *terminal* clip is wanted for the faked CC pane. **Remotion rejected** — source-available (non-OSS) license is a liability in a repo being open-sourced, plus Webpack-vs-Vite + Tauri-stub friction; Playwright gives the same hi-fi result with neither cost. *(Future Possibility: if M8 ever grows into a narrated launch trailer with audio/transitions/multi-scene reel, reopen Remotion — that's the scenario its compositional model + audio support actually earn their cost.)*
- **(e) Staging — fully agent-stageable, no live app, no MCP bridge.** The 4-project filmstrip scenario and the PiP-over-another-app scenario are *authored in the animation* (mock status timeline + a faux backdrop layer), not staged against the real `.app`. The old high-risk unknowns (MCP-bridge scenario staging, the "another app / YouTube" backdrop, a 4th scratch repo) **all dissolved**. No Screen-Recording permission, no operator-assist seam required.
- **(f) Asset path:** TBD in WP5 (likely `docs/demo/*.gif` or `assets/`), referenced by relative path in README; GitHub renders committed GIFs inline. Proof artifacts from the bake-off live in `tmp/m8-probe/` (gitignored).

**Research record:** `workflow/wip/m8-wp1-capture-pipeline-probe.md`. **WP1 is closed** — WP2–WP5 below are the re-decomposed real shape.

---

## Work Packages

### WP2: Shared demo-build harness ✅ SHIPPED 2026-06-29 (commits cbe2922 + 9cff1b1)
**Type:** tooling
**Milestone:** M8 (FIRST executable — both demos build on it)
**Dependencies:** WP1 (probe — resolved)
**Size:** M
**Description:** Build the reusable, agent-drivable harness the two demos share, productionizing the probe's proof-of-concept: a standalone HTML/CSS shell that **imports Claudesk's real status-dot CSS** (and recreates the surrounding chrome) fed by a **mock status timeline**, a **Playwright seek-per-frame capture script** (frame-accurate via `document.getAnimations()` `currentTime`), and an **ffmpeg render recipe** (palettegen/paletteuse → looping GIF, optional WebP). Lives under a non-shipped `tooling/demo/` dir (kept out of the app bundle; its Node deps must not pollute the app's lockfile — a self-contained sub-package or a pinned local install, per the probe's `tmp/m8-probe` pattern).
**Tasks:**
- [x] 2.1 Scaffold `tooling/demo/` — self-contained Node package (Playwright + a render script), isolated from the app's `package.json`/`pnpm-lock.yaml`. Document the one-time `playwright install chromium` step.
- [x] 2.2 Build the shared UI shell: import the real status-dot CSS from `src/App.css` (single source of truth — don't fork the color/keyframe values), recreate filmstrip + center-stage + PiP-panel chrome, parameterized by a mock status-timeline data structure. *(via `extract-dot-css.mjs` + `--check` drift-guard; colors, keyframes AND animation timing all sourced from App.css.)*
- [x] 2.3 Generalize the capture script (`capture.mjs` pattern from the probe): args for HTML file, dimensions, fps, duration, output dir; deterministic seek-per-frame; `deviceScaleFactor:2` for crisp text. *(+ `--timeline` injection, `reducedMotion:'no-preference'`, console/pageerror→exit1.)*
- [x] 2.4 Generalize the render recipe: PNG frames → looping GIF (palettegen/paletteuse, bayer dither, `-loop 0`) + optional WebP; assert output exists + is under the size budget. *(`render.mjs`; `build.mjs` chains capture→render.)*
- [x] 2.5 verify-self: run the harness end-to-end on a smoke timeline, confirm a legible looping GIF under budget. (Agent-drivable — no live app, no installed `.app`, no MCP bridge.) *(`npm run smoke` → 45KB GIF + 20KB WebP under budget; dots render correct per timeline at seeked t; frame visually checked.)*

### WP3: Filmstrip demo asset ✅ SHIPPED 2026-06-29 (commit a42ba61)
**Type:** asset
**Milestone:** M8
**Dependencies:** WP2
**Size:** S–M
**Description:** Author + render the polished filmstrip demo on the WP2 harness — ~4 projects in the filmstrip with differing status dots, attention shifting as one flips to AwaitingInput (blue blink), then a tile click promoting it to center stage. Narrative beat: *"4 projects in flight, one glance tells you which needs you, one click jumps there."*
**Tasks:**
- [x] 3.1 Author the filmstrip scenario timeline (project names, the running/awaiting/idle dot choreography, the promote-on-click beat, timing/duration within budget).
- [x] 3.2 Fill the faked content: realistic CC-pane terminal text per project (hand-authored, or an asciinema/`agg` clip composited in) + a Changes panel, so the center stage looks alive.
- [x] 3.3 Render via the harness; iterate on legibility (text crispness at README width is the classic GIF failure mode — tune fps/scale/dither).
- [x] 3.4 verify-human checkpoint: does it legibly convey the parallel-project-attention value? Re-author/re-render on operator feedback.
**Outcome:** `timeline.filmstrip.js` (4 UNRELATED projects — catan-companion/tax-cruncher/hugo-blog/recipe-box, deliberately distinct to read as parallelism-across-projects per README) + `npm run filmstrip` → `out/filmstrip.gif` (~323KB, ~9× under budget). 4-beat scenario (operator-approved across several verify-human rounds): live busy CC session (spinner + ticking elapsed/token counter + a fast-cascading code-DIFF hunk + build/test output — "working right now") → awaiting blue-blink → cursor-glide CLICK (strong double-ring + flash) promotes the tile (still awaiting, showing a real-shaped AskUserQuestion tool call) → SEPARATE keyboard `1`/`⏎` answer → running. Added `cursorAt.js` (glide-cursor interpolation) + `busyAt.js` (frame-deterministic spinner/stream) + cursor/keycap/busy/diff/askq surface in shell.{html,css,js} + structural tests. Real CC TUI cadence, no sensitive data. 46/46 harness tests. 0C/0M/3MINOR review-quality, auto-backlogged.

### WP4: PiP demo asset ✅ SHIPPED 2026-06-29 (commit 5625658)
**Type:** asset
**Milestone:** M8
**Dependencies:** WP2 (independent of WP3 — can interleave)
**Size:** S–M
**Description:** Author + render the polished PiP demo on the WP2 harness — the PiP panel pinned in the corner over a **faux "another app" backdrop layer** (depicted in the animation, not staged live), CC progress visible, a status dot flipping to AwaitingInput as the monitorable signal. Narrative beat: *"Do your other work — CC stays watchable in the corner and pings you the moment it needs you."* (The old live-staging risk is gone — the backdrop is just an animation layer.)
**Tasks:**
- [x] 4.1 Author the PiP scenario timeline: faux backdrop (a stylized "other app" / editor / video surface), the always-on-top PiP panel with its status dots, the dot → AwaitingInput "needs you now" moment.
- [x] 4.2 Compose the backdrop + PiP-panel layers in the harness shell (reusing the real dot CSS for the panel).
- [x] 4.3 Render via the harness; iterate on legibility within budget.
- [x] 4.4 verify-human checkpoint: does it legibly convey the monitor-while-elsewhere value? Re-author/re-render on feedback.

**Outcome (2026-06-29):** `npm run pip` → `out/pip.gif` (~367KB, ~8× under the 3MB budget; `out/` gitignored — committed asset is WP5's job). Built on the WP2/WP3 harness. Final demo (operator-approved over **4 verify-human rounds**): a vertical PiP with **2 live CC workspace mirrors** (recipe-box + tax-cruncher, reusing the filmstrip busy/stream cadence) pinned over an **ACTIVE Slack work backdrop** (the operator types a reply + the mouse glides and clicks a 👍 reaction; messages pop in) → tax-cruncher **pings** (running→awaiting) → **⌘+Tab switches the composition to the REAL Claudesk window** (filmstrip + center stage, the faithful UX — *not* a PiP focus ring) → **1+⏎** answers the AskUserQuestion → CC resumes. Key operator decisions: **work backdrop** (not leisure/YouTube — target audience is pros multitasking real work), **2 workspaces** (not 4), **faithful window-switch** ending. New `backdropAt.js` pure helper + `timeline.pip.js` + a keyframe-level `region` override in `shell.js` (pip→filmstrip switch) + vertical `.pip-cell` mirror CSS; fixed a latent `[hidden]` keycap/cursor stuck-visible bug (also improves the filmstrip demo). 68/68 harness tests. 0C/0M/3MINOR review-quality findings auto-backlogged (`workflow/backlog-quality-findings.md` → `# m8-wp4-pip-demo-asset`; the 3 are a dup comment + dead round-2 focus-ring scaffolding). **WP4 completes the (WP3 ‖ WP4) parallel pair — only WP5 (embed both GIFs in README) remains in M8.**

### WP5: Embed + place
**Type:** integration
**Milestone:** M8 (LAST — milestone exit)
**Dependencies:** WP3, WP4
**Size:** S
**Description:** Commit the final GIFs to the repo and embed them in `README.md` near the top (illustrating the pitch before Install/Develop); make them available for the GitHub release page + the M13 open-source launch.
**Tasks:**
- [ ] 5.1 Decide + commit the asset path (e.g. `docs/demo/filmstrip.gif`, `docs/demo/pip.gif`); confirm final sizes are under budget (they will be — probe showed ~tens of KB).
- [ ] 5.2 Embed in README near the top via relative `![]()`/`<img>` with a one-line caption each (filmstrip = parallel-project attention; PiP = monitor-while-elsewhere).
- [ ] 5.3 Milestone-exit verify: push + view the rendered README on github.com — confirm both GIFs render inline + autoplay-loop; operator final-approves. Mark M8 exit criteria met.

---

## Dependency Map

```
WP1 (probe) ✅ RESOLVED → approach + format + toolchain settled
  └──> WP2 (shared demo-build harness)  ← FIRST executable
         ├──> WP3 (filmstrip demo)  ─┐
         └──> WP4 (PiP demo)        ─┤  (independent; interleave freely)
                                     └──> WP5 (embed + place in README/release)
```

- **Critical path:** WP2 → (WP3 ‖ WP4) → WP5.
- **Parallel track:** WP3 and WP4 are independent once the WP2 harness lands — they share the harness but author different scenarios, in either order. The old WP3-vs-WP4 risk asymmetry is gone: with no live staging, the PiP "another app" backdrop is just an animation layer, no riskier than the filmstrip.
- **No 3rd-party API / SDK / app-runtime dependency.** The toolchain (Node + Playwright + ffmpeg) lives in a non-shipped `tooling/demo/` dir, isolated from the app's lockfile; it adds nothing to the Tauri bundle. No macOS capture stack, no Screen-Recording permission, no MCP bridge.

## Notes

- **Why the probe paid off:** the original WP1 framed the risk as "can the agent capture the real screen + stage the live app." The operator's mid-probe steer (no screen capture → synthesized animation) plus the research dissolved *both* of those risks — no TCC permission, no live staging, no MCP bridge, no 4th scratch repo. The probe-first discipline (M1 thumbnail / M4 N-cost / M5 nspanel) earned its keep: a half-day of research replaced a fragile capture-the-real-app plan with a deterministic, agent-ownable animation pipeline.
- **Demos reuse the real UI (single source of truth).** The harness imports the real status-dot CSS from `src/App.css` rather than forking the color/keyframe values — so the demo dots stay pixel-identical to the app even if the app's colors change later. Only the terminal pane (needs a live PTY) is faked.
- **Verification posture:** these assets are visual + subjective. WP2 (harness) has a real agent-drivable **verify-self** (run it end-to-end, assert a legible looping GIF under budget — no live app needed). WP3/WP4 verify tier is **operator-judgment at each demo's checkpoint** (3.4 / 4.4) + a GitHub-renders-correctly check at WP5.3. No `cargo test`/`vitest` slice — M8 ships no app code; the build tooling under `tooling/demo/` is dev-only.
- **Format is settled (GIF), see Probe outcomes.** No per-demo format re-decision needed.

## Architecture check

No architectural gaps. M8 adds **no production code, no new app module, no new dependency to the shipped Tauri bundle** — the demo-build tooling lives in a dev-only `tooling/demo/` dir (Node + Playwright + ffmpeg), isolated from the app's lockfile. The features being demonstrated (M4 filmstrip, M5 PiP) are already built, released, and documented in `arch.md`. **No `/product-arch` back-loop needed.** WBS is re-decomposed and complete → proceed to plan/build **WP2** (the shared harness) via `/feature-plan` / `/session-start`. (`/product-context` skipped per operator — M8 introduces no new architecture to context-load.)

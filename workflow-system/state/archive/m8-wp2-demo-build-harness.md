---
workflow: feature
state: COMPLETED
completed: 2026-06-29
drive_mode: autopilot
milestone: M8 — Demo assets (filmstrip & PiP value showcase)
wp: WP2 — Shared demo-build harness
created: 2026-06-29
---

# Feature: M8 WP2 — Shared demo-build harness

**Workflow:** feature
**State:** plan (complete)
**Created:** 2026-06-29

## Problem Statement

M8's two demo GIFs (WP3 filmstrip, WP4 PiP) both need the same machinery: a standalone HTML/CSS shell that renders Claudesk's real status-dot UI from a **mock status timeline**, a deterministic **Playwright seek-per-frame capture** script, and an **ffmpeg PNG→looping-GIF render recipe** (palettegen/paletteuse, `-loop 0`, optional WebP, asserted under a size budget). WP1's probe (RESOLVED, `d9c219a`) settled the approach, format (looping GIF), and toolchain (Node + Playwright + ffmpeg, all MIT/Apache) and left a working proof-of-concept in `tmp/m8-probe/` (`capture.mjs`, `hifi.html`, ~54–72KB sample GIFs). WP2 productionizes that PoC into a reusable, **dev-only, lockfile-isolated `tooling/demo/` Node package** that the app bundle never sees and whose deps never pollute the app's `pnpm-lock.yaml`. The single hard correctness rule: the dot **colors + keyframes are sourced from `src/App.css`, not hand-copied** (single source of truth), so the demo dots stay pixel-identical to the app even if the app's tokens change. WP2 ships **no app code** and has a fully agent-drivable verify-self (run the harness end-to-end, assert a legible looping GIF under budget — no live app, no installed `.app`, no MCP bridge).

## Context notes (carried from probe + codebase scan)

- **Toolchain ground-truth (this host):** ffmpeg 7.1.1 ✓, node v22.17.1 ✓. Playwright is **not** a project dep — the harness's own `tooling/demo/package.json` carries it (pinned), with a one-time `playwright install chromium` (chromium browser already cached at `~/Library/Caches/ms-playwright/chromium-1223` from the probe).
- **Real CSS source of truth:** `src/App.css` L527–600 — `.status-dot` / `-running` (`#d97757` breathe) / `-idle` (`#6e7681`) / `-awaiting` (`#539bf5` blink) / `-unknown` (`#484f58`) + `@keyframes status-breathe` / `status-blink`. **Gotcha (must handle):** the real animations are wrapped in `@media (prefers-reduced-motion: no-preference)`; Playwright's Chromium defaults to `reduce`, so without forcing `reducedMotion: 'no-preference'` on the browser context the dots render **static** (no breathe/blink) — the whole point. The capture context MUST set `reducedMotion: 'no-preference'`.
- **Status class names** match `src/state/workspaceStatus.ts` `statusPresentation` (`status-dot-running|idle|awaiting|unknown`) — the harness reuses these exact class strings so the mock timeline speaks the app's vocabulary.
- **Precedent for a tracked root dev-tooling dir:** `probe/` (M4 N-cost probe scripts) is tracked at repo root. `tooling/demo/` follows the same "tracked dev tooling, excluded from the app bundle" pattern. Its `node_modules/` is already covered by the root `.gitignore` `node_modules` rule (matches at any depth).
- **`tmp/` is gitignored** — probe artifacts there are the reference, not the deliverable. WP2's harness lives in tracked `tooling/demo/`; rendered GIFs are NOT committed by WP2 (that's WP5 — WP2 only proves the pipeline produces one).

## Work Tree

- [x] Phase 1: Pipeline mechanics — scaffold + generalized capture + generalized render  <!-- status: done -->
  **Observable outcomes:**
  - CLI: `cd tooling/demo && node capture.mjs --html <shell> --out frames/ --width 1000 --height 600 --fps 15 --duration 3` exits 0 and writes `frames/f_0000.png … f_NNNN.png` (count == round(fps*duration)), each a 2× (deviceScaleFactor:2) PNG.
  - CLI: `node render.mjs --frames frames/ --out out.gif --fps 15 --width 800` exits 0, produces `out.gif`, asserts it exists and is `< 3 MB` (exits non-zero if over budget); `--webp` flag additionally emits `out.webp`.
  - CLI: the app's `pnpm-lock.yaml` is **unchanged** after scaffolding (`git status --porcelain pnpm-lock.yaml` empty) — proof the demo package's deps are isolated.
  - Console: capture script runs headless with `reducedMotion: 'no-preference'` set on the Playwright context (grep the script source confirms it).
  - [x] P1.1 Scaffold `tooling/demo/` as a self-contained Node package: its own `package.json` (`"private": true`, `playwright` pinned, no workspace linkage), a `.gitignore` for `node_modules/` + scratch `frames/`/`*.gif` output, and a `README.md` documenting the one-time `npm install && npx playwright install chromium` step and the build commands. Verify `pnpm-lock.yaml` at repo root is untouched.  <!-- status: done — pnpm-lock.yaml + root package.json confirmed CLEAN -->
  - [x] P1.2 Generalize the probe's `capture.mjs` into `tooling/demo/capture.mjs`: arg-parsed (`--html --out --width --height --fps --duration`), `deviceScaleFactor:2`, `reducedMotion:'no-preference'`, deterministic seek-per-frame (`window.__render(t)` + pause all `document.getAnimations()` and set `currentTime=t*1000`). Keep the proven seek loop; just parameterize + harden (mkdir/rm outdir, frame-count log).  <!-- status: done — also adds console/pageerror capture -> exit 1 on JS errors -->
  - [x] P1.3 Write `tooling/demo/render.mjs` (or a documented `render.sh`) wrapping the WP1 ffmpeg recipe: PNG seq → palettegen (`stats_mode=diff`) → paletteuse (`dither=bayer:bayer_scale=3`, lanczos scale to `--width`) → `-loop 0` GIF; optional `--webp`; then `stat` the output and **fail (non-zero exit) if over the `--max-bytes` budget (default ~3MB)**. Echo final path + size.  <!-- status: done -->
  - [x] P1.4 Add a single `build.mjs` (or npm script) that chains capture → render for one HTML shell + output path, so a demo is one command. (Thin orchestrator over P1.2/P1.3 — WP3/WP4 each call it with their own shell + scenario.)  <!-- status: done — shared args.mjs flag parser added -->
  - [x] verify-auto  <!-- status: done — node --check x4, lockfile isolation CLEAN, reducedMotion + budget-assert present, private non-workspace pkg -->
  - [x] verify-self  <!-- status: done — drove harness live w/ throwaway shell: capture→30 PNGs @2x (1200x600), render→21KB GIF+8KB WebP under budget, budget-assert fires (exit1), build.mjs chain end-to-end. All 4 outcomes PASS, no boundary. -->
  - [x] verify-human  <!-- status: auto-skipped (autopilot, no integration boundary, verify-self all-PASS) — isolated new tooling/demo/ pkg, nothing imports it -->
  - [x] verify-codify  <!-- status: done — 9 node-test units for args.mjs (parseArgs/num), npm test 9/9; pipeline contract documented not CI-wrapped (dev-only, no CI); confirmed app vitest does NOT discover args.nodetest.mjs -->

- [x] Phase 2: UI shell — real-CSS-sourced, timeline-parameterized chrome + end-to-end smoke  <!-- status: done -->
  **Observable outcomes:**
  - CLI: a build step sources the `.status-dot*` rules + `@keyframes status-breathe`/`status-blink` **from `src/App.css`** (not hand-copied) into the harness's stylesheet; a guard check (e.g. a small `assert-css-synced.mjs` or a comment-fenced extraction) confirms the dot color hex values in the shell match `src/App.css` (CLI exits non-zero on drift).
  - Browser: opening the shell `file://` (or via the capture script) at a frozen `t` shows filmstrip tiles with the correct dot classes per the mock timeline; at a `t` after a scripted flip, a tile's dot class is `status-dot-awaiting`; the active tile carries the `.active` highlight. (Verifiable by `page.evaluate` reading `[data-dot]` classNames at a seeked `t`.)
  - CLI: `node build.mjs` against a bundled **smoke timeline** + the shell produces a legible looping GIF (`smoke.gif`) under budget, exits 0. This is the full end-to-end proof both WP3 and WP4 will reuse.
  - Console: no JS errors when the shell loads / renders (Playwright `console` listener clean).
  - [x] P2.1 Build the CSS-sync mechanism: an extraction step (build-time `extract-dot-css.mjs` reading `src/App.css`, pulling the `.status-dot*` block + the two `@keyframes`, emitting `_dots.generated.css`) so the dot styling is **sourced, never forked**. Strip/neutralize the `@media (prefers-reduced-motion)` wrapper (or rely on the capture context's `no-preference`) so animations fire under capture. Add the drift-guard CLI check.  <!-- status: done — extract-dot-css.mjs (brace-balanced selector-name extraction, survives App.css edits); animations re-attached unconditionally; --check drift-guard exits 1 on drift -->
  - [x] P2.2 Build the parameterized shell (`shell.html` + `shell.js`): a `STATUS_TIMELINE` data structure (array of `{t, tiles:[{name, status}], activeIndex, stageContent}` keyframes) drives `window.__render(t)`; chrome recreates filmstrip + center-stage (left CC-pane + right Changes panel) + a PiP-panel block, all toggleable so WP3 (filmstrip) and WP4 (PiP) reuse the same shell with different timelines/visible regions. Imports `_dots.generated.css`. Faked terminal-pane content is plain hand-authored markup (decision: hand-authored text now; asciinema/`agg` compositing deferred to WP3/WP4 if a checkpoint wants it).  <!-- status: done — shell.html + shell.css (chrome) + shell.js (timeline renderer, region toggle filmstrip/pip, frameAt). timeline injected via capture --timeline + addInitScript; smoke.js is a guarded fallback -->
  - [x] P2.3 Bundle a **smoke `timeline.smoke.js`** (a minimal ~3s 4-tile scenario with one running→awaiting flip + one active-tile promote) and wire `build.mjs` to render it to `smoke.gif`. This is the verify-self artifact.  <!-- status: done — timeline.smoke.js (4 tiles, all 4 dot states, awaiting-flip @1.4s, promote @2.6s); `npm run smoke` -> out/smoke.gif 45KB + smoke.webp 20KB, both under budget; frame visually legible -->
  - [x] verify-auto  <!-- status: done — node --check x5, CSS drift-guard in-sync + fires on tamper (exit1), generated dot hex matches App.css x4, vitest collects 0 tooling/demo files (79 all src/), shell wiring + lockfile CLEAN -->
  - [x] verify-self  <!-- status: done — drove harness live: CSS --check in-sync + hex match; shell __render correct @ t=0.5/1.8/2.8 (running→awaiting flip, active 0→1); npm run smoke exit0 → 46KB GIF + 20KB WebP under budget; 0 console/page errors. All 4 outcomes PASS, no boundary. -->
  - [x] verify-human  <!-- status: auto-skipped (autopilot, no integration boundary, verify-self all-PASS) — isolated tooling/demo/ harness; read-only App.css dep; smoke GIF legibility agent-confirmed + polished demos get WP3.4/WP4.4 checkpoints -->
  - [x] verify-codify  <!-- status: done — 16 node-test units (args.mjs + frameAt.js, npm test 16/16); CSS contract guarded by extract-dot-css --check; render pipeline documented not CI-wrapped (dev-only). frameAt extracted to classic-script single source (type=module is CORS-blocked over file://, found+fixed here); app vitest unaffected -->

## Current Node
- **Path:** Feature > review-quality (complete) → finalize
- **Active scope:** Code-quality review done (0 CRIT / 1 MAJOR fixed in-place / 3 MINOR backlogged) — ready for finalize
- **Blocked:** none
- **Unvisited:** none
- **Open discoveries:** none

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow/backlog.md -->
[NOTE-2026-06-29] WP3/WP4 — `shell.html` loads its JS as **classic `<script>`, NOT `type="module"`**: Chromium CORS-blocks ES-module imports from `file://` origins (`Access to script ... blocked by CORS policy ... origin 'null'`), which is exactly the capture path. The pure `frameAt` helper is therefore shared via a classic-script global (`globalThis.__frameAt` in `frameAt.js`), unit-tested by importing that file for its side effect. WP3/WP4 author new timelines + scenarios against this same shell — keep any new shared JS as classic scripts (or serve over http if a future need forces modules). Not a backlog item (no action needed); recorded so WP3/WP4 don't re-hit it.
[REVIEW-FIX-2026-06-29] extract-dot-css.mjs — MAJOR from code-quality review fixed in-place (commit follows): the two `animation:` declarations were hand-copied constants the `--check` drift-guard couldn't cover. Now SOURCED from App.css's `@media (prefers-reduced-motion: no-preference)` block via a new `pickAnimation()` helper, re-attached unwrapped. Proven: temporarily retuning `status-breathe 1.8s`→`2.5s` in App.css makes `--check` exit 1 (drift now caught); 16/16 node tests + smoke build still green. Closes the one partial breach of the single-source-of-truth rule before WP3/WP4 build on the harness.

## Code-Quality Review — m8-wp2-demo-build-harness

Reviewer (code-quality-reviewer subagent, ship commit cbe2922): **0 CRITICAL, 1 MAJOR, 3 MINOR.**

### Strengths
- Single hard rule genuinely implemented: brace-balanced, selector-name-based extraction from `src/App.css` + `--check` drift-guard (a real testable mechanism, not a comment).
- Lockfile isolation achieved structurally (standalone private npm package, no workspace glob reaches it), not just asserted.
- `frameAt` classic-script-vs-module CORS gotcha solved cleanly + forward-carried for WP3/WP4.
- Test-runner isolation deliberate (`.nodetest.mjs` dodges vitest's glob; verified 0 tooling files collected).
- Determinism correct end-to-end (`reducedMotion:'no-preference'` + per-frame seek + console/pageerror→exit1).

### Issues
**CRITICAL** — (none)

**MAJOR**
- [extract-dot-css.mjs] `animation:` declarations were hand-copied constants, not extracted → `--check` couldn't detect timing/easing drift from App.css. **→ FIXED in-place** (see `[REVIEW-FIX-2026-06-29]` above; now sourced via `pickAnimation()`, drift-guard proven to catch a timing change).

**MINOR** (auto-backlogged per drive_mode=autopilot → `workflow/backlog-quality-findings.md`)
- [README.md vs package.json] README `build.mjs` example uses `--duration 5.4`; the wired `smoke` script uses `3.2` (probe leftover). Doc drift.
- [.gitignore + README] `_dots.generated.css` is intentionally committed (drift-guard baseline) but the "what's committed" prose doesn't say so; a one-line note would remove ambiguity.
- [shell.js] timeline string fields (`tile.body`, `l.text`) are injected via `innerHTML` (raw HTML). Fine for dev-only author-controlled input, but worth a one-line caution in the TIMELINE shape doc-comment so WP3/WP4 authors don't pass escape-expecting strings.

### Assessment
Well-built dev tooling that takes its load-bearing invariant seriously. Small, readable, comments encode WHY. The one MAJOR (animation-timing fork) was a tightening of the existing mechanism, now closed. Net: advances the codebase.

### If you disagree
Operator: dismiss any finding by marking the line `[DISMISSED]` in this section before `feature-finalize` archives the WIP.

## Retrospect
- **What changed in our understanding:** Two concrete gotchas surfaced that the plan anticipated only one of. (1) The plan correctly flagged the `@media (prefers-reduced-motion)` wrapper — the capture context's `reducedMotion:'no-preference'` handled it. (2) **NOT anticipated:** Chromium CORS-blocks ES-module imports from `file://` origins, so the `frameAt` extraction-for-testability had to use a classic-script global (`globalThis.__frameAt`) rather than `import`/`export`. Found by the capture script's own console-error trap (which caught the CORS error and exited 1) — the error-trapping paid for itself immediately.
- **Assumptions that held:** The probe's pipeline (Playwright seek-per-frame → ffmpeg palettegen → tiny GIF) productionized cleanly; sizes stayed ~100× under budget (45KB GIF). Lockfile isolation via a standalone private npm package worked exactly as planned (app `pnpm-lock.yaml` never touched). The single-source-of-truth CSS extraction worked.
- **Assumptions that were wrong:** The initial CSS-sync impl hand-copied the two `animation:` declarations as constants (colors+keyframes were sourced, but timing/easing was forked) — the drift-guard gave false confidence there. The code-quality reviewer caught it (MAJOR); fixed in-place by sourcing the animations from App.css's `@media` block too. Lesson: "sourced, not forked" must cover *every* value the guard claims to protect, not just the obvious ones.
- **Approach delta:** Matched the 2-phase plan (pipeline mechanics → UI shell). One unplanned mid-stream pivot (the `type="module"`→classic-script revert for `file://` CORS) and one review-driven tightening (animation sourcing). No re-plan needed; both were within-phase fixes.

## Notes

- **Verification posture (from WBS):** WP2's verify-self is genuinely agent-drivable end-to-end (run the harness, assert a legible looping GIF under budget — no live app/installed `.app`/MCP bridge). There IS no `cargo test`/`vitest` slice — M8 ships no app code; the tooling is dev-only. verify-auto for both phases = the CLI smoke commands above (scripts exit 0, output exists + under budget, lockfile untouched, CSS drift-guard passes). verify-human is the operator eyeballing `smoke.gif` once (legibility/look) — likely auto-skippable in autopilot since there's no integration boundary and no named consuming surface, but the operator's read-time veto stands.
- **Out of scope for WP2:** the *polished* filmstrip + PiP scenarios and committed final GIFs — those are WP3 (filmstrip), WP4 (PiP), WP5 (embed). WP2 stops at "the shared harness exists and renders a smoke GIF."
- **Single source of truth (the one hard rule):** dot colors/keyframes come from `src/App.css` via an extraction step, never hand-copied. The probe's `hifi.html` hand-copied them — WP2 fixes that.

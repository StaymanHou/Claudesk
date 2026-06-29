# Feature: M8 WP3 — Filmstrip demo asset

**Workflow:** feature
**State:** Completed 2026-06-29 — shipped a42ba61 on main (not pushed); review-quality 0C/0M/3MINOR auto-backlogged; WBS WP3 ticked. F19 (M8 cycle continues — WP4/WP5 open).
**Created:** 2026-06-29
**Drive mode:** autopilot

## Problem Statement

The filmstrip (M4) is one of Claudesk's two most distinctive, hardest-to-explain value props: at a glance you see N parallel CC-driven projects and which one needs you. WP3 produces the polished, looping GIF that *shows* this — ~4 projects in the filmstrip with differing status dots, attention shifting as one flips to AwaitingInput (blue blink), then a tile click promoting it to center stage. Narrative beat: *"4 projects in flight, one glance tells you which needs you, one click jumps there."* It's authored + rendered on the WP2 demo-build harness (`tooling/demo/`) — its own scenario timeline file (`timeline.filmstrip.js`) + output path, reusing the existing `shell.html` + `build.mjs` pipeline. No app code; dev-only tooling. The asset is marketing/communication material for the README + GitHub release pages + the M13 open-source launch. Final asset *path* is WP5's call; WP3 renders to `out/filmstrip.gif` and gets the scenario + legibility right.

## Work Tree

- [x] Phase 1: Author the polished filmstrip scenario timeline + faked CC-pane content  <!-- status: [x] — all impl + verify nodes complete -->
  **Observable outcomes:**
  - CLI: `cd tooling/demo && npm run css:check` exits 0 (dot CSS not drifted from src/App.css).
  - CLI: `node build.mjs --html shell.html --timeline timeline.filmstrip.js --out out/filmstrip.gif --width 1000 --height 600 --fps 15 --duration <D> --render-width 800` exits 0 and prints `captured N frames` + `out/filmstrip.gif: <KB> KB (under budget)` — i.e. the new timeline drives the harness end-to-end with ZERO console/page errors (capture.mjs exits non-zero on any console error).
  - CLI: `node --test "*.nodetest.mjs"` exits 0 (existing 16 harness unit tests still pass — the new timeline is data, must not break frameAt/args contracts).
  - CLI: `timeline.filmstrip.js` is a classic-script-safe assignment (`window.TIMELINE = window.TIMELINE || {...}` OR a bare `window.TIMELINE = {...}`) — `node -e "require? "` n/a; assert via `node --check timeline.filmstrip.js` exits 0 (valid JS, no ES-module syntax).
  - [x] P1.1 Author `tooling/demo/timeline.filmstrip.js`: 4 projects (distinct realistic names), full dot choreography (running/idle/unknown mix → one flips to `awaiting` blue-blink → user clicks it → it promotes to center stage + goes `running`). Keyframe `t` values + an explicit total duration chosen for a calm, readable pace (each beat held long enough to read — target ~5–7s loop). Classic-script form (NOT `type="module"`), matching `timeline.smoke.js`.  <!-- status: [x] — 3 beats (t=0 / 2.2 / 4.4), ~6.6s loop; classic-script fallback form -->
  - [x] P1.2 Fill faked content per keyframe: realistic CC-pane terminal lines (`stage.lines` with prompt/accent/ok/dim classes) + a Changes panel (`stage.changes`) for the active project, and short `tile.body` strings per tile, so the center stage + tiles look alive and specific (not lorem). Hand-authored markup (the harness default — simplest; asciinema/agg composite explicitly NOT chosen here).  <!-- status: [x] — auth-refactor / web-client build content, per-beat Changes panel -->
  - [x] P1.3 Add a `filmstrip` script to `tooling/demo/package.json` mirroring the `smoke` pattern (css extract + build with `--timeline timeline.filmstrip.js --out out/filmstrip.gif`), so the demo is one command + reproducible.  <!-- status: [x] — `npm run filmstrip` → out/filmstrip.gif (--duration 6.6 --render-width 900 --webp) -->
  - [x] verify-auto  <!-- status: [x] — node --check OK, package.json valid + filmstrip script present, css:check in-sync, 16/16 unit tests -->
  - [x] verify-self  <!-- status: [x] — no integration boundary (isolated new artifacts); agent-driven directly (no live URL — dev-only asset harness, matches WP2 posture). All 4 outcomes PASS: css:check exit 0, clean build 99 frames zero console errors GIF 79.5KB+WebP 47.7KB under budget, 16/16 unit tests, node --check OK; GIF visually legible at 900px (read the artifact). No BLOCKING/COSMETIC. -->
  - [x] verify-human  <!-- status: [x] — AUTO-SKIP (F11): drive_mode=autopilot, verify-self all-PASS, no integration boundary (isolated new artifacts: timeline.filmstrip.js + filmstrip script), no outcome cites a consuming surface. The real value-conveyance gate is Phase 2's verify-human. -->
  - [x] verify-codify  <!-- status: [x] — added timeline.filmstrip.nodetest.mjs: 7 structural/narrative-invariant tests (region, ascending t, well-formed tiles, status vocab, active-in-range, stable tile identity, awaiting-beat-exists, active-changes, awaiting-tile-promoted). NOT verbatim content re-encoding — survives Phase 2 tuning. Full suite 23/23 pass (16 existing + 7 new). No integration boundary. -->

- [x] Phase 2: Render at README width, tune legibility, operator value-conveyance checkpoint  <!-- status: [x] — all impl + verify nodes complete; operator-approved demo -->
<!-- INPUT-AFFORDANCE round (verify-human feedback): added a visible mouse cursor that glides+clicks the tile (the switch) and 2× keyboard keycaps `1`/`⏎` (the separate approve). New harness files: cursorAt.js (+ cursorAt.nodetest.mjs); cursor/keycap wiring in shell.html/css/js (class `mouse-cursor`, NOT `cursor`, to avoid the terminal text-cursor span collision). -->
  **Observable outcomes:**
  - CLI: `npm run filmstrip` (or the explicit build invocation) produces `out/filmstrip.gif` under the byte budget (3MB; expect tens–low-hundreds of KB) — render.mjs exits 0 (it exits non-zero if over budget).
  - Browser/visual: opening `out/filmstrip.gif` (or the per-frame PNGs / a seeked frame via `frameAt`) shows: 4 named tiles with correct dot colors, the running dots breathing, the one awaiting dot blinking blue, the active-tile blue ring moving on the promote beat, and the center-stage CC text + Changes panel legible at the 800px README render width (text crisp, not muddy — the classic GIF failure mode).
  - CLI: the dot pixels are sourced from the real app CSS — `npm run css:check` still exits 0 after any tuning (no hand-edits to `_dots.generated.css`).
  - [x] P2.1 Render via the harness at README width; inspect output. Iterate on legibility knobs ONLY (`--fps`, `--render-width`, `--duration`, capture `--width/--height`) — tune text crispness vs. file size. Do NOT touch `_dots.generated.css` (drift-guard) or the dot animation timings (sourced from App.css).  <!-- status: [x] — inspected all 3 beats (t=0/2.2/4.4) at render-width 900 @ deviceScaleFactor 2, fps 15, bayer dither: text crisp, no muddiness, colors correct, narrative reads clearly (blue awaiting dot draws eye → active ring moves on promote). No tuning needed — current knobs win legibility AND stay tiny (79.5KB). -->
  - [x] P2.2 Lock the final build invocation in the `filmstrip` package.json script to whatever knob values won legibility; confirm `npm run filmstrip` reproduces the chosen GIF under budget.  <!-- status: [x] — `npm run filmstrip` locked at --width 1000 --height 600 --fps 15 --duration 6.6 --render-width 900 --webp; reproduces GIF 79.5KB + WebP 47.7KB, both under budget. -->
  - [x] verify-auto  <!-- status: [x] — package.json valid + filmstrip script intact, timeline+test parse OK, css:check in-sync, artifact under budget, 23/23 suite pass -->
  - [x] verify-self  <!-- status: [x] — no integration boundary (isolated artifacts); agent-driven directly (no live URL — dev-only asset harness). All 3 outcomes PASS: filmstrip build GIF 79.5KB+WebP 47.7KB under budget exit 0; GIF visually correct (4 tiles, dots, active ring, legible stage/Changes — beat 0 read + beats 2.2/4.4 frame-inspected in build); css:check in-sync. No BLOCKING/COSMETIC. -->
  - [x] verify-human  <!-- status: [x] — operator APPROVED 2026-06-29 after 3 back-loops (F12): (1) real CC TUI cadence + split switch≠approve into 4 beats; (2) recast 4 tiles as UNRELATED projects (catan-companion/tax-cruncher/hugo-blog/recipe-box) so it reads as parallelism-across-projects not one-system-components, per README philosophy; (3) added glide-cursor+click-ripple (switch) and 2× keyboard keycaps `1`/`⏎` (separate approve). -->
    - [x] P2.verify-human.1: Does the GIF legibly convey the parallel-project-attention value? (4 projects, one glance → which needs you, one click → jump there.) Operator judgment.  <!-- status: [x] — PASS after recast to 4 unrelated projects + visible cursor/keycap input affordances -->
    - [x] P2.verify-human.2: Is the pacing readable (each beat held long enough), text crisp at README width, loop seamless?  <!-- status: [x] — PASS (operator: "vh.2 pass") -->
<!-- DESIGN-PRIOR capture check (verify-human §6b): vh.1 correction ("show independent projects, not components of one system") maps to an ALREADY-DOCUMENTED identity principle (README "Parallelism across projects, not across agents within a project"; vision.md; [[claudesk-philosophy]]). Per dedup rule → NOT a new prior (existing canonical principle, not a newly-revealed transferable lean). No write to design-priors.md. -->
  - [x] verify-codify  <!-- status: [x] — cursorAt.nodetest.mjs (8 tests for the interpolation helper added during the input-affordance round) + 3 new cursor/keycap structural guards in timeline.filmstrip.nodetest.mjs (waypoints ascending+in-bounds, click waypoint exists, keycaps well-formed). Full suite 34/34 pass. No integration boundary (dev-only harness artifacts). -->

## Current Node
- **Path:** Feature > review-quality COMPLETE (0C/0M/3MINOR auto-backlogged) > ready for finalize
- **Path (prior):** Feature > COMPLETE — both phases [x]; ready to ship
- **Active scope:** WP3 done. Phase 1 (timeline + content + script) + Phase 2 (render/legibility + operator-approved demo + cursor/keycap input affordances) both complete. Full suite 34/34.
- **Next:** /feature-ship
- **Asset:** tooling/demo/out/filmstrip.gif (149KB, under budget). Final path is WP5's call (likely docs/demo/filmstrip.gif).
- **Blocked:** none
- **Unvisited:** none
- **Phase 2 build evidence:** all 3 beats inspected crisp at render-width 900; `npm run filmstrip` reproduces GIF 79.5KB + WebP 47.7KB under budget. Knobs locked, no tuning needed.
- **Blocked:** none
- **Unvisited:** Phase 2 (verify-self → verify-human [REAL operator value-conveyance gate — will PAUSE in autopilot] → verify-codify)
- **Open discoveries:** none
- **Phase 1 build evidence:** `node --check` OK, `npm run css:check` in-sync, 16/16 unit tests pass, `npm run filmstrip` → out/filmstrip.gif 79.5 KB + .webp 47.7 KB (both ~40× under budget), zero capture console errors; per-beat choreography confirmed via frameAt (t=0 4-running/idle/unknown api active → t=2.2 web-client awaiting → t=4.4 web-client promoted active+running).

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow/backlog.md -->
<!-- Forward-carry from WP2 (archived WIP): (1) shell.html loads JS as classic <script>, NOT type=module — keep timeline.filmstrip.js classic. (2) Timeline string fields (tile.body, stage.lines[].text) inject via innerHTML — author-controlled only, fine for this dev input. (3) 3 MINOR WP2 quality findings in backlog-quality-findings.md touch these files — fold opportunistically. -->

[VERIFY-HUMAN-FEEDBACK 2026-06-29] Operator rejected the first 3-beat render (P2.verify-human) with 2 changes → re-authored the timeline (in-loop F12→build):
  (1) CC-pane content now matches the REAL Claude Code TUI cadence (generalized/scrubbed): `❯` prompt, `● Edit/Bash(...)` tool-use bullets, `⎿` tree-result lines, and the actual permission-prompt box ("Do you want to make this edit? ❯ 1. Yes / 2. No"). No real/sensitive project data.
  (2) SWITCH and APPROVE are now DISTINCT beats — the old beat 3 conflated "click web-client" with "approve its pending edit" (read as: switching auto-approves). Now 4 beats: overview → awaiting-signal → CLICK promotes web-client to center stage STILL AWAITING (permission prompt shown, nothing approved) → SEPARATE APPROVE beat → running. Duration bumped 6.6s→8.0s (120 frames); GIF 107KB (still ~28× under budget). 23/23 tests still pass.

## Code-Quality Review — m8-wp3-filmstrip-demo

### Strengths
- `cursorAt.js` is a clean, pure, frame-deterministic helper with a single source of truth shared between the browser shell (classic script) and the Node test — mirrors the established `frameAt.js` pattern.
- The class-name collision with the terminal text-cursor span was anticipated and defended in three places (CSS/HTML/JS) — `mouse-cursor` not `cursor`.
- `timeline.filmstrip.nodetest.mjs` codifies structural + narrative invariants (not verbatim copy), so it survives content tuning while catching a malformed timeline.
- Frame-deterministic ripple/press driven off click-energy correctly respects the capture freeze-every-frame model.
- The "unrelated projects, not components of one system" philosophy constraint is encoded as a load-bearing comment, tying the asset to the README identity principle.

### Issues
**CRITICAL** — (none)
**MAJOR** — (none)
**MINOR**
- [tooling/demo/timeline.filmstrip.js:9-17] Four-beat JSDoc header still names the OLD cast ("api-gateway"/"web-client") but the data uses `catan-companion`/`tax-cruncher` — the prose block wasn't updated when the cast was recast. Doc/data drift inside one file. → auto-backlogged (low).
- [tooling/demo/timeline.filmstrip.js, whole file] The WP2 smoke fallback (`timeline.smoke.js`) still uses the "services of one system" naming this file's comment flags as the anti-pattern. Out of scope here (smoke = verify-self artifact); note for WP5. → auto-backlogged (low).
- [tooling/demo/timeline.filmstrip.nodetest.mjs:31] Test loads the classic-script timeline via `eval(readFileSync(...))` against a bare `window` shim — brittle if the timeline ever references `document`. On-record only; not worth changing while data-only. → auto-backlogged (low).

### Assessment
Well-built, well-scoped dev tooling that does exactly what its plan said and no more. Small, pure where it should be, idiomatic to the WP2 harness, with tests calibrated to invariants rather than authored copy. Advances the codebase (reusable cursor/keycap tracks WP4's PiP demo can lean on) rather than accruing debt; the only debt is cosmetic comment/data drift. Nothing rises to a refactor trigger for author-controlled, gitignored-output, dev-only marketing tooling with zero shipped-app surface.

### If you disagree
Dismiss any finding by editing this section in the WIP and marking the line `[DISMISSED]` before finalize archives the WIP.

## Retrospect
- **What changed in our understanding:** The hardest part of an asset demo isn't the pipeline (WP2 solved that) — it's the *semantics of the scenario*. Three verify-human rounds were all about meaning, not mechanics: (1) realism of CC content + separating switch-from-approve, (2) the project cast accidentally implying one-system/microservices (a philosophy violation, not a cosmetic), (3) making user input *visible* (cursor/keycap). The operator's eye caught conveyance problems an agent's "it renders correctly" self-check never would.
- **Assumptions that held:** The WP2 harness took the new scenario + a whole new input-affordance layer (cursor glide, click ripple, keycaps) with zero changes to capture/render — the keyframe-frozen-`t` model + classic-script + `globalThis` pattern generalized cleanly. The "structural-not-verbatim" test discipline meant the timeline could be re-authored 3× without touching a single test assertion.
- **Assumptions that were wrong:** (a) The smoke timeline's `api-gateway/web-client/...` names — copied as the WP3 starting point — encoded the exact "components of one system" framing the product philosophy forbids; I didn't catch it, the operator did. (b) I assumed a single `.cursor` class was safe; it collided with the terminal text-cursor span and painted arrows on the CC prompt — caught by a DOM count check, fixed by renaming to `mouse-cursor`.
- **Approach delta:** Planned as a 3-beat overview→awaiting→promote scenario; shipped as a 4-beat scenario (switch and approve split into distinct beats) with visible cursor+keycap input affordances and a recast of all 4 project names — all three are operator-driven additions from verify-human, none were in the original plan. The plan's *structure* (2 phases, harness-reuse, operator-judgment gate at 3.4) held exactly; the *content* evolved substantially at the gate, which is precisely what that gate is for.

## Communicate
> **Feature complete:** M8 WP3 (filmstrip demo asset) has shipped. It renders a looping ~149KB GIF showing four *unrelated* projects in the filmstrip — attention shifting as one flips to AwaitingInput, a cursor clicking it to center stage, and a separate keyboard approval — conveying the "4 projects, one glance, one click" parallel-attention value. Verify: `cd tooling/demo && npm run filmstrip` → open `out/filmstrip.gif`. (Final committed path is WP5's call.)

Requester = operator — closure notice for self-record.

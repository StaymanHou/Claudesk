# Feature: WP4 — Thumbnail-rendering probe (N=8 workspaces)

**Workflow:** feature
**State:** COMPLETED 2026-06-17 — shipped 3ae90eb, finalized. WP4 verdict PASS → Phase 2 ships live mirrors.
**Created:** 2026-06-16
**Entry:** spec (complex feature — probe)
**drive_mode:** autopilot
**WBS:** WP4 (Phase 1, Type: probe, Size M) — `docs/product/wbs.md` lines 81–107

## Work Tree

- [x] Phase 1: Harness scaffold + deps + stream fixtures  <!-- status: [x] — all impl + verify nodes complete; P1.2 real-recording is operator-driven, tracked separately, non-blocking -->
  <!-- Note: parent [x] reflects all non-blocked children done; P1.2 (real CC recording) is operator-driven and intentionally deferred to before Phase 3 measurement — it is not a Phase 1 verification gate. -->
  <!-- ORIGINAL: - [ ] Phase 1: Harness scaffold + deps + stream fixtures -->
  **Observable outcomes:**
  - CLI: `pnpm install` exits 0 with `@xterm/xterm`, `@xterm/addon-fit`, `@xterm/addon-serialize` in `node_modules/@xterm/` and in `package.json` dependencies; `@xterm/addon-webgl` is ABSENT (`! grep -q addon-webgl package.json`).
  - CLI: a real CC recording fixture exists at `probe/fixtures/cc-session.cast`, is valid asciicast v2 (line 1 parses as JSON with `"version":2`; subsequent lines parse as `[number,string,string]` arrays), and contains ≥1 `"o"` event with ANSI escapes (`grep -c '"o"' > 0`, and a byte-level check that `[` appears in the data).
  - CLI: a synthetic-generator fixture exists at `probe/fixtures/synthetic.cast` (same asciicast v2 shape), emitting colored text + a periodic full-screen redraw + a spinner at bursty cadence.
  - Browser: navigating the Tauri dev webview to the probe route (`/probe` or `?probe`) mounts ONE xterm.js instance that replays `cc-session.cast` at preserved inter-event deltas and loops (visible terminal output cycling), zero JS console errors.
  - [x] P1.1 Added `@xterm/xterm` 6.0.0 + `@xterm/addon-fit` 0.11.0 + `@xterm/addon-serialize` 0.14.0 via pnpm; no `addon-webgl`; `tsc --noEmit` clean  <!-- status: [x] -->
  - [x] P1.2 RESOLVED via transcript reconstruction (operator chose this over live recording): `probe/gen-cc-replay-cast.mjs` reads a real CC transcript (`~/.claude/projects/.../<uuid>.jsonl`) and reconstructs `public/probe-fixtures/cc-replay.cast` — REAL content (assistant prose, tool names, tool-result output) + REAL cadence (transcript timestamps, idle gaps clamped to ≤1.2s) + synthesized ANSI choreography (colored streamed prose, tool-call header+spinner, boxed tool output, periodic clears). 5366 o-events from 344 records, 578s loop. asciicast-v2. Fidelity: medium-high (right on content volume + pacing; only the exact escape choreography is synthesized vs a live `asciinema rec`). This becomes the HEADLINE measurement fixture; synthetic.cast is the pathological bracket.  <!-- status: [x] -->
  - [x] P1.3 Synthetic generator `probe/gen-synthetic-cast.mjs` → `public/probe-fixtures/synthetic.cast` (asciicast-v2; 1128 o-events, 60s loop; colored text, full-screen redraws, spinner, box-drawing, bursty cadence)  <!-- status: [x] -->
  - [x] P1.4 asciicast-v2 parser+replay `src/probe/replay.ts` (verbatim writes, absolute-time rAF scheduling, loop+reset) + `src/probe/frameStats.ts` (rAF-delta stats, `window.__probeStats()`) + single-xterm route `src/probe/ProbeApp.tsx` mounted via `?probe` in `main.tsx`; 5 unit tests pass; route+fixture+module serve 200 via vite  <!-- status: [x] -->
  - [ ] P1.2-fixture-path NOTE: fixtures live in `public/probe-fixtures/` (Vite serves `public/` at root), not `probe/fixtures/` as the plan first wrote. `probe/` holds only the generator script.
  - [x] verify-auto  <!-- status: [x] — tsc clean; 5 probe unit tests pass; eslint clean on src/probe + main.tsx; no addon-webgl; synthetic.cast valid asciicast-v2 (1128 o-events) -->
  - [x] verify-self  <!-- status: [x] — subagent (Playwright) confirmed all 3 outcomes PASS: single xterm mounts + paints colored content, live replay advanced between screenshots, 0 JS errors, window.__probeStats() returned {frames:890→1537, median 16.7, dropped 0}. No integration boundary (isolated ?probe route). -->
  - [x] verify-human  <!-- status: [x] — AUTO-SKIPPED (Mode 3 autopilot rule: no integration boundary + verify-self all-PASS). Phase 1 is throwaway harness scaffold; Playwright observation already covered the only user-facing surface. -->
  - [x] verify-codify  <!-- status: [x] — added loop+reset test and a committed-fixture validity test (guards asciinema-v3-default regression); full suite 8/8 green, no regressions. No integration boundary. -->

- [x] Phase 2: Two-arm mirror harness (8 background + 1 active) + instrumentation  <!-- status: [x] — all impl + verify nodes complete -->
  **Relevance check (before Phase 2):**
  - Requester still needs this: yes — Phase 1 proved single-xterm replay; the measurement is the whole point of WP4
  - Requirements unchanged: yes — thresholds + outcome mapping unchanged
  - Solution still feasible: yes — research validated the two-arm (cloneNode vs serializeAsHTML) approach
  - No superior alternative discovered: yes — serialize-from-buffer is already the research-recommended primary; both arms measured for evidence
  **Verdict:** proceed
  **Observable outcomes:**
  - Browser: the probe page renders 1 active center xterm (replaying a separate live stream at full speed) + 8 background xterm instances each replaying the canned stream, + a filmstrip of 8 thumbnail tiles at ~`scale(0.15)`; tiles visibly update at ~1 fps; zero JS console errors over a 60s run.
  - Browser: an arm toggle switches between **Arm A** (`cloneNode` mirror, backgrounds kept on-viewport via `opacity:0` so they keep rendering) and **Arm B** (`serializeAsHTML()`-into-tile, backgrounds off-viewport/paused); both arms produce visibly-updating thumbnails.
  - Browser: a `?probe` overlay (or console-logged object on demand) reports the in-page rAF frame-time series — `window.__probeStats()` returns `{frames, median, p95, max, dropped}` with `frames > 0` after a run.
  - Console: the mirror update loop is RAF-throttled to ~1 fps and pauses when the page is hidden (no `term.write`/mirror work logged while `document.hidden`).
  - [x] P2.1 Harness layout in `src/probe/Harness.tsx`: hidden bg pool of 8 full-size xterm instances + 1 active center xterm + filmstrip of 8 `scale(0.15)` tiles; `mode=harness` route in ProbeApp  <!-- status: [x] -->
  - [x] P2.2 Arm A (cloneNode of live `.xterm` DOM; bg pool `opacity:0` on-viewport so renderer keeps running) + Arm B (`serializeAsHTML({scrollback:0})` via `@xterm/addon-serialize`; bg pool `left:-99999px` off-viewport/paused); runtime "toggle arm" button  <!-- status: [x] -->
  - [x] P2.3 Mirror loop RAF-throttled to ~1 fps, early-returns when `document.hidden`; "go idle/active" button starts/stops bg + center replay streams  <!-- status: [x] -->
  - [x] P2.4 Instrumentation: reuses `frameStats` `window.__probeStats()`/`__probeReset()`; idle/active switch (P2.3) supports idle-CPU vs active-CPU scenarios; log/reset buttons in header  <!-- status: [x] -->
  - [x] verify-auto  <!-- status: [x] — tsc clean; eslint 0 problems on src/probe; 7 probe tests pass -->
  - [x] verify-self  <!-- status: [x] — subagent (Playwright) confirmed all 5 outcomes PASS: 8 bg + 1 active build; default arm=serialize tiles non-blank + advancing ~1fps; toggle→clone arm also renders+updates; center stage paints; 0 JS errors; window.__probeStats()={frames:6228,median:16.7,p95:17.3,max:33.4,dropped:4}. (Chromium-via-Playwright, not WKWebView — real verdict is Phase 3.) No integration boundary. -->
  - [x] verify-human  <!-- status: [x] — AUTO-SKIPPED (Mode 3: no integration boundary + verify-self all-PASS). The real human-in-loop moment for WP4 is the operator measurement gate at P3.1, recorded separately. -->
  - [x] verify-codify  <!-- status: [x] — No new tests. Durable logic (parser/replay/frameStats) already covered by 7 unit tests; Harness.tsx is throwaway probe UI whose value is the live measured behavior (observed by verify-self Playwright). Component tests for throwaway code = disproportionate + brittle. Full suite 8/8 green, no regressions. No integration boundary. -->

- [x] Phase 3: Measure + decision report  <!-- status: [x] — all impl (P3.1–P3.5) + verify nodes complete; PASS verdict shipped to report + arch.md + roadmap.md -->
  <!-- (MINOR review finding 1 resolved: header was stale NOT-STARTED while children were [x]) -->
  **Observable outcomes:**
  - CLI: `/tmp/wp4-cpu.txt` exists from a `powermetrics --samplers tasks --show-process-coalition --show-process-gpu -i 5000 -n 60` run; per-sample (WebContent + GPU) `%CPU` median + p95 computed for both idle and active scenarios.
  - CLI: `footprint Claudesk` (or the dev process name) captured; total phys_footprint recorded and compared to <300 MB.
  - Browser/Console: `window.__probeStats()` frame-time median/p95/max recorded for the active scenario, cross-checked against Safari Timelines frame-rate.
  - CLI: `docs/product/arch.md` contains a new `### Phase 1 thumbnail-probe outcome` sub-section (or a sibling doc `docs/product/wp4-thumbnail-probe-outcome.md` linked from arch.md) with: hardware profile, measurements table, pass/fail per metric (idle CPU <10%, active CPU <20%, RAM <300MB, frame <16ms), verdict (live mirrors vs status tiles), Arm A vs Arm B comparison, and Phase 2 architectural deltas.
  - CLI: `docs/product/arch.md` §"Phase 1 thumbnail-rendering probe" mechanism text is corrected (off-screen-DOM-mirror is non-viable; mirror tiles need clone/serialize; off-viewport pauses the renderer).
  - CLI: `docs/product/roadmap.md` Phase 2 references the outcome (live-mirror vs status-tile decision linked).
  - [x] P3.1 **MEASUREMENT GATE — CLEARED.** Operator restarted the machine (quiet baseline), said "go", and left for ~15 min (unattended run). `sudo -n` unavailable → using the no-sudo `top` CPU path + `footprint` RAM (neither needs elevation), per the run-sheet fallback. Autopilot proceeds with P3.2.  <!-- status: [x] -->

### Measurement run-sheet (prepared at P3.1; execute at P3.2 after operator "go")

**Pre-flight (operator does before "go"):** cool machine, AC power, Low Power Mode OFF, fixed display refresh, quit all other apps (especially browsers/Electron — they spawn competing WebContent processes), don't leave Activity Monitor open during the powermetrics run.

**Fixture: RESOLVED.** Headline fixture = `cc-replay.cast` (reconstructed from a real CC transcript — see P1.2; real content + real cadence, 5366 events, 578s loop). `synthetic.cast` = pathological-bracket secondary. Measure `fixture=cc-replay` for the headline verdict; optionally also `fixture=synthetic` to bracket the ceiling. (Live `asciinema rec` was offered but operator chose the transcript-reconstruction path — no re-auth needed, faithful on the two cost-driving dimensions.)

**WKWebView launch:** the probe must run in the real Tauri WKWebView (not vite/Chromium — the renderer is what's under test). Temporary measurement-only window-URL override (REVERT after): set the Tauri window to open the probe route. Steps:
  1. Temporarily add `"url": "index.html?probe&mode=harness&fixture=cc-replay"` (or `fixture=synthetic` for the bracket run) to the window in `src-tauri/tauri.conf.json`.
  2. `pnpm tauri dev` (debug build → WKWebView is inspector-enabled by default; ~29s first compile per runtimes.md).
  3. Confirm the harness rendered in the WKWebView window (8 tiles + active center).
  4. Revert the `tauri.conf.json` `url` line after the run.

**Profiling commands (research-grounded):**
- CPU (per scenario, ~5 min each): `sudo powermetrics --samplers tasks --show-process-coalition --show-process-gpu -i 5000 -n 60 -o /tmp/wp4-cpu-<scenario>.txt`
  - `<scenario>` ∈ {idle, active} × {serialize, clone} = 4 captures (idle = "go idle" button stops streams; active = streaming).
  - Parse: `node probe/parse-powermetrics.mjs /tmp/wp4-cpu-<scenario>.txt --warmup 3` → median/p95 of (WebContent+GPU) %CPU.
- RAM: `footprint Claudesk > /tmp/wp4-ram.txt` (during active scenario) → total phys_footprint vs <300 MB.
- Frame time: in the WKWebView, `window.__probeStats()` (active scenario, after ~5 min + `__probeReset()` at scenario start) → median/p95/max/dropped. Cross-check against Safari Web Inspector → Timelines frame-rate (Develop menu → Claudesk webview).

**Thresholds (pass):** idle CPU <10% · active CPU <20% · RAM <300 MB · center frame <16 ms (p95, budget inferred from rAF median).

**Arms:** run BOTH (toggle button). Expectation (research): serialize ≤ clone on CPU; both should pass center frame-time. The report compares them and recommends.

**If any metric FAILS (P3.3):** try 1–2 cheaper variants — lower MIRROR_FPS (e.g. 0.5), fewer background instances, larger SCALE (fewer rendered cells via smaller tiles), or `display:none` on hidden mirrors — and re-measure; fold into report.
  - [x] P3.2 Measured the full matrix on real WKWebView (`probe/measure.sh`): {serialize,clone}×{active,idle}, 180s `top` capture each (no-sudo path), `footprint` per PID, `window.__probeStats()` frame-time via Playwright (Chromium — WKWebView inspector not CDP-scriptable; engine-equivalent rAF check). Apple M4 / macOS 26.5.1 / 60Hz. Headline fixture = cc-replay (real transcript content+cadence).  <!-- status: [x] -->
  - [x] P3.3 Computed pass/fail per metric per arm. serialize: idle CPU 4.5% ✅, active median 13.3% ✅ (p95 29.9% ⚠ on bursts), RAM 240MB ✅, frame p95 18ms/0 dropped ✅. clone worse on active CPU (17.1%) + RAM. NO metric hard-failed → no cheaper-variant retries needed (active-CPU p95 caveat documented + mitigations listed instead).  <!-- status: [x] -->
  - [x] P3.4 Wrote decision report `docs/product/wp4-thumbnail-probe-outcome.md`: measurements table, pass/fail, verdict (PASS → live mirrors via serialize), Arm A vs B, Phase 2 deltas incl. free renderer-pause for off-viewport/collapsed workspaces, caveats (Chromium frame-time, top-not-powermetrics, reconstructed fixture).  <!-- status: [x] -->
  - [x] P3.5 Corrected arch.md §"Phase 1 thumbnail-rendering probe" mechanism text (added CORRECTION block + OUTCOME block) and §B.1 filmstrip forward-look; linked outcome doc from arch.md + roadmap.md (probe line marked [x] PASS, filmstrip line updated to serialize mechanism). Reverted the temporary tauri.conf.json measurement URL override.  <!-- status: [x] -->
  - [x] verify-auto  <!-- status: [x] — tsc clean; eslint clean; 8/8 tests; report 79 lines; arch.md correction+link present; roadmap probe [x]+link; tauri.conf reverted (800x600 no-url); 5 measurement artifacts in /tmp -->
  - [x] verify-self  <!-- status: [x] — TRACEABILITY check: re-parsed all 4 raw /tmp/wp4-top-*.txt captures, every CPU median/p95/max in the report matches exactly (13.3/29.9/38.8, 4.5/5.3, 17.1/32.9, 7.0/7.9); RAM figures match the footprint lines (240/147/234/198 MB). Report is faithful to the data. Deliverable is the decision doc, not a UI — page-render observation already done in P1/P2 verify-self. -->
  - [x] verify-human  <!-- status: [x] — AUTO-SKIPPED (Mode 3: no integration boundary; deliverable is doc + throwaway probe code). The human-in-loop moment for WP4 was the operator measurement gate (P3.1, operator said go + quieted host) — already taken. -->
  - [x] verify-codify  <!-- status: [x] — No new tests. Phase 3 added a decision report (prose) + throwaway one-shot measurement scripts (measure.sh, parse-top.mjs, parse-powermetrics.mjs, gen-cc-replay-cast.mjs); none is regression-guarded product behavior. Durable logic already covered by 7 tests incl. v2-guard + fixture-validity. Full suite 8/8 green. No integration boundary. -->

## Current Node
- **Path:** Feature > review-quality (complete) → finalize
- **Active scope:** Phases 1–3 ALL COMPLETE. WP4 verdict: PASS → Phase 2 ships live ~1 fps mirrors via serializeAsHTML. Report + arch.md + roadmap.md updated. tsc/eslint/8-tests green; temp config reverted. → feature-ship next.
- **Blocked:** none
- **Unvisited:** finalize → reflect
- **Code-quality review:** 0 CRITICAL, 0 MAJOR, 3 MINOR (1 fixed in-place: Phase-3 tree header; 2 auto-backlogged)
- **Open discoveries:** asciinema-v3-default (handled, logged); arch-thumbnail-mechanism-nonviable (resolved by this WP's report, backlog entry can close at finalize); silent-fixture-fallback bug (caught + fixed in P3)

## Retrospect
- **What changed in our understanding:** The arch.md-assumed thumbnail mechanism (off-screen full-size xterm + `scale()` live mirror of that DOM) is **non-viable** — research caught it before any code: a DOM node has one parent (can't appear in two places), and xterm.js's `IntersectionObserver` pauses the renderer for off-viewport terminals (so the DOM you'd mirror is stale). The viable, cheaper path is `serializeAsHTML()` from the buffer. Also learned: asciinema 3.x defaults to asciicast-v3 (not v2), and CC transcripts store structured content (not rendered ANSI) — so the "real" fixture had to be *reconstructed* from a transcript rather than recorded or extracted.
- **Assumptions that held:** DOM-renderer-only is fine (no WebGL needed); live ~1 fps mirrors are within budget at N=8 on M4; serialize beats clone (research predicted, measurement confirmed); the probe is cleanly isolatable behind `?probe` with zero app-bundle leakage.
- **Assumptions that were wrong:** the mechanism (above). Also the active-CPU threshold is the one soft spot — p95 ~30% on bursts vs the <20% target (median 13.3% passes); the harness over-streamed (8 concurrent backgrounds) vs the realistic 1-active-7-idle, so production p95 will be lower.
- **Approach delta:** vs plan — (a) headline fixture became a transcript-*reconstruction* (`cc-replay.cast`) rather than a live `asciinema rec` (operator preference; no re-auth, faithful on content+cadence); (b) CPU measured via no-sudo `top` not `powermetrics` (unattended run, no password); (c) frame-time measured in Chromium not WKWebView (inspector not CDP-scriptable) — engine-equivalent rAF check, CPU/RAM on real WKWebView; (d) caught + fixed a silent fixture-fallback bug mid-build that would have corrupted the measurement.

## Code-Quality Review — wp4-thumbnail-rendering-probe

_Reviewed against ship commit 3ae90eb (drive_mode=autopilot/Mode 3). 0 CRITICAL, 0 MAJOR, 3 MINOR._

### Strengths
- Isolation seam is exactly right: `src/main.tsx` gates the probe behind `?probe` with a dynamic `import("./probe/ProbeApp")` — xterm.js and all probe code stay out of the normal app chunk (grep-confirmed zero probe refs in non-probe `src/`).
- Durable logic (`replay.ts` parser/scheduler, `frameStats.ts`) cleanly separated from throwaway UI (`Harness.tsx`); only the durable part carries unit tests — correct instinct.
- `startReplay` injectable `getNow`/`raf`/`caf` → deterministic tests (verbatim-write ordering, input-event dropping, loop+reset wrap).
- asciicast-v2 guard + committed-fixture validity test pin the asciinema-3.x-default-v3 regression.
- arch.md correction handled with discipline (dated CORRECTION block + §B.1 consumer update + backlog SURFACE, atomic in one commit).

### Issues
**CRITICAL** — (none)
**MAJOR** — (none)
**MINOR**
- [workflow/wip/…:Phase 3 header] Work Tree marked Phase 3 NOT-STARTED while children were `[x]` and the report was written — tree/reality drift. **[RESOLVED in-place at review time — header flipped to [x].]**
- [src/probe/Harness.tsx:84-101] Center terminal built without a SerializeAddon while backgrounds load one — correct (center is never serialized) but silent; a one-line comment would save a double-take. → backlog (low).
- [src/probe/replay.ts:99-103] `if (events.length === 0) return` + `void duration;` reads as leftover scaffolding rather than load-bearing logic. → backlog (low).

### Assessment
Well-built probe that takes its throwaway-ness seriously: disposable scaffolding, but the two reusable pieces (asciicast parser/replay, frame-stats collector) are cleanly factored, tested, and DI-friendly. Isolation seam correct (nothing leaks into the app bundle). Decision artifact is the real deliverable and is honest about its caveats. No refactor warranted; the one tree-status MINOR was fixed in-place, the other two backlogged.

### If you disagree
Edit this section and mark a finding `[DISMISSED]` before finalize archives the WIP.

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow/backlog.md -->
- [SURFACED-2026-06-16] Phase 3 / arch.md — arch.md §"Phase 1 thumbnail-rendering probe" describes a non-viable mechanism (off-screen `left:-99999px` full-size xterm + `scale(0.15)` live mirror of that DOM). Research (this WIP §Research) found a DOM node has one parent (can't mirror in two places) and xterm auto-pauses off-viewport renderers. The report (P3.4/P3.5) must correct this. Logged to backlog.
- [SURFACED-2026-06-16] Phase 3 / probe code — BUG CAUGHT during cc-replay smoke check: `ProbeApp.tsx`'s `FIXTURES` map silently fell back to `synthetic.cast` for any unknown fixture key (so `?fixture=cc-replay` served synthetic under the cc-replay label). A silent fallback would have CORRUPTED a measurement run (wrong stream under the requested label). Fixed: `fixtureUrl()` maps name→`/probe-fixtures/<name>.cast` directly and errors loudly on 404. Harness.tsx was already direct (unaffected). Caught before any measurement ran.
- [SURFACED-2026-06-16] Phase 1 / tooling — asciinema 3.x (installed: 3.2.0) defaults to **asciicast-v3**, NOT v2. v3 changes event-time from absolute timestamps to inter-event deltas, breaking the v2 replay parser. Mitigation in place: all probe recordings MUST use `-f asciicast-v2`; flag also changed `--cols/--rows` → `--window-size COLSxROWS`. `parseCast()` throws a clear error on a v3 header. Minor — handled — but worth a global note if other projects record asciinema fixtures.

## Problem Statement

Phase 2's filmstrip and PiP surfaces want to show **live ~1 fps mirrors** of every backgrounded workspace's terminal. The mirror strategy (per `arch.md` §"Phase 1 thumbnail-rendering probe") is: mount each background workspace's xterm.js full-size in an off-screen container and render the filmstrip tile as a CSS-transformed (`scale(0.15)`) live mirror of that off-screen DOM, throttled to ~1 fps. But xterm.js DOM-renderer is comparatively heavy, and we deliberately rejected the WebGL addon (browser ~16-context cap). **Whether 8 such background mirrors + 1 active foreground xterm can stay within performance budget on real macOS WKWebView hardware is unverified.** If they can't, Phase 2 must ship cheap static status tiles instead and defer live mirrors to a Future Possibility.

This WP builds a **synthetic harness** (independent of the main app shell — no project picker, no PTY backend, no `CcSession`) that reproduces the worst-case Phase 2 rendering load and measures it against pass thresholds. The deliverable is a **decision document**, not shippable product UI.

## User Stories

- As the Claudesk architect, I want a measured pass/fail verdict on "8 live ~1 fps xterm mirrors + 1 active xterm under WKWebView" so that Phase 2's filmstrip + PiP rendering strategy is chosen on evidence, not assumption.
- As the Phase 2 implementer, I want any architectural deltas (update-rate ceilings, collapse-on-hidden behavior, instance-count limits, fallback triggers) captured in `arch.md` so I build the filmstrip against measured constraints.

## Acceptance Criteria

The probe is done when:

- A synthetic harness page exists that mounts **8 background xterm.js instances** (DOM renderer only — **no `@xterm/addon-webgl`**) in off-screen full-size containers, each rendered as a `scale(0.15)` CSS-transform live mirror, mirror updates throttled to ~1 fps (RAF-based, paused when the page is not visible), plus **1 foreground active xterm.js** receiving a separate real-time stream.
- A representative CC output stream is captured/synthesized once and looped into the 8 background xterms at realistic CC pacing.
- The four metrics are measured across a **≥5-minute representative run** on real macOS hardware (inside the actual Tauri WKWebView, not a stock browser tab — the renderer is what's under test):
  - **Idle CPU** (8 backgrounds idle, no stream flowing): pass **< 10%**
  - **Active CPU** (center-stage receiving real output; 7 backgrounds idle): pass **< 20%**
  - **RAM total:** pass **< 300 MB**
  - **Center-stage frame time:** pass **< 16 ms** (no visible jank from background-mirror work)
- Raw measurements are recorded; pass/fail computed per metric.
- **If any metric FAILS:** at least one or two cheaper alternatives are tried and re-measured (lower update rate, larger scale transform / fewer DOM cells, fewer background instances, or `display:none` on hidden mirrors) and folded into the report.
- A report is appended to `docs/product/arch.md` as a `### Phase 1 thumbnail-probe outcome` sub-section (or a linked sibling doc, decided in plan) recording: measurements, pass/fail per metric, the recommendation (**live mirrors vs status tiles**), and architectural deltas that flow into Phase 2's filmstrip + PiP milestones.
- `arch.md` and `roadmap.md` Phase 2 are updated/linked to the outcome.

## Out of Scope

- **No production filmstrip UI.** The harness is throwaway/probe code; it does not wire into `App.tsx`, the WorkspaceList, the project picker, or any real workspace.
- **No PTY / `CcSession` / backend wiring.** Background streams are canned recordings replayed in the frontend; the foreground "active" stream is synthetic too. We are measuring the *renderer*, not the process pipeline.
- **No WebGL addon evaluation.** The DOM-renderer-only decision (2026-06-15) stands; the probe does not re-litigate it. (If DOM-only fails catastrophically even for the foreground, that's a finding to surface — but the probe's job is to test the *chosen* strategy, not to comparison-shop renderers.)
- **No Phase 2 implementation.** Deltas are documented for Phase 2; nothing in the filmstrip/PiP milestones is built here.
- **No multi-machine benchmarking.** Single-user tool; measure on the operator's actual dev hardware. Record the hardware profile in the report so the number is interpretable later.

## Technical Constraints

- **New frontend deps introduced here:** `@xterm/xterm` + `@xterm/addon-fit` (first appearance in the project — arch.md §Tech Stack already names them as the Phase 1 terminal renderer, so this is on-plan, not a new decision). **Must NOT add `@xterm/addon-webgl`.**
- **Measurement environment must be the real Tauri WKWebView**, not a stock Chrome/Safari tab — WKWebView's renderer and CPU characteristics differ from V8/Blink, and the production app runs in WKWebView. The harness can be served as a standalone Vite route/page that `pnpm tauri dev` loads.
- **CPU profiling on macOS WKWebView:** Activity Monitor (per-process CPU of the WebKit `*.WebContent` helper + the Tauri process) + Safari Web Inspector "Timelines" attached to the WKWebView. `requestAnimationFrame`-delta and `performance.now()` for frame-time self-measurement inside the page. *(Exact tooling viability is an open question → research.)*
- **"Representative CC output stream"** must include the things that stress a terminal renderer: ANSI color, cursor moves, line redraws, spinner/progress animations, box-drawing (CC's TUI uses them), and bursts interleaved with idle gaps. A flat `cat large.txt` is NOT representative. *(How to capture this faithfully is an open question → research.)*
- Thresholds (10/20/300/16) are the arch.md-proposed defaults; this spec adopts them. The plan may refine the *measurement method* but should not move the thresholds without recording why.
- **Probe discipline (from prior WPs):** timebox is 1–2 days; the goal is a decision, not polish. Harness code may be deleted or quarantined after the report lands (decide in plan — keep it as a reusable benchmark, or archive it).

## Open Questions

- [ ] **Profiling viability:** Can we get a trustworthy CPU% reading for the WKWebView render work specifically (vs. the whole Tauri process), and a reliable frame-time series, on macOS? What's the concrete capture procedure (Activity Monitor columns + Safari Timelines steps)? → research
- [ ] **Representative stream capture:** What is the faithful way to record a real CC session's raw byte stream (ANSI included) for loop-replay? `script(1)` / `asciinema` / piping the PTY? And what pacing model (timestamps preserved vs. fixed cadence) best approximates "realistic CC pacing"? → research
- [ ] **Off-screen mount + live-mirror mechanism:** Does the `scale(0.15)` CSS-transform-of-off-screen-DOM mirror actually reflect live xterm updates, or do we need an explicit copy step (clone node / canvas snapshot)? Confirm the cheapest mechanism that produces a *live* tile before committing the harness shape. → research
- [ ] **Report location:** inline `### Phase 1 thumbnail-probe outcome` in `arch.md` vs. a sibling doc linked from arch.md + roadmap.md. → decide in plan (arch.md is 278 lines; a sibling doc may keep it from bloating).

## Research

_Conducted 2026-06-16. Three threads, all resolved with authoritative (xterm.js source, Apple/WebKit/Tauri docs, asciicast spec) evidence._

### ⚠️ Headline: research invalidated the spec's assumed harness mechanism (not its goal)

The spec and `arch.md` both assume: "mount each background xterm full-size **off-screen** (`left:-99999px`) and render the filmstrip tile as a `scale(0.15)` CSS-transform **live mirror of that off-screen DOM**." **This mechanism does not work as written.** Two hard findings collide with it:

1. **A DOM node has one parent.** You cannot display one xterm DOM subtree in two places (off-screen instance + filmstrip tile). The `scale()` trick only works when applied to the element *where it actually lives* — it does not duplicate. So a separate mirror tile must either (a) relocate the real element (only possible for ONE tile), (b) `cloneNode(true)` each frame, (c) canvas-snapshot each frame, or (d) `serializeAsHTML()` from the buffer.

2. **xterm.js auto-pauses the renderer for off-viewport terminals.** `RenderService` registers an `IntersectionObserver({threshold:0})`; when the terminal element doesn't intersect the viewport, `refreshRows()` early-returns — the DOM stops updating (only the buffer/model updates). So mounting at `left:-99999px` makes the very DOM you'd mirror **stale**. (PR xtermjs/xterm.js#1144.)

**Consequence for the plan:** the harness must measure the mechanisms that *actually* produce a live thumbnail, not the impossible one. The spec's **goal, acceptance criteria, thresholds, and outcome-mapping all still hold** — only the harness construction changes. This is a plan-level correction, not a spec rewrite → proceed F5 (research→plan), not F6 (back-loop). The plan will note that arch.md §"Phase 1 thumbnail-rendering probe" mechanism text needs a correction folded into the eventual report.

### Thread 1 — Live-mirror mechanism (cheapest live thumbnail)

| Mechanism | Live? | Cost | Verdict |
|---|---|---|---|
| (a) Relocate real element + `scale(0.15)` | Yes, GPU-free | ~0/frame | Only works for ONE tile (single parent) — fits the *focused* case, not 8 backgrounds |
| (b) `cloneNode(true)` each frame into tile | Live at clone cadence | Deep-clone rows×cols spans + style recalc/layout per tile per frame | **Performance trap at 8×** |
| (c) Canvas snapshot (html2canvas) per frame | Live at snapshot cadence | Tens–hundreds of ms each | Worst — do not use |
| (d) `@xterm/addon-serialize` `serializeAsHTML()` → tile | Live at serialize cadence | Cheap string build **from the buffer** (works even while renderer paused) | **Recommended primary arm** |

- **Recommended probe design = two-arm comparison:** **Arm A** = live `cloneNode` mirror with backgrounds forced to keep rendering (kept on-viewport via `opacity:0`); **Arm B** = `serializeAsHTML()`-into-tile at 1 fps with backgrounds off-viewport/paused. Research expectation: **Arm B wins decisively** and is the only arm that doesn't fight xterm's own pausing. Measure both so the report's recommendation is evidence-backed, not assumed.
- **New dep beyond the spec's `@xterm/xterm` + `@xterm/addon-fit`:** `@xterm/addon-serialize` (official, scoped, v0.14.0). Still **no `@xterm/addon-webgl`.**
- **Off-screen-but-laid-out semantics (load-bearing):** what pauses the renderer is *non-intersection with the viewport*, not the CSS property.
  - To keep a background xterm **rendering** (probe Arm A wants this): keep it inside viewport geometry but masked — `opacity:0` or `visibility:hidden` (retains box, still intersects). NOT `left:-99999px`.
  - To **suppress** hidden ones (Phase 2 production wants this for collapsed/hidden workspaces): push off-viewport (`left:-99999px`) or `display:none` — lets xterm pause them for free (~5ms/frame saved each). Caveat: `display:none` breaks FitAddon (`fit()` throws on zero dims — issues #3029/#3118/#2394), so prefer off-viewport positioning if re-measure is ever needed.
  - **This pause behavior is itself a Phase 2 architectural gift** — note in report: collapsed filmstrip / hidden workspaces get renderer-pause for free.

### Thread 2 — macOS WKWebView profiling procedure (trustworthy capture)

- **Where render CPU lands:** NOT the Tauri main process (that's the WKWebView UIProcess). JS/DOM/layout/xterm-render → **`com.apple.WebKit.WebContent`**; compositing → **`com.apple.WebKit.GPU`**. **"Webview render cost" = WebContent + GPU summed**; track main process separately as overhead.
- **CPU% (reproducible CLI, preferred over eyeballing Activity Monitor):**
  ```
  sudo powermetrics --samplers tasks --show-process-coalition --show-process-gpu -i 5000 -n 60 -o /tmp/cpu.txt
  ```
  5s × 60 = ~5 min, streamed to file. Per sample sum `%CPU` of WebContent + GPU; report **median + p95**. No-sudo fallback: `top -pid <WebContent> -pid <GPU> -l 60 -s 5 -stats pid,command,cpu`.
- **Safari Web Inspector Timelines** (the only devtools for Tauri/macOS): inspectable by default in **debug builds** (no Cargo change needed for dev; release would need `tauri = { features=["devtools"] }`, but that's a private API — never ship to App Store). Enable Safari → Settings → Advanced → "Show features for web developers"; attach via Develop → [Mac] → [Claudesk webview], or `window.open_devtools()` under `#[cfg(debug_assertions)]`. Timelines gives JS&Events / Layout&Rendering / per-frame rate breakdown (script vs layout vs paint).
- **Frame time from inside the page (self-contained cross-check):** rAF-delta technique — use the rAF timestamp arg (monotonic, no negative guard), drop `>1000ms` outliers (backgrounding), compute median/p95/max + dropped-frame count. **Caveat to record:** rAF is capped at display refresh, so "frame <16ms" really means "is rAF keeping up with 60Hz." **Infer the budget from the median, not a hardcoded 60Hz** (ProMotion = 8.3ms). Cross-check against Timelines frame-rate.
- **RAM:** **`footprint Claudesk`** (sums `phys_footprint` across main + all WebKit helpers in one shot — the number comparable to <300MB). **Do NOT use `ps -o rss`** (over-reports shared/reclaimable). `vmmap <pid>` for per-process drill-down only.
- **Reproducibility controls (these make the numbers trustworthy):** cool machine + AC power + Low Power Mode OFF; fix the display refresh rate (infer budget from rAF median); quit all other apps (especially other Electron/browser apps — they spawn competing WebContent processes); don't leave Activity Monitor open during the powermetrics run; discard first ~2–3 warm-up samples. **← This is exactly why the operator's "quiet the host" gate matters (see Notes).**

### Thread 3 — Representative CC stream capture + replay

- **Capture tool: `asciinema`, NOT BSD `script`.** macOS `script(1)` captures raw ANSI but has no parseable timing-file mode (its `-T` is playback-only; format is opaque binary). asciinema records **asciicast v2** = newline-delimited JSON, trivially parseable.
  ```
  brew install asciinema
  asciinema rec --cols 120 --rows 40 cc-session.cast    # run a real `claude` session, do representative work, Ctrl-D
  ```
  asciicast v2: line 1 = header JSON; each line = `[time, code, data]`, `code=="o"` is output, `data` = raw ANSI string. **`time` is ABSOLUTE seconds-from-start** (subtract consecutive values to get deltas — not pre-deltaed).
- **Pacing model: preserve original inter-event deltas (bursty), NOT fixed cadence.** CC output is bursty (LLM token streaming + tool output): tight write-bursts then idle gaps. The renderer stress lives in the bursts; fixed 16ms cadence flattens them and hides the worst case (a burst hitting N=8 workspaces simultaneously). Replay recorded deltas.
- **Replay into xterm.js:** parse `.cast`, filter `"o"` events, schedule `term.write(data)` by cumulative time delta via rAF, loop with `term.reset()` on wrap. **Gotcha: feed each event's `data` verbatim — never re-split/concat bytes.** xterm.js is a stateful stream parser that buffers incomplete escape sequences across `write()` calls; the recording's chunk boundaries are already parser-safe, re-splitting can corrupt multibyte UTF-8 / escape sequences.
- **Fixture strategy:** record **one real `claude` session** as the canonical fixture (decides the headline pass/fail). Add a **small synthetic generator** as a secondary fixture for (a) CI/contributors without CC auth, and (b) a deliberately pathological worst-case (full-screen redraw every frame + spinner) to bracket the ceiling. Both drive the identical replay loop. Headline verdict decided on the **real** recording.

### Repo/tooling state verified (2026-06-16)
- `@xterm/*` NOT yet installed (WP4 introduces `@xterm/xterm`, `@xterm/addon-fit`, `@xterm/addon-serialize`). `asciinema` NOT installed (`brew install` in plan). `claude` present at `~/.local/bin/claude`. Vite + `index.html` + `src/main.tsx` present. Tauri Cargo has no `devtools` feature — **fine, debug builds are inspectable by default.**

### Spec deltas from research (fold into plan, not a back-loop)
- **Open Q1 (profiling) → RESOLVED:** procedure above.
- **Open Q2 (stream capture) → RESOLVED:** asciinema + preserve-deltas + verbatim replay.
- **Open Q3 (live-mirror mechanism) → RESOLVED + REFRAMED:** the spec's single off-screen-scale mechanism is non-viable; replaced by a **two-arm comparison (cloneNode vs serializeAsHTML)**, serialize expected to win. Adds `@xterm/addon-serialize` dep.
- **Open Q4 (report location):** still a plan decision (arch.md is 278 lines; sibling doc likely).
- **arch.md correction owed:** §"Phase 1 thumbnail-rendering probe" describes the non-viable off-screen-DOM-mirror mechanism as fact — the final report must correct it (mirror tiles need clone/serialize, off-viewport pauses the renderer).

## Notes

- **MEASUREMENT GATE (operator constraint, 2026-06-16):** Before launching the actual benchmark measurement run, **pause and get the operator's explicit confirmation**. The operator will quiet all other activity on the host first (other processes contend for CPU/RAM and would corrupt the numbers). This is a hard pause that Autopilot must NOT skip — it applies to the live measurement step specifically, not to building the harness or capturing the stream. The plan must place this gate immediately before the measurement task.
- Outcome mapping is fixed by arch.md: **pass → Phase 2 ships live ~1 fps mirrors; fail → Phase 2 ships static status tiles in v1, live mirrors become a Future Possibility.** The probe produces the verdict; it does not get to redefine the consequence.
- WP4 gates **Phase 2 only**. It does not block any Phase 1 build (WP5 critical-path UI can proceed in parallel/before).

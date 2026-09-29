---
drive_mode: autopilot
---

# Feature: M16 WP1 — Probe: media in the real WKWebView

**Workflow:** feature
**State:** Completed 2026-09-29 (finalize)
**Created:** 2026-09-29
**WBS:** `workflow-system/product/wbs.md` → WP1 (tasks 1.1–1.9). The rulings are settled there.

## Problem Statement

M16 puts images, SVG, PDF, audio and video into the editor's existing file tab. Both build WPs
(WP2 and WP3) stand on one transport, the Tauri **asset protocol** with a root scope added at
runtime, and on platform behaviors nobody has measured in *this* WKWebView:
- which codecs play
- whether range-request seeking works
- whether an escaping symlink is refused
- whether `requestVideoFrameCallback` exists
- whether element fullscreen works
- whether a PDF renders natively

The dev origin (`http://localhost:1420`) differs from the bundled origin (`tauri://localhost`), so a
dev-only answer proves nothing about the installed build. This probe answers those questions with a
format × build matrix and a **GO / NO-GO** on the transport. **NO-GO goes back to `/product-arch`**;
it is not worked around with base64 IPC. Output is knowledge, and the probe code is throwaway.

**Planning decisions taken here (cheap to reverse, disclosed):**
- **"Probe branch only" in the WBS means a probe-only CODE PATH, not a git branch** (the branch
  policy is: never auto-branch). The `protocol-asset` Cargo feature and `assetProtocol.enable` go
  into the real config with an **empty static scope**, so nothing is reachable until a runtime
  allow. The runtime-allow command is `#[cfg(debug_assertions)]`-gated so it never ships in
  release. WP2 either keeps or replaces both.
- **The "installed-style" build is `pnpm tauri build --debug --config src-tauri/tauri.dev.json`,
  launched with `open` (LaunchServices, the same launch path as Finder).** A debug bundle serves
  from the **bundled `tauri://localhost` origin**, which is the property under test, while still
  carrying the MCP bridge (`#[cfg(debug_assertions)]`), so the agent can drive it. It uses the dev
  identity, so it never collides with the operator's installed prod app. **No release is cut, and
  no `brew upgrade`.** What it does NOT prove, and is recorded as deferred to `/release`: a
  **release**-profile build with hardened runtime + notarization. `bundle.macOS.hardenedRuntime:
  true` is set in `tauri.conf.json`, so this is checked by reading the debug bundle's code-signing
  flags rather than assumed.

## Work Tree

- [x] Phase 1: Probe harness + the dev-origin matrix
  **Observable outcomes:**
  - CLI: `ls tmp/scratch/media-probe/` lists the fixture set: png, jpg, gif, webp, heic, svg,
    svg-with-`<script>`, H.264 mp4, HEVC mp4, mov, webm, mkv, mp3, m4a, wav, flac, ogg, pdf, a
    ≥300 MB H.264 mp4 (`ffprobe` duration ≥ 10 min), and a copy of
    `scripture-reading/assets/renders/pilot-psalms-v1.mp4`. There is also `escape-link →` a file
    outside the scratch root, a `.hidden/` dir holding a png, and `not-media.bin`.
  - CLI: `cargo build` succeeds with `protocol-asset`. `grep -c protocol-asset src-tauri/Cargo.toml`
    = 1.
  - Browser (MCP bridge, `pnpm tauri:dev`, `?mediaprobe`): the probe page runs the matrix and
    exposes `window.__mediaProbe` as JSON with one row per fixture:
    `{file, kind, loaded:boolean, error:(MediaError.code|string|null), hang:boolean, w, h, duration, seekOk:boolean|null, seekLandedAt:number|null}`.
    `hang:true` means no `load`/`loadedmetadata`/`error` within 10 s.
  - Browser: the H.264 mp4 row has `loaded:true, seekOk:true` with `|seekLandedAt - target| < 1 s`,
    for a target ≥ 5 minutes in on the ≥300 MB file. That proves range requests.
  - Browser: the `escape-link` row and an out-of-root absolute path row both show `loaded:false`
    (refused by the asset scope). A **positive control** (an in-root png) shows `loaded:true` in the
    same run.
  - Browser: the svg-with-`<script>` row loads as `<img>`, and `window.__svgScriptRan` stays
    `undefined` (the script would set it). A positive control that injects the same SVG inline as
    markup sets it, proving the detector can see a run.
  - Browser: `window.__mediaProbe.rvfc` reports `{present:boolean, fpsEstimate:number|null}` for the
    H.264 fixture (ffprobe's `r_frame_rate` is the reference).
  - Browser: `window.__mediaProbe.pdf` reports whether an `<iframe>` and an `<embed>` pointing at the
    asset-URL PDF produce a non-blank render. This is judged by a `webview_screenshot` of the region,
    not by DOM presence, because a PDF plugin frame has no inspectable DOM.
  - Console: no uncaught errors on probe load (via a self-tested `window` `error` tap, because
    `read_logs` console capture is known empty).
  **Alignment questions:**
  - Fullscreen: when the operator clicks the native `<video>` fullscreen button on the probe page,
    does the video go fullscreen and return cleanly? (It needs a physical click, since a
    user-gesture requirement blocks a scripted `requestFullscreen`. The agent tries the scripted
    call first and records the result.)
  - [x] P1.1 Fixture generator `tmp/scratch/media-probe/make-fixtures.sh` (ffmpeg / sips /
        afconvert). Copy, do not move, the real pilot render. It is gitignored scratch, never
        committed.  <!-- status: done -->
  - [x] P1.2 Backend: add the `protocol-asset` feature, `assetProtocol: {enable: true, scope: []}`,
        and a `media_probe_allow(root)` command. It is **always registered** in `generate_handler!`, but its body (`app.asset_protocol_scope().allow_directory(root, true)`) compiles **only under `debug_assertions`**; the release arm returns `Err`. *(Wording corrected at finalize; it previously said "Registered only in debug".)*
        <!-- status: done -->
  - [x] P1.3 `src/probe/media/MediaProbeApp.tsx`: lazy-mounted on `?mediaprobe` in `main.tsx`
        beside the existing probe flags. It runs the matrix (1.3), the confinement + SVG-script
        checks (1.4), rVFC (1.5), a fullscreen attempt (1.6) and the PDF frames (1.7), then
        publishes `window.__mediaProbe`.  <!-- status: done -->
  - [x] verify-auto  <!-- status: done -->
    - `pnpm verify:auto` → EXIT=0 in 109s: lint 0 errors (1 pre-existing XtermPane warning) · format:check ok · tsc ok · `check:link` "every entry linked cleanly (main, pip)" · vitest 245 files / 3221 tests passed · cargo fmt ok · clippy `-D warnings` ok · cargo test 1007 lib + all integration targets ok (incl. `sync_commands_do_not_block`, which saw the new sync `media_probe_allow`).
  - [x] verify-self  <!-- status: done -->
    ⚠️ Driven **from the orchestrator through the MCP bridge**, not a spawned runner. The `mcp__tauri__*` tools do not reach subagents (`[[mcp-bridge-tools-not-exposed-to-subagents]]`), and a runner would silently fall back to bare Vite, which cannot load `asset://` at all. Dev app launched with the full Claude-marker `env -u` strip; origin `http://localhost:1420`.
    - [x] O1 fixtures: 25 files plus later discriminators (`pilot-trim-10min.mp4`, `synth-under-4g.mp4` 4,038,716,657 B, `synth-over-4g.mp4` 5,050,771,404 B, `inner-link.png`). `large.mp4` = 660 s / 336,561,210 B. Pilot = 4,865,095,788 B, 8106 s, 1080p24 High@4.0 yuv420p, faststart. — evidence: `ls -la` + `ffprobe`. (webp comes from `cwebp`, since ffmpeg has no webp encoder.)
    - [x] O2 `cargo build` with `protocol-asset` → Finished; `grep -c protocol-asset Cargo.toml` = 2 (the feature plus its comment line — PASS in intent; the outcome's "= 1" did not anticipate the comment). — evidence: build log.
    - [x] O3 `window.__mediaProbe` published, `done:true`, 24 rows + an ABS out-of-root row; `allow:"ok"`; asset URL form `asset://localhost/<percent-encoded abs path>`. — evidence: bridge read.
    - [x] O4 range + far seek: `fetch` Range `bytes=0-99` → **206**, `content-range: bytes 0-99/336561210`. `large.mp4` seek target 400 s → `seekLandedAt` 400, `readyState ≥ 2`. — evidence: `__mediaProbe.range` / rows.
    - [x] O5 confinement: `escape-link.png` → error, ABS `…/media-probe-outside/outside.png` → error, positive control `image.png` → load 640×480 in the same run. **Symlink control:** in-root `inner-link.png` → load 640 while `escape-link.png` → error, so the scope **resolves symlinks** and refuses on escape, not on "is a symlink". Also: `.hidden/hidden.png` → **error**, because the default scope does not match dot-paths. — evidence: bridge reads `__mediaProbe.rows`, `__lnk`.
    - [x] O6 SVG script: `script.svg` in `<img>` loads (160×96) with `imgRan:false`. The `<object>` control **ran** it (`objectControlRan:true`, 1 postMessage), so the detector can see a run. — evidence: `__mediaProbe.svg`.
    - [x] O7 rVFC: present. `h264.mp4` → 40 samples, median Δ 0.03333 → **fpsEstimate 30** (ffprobe `r_frame_rate` 30/1). The pilot row reports `NotSupportedError` because the file itself does not load (the ≥4 GiB finding below). — evidence: `__mediaProbe.rvfc`.
    - [x] O8 PDF: **both `<iframe>` and `<embed>` render the page natively** over the asset URL, with no bundled renderer. — evidence: `scratchpad/pdf.jpg` (webview_screenshot).
    - [x] O9 console: tap self-test `tapWorks:true`, `errors:[]`. — evidence: `__mediaProbe`.
    - [x] align: fullscreen — evidence: `fullscreenEnabled:true`, `webkitFullscreenEnabled:true`, `requestFullscreen` present; the scripted call is **rejected: "Cannot request fullscreen without transient activation"**. A physical click is needed for the verdict, so this goes to the operator.
    - **Format matrix (dev origin):** image png/jpg/gif/webp/heic/svg ✅ · video H.264 mp4 ✅, HEVC mp4 ✅, ProRes mov ✅ (`canPlayType` "maybe"), **VP9 webm ✅**, **mkv ❌** (MEDIA_ERR 4, `canPlayType` ""), large 660 s mp4 ✅ + seek · audio mp3/m4a/wav/flac ✅, **ogg vorbis ✅, ogg opus ✅** · not-media.bin ❌ (img error) · every failure is a fast `error` event, **never a hang** (`hang:false` on all rows).
    - ⚠️ **LOAD-BEARING FINDING: a media file of 4 GiB or more does NOT load over ANY custom URL scheme.** The real `scripture-reading` render (4.86 GB) → MEDIA_ERR 4 within ~60 ms.
      - A 10-min **stream-copied** cut of the same file plays (1920 wide, 600 s), so the codec is not the cause.
      - Synthetic files from the one working stream: **4.04 GB plays and seeks to 7000 s; 5.05 GB fails** (MEDIA_ERR 4, 68 ms).
      - Over **plain HTTP** (Vite, same WebKit) the 5.05 GB file **plays** (9900 s), so WebKit's media stack is not the limit.
      - A hand-written u64-correct `mprobe://` scheme handler **fails identically**. Its log shows WebKit issuing 8-byte atom-header ranges (0-1, 0-7, 32-39 … 10756466-10756473), then giving up, while each 206 carried the correct `/5050771404` total.
      - `fetch` over `asset://` past 4 GiB returns correct 206s. It is only **media loading over a custom scheme** that caps at 2³².
      - **Consequence:** the asset protocol is GO for every file under 4 GiB. For files of 4 GiB or more, the only in-webview transport measured to work is **HTTP** (a loopback server), which is an architecture decision. That is the operator's call at verify-human.
    - Observed for WP3: after a paused seek, tiles report `readyState ≥ 2` but **paint no frame** (`preload="metadata"`). WP3 should check `preload="auto"` or a play-pause nudge before promising a frame on seek.
  - [x] verify-human  <!-- status: done -->
    - [x] P1.verify-human.1 ≥ 4 GiB decision → **(a) the 4 GiB cap** (operator, 2026-09-29). No loopback HTTP and no arch back-loop; `asset://` stays the only transport. **Plus an "Open in default app" ICON BUTTON in the right-panel tab-row launcher cluster** (beside Sublime Text / Sublime Merge / Finder). It acts on the active editor file tab via `/usr/bin/open`, root-confined, and works for ANY file. The ≥ 4 GiB info card points to it.  <!-- status: done -->
    - [x] P1.verify-human.2 fullscreen → **native `<video>` fullscreen works** (operator clicked, entered and exited). Quitting the app while a video is fullscreen is **explicitly out of scope**, not an edge case to handle.  <!-- status: done -->
  - [x] verify-codify  <!-- status: done -->
    - The probe code (`src/probe/media/`, `media_probe/`, `mprobe://`) is **throwaway** and gets no tests; WP2 deletes it. No integration boundary is codified: the only touch to an existing surface is a `?mediaprobe` routing flag in `main.tsx`.
    - **Durable invariant codified:** `src-tauri/tests/asset_protocol_scope.rs` (2 tests). `tauri.conf.json` must have `assetProtocol.enable: true` with `scope: []`, and `tauri.dev.json` must not carry an `assetProtocol` block. **Mutation-proven individually:** `scope: ["**"]` → the base test fails; an injected dev-overlay block → the overlay test fails. Both configs were restored and their shasums matched.
    - Full gate: `pnpm verify:auto` EXIT=0 in 46 s (vitest 3221, cargo 1007 lib + all integration targets incl. the new one). The first run failed only on `cargo fmt --check` of the probe handler; fixed with `cargo fmt`.

- [x] Phase 2: Bundled-origin parity + GO/NO-GO recorded
  **Relevance check (before Phase 2):**
  - Requester still needs this: yes. The dev origin differs from `tauri://localhost`, and WP2 must not assume dev parity.
  - Requirements unchanged: yes, with one addition from P1.verify-human.1: the parity rows now also include `synth-over-4g.mp4`, to confirm the 4 GiB cap holds on the bundled origin too.
  - Solution still feasible: yes. A debug bundle carries the MCP bridge and serves from the bundled origin.
  - No superior alternative discovered: yes.
  **Verdict:** proceed
  **Observable outcomes:**
  - CLI: `pnpm tauri build --debug --config src-tauri/tauri.dev.json` exits 0, and
    `codesign -dv --verbose=4 <bundle>` output is captured (it records whether the runtime flag is
    present on this build).
  - CLI: the bundle is launched with `open <bundle>`. `ps -o command= -p <pid>` shows the bundle
    binary, and only that PID is torn down afterwards.
  - Browser (MCP bridge against the bundled app, `window.location.origin === "tauri://localhost"`
    asserted first): the `?mediaprobe` matrix re-runs, and the rows for **H.264 mp4 (with the
    ≥5 min seek), png, svg, svg-script, pdf, escape-link and one unplayable file** match Phase 1's
    values. Any divergence is recorded, not smoothed over.
  - CLI: `wbs.md` → "Probe outcomes" contains the format × build matrix, the **GO / NO-GO** line,
    the measured CSP-exposure paragraph, the rVFC/fps finding, the fullscreen finding and the PDF
    finding. Any ruling whose premise changed is updated in the same commit.
  **Alignment questions:**
  - GO / NO-GO: does the recorded matrix support WP2 as ruled (especially PDF in or out, and
    frame-step measured or fixed at 1/30 s)? The operator owns the go decision for WP2's scope.
  - [x] P2.1 Build the debug bundle, launch it via `open`, drive `?mediaprobe` through the bridge,
        and capture the rows.  <!-- status: done -->
  - [x] P2.2 Write "Probe outcomes" in `wbs.md` and update any ruling premises. Write the CSP
        paragraph from measured values only.  <!-- status: done -->
  - [x] verify-auto  <!-- status: done -->
    - This phase changed docs only: `git diff --stat -- src src-tauri` is empty; only `wbs.md` and this WIP changed. The Phase 1 gate (`pnpm verify:auto` EXIT=0, `c1d68f5`) still covers all code.
    - `wbs.md` scoped checks: code fences balanced; the matrix table has 5 rows; both cited paths resolve (`src-tauri/tests/asset_protocol_scope.rs` exists; the WIP archive path becomes true at finalize).
  - [x] verify-self  <!-- status: done -->
    Driven from the orchestrator through the MCP bridge against the **bundle** (same deviation as Phase 1: the bridge is orchestrator-only). No integration boundary: this phase changed docs only.
    - [x] O1 `pnpm tauri build --debug --bundles app --config src-tauri/tauri.dev.json --config '{"bundle":{"createUpdaterArtifacts":false}}'` → EXIT 0 in 40 s, bundle `target/debug/bundle/macos/Claudesk Dev.app` (`CFBundleIdentifier` `com.claudesk.app.dev`). `codesign -dv --verbose=4` → `flags=0x20002(adhoc,linker-signed)`, `Signature=adhoc`, **no runtime flag**, so hardened runtime was NOT exercised → deferred to `/release`. (`--bundles app` + `createUpdaterArtifacts:false`: the updater artifacts need the signing key, and a debug parity check has no use for them.)
    - [x] O2 launched with `open "Claudesk Dev.app"` → PID 75490, `ps -o command=` = `…/Claudesk Dev.app/Contents/MacOS/claudesk`. Torn down with `kill 75490` only; `kill -0` confirmed it gone. The dev `tauri:dev` chain (PIDs 17441/17445/17606/55875, all mine) was stopped first, because both share port 9223 and the identifier.
    - [x] O3 `location.origin === "tauri://localhost"` asserted before the run (`href` `tauri://localhost?mediaprobe`). The full matrix re-ran: **all 24 rows plus the ABS row are identical to Phase 1** (same loaded/error/w/h/duration/seek values, incl. `large.mp4` 400 → 400 and the pilot at MEDIA_ERR 4). Range 206 `bytes 0-99/336561210`, rVFC 30.000 fps, SVG `imgRan:false` / `objectControlRan:true`, `errors:[]` with `tapWorks:true`. Extra bundled rows: `synth-under-4g` → meta 7920 s, `synth-over-4g` → **MEDIA_ERR 4** (the cap holds on the bundled origin), `inner-link.png` → load 640. PDF: both frames render (`scratchpad/pdf-bundled.jpg`). — evidence: bridge reads `__mediaProbe`, `__b`.
    - [x] O4 `wbs.md` → "Probe outcomes" carries the matrix, the **GO** line (with the 4 GiB cap), the measured CSP paragraph, and the rVFC, fullscreen and PDF findings. The ruling lines were updated in the same edit (PDF ✅ IN, fps measured, R-4a/b/c). — evidence: `grep -n "Probe outcomes\|GO / NO-GO\|CSP statement" wbs.md`.
    - [x] align: GO / NO-GO for WP2's scope — evidence: the matrix favors WP2 as ruled. PDF is IN (native render in both builds), frame-step uses measured fps, and the only reduction is the 4 GiB cap the operator already ruled at P1.verify-human.1.
  - [x] verify-human  <!-- status: done -->
    - Zero admissible leaves (autopilot → F11). The GO decision was already taken at P1.verify-human.1 (4 GiB cap + button); the matrix only confirmed rulings. The hardened-runtime gap is deferred to `/release` per standing practice. Dot-path refusal goes to the WP2 spec.
  - [x] verify-codify  <!-- status: done -->
    - Nothing new to codify: docs-only, no integration boundary. The durable invariant (the empty static asset scope) was codified at Phase 1. Full gate `pnpm verify:auto` EXIT=0 in 98 s (vitest 3221, cargo 1007 lib + all integration targets).

## Current Node
- **Path:** Feature > complete (archived)
- **Active scope:** none
- **Blocked:** none
- **Unvisited:** none (Phase 2 is the last phase)
- **Open discoveries:** SURFACE-2026-09-29-MEDIA-OVER-CUSTOM-SCHEME-CAPS-AT-4GIB — DECIDED (a) at P1.verify-human.1; closes with WP1

## Code-Quality Review

*(feature-review-quality on ship commit `3bb81c5`, window `c1d68f5^..3bb81c5`; drive_mode=autopilot. 0 CRITICAL, 1 MAJOR, 5 MINOR, all auto-backlogged to `backlog-quality-findings.md` under `# m16-wp1-media-probe — 2026-09-29`.)*

### Strengths
- `tests/asset_protocol_scope.rs` pins the one security property that actually ships: an empty static scope, plus no `assetProtocol` block in the dev overlay. Its rationale is stated, and each test was mutation-proven on its own.
- The release gating is decided when the code compiles: `media_probe_allow` has a `cfg(not(debug_assertions))` arm that only returns `Err`, and `mprobe://` is registered only in debug builds.
- The harness checks its own instruments: a self-tested error listener, an SVG `<object>` control that does run its script, and an in-root symlink control.
- The 4 GiB tests narrow the cause cleanly (a trimmed cut, 4.04 vs 5.05 GB synthetic files, HTTP, and a hand-written scheme), which stops WP2 from trying to fix the wrong layer.
- Every probe touch point carries a greppable `M16 WP1 PROBE (throwaway)` marker.

### Issues
**CRITICAL**
- (none)

**MAJOR**
- [`wbs.md` task 2.1] It lists the already-landed `protocol-asset` feature and `assetProtocol` config as new work, and never schedules deleting the probe (`media_probe/`, the `mprobe://` registration, `media_probe_allow` in `generate_handler!`, `src/probe/media/`, the `?mediaprobe` flag). Left in place, the dev build keeps two unconfined read paths: `media_probe_allow` allows any root with no `validate_root`, and `mprobe://` serves any absolute path with `ACAO: *`.

**MINOR**
- [`media_probe/mod.rs` buffer sizing] `(end - start + 1)` underflows, and `start + CHUNK - 1` can overflow, when a Range start is at or past EOF. That is a debug-only panic path.
- [`Cargo.toml` `tauri` features comment] The durable `protocol-asset` feature is labeled "M16 WP1 probe", so a probe-cleanup sweep could remove it.
- [WIP P1.2] Says `media_probe_allow` is "Registered only in debug"; in fact it is always registered, and only its body is gated by `cfg`.
- [`MediaProbeApp.tsx` `DEFAULT_ROOT`] Hardcodes an operator home path into the release frontend bundle. `?mediaprobe` is not gated to dev.
- [`wbs.md` task 2.3] The R-4b splice repeats `open_in_default_app(root, path)`.
- [`runtimes.md` `pnpm verify:auto`] The later 46 s and 98 s runs were not added to History.

### Assessment
Well built for a timeboxed probe. What ships is small, guarded, and pinned by mutation-proven tests. The debt is in the plan, not the code: WP2 task 2.1 has to schedule the probe's deletion.

### If you disagree
Edit this section and mark a finding `[DISMISSED]` before `feature-finalize` archives the WIP.

## Retrospect
- **What changed in our understanding:**
  - **WebKit will not load media of 4 GiB or more over any custom URL scheme**, while HTTP works. So the transport choice has a size ceiling that no scheme handler can fix, and the media workspace's real output sits above it.
  - WKWebView plays more than assumed: VP9 webm, ogg vorbis/opus, ProRes and HEIC all work. Only mkv fails.
  - The asset scope resolves symlinks and refuses dot-paths by default.
- **Assumptions that held:**
  - The asset protocol streams with range requests (a 206 comes back and a far seek works).
  - `<img>` does not run SVG script.
  - PDF renders natively.
  - `requestVideoFrameCallback` exists and gives an exact fps.
  - Dev and the bundled origin behave identically.
- **Assumptions that were wrong:**
  - "The pilot uses a standard codec, so it will play." Size, not codec, decided it.
  - "Exit fullscreen is broken" was my misreading of the operator. Fullscreen works; they meant *no need to handle quitting while fullscreen*.
- **Approach delta:**
  - A mid-probe discriminator chain was added that the plan did not foresee: a trimmed cut, 4.04/5.05 GB synthetic files, HTTP, and a hand-rolled `mprobe://` scheme. It was worth its cost, because without it the transport would have been blamed and redesigned.
  - The installed-style tier used a **debug** `.app` via `open` rather than a release build, so hardened runtime is deferred to `/release`.
  - The code-quality review caught that WP2's plan never scheduled the probe's deletion, and that was fixed in `wbs.md` 2.1 at finalize.

## Closure
> **Feature complete:** M16 WP1 (media probe) has shipped. It measured, in the real WKWebView on both the dev and bundled origins, which images, video, audio and PDFs Claudesk can show over the asset protocol, and found a hard 4 GiB ceiling for audio and video. The format matrix and the GO line are in `workflow-system/product/wbs.md` → "Probe outcomes".

Requester = operator — closure notice for self-record.

## Discoveries
- 2026-09-29 build notes: ffmpeg here has no webp or libvorbis encoder, so webp comes from `cwebp` and ogg from the native `vorbis` encoder (plus an opus ogg). The real pilot render is a 4.8 GB 1080p24 H.264 file, cloned with `cp -c` (APFS, no extra disk). The script SVG signals by `postMessage`, because an asset-origin document cannot write a page global cross-origin.

[SURFACED-2026-09-29] Phase 1 — media ≥ 4 GiB will not load over any custom URL scheme (asset:// or a hand-rolled one) in WKWebView; HTTP works. The real media-workspace render is 4.86 GB. Logged as SURFACE-2026-09-29-MEDIA-OVER-CUSTOM-SCHEME-CAPS-AT-4GIB.
[DEVIATION-2026-09-29] Phase 1 verify-self — no `feature-verify-self-runner` spawn: the MCP bridge is orchestrator-only, and a runner would have silently measured bare Vite.

[SHIP-2026-09-29] Cleanup: the 4 GiB discriminators and the pilot trim were deleted (~8.8 GB, regen commands kept in `make-fixtures.sh`). The probe code (`src/probe/media/`, `src-tauri/src/media_probe/`, the `mprobe://` registration, the `?mediaprobe` flag) is kept deliberately until WP2 replaces it; WP2 task 2.1 deletes `media_probe`. Not pushed: `main` runs ahead of `origin` by design (pushes ride `/release`).

<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->

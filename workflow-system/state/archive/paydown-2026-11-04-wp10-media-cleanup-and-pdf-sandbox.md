---
workflow: task
state: close (complete)
completed: 2026-11-06
created: 2026-11-06
docs-only: false
drive_mode: autopilot
parent: workflow-system/product/backlog-paydown-wbs.md → WP10
---

# Task: Sweep WP10 — media cleanup and the PDF sandbox measurement

**Workflow:** task
**State:** Completed 2026-11-06
**Created:** 2026-11-06

## Problem Statement
Six low-severity media-code quality findings (from 09-29 and 10-20) and one open security question — does the PDF `<iframe>` still render under `sandbox`? — remain in the backlog. This task fixes the six and answers the question by measurement.

## Context

All seven findings were re-checked by symbol on 2026-11-06. Each is still present as described.

| Finding | Where it lives now (by symbol) |
|---|---|
| `09-29-…-READ-ERROR-CARD-STATS-VIA-THE-SCOPE-ADMITTING-COMMAND` | `MediaCard.tsx` → `ReadErrorCard` calls `statMedia` (which admits the root to the asset scope) only to get `size` |
| `09-29-…-STAT-MEDIA-CORE-RESOLVES-AND-STATS-TWICE` | `src-tauri/src/editor_fs/mod.rs` → `stat_media_core`: `resolve_within` + `metadata`, then `stat_file_core` does both again |
| `09-29-…-PANETABS-MEDIAKIND-CALLED-THREE-TIMES-WITH-A-NONNULL-ASSERT` | `PaneTabs.tsx` tab-body branch: `mediaKind(tab.path) !== null ? … kind={mediaKind(tab.path)!}`. The two registration filters (`=== null` / `!== null`) work on other tabs and are correct as they are. |
| `10-20-…-PLAYER-ELREF-INTERSECTION-TYPE` | `MediaPlayer.tsx` → `useRef<HTMLVideoElement & HTMLAudioElement>`, with the casts `as unknown as TrackSource` and `as HTMLVideoElement` (×2 sites) |
| `10-20-…-RESOLVEFPS-IS-A-PASSTHROUGH` | `mediaClock.ts` → `resolveFps` = `snapFps(x, TRACK_FPS_TOLERANCE)`, which is already the default. Its one caller is `mediaInfoOf`. `mediaClock.test.ts` has a `describe("resolveFps")`. |
| `10-20-…-PLAYER-STRIP-REUSES-ZOOM-BUTTON-CLASSES` | `MediaPlayer.tsx` strip, plus the SVG text toggle in `MediaView.tsx`, both use `.media-zoom-btn` / `.media-zoom-controls` (`App.css` ~1607–1630). The real zoom controls are in `MediaView.tsx` → `ImageView`. |
| `09-29-…-PDF-IFRAME-SANDBOX-QUESTION-LEFT-OPEN` | `MediaView.tsx` → `PdfView`, the one `<iframe>` (no `sandbox`). The note lives in `arch/security-posture.md` → "Two element rules", rule 2. |

- **Backlog stubs** (delete-on-resolve, coupled): in `backlog.md`, `## Code-quality findings — m16-wp3-review-player` (3 of its 4 bullets are here; the WIP-phase-ID comment one goes to WP14) and `## Code-quality findings — m16-wp2-media-in-editor-tab` (all 4 are here, so the whole stub is deleted).
- **Tests involved:**
  - `mediaTabLive.test.tsx` → "a binary (not-utf8) → the card, with the size fetched by stat". Its mock returns `SIZES` from `stat_media` and `{size:1}` from `stat_file`. This is "the mock" the WBS line says to update.
  - `mediaNoScriptElements.test.tsx` checks that `<iframe>` appears exactly once, inside `PdfView`.
  - `mediaClock.test.ts` → `resolveFps` cases.
- **Memories that apply:** `[[debug-bundle-verifies-bundled-origin]]` (`tauri build --debug --bundles app` with the dev config, launched via `open`, keeps the bridge working, but does NOT exercise hardened runtime; the iframe sandbox is WebKit's behavior, so hardened runtime does not matter here). Also `[[app-ships-with-no-csp]]`, `[[xterm-dom-reads-fake-a-blank-pane]]` (instruments that agree are not proof of correctness, so run a positive control), and `[[verify-native-pty-via-ps-screencapture-stderr]]` (`screencapture` of the native window when the bridge screenshot cannot see plugin content).

## Work Tree

- [x] T1 **Backend: `stat_media_core` stats once.** Extract a private `mtime_ms_of(&Metadata) -> io::Result<f64>` helper holding the before-epoch conversion. `stat_file_core` and `stat_media_core` both use it. `stat_media_core` gets size and mtime from its first `meta` and stops calling `stat_file_core`. Existing `editor_fs` tests must stay green. Confirm one of them covers `mtime_ms` / `size` on `MediaStat` (add one if none does).
- [x] T2 **`ReadErrorCard` → `stat_file`.** Read the size from `invoke<FileMarker>("stat_file", …)`. Add a `statFile` helper in `mediaIpc.ts` next to `statMedia` so the `invoker` injection still works. Update the `mediaTabLive` mock so `stat_file` returns the `SIZES` entry for `bin.dat`. The test must also assert that `stat_media` was **not** called for `bin.dat`: checking the size alone is a length-only proxy (guard catalogue entry 15) and would pass whichever command supplied it. Mutation-prove it: revert `ReadErrorCard` to `statMedia` and the test must fail.
- [x] T3 **`PaneTabs`: bind `kind` once.** In the tab-body branch, bind `const kind = tab.path ? mediaKind(tab.path) : null` and use it for the condition and the prop, dropping the `!`. Leave the two registration filters alone, because each runs on a different array.
- [x] T4 **`MediaPlayer` `elRef` → `HTMLMediaElement`.** Narrow where video is needed: an `instanceof HTMLVideoElement` check, or a typed accessor, at the `videoWidth`/`videoHeight` and `requestVideoFrameCallback` sites. Remove the `as unknown as TrackSource` cast if `HTMLMediaElement` is assignable to `TrackSource`; otherwise keep one narrow cast and say why. The `elementProps` spread onto `<video>` / `<audio>` must still type-check.
- [x] T5 **Inline `resolveFps`.** `mediaInfoOf` calls `snapFps(video?.framerate)` (the default tolerance applies). Move the "no seek probe" rationale onto `snapFps` or the call site. Move the `resolveFps` test cases under `snapFps` with the same inputs and expectations; don't drop them. Then remove the export. `check:link` covers the deleted export.
- [x] T6 **Neutral toolbar classes.** Rename `.media-zoom-btn` → `.media-tool-btn` and `.media-zoom-controls` → `.media-tool-group` in `App.css` and at every use site (`ImageView` zoom, SVG text toggle, player strip). The `media-zoom-level` testid stays, since it really is the zoom readout. Grep `media-zoom-btn|media-zoom-controls` across `src/` afterwards and expect 0. Copy hex values only; there is no token layer (`[[no-css-custom-property-layer]]`).
- [x] T7 **`verify:auto`** (timeout 207000).
- [x] T8 **PDF `sandbox`: the measurement.** Fixture: a real PDF in `tmp/scratch/scratch-c`. Three arms on `PdfView`'s iframe: (a) no attribute, the positive control, which must render; (b) `sandbox=""`; (c) `sandbox="allow-same-origin"`. Instrument: `screencapture` of the window plus the bridge's DOM read of the iframe. Only arm (a) proves the instrument can see a rendered PDF; an arm that reads blank counts only if (a) read rendered in the same run. Run on two surfaces: (1) `pnpm tauri:dev` (the `http://localhost:1420` origin); (2) a debug bundle (`tauri build --debug --bundles app --config src-tauri/tauri.dev.json`, launched via `open`, the `tauri://localhost` origin). Per the global long-command rule, the bundle is a long build: timeout 600000, run in the background, and don't re-run it while a run is in flight. Record a matrix of origin × arm → renders / blank.
- [x] T9 **Act on the matrix.**
  - **If the strictest rendering arm works on both origins:** pin it on `PdfView`, and extend `mediaNoScriptElements.test.tsx` to assert the attribute's exact value on the rendered PDF iframe. Mutation-prove that removing it fails the test. Add a third bullet to `arch/security-posture.md` → "Two element rules".
  - **If no sandboxed arm renders:** leave the iframe as it is, record the measured matrix and the reason in `security-posture.md` rule 2 (the `%PDF-` gate stays the only control), and put a one-line pointer at `PdfView` so nobody re-adds it blindly.
  - If (b)/(c) diverge between dev and bundle, take the bundle as the authority (it's what ships) and record both.
- [x] T10 **`verify:auto` again** if T9 changed code. Then do the backlog bookkeeping for close: delete the 7 resolved bodies from `backlog-quality-findings.md` (all except `PLAYER-COMMENTS-CITE-WIP-PHASE-IDS`, which belongs to WP14), slim the `m16-wp3-review-player` stub to its 1 remaining bullet, delete the `m16-wp2-media-in-editor-tab` stub, and mark WP10 ✅ in `backlog-paydown-wbs.md`. The CHANGELOG lines are written by `/task-close` in the same commit.

## Act log (T1–T7, 2026-11-06)
- T1: `mtime_ms_of(&Metadata)` helper; `stat_media_core` derives size+mtime from its one `meta`. `editor_fs` 54/54; the existing `stat_media_returns_the_canonical_path_size_and_mtime` already pins size+mtime against `stat_file_core`.
- T2: `statFile` in `mediaIpc.ts`; `ReadErrorCard` uses it. Mock returns `SIZES[path]` from `stat_file`; test asserts NO `stat_media` call for `bin.dat`. Mutant (revert to `statMedia`) landed at line 71 → test FAILS; restored by shasum.
- T3: `const media = …` once per tab; the `!` is gone. The `tab.path` check stays for TS narrowing only.
- T4: `useRef<HTMLMediaElement | null>` + a `setEl` callback ref (an object ref of the base type is not assignable to `<video ref>`). Video access narrowed by `instanceof HTMLVideoElement`; one documented `HTMLMediaElement & TrackSource` assertion (lib.dom has no track lists). Width-line mutant → 3 tests fail. The now-unused `media` dep on `onLoadedData` was dropped (lint).
- T5: `resolveFps` deleted; `mediaInfoOf` calls `snapFps`, rationale moved to the call site; `arch/right-panel-surfaces.md` symbol updated. Its duplicate cases dropped (identical inputs already under `snapFps`); NEW `mediaInfoOf` test pins the snap at the real call site. Unsnapped mutant → FAILS.
- T6: `.media-zoom-btn`/`-controls` → `.media-tool-btn`/`-group` (18 sites; 0 old names left). `media-zoom-level` + the `media-zoom-*` testids kept (they ARE zoom).
- T7: `verify:auto` EXIT 0, 62s, 3708 tests; only the pre-existing `XtermPane` warning remains after the dep fix.

## T8 measurement (2026-11-06)
Fixture: `tmp/scratch/scratch-b/wp10-doc.pdf` (a copy of `media-probe/fixtures/doc.pdf`, colour bars, a real `%PDF-`). Moved off `scratch-c` because its row was armed `↻ continue`. Each arm replaces `PdfView`'s iframe with a fresh element (same class and title, URL `…&arm=<x>`), so `sandbox` applies at navigation. `load` fired for every arm. Instrument: a bridge `webview_screenshot` scored by saturated-pixel share in the iframe region (`score.py` in the scratchpad; a render reads ~0.47 and a blank frame 0.000). The controls bracket the sandboxed arms.

| Arm | `sandbox` | dev (`http://localhost:1420`) | bundle (`tauri://localhost`) |
|---|---|---|---|
| a | none (React-rendered) | renders 0.469 | renders 0.536 |
| a2 | none (script-swapped: method control) | renders 0.467 | renders 0.536 |
| b | `""` | blank 0.000 (also at +17 s) | blank 0.000 |
| c | `allow-same-origin` | blank 0.000 | blank 0.000 |
| d | `allow-scripts` | blank 0.000 | blank 0.000 |
| e | `allow-scripts allow-same-origin` | blank 0.000 | blank 0.000 (also eyeballed) |
| a3 | none (trailing control) | renders 0.471 | renders 0.536 |

Dev reading: ANY `sandbox` blanks WebKit's PDF viewer, even the near-null `allow-scripts allow-same-origin`, so the cause is the sandbox flag set blocking the PDF plugin itself, not origin or script restrictions. No token re-enables it.

Bundle: `tauri build --debug --bundles app` with the dev config, 50 s, launched via `open`; `location.origin === "tauri://localhost"` asserted. The rows match dev exactly. Both apps were torn down by their own PIDs (dev chain 71361/71395/71530/71568; bundle 80985, whose `claude --continue` child 81501 went with it). The fixture was removed afterwards.

**T9 outcome — the "record why not" branch:**
- `PdfView` is unchanged apart from a JSDoc pointer.
- `arch/security-posture.md` rule 2 now records the matrix; the `%PDF-` sniff is the ONLY control, and real defense-in-depth would mean replacing the native viewer.
- NEW rendered guard in `mediaNoScriptElements.test.tsx`: the PDF iframe has NO `sandbox` attribute, since jsdom cannot see a blank PDF. Mutants `sandbox=""` and `sandbox="allow-same-origin"` each landed at line 173 and each FAIL; restored by shasum.

- T10: `verify:auto` re-run EXIT 0, 98 s, 3709 tests. **The backlog bookkeeping is handed to `/task-close`**, so the deletes land in the same commit as the CHANGELOG lines (delete-on-resolve):
  - Delete these 7 bodies from `backlog-quality-findings.md`: `…-READ-ERROR-CARD-STATS-…`, `…-STAT-MEDIA-CORE-RESOLVES-AND-STATS-TWICE`, `…-PDF-IFRAME-SANDBOX-QUESTION-LEFT-OPEN`, `…-PANETABS-MEDIAKIND-…`, `…-PLAYER-ELREF-INTERSECTION-TYPE`, `…-RESOLVEFPS-IS-A-PASSTHROUGH`, `…-PLAYER-STRIP-REUSES-ZOOM-BUTTON-CLASSES`. (All 4 from 09-29 plus 3 from 10-20.)
  - KEEP `10-20-…-PLAYER-COMMENTS-CITE-WIP-PHASE-IDS`, which belongs to WP14.
  - In `backlog.md`: delete the whole `m16-wp2-media-in-editor-tab` stub, and slim the `m16-wp3-review-player` stub to its 1 remaining bullet.
  - Mark WP10 ✅ in `backlog-paydown-wbs.md`.

## Current Node
- **Path:** Task > closed
- **Active scope:** none (completed 2026-11-06)
- **Blocked:** none
- **Unvisited:** none
- **Open discoveries:** none

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->

## Verification Observable

**Observable:** In a live dev build (`pnpm tauri:dev`, MCP bridge), with real fixtures copied into `scratch-b`:
- (1) `image.png` shows its zoom controls as `button.media-tool-btn` inside `.media-tool-group`, with the toolbar style applied (computed `border-top` = `1px solid rgb(60, 60, 60)`). No element in the app carries `media-zoom-btn` / `media-zoom-controls`.
- (2) `h264.mp4` loads in the review player: the strip's buttons are `.media-tool-btn`, and the readout carries the element's real dimensions and a frame rate. This exercises the `instanceof HTMLVideoElement` narrowing and the inlined `snapFps`.
- (3) `doc.pdf` renders colour bars in an iframe with no `sandbox` attribute (saturated share > 0.3).
- (4) `not-media.bin` (4096 bytes) shows the not-utf8 card reading `4.0 KB · BIN`. The captured IPC for that open contains `stat_file` for `not-media.bin` and NO `stat_media` for it.
**Verification command:** a bridge-driven script (`webview_execute_js` DOM/computed-style reads, `ipc_monitor` + `ipc_get_captured` for the IPC, `webview_screenshot` + `score.py` for the PDF), after `stat_media_core`'s single stat is exercised by (1)–(3) through the real backend.
**Expected result:** all four sub-checks hold as stated. Any one failing is a FAIL.

## Verification Result

**Status:** PASS
**Date:** 2026-11-06
**Evidence:** (live dev build; PIDs 97761/97790/97918/97962→99399, all torn down by PID)
- (1) `image.png`: buttons `media-zoom-out|fit|actual|in : media-tool-btn` (fit `is-active`), all inside `.media-tool-group`, computed `border-top` `"1px solid rgb(60, 60, 60)"`; `document.querySelectorAll('.media-zoom-btn, .media-zoom-controls').length` = `0`.
- (2) `h264.mp4`: `readyState` 4, readout `"1280 × 720 · 0:20 · 8.0 MB · H.264 / AAC · 30 fps · MP4 · h264.mp4"`, timecode `"00:00:00.00 / 00:00:20.00"` (a frame timecode, so fps was resolved). Strip `media-step-prev/next`, `media-rate-0.5/1/1.5/2`, `media-loop` are all `.media-tool-btn`.
- (3) `doc.pdf`: `{"cls":"media-pdf-frame","hasSandbox":false,"total":1}`, render score `saturated=0.471`.
- (4) `not-media.bin`: card `{"reason":"not-utf8","meta":"4.1 KB · BIN"}`. With temporary `// TELEMETRY` `eprintln!`s in the two commands, the dev log reads `stat_media image.png` ×2 (the positive control), then `stat_file not-media.bin` ×2 (StrictMode) and NO `stat_media not-media.bin`. The telemetry was reverted; `shasum -c` OK, 0 `TELEMETRY` lines left.
**Notes:** PASS on all four. Two corrections to the observable as written, neither a defect:
- (a) The expected text `4.0 KB` was my miscalculation. `formatBytes` is decimal (÷1000), so 4096 B → `4.1 KB` is correct, and it IS the file's real size from the real backend.
- (b) The declared IPC instrument (`ipc_monitor` / `ipc_get_captured`) returned `[]` filtered and unfiltered, even though the known-positive `stat_media` calls happened. This reproduces `docs/lessons/mcp-tauri-bridge-caveats.md` (l) item 3, so the empty capture was discarded as blind, and the backend-telemetry instrument (with its positive control) replaced it.

## Retrospect
- **What changed in our understanding:** The PDF `sandbox` question has a definite answer: ANY sandbox value blanks WebKit's native PDF viewer, on both origins, because the sandbox flag set blocks the plugin itself (no token re-enables it). The open question from M16 WP2 is closed by measurement, not left as defense-in-depth "to try later". Real hardening of that iframe would mean replacing the native viewer. Also, `ipc_monitor` is blind again, and a temporary backend `eprintln!` plus a positive control is the working instrument for a call/no-call question (added to caveat (l)).
- **Assumptions that held:** All seven findings re-anchored by symbol unchanged (nothing moved since 09-29/10-20). The existing `stat_media_returns_the_canonical_path_size_and_mtime` test already pinned T1's behavior. Swapping fresh iframes by script was a valid method, which the a2 control proved.
- **Assumptions that were wrong:**
  - T4: an object ref typed `HTMLMediaElement` is NOT assignable to `<video ref>`, so it needed a callback ref.
  - T5: the deleted `resolveFps` tests were the ONLY coverage of the snap at the real call site; a new `mediaInfoOf` test replaced them.
  - Verify: I predicted `4.0 KB` for 4096 B, but `formatBytes` is decimal (`4.1 KB`).
- **Approach delta:**
  - T8 added two arms beyond the plan, `allow-scripts` and `allow-scripts allow-same-origin`, to tell "origin/script restriction" apart from "plugin blocked". It also added a trailing control.
  - T9 took the "record why not" branch AND added a rendered no-sandbox guard (jsdom cannot see a blank PDF), mutation-proven with two values.
  - The fixture moved from `scratch-c` to `scratch-b`, because `scratch-c` was armed `↻ continue`.

**Closure notice:** Requester = operator — closure notice for self-record. Sweep WP10 is complete: six media code-quality fixes landed (single-stat backend, side-effect-free card stat, kind bound once, `HTMLMediaElement` ref, `resolveFps` inlined, neutral toolbar classes), and the PDF `<iframe>` was measured to be unsandboxable in dev and a debug bundle, now recorded in `arch/security-posture.md` and pinned by a test. See commit `54fec49`; the matrix is in this archive file → "T8 measurement".

---
drive_mode: autopilot
---

# Feature: M16 WP3 — Review player (audio and video)

**Workflow:** feature
**State:** ship (complete)
**Created:** 2026-10-20
**Entry:** spec (complex feature)
**Source:** `workflow-system/product/wbs.md` → WP3 (tasks 3.1–3.8); rulings Q1–Q3 + R-4a/b/c in the same file are SETTLED.

## Problem Statement

M16 WP2 opens every media file in the editor's ordinary `"file"` tab, but audio and video under 4 GiB
still land on a placeholder card ("The built-in player for audio and video is coming soon",
`CardReason` `player-pending` in `mediaDisplay.ts` → `displayFor`). The operator's media work (a
video-production pipeline that regenerates renders on disk) needs to **review** a render without
leaving the workspace: step frame by frame, change speed, loop, read a frame-accurate timecode, see
what the file is, and keep their place when the render is rewritten underneath them.

WP3 replaces the `player-pending` arm with a review player. Per Q1, **file type alone** selects it:
every audio and video file in every workspace gets it, with no per-project setting.

Problem statement unchanged (F9b re-entry, Phase 3 O-hide, 2026-10-20). The goal, no playback
from a player hidden inside the app, stands. Only the MECHANISM was wrong: WebKit delivers
`IntersectionObserver` callbacks on throttled rendering updates, so the pause latency was unbounded
(97 ms to 3.4 s, or never on a quick round trip).

## User Stories

- As the operator reviewing a render, I want to frame-step a paused video with `,` / `.` so that I
  can inspect a cut or a glitch at single-frame precision.
- As the operator, I want a frame-accurate `hh:mm:ss.ff` timecode (current / total) so that I can
  name the exact frame I am looking at.
- As the operator, I want 0.5× / 1× / 1.5× / 2× speed presets and a loop toggle, both visibly
  selected, so that I can skim or study a section without operating a slider.
- As the operator, I want to see the file's resolution, duration and size so that I know which
  render I am looking at.
- As the operator re-rendering in a loop, I want the player to reload a regenerated file **at the
  same playhead, in the same paused/playing state, at the same speed and loop setting** so that I
  never re-find my place.
- As any Claudesk user, I want a video in a workspace or tab I cannot see to stop playing so that
  audio never comes out of an invisible workspace.

## Acceptance Criteria

**Player shell (3.1)**
- AC-1 A `.mp4` / `.mov` / `.webm` under 4 GiB opens from the file tree, ⌘P or search into the
  ordinary file tab and shows a `<video>` with native controls on `assetUrlFor(stat)`. An audio file
  (`mp3 m4a aac wav flac ogg opus`) shows an `<audio>` with native controls. Neither autoplays.
- AC-2 A Claudesk control strip sits below the element. Audio gets the same strip **without** the
  frame-based controls (frame-step, `.ff` timecode).
- AC-3 The `player-pending` `CardReason`, its text, and every test that asserts it are removed;
  `displayFor` returns a player display for audio/video under the cap. The 4 GiB `over-media-limit`
  card and the `unrenderable` card (mkv: MEDIA_ERR 4) are unchanged.
- AC-4 After open, the first frame is **painted** (not merely `readyState ≥ 2`) — see Open Question 1.

**Frame-step (3.2)**
- AC-5 With a video paused and the player focused, `.` shows the next frame and `,` the previous
  one. Ten presses from frame N show frame N+10 (an **identity** check on the presented frame, not
  "currentTime moved"). Holds on a **24 fps** fixture and a **30 fps** fixture — the operator's real
  renders are 1080p24, and every WP1 fixture is 30 fps.
- AC-6 For audio, `.` / `,` move ±1 s.
- AC-7 The keys do nothing while CodeMirror, the CC pane, a right-panel terminal or any other
  surface has focus, and do nothing while the video is playing.
- AC-8 The chord is a `*Chord.ts` predicate on the shared `ChordEvent`, has a `CHORD_REGISTRY`
  entry, and passes `chordRegistry.test.ts`'s reachability and completeness directions.
- AC-9 Frame-step also has two visible strip buttons (titles name the `,` / `.` keys).

**Speed and loop (3.3)**
- AC-10 Four speed presets (0.5× / 1× / 1.5× / 2×) and a loop toggle, each showing its selected
  state. The strip reflects the element's real state (it reads `ratechange` / the `loop` property),
  so it cannot disagree with the element.

**Timecode (3.4)**
- AC-11 Video shows `hh:mm:ss.ff / hh:mm:ss.ff`, where `.ff` is the frame within the second.
  Audio shows `hh:mm:ss.mmm / hh:mm:ss.mmm` (no frames).
- AC-12 One pure module owns the fps value and the time↔frame arithmetic; frame-step and the
  timecode both read it, so they cannot disagree (a test proves one fps source feeds both).

**File info (3.5)**
- AC-13 The readout shows resolution (video), duration, size and container/extension, in the same
  `.media-toolbar` readout line the image viewer uses. A codec field appears **only** if a live
  check shows WKWebView exposing one (WP1 recorded none); otherwise it is omitted, not shown blank.

**Reload keeps the playhead (3.6)**
- AC-14 When the file changes on disk (WP2's `epoch` → re-stat → new mtime → new asset URL), the
  player restores `currentTime` to the old playhead when the new duration ≥ that playhead, else 0;
  and keeps paused/playing, speed and loop. Tested as an **identity** assertion on the restored time
  (source-text-guards entry 15) with a fixture where restore-to-old and reset-to-0 differ.
- AC-15 The playhead survives intermediate states during a regenerate: if the file is briefly
  missing or unplayable mid-write (`missing` / `unrenderable` card), the next successful load still
  restores the last good playhead.
- AC-16 The WP2 MAJOR is fixed in the same reducer: a file that returns with an **unchanged**
  mtime/size/path after a `missing` card clears the card
  (`SURFACE-2026-09-29-QUALITY-MEDIA-MISSING-CARD-STICKS-WHEN-FILE-RETURNS-UNCHANGED`), with a
  same-mtime restore test, mutation-proven.

**Background workspaces (3.7)**
- AC-17 A playing player pauses when it stops being visible inside the app: its workspace leaves
  center stage, the right half collapses, the right panel switches away from Editor, or its editor
  tab is no longer front. It does **not** resume on return.
- AC-18 It does **not** pause when the whole Claudesk window is hidden, minimized or loses focus
  (listening while in another app stays possible).

**Verification (3.8)**
- AC-19 Live dev check on the WP1 fixtures plus a new 24 fps fixture, including `large.mp4` seek
  and a regenerate during playback (write a new file over it).
- AC-20 Installed-build tier as in WP2 2.11 (a debug bundle on `tauri://localhost`, or deferred to
  `/release` and **recorded as deferred**).
- AC-21 The operator dogfood pass on `scripture-reading` output is operator-only and recorded as
  deferred if not done. ⚠️ Its full renders are ≥ 4 GiB and get the card + "Open in default app" by
  ruling R-4a; the player reviews trims and shorter renders.
- AC-22 `pnpm verify:auto` green; render-level tests use the jsdom + `mockIPC` harness
  (`liveWorkspace.tsx`), not `?raw` guards, wherever the question is what the DOM shows.

## Out of Scope

- Everything on Q2's "Out" list: A/B compare, in/out loop ranges, markers/annotations, audio
  waveform, thumbnail scrub previews.
- Transcoding, ffmpeg/ffprobe, or any codec path (mkv stays on the card).
- Anything for files ≥ 4 GiB (R-4a; no loopback HTTP server).
- Persisting speed/loop across app restarts or between files.
- Pause-on-blur of the whole app window (AC-18).
- Keyboard handling inside native fullscreen; quitting while fullscreen (R-4c).
- J/K/L shuttle and other NLE keymaps.

## Technical Constraints

- **No 3rd-party dependency.** Transport, scope, classifier and reload path are WP2's
  (`stat_media`, `assetUrlFor`, `mediaKind`, `MediaView` `epoch`). WP1 is the completed probe.
- **Plug points (do not rebuild):** `displayFor`'s audio/video arm; `MediaView`'s dispatch; the
  `epoch` re-stat in `MediaView`; `mediaReducer`. The `stat-ok` short-circuit means a same-stat
  re-stat does not re-render, so a reload is always a **new asset URL** (mtime-busted) — the player
  must carry the playhead across a `src` change (or a remount keyed on the URL), not across a
  re-render.
- **`mediaKind()` stays the only extension list** (`mediaKindIsTheOnlyExtensionList.test.ts`).
- **Chord convention:** a `*Chord.ts` predicate module, `ChordEvent`, a `CHORD_REGISTRY` row. The
  image zoom precedent registers from MediaView's own focused-element `onKeyDown` and is listed as an
  outcome row. Bare `,` / `.` (no ⌘) collides with nothing: ⌘, is Settings and requires `metaKey`.
- **Visibility signals are several, not one:** the workspace is pushed off-viewport
  (`left:-99999px`, not `display:none`) when it leaves center stage; the right half, a non-front
  panel and a non-front tab use `display:none`. Whatever mechanism AC-17 uses must cover all four.
  An `IntersectionObserver` sees all four in WebKit but not in jsdom; a derived `shown` prop is
  testable in jsdom but must be threaded through each layer. The plan picks one and the
  verification must exercise each hiding path individually (a composite check hides a gap).
- **fps:** WP1 measured `requestVideoFrameCallback` present with an exact 30.000 fps — measured
  **during playback**. The 1/30 s fallback is a guard only; a 24 fps file stepped at 1/30 s skips or
  repeats frames and mislabels `.ff`. See Open Question 2.
- **Paint after paused seek:** WP1 saw `preload="metadata"` report `readyState ≥ 2` after a paused
  seek but paint no frame. See Open Question 1.
- **Dark mode only; no CSS custom-property layer** — copy hex from `.media-toolbar` /
  `.media-zoom-btn` (`[[no-css-custom-property-layer]]`).
- **Tier: lite-IDE core.** Not gated; the OFF-invariant guard gains no arm.
- **Deleted export risk:** removing `player-pending` touches a union consumed by tests; run
  `check:link` (inside `verify:auto`) — a deleted binding reads as `undefined` under Vitest.

## Design-priors consult

- `explicit-selectable-mode-over-inferred-mode` — fires, rule 2 (agrees): speed is four
  directly-selectable presets, not a slider; loop is a visible toggle. Already in the WBS.
- `escape-hatch-to-the-os-over-in-app-infrastructure` — fires, rule 2 (agrees): no codec path, no
  ffprobe, and codec info is shown only if the platform gives it; files the player can't handle
  keep the card + "Open in default app". ⚠️ It does **not** settle Open Question 2: fps is the
  common case (every video's frame-step), so if a container parse is the only way to know fps
  before play, that is a rule-4 surface for the operator, not an automatic "hand off".
- `new-surface-must-earn-its-place-against-existing-ones` — rule 2: no new tab or surface; the
  player is a renderer inside the existing file tab (Q3).

## Asked

- *(none)* — no question passed all three clauses (not discoverable · operator's to decide ·
  expensive to reverse). The WBS rulings already settle scope; the open items below are facts to
  measure, not decisions.

## Assumed (each cheap to reverse — flag any you disagree with)

- **A-1** No autoplay on open; the player opens paused on the first frame.
- **A-2** Space toggles play/pause while the player is focused (the native-controls convention;
  needed for keyboard frame-step review). One more registry outcome.
- **A-3** Pause-on-hidden applies to **audio too** (an audio tab you switched away from stops).
- **A-4** No resume on return (the WBS default).
- **A-5** Do not pause on whole-window hide/minimize/blur (AC-18).
- **A-6** Speed and loop are per-tab state, kept across reloads (AC-14), not persisted to disk.
- **A-7** File info lives in the top `.media-toolbar` readout (consistent with the image viewer);
  review controls are in the strip **below** the element (per WBS 3.1).
- **A-8** Audio timecode is `hh:mm:ss.mmm`.
- **A-9** The WP2 missing-card MAJOR is folded into this WP (AC-16), since 3.6 rewrites the same
  reducer arm.
- **A-10** Frame-step keys do nothing while playing (rather than pausing first).

## Open Questions

- [x] **OQ-1 Paint after open / paused seek.** Does `preload="auto"` make WKWebView paint the frame
  after a paused seek (and on open)? If not, does a muted play→pause nudge? Measure live on the real
  webview (dev + debug bundle), including for `large.mp4`; also whether `preload="auto"` on a
  multi-GB file buffers excessively.
- [x] **OQ-2 fps before first play.** Can the player know the frame rate **before** the video has
  played? Candidates to measure: does `requestVideoFrameCallback` fire after a **paused** seek in
  WKWebView, and does its `metadata.mediaTime` let two seeks recover the frame duration? Does a
  short muted play→pause nudge (which may also answer OQ-1) give a stable fps on 24 and 30 fps
  fixtures? If neither works, the fallback is a container read (mp4/mov `stts`/`mdhd`) — new
  backend surface, and an operator call (see the design-priors consult).
- [x] **OQ-3 Codec exposure.** Does WKWebView expose anything codec-like (`videoTracks[i].label`,
  `audioTracks[i].label`, `getVideoPlaybackQuality`)? Decides whether AC-13's codec field exists.
- [x] **OQ-4 Frame-step seek target.** Which `currentTime` lands deterministically on frame N±1 in
  WebKit (frame start, frame midpoint, start + ε)? Verified by rVFC `mediaTime` identity on 24 and
  30 fps fixtures.

## Research (2026-10-20, live WKWebView, `pnpm tauri:dev`, MCP bridge)

**Method.** Fixtures under `tmp/scratch/scratch-a/media/` (gitignored), loaded through the real
transport (`stat_media` → `convertFileSrc` → `<video>`), like `MediaView`. Frame identity comes from
an **independent** instrument: each `bc*` fixture encodes its frame number as an 11-bit stripe
barcode (`ffmpeg … geq=lum='…mod(floor(N/pow(2,floor(X/64))),2)…'`; no `drawtext` in this ffmpeg),
read back by drawing the video into a canvas. Positive control: a paused seek to frame 37 decoded 37,
and ffmpeg's own extract of frame 37 shows the same bits. rVFC `metadata.mediaTime` is the second
instrument. Fixtures: `bc24.mp4`, `bc30.mp4`, `bc23976.mp4` (H.264), `bc24hevc.mp4`, `bc24.webm`
(VP9), plus WP1's `large.mp4`, `prores.mov`, `audio.mp3`, `audio.m4a`.

⚠️ **Instrument trap found mid-run:** with the dev window occluded, `document.visibilityState` was
`"hidden"`, and rVFC and timers stopped. The step tests stalled until the operator brought the
window forward. **Anything that measures frames needs the window visible.** This also bears on AC-18
(below).

### OQ-1: paint after open / paused seek → `preload="auto"` ✅
- `preload="metadata"`: stays at `readyState 1`, never fires `loadeddata`, paints **black** on open
  (mp4 and webm). Confirms WP1.
- `preload="auto"`: `loadeddata` → `readyState 4`, rVFC fires `presentedFrames 1`, and the **first
  frame is painted** on open (screenshot) for H.264, HEVC, ProRes and VP9.
- A **paused seek** under `preload="auto"` paints the target frame: rVFC fires and the barcode
  decodes to the target. No play/pause nudge is needed.
- **Memory:** `large.mp4` (336 MB) with `preload="auto"` moved the dev app's WebKit RSS by about 3 MB
  (GPU 113→116, WebContent 120→121). `buffered` reports `[0, 660]` with `networkState` idle, which is
  WebKit's view of a local resource, not a full read. **No excessive buffering.**

### OQ-2: fps before first play → **the track's `configuration.framerate`**, with a seek-probe fallback ✅
- **WebKit exposes `videoTracks[i].configuration`** (`VideoTrackConfiguration`), including
  `framerate` and `codec`, **with no playback needed**:
  - `bc24` → 24 · `bc30` → 30 · `bc23976` → 23.976022… · `bc24hevc` → 24 · `bc24.webm` →
    24.000000384 · `prores.mov` → 24 · `large.mp4` → 30
  - ⚠️ **Timing:** for mp4/mov the track list is **empty at `loadedmetadata`** and populated at
    `loadeddata`. For webm it is already there at `loadedmetadata`. Under `preload="metadata"` an mp4
    **never** gets tracks. So read fps at `loadeddata`, which OQ-1 needs anyway.
  - Values carry float noise (`24.000000384`, `23.976022720…`), so **snap** to the nearest common rate
    (23.976, 24, 25, 29.97, 30, 47.952, 48, 50, 59.94, 60) within ~0.1%, else use the raw value.
- **Fallback, measured and working:** two paused seeks. Seek to 1.0 s, read rVFC `mediaTime` `m1`,
  then seek to `m1 − 1e-4` and read `m0`. `1/(m1 − m0)` gave **exactly** 24 / 30 / 23.976 on
  H.264 and HEVC, and also under `preload="metadata"`. VP9 webm timestamps are millisecond-rounded
  (`0.958`), so this path needs the same snapping. Use it only when `framerate` is missing or 0.
- The **1/30 s guard** stays the last resort only (e.g. a still or a broken track).
- ⇒ **No backend container parse.** The `escape-hatch` rule-4 surface flagged in the spec does
  not arise.

### OQ-3: codec exposure → **yes, mostly** ✅
| File | `configuration.codec` | Other fields |
|---|---|---|
| H.264 mp4 | `avc1.64001E` / `avc1.42C01F` | width, height, framerate, bitrate |
| HEVC mp4 | `hvc1.1.6.L90.90` | same |
| VP9 webm | `vp09` | same (bitrate 0) |
| ProRes mov | **`""` (empty)** | width, framerate 24 |
| AAC m4a / in mp4 | `mp4a.40.2` | `sampleRate` 44100, `numberOfChannels` 1, bitrate |
| MP3 | **`""` (empty)** | sampleRate, channels, bitrate |

- `label` is empty on every track, so it is useless.
- ⇒ AC-13 holds as written: show the codec **when non-empty**, and omit it otherwise. Audio can also
  show sample rate + channels from the same object. Map the RFC 6381 string to a friendly name
  (`avc1.* → H.264`, `hvc1/hev1 → HEVC`, `vp09 → VP9`, `mp4a.40.2 → AAC`) plus the raw string, and
  fall back to the raw string for anything unmapped.
- ⚠️ Same timing caveat: mp4 tracks appear at `loadeddata`, not `loadedmetadata`.

### OQ-4: frame-step seek target → **the frame MIDPOINT, `(n + 0.5) / fps`** ✅
30 steps per run, from frame 100, verified by **barcode identity** (VP9: by `mediaTime` identity,
because a VP9 frame **taints** the canvas — `SecurityError`, an instrument-only limit):

| Target | 24 fps | 30 fps | 23.976 | HEVC 24 | VP9 24 |
|---|---|---|---|---|---|
| frame start `n/fps`, forward | **5/30** (sticks, 24 rVFC timeouts) | **0/30** | **0/30** | **0/30** | — |
| frame start, backward | **15/30** (skips) | 15/30 | 7/30 | 15/30 | — |
| `mediaTime ± 1/fps` | 0/30 fwd · 15/30 back | same | same | — | — |
| `n/fps + 1 ms` | 30/30 both ways | 30/30 | 30/30 | 30/30 | — |
| **midpoint `(n+0.5)/fps`** | **30/30 both ways** | **30/30** | **30/30** | **30/30** | **60/60** |

- **Frame-start seeks are wrong**: float rounding lands on the previous frame, so forward never
  advances (and rVFC never fires, because no new frame is presented) and backward double-steps.
  `mediaTime ± 1/fps` inherits the same failure.
- **Midpoint is the choice**: it has the most margin, which matters for VP9's ms-rounded timestamps
  and for 60 fps (`+1 ms` passed too, but with 1/16 of the margin at 60 fps).
- **The current frame index** should come from `rVFC mediaTime` (`round(mediaTime × fps)`) when
  available, not from `currentTime`. After a midpoint seek `currentTime` is the midpoint, and the
  presented frame is what the timecode must name.
- Step cost: about 17–100 ms per step (fwd 30 steps ≈ 520 ms at 30 fps; backward ≈ 1.0–1.3 s / 30).

### Visibility (spec Technical Constraints, AC-17/AC-18)
- `IntersectionObserver` on the `<video>` reports `isIntersecting:false` for **both** a
  `display:none` ancestor **and** the off-viewport `left:-99999px` shift, and `true` again on return
  (measured in WKWebView). So one IO covers all four in-app hiding paths, but not in jsdom (the plan
  must inject the signal for tests).
- ⚠️ **AC-18 risk:** an occluded/background window flips `document.visibilityState` to `"hidden"`.
  The player must therefore **never key pause on `visibilitychange`**, or AC-18 breaks. Unmeasured:
  whether WebKit itself pauses a playing `<audio>`/`<video>` when the window is occluded. That is a
  **verify-self/verify-human check** (play audio → cover the window → still audible), not a design
  input.

### Smaller observations
- The native `<audio>` controls showed `00:00 / 00:00` with `duration` at 30.04 s, unplayed. This may
  just be the native control not refreshing. Check at verify-self. The strip's own timecode does not
  depend on it.
- Fixtures stay in `tmp/scratch/scratch-a/media/` for verify-self. The `bc*` barcode set is the
  frame-identity instrument for AC-5.

### Spec impact
**The spec holds, so no back-loop.** Refinements the plan must carry:
- (a) `preload="auto"` on every player element.
- (b) The fps module's source order: track `framerate` (snapped) → two-seek probe → 1/30 guard.
- (c) Frame-step seeks to the frame midpoint, and the frame index comes from rVFC `mediaTime`.
- (d) Codec and audio format come from `*Tracks[i].configuration`, read at `loadeddata`.
- (e) Hiding is detected by IO (or an equivalent derived prop), never by `visibilitychange`.

All four OQs are resolved below.

## Work Tree

**Plan notes (apply to every phase):**
- **Seams reused, not rebuilt:** `displayFor` / `mediaReducer` (`mediaDisplay.ts`), `MediaView`'s
  dispatch + `epoch` re-stat, `assetUrlFor`, `mediaKind`. PaneTabs is untouched except where Phase 3
  needs a visibility input.
- **New modules:**
  - `editor/mediaClock.ts` — pure: fps resolution + snapping, frame index, midpoint seek target,
    timecode format, codec friendly name, playhead-restore rule. One module, so frame-step and
    timecode cannot disagree (AC-12).
  - `editor/MediaPlayer.tsx` — the component.
  - `editor/frameStepChord.ts` — the predicate.
  - ⚠️ Name these case-distinct from existing PascalCase siblings
    (`[[macos-case-collision-module-naming]]`): `mediaClock.ts` ≠ `MediaPlayer.tsx`. **Nothing named
    `mediaPlayer.ts`.**
- **Instruments:** the `bc*` barcode fixtures in `tmp/scratch/scratch-a/media/` give frame
  **identity** (canvas decode works on H.264/HEVC in the dev webview; VP9 taints, so use rVFC
  `mediaTime` there). Live checks drive the real dev app through the MCP bridge, opening `scratch-a`
  (a real CC session spawns — expected). ⚠️ The dev window must be **visible**: occluded,
  `visibilityState` goes `hidden` and rVFC/timers stop (research). If a run stalls, ask the operator
  to bring it forward; do not read the stall as a failure.
- **Gate:** `pnpm verify:auto` per phase (it includes `check:link`, which matters for P1.2's union
  deletion).

- [x] Phase 1: Player shell, clock model and file info  <!-- status: done -->
  **Observable outcomes:**
  - CLI: `pnpm vitest run src/components/workspace/editor/__tests__/mediaClock.test.ts` exits 0 and
    covers:
    - `snapFps`: 24.000000384→24, 23.976022720→24000/1001, 29.97…→30000/1001, 47.0→47 (raw kept
      when no common rate is within 0.1%), 0/NaN→null
    - `frameIndexAt(mediaTime, fps)` and `seekTargetFor(index, fps)` = `(index + 0.5)/fps`
    - `formatTimecode`: video `hh:mm:ss.ff` (frame-in-second, 23.976 included) and audio
      `hh:mm:ss.mmm`
    - `codecLabel`: avc1.*→"H.264", hvc1/hev1→"HEVC", vp09→"VP9", mp4a.40.2→"AAC", ""→null,
      unknown→raw
  - CLI: `grep -rn "player-pending" src` → 0 matches (comments included). The card union no longer
    has the member, and `pnpm check:link` passes.
  - Browser (dev, MCP bridge; open `scratch-a`, then `media/bc24.mp4` from the file tree):
    - the tab body holds one `<video>` with `controls`, `preload === "auto"`, `paused === true`
      (no autoplay) and `src` starting `asset://` / `http://asset.localhost`
    - within 2 s `readyState === 4`, and a canvas barcode decode of the element returns **0** (the
      first frame is painted, not just loaded)
    - the readout reads `704 × 360 · 0:20 · 40.3 KB · H.264 · 24 fps · MP4 · media/bc24.mp4`; the
      order is fixed by the build, with every field present
    - the strip timecode reads `00:00:00.00 / 00:00:20.00`
  - Browser (dev): `media/bc23976.mp4` shows `23.976 fps` in the readout and total timecode
    `00:00:20.00` ±1 frame. `media/prores.mov` shows **no** codec field (empty `configuration.codec`)
    but does show `24 fps`.
  - Browser (dev): `media/audio.m4a` → one `<audio controls preload="auto">`, readout contains `AAC`,
    `44.1 kHz`, `mono` and the duration, and the strip timecode reads `00:00:00.000 / 00:00:29.975`
    (ms form). **No** frame-step controls are in the DOM. `media/audio.mp3` → readout has **no**
    codec field.
  - Browser (dev): a `.mkv` still ends on the `unrenderable` card (the fast `error` path is intact).
    Unit: `displayFor("video", {size ≥ 4 GiB})` is still `over-media-limit`.
  - Console: no uncaught errors during the above (use a self-tested `window` `error` tap, not
    `read_logs` — `[[read-logs-console-captures-nothing]]`).
  **Alignment questions:**
  - A-1 (no autoplay) and A-7 (file info in the top line, controls in a strip below) in action:
    `bc24.mp4` open in a tab, screenshot attached. Still what you want?
  - A-8 in action: audio timecode in `hh:mm:ss.mmm`. Is milliseconds the right resolution for
    audio review?
  - (decision) If a video has **no** usable frame rate (no track `framerate`, and the seek probe
    fails), the readout says `fps unknown`, the timecode falls back to the audio form
    `hh:mm:ss.mmm`, and frame-step uses the 1/30 s guard. I picked this so a timecode never shows
    invented frame numbers. OK?
  - [x] P1.1 `mediaClock.ts` + tests: snap table, fps source order (track `framerate` →
        two-seek probe result → `null`; callers apply the 1/30 guard), frame index, midpoint target,
        both timecode forms, `codecLabel`, and an audio-format line (sample rate + channels).
        <!-- status: done -->
  - [x] P1.2 `displayFor`: audio/video under the cap → `{ kind: "player"; media: "video" | "audio" }`.
        Delete `player-pending` from `CardReason` and `CARD_REASON_TEXT`. Update
        `mediaDisplay.test.ts`, `mediaTabLive.test.tsx` (the `player-pending` card assertions become
        "a `<video>` is rendered"), and any other site the grep finds. `mediaReducer`'s
        `render-error` arm already maps any non-card display to `unrenderable`; keep that.
        <!-- status: done -->
  - [x] P1.3 `MediaPlayer.tsx`:
        - `<video>`/`<audio>` with `controls`, `preload="auto"` and `src={assetUrlFor(stat)}`;
          `onError` → `onRenderError`
        - read `videoTracks`/`audioTracks[0].configuration` at `loadeddata`, **not**
          `loadedmetadata`, because mp4 tracks are empty there (research)
        - run the two-seek probe only when `framerate` is missing or 0, then seek back to 0
        - the toolbar readout uses ImageView's `.media-toolbar` markup
        - the strip (`.media-player-strip`) holds the timecode only in this phase
        - the current frame comes from the rVFC `mediaTime` loop for video and `timeupdate` for
          audio
        - MediaView renders it for `display.kind === "player"`
        <!-- status: done -->
  - [x] P1.4 CSS: `.media-player`, `.media-player-strip`, `.media-timecode` in `App.css`, using hex
        values copied from `.media-toolbar` / `.media-zoom-btn` (`[[no-css-custom-property-layer]]`;
        no `var(--…)`).
        <!-- status: done -->
  - [x] P1.5 Tests:
        - live jsdom render through the existing `mediaTabLive` harness: a video tab renders
          `<video preload="auto" controls>` with no autoplay; an audio tab renders `<audio>` with
          no frame-step controls; the readout composes from a stubbed track configuration
        - a stubbed `configuration` with codec `""` yields **no** codec field — an identity
          assertion on the readout text, not a length check
        <!-- status: done -->
  - [x] verify-auto  <!-- status: done -->
    - `pnpm verify:auto` → EXIT=0 in 38 s. The first run failed only on `prettier --check` for
      `mediaClock.ts` + `mediaTabLive.test.tsx`; I fixed both with `prettier --write` on explicit
      paths and the second run passed. lint: 0 errors (1 pre-existing `XtermPane.tsx` warning) ·
      format ok · tsc ok · `check:link` "every entry linked cleanly (main, pip)" (covers
      `assetUrlFor` moving out of `MediaView.tsx`) · vitest 253 files / 3374 tests passed ·
      cargo fmt / clippy `-D warnings` / cargo test (1019 lib + integration) ok.
    - `grep -rn "player-pending" src | wc -l` → 0.
  - [x] verify-self  <!-- status: done -->
    - Driven by the orchestrator through the MCP bridge (`pnpm tauri:dev`, opening `scratch-a`
      from the picker, then each file from the **file tree** — the consuming surface, an existing
      UI path into the editor tab). No runner subagent: `mcp__tauri__*` does not reach spawned
      subagents (`[[mcp-bridge-tools-not-exposed-to-subagents]]`), which silently fall back to bare
      Vite. Integration boundary: YES (MediaView's audio/video arm changed); the outcomes cite the
      file-tree → editor-tab path.
    - [x] O-unit `mediaClock.test.ts` — evidence: `pnpm vitest run …mediaClock.test.ts` → 24 passed
          (snap / frame / timecode / codec / audio format). The probe-snapping row was replaced per
          the plan deviation in Discoveries.
    - [x] O-grep — evidence: `grep -rn "player-pending" src | wc -l` → 0, and `check:link` clean
          (verify-auto).
    - [x] O-bc24 — evidence: bridge read on the active tab body: one `<video>`, `controls:true`,
          `preload:"auto"`, `paused:true`, `autoplay:false`, `src` `asset://localhost/%2FUsers…`,
          `readyState 4`. Canvas decode: barcode `n:0`, bottom-half luma 141. **A painted frame,
          not black** (black would read 0). Readout `704 × 360 · 0:20 · 40.3 KB · H.264 · 24 fps ·
          MP4 · media/bc24.mp4` (exact). Timecode `00:00:00.00 / 00:00:20.00` (exact). Screenshot:
          `scratchpad/p1-bc24.jpg`.
    - [x] O-23976/prores — evidence: `bc23976.mp4` readout `… · H.264 · 23.976 fps · MP4 …`,
          timecode `00:00:00.00 / 00:00:20.00`. `prores.mov` readout `1280 × 720 · 0:10 · 14.3 MB ·
          24 fps · MOV · media/prores.mov`, so **no codec field** for the empty WebKit codec, and
          24 fps is shown.
    - [x] O-audio — evidence: `audio.m4a` → `AUDIO`, `preload:"auto"`, readout `0:30 · 265.6 KB ·
          AAC · 44.1 kHz · mono · M4A · media/audio.m4a`, timecode `00:00:00.000 / 00:00:29.975`,
          no `media-step*` element. `audio.mp3` → readout `0:30 · 240.6 KB · 44.1 kHz · mono · MP3 ·
          media/audio.mp3` (no codec field). Screenshot: `scratchpad/p1-audio.jpg`. The native
          control shows `00:29` duration, so the research note's `00:00 / 00:00` was a refresh
          artifact, now closed.
    - [x] O-mkv — evidence: `h264.mkv` (copied from the WP1 fixtures) → `media-card`
          `data-reason="unrenderable"`. The `over-media-limit` unit row passes in `mediaDisplay.test.ts`.
    - [x] O-console — evidence: a `window` `error`/`unhandledrejection` tap, **self-tested**
          (a `setTimeout` throw was caught as `Error: tap-positive-control`), then cleared. It
          recorded `[]` across all of the above.
    - [x] align: A-1 + A-7 (no autoplay; info on top, strip below) — evidence:
          `scratchpad/p1-bc24.jpg` (full path:
          `/private/tmp/claude-501/-Users-stayman-Personal-projects-claudesk/843b2153-70ce-406b-8f86-adc73757c215/scratchpad/p1-bc24.jpg`)
    - [x] align: A-8 audio `hh:mm:ss.mmm` — evidence: `scratchpad/p1-audio.jpg` (strip reads
          `00:00:00.000 / 00:00:29.975`). Note for the operator: the audio tab's stage is a large
          black area with the native control centred (same `#000` stage as video).
    - [x] align: (decision) no-fps → `fps unknown` + clock timecode + 1/30 guard — evidence:
          `mediaTabLive.test.tsx` "a video with no frame rate says so…" (readout `… · fps unknown ·
          …`, timecode `00:00:00.000 / 00:00:12.500`). No real file without a track rate exists to
          show live.
  - [x] verify-human  <!-- status: done — operator 2026-10-20: "all good. and A" -->
    - [x] P1.verify-human.1: happy path + A-1/A-7 — open a video and an audio file from the tree in the running dev app (no autoplay; info line on top; timecode strip below; audio on the same black stage) — operator: pass (black audio stage kept)
    - [x] P1.verify-human.2: A-8 — audio timecode in hh:mm:ss.mmm — operator: pass
    - [x] P1.verify-human.3: (decision) no frame rate → `fps unknown` + clock timecode + 1/30 s step — operator chose **A**
  - [x] verify-codify  <!-- status: done -->
    - Integration boundary: the consuming surface is EditorSplit → PaneTabs → MediaView (the
      file tab). It is covered by `mediaTabLive.test.tsx` (live jsdom mount + `mockIPC`): player
      renders, readout identity, codec omission, no-fps decision A, audio form, error → card.
    - New test: "the video timecode names the PRESENTED frame (rVFC mediaTime), not currentTime".
      It stubs rVFC, presents `mediaTime 37/24` while `currentTime` is 5 (a different frame), and
      asserts `00:00:01.13 / 00:00:20.00`.
    - Mutation proofs (each individual, landing confirmed via diff, restored by `cp` + `shasum`
      match):
      - `preload "metadata"` → 2 failed
      - `onLoadedMetadata` instead of `onLoadedData` → 5 failed
      - `setTime(video.currentTime)` instead of `meta.mediaTime` → 1 failed (the new test)
      - codec `?? ""` in the readout → survived, an **equivalent** mutant: `.filter(Boolean)`
        also drops `""`, so the omission has two layers. The first layer (`codecLabel("")` → null)
        mutated to `return c` → 1 failed in `mediaClock.test.ts`.
    - Full gate: `pnpm verify:auto` → EXIT=0 in 35 s, 253 files / 3375 tests, `check:link`
      clean, cargo green.

- [x] Phase 2: Review controls: frame-step, play/pause, speed, loop  <!-- status: done -->
  **Relevance check (before Phase 2):**
  - Requester still needs this: yes — Phase 1 approved "all good"; Q2's review scope is unchanged
  - Requirements unchanged: yes — one decision (A: no fps → clock + guard) feeds `step()` as planned
  - Solution still feasible: yes — midpoint seek measured 30/30 (research OQ-4)
  - No superior alternative discovered: yes
  **Verdict:** proceed
  **Build notes:**
  - Two predicate modules, `frameStepChord.ts` (`frameStepForChord`) and `playPauseChord.ts`
    (`isPlayPauseChord`), not one module with two symbols. The registry test's `CALL_SYMBOLS`
    map holds ONE symbol per module, which is the limit the prompt-send entry ran into.
  - The registry gains entries `media-frame-step` (`, / .`) and `media-play-pause` (`Space`), host
    `workspace`, and `MediaPlayer.tsx` joins the test's `HOSTS`.
  - ⚠️ The completeness test's STRUCTURAL selector matched only parameters typed exactly
    `KeyboardEvent`, so React's `KeyboardEvent<HTMLDivElement>` was invisible to it. I widened it
    to `/^KeyboardEvent(<[^>]*>)?$/`. **Strict-superset check** (`scratchpad/seldiff.cjs`, TS AST
    over all 5 hosts): old = new on each of the 4 original hosts (3/1/1/1), plus 1 on MediaPlayer.
  - A `pendingFrameRef` makes two quick presses step two frames before WebKit presents the first.
    The plan did not have it; the "two quick presses" test pins it.
  - Space on a focused strip button presses that button instead of toggling play.
  - Mutation proofs, each individual, landing confirmed, restored by `cp` + `shasum`:
    - playing-guard removed → 1 failed
    - pending ref removed → 2 failed
    - registry: `frameStepForChord(` call replaced by an inline key test → 2 failed in
      `chordRegistry.test.ts`
    - Space-on-button guard removed → 1 failed
    - ⚠️ **midpoint → `index/fps` first SURVIVED the live tests.** Their expected values came from
      `seekTargetFor(...)`, so both sides mutated together. I rewrote them as literals
      (`1.5 / 24` …), and the mutant now fails 5 (live + unit).
  **Observable outcomes:**
  - Browser (dev, `media/bc24.mp4` paused at frame 0, player focused):
    - 10 synthetic `.` keydowns dispatched on the focused player element, each followed by a
      frame-presented wait, end on barcode **10**; then 3× `,` end on **7**
    - repeated on `bc30.mp4` (→10, →7) and `bc23976.mp4` (→10, →7)
    - on `bc24.webm`, rVFC `round(mediaTime × 24)` reaches 10, then 7
    - after each sequence the strip timecode reads `00:00:00.07` (24 fps) / `00:00:00.07`
      (30 fps), i.e. the `.ff` field equals the decoded frame index — **one fps source feeds both**
  - Browser (dev): the strip's "previous frame" and "next frame" buttons do the same (one click =
    one frame, by barcode decode), and their `title`s contain `,` and `.`.
  - Browser (dev): at frame 0, `,` stays on 0 (clamped, no negative seek). At the last frame, `.`
    stays on the last frame.
  - Browser (dev): while **playing**, a `.` keydown leaves `paused === false` and seeks nothing
    (A-10). Space on the focused player toggles `paused` (A-2).
  - Browser (dev): with focus in a CodeMirror text tab, a `.` keydown inserts `.` into the doc (the
    chord did not fire). The same with focus in the CC xterm: the PTY receives `.`. Check each
    individually, never as a composite.
  - Browser (dev): `audio.m4a`: `.` moves `currentTime` +1.000 s and `,` −1.000 s (identity on
    `currentTime`).
  - Browser (dev): clicking the `2×` preset → `playbackRate === 2` and that button has
    `aria-pressed="true"` and the other three `"false"`. Setting `el.playbackRate = 0.5` from script
    (standing in for the native control) moves `aria-pressed` to `0.5×` (the strip mirrors
    `ratechange`). The loop toggle → `el.loop === true`, `aria-pressed="true"`; toggled again →
    both false.
  - CLI: `pnpm vitest run src/components/workspace/__tests__/chordRegistry.test.ts` exits 0 with the
    new `frame-step` registry entry, and the reachability test names `MediaPlayer.tsx` as a host.
    The OLD host set must be a **subset** of the new one (`[[widened-selector-must-be-strict-superset]]`):
    diff the candidate sets.
  **Alignment questions:**
  - A-2 (Space toggles play/pause) and A-10 (`,` / `.` do nothing while playing) in action. Still
    right in a real review?
  - The speed presets and loop toggle as built (screenshot): readable as selected states, in the
    right place?
  - [x] P2.1 `frameStepChord.ts` on `ChordEvent`: bare `,` → -1, bare `.` → +1, null when any of
        ⌘/Ctrl/Alt is held. Shift is `null` too, since `<` and `>` are other keys. A Space
        predicate goes in the same module, or a sibling `playPauseChord`, whichever the registry's
        one-entry-per-chord rule needs. Unit tests prove each modifier individually.
        <!-- status: done -->
  - [x] P2.2 MediaPlayer:
        - an `onKeyDown` on its focusable wrapper (`tabIndex=0`, ImageView precedent)
        - frame-step only while `paused`: seek to `seekTargetFor(frameIndexAt(mediaTime) ± 1)`,
          clamped to `[0, lastFrame]`
        - audio steps ±1 s; Space → play/pause
        - `preventDefault` + `stopPropagation` only when it acts
        <!-- status: done -->
  - [x] P2.3 Strip controls:
        - ‹ / › frame buttons (video only)
        - a 0.5× / 1× / 1.5× / 2× segmented preset and a Loop toggle, all `aria-pressed`
        - state is read from the element via `ratechange` and the `loop` attribute, with no
          parallel React copy that could drift
        <!-- status: done -->
  - [x] P2.4 `CHORD_REGISTRY` rows for frame-step and play/pause (`whenFocused: "a video or audio
        file in the editor tab"`), plus `MediaPlayer.tsx` added to the test's `HOSTS`. Mutation-prove
        the reachability: remove the predicate call from MediaPlayer, and the test must fail.
        Confirm the mutant landed (`[[verify-the-mutation-landed]]`).
        <!-- status: done -->
  - [x] P2.5 Tests:
        - jsdom: keydown `.` on a paused stubbed `<video>` sets `currentTime` to the midpoint of
          the next frame, as an identity on the value. `.` while playing leaves `currentTime`
          untouched. Clamp at 0.
        - presets set `playbackRate`, and an external `ratechange` moves `aria-pressed`
        - mutation-prove the midpoint (swap to `index/fps`) and the playing-guard individually
        <!-- status: done -->
  - [x] verify-auto  <!-- status: done -->
    - The first `pnpm verify:auto` → EXIT=1: `offInvariantGuard.test.ts` "the chord arm's content
      selector … does not shrink" expected **18** chord modules and got **20**. It is a pinned
      count that demands a deliberate edit. The +2 are `frameStepChord.ts` / `playPauseChord.ts`,
      in scope and correctly ungated. The F9 fix: set the count to 20, with a growth-log entry.
      Every substantive arm of that file was green against both modules in the failing run.
    - Re-run `pnpm verify:auto` → EXIT=0 in 32 s. lint 0 errors (1 pre-existing XtermPane
      warning) · format ok · tsc ok · `check:link` clean · vitest 254 files / 3391 tests ·
      cargo fmt / clippy / test ok.
  - [x] verify-self  <!-- status: done -->
    - Orchestrator-driven via the MCP bridge on a **fresh relaunch** of `pnpm tauri:dev` (the
      previous instance had HMR'd edits to MediaPlayer, which holds refs/state —
      `[[hmr-stale-across-file-rename]]`). The `window` error tap was self-tested (a
      `tap-positive-control` throw was caught) and read `[]` across every check below.
      Integration boundary: YES. The consuming surface is the file tree → editor `"file"` tab,
      and every check opened its file that way.
    - [x] O-step identity (frame-step is barcode-decoded per step; every step presented a frame
          via rVFC):
          - `bc24.mp4`: `.`×10 → 1,2,…,10, then `,`×3 → 9,8,7. Timecode `00:00:00.07 / 00:00:20.00`.
          - `bc30.mp4`: the same 1…10 → 7. Timecode `00:00:00.07 / 00:00:20.00`.
          - `bc23976.mp4`: the same 1…10 → 7. Timecode `00:00:00.07 / 00:00:20.00`.
          - `bc24.webm`: 13/13 steps presented a new frame and the timecode (from rVFC
            `mediaTime`) ends `00:00:00.07`. The canvas read is blocked for VP9 (instrument
            only), so identity here comes from `mediaTime`.
    - [x] O-buttons — evidence: next, next, prev → decode `[1, 2, 1]`. Titles `Previous frame (,)`
          / `Next frame (.)`.
    - [x] O-clamp — evidence: at frame 0, `,` → decode 0 (`currentTime` 0.0208 = 0.5/24). At frame
          479, `.` → decode 479, timecode `00:00:19.23 / 00:00:20.00`.
    - [x] O-playing (A-10) + Space (A-2) — evidence:
          - `play()` ok. `.` while playing → `paused:false`, `defaultPrevented:false`, and the
            video kept advancing naturally.
          - Space on the player → `paused` `[true → false → true]`.
          - Space on a focused Loop button → `paused` unchanged `[true, true]`.
    - [x] O-isolation (each driven individually):
          - `.` dispatched on the CC xterm's helper textarea → not prevented, and the video stays
            on frame 7 (`currentTime` unchanged).
          - `.` and Space dispatched into CodeMirror `.cm-content` (README.md tab) → not
            prevented; the video's `currentTime` is unchanged and it stays paused.
    - [x] O-audio — evidence: `audio.m4a` from 10 s: `.`, `,`, `,` → `currentTime` `[11, 10, 9]`.
          Timecode `00:00:09.000 / 00:00:29.975`; no `media-step*` element.
    - [x] O-rate/loop — evidence:
          - default pressed `[media-rate-1]`; clicking 2× → `playbackRate` 2, pressed
            `[media-rate-2]`
          - script `playbackRate = 0.5` (standing in for the native control) → pressed
            `[media-rate-0.5]`
          - Loop → `loop:true`, `aria-pressed:"true"`; again → `false`/`"false"`
    - [x] O-registry — evidence: `chordRegistry.test.ts` 22 passed with the two new entries and
          `MediaPlayer.tsx` in `HOSTS`. Strict-superset proof in the build notes. The
          reachability mutant fails 2.
    - [x] O-real-keys (closed by the operator at P2.verify-human.3)  <!-- was UNVERIFIED: no harness — real keystrokes into the dev app; buildable: no (synthetic keydown never triggers a native default, and macOS refuses `activate()` from the agent — `[[agent-cannot-send-real-keystrokes-to-dev-app]]`) -->
          Two things only real keys show. (1) After **clicking the video itself** (focus on the
          `<video>`), does Space toggle **once**? WebKit's native control might also handle it
          and double-toggle. (2) Typing `.` in a text tab still inserts a `.`.
    - [x] align: A-2 + A-10 in action — evidence: the O-playing results above. The operator
          should feel it with real keys (O-real-keys).
    - [x] align: speed presets + Loop as built — evidence: `scratchpad/p2-strip.jpg` (strip:
          ‹ › · timecode · 0.5× 1× 1.5× 2× · Loop). ⚠️ The capture shows **1×** highlighted while the
          DOM had 1.5× + Loop pressed. Cause found: the window went `visibilityState:"hidden"`
          mid-run and WebKit froze the global `input, button { transition: border-color 0.25s }`
          (12 live animations). The matched rules are correct: `.media-zoom-btn.is-active`
          gives the active buttons the `#6ea8ff` border. The operator judges the live strip.
  - [x] verify-human  <!-- status: done — operator 2026-10-20: "all good" -->
    - [x] P2.verify-human.1: happy path — review a video with the keyboard + strip; A-2 (Space) and A-10 (keys inert while playing) in action — operator: pass
    - [x] P2.verify-human.2: speed presets + Loop as built — legible selected state, right place? — operator: pass
    - [x] P2.verify-human.3: real keys — click the video itself, then Space toggles ONCE (no native double toggle); `.` still types in a text tab — operator: pass (closes P2 verify-self O-real-keys)
  - [x] verify-codify  <!-- status: done -->
    - Integration boundary: the consuming surface is EditorSplit → PaneTabs → MediaView →
      MediaPlayer (the file tab). The `review controls (M16 WP3 Phase 2)` block in
      `mediaTabLive.test.tsx` already covered, from build:
      - midpoint identity and the two-quick-presses pending frame
      - clamp at 0; playing-inert; strip buttons + titles; outside-the-player isolation
      - Space toggle / Space on a button
      - rate presets + external `ratechange`; loop; audio ±1 s

      The chord predicates are unit-tested per modifier (`frameStepChord.test.ts`), and the
      registry is covered by `chordRegistry.test.ts`.
    - Two gaps closed with new live tests:
      - "`.` at the LAST frame stays on the last frame"
      - "with NO frame rate, a step uses the 1/30 s guard (operator decision A)" (identity:
        writes `[1.5 / 30]`)
    - Mutation proofs (individual, landed, restored by `shasum`):
      - end clamp → `Number.MAX_SAFE_INTEGER` → 1 failed
      - fallback `?? FALLBACK_FPS` → `?? 24` → 1 failed
    - Full gate: `pnpm verify:auto` → EXIT=0 in 37 s, 254 files / 3393 tests, `check:link`
      clean, cargo green.

- [x] Phase 3: Reload keeps the playhead, missing-card fix, pause when hidden, milestone verification  <!-- status: done -->
  **Relevance check (before Phase 3):** requester still needs it: yes (Phase 2 "all good") ·
  requirements unchanged: yes · feasible: yes · no superior alternative: yes. **Verdict:** proceed.
  **Build notes:**
  - P3.1 was written test-first: both same-mtime-return tests FAILED on the old reducer before
    the fix. The `unrenderable` card is deliberately still short-circuited, because retrying
    identical bytes cannot help.
  - The P3.2 playhead (`{time, paused, rate, loop}`) is a ref owned by MediaView and passed as
    `playhead`. An **arm** flag (reset in a `useLayoutEffect` on `src`) stops a not-yet-loaded
    element's time-0 events from overwriting it. `record()` also requires `readyState ≥ 1` and
    no `error`.
  - P3.3 `observeVisibility`: an `IntersectionObserver` on the media element, a no-op where
    there is none (jsdom; tests install one on `globalThis`).
  - 9 mutants, each individual, landed and restored (`shasum`). All killed:
    - no-restore-time → 5 failed
    - no-resume-play → 1
    - always-old → 1
    - no-armed-guard → 1
    - playhead-held-in-player → 5
    - no-missing-exclusion → 3
    - no-hide-pause → 1
    - resumes-on-show → 1
    - pauses-on-visibilitychange → 1

    ⚠️ The first run of this batch printed NO results because `$LT` held two paths and **zsh does
    not word-split an unquoted var** (`[[zsh-unquoted-var-does-not-word-split]]`), so vitest got
    one bogus argument. I re-ran with the paths passed explicitly.
  **Observable outcomes:**
  - CLI (unit): `mediaReducer` given `ready(missing card)` + `stat-ok` with the **same**
    mtime/size/path recomputes the display: a player for a video, an image for a png (AC-16). It is
    mutation-proven by restoring the unconditional short-circuit and seeing the test fail.
  - CLI (unit): `restorePlayhead(old, newDuration)` → `old` when `newDuration ≥ old`, else 0,
    including the boundary `newDuration === old`.
  - Browser (dev; **state-changing**: overwrites files in `tmp/scratch/scratch-a/media/`, scratch
    only):
    - `bc24.mp4` (20 s) playing at 1.5× with loop on, at about 6.0 s; `cp bc30.mp4 bc24.mp4`
      (20 s, new mtime)
    - within 3 s the element reloads (`src` `?v=` changed), `currentTime` is within one frame of the
      pre-write playhead (an identity on the time, **not** "it reloaded"), `paused === false`,
      `playbackRate === 1.5`, `loop === true`
    - again, **paused** at 6.0 s: after the write, `paused === true` and the barcode decode equals
      `frameIndexAt(6.0, 30)`
  - Browser (dev; state-changing): overwrite with a **2 s** clip (`ffmpeg … -t 2`) while at 6.0 s →
    `currentTime === 0`.
  - Browser (dev; state-changing, the AC-15 regenerate):
    - `rm bc24.mp4`, then the "no longer on disk" card shows
    - restoring the **same** file (`cp -p` from a backup, same mtime) clears the card and resumes
      at the last good playhead (AC-15 + AC-16 together)
    - a truncated write (`head -c 20000 bc30.mp4 > bc24.mp4`, then the full file) passes through
      `unrenderable` and lands at the last good playhead
  - Browser (dev): with a video playing in workspace `scratch-a`, check each hiding path
    **individually**, each from a fresh `paused === false`:
    - switch the center stage to another workspace
    - collapse the right half (ED▶)
    - switch the right panel to Diff
    - activate another editor tab in the same pane

    Each ends with `paused === true`, and returning leaves it paused (A-4). The same holds for
    `audio.m4a` (A-3).
  - Browser (dev): the pause trigger is **not** `visibilitychange`. Dispatching a synthetic
    `visibilitychange` with `document.visibilityState` stubbed to `"hidden"` leaves a playing video
    playing. The real-occlusion check is the operator's (below), because the agent cannot occlude
    the window without activating another app.
  - Browser (debug bundle, `tauri://localhost`, `[[debug-bundle-verifies-bundled-origin]]`): one
    video and one audio file open and play, the readout shows the codec, and `.` steps one frame.
    Hardened runtime stays **deferred to `/release`** and is recorded as deferred, not passed.
  **Alignment questions:**
  - Reload-keeps-the-playhead in action: regenerate a render while it is playing. Is this how you
    want it to behave, and does the brief reload flash feel acceptable?
  - A-3/A-4 in action: a playing video or audio stops when you switch workspace or tab, and stays
    stopped when you come back. Still what you want?
  - A-5 (operator-held, real occlusion): play `audio.m4a`, cover the Claudesk window with another
    app or switch Space. Is it **still audible**? (WebKit may suspend media in an occluded window by
    itself. If it does, AC-18 needs a decision, not a code fix.)
  - Dogfood (operator-only, AC-21): a real review pass on `scripture-reading` output. Its full
    renders are ≥ 4 GiB and get the card; use a trim. It is recorded as deferred if not done.
  - [x] P3.1 `mediaReducer`: in the `stat-ok` arm, do not short-circuit when the current display is
        the `missing` card; recompute instead (AC-16). Add a same-mtime restore test that fails on
        the old reducer (`[[prove-guard-hole-via-head-test-copy]]` if a HEAD comparison is needed).
        <!-- status: done -->
  - [x] P3.2 Playhead memory:
        - a ref in **MediaView** keyed by path, so it survives the player unmounting through a
          card state: `{ time, paused, rate, loop }`, written on `timeupdate` / `pause` / `play` /
          `ratechange` and on unmount
        - MediaPlayer gets it as `restore` and applies it at `loadeddata` through
          `restorePlayhead` (`mediaClock.ts`), then re-reads the fps
        - key the media element on `assetUrlFor(stat)` so a regenerate is a clean element
        <!-- status: done -->
  - [x] P3.3 Pause when hidden:
        - an `IntersectionObserver` on the media element in MediaPlayer; on
          `isIntersecting:false`, `pause()`, with no resume
        - the observer factory is injectable, so jsdom tests drive it, and the real one is used in
          the app
        - ⚠️ No `visibilitychange` listener anywhere in the player (AC-18)
        <!-- status: done -->
  - [x] P3.4 Tests:
        - jsdom: with a stubbed observer, `isIntersecting:false` → `pause` called once; `true` →
          `play` NOT called
        - a `visibilitychange` event → `pause` not called
        - the restore path sets `currentTime` to the stored time on `loadeddata`, as an identity
          assertion, using a fixture where the stored time ≠ 0 and ≤ duration, plus the
          shorter-file → 0 case
        - mutation-prove each individually
        <!-- status: done -->
  - [x] P3.5 Docs: set `wbs.md` WP3 tasks 3.1–3.8 to `[x]`, with an "As built" line. The CHORD
        registry is already done in P2.4. (`arch/right-panel-surfaces.md` is resynced at
        `/product-finalize`, not here.)
        <!-- status: done -->
  - [x] verify-auto  <!-- status: done -->
    - The first `pnpm verify:auto` → EXIT=1 at **lint**: 4 `react-hooks` (compiler) errors,
      "Cannot modify local variables after render completes", on `playhead.current = …` in
      MediaPlayer. A PROP named `playhead` is treated as immutable. The F9 fix was mechanical:
      rename the prop to `playheadRef: RefObject<Playhead | null>`. The lint recognises ref-named
      values, and nothing changed semantically (the mutation proofs above ran on the identical
      logic).
    - Re-run `pnpm verify:auto` → EXIT=0 in 33 s. lint 0 errors (1 pre-existing XtermPane warning)
      · format ok · tsc ok · `check:link` clean · vitest 254 files / 3406 tests · cargo
      fmt / clippy / test ok.
    - After the F9b O-hide fix: `pnpm verify:auto` → EXIT=0 in 37 s, 254 files / 3412 tests,
      `check:link` clean, cargo green.
  - [x] verify-self  <!-- status: done (O-hide FAILED → F9b fix → re-verified) -->
    - Orchestrator-driven via the MCP bridge on a fresh relaunch; error tap self-tested, `[]`
      throughout. The state-changing writes are all in `tmp/scratch/scratch-a/media/` (declared),
      with a backup at `scratchpad/fx/bc24.orig.mp4`. Consuming surface: the file tree → editor
      tab → `fs-change` → `checkDiskForPaths` → MediaView epoch.
    - [x] O-regen-playing — evidence:
          - `bc24.mp4` playing at 1.5× + loop, seeked to 2.0 s, then `cp bc30.mp4 → bc24.mp4`
            (tmp + mv)
          - `src ?v=` moved 1792513609486 → 1792516396025; `paused:false`, `rate:1.5`,
            `loop:true`
          - 1.55 s after the write `ct` = 6.07 s, which matches continuing from about 4.1 s at
            reload (2.0 + 1.4 s × 1.5), not a restart from 0 (that would read about 2.3)
    - [x] O-regen-paused (identity) — evidence: paused at 6.0 s on the 30 fps file (decode 180),
          then the 24 fps file written → `ct:6`, `paused:true`, `rate:1.5`, `loop:true`, decode
          **144** (= frameIndexAt(6.0, 24)), timecode `00:00:06.00 / 00:00:20.00`. The first read
          was mid-seek (decode 0); a re-read showed 144.
    - [x] O-regen-shorter — evidence: a 2 s clip written while at 6 s → `ct:0`, timecode
          `00:00:00.00 / 00:00:02.02`.
    - [x] O-missing-unchanged (AC-15 + AC-16 live) — evidence:
          - at 6.0 s / frame 144: `mv media/bc24.mp4 → held-bc24.mp4` → card `missing`
          - `mv` back, with mtime `1792516427` / size 40262 unchanged on both sides → the player
            returns with the SAME `?v=1792516427251`, `ct:6`, decode 144, 1.5×, loop
    - [x] O-unrenderable-intermediate — evidence: 5000 random bytes written → card
          `unrenderable`; then the full file → `ct:6`, decode **144**, paused, 1.5×, loop.
          (`head -c 20000` of the faststart 30 fps file still PLAYED, so it was not an
          unrenderable intermediate; it was replaced with random bytes.)
    - [x] O-hide  <!-- status: FIXED via F9b, re-verified 2026-10-20 (was FAILED BLOCKING — AC-17) -->
          - Playing → hidden, sampled after 500 ms: **collapse-right paused**, but **Diff panel:
            NOT paused** and **another editor tab: NOT paused**. Both were still playing on return.
          - Re-measured as time-to-pause: Diff = **3397 ms**, other tab = **97 ms**. Inconsistent.
          - At the paused-but-hidden moment the element had a zero rect and `offsetParent:null`
            (a `display:none` `.right-panel-slot` ancestor), and a fresh test
            `IntersectionObserver` reported nothing within 600 ms.
          - Cause: WebKit delivers IO callbacks only on RENDERING updates, which it throttles (the
            window also went `visibilityState:hidden` mid-run), so IO latency is unbounded. A
            quick hide-and-return can skip the pause entirely, and a hidden workspace's audio
            plays on for seconds.
          - Not yet run: the workspace-switch path, the `visibilitychange` check, and the
            debug-bundle tier. They are re-run after the fix.
          - **F9b fix:** the `IntersectionObserver` is gone. MediaPlayer checks `isHiddenInApp(el.getBoundingClientRect(), viewport)` on every `timeupdate` (zero rect or wholly off-viewport → `pause()`); pure + unit-tested in `mediaClock.ts`. Mutation proofs:
            - drop the call → 2 failed
            - drop the left-edge rule → 2 failed
            - drop the zero-size rule → it first SURVIVED, because a `display:none` rect sits
              at (0,0) and the edge rule caught it too. I added a zero-size box INSIDE the
              viewport as a case, and that mutant now fails 1.
          - **Re-verify gate (fresh relaunch, `visibilityState` "visible" before and after every
            measurement)**, time from the hide action to `paused`, each path individually from
            playing:
            - collapse right half: **105 ms**
            - Diff panel: **106 ms**
            - another editor tab: **232 ms**
            - switch the center stage to workspace `scratch-c` (opened from the picker): **93 ms**,
              rect x = −98662

            All four were still paused on return (A-4). Back on `scratch-a` the rect x is 1337 and
            the player is still paused. Opening the picker alone does NOT pause: it is an overlay,
            not a center-stage switch, and the rect stayed on screen.
          - **AC-18 stand-in:** playing on screen at x = 1337, then a synthetic `visibilitychange`
            with `visibilityState` stubbed to `"hidden"` → still playing after 1 s (`ct` 14.98).
            **Positive control** in the same run: collapsing the right half paused it in 102 ms.
          - Error tap: one `NotFoundError: The object can not be found here.` caught mid-run. With
            filename + stack instrumentation I **reproduced it**: it is `setPointerCapture` in
            `Filmstrip.tsx` `onStripPointerDown`, thrown by MY synthetic `pointerdown`, which was a
            plain `MouseEvent` with no real `pointerId`. Real pointer input carries an id. This
            is an instrument artifact, not a product defect, and unrelated to the player.
    - [x] O-debug-bundle — evidence:
          - `pnpm tauri build --debug --bundles app --config src-tauri/tauri.dev.json --config
            '{"bundle":{"createUpdaterArtifacts":false}}'` → EXIT 0 in 31 s
          - `open "…/Claudesk Dev.app"` (LaunchServices); `location.origin === "tauri://localhost"`
          - error tap self-tested, `[]`
          - `bc24.mp4`: `src` `asset://localhost/…`, `readyState 4`, readout `704 × 360 · 0:20 ·
            40.3 KB · H.264 · 24 fps · MP4 · media/bc24.mp4`, timecode `00:00:00.00 / 00:00:20.00`,
            decode 0
          - 3× `.` → decode **3**, timecode `00:00:00.03 / 00:00:20.00`
          - `audio.m4a`: readout `0:30 · 265.6 KB · AAC · 44.1 kHz · mono · M4A`, timecode
            `00:00:00.000 / 00:00:29.975`; plays (`currentTime` 0 → 0.25)
          - torn down by PID 38891
          - ⚠️ `codesign -dv` → `flags=0x20002(adhoc,linker-signed)`, no runtime flag: **hardened
            runtime is DEFERRED to `/release`**, not passed (`[[installed-build-verify-deferred-to-release]]`)
    - [x] Fixture hygiene — evidence: `cmp media/bc24.mp4 scratchpad/fx/bc24.orig.mp4` → identical
          (the state-changing writes are undone). `scratch-c` was opened as the second workspace in
          the dev app only.
    - [x] align: reload-keeps-the-playhead — evidence: O-regen-playing / O-regen-paused /
          O-regen-shorter / O-missing-unchanged / O-unrenderable-intermediate above (live data).
          The operator should try a real regenerate.
    - [x] align: A-3/A-4 — evidence: O-hide re-verify (4 paths, 93–232 ms, all stay paused on
          return); audio uses the same `timeupdate` path.
    - [x] A-5 real occlusion (closed by the operator at P3.verify-human.3)  <!-- was UNVERIFIED: no harness — covering the window needs another app activated or a Space switch, which the agent cannot do without side effects (`[[feedback_osascript_activate_side_effects]]`); buildable: no. Synthetic stand-in passed (O-hide AC-18 stand-in). -->
    - [x] Dogfood on `scripture-reading` output — DEFERRED (operator, P3.verify-human.4)  <!-- was UNVERIFIED: undrivable — the operator's own project and judgment (AC-21); full renders ≥ 4 GiB get the card by R-4a -->
  - [x] verify-human  <!-- status: done — operator 2026-10-20: "all good, defer dogfood" -->
    - [x] P3.verify-human.1: happy path — regenerate a render while it plays / while paused; it comes back where you were (time, play state, speed, loop) — operator: pass
    - [x] P3.verify-human.2: A-3/A-4 — a playing video or audio stops when you switch workspace / panel / tab / collapse, and stays stopped on return — operator: pass
    - [x] P3.verify-human.3: A-5 real occlusion — play audio, cover the window or switch Space: still audible? — operator: pass (closes the A-5 UNVERIFIED leaf)
    - [x] P3.verify-human.4: dogfood on `scripture-reading` output (AC-21) — **DEFERRED by operator decision 2026-10-20, NOT passed.** Recorded as deferred (AC-21).
  - [x] verify-codify  <!-- status: done -->
    - Integration boundary: the consuming surface is EditorSplit → PaneTabs → MediaView →
      MediaPlayer, reloaded through `checkDiskForPaths` (the `fs-change` path). Covered by the
      `reload keeps the playhead; pause when hidden (M16 WP3 Phase 3)` block in
      `mediaTabLive.test.tsx`:
      - AC-14 identity; stays-paused; shorter → 0; missing-and-back-unchanged
      - unarmed-element guard; zero-rect and off-viewport pause; `visibilitychange` does not
        pause

      Unit tests: `restoreTime`, `isHiddenInApp` (incl. zero-size-in-viewport), and the
      `mediaReducer` missing-card cases.
    - One gap closed with a new test: "the playhead survives an UNPLAYABLE intermediate write
      (the unrenderable card)". The mutant that resets MediaView's playhead on any card → 2
      failed (this test and the missing-card one). Landed and restored by `shasum`.
    - Full gate: `pnpm verify:auto` → EXIT=0 in 61 s, 254 files / 3413 tests, `check:link`
      clean, cargo green.

## Ship
- Commit `b450287` `feat(m16-wp3): review player for audio and video in the editor tab`, on
  `main`, **not pushed** (per the handoff note: push only on the operator's request).
- The three `workflow-system/outbox/HANDOFF-to-mccc-*.md` files were deliberately left
  uncommitted (operator instruction).
- Final gate: `pnpm verify:auto` EXIT=0, 254 files / 3413 tests (P3 verify-codify). No code
  changed after it.
- Cleanup: no TODO / `console.log` / `debugger` in the new or changed modules. Scratch fixtures
  stay in gitignored `tmp/scratch/scratch-a/media/` for future checks. The dev app (`pnpm
  tauri:dev`, started for the operator's P3 look) is still running.

## Current Node
- **Path:** Feature > review-quality
- **Active scope:** review-quality against ship commit `b450287` (feature window: everything since `9bc63e9`)
- **Blocked:** none
- **Unvisited:** review-quality → finalize
- **Open discoveries:** the two-seek fps probe was dropped at build (see Discoveries)

## Discoveries

- [SURFACED-2026-10-20] feature-spec — wbs.md exceeds size guard (427 lines); read the first 100
  lines, the headings, and the WP2/WP3/Probe-outcomes sections in full.
- [SURFACED-2026-10-20] P1.1 — **Plan deviation: the two-seek fps probe was dropped.** The unit
  test `resolveFps(0, 1/0.042)` showed it: VP9's ms-rounded timestamps read a 24 fps file as
  23.81 fps, which is nearer 23.976 than 24. One interval cannot separate the NTSC rates, and
  doing so takes a multi-seek refinement. Every file measured in WKWebView reported a track
  `framerate`, so the fps source order is now **track `framerate` (snapped within 0.05%) →
  `null`**. `null` shows `fps unknown`, the clock timecode, and the 1/30 s step guard, which the
  Phase 1 `(decision)` question already covers. Recorded in `mediaClock.ts → resolveFps`.
- [SURFACED-2026-10-20] P1.1 — **Variable-frame-rate video (e.g. macOS screen recordings) is
  stepped at its AVERAGE rate.** WebKit reports a VFR track's nominal rate. `snapFps` keeps an
  unusual rate raw, so frame-step seeks to the midpoints of an average-rate grid and can land
  imprecisely on VFR content. No VFR fixture was measured. Logged to backlog
  (`SURFACE-2026-10-20-REVIEW-PLAYER-VFR-FRAME-STEP`), low.
- [SURFACED-2026-10-20] P1.3 — `assetUrlFor` moved from `MediaView.tsx` to `mediaIpc.ts`, because
  MediaPlayer needs it and importing it from MediaView would be a cycle. Its only consumers are
  in those two files.
- [SURFACED-2026-10-20] P1.1 — Codec mapping covers only the families measured in WKWebView
  (avc1/avc3, hvc1/hev1, vp09, mp4a.40). Anything else shows raw. That also keeps
  `mediaKindIsTheOnlyExtensionList` green, since `opus` / `flac` / `mp3` as codec literals read
  as a second extension list.


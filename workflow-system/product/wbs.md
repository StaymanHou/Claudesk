---
stage: wbs
state: complete
updated: 2026-09-29
cycle: milestone-16-right-panel-media-viewer
---

# WBS — Milestone 16: Right-panel media viewer

**Scope of this pass:** M16 only (`roadmap.md` → Next → Milestone 16). The supervisor-hardening
bucket and the `/product-vision` revisit that follow it stay tracked in `roadmap.md` and are **not**
decomposed here.

**Source of the ask:** `SURFACE-2026-09-25-RIGHT-PANEL-MEDIA-VIEWER` (backlog). It holds the
measured current state and the media census across all 24 projects, and **this file does not
repeat them**.

⚠️ **Shape changed at decomposition.** The roadmap said *"a single feature, like F-a"*. Once the
grill put a review-grade player in scope, the work became **one probe and two build WPs**. The probe
gates the transport that both build WPs stand on, and the player is large enough to plan and verify
on its own. The roadmap's Shape line now points here.

## Rulings — `/util-grill-me`, 2026-09-29 (SETTLED; do not re-litigate)

**Carried in from the early grill, same day:** the viewer's depth follows the workspace. Software
projects mostly *glance*; media projects (a video-production pipeline) *review*.

**Asked**

1. **Q1: What selects glance vs review? → FILE TYPE.** Images and PDFs get the **glance viewer**:
   fit/zoom, pixel dimensions and file info. Audio and video **always** get the **review player**,
   in every workspace. **No per-project setting** and no profile lookup.
   - Measured before asking: the `original` profile covers `scripture-reading` (media) **and**
     `ai-enablement` (not media), so a profile cannot tell a media workspace from a software one.
     Software projects contain almost no video, so file type carries the ruling.
   - Accepted cost: an **image** in a media workspace gets no review treatment. Thumbnail A/B is
     out.
2. **Q2: What does "review" include?**
   - **In:** native `<video>`/`<audio>` controls · **frame-step** on `,`/`.` while paused (±1 s for
     audio) · **speed** presets 0.5× / 1× / 1.5× / 2× · a whole-file **loop** toggle · a
     **frame-accurate timecode** readout (`hh:mm:ss.ff`, current / total) · **file info**
     (resolution, duration, codec where the webview exposes it) · **reload on disk change,
     keeping the playhead** when the new file is at least that long.
   - **Out of M16** (each could be a later feature): A/B compare of two renders, in/out loop
     ranges, markers or annotations, audio waveform, thumbnail scrub previews.
3. **Q3 (operator correction at the confirm gate): NO separate media tab.** Media opens in the
   editor's **existing `"file"` tab**. There is **no new `TabKind`** in `openFiles.ts` and **no new
   right-panel tab**. Inside the tab, the content area picks the renderer by extension: CodeMirror
   for text, viewer or player for media. So close, reorder, split panes, reveal-in-tree and recents
   all keep working with no parallel path. *(This replaced the grill's proposed `"media"` tab kind.)*

**Assumed** (confirmed by the operator as a set, "mostly yes", with Q3 the one correction)

- **Transport = the Tauri asset protocol.** Add the `protocol-asset` Cargo feature, enable
  `assetProtocol`, and build URLs with `convertFileSrc`. It streams and supports HTTP range
  requests, which video seeking needs.
  - The scope is added **at runtime for each workspace root**, never as a static `**` glob.
  - **Every media path is first resolved through `editor_fs`'s existing two-layer guard**, so the
    asset scope is a second layer, not the only one.
  - A bytes/base64 IPC transport is rejected, because it is wrong for video.
- **CSP exposure is stated, not assumed** (`arch/security-posture.md`, `"csp": null`). A root-scoped
  asset scope lets webview JS *read* files the webview can already read and **write** through
  `editor_fs`, so it adds **no new reach**. The probe confirms this (WP1 §1.4) before it is written
  into `arch/`.
- **SVG** renders **only** through `<img>`, which does not run script. It is never put in `<iframe>`,
  `<object>` or `<embed>`, which would run script under a null CSP. A **view-as-text** toggle opens
  the source in CodeMirror.
- **PDF** ✅ **IN** (the probe measured a native render in both builds). It was included **only if** WKWebView renders it natively over the same transport with no
  bundled renderer (no pdf.js). If it doesn't, it is deferred and logged, and PDFs get the
  unsupported card.
- ⚠️ **Probe verify-human rulings (2026-09-29), which supersede the lines below where they differ:**
  - **(R-4a) A 4 GiB CAP on audio and video.** WebKit will not load media of 4 GiB or more over *any* custom URL scheme; the WP1 matrix has the evidence. Such files get the info card. There is **no loopback HTTP transport**; it was considered and declined.
  - **(R-4b) An "Open in default app" ICON BUTTON in the right-panel tab-row launcher cluster**, beside Sublime Text / Sublime Merge / Finder. It acts on the **active editor file tab** (`/usr/bin/open`, root-confined) and works for **any** file. The info card points to it; this is the button's permanent home, not the card.
  - **(R-4c) Native `<video>` fullscreen WORKS** (operator-verified). The player keeps it. Quitting the app while a video is fullscreen is **out of scope**.
- **An unplayable or unsupported file** shows an **info card with "Open in default app"**
  (`/usr/bin/open <file>`, root-confined). There is **no transcoding**, because bundling ffmpeg would
  break "lite". **Non-UTF-8 non-media files** (today's bare "Could not open") get the same card.
- **A size cap on `read_file`**, added regardless, so a large binary is never read into memory
  before it is rejected. The number is picked at spec time.
- **Confinement to the workspace root.** No media from `~/Movies` or other outside paths.
- **Frame rate** comes from `requestVideoFrameCallback`. ✅ The probe measured it present, at an exact 30.000 fps; 1/30 s is only a guard.
- **Tier: lite-IDE core.** Not behind `workflow_features_enabled`, and the same in every profile. The
  OFF-invariant guard gains **no** arm.

## Design-priors consult

- **`new-surface-must-earn-its-place-against-existing-ones`: fires, rule 2 (it agrees with the
  common-sense default, raising confidence).** The irreducible non-overlap with "Open in default app"
  is **seeing the file without leaving the workspace**. That is a real capability, so the viewer
  earns its place. Q3's "no separate tab" is the same prior applied to the editor: a second tab
  strip for media would duplicate the file tab's lifecycle. **No WP boundary changed.**
- **`explicit-selectable-mode-over-inferred-mode`: fires on Q1, rule 2.** Selecting depth by file
  type is **not** a hidden mode, because it is a visible, deterministic function of the filename. A
  per-project "media workspace" flag would have been the hidden mode, and it was the larger surface.
- **`primary-surface-is-zero-ceremony-not-a-mode`: rule 2.** The editor is a primary surface, so
  opening media must be one click on the file, with no "switch to viewer" step. Q3 guarantees this.
- **`gate-substrate-dependent-feature-class-behind-default-off-opt-in`: does NOT fire (rule 5,
  over-infer guard).** Media viewing depends on no `~/.claude/` substrate and works on a bare
  install, so by the prior's own **applicability** rule it is ungated. Recorded because the absence
  is a decision.
- No other prior governs. The remaining WP-boundary calls were made on common sense (rule 1).

## Work Packages

### WP1: Probe — media in the real WKWebView ✅ CLOSED 2026-09-29 (GO with a 4 GiB cap — see "Probe outcomes")

**Type:** probe
**Milestone:** M16. It **gates WP2 and WP3**: nothing in either is built before its outcome is
recorded.
**Dependencies:** none
**Size:** M

**Learning objective:** Can the asset protocol serve root-confined project files to `<img>`,
`<video>`, `<audio>` and (possibly) a native PDF view in Claudesk's WKWebView, with seekable
playback, in **both** `pnpm tauri:dev` and an **installed-style** production build? Which formats
actually play?

**Why a probe:** codec support, range-request seeking, `requestVideoFrameCallback`, element
fullscreen and PDF rendering are all **platform behaviors**. Reasoning from "Safari plays it" is the
assumption the standing probe-first lesson forbids.
- ⚠️ The dev server origin (`http://localhost:1420`) and the production origin (`tauri://localhost`)
  differ, so **a dev-only pass proves nothing about the installed build**. That is the
  `docs/lessons/verify-self-tiers.md` class.

**Timebox:** 1 day.

**Success criterion:** a written **format × build matrix** under "Probe outcomes" below, plus a
**GO / NO-GO** on the transport.
- **GO requires all of:**
  - the asset protocol serves a root-scoped file in **dev AND a locally built `.app` launched from
    Finder**
  - an H.264 `.mp4` **seeks** to an arbitrary point (proving range requests work)
  - an out-of-root path, **including a symlink inside the root that points out of it**, is refused
- **NO-GO sends the transport back to design**, not around it. Do not fall back to base64 IPC for
  video.

**Tasks:**
- [x] 1.1 Throwaway probe entry (the existing `?cm6probe`-style dev-only pattern under
      `src/probe/`), lazy-mounted, dies with the probe. Enable `protocol-asset` +
      `assetProtocol` **on the probe branch only**, and add the scope at runtime for one scratch
      root (`tmp/scratch/`).
- [x] 1.2 **Fixture set, representative** (`[[measurement-input-must-be-representative]]`):
  - **Images:** png, jpg, gif, webp, heic, **svg** (one of them carrying a `<script>`, to prove
    `<img>` does not run it).
  - **Video:** H.264 mp4, HEVC mp4, mov (ProRes if one is at hand), webm, mkv.
  - **Audio:** mp3, aac/m4a, wav, flac, ogg.
  - **PDF:** one PDF.
  - **Size:** at least one video **long and large enough that a seek cannot be satisfied from a
    first buffered chunk** (hundreds of MB). A 2-second clip measures nothing.
  - Include the real `scripture-reading` outputs if any exist; otherwise use generated ones.
- [x] 1.3 **Per format, record:** does it render or play; does seeking work (set `currentTime` far
      ahead and confirm `seeked` fires with a frame shown); what `videoWidth` / `videoHeight` /
      `duration` report; what an unplayable file does (`error` event? `MediaError.code`? a silent
      hang?). ⚠️ The unsupported card is keyed on whatever signal this finds, so a **hang with no
      event** must be recorded as such.
- [x] 1.4 **Confinement + CSP:**
  - Confirm an out-of-root path and an escaping symlink are refused **by the asset scope itself**.
  - Record whether the scope check canonicalizes, and whether dotfiles and dot-directories match.
  - Confirm SVG-in-`<img>` runs no script.
  - Write the one-paragraph CSP-exposure statement for `arch/security-posture.md` from what was
    **measured**.
- [x] 1.5 **`requestVideoFrameCallback`:** is it present in this WKWebView? Can a stable fps be
      derived from successive `mediaTime` deltas? If not, record that frame-step falls back to
      1/30 s.
- [x] 1.6 **Fullscreen:** does the native `<video>` fullscreen button work inside the Tauri window?
      If it is dead, record it. The player then relies on the existing right-panel collapse/ratio
      presets, and no fullscreen work is added.
- [x] 1.7 **PDF:** does an asset-URL PDF render natively in an `<iframe>`/`<embed>` with no bundled
      renderer? This decides the Assumed PDF line either way.
- [x] 1.8 **Installed-style parity:** repeat 1.3–1.7 for **mp4 seek, png, svg, PDF and one
      unplayable file** on a locally built `.app` (`pnpm tauri build`) launched **from Finder**.
      ⚠️ This is a local build, **not** a release. **Do not `brew upgrade`**
      (`[[never-propose-brew-upgrade-to-verify-a-release]]`). Tear down only the PID you launched.
- [x] 1.9 Record the matrix, the GO/NO-GO and the measured CSP paragraph under "Probe outcomes". If
      the matrix changes a ruling's premise (for example PDF is out, or frame-step is fixed-step),
      update the ruling line in this file.

**WP1 → WP2 rationale:** the transport is the one piece both build WPs stand on, and it is the only
piece whose failure would change the design rather than the code. It costs a day to learn now; a
WP2 built on an assumed transport would be re-planned wholesale.

### WP2: Media in the editor tab — transport, glance viewer, unsupported card

**Milestone:** M16
**Dependencies:** WP1 (GO)
**Size:** L

**Description:** The end-to-end path. Clicking an image, SVG or (if WP1 allows) a PDF in the file
tree, Cmd+P or search opens it in an ordinary editor **file tab** and shows it. Clicking anything
unplayable or binary shows the info card. This WP carries all the plumbing WP3 reuses.

**Tasks:**
- [ ] 2.1 **Backend transport:**
  - The `protocol-asset` feature + `assetProtocol` config.
  - Add each workspace root to the asset scope at runtime when the workspace opens.
  - Add a **`stat_media(root, path)`** command that resolves the path through `editor_fs`'s
    Layer 1 (`validate_root`) and Layer 2 (`resolve_within`, which is private, so the command lives
    **inside `editor_fs`**, the same reason `docs` reuses `read_file_core`). It returns the
    canonical absolute path, size and mtime. **The frontend converts only a path this command
    returned.** Its tests use `TempDir` and include the escaping-leaf-symlink case.
- [ ] 2.2 **`read_file` size cap:** stat before read, with a new typed `EditorFsError` variant. It
      routes to the info card, not to `editor-error`. The number is set at spec time.
- [ ] 2.3 *(R-4b)* **`open_in_default_app(root, path)`, plus its tab-row ICON BUTTON** in the launcher cluster (`sublime/sublimeLaunch.ts` is the precedent). It acts on the active file tab and is enabled for any file tab. **`open_in_default_app(root, path)`:** root-confined through the same guard, spawning
      `/usr/bin/open <file>`. `finder`'s spawn is the precedent. ⚠️ It is an external-process spawn,
      so it gets the installed-build smoke check (it rides `env_path`'s captured PATH).
- [ ] 2.4 **One pure classifier `mediaKind(path)`** → `image | svg | pdf | video | audio | null`,
      by extension, with the table taken from WP1's matrix. ⚠️ **Every consumer calls this one
      function.** No site re-derives "is this media" from an extension list of its own. That is
      the "funnel shared-state reads through ONE function" rule, and the
      `[[derived-state-is-not-a-proxy-for-its-event]]` sweep below depends on it.
- [ ] 2.5 **The file-tab branch, with no new `TabKind`:**
  - For a `"file"` tab whose `mediaKind` is non-null, `EditorSplit` **skips the load-once
    `read_file`/`stat_file` effect and the disk-conflict check**, and registers **no** `editorDocs`
    entry.
  - `PaneTabs` renders the viewer instead of CodeMirror.
  - ⚠️ **Sweep every consumer of a file tab and decide its media behavior explicitly.** Today the
    `kind`-branching lives in `openFiles.ts` and `PaneTabs.tsx` only, but the implicit
    "file tab ⇒ has a CM6 doc" consumers are wider: dirty dot, ⌘S, close-with-unsaved confirm,
    find/replace, wrap toggle, font zoom, command-palette commands, split panes, reveal-in-tree,
    and tab teardown on delete.
  - Each consumer either works (split, reveal, teardown, close) or is inert (save, dirty, find,
    wrap). None may throw or show a stale CM6 buffer.
  - Enumerate the sites by grep **before** planning (`[[doc-correction-scope-list-is-a-floor]]`
    applies to code sweeps too).
- [ ] 2.6 **Glance viewer (images):**
  - Fit-to-pane by default, with zoom in/out and 1:1.
  - A readout of pixel dimensions, file size and format.
  - The dark theme, copying hex values from existing surfaces (`[[no-css-custom-property-layer]]`).
  - Decide whether ⌘+/⌘− drive image zoom or stay font-zoom-only as part of the 2.5 sweep, not ad
    hoc.
- [ ] 2.7 **SVG:** rendered through `<img>` **only**, with a **view-as-text** toggle that shows the
      source in CodeMirror (the read-only synthetic seam, or a normal load, whichever 2.5's sweep
      makes cheaper). ⚠️ A guard pins that no SVG path reaches `<iframe>`/`<object>`/`<embed>`, and
      it is mutation-proven.
- [ ] 2.8 **PDF (only if WP1 said GO for PDF):** native render over the asset URL. Otherwise PDF
      maps to the unsupported card and a backlog SURFACE is filed.
- [ ] 2.9 *(R-4a)* **Unsupported / unplayable card**, which also covers **audio/video of 4 GiB or more**, decided from `stat_media`'s size before any `<video>` is built:
  - Shows the filename, size and type, with **Open in default app** (2.3).
  - Used for a `mediaKind` that fails to render (keyed on WP1's measured failure signal), for
    non-UTF-8 non-media files (replacing the bare "Could not open"), and for the size-cap refusal.
- [ ] 2.10 **Reload on disk change:**
  - Subscribe to the existing `fs-change` stream (`src/state/fsChange.ts`) and re-`stat_media` on
    a matching path.
  - Cache-bust the asset URL with the mtime so WebKit does not serve the stale bytes.
  - ⚠️ Classify by re-statting, **not** by `FsChange.kind`, because the backend folds mixed batches
    to `Other` (the Docs-panel lesson).
- [ ] 2.11 **Verification:**
  - A live check through the MCP bridge in dev.
  - An **installed-build** check of 2.1's scope, 2.3's spawn and one image. It runs on a local
    `.app`, or is deferred to the `/release` gate per
    `[[installed-build-verify-deferred-to-release]]`, and that deferral is **recorded as a
    deferral, not a pass**.
  - Render-level tests use the jsdom + `mockIPC` harness (`liveWorkspace.tsx`), not `?raw` guards,
    wherever the question is *what the DOM shows*.

**WP2 → WP3 rationale:** WP3 is a renderer plugged into the branch, the transport and the reload
path WP2 builds. Building the player first would mean building those inside it and then extracting
them. Images are also the dominant census format (about 1,300 files), so WP2 alone already pays off
in every software workspace.

### WP3: Review player — audio and video

**Milestone:** M16
**Dependencies:** WP2
**Size:** M

**Description:** The review-grade player the grill ruled in, for every audio and video file in
every workspace. The scope is exactly Q2's "In" list, and nothing from its "Out" list.

**Tasks:**
- [ ] 3.1 **Player shell:** native `<video>`/`<audio>` controls on the WP2 asset URL, plus a
      Claudesk control strip below them. Audio gets the same strip without the frame-based controls.
- [ ] 3.2 **Frame-step** on `,` / `.` while paused. The step is the fps measured in WP1 §1.5, or the
      1/30 s fallback. For audio it is ±1 s. ⚠️ **Chord registration follows the existing
      convention:** a `*Chord.ts` predicate module on the shared `chordEvent.ts`, scoped to the
      focused player, so it cannot fire while CodeMirror or the CC pane has focus. Check the key
      against the reserved chords first (`[[cmd-shift-digit-reserved-for-filmstrip]]`, the panel
      chords in `panelHost.ts`).
- [ ] 3.3 **Speed** presets (0.5× / 1× / 1.5× / 2×) and a whole-file **loop** toggle. Both are
      visible states, not hidden ones (`explicit-selectable-mode-over-inferred-mode`).
- [ ] 3.4 **Timecode** readout, `hh:mm:ss.ff` current / total, with `.ff` derived from the same fps
      source as 3.2. ⚠️ The fps derivation lives in **one** pure module that both 3.2 and 3.4 read,
      so they cannot disagree.
- [ ] 3.5 **File info:** resolution, duration, size, and codec where the webview exposes it. WP1
      records what it exposes; do not promise a field the platform does not give.
- [ ] 3.6 **Reload keeps the playhead:** on WP2's reload path, restore `currentTime` when the new
      duration is at least the old playhead, otherwise go to 0, and keep the paused/playing state.
      ⚠️ Test this as an **identity** assertion on the restored time, not "it reloaded"
      (`docs/lessons/source-text-guards.md` entry 15).
- [ ] 3.7 **Background workspaces:** a player in a workspace that is not on center stage, or in a
      non-front editor tab, **pauses** when hidden. All workspaces stay mounted, so an un-paused
      video keeps playing audio from an invisible workspace. Decide at spec whether it resumes on
      return (the default: no).
- [ ] 3.8 **Verification:**
  - A live dev check on the WP1 fixture set, including the large seek fixture and a regenerate
    during playback (write a new file over it).
  - The installed-build tier as in 2.11.
  - ⚠️ The dogfood check is **operator-only**: a real review pass on `scripture-reading` output.
    It is recorded as a deferred check if the pipeline has no output yet.

## Dependency map

```
WP1 (probe, GO/NO-GO) ──► WP2 (transport + editor branch + glance + card) ──► WP3 (review player)
```

- The critical path is all three, in sequence. There is **no parallel track**: WP2 and WP3 share
  the transport and the branch, and WP1 gates both.
- WP1 NO-GO → `/product-arch` back-loop on the transport (P8), not a workaround inside WP2.

## Exit criteria (M16)

- An image, an SVG, an mp4 and an mp3 each open from the file tree into an ordinary editor tab and
  render or play, in **dev and an installed build**. The installed half may be deferred to
  `/release` only if recorded as deferred.
- A video seeks, frame-steps, changes speed, loops and shows a frame-accurate timecode, and it
  keeps its playhead when the file is regenerated on disk.
- An unplayable file and a non-UTF-8 binary both show the info card, and **Open in default app**
  works.
- No media path escapes the workspace root, including through a symlink, and no SVG reaches a
  script-executing element. Both are pinned by mutation-proven tests.
- `arch/right-panel-surfaces.md` and `arch/security-posture.md` carry the as-built transport and the
  measured CSP statement (resynced at `/product-finalize`).

## Probe outcomes

### WP1 — media in the real WKWebView (2026-09-29) — **GO, with a 4 GiB cap**

Measured with the throwaway `?mediaprobe` harness (`src/probe/media/`), first in `pnpm tauri:dev`
(origin `http://localhost:1420`), then in a **debug `.app` bundle** built with the dev identity and
launched through LaunchServices (`open`; origin **`tauri://localhost`**, MCP bridge present). **Every
row matched between the two origins.** Full evidence: `workflow-system/state/archive/m16-wp1-media-probe.md`
(the WIP file until archive).

**GO / NO-GO: GO.**
- The asset protocol serves root-scoped files in both builds.
- A 336 MB, 660 s H.264 file seeks to 400 s exactly. `fetch` Range reads return **206** with a
  correct `content-range`.
- An escaping symlink and an absolute out-of-root path are both refused.

**Format × build matrix (dev = bundled on every row):**

| Kind | Plays / renders | Does not |
|---|---|---|
| Image | png, jpg, gif, webp, **heic**, svg (in `<img>`) | — |
| Video | H.264 mp4, **HEVC** mp4, **ProRes** mov, **VP9 webm** | **mkv** (MEDIA_ERR 4, `canPlayType` "") |
| Audio | mp3, m4a/aac, wav, flac, **ogg vorbis**, **ogg opus** | — |
| PDF | **native render in `<iframe>` and `<embed>`** over the asset URL, no bundled renderer | — |
| Other | — | a non-UTF-8 binary shows as an `<img>` error |

⚠️ **Every failure is a FAST `error` event, never a hang** (`hang:false` on all rows). WP2's
unsupported card keys on the `error` event / `MediaError.code`, with no timeout path needed.

**⚠️ The 4 GiB finding (ruled R-4a): media of 4 GiB or more will not load over ANY custom URL scheme.**
- The real `scripture-reading` render (4.86 GB, 2 h 15 m, 1080p24 High@4.0, faststart) fails with
  MEDIA_ERR 4 within about 60 ms.
- Discriminators:
  - A **stream-copied** 10-min cut of it plays, so the codec is not the cause.
  - A 4.04 GB synthetic plays and seeks to 7000 s, while a **5.05 GB** one built from the same
    stream fails.
  - The same 5.05 GB file **plays over plain HTTP** in the same WebKit.
  - A hand-written, u64-correct `mprobe://` handler **fails identically**. WebKit reads 8-byte atom
    headers and gives up, while every 206 carried the right total.
- So the limit is WebKit's **media loading over a custom scheme**, not Tauri's asset handler, and it
  is not fixable in our handler. Operator ruled **the cap + an "Open in default app" tab-row
  button** (R-4a/R-4b). A loopback HTTP transport was considered and declined.

**Confinement + CSP (measured; the paragraph for `arch/security-posture.md`):**
- The asset scope **resolves symlinks before matching**:
  - an in-root symlink to an in-root file loads (640 px)
  - an in-root symlink escaping the root is refused
  - an absolute out-of-root path is refused
  - the in-root positive control loads in the same run
- ⚠️ **Dot-paths are refused by default**: `.hidden/hidden.png`, inside the scope root, does not load.
  WP2 decides whether media under a dot-directory matters (default: accept the refusal and show the
  card).
- SVG in `<img>` **does not run its script**. The same SVG in `<object>` **does** (the positive
  control), which is why R-SVG's `<img>`-only rule is load-bearing.
- **CSP statement:** with `"csp": null`, a root-scoped asset scope admits webview reads **only**
  inside roots that `editor_fs` already exposes for **read and write**. The asset protocol serves
  GET only. So it adds **no new reach**, provided the static scope stays `[]` (pinned by
  `src-tauri/tests/asset_protocol_scope.rs`, mutation-proven).

**`requestVideoFrameCallback`: present in both builds.** `h264.mp4` gave 40 frames with a median
Δ of 0.03333 s, i.e. **30.000 fps**, matching ffprobe's 30/1. **Frame-step uses the measured fps;
the 1/30 s fallback stays only as a guard.**

**Fullscreen (ruled R-4c):** `fullscreenEnabled` is true. A scripted `requestFullscreen` is rejected
without transient activation (expected), and **the native control works on a real click**
(operator-verified). The player keeps it.

**Observed for WP3:** after a **paused** seek with `preload="metadata"`, tiles report
`readyState ≥ 2` but **paint no frame**. WP3 must check `preload="auto"` (or a play/pause nudge)
before promising a visible frame after frame-step or seek.

**Deferred to `/release` (NOT passed):** a **release-profile** build with **hardened runtime** and
notarization. The debug bundle is `adhoc, linker-signed` with no runtime flag (`codesign -dv`), so
hardened-runtime media behavior is unmeasured. Low risk (WebKit media is in-process AppKit, not a
subprocess spawn), but recorded as a deferral.

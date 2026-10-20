---
shape: archived-backlog-entry
archived: 2026-10-20
source: workflow-system/state/backlog.md (verbatim; deleted from the backlog on resolve at the M16 /product-finalize — see CHANGELOG 2026-10-20)
---

## SURFACE-2026-09-25-RIGHT-PANEL-MEDIA-VIEWER

- **Priority:** medium
- **Surfaced by:** operator request (2026-09-25, at session restore after v0.7.0)
- **Target:** product:roadmap (a new feature ask, not a defect in shipped code)
- **Type:** new-work
- **Status:** pending — **decomposed as Milestone 16** (`wbs.md`, 2026-09-29). **WP1 (probe) shipped 2026-09-29: GO with a 4 GiB cap.** ✅ **WP2 shipped 2026-09-29 (`e883091`): images, SVG and PDF display in the editor tab, with the info card and "Open in default app".** ✅ **WP3 shipped 2026-10-20 (`b450287`): the audio/video review player.** All three WPs are done; this entry closes at M16's `/product-finalize`. The grill and probe rulings in `wbs.md` supersede the open questions below.

**The ask:** the right-panel editor should **show images and play audio and video.** The trigger is
F-b. Now that isolated profiles exist, some workspaces are **non-coding** (media production), and
for those the editor pane is useless on the files that matter. This is **lite-IDE core**, not a
workflow-gated feature (M10.9 tier 1).

**Current state, measured 2026-09-25 (cited by symbol):**

- **Binary files are refused outright.** `editor_fs::read_file_core` does a `std::fs::read` and then
  `String::from_utf8`. Anything that fails that check becomes `EditorFsError::NotUtf8`, which
  `EditorPanel` renders as `editor-error` ("Could not open {path}"). There is no other binary
  detection.
- ⚠️ **`read_file` has NO SIZE CAP.** Today, opening a multi-GB video reads the whole file into
  memory *before* it gets rejected. A media branch has to route around `read_file`, and a size cap
  may be worth adding regardless.
- **SVG and other files that happen to be valid UTF-8 open as TEXT.** Decide whether SVG should
  open as an image, as text, or offer both.
- **No media preview exists anywhere.** There is no `convertFileSrc`, `asset://` or `<img>` in
  `src/`. `DocMarkdown` does not resolve relative images either.
- **Tab seam:** `openFiles.ts` has `TabKind = "file" | "synthetic"`, and `PaneTabs` switches on
  `kind`. A new path-bearing `"media"` kind, chosen by extension inside `EditorSplit.openFile`, fits
  the existing seam. That branch must **skip the per-path `read_file`/`stat_file` load effect**,
  which currently runs for every tab.

**Design questions the pickup must settle (not decided here):**

1. **Transport.** One option is the asset protocol: add the `protocol-asset` Cargo feature, set
   `assetProtocol.scope`, and use `convertFileSrc`. It streams and supports HTTP range requests,
   which **video and audio seeking need**. The other option is a bytes/base64 IPC command, which is
   fine for small images and wrong for video. ⚠️ Scope interacts with `[[app-ships-with-no-csp]]`
   (`"csp": null`): a broad asset scope makes any project file readable by webview JS. The webview
   already has the full `__TAURI_INTERNALS__` surface, so this probably adds no new exposure, but
   **state it explicitly** rather than assume it.
2. **Codec reality: it must be a PROBE, not an assumption.** WKWebView plays what Safari plays. That
   likely covers mp4/H.264/HEVC, mov, mp3/aac/wav and common images including HEIC, while
   webm/ogg/mkv support is partial or absent. Per the standing probe-first lesson, **run each format
   in the real webview** before promising it, and decide what an unplayable file shows.
3. **Scope boundary.** Viewer/player only, or also light operations (zoom/fit, a scrubber, file
   info)? No editing is implied by the ask.
4. **Profile-aware or universal?** The motivation is non-coding profiles, but a viewer helps every
   workspace. The default reading is **universal**, unless a design prior says otherwise.

**Pickup shape:** probably a small feature (`/feature-spec`). Following the Group F convention, a
`/util-grill-me` pass on Q1–Q3 is the natural entry step, and a codec probe comes before any UI work.

**Early grill, 2026-09-29 (PARTIAL; stopped by the operator: "we will discuss the spec when we get
to the milestone").** One question was put:

- **Is the viewer's job a *glance* or a *review*?** → **Both, depending on the project or profile.**
  *"For software project, it's mostly glance. For media project, like a video production pipeline,
  it's review."* ⚠️ **This overturns the recommendation that was offered** (glance-only, with an
  "Open in default app" escape for review work, per `new-surface-must-earn-its-place-against-existing-ones`).
  So a review-grade player is **in scope** for media workspaces, and this also answers design
  question 4 above: the viewer is **NOT universal-and-uniform**; its depth follows the workspace's
  kind. ⚠️ **Open for the spec:**
  - What selects glance vs review: the profile, a per-project setting, or the file type?
  - What does "review" include: frame-step, speed, loop, A/B compare?

**Facts measured for that grill, so they are not re-derived:**
- **The media census across all 24 projects.** Images dominate (about 1,300 png/jpg/svg), PDFs come
  second (97 in `ops-data-hub`), there are 20 mp3s in `light-bot-remastered`, and there is nearly no
  video yet. No webm, mkv or HEIC was found.
- **The media workspace** is `youtube-channel/scripture-reading` (profile `original`), which is still
  at the pilot/pipeline stage.
- **No `protocol-asset` Cargo feature exists yet.** `finder`'s `/usr/bin/open` spawn is the reusable
  "open in default app" path.

**Defaults noted but NOT yet taken.** They were cheap to reverse, so they were not asked, but they
should be re-read at spec time:
- **Transport** is the asset protocol, with its scope added at **runtime per open workspace root**,
  not a static `**` glob. That keeps the webview's reach equal to `editor_fs`'s existing root
  confinement.
- **SVG** renders via `<img>` only (never `<iframe>`/`<object>`, which run script under
  `"csp": null`), with a way to open the source as text.
- **An unplayable format** shows a card with "Open in default app", and no transcoding (bundling
  ffmpeg would break "lite").
- **PDF** is included in the codec probe as a candidate, because it rides the same transport.
- The pane **reloads when the file changes on disk** (pipelines regenerate outputs).
- A **size cap** is added to `read_file` regardless.


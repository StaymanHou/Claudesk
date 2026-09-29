---
drive_mode: autopilot
---

# Feature: M16 WP2 — Media in the editor tab (transport, glance viewer, unsupported card)

**Workflow:** feature
**State:** plan (complete)
**Created:** 2026-09-29
**Entry:** spec (complex feature)
**Source:** `workflow-system/product/wbs.md` → WP2 (tasks 2.1–2.11). The grill rulings Q1–Q3, R-4a/b/c
and the WP1 probe outcomes there are **settled inputs**, not restated here beyond what the spec needs.

## Problem Statement

Today, clicking an image, PDF, video or audio file in the file tree, Cmd+P, the diff panel or a
search result opens an editor tab that runs `read_file`. `read_file_core` does
`std::fs::read` of the **whole file** and then fails UTF-8, so the tab ends in the bare
`editor-error` "Could not open …" state. For a multi-GB render, the file is read fully into RAM first.
There is no way to *see* a project's media without leaving Claudesk.

WP2 builds the end-to-end path WP3's player will reuse: a root-confined asset-protocol transport, a
media branch inside the existing `"file"` tab (no new `TabKind`), a glance viewer for images, SVG
and PDF, one info card for everything that cannot be shown, an "Open in default app" launcher, a
`read_file` size cap, reload on disk change, and **deletion of the WP1 probe**.

## User Stories

- As the operator, I want to click a screenshot, diagram or PDF in the file tree and see it in the
  editor tab, so I can check it without leaving the workspace.
- As the operator, I want a file Claudesk cannot show (a 4.86 GB render, an `.mkv`, a `.zip`) to
  tell me what it is and hand it to the right app in one click, instead of "Could not open".
- As the operator, I want an image that CC regenerates on disk to refresh in place, so I see the
  new version, not a cached one.
- As the operator, I want media tabs to behave like any other file tab (close, ⌘W, ⌘1–9, split,
  tree highlight, delete teardown) with no parallel tab system.

## Acceptance Criteria

**Transport and confinement**
- AC-1. A `stat_media(root, path)` command lives **inside `editor_fs`** and resolves the path
  through `validate_frontend_root` (Layer 1) and `resolve_within` (Layer 2). It returns the
  canonical absolute path, `size`, `mtime_ms` and a backend-sniffed `pdf_magic: bool` (first bytes
  are `%PDF-`). On its first successful call for a root it adds that **validated** root to the
  asset scope (`allow_directory(root, true)`). The frontend builds an asset URL **only** from a path
  this command returned. Its tests use `TempDir` and include the escaping **leaf** symlink, an
  escaping **directory** symlink, `..` and an absolute out-of-root path.
- AC-2. The static asset scope's `allow` list stays `[]`. The config becomes
  `{"allow": [], "requireLiteralLeadingDot": false}` so media under dot-directories loads (see
  Assumed A-2). `src-tauri/tests/asset_protocol_scope.rs` is updated to pin **both** the empty
  `allow` and the dot flag, and it stays mutation-proven (a `"**"` in `allow` fails it).
- AC-3. **The WP1 probe is gone:** `src-tauri/src/media_probe/` + its `mod` line, the `mprobe://`
  `register_uri_scheme_protocol` block in `lib.rs`, `media_probe_allow` in `generate_handler!`,
  `src/probe/media/`, the `?mediaprobe` flag and its `main.tsx` comment. `grep -rn "M16 WP1
  PROBE\|mediaprobe\|media_probe\|mprobe"` over `src/` and `src-tauri/src/` returns 0. The
  `Cargo.toml` `protocol-asset` comment is relabelled to the M16 media transport.
  ⚠️ Deletion and every consumer migration land in **one phase**, and that phase passes
  `pnpm check:link` plus a live boot check (`#root` has children) before any live observation is
  trusted (backlog high item on ESM export deletion).

**Classification and branch**
- AC-4. One pure `mediaKind(path)` → `"image" | "svg" | "pdf" | "video" | "audio" | null`, by
  extension (case-insensitive), with the table taken from WP1's matrix. Every consumer calls it; no
  other site keeps its own media extension list (guarded: a test fails if a second extension list
  for these kinds appears in `src/`).
- AC-5. For a `"file"` tab whose `mediaKind` is non-null:
  - `PaneTabs`'s `prevPaths` effect does **not** call `onTabOpen` (no `editorDocs` entry), so the
    load-once `read_file`/`stat_file` effect never runs for it. **Asserted by a render test with
    `mockIPC`: opening `a.png` issues zero `read_file` calls** (identity, not a count of tabs).
  - `PaneTabs` renders the lazy media viewer instead of `EditorPanel`, **before** the existing
    `EditorPanel`/`SyntheticView` branch, keeping that fall-through order.
- AC-6. Every site in the consumer sweep (below) behaves as its row says. None throws, and none shows
  a stale CM6 buffer. `chordRegistry.ts` is updated for the viewer's zoom chords.

**Viewers**
- AC-7. **Image** (`png jpg jpeg gif webp heic heif bmp ico avif` per the WP1 table): fit-to-pane by
  default, zoom in/out, 1:1, and fit. A readout shows pixel dimensions, file size, format and the
  repo-relative path (media tabs have no EditorPanel status bar, so the viewer carries its own).
  With the viewer focused, ⌘= / ⌘− / ⌘0 zoom the **image** and do **not** change the persisted
  editor font size.
- AC-8. **SVG** renders through `<img>` **only**, with a view-as-text toggle that shows the source
  in CodeMirror. A guard pins that no media path reaches `<iframe>`/`<object>`/`<embed>` except the
  PDF branch in AC-9, and it is mutation-proven.
- AC-9. **PDF** renders natively in an `<iframe>` over the asset URL **only when `pdf_magic` is
  true**. Otherwise the info card is shown. ⚠️ Adversarial check: `evil.pdf` whose content is HTML
  with a `<script>` must **not** run script (Tauri's asset handler sniffs content, then falls back
  to the extension, and an unknown extension falls back to `text/html`). Verified live and by a
  mutation-proven test on the gate.
- AC-10. **Video and audio in WP2** open to the info card, with a note that the player arrives in
  WP3. *(WP3 replaces this arm; WP2 does not build a player.)* Audio/video of **4 GiB or more**
  always get the card (R-4a), decided from `stat_media`'s `size` before any `<video>` is built.

**Info card, launcher, read cap**
- AC-11. One info card component shows filename, size, type and **Open in default app**. It is used
  for: (a) a `mediaKind` whose element fires `error` (WP1: every failure is a fast `error` event,
  so there is no timeout path); (b) the size-cap refusal; (c) a `pdf_magic`-false PDF; (d) WP2's
  audio/video arm; (e) **non-UTF-8 non-media files**, replacing the bare "Could not open". Other
  load errors (outside root, missing file, I/O) keep `editor-error`.
- AC-12. `open_in_default_app(root, path)` is root-confined through the same guard and spawns
  `/usr/bin/open <canonical file>` fire-and-forget (`finder` is the precedent, including its
  `record_external_launch` call if a tool identity fits). An **icon button** sits in the tab-row
  launcher cluster beside Sublime Text / Sublime Merge / Finder. It acts on the **active editor file
  tab** and is disabled (with a title explaining why) when the right panel has no active file tab.
- AC-13. `read_file` stats before reading. A file larger than **64 MiB** is refused with a new typed
  `EditorFsError::TooLarge { path, size, limit }`, and a file whose first 8 KiB contain a NUL byte
  is refused as `NotUtf8` **without a full read**. The frontend routes both to the info card via a
  stable prefix, not a free-text match (the string DTO stays, so the prefix is pinned by a test on
  both sides).

**Reload**
- AC-14. On an `fs-change` whose paths include an open media tab's path, the viewer re-runs
  `stat_media` and, if `mtime_ms` or `size` changed, cache-busts its asset URL with the mtime.
  Classification is by re-stat, never by `FsChange.kind`. An image rewritten on disk shows the new
  pixels (live check: overwrite a fixture with a different image and compare `naturalWidth`).
  A media file deleted on disk shows the info card with a "no longer on disk" line (it does not
  close the tab; external deletes do not close text tabs either).

**Verification**
- AC-15. `pnpm verify:auto` green. Render tests use the jsdom + `mockIPC` harness
  (`liveWorkspace.tsx`) wherever the question is what the DOM shows.
- AC-16. Live dev check via the MCP bridge: png, heic, svg (incl. script-carrying), pdf, `evil.pdf`,
  a dot-path screenshot, an mp4 (card), a 4 GiB+ file (card), a `.zip` (card), Open in default
  app, reload on overwrite.
- AC-17. The installed-build tier (asset scope in `tauri://localhost`, the `open` spawn under the
  GUI PATH, one image) runs on a debug bundle (`[[debug-bundle-verifies-bundled-origin]]`) or is
  **recorded as deferred** to `/release` (`[[installed-build-verify-deferred-to-release]]`), never
  as a pass.

## Consumer sweep (from the 2026-09-29 code sweep; 40 sites, this is the decision per group)

| Group | Sites | Media-tab behavior |
|---|---|---|
| Doc registry + load | `PaneTabs` `prevPaths` effect; `EditorSplit` load-once effect; `editorDocs`; `EditorPanel` error branch | **Gate at `PaneTabs` `prevPaths`** (the one choke point). Everything downstream is then unreachable. |
| Disk check / conflict | `checkDisk`, `checkDiskForPaths`, `reloadFromDisk`, conflict modal, `onActivated` | Inert (no entry). The viewer adds its own fs-change refresh from `RightPanelHost`'s existing listener (AC-14). |
| Dirty / save / close | dirty dot, ⌘S (CM6 keymap), `onSave`, close-with-unsaved, `dirtyDocCount`, workspace-close probe, quit | Inert or already correct: never dirty, ⌘S unhandled, closes immediately, counts 0. |
| Editor chords | find/replace, go-to-line, wrap, font zoom, ⌘D, palette | Inert (CM6-owned), except zoom, which the viewer takes over while focused (AC-7). ⚠️ Check live that an unhandled ⌘R in a media tab does not reload the webview. |
| Search highlight | `highlightTarget` | Ignored by the viewer. Only SVG can arrive from search (it is UTF-8). |
| Tabs / panes | ⌘W, ⌘1–9, split, tree highlight, delete teardown | Work unchanged (kind-agnostic or path-based). The same media in two panes = two viewers; acceptable. |
| Open entry points | file tree, Cmd+P, search, diff Open, create-file | All route through `openFile` → no per-entry work. A created empty `x.png` fails to decode → card. |

## Out of Scope

- The review player (frame-step, speed, loop, timecode, reload-keeps-playhead, background pause):
  **WP3**. WP2's video/audio arm is the card.
- Transcoding, a loopback HTTP transport, pdf.js or any bundled renderer.
- Media outside the workspace root (`~/Movies` etc.).
- Tab persistence, rename handling, closing tabs on external delete (not done for text tabs either).
- An "Open in default app" item in the file-tree context menu (the tab-row button is the ruled home).
- Removing a root from the asset scope when its workspace closes (see A-5).

## Technical Constraints

- **Probe WP1 is complete and GO** (`wbs.md` → Probe outcomes). No 3rd-party service is involved;
  WebKit/Tauri platform behaviors were measured there.
- Tauri 2.11.2. `app.asset_protocol_scope().allow_directory(path, true)`; the dot behavior is the
  scope's `requireLiteralLeadingDot` (defaults to refusing dot-paths on macOS).
- The asset handler sets `Content-Type` via `MimeType::parse`: `infer` on the first bytes, then the
  extension, and an **unknown extension falls back to `text/html`**. This is why AC-9 gates the
  iframe on backend-sniffed `%PDF-`. `<img>` and `<video>` never execute script whatever the MIME.
- `"csp": null` (`arch/security-posture.md`). The measured WP1 statement holds: a root-scoped asset
  scope adds no reach beyond `editor_fs`'s read/write. Dot-paths do not change that (`read_file`
  already reads dotfiles).
- `open_in_default_app` is an external-process spawn, so it rides `env_path`'s captured PATH and
  needs the installed-build tier (it uses the absolute `/usr/bin/open`, so PATH should not matter,
  but the tier is still recorded).
- Commands that stat/spawn are cheap and non-blocking; `sync_commands_do_not_block.rs` must stay
  green (no sleeps or polls in them).
- No design-token layer: copy hex values from existing surfaces (`[[no-css-custom-property-layer]]`).
  Dark only.
- Tier: lite-IDE core, ungated. The OFF-invariant guard gains no arm.

## Design-priors consult

- `[PRIOR: escape-hatch-to-the-os-over-in-app-infrastructure]` fires, rule 2 (agrees with the
  default): the card + default-app button covers mkv, 4 GiB+ and arbitrary binaries instead of a
  transcoder or HTTP server. Higher confidence, no change.
- `new-surface-must-earn-its-place-against-existing-ones`: rule 2, as at WBS time. The viewer
  earns its place by not leaving the workspace; it reuses the file tab rather than adding a surface.
- `primary-surface-is-zero-ceremony-not-a-mode`: rule 2. One click on the file opens it; no mode.
- No other prior governs (rule 1).

## Asked

- *(none)* Every open decision below failed at least one of the three clauses: it was
  discoverable, or it is cheap to reverse once noticed. The spec presentation is the review point.

## Assumed (defaults taken without asking — review these)

- **A-1. `read_file` cap = 64 MiB, plus a NUL sniff of the first 8 KiB.** Measured: real text
  files in your projects reach **45 MB** (`cloudflare-investigation/*.json`, a 35 MB `.jsonl`), so a
  small cap would break files that open today. Only two ≥97 MB Playwright console logs exceed 64 MiB.
  The sniff is what actually keeps a large binary out of memory; the cap handles huge text. A
  constant, cheap to change.
- **A-2. Dot-path media LOADS** (`requireLiteralLeadingDot: false`). ⚠️ **This reverses the WBS's
  provisional default ("show the card").** Measured: 209 of 1,963 project media files sit under dot
  directories, about **65 of them `.playwright-mcp` screenshots across 9 projects**, and the file
  tree shows those directories (only `.git` is excluded). It adds no reach (`read_file` already
  reads dotfiles). One config line to revert.
- **A-3. ⌘= / ⌘− / ⌘0 zoom the image when the viewer is focused** and leave the editor font size
  alone. Today they are CM6-only and would be dead keys on a media tab; Preview behaves this way.
- **A-4. PDF gated on backend `%PDF-` magic**, not the extension alone (security; see Technical
  Constraints).
- **A-5. Roots are added to the asset scope lazily** on the first `stat_media` for that root and
  are **not removed** when the workspace closes. They are validated known projects that `editor_fs`
  can already read and write, so leaving them allowed adds no reach, and it avoids a close hook.
- **A-6. SVG view-as-text uses the read-only synthetic seam** unless the plan's code read shows a
  normal CM6 load is cheaper; either way the text view is read-only in WP2 (edit the SVG as text
  from a normal tab is out of scope).
- **A-7. The default-app button is disabled, not hidden,** when there is no active file tab, with a
  tooltip, so the launcher cluster does not shift.
- **A-8. A media file deleted on disk shows the card** ("no longer on disk") rather than closing
  the tab, matching text tabs.
- **A-9. Image extension table** beyond WP1's measured set (`bmp ico avif heif`) is included only
  if the plan's live check renders them; otherwise they map to `null` and open as text → card via
  the NUL sniff.

## Open Questions

- *(none requiring `/feature-research`.)* Two live checks belong in the first build phase, not a
  spike: the `evil.pdf` non-execution (AC-9) and ⌘R in a media tab (sweep row "Editor chords").
  Both have a defined fallback (card-only PDF; `preventDefault` on ⌘R) if they fail.

## Work Tree

**Fixtures:** `tmp/scratch/media-probe/fixtures/` (WP1 set: every format in the matrix,
`script.svg`, `doc.pdf`, `not-media.bin`, `escape-link.png`, `inner-link.png`, `large.mp4` 336 MB,
`pilot-psalms-v1.mp4` 4.86 GB APFS clone). It sits under the claudesk root, which is a known
project, so `stat_media` accepts it with `root = <claudesk>`. Phase-local additions (`evil.pdf`,
`.hidden/shot.png`, a >64 MiB text file) are created **inside that fixtures dir** and listed in
the outcome that makes them.

- [ ] Phase 1: Backend transport, read cap, default-app command, probe deletion  <!-- status: NOT-STARTED -->
  **Observable outcomes:**
  - CLI: `pnpm verify:auto` exits 0, including new `editor_fs` tests: `stat_media` returns the
    canonical path + size + mtime for an in-root file; refuses `..`, an absolute out-of-root path,
    an escaping **leaf** symlink and an escaping **directory** symlink (`TempDir`); `pdf_magic` is
    true for a `%PDF-` file and false for an HTML file named `x.pdf`.
  - CLI: `read_file_core` (order: **stat → size cap → 8 KiB NUL sniff → full read**) on `TempDir`
    files: 64 MiB + 1 byte (sparse) → `TooLarge { size, limit }`; exactly 64 MiB of valid UTF-8 → Ok
    (boundary); a 60 MiB sparse file with a NUL at byte 0 → `NotUtf8` (variant identity — this
    proves the sniff arm is taken, not that the full read was skipped; the latter is by
    construction and read in review); a small UTF-8 file → Ok (positive control).
  - CLI: `src-tauri/tests/asset_protocol_scope.rs` passes with the new object form and **fails**
    under two individually-run mutants: `"allow": ["**"]`, and `requireLiteralLeadingDot` removed.
  - CLI: `grep -rn "M16 WP1 PROBE\|mediaprobe\|media_probe\|mprobe" src src-tauri/src` → 0 lines;
    `pnpm check:link` exits 0.
  - Browser (MCP bridge, `pnpm tauri:dev`): boot check — `document.querySelector('#root').children.length > 0`
    after the probe deletion, **before** any other live reading is trusted.
  - Browser (MCP bridge): `ipc_execute_command stat_media {root:<claudesk>, path:"tmp/scratch/media-probe/fixtures/image.png"}`
    returns `{path, size, mtime_ms, pdf_magic:false}`; then `new Image()` with
    `convertFileSrc(path)` fires `load` with `naturalWidth > 0`. The same for
    `escape-link.png` → `stat_media` errors (OutsideWorkspace).
  - Browser (MCP bridge, state-changing: creates `fixtures/.hidden/shot.png` as a copy of `image.png`):
    after `stat_media` on it, the asset URL fires `load` (dot-path now admitted, A-2).
  - CLI (state-changing: spawns `open`, operator-visible — opens `image.png` in Preview):
    `ipc_execute_command open_in_default_app {root, path:"tmp/scratch/media-probe/fixtures/image.png"}`
    returns Ok, and `pgrep -x Preview` finds a process within 3 s. Out-of-root path → Err, no spawn.
  **Alignment questions:**
  - none (no user-visible surface yet; the cap and dot-path decisions become visible in Phase 2).
  - [ ] P1.1 Delete the WP1 probe, every touch point: `src-tauri/src/media_probe/` + `mod media_probe;`
        (`lib.rs`), the `mprobe` `register_uri_scheme_protocol` block, `media_probe_allow` in
        `generate_handler!`, `src/probe/media/`, the `?mediaprobe` branch + comment in `main.tsx`.
        Relabel the `Cargo.toml` `protocol-asset` comment. Grep to zero.  <!-- status: NOT-STARTED -->
  - [ ] P1.2 `tauri.conf.json` scope → `{"allow": [], "requireLiteralLeadingDot": false}`; update
        `asset_protocol_scope.rs` to pin both fields; mutation-prove each mutant individually.  <!-- status: NOT-STARTED -->
  - [ ] P1.3 `read_file_core`: stat first → `EditorFsError::TooLarge { path, size, limit }` above
        `READ_FILE_MAX_BYTES = 64 MiB`; then read the first 8 KiB and refuse a NUL as `NotUtf8`
        before the full read. Define one stable error **prefix** constant per variant the frontend
        routes on (`TooLarge`, `NotUtf8`) and export it for a cross-side test.  <!-- status: NOT-STARTED -->
  - [ ] P1.4 `stat_media_core(root, path)` + `stat_media` command **inside `editor_fs`**
        (`validate_frontend_root` → `resolve_within` → metadata + 5-byte `%PDF-` sniff) returning a
        `MediaStat { path, size, mtime_ms, pdf_magic }` (snake_case DTO). On success, `allow_directory(root, true)`
        on the validated canonical root (idempotent; A-5). Register in `generate_handler!`.  <!-- status: NOT-STARTED -->
  - [ ] P1.5 `open_in_default_app(root, path)`: same guard, then `/usr/bin/open <canonical>` fire-and-forget,
        pure `open_command` builder unit-tested like `finder_command`. Lives in `editor_fs` (it needs
        `resolve_within`). Register; confirm `sync_commands_do_not_block.rs` stays green.  <!-- status: NOT-STARTED -->
  - [ ] P1.6 TS mirrors: `MediaStat` type, `statMedia()` / `openInDefaultApp()` wrappers, and a
        `classifyReadError(msg)` that maps the pinned prefixes → `"too-large" | "not-utf8" | "other"`,
        with a test that imports the SAME prefix strings the Rust side asserts (a Rust test reads
        the TS constant file via `include_str!`, or vice versa — one source, two readers).  <!-- status: NOT-STARTED -->
  - [ ] verify-auto  <!-- status: NOT-STARTED -->
  - [ ] verify-self  <!-- status: NOT-STARTED -->
  - [ ] verify-human  <!-- status: NOT-STARTED -->
  - [ ] verify-codify  <!-- status: NOT-STARTED -->

- [ ] Phase 2: Media branch in the file tab — image glance viewer, info card, default-app button  <!-- status: NOT-STARTED; depends on Phase 1 -->
  **Observable outcomes:**
  - CLI: `pnpm verify:auto` exits 0, including: `mediaKind` table tests (every WP1 extension,
    upper-case variants, `null` for `.ts`/`.mkv`→`video`, no-extension); a guard that no second
    media-extension list exists in `src/` (mutation: paste a `[".png", …]` literal elsewhere → fails).
  - CLI: render test (`liveWorkspace.tsx` + `mockIPC`): opening `a.png` issues **zero** `read_file`
    calls and ≥1 `stat_media`; opening `a.ts` still issues `read_file` (positive control). Mutation:
    remove the `PaneTabs` `prevPaths` gate → the zero-`read_file` assertion fails.
  - CLI: render test: a `read_file` rejection carrying the `NotUtf8` prefix renders
    `data-testid="media-card"` (not `editor-error`); an `OutsideWorkspace` message still renders
    `editor-error`; a `TooLarge` message renders the card with the size line.
  - Browser (MCP bridge): clicking `tmp/scratch/media-probe/fixtures/image.png` in the file tree shows
    `[data-testid="media-image"]` whose `img.naturalWidth > 0`; the readout text contains the pixel
    dimensions ffprobe/`sips -g pixelWidth -g pixelHeight` reports for that file, its size and `PNG`.
    Same for `image.heic`, `image.webp`, `image.gif`, and `.hidden/shot.png` (dot-path).
  - Browser (MCP bridge): with the viewer focused, a synthetic ⌘= raises the image's rendered scale
    (bounding-rect width grows) and `localStorage["claudesk.editor.fontSize"]` is **unchanged**;
    ⌘0 returns to fit. `1:1` button → rendered width == `naturalWidth` (at devicePixelRatio 1 CSS px).
  - Browser (MCP bridge): `h264.mp4`, `audio.mp3`, `h264.mkv`, `not-media.bin`, and
    `pilot-psalms-v1.mp4` each show `media-card` with filename + size + type; the 4.86 GB file's card
    says it is over the 4 GiB limit; **no `<video>` element exists** in the DOM for it.
  - Browser (MCP bridge): the `open-default-app` launcher button is `disabled` with a Diff/Terminal
    surface active or no tab open, enabled with a file tab active; clicking it with `image.png`
    active → `pgrep -x Preview` finds a process (state-changing, operator-visible).
  - Browser (MCP bridge): ⌘W closes a media tab with no confirm; ⌘1–9 activates it; the tree row
    shows `isActive`; the tab strip shows **no dirty dot**; a synthetic ⌘R with a media tab focused
    does **not** reload the webview (a `window.__probe = 1` sentinel survives). If it does reload,
    P2.8 adds the `preventDefault`.
  - Console: no uncaught errors (self-tested `window` `error` tap, `[[read-logs-console-captures-nothing]]`).
  **Alignment questions:**
  - A-2 in action: a `.playwright-mcp`-style dot-path screenshot now opens as an image. Still what you want?
  - A-3 in action: ⌘= / ⌘− / ⌘0 zoom the image, not the editor font. Still what you want?
  - A-7 in action: the default-app button is greyed (not hidden) with no file tab. Placement and icon look right?
  - The glance viewer's look (fit, readout position, zoom controls) against the rest of the dark UI.
  - [ ] P2.1 `src/components/workspace/editor/mediaKind.ts` — pure classifier + the one extension
        table (WP1 measured set; A-9 extras only if P2's live check renders them). The
        second-list guard.  <!-- status: NOT-STARTED -->
  - [ ] P2.2 `PaneTabs`: gate the `prevPaths` `onTabOpen`/`onTabClose` diff on `mediaKind(path) === null`;
        render a lazy `MediaView` before the `EditorPanel` branch (keep the SyntheticView
        fall-through); update `lazyBundleWiring.test.ts` for the new lazy import.  <!-- status: NOT-STARTED -->
  - [ ] P2.3 `MediaView` shell: `statMedia` on mount → state machine
        `loading | ready(stat) | card(reason) | error(msg)` as a pure reducer (tested), then dispatch by
        kind. Video/audio and ≥4 GiB → card (WP2 arm, AC-10).  <!-- status: NOT-STARTED -->
  - [ ] P2.4 `ImageView`: fit / zoom in / zoom out / 1:1; readout (dimensions from `naturalWidth/Height`,
        size, format, repo-relative path); `error` event → card. Hex copied from existing surfaces.  <!-- status: NOT-STARTED -->
  - [ ] P2.5 Zoom chords: a `mediaZoomChord.ts` predicate on `chordEvent.ts`, handled only while the
        viewer has focus; add the entries to `chordRegistry.ts`; confirm no collision with the
        reserved chords.  <!-- status: NOT-STARTED -->
  - [ ] P2.6 `MediaCard`: filename, size, type, reason line, "Open in default app" (calls P1.6's
        wrapper). Route `EditorPanel`'s load-error branch through `classifyReadError`: `not-utf8` /
        `too-large` → `MediaCard`, `other` → the existing `editor-error`.  <!-- status: NOT-STARTED -->
  - [ ] P2.7 Tab-row `open-default-app` icon button in `RightPanelHost`'s launcher cluster, acting on
        the editor's reported active path; disabled + titled when there is none or a non-Editor
        surface is showing.  <!-- status: NOT-STARTED -->
  - [ ] P2.8 (conditional) `preventDefault` ⌘R in the media viewer if the live check shows a reload.  <!-- status: NOT-STARTED -->
  - [ ] verify-auto  <!-- status: NOT-STARTED -->
  - [ ] verify-self  <!-- status: NOT-STARTED -->
  - [ ] verify-human  <!-- status: NOT-STARTED -->
  - [ ] verify-codify  <!-- status: NOT-STARTED -->

- [ ] Phase 3: SVG, PDF (gated), reload on disk change, installed-build tier  <!-- status: NOT-STARTED; depends on Phase 2 -->
  **Observable outcomes:**
  - CLI: `pnpm verify:auto` exits 0, including a mutation-proven guard: no media component renders
    `<iframe>`/`<object>`/`<embed>` except `PdfView`, and `PdfView` renders its `<iframe>` only when
    `pdf_magic` is true — **rendered** under jsdom (not `?raw`): a `MediaView` for `x.pdf` with
    `pdf_magic:false` contains no `iframe`; with `true` it contains exactly one. Mutation: drop the
    `pdf_magic` check → the `false` case fails. Mutation: render `script.svg` via `<object>` → the
    SVG guard fails.
  - Browser (MCP bridge): `image.svg` renders `[data-testid="media-svg"] img` with `naturalWidth > 0`;
    `script.svg` renders and a `window.__svgRan` sentinel its script would set stays `undefined`;
    the view-as-text toggle shows the SVG source in a read-only CM6 view (`.cm-content` text starts
    with `<svg` or `<?xml`), and toggling back restores the image.
  - Browser (MCP bridge): `doc.pdf` shows `[data-testid="media-pdf"] iframe` and its asset URL
    responds 200 with `content-type: application/pdf` (fetch HEAD/GET from the webview).
  - Browser (MCP bridge, state-changing: creates `fixtures/evil.pdf` = an HTML page whose script sets
    `parent.__evilRan = 1` and `document.title`): opening it shows `media-card` (pdf_magic false),
    **no iframe**, and `window.__evilRan` stays `undefined`.
  - Browser (MCP bridge, state-changing: overwrites a copy `fixtures/reload.png` with `image.jpg`'s
    pixels via `sips`/`cp` while its tab is open): within 2 s the viewer's `img.src` query carries the
    new mtime and `naturalWidth` equals the new image's width (differs from the old). Then `rm` it →
    the tab shows `media-card` with a "no longer on disk" line and the tab stays open.
  - Browser (installed-origin tier): on a debug bundle (`tauri build --debug --bundles app` with the dev
    config, launched via `open`, `[[debug-bundle-verifies-bundled-origin]]`): `image.png` renders and
    `open_in_default_app` spawns Preview. **Or** recorded as `DEFERRED-to-release`, not passed.
  **Alignment questions:**
  - A-6 in action: SVG view-as-text is read-only. Enough, or do you want to edit an SVG from that toggle?
  - A-8 in action: a deleted media file keeps its tab and shows the card. Still what you want?
  - PDF in the native WebKit viewer inside the tab: usable at the right-panel width?
  - [ ] P3.1 `SvgView`: `<img>` only + view-as-text toggle (read-only; synthetic seam or CM6
        read-only, whichever the code read shows is cheaper — record the choice).  <!-- status: NOT-STARTED -->
  - [ ] P3.2 `PdfView`: `<iframe>` over the asset URL, gated on `pdf_magic`; `false` → card with a
        "not a PDF" reason.  <!-- status: NOT-STARTED -->
  - [ ] P3.3 The rendered no-script-element guard (jsdom, mutation-proven, two mutants run
        individually).  <!-- status: NOT-STARTED -->
  - [ ] P3.4 Reload: `RightPanelHost`'s existing `fs-change` listener fans matching paths to open
        media views (a small per-host registry or event, not a second `listen`); the view re-`statMedia`s,
        cache-busts `?v=<mtime_ms>` on change, and shows the card on a stat failure. Classify by
        re-stat only.  <!-- status: NOT-STARTED -->
  - [ ] P3.5 Installed-origin tier on a debug bundle, or record the deferral.  <!-- status: NOT-STARTED -->
  - [ ] verify-auto  <!-- status: NOT-STARTED -->
  - [ ] verify-self  <!-- status: NOT-STARTED -->
  - [ ] verify-human  <!-- status: NOT-STARTED -->
  - [ ] verify-codify  <!-- status: NOT-STARTED -->

## Current Node
- **Path:** Feature > Phase 1 > P1.1
- **Active scope:** P1.1 (delete the WP1 probe)
- **Blocked:** none
- **Unvisited:** Phase 2 → Phase 3 → ship → review-quality → finalize
- **Open discoveries:** none

## Discoveries

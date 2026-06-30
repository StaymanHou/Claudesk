# Backlog — Code-Quality Findings

This file collects findings surfaced by `feature-review-quality` between ship and finalize. Each entry is grouped under a `# <feature-name> — <YYYY-MM-DD>` header. A single pointer per feature is added to `workflow/backlog.md`.

To pick up: read the entries below, then run `/feature-refactor` to address them. To dismiss: edit the originating WIP file's `## Code-Quality Review` section and mark the line `[DISMISSED]`.

# m8-wp5-embed-place — 2026-06-29

*(feature-review-quality on ship commit c34925a; Mode 3 autopilot auto-backlog. 0 CRITICAL / 0 MAJOR / 2 MINOR. Reviewer: "well-built, appropriately-scoped documentation/marketing work that accrues no debt... the one executable artifact is a useful, correctly-isolated, passing dev-only codify guard." Both MINORs are cosmetic.)*

## SURFACE-2026-06-29-QUALITY-M8WP5-TEST-NAME-OVERCLAIMS-ANIMATED
- **Severity:** MINOR
- **Location:** `tooling/demo/readme-assets.nodetest.mjs:65` (+ header comment)
- **Finding:** Test named "every referenced demo GIF is a real **animated** GIF" but the assertion only checks the 6-byte `GIF89a`/`GIF87a` magic — a single-frame GIF89a would pass. Committed assets are genuinely animated, so no live bug; the name over-claims its coverage.
- **Suggested action:** Either rename to "...is a real GIF (GIF8[79]a magic)" OR extend to assert >1 frame (count GCE/image-descriptor markers) so the name matches what it proves.
- **Priority:** low
- **Status:** RESOLVED 2026-06-30 (debt-paydown WP6, Theme F) — took the stronger fix: the test now counts Graphic Control Extension markers (`0x21 0xF9`) and asserts ≥2 frames, so "animated" is proven, not just the magic. Renamed to "…(magic + >1 frame)". 4/4 readme-assets nodetests green.

## SURFACE-2026-06-29-QUALITY-M8WP5-STALE-STATUS-BLOCK-NOW-PROMINENT
- **Severity:** MINOR
- **Location:** `README.md:45-53` (the `> **Status: …**` block)
- **Finding:** The WP5 restructure put the new pitch + demos above an unchanged stale "Status" block (claims "Milestones 1–4 shipped", lists the superseded M5–M9 roadmap; reality is M1–M7 shipped + released v0.2.3 with a resequenced roadmap). It's now the first thing a reader hits under the polished new top. Operator-acknowledged + logged as out-of-WP-scope.
- **Suggested action:** Freshen the Status block (current milestone reality + resequenced roadmap) — natural fit for the next README-freshen task or `/product-finalize` durable-doc resync.
- **Priority:** low
- **Status:** pending

# m8-wp4-pip-demo-asset — 2026-06-29

*(feature-review-quality on ship commit 5625658; Mode 3 autopilot auto-backlog. 0 CRITICAL / 0 MAJOR / 3 MINOR. Reviewer: "well-built dev-only tooling that advances rather than accretes... the only debt is dead focus-ring scaffolding left over from the round-2 design [superseded by the round-3 region switch] + a duplicated comment — both cosmetic five-minute deletions, neither worth a refactor pass." All dev-only `tooling/demo/` polish.)*

## SURFACE-2026-06-29-QUALITY-M8WP4-DUP-CURSOR-COMMENT
- **Severity:** MINOR
- **Location:** `tooling/demo/timeline.pip.js:247-259`
- **Finding:** Two near-identical 6-line cursor-track comment blocks back-to-back (copy-paste artifact from the round-4b cursor edit). Delete one.
- **Priority:** low
- **Status:** RESOLVED 2026-06-30 (debt-paydown WP5) — deleted the first of the two duplicated cursor-track comment blocks (kept the more-accurate "leaves the viewport" wording). pip nodetest green.

## SURFACE-2026-06-29-QUALITY-M8WP4-DEAD-FOCUS-FLAG
- **Severity:** MINOR
- **Location:** `tooling/demo/shell.js:184,191`
- **Finding:** `pip.classList.toggle("focused", !!k.pipFocused)` + the per-row `row.focused ? " focused" : ""` are dead in the PiP timeline — the round-3 region switch replaced the PiP focus-ring beat, so `pipFocused`/`row.focused` are never set anywhere. Either wire a focus-ring frame or drop the flag.
- **Priority:** low
- **Status:** RESOLVED 2026-06-30 (debt-paydown WP5) — DECIDED drop: deleted the dead `pip.classList.toggle("focused", …)` line + its comment and the per-row `row.focused` flag in `shell.js` (paired with the dead-focus-CSS removal below).

## SURFACE-2026-06-29-QUALITY-M8WP4-DEAD-FOCUS-CSS
- **Severity:** MINOR
- **Location:** `tooling/demo/shell.css:201` (`.pip.focused` / `.pip-cell.focused`)
- **Finding:** The focus-ring CSS ships with no producer (same root cause as the dead flag above). Remove alongside it.
- **Priority:** low
- **Status:** RESOLVED 2026-06-30 (debt-paydown WP5) — deleted the orphaned `.pip.focused` rule from `shell.css` (the producer flag was removed above; `.pip-cell.focused` never existed).

# m8-wp3-filmstrip-demo — 2026-06-29

*(feature-review-quality on ship commit a42ba61; Mode 3 autopilot auto-backlog. 0 CRITICAL / 0 MAJOR / 3 MINOR. Reviewer: "well-built, well-scoped dev tooling that does exactly what its plan said and no more... advances the codebase (reusable cursor/keycap tracks WP4's PiP demo can lean on) rather than accruing debt; the only debt is cosmetic comment/data drift." Nothing rises to a refactor trigger for author-controlled, gitignored-output, dev-only marketing tooling.)*

## SURFACE-2026-06-29-QUALITY-M8WP3-STALE-JSDOC-CAST
- **Severity:** MINOR
- **Location:** `tooling/demo/timeline.filmstrip.js:9-17` (four-beat JSDoc header) vs the keyframe data below it.
- **Finding:** The JSDoc beat descriptions still name the OLD cast ("api-gateway running on center stage" / "web-client needs input"), but the data was recast during the verify-human round to `catan-companion` (active 0) + `tax-cruncher` (awaiting→promoted). Doc/data drift inside one file — a future reader (likely WP5) will mis-map beats to tiles.
- **Suggested action:** Update the four-beat JSDoc to name the actual cast (catan-companion / tax-cruncher). One-line-per-beat comment fix.
- **Priority:** low
- **Status:** RESOLVED (already corrected in place; confirmed at debt-paydown WP5, 2026-06-30) — STALE PREMISE: the `timeline.filmstrip.js` four-beat JSDoc already names catan-companion (beat 1) + tax-cruncher (beats 2-4); a grep finds ZERO api-gateway/web-client references. No edit.

## SURFACE-2026-06-29-QUALITY-M8WP3-SMOKE-TIMELINE-ONE-SYSTEM-NAMING
- **Severity:** MINOR
- **Location:** `tooling/demo/timeline.smoke.js` (WP2 smoke fallback cast: api-gateway / web-client / infra-tf / docs-site).
- **Finding:** The WP2 smoke timeline still uses the "four services of one system" naming that timeline.filmstrip.js's comment now explicitly flags as the anti-pattern to avoid (per the README parallelism-across-projects philosophy). Out of scope for WP3 (smoke = verify-self artifact, not a shipped demo), but worth aligning so published-adjacent surfaces don't contradict the stated philosophy.
- **Suggested action:** At WP5 (or a refactor), recast the smoke timeline's 4 names to unrelated projects too. Low cost.
- **Priority:** low
- **Status:** RESOLVED 2026-06-30 (debt-paydown WP5) — recast the 4 smoke-timeline names api-gateway/web-client/infra-tf/docs-site → tax-cruncher/recipe-box/blog-engine/catan-companion (4 unrelated domains) + added a header note citing the parallelism-across-projects philosophy. Stage labels/comments updated to match; demo nodetests green.

## SURFACE-2026-06-29-QUALITY-M8WP3-EVAL-CLASSIC-SCRIPT-IN-TEST
- **Severity:** MINOR
- **Location:** `tooling/demo/timeline.filmstrip.nodetest.mjs:31` (loads the timeline via `eval(readFileSync(...))` against a bare `window` shim).
- **Finding:** The only viable read path for a non-module classic script, and well-commented — but `eval` of file contents is brittle if the timeline ever gains a reference the shim doesn't provide (e.g. `document`). On-record only; not worth changing while the timeline stays data-only.
- **Suggested action:** None now. If the timeline ever references browser globals beyond `window`, extend the shim. Dismiss-candidate.
- **Priority:** low
- **Status:** pending

# m8-wp2-demo-build-harness — 2026-06-29

*(feature-review-quality on ship commit cbe2922; Mode 3 autopilot. 0 CRITICAL / 1 MAJOR / 3 MINOR. The MAJOR — animation-timing fork in extract-dot-css.mjs — was FIXED in-place during review-quality (now sourced from App.css's @media block via pickAnimation(); drift-guard proven to catch a timing change). The 3 MINOR below are low-priority polish, backlogged. Reviewer: "well-built dev tooling that takes its one load-bearing invariant seriously... advances the codebase.")*

## SURFACE-2026-06-29-QUALITY-M8WP2-README-DURATION-DRIFT
- **Severity:** MINOR
- **Location:** `tooling/demo/README.md` (build.mjs example, `--duration 5.4`) vs `tooling/demo/package.json` (`smoke` script, `--duration 3.2`).
- **Finding:** The README's example build command uses `--duration 5.4` (a WP1-probe leftover), but the wired `smoke` script uses `3.2` (the smoke timeline's last keyframe is at t=2.6). A reader copy-pasting the README captures ~2s of dead tail.
- **Suggested action:** Update the README example duration to match (or note it's illustrative). One-line doc fix.
- **Priority:** low
- **Status:** RESOLVED 2026-06-30 (debt-paydown WP5) — README example durations → `3.2` (matching the wired `smoke` script) + a `--timeline timeline.smoke.js` flag + a note that `--duration` is per-timeline (the capture default `5.4` is a probe-era value). No dead-tail for a copy-paster.

## SURFACE-2026-06-29-QUALITY-M8WP2-COMMITTED-GENERATED-CSS-UNDOCUMENTED
- **Severity:** MINOR
- **Location:** `tooling/demo/.gitignore` + `tooling/demo/README.md` ("what's committed" prose).
- **Finding:** `_dots.generated.css` is a generated artifact that is intentionally committed (the `--check` drift-guard needs a committed baseline to diff), yet `.gitignore` blanket-ignores `*.png`/`*.gif`/`*.webp` and the README doesn't mention the committed generated CSS. A future reader may be surprised a `*.generated.*` file is tracked.
- **Suggested action:** One-line note in the README ("the generated dot CSS is committed as the drift-guard baseline").
- **Priority:** low
- **Status:** RESOLVED 2026-06-30 (debt-paydown WP5) — added a "What's committed" note to `tooling/demo/README.md` explaining `_dots.generated.css` is committed (despite `*.generated.*`) because `extract-dot-css.mjs --check` diffs against it as the drift-guard baseline.

## SURFACE-2026-06-29-QUALITY-M8WP2-SHELL-INNERHTML-RAW-MARKUP
- **Severity:** MINOR
- **Location:** `tooling/demo/shell.js` (`dot()`, tile bodies, stage/PiP content injected via `innerHTML` from timeline data).
- **Finding:** Timeline string fields (`tile.body`, `l.text`, etc.) are injected as raw HTML (some legitimately contain markup like `<span class="cursor">`). Not a security issue (dev-only, author-controlled input), but a sharp edge: WP3/WP4 scenario authors must remember every string field is raw HTML.
- **Suggested action:** One-line caution in the TIMELINE shape doc-comment in shell.js so a future author doesn't pass an escape-expecting string.
- **Priority:** low
- **Status:** RESOLVED 2026-06-30 (debt-paydown WP5) — added a CAUTION block to the TIMELINE-shape doc-comment in `shell.js`: every timeline string field is injected as raw HTML via innerHTML; scenario authors must HTML-escape any literal-render string.

# m7-menu-bar-status-item — 2026-06-29

*(feature-review-quality on ship commit 3888dd6; Mode 3 autopilot auto-backlog. 0 CRITICAL / 0 MAJOR / 3 MINOR. Reviewer: "well-built, appropriately-scoped... reuses every existing seam, no new dependency/webview/broadcaster change... advances the codebase without accruing debt." All 3 are comment/duplication nits, none backlog-worthy beyond MINOR.)*

## SURFACE-2026-06-29-QUALITY-M7-TRAY-ID-MATCH-DUP
- **Severity:** MINOR
- **Location:** `src-tauri/src/tray/commands.rs:147-150` (`handle_tray_menu_event`) vs `src-tauri/src/tray/mod.rs` (`is_tray_menu_id`).
- **Finding:** `handle_tray_menu_event` re-matches the two tray ids that `is_tray_menu_id` already validated, with a `_ => return false` arm commented "unreachable given the predicate." The tray id set is thus duplicated across two functions; a 3rd tray actuator needs both edited in lockstep.
- **Suggested action:** Optional — a single `match id` returning bool (no separate predicate) would remove the duplication; or leave as-is (the predicate is unit-tested, the dead arm keeps the match total). Defensible either way.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-06-29-QUALITY-M7-APPLY-UPDATE-COMMENT-OVERSELL
- **Severity:** MINOR
- **Location:** `src-tauri/src/tray/commands.rs:188-199` (`apply_update`).
- **Finding:** The doc comment says it was "pulled out ... callable from tests' shape," but no test calls `apply_update` (the runtime path is AppHandle-bound and explicitly carried to bridge verify-self). The comment slightly overstates the test coverage.
- **Suggested action:** Trim the "callable from tests' shape" clause, or add an AppHandle-free seam test if one is cheap. Trivial.
- **Priority:** low
- **Status:** RESOLVED 2026-06-30 (debt-paydown WP5) — trimmed the "callable from tests' shape" overclaim; the doc now says the runtime path is AppHandle-bound and the pure fold it drives (`aggregate_alarm`) is what's unit-tested, not this wrapper.

## SURFACE-2026-06-29-QUALITY-M7-TRAY-ID-UNUSED-LOOKUP
- **Severity:** MINOR
- **Location:** `src-tauri/src/tray/commands.rs:54` (`TRAY_ID`).
- **Finding:** `TRAY_ID` ("claudesk-tray") is passed to `TrayIconBuilder::with_id`, but nothing looks the tray up by that id (the handle is stashed in `TrayState.icon`). Harmless; a one-line note that it exists for future `get_by_id` reachability would clarify intent.
- **Suggested action:** Add a one-line comment, or leave (good hygiene for future lookup). Cosmetic.
- **Priority:** low
- **Status:** pending


# m6-wp8-milestone-exit-verification — 2026-06-28

*(feature-review-quality on ship commit 3895a32; Mode 3 autopilot auto-backlog. 0 CRITICAL / 0 MAJOR / 2 MINOR. Verification-only WP; the only code change was the editor default-font 13→11 parity edit. Reviewer: "well-built, appropriately-tiny... no debt, no scope creep. Only standing weakness: the editor+terminal shared-default invariant lives in a comment, not code.")*

## SURFACE-2026-06-28-QUALITY-WP8-FONT-PARITY-COMMENT-ONLY
- **Severity:** MINOR
- **Location:** `src/components/workspace/editor/fontZoom.ts:14` (`DEFAULT_FONT_PX`) vs `src/components/workspace/terminalFontZoom.ts` (`DEFAULT_TERMINAL_FONT_PX`).
- **Finding:** The parity claim "matches `DEFAULT_TERMINAL_FONT_PX`" is enforced only by a comment — `DEFAULT_FONT_PX = 11` is an independent literal duplicating the terminal default. If the terminal default is retuned later, the editor silently drifts and the comment becomes a lie. The headline invariant of the change (editor + terminal render at the same size out of the box) has no mechanical guard.
- **Suggested action:** Either import `DEFAULT_TERMINAL_FONT_PX` and derive `DEFAULT_FONT_PX` from it, or add a structural test asserting `DEFAULT_FONT_PX === DEFAULT_TERMINAL_FONT_PX`. Low cost; makes the parity load-bearing rather than aspirational.
- **Priority:** low
- **Status:** RESOLVED 2026-06-30 (debt-paydown WP6, Theme B) — did BOTH: `DEFAULT_FONT_PX` is now DERIVED from `DEFAULT_TERMINAL_FONT_PX` (the editor module imports it), AND a `===` structural test pins the parity. The two can no longer silently drift.

## SURFACE-2026-06-28-QUALITY-WP8-SIBLING-TEST-BARE-LITERALS
- **Severity:** MINOR
- **Location:** `src/components/workspace/editor/__tests__/fontZoom.test.ts:31-33,47-48`.
- **Finding:** Sibling `clampFontSize`/`nextFontSize` tests still use bare `13` literals as sample inputs, while the round-trip test was deliberately re-anchored off literals onto `DEFAULT_FONT_PX`. The `13`s are now arbitrary in-range sample values (no longer the default), reading slightly inconsistently next to the default-relative round-trip test.
- **Suggested action:** Optionally swap the bare `13`s for a neutral mid-range constant or a comment clarifying they're arbitrary probes. Trivial; any in-range integer works for clamp/step-math.
- **Priority:** low
- **Status:** RESOLVED 2026-06-30 (debt-paydown WP6, Theme F) — bare `13`s replaced with a `SAMPLE_PX` const (commented as an arbitrary in-range probe, deliberately not the default), so they no longer read as default-related next to the default-relative round-trip test.

# m6-wp11-multiple-right-panel-terminals — 2026-06-28

*(feature-review-quality on ship commit f9e3292; Mode 3 autopilot auto-backlog. 0 CRITICAL / 0 MAJOR / 3 MINOR. Reviewer: "well-built... the only debt is minor — a small logic duplication between the button handlers and the keydown branches that a shared callback would erase. Nothing here warrants a refactor pass.")*

## SURFACE-2026-06-28-QUALITY-WP11-HANDLER-BRANCH-DUPLICATION
- **Severity:** MINOR
- **Location:** `src/components/workspace/RightPanelHost.tsx` — the ⌘T/⌘W keydown branches vs the `addTerminal` / `closeTerminalById` helpers.
- **Finding:** The ⌘T and scoped-⌘W keydown branches deliberately re-inline the open/close bodies (`setPanel(→terminal)` + `setTerminals(openTerminal)`; `setTerminals(s=>closeTerminal(s, s.activeId))`) rather than calling the button handlers, to keep the `[visible, workspaceId]` listener free of non-stable closure deps. Intent is sound + commented, but it duplicates the open/close logic across ~250 lines — a future change to "what happens on open" (e.g. an added focus call) must be made in both the handler and the inline branch or they silently diverge.
- **Suggested action:** Wrap the bodies in a `useCallback` (or a ref-to-callback) so both call sites share one impl without re-registering the listener. Low cost.
- **Priority:** low
- **Status:** RESOLVED (debt-paydown WP4, 2026-06-30) — `addTerminal`/`closeTerminalById` promoted to `useCallback`; the ⌘T/⌘W keydown branches now call those shared impls and the `[visible, workspaceId]` listener honestly lists them (stable identity → no churn). One open/close impl.

## SURFACE-2026-06-28-QUALITY-WP11-TABLIST-ARIA-CONTROLS
- **Severity:** MINOR
- **Location:** `src/components/workspace/RightPanelHost.tsx` — the `.term-tab-row` (`role=tablist`/`tab` + `aria-selected`) + the `.term-pane-slot` panes.
- **Finding:** The terminal sub-tab row carries `role=tablist`/`role=tab`/`aria-selected` but no `aria-controls` linking each tab to its pane, and the panes have no `role=tabpanel`. Consistent with the existing Editor/Diff/Terminal tab row (NOT a regression), but the fresh row was a low-cost moment to wire the relationship.
- **Suggested action:** Add `aria-controls` on each tab + `role=tabpanel` on each pane slot (and optionally fix the outer panel-tab row to match). Cosmetic/a11y polish.
- **Priority:** low
- **Status:** RESOLVED 2026-06-30 (debt-paydown WP6, Theme E) — wired `aria-controls`/`role=tabpanel`/`aria-labelledby` on the term-tab-row + panes AND the outer panel-tab row (workspace-scoped ids) AND the PaneTabs editor-file strip (folded in for consistency). `?raw` source-grep test pins the panel-tab id pairing.

## SURFACE-2026-06-28-QUALITY-WP11-ENTRY-ID-SESSIONID-ALWAYS-EQUAL
- **Severity:** MINOR
- **Location:** `src/components/workspace/terminalList.ts` — `TerminalEntry { id; sessionId }`.
- **Finding:** `id` and `sessionId` are kept as distinct fields "so a future rename/label can diverge," but in v1 they are always set equal (`{ id: sid, sessionId: sid }` at every construction site). A speculative-generality seam carried into the data model before the feature that needs it; cheap + documented, so borderline — noted only because always-equal fields invite a reader to wonder whether they can drift today (they can't).
- **Suggested action:** Either collapse to one field until a rename/label feature lands, or add a one-line note that they're intentionally always-equal in v1. Or leave as-is (the seam is cheap).
- **Priority:** low
- **Status:** pending

# m6-wp10-right-panel-terminal-zoom — 2026-06-28

*(feature-review-quality on ship commit baaaa4c; Mode 3 autopilot auto-backlog. 0 CRITICAL / 0 MAJOR / 2 MINOR — both cosmetic clarity/traceability nits. Reviewer: "well-built, tightly-scoped... only nits are cosmetic comment-clarity + a bundled-but-tracked eslint tweak; neither warrants a refactor pass.")*

## SURFACE-2026-06-28-QUALITY-WP10-SHARED-KEY-LAG-COMMENT
- **Severity:** MINOR
- **Finding:** `Workspace.tsx:158-182` — the shared-key zoom applies the new size only to the *focused* pane; an already-mounted background terminal re-seeds on next mount/refit. Intended + benign for the single-foreground use case, but the comment frames re-seed as "on its next mount/refit" without noting a *persistently mounted* background terminal will visibly lag until something forces a refit.
- **Fix shape:** one-line caveat in the `applyTerminalZoom` comment ("a persistently-mounted background terminal lags until its next refit"). No behavior change.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-06-28-QUALITY-WP10-ESLINT-IGNORE-BUNDLED
- **Severity:** MINOR
- **Finding:** `eslint.config.js:18-21` — the `tmp/**` + `src-tauri/tmp/**` ignore addition is an in-scope incidental fix bundled into the feature commit. Correctly commented + flagged in the WIP Build notes, so tracked not silent. Noted for traceability only; not a defect.
- **Fix shape:** none required (informational). If a future cleanup wants strict commit-atomicity, scratch-repo lint-ignore config could move to its own commit — not worth a dedicated pass.
- **Priority:** low
- **Status:** pending

# m6-wp7-no-yolo-setting — 2026-06-28

*(feature-review-quality on ship commit 4db7b82; Mode 3 autopilot auto-backlog. 0 CRITICAL / 0 MAJOR / 3 MINOR — all clarity/consistency nits the existing pip-mode pattern already shares. Reviewer: "well-built, low-risk polish... accrues no meaningful debt; no refactor warranted.")*

## SURFACE-2026-06-28-QUALITY-WP7-MENU-WRITE-FAILURE-SILENT
- **Severity:** MINOR
- **Finding:** The two `cc_set_yolo` write paths handle a rejection inconsistently: the picker (`ProjectPicker.tsx` `handleToggleYolo`) does optimistic-flip + revert + error toast; the App.tsx menu-listener path only `console.error`s with no user-visible signal. On a menu-path persist failure the checkmark (driven by the `cc-yolo` broadcast that never fires) silently diverges from reality until the next successful toggle. Pattern-consistent with the existing PiP-mode menu path (also silent) — not a regression vs the established pattern.
- **Fix shape:** either surface the menu-path failure (harder — App.tsx has no toast surface like the picker) OR add a one-line comment noting menu-path write failures are deliberately silent (mirrors pip_set_mode). Lean: the comment, unless a toast surface is added app-wide.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-06-28-QUALITY-WP7-DOUBLE-CC-YOLO-SUBSCRIBE
- **Severity:** MINOR
- **Finding:** Two independent `cc-yolo` listeners are mounted — App.tsx's `ccYoloRef` effect + the picker's `setCcYolo` effect — each with its own `cc_get_yolo` seed call. Harmless (the picker only mounts on the picker screen; the ref-tracker lives at App root; the ref-vs-state split is deliberate) but reads as accidental duplication absent a note.
- **Fix shape:** a one-line comment on each effect noting the deliberate double-subscribe (ref for the menu-listener's invert-current; state for the picker's visible checkbox).
- **Priority:** low
- **Status:** pending

## SURFACE-2026-06-28-QUALITY-WP7-THIRD-RESOLVE-DATA-DIR-COPY
- **Severity:** MINOR
- **Finding:** `cc_session/commands.rs` adds a third module-local copy of `resolve_data_dir` (originals in `config_store::commands` + `pip::commands`), each with the same "kept module-local — those are private" comment. Trivial drift risk.
- **Fix shape:** if a fourth consumer ever appears, promote to a shared `pub(crate)` helper (e.g. in `config_store`) and retire the three copies. No action needed at three.
- **Priority:** low
- **Status:** pending

# wp6-filetree-shows-ignored-files — 2026-06-28

*(feature-review-quality on ship commit 61db3d4; Mode 3 autopilot auto-backlog. 0 CRITICAL / 1 MAJOR / 3 MINOR. The MAJOR is a load-bearing-but-trivial cleanup — remove the now-dead `ignore` crate; the MINORs are doc/cosmetic. Reviewer: "well-built; the only follow-up is removing the now-unused dependency.")*

## SURFACE-2026-06-28-QUALITY-WP6-DEAD-IGNORE-DEP
- **Severity:** MAJOR
- **Finding:** The `ignore = "0.4"` dependency (`src-tauri/Cargo.toml:61`) is now dead — `walk_project` dropped `ignore::WalkBuilder` and `fs_watch` dropped `GitignoreBuilder`; `grep -rn "ignore::"` over `src-tauri/src/` finds ZERO non-comment references. The Cargo.toml comments around the dep (lines ~55-76) still describe the old gitignore-honoring model (".gitignore contract with the finder + tree"), which is now misleading.
- **Fix shape:** remove the `ignore = "0.4"` line + rewrite/remove its stale surrounding comments in Cargo.toml; `cargo build` + `cargo test --lib` to confirm nothing else pulls it directly (it remains a transitive dep of other crates, which is fine — only the direct dependency + comments are stale). Small + mechanical, but requires a rebuild → re-verify, which is why Mode-3 backlogs it rather than auto-fixing in the review path.
- **Priority:** medium
- **Status:** RESOLVED 2026-06-30 (debt-paydown WP1) — `ignore = "0.4"` removed from Cargo.toml + Cargo.lock; the stale `regex`/`notify-debouncer-full` comments claiming a shared `ignore`-walker `.gitignore` contract were rewritten to describe the real manual-DFS heavy-dir walk (`fs_index`). `cargo build` + 302 lib tests + clippy green.

## SURFACE-2026-06-28-QUALITY-WP6-SYMLINK-SKIP-UNDOCUMENTED
- **Severity:** MINOR
- **Finding:** `walk_project` (`src-tauri/src/fs_index/mod.rs` ~202) skips symlinks (the un-traversed `file_type` is neither `is_dir()` nor `is_file()`) — correct + cycle-safe, but this visibility exclusion is documented only as an inline aside, not in the function/module doc that enumerates the contract (where `.git` + heavy-dir exclusions ARE spelled out). A symlinked source dir an operator edits would be silently invisible to tree/finder/search.
- **Fix shape:** add a one-line bullet to the `walk_project` / module "Exclusion model" doc naming the symlink skip alongside `.git` + heavy dirs.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-06-28-QUALITY-WP6-DETECTED-BIG-SYSCALL-COST
- **Severity:** MINOR
- **Finding:** `dir_is_heavy` (`src-tauri/src/fs_index/mod.rs` ~147) does a `read_dir` on every non-name-matched directory during the tree walk (the detected-big check), doubling directory-open syscalls vs. the walk's own. Acceptable for the single-user target + short-circuited at threshold+1, but the per-dir cost isn't called out next to the threshold constant.
- **Fix shape:** add a one-line cost note next to `HEAVY_DIR_CHILD_THRESHOLD` documenting the per-dir `read_dir` (short-circuited).
- **Priority:** low
- **Status:** pending

## SURFACE-2026-06-28-QUALITY-WP6-DOC-WRAP-NIT
- **Severity:** MINOR
- **Finding:** A reflowed doc-comment line in `project_search::search_core` (`src-tauri/src/project_search/mod.rs` ~172) runs slightly long past the file's otherwise-consistent wrap width. Cosmetic.
- **Fix shape:** re-wrap the line.
- **Priority:** low
- **Status:** pending

# m6-wp5-editor-wrap-toggle — 2026-06-27

*(feature-review-quality on ship commit 16ce60a; Mode 3 autopilot auto-backlog. 0 CRITICAL / 0 MAJOR / 3 MINOR. All low-risk readability/factoring/copy notes — reviewer: "no refactor warranted; backlog-or-dismiss material.")*

## SURFACE-2026-06-27-QUALITY-WP5-DUAL-RECONFIGURE-PATH
- **Severity:** MINOR
- **Finding:** `EditorPanel.tsx` `onToggleWrap` (~110-118) duplicates the live compartment-reconfigure dispatch that `coreKeymap.applyWrap` already performs, AND the extensions memo (deps include `lineWrap`) rebuilds on the resulting state change — so a button click triggers two reconfigure paths (imperative dispatch + memo rebuild). Idempotent/harmless, but two call sites for one effect is a latent drift seam.
- **Fix shape:** route the button through the same `applyWrap` keymap entry, OR rely solely on the memo rebuild (pure-state toggle) so there's one reconfigure path. Leave-as-is is also defensible (the imperative dispatch avoids a render-cycle delay).
- **Priority:** low
- **Status:** pending

## SURFACE-2026-06-27-QUALITY-WP5-CLOSED-OVER-FLAG-INVARIANT
- **Severity:** MINOR
- **Finding:** The `Mod-\` `run` (editorExtensions.ts ~160-169) closes over `lineWrap` from the latest `buildEditorExtensions` call; correctness depends on the memo rebuilding (and @uiw reconfiguring the keymap) on every `lineWrap` change. The deps array is correct, but the load-bearing invariant is only lightly documented inline.
- **Fix shape:** add a one-line note that this relies on the memo's `lineWrap` dep, to harden against a future deps-array edit. (Identical mechanism to the fontSize chord — same latent fragility, same cheap mitigation.)
- **Priority:** low
- **Status:** pending

## SURFACE-2026-06-27-QUALITY-WP5-TITLE-STATE-VS-ACTION
- **Severity:** MINOR
- **Finding:** The wrap toggle's `title` reads "Soft-wrap on (⌘\)" when wrap is currently ON — a state label, while `aria-pressed` already conveys state and the click toggles. Slight affordance ambiguity (is the tooltip the current state or what the click does?). Cosmetic copy nit.
- **Fix shape:** either accept as-is (state-label tooltips are common) or reword to describe the action ("Toggle soft-wrap (⌘\)"). Trivial.
- **Priority:** low
- **Status:** pending

# wp4-terminal-font-zoom — 2026-06-27

*(feature-review-quality on ship commit 67c3f54; Mode 3 autopilot auto-backlog. 0 CRITICAL / 0 MAJOR / 2 MINOR. Both reviewer-flagged as "not a defect / not a finding to act on" — forward-looking readability/factoring notes only.)*

## SURFACE-2026-06-27-QUALITY-WP4-UNUSED-STATE-VALUE-BINDING
- **Severity:** MINOR
- **Finding:** `Workspace.tsx` `const [, setTerminalFontSize] = useState<number>(loadTerminalFontSize)` keeps a state cell whose VALUE binding is intentionally unused — only the setter is read, inside `applyTerminalZoom`'s functional updater (the batch-safe prior-size source). The empty destructure + the "value never drives a render" shape can puzzle a future maintainer.
- **Fix shape:** either leave as-is (the functional-updater read is genuinely the cleanest batch-safe pattern; the in-code comment already justifies it) OR swap to a `useRef` updated inside the same updater body for the same prior-value semantics without an unused state slot. Reviewer called it a defensible tradeoff, not a defect.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-06-27-QUALITY-WP4-THIRD-ZOOM-MODULE-COPY
- **Severity:** MINOR
- **Finding:** `terminalFontZoom.ts` is a near-verbatim duplicate of `editor/fontZoom.ts` (clamp/next/load/save/safeStorage differ only in constant values + the localStorage key string). This is the third per-surface zoom module (editor, now terminal) following the established copy convention — consistent with the repo's per-pref-helper pattern, so not a finding to act on now.
- **Fix shape:** when a FOURTH zoom surface appears (e.g. WP10 right-panel terminal zoom — though that likely reuses `terminalFontZoom.ts` directly), make a deliberate "extract a shared `makeFontZoom(config)` factory vs. keep copying" decision rather than a reflexive next copy. No action until then.
- **Priority:** low
- **Status:** pending

# m5-wp5-pip-toggle-lifecycle-autosummon — 2026-06-27

*(feature-review-quality on ship commit f6e3929; Mode 3 autopilot auto-backlog. 0 CRITICAL / 2 MAJOR / 2 MINOR.)*

## SURFACE-2026-06-27-QUALITY-WP5-VIEWMENU-MODE-CHECKMARK-STALE
- **Severity:** MAJOR
- **Finding:** The three PiP-mode `CheckMenuItem`s (`app_menu/mod.rs:198-216`, ids `view.pip.mode.{off,on,auto}`) are built ONCE at `build_menu` (called once at setup, `lib.rs:105`) with checkmarks seeded from the persisted mode, but nothing updates them afterward — no listener rebuilds the menu or calls `set_checked` on the `pip-mode` broadcast. After ANY mode change (icon button OR a menu item), the View-menu checkmarks go stale until relaunch. And three independent CheckMenuItems are NOT a radio group: a native click toggles only the clicked item's own check → the menu can display contradictory state (e.g. Off still checked after picking Auto). The functional path (click → `pip_set_mode`) works + was operator-verified; only the menu's DISPLAYED checkmark is unreliable.
- **Fix shape:** subscribe to the `pip-mode` event (backend or a small frontend bridge) and update the three items' checked-state on change — either rebuild the View submenu or hold `CheckMenuItem` handles in managed state + `set_checked(mode==X)` for each on each broadcast (+ on launch-restore). Make them mutually exclusive (only the active mode checked). Pairs with fixing the misdescribing comment below.
- **Priority:** medium — worth a `/feature-refactor` pass before M6 layers more onto `build_menu` (M6's menu-bar work touches the same seam).
- **Status:** RESOLVED 2026-06-27 (`/feature-refactor`) — `build_menu` now clones the three `CheckMenuItem` handles into a managed `PipModeMenuItems<R>` struct; a `pip-mode` listener wired in `lib.rs` setup parses the broadcast payload and calls the new `apply_pip_mode_to_menu`, which `set_checked(mode==X)`s all three exclusively (only the active mode checked) on every broadcast. Launch-seed already correct (build-time `.checked` reads the same persisted mode), so no extra launch-restore call needed. Both surfaces (icon button + menu click) route through `pip_set_mode` → `pip-mode` emit → this listener. clippy `-D warnings` clean, 266/266 cargo tests pass (pure refactor, no behavior change). Live checkmark-updates carried to operator verify-human (AppKit observable, MCP bridge disconnected this session).

## SURFACE-2026-06-27-QUALITY-WP5-MENU-COMMENT-MISDESCRIBES-REBUILD
- **Severity:** MAJOR
- **Finding:** `app_menu/mod.rs:199` comment asserts "the menu is rebuilt on the `pip-mode` broadcast so the checkmark tracks the backend" — that rebuild does NOT exist. A WHAT-comment describing unimplemented behavior; it hides + compounds the staleness bug above (a future maintainer trusts it, doesn't look for the missing listener).
- **Fix shape:** fix together with the checkmark-refresh above — once the refresh is real, the comment becomes accurate; until then, correct the comment to state the items are seeded-once-not-refreshed.
- **Priority:** medium (bundle with the finding above).
- **Status:** RESOLVED 2026-06-27 (`/feature-refactor`, same pass as the finding above) — the misdescribing "the menu is rebuilt on the `pip-mode` broadcast" comment (`app_menu/mod.rs:198-199`) is gone; the refresh is now real (via `apply_pip_mode_to_menu`, NOT a rebuild — there is no rebuild path), and the comment + the new `PipModeMenuItems` doc accurately describe the seeded-once-then-re-checked mechanism.

## SURFACE-2026-06-27-QUALITY-WP5-STALE-PIP-TOGGLE-DOC-REFS
- **Severity:** MINOR
- **Finding:** `pip/commands.rs:206` `pip_set_visible` rustdoc uses intra-doc link `[pip_toggle]` (the command was removed in the rework → broken rustdoc link); the module header `commands.rs:3` still narrates "`pip_toggle` builds (once) and then shows/hides…". Stale post-rework; the live entry point is `pip_set_mode`/`pip_set_visible`.
- **Fix shape:** update the two doc references to `pip_set_mode`/`pip_set_visible`; drop the `[pip_toggle]` intra-doc link.
- **Priority:** low.
- **Status:** RESOLVED 2026-06-30 (debt-paydown WP5) — `pip/commands.rs` module header + the `pip_set_mode`/`pip_set_visible` doc-comments repointed `pip_toggle`→`pip_set_mode`/`pip_set_visible`; the broken `[pip_toggle]` intra-doc link is gone (`rustdoc -D broken_intra_doc_links` clean). The `lib.rs:333` "replaces the old pip_toggle" note left intact (accurate historical context, not a broken link).

## SURFACE-2026-06-27-QUALITY-WP5-PIPMODE-STATE-DUP-PER-WORKSPACE
- **Severity:** MINOR
- **Finding:** `RightPanelHost.tsx:136-159` — the `pipMode` state + `pip_get_mode` fetch + `pip-mode` listener are duplicated per RightPanelHost instance (one per mounted workspace), so at N workspaces there are N redundant IPC fetches + N subscriptions for one app-global value. The inline comment acknowledges it's "fine per-RightPanelHost," but it's avoidable at the N>1 the milestone targets.
- **Fix shape:** lift `pipMode` to App-level state (fetched + subscribed once), passed down as a prop — mirroring how `tiles` is derived once in App. Low effort.
- **Priority:** low.
- **Status:** pending — DEFERRED at debt-paydown WP4 (operator, 2026-06-30), anchored to **M9**. The per-`RightPanelHost` `pip-mode` subscription is the project's INTENDED "all surfaces subscribe to the same backend broadcast" pattern (PiP mode is already an app-global View-menu radio, backend = single source of truth via `pip_set_mode`/`pip_get_mode` + the `pip-mode` event), not a missing-app-state bug — the only real cost is N-1 redundant `pip_get_mode` mount fetches. M9's time-tracking toggle follows the same backend-command + `*-mode`-broadcast + per-consumer-subscribe shape, so there is no shared app-settings store to build once-vs-twice. Fold the dedup into M9's settings work IF an app-settings hook materializes there; else it stays the documented pattern.

# qol-wp8-diff-viewer-polish — 2026-06-25

3 MINOR findings (0 CRITICAL / 0 MAJOR) from `feature-review-quality` on ship commit `7385a61`. Reviewer verdict: well-built, tightly-scoped, right mechanism (measured CSS var + ResizeObserver), no debt accrued; no finding warrants a refactor pass. Priority: low (all). Auto-backlogged per drive_mode=autopilot.

## SURFACE-2026-06-25-QUALITY-WP8-REDUNDANT-COLLAPSE-DEP
- **Finding:** The sticky-var ResizeObserver effect lists `commitsCollapsed` in its dep array, but the observer already tracks the `.diff-commits` parent's height directly (only `.diff-commits-body` mounts/unmounts inside the observed node), so the re-run on collapse is belt-and-suspenders, not load-bearing. The inline comment slightly overstates that collapse needs the re-attach. The genuinely-needed deps are `view.kind` (banner appears/disappears) + `list.kind`/`commitDiff` (files area mounts).
- **Where:** `src/components/workspace/diff/DiffPanel.tsx` sticky-var effect (~290-292).
- **Fix shape:** either drop `commitsCollapsed` from the deps (the observer covers it) OR keep it and reword the comment to mark it belt-and-suspenders so a future trimmer doesn't mistake it for load-bearing. Lowest-risk = comment reword.
- **Priority:** low

## SURFACE-2026-06-25-QUALITY-WP8-COMMENT-COPYEDIT-SLIP
- **Finding:** The `.diff-commits` comment reads "at the top:0 of .diff-scroll" — the inserted "the" is a copy-edit slip ("at top:0 of" or "at the top of" was intended).
- **Where:** `src/App.css` `.diff-commits` comment (~1726).
- **Fix shape:** one-word comment fix.
- **Priority:** low

## SURFACE-2026-06-25-QUALITY-WP8-FALLBACK-COUPLING
- **Finding:** The CSS first-paint fallback `--diff-commits-h: 2rem` is coupled to today's `.diff-commits-header` padding/font (≈2rem total); if those change later, the pre-observer first-paint offset drifts until the ResizeObserver fires. Harmless (observer corrects within a frame) but undocumented coupling.
- **Where:** `src/App.css` `.diff-scroll` `--diff-commits-h` default (~1714) ↔ `.diff-commits-header`.
- **Fix shape:** add a one-line comment cross-referencing `.diff-commits-header`'s height so the `2rem` guess's provenance is pinned.
- **Priority:** low

# qol-wp7-filetree-git-bubble-up — 2026-06-25

3 MINOR findings (0 CRITICAL / 0 MAJOR) from `feature-review-quality` on ship commit `4d384b1`. Reviewer verdict: well-built, right architecture, no debt accrued; no finding warrants a refactor pass. Priority: low (all). Auto-backlogged per drive_mode=autopilot.

## SURFACE-2026-06-25-QUALITY-WP7-DEAD-DIR-STATUS-CSS
- **Finding:** `.file-tree-dir-status { margin-left: auto }` re-declares a property the element already inherits from its `file-tree-status` class (which already sets `margin-left:auto`). The actual right-push comes from `.file-tree-name`'s `flex:1`. The rule is a no-op, and its comment ("this is the element that absorbs the free space") misattributes the layout mechanism.
- **Where:** `src/App.css` `.file-tree-dir-status` (~1577) + its comment block.
- **Fix shape:** delete the redundant rule (or, if a dir-specific tweak is later wanted, keep the selector but with a real declaration); correct the comment to name `.file-tree-name flex:1` as the right-push mechanism. Highest-value of the three — it removes a misleading explanation.
- **Priority:** low
- **Status:** RESOLVED 2026-06-30 (debt-paydown WP1) — redundant `.file-tree-dir-status { margin-left: auto }` deleted (the glyph inherits `margin-left:auto` from `.file-tree-status` and is right-pushed by `.file-tree-name { flex:1 }`); comment replaced to name the real mechanism.

## SURFACE-2026-06-25-QUALITY-WP7-FORIN-NO-HASOWNPROPERTY
- **Finding:** `dominantStatusByDir` iterates `gitStatus` with `for (const path in gitStatus)` without a `hasOwnProperty` guard. Safe for the serde-serialized backend record, but an unexpected prototype key would inject a bogus dir.
- **Where:** `src/components/workspace/filetree/gitRollup.ts` `dominantStatusByDir` (~78).
- **Fix shape:** switch to `for (const path of Object.keys(gitStatus))` — removes the latent footgun at zero cost.
- **Priority:** low

## SURFACE-2026-06-25-QUALITY-WP7-CONSIDER-ARRAY-ALLOC
- **Finding:** the `consider` closure allocates a 1–2-element array per ancestor purely to reuse `dominantStatus`. Cosmetic given the input is changed-paths-only (O(changed × depth)).
- **Where:** `src/components/workspace/filetree/gitRollup.ts` `consider` closure (~79).
- **Fix shape:** a direct precedence-index compare would avoid the per-step array, but the current form favors single-source-of-precedence clarity — defensible as-is; dismiss-candidate.
- **Priority:** low

# qol-wp5b-editor-folder-depth — 2026-06-25

3 MINOR findings (0 CRITICAL / 0 MAJOR) from `feature-review-quality` on ship commit `374f7cb`. Reviewer verdict: well-built, security-conscious, ship-quality; no finding warrants a refactor pass. Priority: low (all). Auto-backlogged per drive_mode=autopilot.

## SURFACE-2026-06-25-QUALITY-WP5B-TRASH-FAILURE-NOT-SURFACED
- **Finding:** a failed `trash_path` in `onDeleteFolderConfirm` is swallowed to `console.error` only — the tree isn't refreshed and no user-visible surface reports it, so the folder silently appears to still exist. Consistent with the single-file delete's existing behavior (and the WIP flags a future toast), but the folder-delete blast radius makes the silent-failure window more consequential.
- **Where:** `src/components/workspace/RightPanelHost.tsx` `onDeleteFolderConfirm` (~410).
- **Fix shape:** surface the trash failure inline/toast (reuse the new-file inline-error pattern). Pairs with the WP5 `SURFACE-2026-06-25-QUALITY-WP5-DELETE-FAILURE-NOT-SURFACED` toast item — one fix covers both delete paths.
- **Priority:** low

## SURFACE-2026-06-25-QUALITY-WP5B-GUARD-PARITY-COMMENT
- **Finding:** `validateRelSegments` rejects a leading `~` on the whole string, but the backend `resolve_within_lexical` has no `~` notion (treats `~` as a normal segment) — the two guards disagree on `~` (frontend stricter → safe, backend still contains under root). The "mirrors the backend lexical guard" comment slightly overstates parity.
- **Where:** `src/components/workspace/filetree/newFilePath.ts` `validateRelSegments` (~70).
- **Fix shape:** reword the comment to "stricter than / defense-in-depth over the backend guard" (or drop the `~`-whole-string check, since the backend contains it anyway). Cosmetic comment-accuracy.
- **Priority:** low

## SURFACE-2026-06-25-QUALITY-WP5B-DESCENDANT-COUNT-STALE
- **Finding:** the folder-delete confirm's descendant `count` (`countDescendants` over the loaded `fs_tree` entries) reflects the tree as last refreshed; if the folder grew on disk since the last `fsTreeRefreshKey` bump, the displayed number understates the blast radius. The trash itself is correct (backend trashes the live subtree) — only the advisory number can lag.
- **Where:** `src/components/workspace/editor/confirmDialog.ts` `deleteFolderSpec` consumer in `RightPanelHost.tsx` (count source).
- **Fix shape:** accept as cosmetic (the WP0 watcher keeps the tree fresh in practice), or re-walk on confirm-open for an exact count. Lowest value of the three.
- **Priority:** low

# qol-wp5-editor-file-management — 2026-06-25

3 MINOR findings (0 CRITICAL / 0 MAJOR) from `feature-review-quality` on ship commit `3abfe59`. Reviewer verdict: well-built, low-debt; no finding warrants a refactor pass. Priority: low (all). Auto-backlogged per drive_mode=autopilot.

## SURFACE-2026-06-25-QUALITY-WP5-CREATE-COLLISION-GITIGNORE
- **Finding:** `createFile`'s collision check (`collides` over the `fs_tree` path set) can't see `.gitignore`d files — `fs_tree` excludes them via `ignore::WalkBuilder`. A new root-level name colliding with a gitignored file (e.g. `.env`) passes the guard and `write_file` overwrites it silently. `newFilePath.ts`'s `collides` doc ("turns create into create-new, don't clobber") is slightly overstated.
- **Where:** `src/components/workspace/RightPanelHost.tsx` `createFile` (~285-300) + the `collides` doc in `src/components/workspace/filetree/newFilePath.ts`.
- **Fix shape:** a pre-write `stat_file` existence check (truthy → reject; covers gitignored + untracked alike), OR a one-line doc caveat that the guard only covers tree-visible files. Low likelihood (v1 creates at root only); data is never outside the workspace.
- **Priority:** low

## SURFACE-2026-06-25-QUALITY-WP5-DELETE-FAILURE-NOT-SURFACED
- **Finding:** `onDeleteConfirm` surfaces a failed `delete_file` only via `console.error` (the inline comment itself flags "a future toast could show it"). Every other failure path in the feature surfaces visibly (create errors render inline; fs_tree errors render a row). A delete that fails (e.g. permission) leaves the tree unchanged with no user-visible signal — the operator can't distinguish a no-op cancel from a silent failure.
- **Where:** `src/components/workspace/RightPanelHost.tsx` `onDeleteConfirm` (~320-327).
- **Fix shape:** surface the delete error inline (a transient row/toast near the tree, or reuse the inline-error pattern the new-file input already has). Consistent with the feature's surfaced-not-swallowed discipline.
- **Priority:** low

## SURFACE-2026-06-25-QUALITY-WP5-NEWFILE-BLUR-DISCARDS
- **Finding:** the new-file input's `onBlur={cancelNewFile}` silently discards a partially-typed name on any focus-steal (clicking elsewhere in the rail). Enter-submit is safe (keydown precedes blur), but blur-cancels-silently is an undocumented UX choice.
- **Where:** `src/components/workspace/filetree/FileTree.tsx` the new-file input (~165).
- **Fix shape:** either a one-line comment marking blur-cancel as deliberate, or keep the input open on blur (cancel only on Esc). Cosmetic.
- **Priority:** low

# qol-wp4-terminal-respawn-on-switch — 2026-06-25

3 MINOR findings (0 CRITICAL, 0 MAJOR) from `feature-review-quality` on ship commit `10c604f`. Reviewer rated the fix well-built and appropriately-scoped — the `active`-in-deps conflation was split cleanly into a pure `shouldSpawnOnActive` predicate + a tiny `[active, bridge.phase]` trigger effect + the single-source-of-truth `spawnTriggerDeps` contract; "change advances rather than accrues debt" for a file with a documented spawn-lifecycle bug history. All three findings are polish; none warrants a refactor pass. Auto-backlogged per drive_mode=autopilot.

## SURFACE-2026-06-25-QUALITY-WP4-TRIGGER-ONCE-UNDERFLAGGED
- **Files:** `src/components/workspace/XtermPane.tsx` (the deferred-spawn trigger effect, ~lines 418-425; cross-refs the spawn effect's `hasSpawnedRef.current = true` at ~line 365)
- **Priority:** low
- **Status:** pending
- **Type:** tech-debt (comment accuracy / future-edit safety)
- **Finding:** The trigger effect reads non-reactive `hasSpawnedRef.current` while keyed on `[active, bridge.phase]`. A narrow async window exists after the nonce bump but before the latch is set where an `active` toggle could fire a second nonce bump. It is SAFE — the spawn effect's per-run `cancelled` closure self-kills the orphan so exactly one session survives — but the trigger effect's comment ("bumps `spawnNonce` exactly once") slightly overstates the guarantee; once-ness is co-enforced downstream by `cancelled`.
- **Pickup shape:** add a one-line comment at the trigger effect pointing at the `cancelled` backstop (so a future reader doesn't "tighten" the de-dup here and break the StrictMode contract). Comment-only; no behavior change.

## SURFACE-2026-06-25-QUALITY-WP4-REPRO-TEST-DUP-TRUTH-TABLE
- **Files:** `src/cc/__tests__/respawnOnReactivate.repro.test.ts` (the first `describe` block restating the predicate truth table, ~lines 32-53)
- **Priority:** low
- **Status:** pending
- **Type:** tech-debt (test redundancy)
- **Finding:** The repro file restates the four `shouldSpawnOnActive` truth-table cases already covered exhaustively in `respawnGuard.test.ts`. The repro file's unique value is the red-import anchor + the dep-tuple-inertness assertion; the duplicated predicate cases add maintenance surface without new signal.
- **Pickup shape:** trim the duplicated predicate cases from the repro file, keeping the red-import + dep-tuple-inertness assertions (the bug-specific signal). Small test edit.
- **Status:** RESOLVED 2026-06-30 (debt-paydown WP6, Theme F) — removed the second `describe` block (the 4-case truth table) from the repro; kept its red-import + dep-tuple-inertness assertion + the one predicate case that names the bug (switch-back-after-session), with a pointer to the exhaustive `respawnGuard.test.ts`.

## SURFACE-2026-06-25-QUALITY-WP4-UNANCHORED-LATCH-ASSERTION
- **Files:** `src/components/workspace/__tests__/spawnOnceOnReactivate.test.ts` (the "clears the latch on relaunch" assertion, ~line 47)
- **Priority:** low
- **Status:** pending
- **Type:** tech-debt (test robustness)
- **Finding:** `/hasSpawnedRef\.current\s*=\s*false/` is a bare substring match not anchored to the relaunch path — it would pass on any `.current = false` assignment in the file. Low-stakes (only one such assignment exists today), but unanchored.
- **Pickup shape:** anchor the assertion near `handleRelaunch` (or match the relaunch comment context) so an unrelated edit can't satisfy it. One small test edit.
- **Status:** RESOLVED 2026-06-30 (debt-paydown WP6, Theme F) — the assertion now matches `hasSpawnedRef.current = false` followed (within ~120 chars) by `dispatch({ type: "relaunch" })`, so an unrelated ref reset can't satisfy it.

# qol-wp3-switch-workspace-autofocus-cc — 2026-06-25

2 MINOR findings (0 CRITICAL, 0 MAJOR) from `feature-review-quality` on ship commit `78c76d6`. Reviewer rated the feature well-built and tightly-scoped — minimal correct seam (imperative `focus()`-only handle → single `visible`-edge effect consolidating all four promote triggers), focus-only invariant designed-in AND test-pinned, no debt. Both findings are polish; neither warrants a refactor pass. Auto-backlogged per drive_mode=autopilot.

## SURFACE-2026-06-25-QUALITY-WP3-OVERBROAD-NEWLINE-GUARD
- **Files:** `src/components/workspace/__tests__/autofocusCcOnPromote.test.ts` (the `not.toMatch(/\r\n|\r|\n/)` assertion, ~line 63)
- **Priority:** low
- **Status:** pending
- **Type:** tech-debt (test robustness)
- **Finding:** The no-PTY-byte guard pins the absence of any `\r`/`\n` escape anywhere in Workspace.tsx, not specifically in the focus path. Passes today (zero matches), but it's over-broad — a future unrelated `\n` literal (a tooltip string, a multiline template) would fail this test with a misleading "WP4 spurious-prompt regression" message. The companion `cc_input` assertion is appropriately targeted.
- **Pickup shape:** scope the assertion to the focus effect or to `invoke(`/PTY-write identifiers instead of the whole file. One small test edit. Dismiss if the broad guard is judged acceptable.

## SURFACE-2026-06-25-QUALITY-WP3-TRIPLICATED-EFFECT-RATIONALE
- **Files:** `src/components/workspace/Workspace.tsx` (the WP3 `visible`-edge focus effect comment block, ~lines 69-79)
- **Priority:** low
- **Status:** RESOLVED 2026-06-30 (debt-paydown WP5) — trimmed the 11-line comment to the non-obvious WKWebview-rAF rationale (parked-element + always-active gap) + focus-only-no-PTY invariant; dropped the operator-decision/bug-class sentences (now a "see commit + WIP" pointer).
- **Type:** tech-debt (comment clarity)
- **Finding:** The 11-line comment block over a 4-line effect body restates the commit message + WIP near-verbatim (operator-decision + bug-class sentences). Triplicated rationale (comment + commit + WIP) is a future-drift surface.
- **Pickup shape:** trim to just the non-obvious WKWebview-rAF rationale (the parked-element + always-active=true gap); drop the operator-decision/bug-class sentences already captured in commit + WIP. One small comment edit. Dismiss if the redundancy is judged helpful.

# qol-wp2-status-busy-vs-awaiting — 2026-06-25

1 MINOR finding (0 CRITICAL, 0 MAJOR) from `feature-review-quality` on ship commit `7cfc464`. Reviewer rated the feature well-built and tightly-scoped — root cause diagnosed empirically (live hook-stream capture), fix in exactly one place, docs resynced same-commit. The other MINOR (a duplicate dangling `verify-codify` checkbox in the WIP) was resolved in-place before archive. This remaining finding is low-risk comment cleanup. Auto-backlogged per drive_mode=autopilot.

## SURFACE-2026-06-25-QUALITY-WP2-TRIPLE-RATIONALE-COMMENT
- **Files:** `src-tauri/src/status_broadcaster/mod.rs` (`INPUT_NEEDED_NOTIFICATION_TYPES` const doc + `notification_awaits_input` + `is_known_informational_notification`)
- **Priority:** low
- **Status:** RESOLVED 2026-06-30 (debt-paydown WP5) — consolidated the unknown-`notification_type`→AwaitingInput rationale to the `INPUT_NEEDED_NOTIFICATION_TYPES` const doc as the canonical anchor; trimmed the `notification_awaits_input` + `is_known_informational_notification` fn/match-arm copies to a back-reference. `cargo test --lib` 307 + clippy clean.
- **Type:** tech-debt (comment clarity)
- **Finding:** The unknown-`notification_type`-falls-back-to-AwaitingInput rationale is restated in three places (const doc, fn doc, inline match-arm comments) — ~25 lines of doc for ~15 of logic. The WHY is genuinely non-obvious and worth documenting once, but the triple-restatement means a future editor changing the allow-list must keep three prose copies in sync.
- **Pickup shape:** consolidate the rationale to one anchor (e.g. the const doc) and trim the fn/match-arm copies to a back-reference. One small comment edit. Dismiss if the redundancy is judged helpful.

# qol-wp1-close-workspace — 2026-06-25

3 MINOR findings (0 CRITICAL, 0 MAJOR) from `feature-review-quality` on ship commit `c01a3f9`. Reviewer rated the feature well-built and idiomatic — the standout being the per-pane `cc_kill`-on-unmount that reaps both PTY panes generically and closes a latent WP7 lifecycle gap. All findings are low-risk: two over-narrated comments + one accepted test-boundary gap. Auto-backlogged per drive_mode=autopilot.

## SURFACE-2026-06-25-QUALITY-WP1-OVERNARRATED-X-COMMENT
- **Files:** `src/components/workspace/Filmstrip.tsx` (expanded × ~252-280 + collapsed-pill × ~308-340)
- **Priority:** low
- **Status:** pending
- **Type:** tech-debt (comment clarity)
- **Finding:** The × button comment narrates a rejected "invalid nested `<button>`" alternative before stating the actual `<span role="button">` choice — a future reader scanning it may think there's a nested-button bug. Trim to state only what shipped (and why span-over-button: to avoid invalid nesting inside the tile/pill button).
- **Pickup shape:** one-line comment edit at both × sites. Dismiss if the historical context is judged useful.

## SURFACE-2026-06-25-QUALITY-WP1-DOCSREF-FORWARD-REF-COMMENT
- **Files:** `src/components/workspace/editor/EditorSplit.tsx:137-141`
- **Priority:** low
- **Status:** pending
- **Type:** tech-debt (comment drift risk)
- **Finding:** The "(A live `docsRef` mirror of `docs` already exists below — reused by…)" comment forward-references the `docsRef` declared ~50 lines down (line ~188), restating a relationship the `docsRef.current` read at the handle already makes obvious. Drifts if the file is reordered.
- **Pickup shape:** delete the forward-referencing comment (or move it adjacent to the actual `docsRef` declaration). Trivial.

## SURFACE-2026-06-25-QUALITY-WP1-APP-WIRING-UNTESTED
- **Files:** `src/components/workspace/Filmstrip.tsx`, `src/App.tsx` (requestClose / resolveClose / dirty-probe registry)
- **Priority:** low
- **Status:** pending
- **Type:** test-coverage gap
- **Finding:** Only the pure layer (reducer, `dirtyDocCount`, `closeWorkspaceSpec`) is unit-covered. No component test for the × (stopPropagation routing, keyboard Enter/Space) and no App-level test for the probe-registry / focus-repick wiring. Accepted boundary per the project's manual-host-UI convention + the live 9/9 operator verification — but the App wiring (`requestClose` reading the `workspaces` closure, `resolveClose` clearing `pendingClose`) is the part most likely to regress silently.
- **Pickup shape:** if/when the project adopts a component-test harness (RTL) or E2E (deferred per Phase-1 convention), add a Filmstrip-×-routing test + an App close-handler test. Low value until then; dismiss if the manual-verification posture holds.

# qol-wp0-fs-watcher — 2026-06-24

3 MINOR findings (0 CRITICAL, 0 MAJOR) from `feature-review-quality` on ship commit `d893254`. Reviewer rated the feature well-built, advancing the codebase — a textbook instance of the repo's conventions (status_broadcaster split, reused `ignore`/`diskConflict` seams, lifecycle through the existing register/deregister diff loop, IPC snake_case pinned both sides). All findings are forward-looking, none a defect at current scope. Auto-backlogged per drive_mode=autopilot.

## SURFACE-2026-06-24-QUALITY-FSWATCH-REWALK-AMPLIFICATION
- **Files:** `src/components/workspace/RightPanelHost.tsx:162-163`
- **Priority:** low
- **Status:** pending
- **Type:** tech-debt (latent scaling cost)
- **Finding:** Each `fs-change` event bumps BOTH `fsTreeRefreshKey` and `gitStatusRefreshKey`, each triggering a full `fs_tree` re-walk + `git_file_statuses` IPC. With the 200ms debounce, a bulk external op (`git checkout`, branch switch) still produces multiple batches → several back-to-back full-tree re-walks. Acceptable at the operator's repo sizes (the `build_ignore` doc-comment already accepts "a harmless extra re-walk"); the only place in the design where event→work amplification is unbounded.
- **Pickup shape:** a trailing-edge coalesce on the consumer side (collapse rapid `fs-change` bumps into one re-walk), OR raise the backend debounce window. Reassess if/when N-workspace concurrent dogfooding shows real cost. Dismiss if the re-walk stays imperceptible.

## SURFACE-2026-06-24-QUALITY-FSWATCH-EMIT-FAILURE-INVISIBLE
- **Files:** `src-tauri/src/fs_watch/commands.rs:143,161`
- **Priority:** low
- **Status:** pending
- **Type:** tech-debt (observability gap)
- **Finding:** Debouncer-callback failures (debounce errors, emit failures) go to `eprintln!` — consistent with the file's "log, don't crash the callback thread" intent and the repo's no-structured-logger posture, BUT a persistent emit failure means the tree/editor silently stop updating, invisible to the operator. The surfaced-error discipline applied to `workspace_watch_start`/`stop` doesn't reach the steady-state emit path.
- **Pickup shape:** low-value unless emit failures are seen in practice — there's no clean IPC channel back from a detached callback thread to surface a toast. Could set a "watcher degraded" flag the next command reads, or emit a one-shot `fs-watch-error` event. Likely dismiss (FSEvents emit failures are vanishingly rare on a healthy local app).

## SURFACE-2026-06-24-QUALITY-FSWATCH-ISDIR-FALSE
- **Files:** `src-tauri/src/fs_watch/mod.rs:119`
- **Priority:** low
- **Status:** pending
- **Type:** polish (documented-sound edge)
- **Finding:** `is_ignored` always passes `is_dir=false` to `matched_path_or_any_parents`; the doc-comment correctly explains parent-matching covers directory-only patterns (`foo/`). Non-issue for the watcher's actual inputs (every emitted event path is a file or a path under an ignored dir). Noted only because the comment's reasoning is load-bearing; the reviewer checked the matcher edge and found it sound.
- **Pickup shape:** no action needed — effectively a confirmation the edge was reviewed. Dismiss unless a future case feeds bare directory paths through `is_ignored`.

# app-menu-bar — 2026-06-24

1 MAJOR + 2 MINOR from `feature-review-quality` on ship commit `f815154` (0 CRITICAL). Reviewer rated the feature well-built, appropriately-scoped, adds zero new behavior, integrates through existing chord predicates. The MAJOR is the one real durability concern: an unguarded cross-language id contract. Auto-backlogged per drive_mode=autopilot.

## SURFACE-2026-06-24-QUALITY-APPMENU-CROSS-LANG-ID-CONTRACT
- **Files:** `src-tauri/src/app_menu/mod.rs:33` (`ids` module / `FUNCTIONAL_IDS`) ↔ `src/menu/menuBridge.ts:16` (`MENU_IDS`)
- **Priority:** medium (the MAJOR)
- **Status:** RESOLVED 2026-06-30 (debt-paydown WP3) — added pickup-shape option (a): a Rust test `functional_ids_are_pinned_to_the_frontend_bridge` (`app_menu/mod.rs` tests) reads `../src/menu/menuBridge.ts` as TEXT and asserts every `FUNCTIONAL_IDS` literal appears as a quoted `MENU_IDS` value. A one-char id drift on either side now fails `cargo test` instead of silently dead-clicking a menu item with green tests. Pins Rust ⊆ TS (each emitted id is mapped); the reverse is a dead switch arm, covered by `menuBridge`'s own vitest. No-codegen, fits the repo posture.
- **Type:** tech-debt (unguarded cross-language contract)
- **Finding:** The 11 functional menu-item id strings are duplicated across Rust (`app_menu::ids`) and TS (`MENU_IDS`) with NO mechanical link — only prose ("keep in sync" / "byte-identical"). A one-character drift on either side silently dead-clicks exactly one menu item: Rust emits an id, the TS `menuActionFor` switch falls through to `default → null`, the click does nothing. Crucially this ships with GREEN tests — the Rust tests only check `FUNCTIONAL_IDS` internal uniqueness, and `menuBridge.test.ts` references `MENU_IDS.*` symbolically (so it passes regardless of what the literal strings are). This is the feature's single load-bearing cross-language contract and the most likely future-regression vector (rename a panel id, ship, lose one menu item, no test fails).
- **Pickup shape:** add a mechanical pin — cheapest options: (a) a Rust test that reads `src/menu/menuBridge.ts` as text and asserts each `ids::*` literal appears as a `MENU_IDS` value (string-grep assertion); (b) generate the shared id list at build time from one source; (c) a small TS test that imports a JSON/generated list emitted by the Rust side. (a) is the lowest-effort guard and fits the repo's no-codegen posture. Dismiss via the WIP `## Code-Quality Review` section if judged not worth it.

## SURFACE-2026-06-24-QUALITY-APPMENU-LABEL-ONLY-ID-COMMENT
- **Files:** `src-tauri/src/app_menu/mod.rs` (label-only disabled items + the `label_only_ids_are_not_functional` test)
- **Priority:** low
- **Status:** pending
- **Type:** readability nit
- **Finding:** The label-only disabled items carry ids (`file.save.label`, etc.) that exist only so `is_functional_id` returns false and the negative-space test can enumerate them — they never reach `on_menu_event` (disabled items don't fire). A reader will hunt for where `file.save.label` is dispatched (answer: never). A one-line comment at the test would save the hunt.
- **Pickup shape:** one-line comment. Trivial `/feature-refactor` or opportunistic.

## SURFACE-2026-06-24-QUALITY-APPMENU-LISTENER-NOT-EXTRACTED
- **Files:** `src/App.tsx:120-160` (the `menu` listener effect)
- **Priority:** low
- **Status:** pending
- **Type:** testability (consistent with standing posture)
- **Finding:** The `menu` listener body (id→action mapping, key re-dispatch, the 4 callback branches with the focused-path-ref lookup) lives inline in `App()` — the one piece of menu logic not extracted to a pure testable seam (unlike `menuBridge`). Extracting the action-dispatch (given an action + a small effects object) would let the callback-vs-key branching be unit-tested. LOW priority — consistent with the repo's "runtime-bound listeners are not unit-tested" posture (XtermPane, useWorkspaceStatus); the pure `menuBridge` mapping IS fully tested, which is the higher-value half.
- **Pickup shape:** optional extraction of a pure `dispatchMenuAction(action, effects)` + its unit test. Defer unless the listener grows.

# m4-wp4b-focus-indicator — 2026-06-23

3 MINOR findings from `feature-review-quality` on ship commit `647148f` (0 CRITICAL, 0 MAJOR). Reviewer rated the feature well-built with negligible (cosmetic) debt: clean pure/impure seam (`deriveFocusHalf`), well-justified duck-typed guard, correct `relatedTarget`-based `focusout`, and the atomically-landed F12 fix that repaired a pre-existing regression + deleted a dead rule. All three findings are leftover cosmetic dust from the F12 fix. Auto-backlogged per drive_mode=autopilot.

## SURFACE-2026-06-23-QUALITY-WP4B-DEAD-DATA-ACTIVE-PANE
- **Files:** `src/components/workspace/editor/EditorSplit.tsx:426`
- **Priority:** low
- **Status:** RESOLVED 2026-06-30 (debt-paydown WP1) — `data-active-pane` attribute dropped from EditorSplit.tsx; no live selector/test consumed it (live indicator is `.editor-split-pane.is-active::before`). 780 frontend tests green.
- **Type:** tech-debt (dead surface)
- **Summary:** The `data-active-pane={pane.id === panes.activePaneId}` attribute rendered on `.editor-split-pane` is now consumed by nothing — the live active-pane indicator selector is `.editor-split-pane.is-active::before` (the `is-active` class), and the only remaining `[data-active-pane]` references are inside `App.css` *comments*. The WP4b F12 fix moved the live selector off `data-active-pane`, leaving it a dangling render-time emit.
- **Context:** Was load-bearing pre-WP11-Phase-5 (the orphaned WP3c rule keyed off it). A future reader will reasonably assume it's still live and hesitate to remove it.
- **Suggested action:** Drop the `data-active-pane` attribute from EditorSplit.tsx:426 (the `is-active` class already carries the state). One-line. Pairs with finding #2 (the stale comment cross-ref) — one `/feature-refactor` pass.
- **Pickup shape:** trivial `/feature-refactor` item. Dismiss via the WIP's `## Code-Quality Review` section.

## SURFACE-2026-06-23-QUALITY-WP4B-STALE-COMMENT-XREF
- **Files:** `src/App.css` (WP4b half-accent block, ~line 443)
- **Priority:** low
- **Status:** RESOLVED 2026-06-30 (debt-paydown WP1) — the WP4b comment cross-ref + the tombstone block both repointed off the dead `.editor-pane[data-active-pane]` selector to the live `.editor-split-pane.is-active::before`.
- **Type:** tech-debt (stale comment)
- **Summary:** The WP4b block comment cross-references `.editor-pane[data-active-pane]` as the WP3c precedent ("the WP3c lesson, see ..."), but that exact rule is the dead one this same commit deletes ~180 lines below. The live precedent is now `.editor-split-pane.is-active::before`.
- **Context:** A cross-reference pointing at a selector the same commit removes; stale on arrival. The adjacent removed-rule tombstone comment is accurate — only this one pointer needs the updated target.
- **Suggested action:** Update the comment's cross-ref to point at `.editor-split-pane.is-active::before`. Pairs with finding #1.
- **Pickup shape:** trivial `/feature-refactor` item. Dismiss via the WIP's `## Code-Quality Review` section.

## SURFACE-2026-06-23-QUALITY-WP4B-COEXISTENCE-COMMENT-DUP
- **Files:** `src/App.css` (WP4b half-accent block + the F12 `.editor-split-pane.is-active::before` block)
- **Priority:** low
- **Status:** RESOLVED 2026-06-30 (debt-paydown WP5) — consolidated to one canonical comment: the WP4b half-accent block holds the full outer-vs-inner-edge / framed-vs-striped / z-index:6 rationale; the F12 `.is-active::before` block trimmed to a one-line back-reference. vite build + 784 tests green.
- **Type:** tech-debt (comment duplication)
- **Summary:** The coexistence rationale (outer-edge vs inner-edge, "framed vs striped", z-index:6 parity) is documented near-verbatim in two CSS blocks; they will drift if the edge convention ever changes.
- **Context:** Belt-and-suspenders given the genuine cross-rule coupling, but a drift hazard. Acceptable as-is; noted for completeness.
- **Suggested action:** Optionally consolidate to a single canonical comment with a one-line back-reference from the other block. Lowest-value of the three.
- **Pickup shape:** trivial `/feature-refactor` item. Dismiss via the WIP's `## Code-Quality Review` section.

# m3-wp6-frontend-status-indicator — 2026-06-22

1 MAJOR + 2 MINOR findings from `feature-review-quality` on ship commit `b377a97` (0 CRITICAL). Reviewer rated it well-built — clean pure/runtime/render layering, faithful wire-contract mirror, exemplary dead-code-allow retirement. The one real blemish is a dead snippet/tooltip path. Auto-backlogged per drive_mode=autopilot.

## SURFACE-2026-06-22-QUALITY-WP6-SNIPPET-TOOLTIP-DEAD-PATH
- **Files:** `src/state/workspaceStatus.ts:38-39,93-98` (`applyStatusUpdate` reducer); `src/state/useWorkspaceStatus.ts:53-55` (no snippet accessor); `src/components/workspace/CenterStage.tsx` (never passes `statusSnippet`); `src/components/workspace/Workspace.tsx:33` + `WorkspaceStatusIndicator.tsx:18` (prop + `title={snippet ?? label}`)
- **Priority:** medium
- **Status:** RESOLVED 2026-06-30 (debt-paydown WP2, D1 — THREAD IT) — the status map now stores `{state, snippet?}` entries (`WorkspaceStatusEntry`); `applyStatusUpdate` folds in `last_output_snippet` (sticky-per-event: a later snippet-less event clears it); added `snippetFor(map, id)` + exposed it on `useWorkspaceStatus`; `App` threads `snippetFor` to both `CenterStage` (→ `Workspace` `statusSnippet`) and `Filmstrip`, and `Pip` derives `snippet` for its tile indicators. Hovering any status dot now shows CC's last output/prompt line. The `AttentionStatusMap` subset (`pipLayout.ts`) widened to `{state}` entries. +4 reducer/accessor codify tests (snippet folds in, clears on snippet-less event, `snippetFor` reads it/defaults undefined). `tsc` + 784 frontend tests green.
- **Type:** tech-debt (dead surface)
- **Summary:** The `statusSnippet`/tooltip path is wired end-to-end (wire DTO `last_output_snippet` → `snippet` prop → indicator `title`) but **fed by nothing**: `applyStatusUpdate` stores only `update.state`, discarding `last_output_snippet`; the hook exposes only `stateFor` (no snippet accessor); `CenterStage` never passes `statusSnippet`. So the indicator tooltip always falls to `label`.
- **Context:** The WIP's Phase-3 verify-human note claims the captured `Notification` snippet "shows in the indicator's title/tooltip if surfaced" — it cannot, the reducer drops it before it reaches the component. The test baseline missed it (no test asserts snippet→tooltip). Genuine but small.
- **Suggested action:** Fix-or-remove, one commit. EITHER thread the snippet — extend the map to store `{state, snippet}` (or a parallel map), add a `snippetFor(id)` accessor, pass `statusSnippet={snippetFor(ws.id)}` in CenterStage — OR remove the unused `snippet` prop + the `last_output_snippet` frontend DTO field (keep the backend field; drop the unused frontend surface). Threading it is the higher-value path (it makes the Notification payload visible on hover, which was the WP6 intent).
- **Pickup shape:** a `/feature-refactor` item; threading is ~15 lines across reducer+hook+CenterStage. Pairs naturally with any future status-detail UI. Dismiss via the WIP's `## Code-Quality Review` section.

## SURFACE-2026-06-22-QUALITY-WP6-MINORS
- **Files:** `src/state/useWorkspaceStatus.ts:53-55`; `src/state/workspaceStatus.ts:38-39` + `WorkspaceStatusIndicator.tsx` snippet prop
- **Priority:** low (all)
- **Status:** pending
- **Findings:**
  1. **`stateFor` re-created every render** (`useWorkspaceStatus.ts:53-55`) — a fresh closure each render, consumed per-workspace in CenterStage. Harmless at N≤1; a `useCallback` keyed on `statusMap` would avoid re-running the lookup chain as the list grows in Phase 2 (multi-workspace).
  2. **Comment accuracy on the unfed snippet** (`workspaceStatus.ts:38-39` + indicator `snippet` prop) — companion to the MAJOR: the `last_output_snippet` field + `snippet` prop are documented as "telemetry"/tooltip but have no live consumer; a `// not yet consumed — deferred` note would stop a future reader assuming it's wired. (Resolved automatically if the MAJOR's thread-it path is chosen.)
- **Pickup shape:** trivial `/feature-refactor` nits. Dismiss any via the WIP's `## Code-Quality Review` section.

# m3-wp3-socket-listener — 2026-06-22

3 MINOR findings from `feature-review-quality` on ship commit `4355e00` (0 CRITICAL, 0 MAJOR). Reviewer rated it well-built — lands scope cleanly, advances the codebase, no refactor warranted; honest integration-level test coverage + negative-direction serde guard; every non-obvious decision carries a WHY comment. All polish-tier. Auto-backlogged per drive_mode=autopilot.

## SURFACE-2026-06-22-QUALITY-WP3-MINORS
- **Files:** `src-tauri/src/hook_socket/commands.rs:31-39,58-59,23`; `src-tauri/src/hook_socket/mod.rs:157-158`
- **Priority:** low (all)
- **Status:** pending
- **Findings:**
  1. **`hook_socket_path` carries a hidden mkdir side effect** (`commands.rs:31-39`) — the function reads as "resolve a path" but `create_dir_all`s the app-data dir, and runs ~3×/launch (once via `start_on_launch`, again per `hook_install::resolve_paths` delegation). Idempotent/harmless, but a future caller wanting just the path string inherits a filesystem write. *(Consider splitting a pure `socket_path()` from an `ensure_socket_dir()` if a path-only caller ever appears.)*
  2. **No per-line length cap in the accept-loop** (`mod.rs:157-158`) — `BufReader::lines()` reads each connection line unbounded. The hook is a trusted single-user local writer so not a real DoS surface, but a malformed writer emitting one unbounded line with no newline would buffer without bound on the accept thread. A `take(N)` cap would harden the never-block-CC thread.
  3. **`HOOK_SOCKET_NAME` over-exported** (`commands.rs:23`) — `pub const` but only consumed within this module (the old private `hook_install` copy was deleted in favor of delegating to `hook_socket_path`). Tighten to module-private unless WP4 references the basename directly.
- **Pickup shape:** all three are trivial `/feature-refactor` nits / opportunistic fixes. None changes correctness or the WP4 hand-off contract. Dismiss any via the WIP's `## Code-Quality Review` section.

# m3-wp2-hook-install — 2026-06-22

4 MINOR findings from `feature-review-quality` on ship commit `77d6a6e` (0 CRITICAL, 0 MAJOR). Reviewer rated it well-built and defensively-minded for a dangerous operation (mutating a shared user `settings.json`); standout test suite (real-config shape + byte-exact round-trip + never-wipe-on-parse-failure). No refactor warranted; all cosmetic/opportunistic. Auto-backlogged per drive_mode=autopilot.

## SURFACE-2026-06-22-QUALITY-WP2-MINORS
- **Files:** `src-tauri/src/hook_install/commands.rs:42` + `mod.rs:78`; `src-tauri/resources/claudesk-hook.pl:66`; `src-tauri/src/hook_install/mod.rs:101`; `src-tauri/src/lib.rs:62`
- **Priority:** low (all)
- **Status:** PARTIAL — #4 (stale `sublime_open` "removed at WP8" comment) RESOLVED 2026-06-30 (debt-paydown WP5): the `lib.rs` `sublime_open` registration comment now states the WP8-redefinition permanent-escape-hatch reality (in-app editor primary, Sublime Text stays one-click, `⌘⇧O` dropped) instead of "Transitional — removed at WP8." #2 already PARTIALLY-ADDRESSED (99a48d5). #1 (chmod/invocation mismatch) + #3 (`NotAnObject` coarseness) remain pending (not in the WP5 comment-drift scope — #1 is a behavior decision, #3 an error-variant refactor).
- **Findings:**
  1. **chmod/`/usr/bin/perl` mismatch** — the registered command runs `/usr/bin/perl <script>` (not `<script>` directly), so the `chmod 0o755` in `deploy_hook_script` + the script's shebang are never exercised; the `commands.rs`/`mod.rs:78` comment "CC invokes it directly" is inaccurate. Either drop the chmod (dead effort) or invoke the script directly. *(Mild — keeping chmod is harmless future-proofing if the command form ever changes; pick one and reconcile the comment.)* **— PARTIALLY ADDRESSED 2026-06-22 (commit 99a48d5):** the related "shell-form is fine, paths are app-controlled" assumption was the leading edge of a real word-split bug (spaced app-data path) — now fixed (paths shell-quoted). The chmod-vs-invocation cosmetic mismatch itself remains open (low pri).
  2. **Perl hook write-side blocking (WP3 heads-up)** — `print $sock $line` (claudesk-hook.pl:66) can block if WP3's listener accepts the connection but stalls on read (`Timeout=>1` covers connect, not write). Not a defect in WP2 (no listener exists yet), but the WP3 author must keep the accept-loop draining promptly to preserve the "never block CC" invariant on the write side. Best addressed when WP3 builds the listener.
  3. **`NotAnObject` error-variant coarseness** — three distinct shape failures (root not object, `hooks` not object, an event value not an array) all collapse to one variant (`mod.rs:101`); a malformed `hooks.<event>` array value yields the misleading "root is not a JSON object" message. Opaque-string-to-toast, low impact; a future debugger would be misdirected.
  4. **Stale `sublime_open` comment (pre-existing)** — `lib.rs:62` still reads "Transitional — removed at WP8 once editor parity," contradicting CLAUDE.md's normative "both Sublime launchers KEPT permanently (revised 2026-06-20)." NOT WP2-introduced (inherited), but sits 2 lines above WP2's new registration and is demonstrably wrong against the style guide. Trivial comment fix.
- **Pickup shape:** all four are trivial `/feature-refactor` nits. #2 is best deferred to WP3 (the listener WP). #1, #3, #4 are quick opportunistic fixes. Dismiss any via the WIP's `## Code-Quality Review` section.

# m2-wp13-close-tab-chord — 2026-06-22

3 MINOR findings from `feature-review-quality` on ship commit `f8d6761` (0 CRITICAL, 0 MAJOR). Reviewer rated it well-built, tightly-scoped, no debt; the stale-closure fix matches existing in-file prior art and the codification gap was honestly surfaced (SURFACE-2026-06-22-PANETABS-COMPONENT-TEST-GAP). All cosmetic. Auto-backlogged per drive_mode=autopilot.

## SURFACE-2026-06-22-QUALITY-WP13-MINORS
- **Files:** `PaneTabs.tsx:231-245`; `closeTabChord.ts:1-32`; `__tests__/closeTabChord.test.ts`
- **Priority:** low (all)
- **Status:** RESOLVED — #1 (WP5); #2 + #3 RESOLVED 2026-06-30 (debt-paydown WP6). #2 (shared `ChordEvent`): created `chordEvent.ts` canonical `ChordEvent`; `CloseTabChordEvent` + `TabSwitchChordEvent` now alias it. #3 (Ctrl/Alt case): added a `{metaKey:true,shiftKey:false,key:"w",ctrlKey:true,altKey:true}` assertion to `closeTabChord.test.ts` (the widened type made the real-flags case possible).
- **Findings:**
  1. **`closeActiveTabRef` comment duplication** — the ~10-line WHY comment on the render-fresh-ref restates the rationale already documented at PaneTabs.tsx L257-263 (`onActivePathChangeRef`/`onEmptyChangeRef`). A one-liner + back-reference ("same render-fresh-ref pattern as the reporters below, see L257") would cut the dup while keeping the load-bearing vh.3 explanation. — **RESOLVED 2026-06-30 (WP5):** trimmed the `closeActiveTabRef` comment to a one-liner + back-reference to the reporter refs (`onActivePathChangeRef`), keeping the vh.3 stale-closure explanation.
  2. **`CloseTabChordEvent` is a verbatim copy of `TabSwitchChordEvent`** — identical 3-field shape + "mirrors ChordEvent" comment. A shared `ChordEvent` type imported by both pure predicates would remove the dup; per-file self-containment for these seams is arguably a feature, so low-value.
  3. **Missing Ctrl/Alt-permissive test case** — `closeTabChord.ts:27-29` docstring promises Ctrl/Alt aren't part of the chord, but no test pins it. A `{metaKey:true,shiftKey:false,ctrlKey:true,key:"w"}` assertion would lock the documented invariant (safe today — the predicate doesn't read those fields).
- **Pickup shape:** all three are trivial `/feature-refactor` nits (consolidate a comment; optionally hoist a shared `ChordEvent` type; add one test case). Dismiss any via the WIP's `## Code-Quality Review` section.

# m2-wp11-tree-density-git-indicators — 2026-06-21

1 MAJOR + 3 MINOR findings from `feature-review-quality` on ship commit `6bcbe1f` (0 CRITICAL). Reviewer rated it ship-quality; backend (git_status `pub(crate)` reuse of git_diff's git2 plumbing, non-git-dir-is-not-an-error semantics, per-path staged-wins fold) the standout; Phase-5 layout churn well-annotated. Auto-backlogged per drive_mode=autopilot.

## SURFACE-2026-06-21-QUALITY-WP11-GIT-STATUS-PATH-KEYING
- **File:** `src/components/workspace/filetree/FileTree.tsx:203` (`gitStatus[node.path]`) × `src-tauri/src/git_status/mod.rs` (`status_map_core`)
- **Priority:** medium
- **Status:** RESOLVED 2026-06-30 (debt-paydown WP2) — STALE DETAIL ENTRY, fix already shipped at M2 close (2026-06-22, task `m2-wp11-git-status-path-keying`; see `backlog.md:507`). `status_map_core` already re-bases each git path to the workspace root (`within_repo_prefix` + `rebase_to_workspace`: strip the within-repo prefix, drop out-of-subtree entries, empty-prefix short-circuit preserves ws==repo-root) and the exact nested-workspace regression test (`workspace_nested_below_repo_root_is_keyed_workspace_relative`) passes. Only THIS detail entry was left `pending` when the M2 task closed. The debt-paydown-WBS WP2 plan to add an "indicators unavailable" signage state was written on this stale premise + DROPPED at WP2 build (operator decision 2026-06-30): the re-base already handles the nested case, and the operator always opens repo roots so it never fires anyway — adding signage would be dead defensive code, the opposite of the sweep's de-clutter intent. No code change; entry reconciled to the as-shipped reality.
- **Summary:** The tree keys the git-status map by `node.path`, which is **workspace-root-relative** (`fs_tree` strips `projectPath`), but `git_file_statuses` returns **git-repo-root-relative** paths (libgit2 `repo.statuses()` + `open_repo`'s `Repository::discover` support a workspace nested below the repo root). When `projectPath` is a subdirectory of the enclosing repo, the two key spaces diverge → every git indicator silently fails to render (no error, blank). The verify-human passes ran against a workspace that WAS the repo root, so the green baseline never exercised the nested case.
- **Suggested action:** Re-base the command's returned paths to `root` (compute repo-root → strip the `root`-relative prefix so keys match `fs_tree`), OR assert + document a root==repo-root precondition and surface a clear state when violated. Graceful failure today (no crash, just no indicators) → MAJOR not CRITICAL. Natural to fold into WP13 or a quick task.

## SURFACE-2026-06-21-QUALITY-WP11-MINORS
- **Files:** `git_status/mod.rs:68`; `App.css` + `FileTree.tsx:219`; `gitStatus.ts:16`
- **Priority:** low
- **Status:** RESOLVED 2026-06-30 (debt-paydown WP6) — all 3: (1) added the non-UTF-8-path-drop comment at `git_status::status_map_core`'s `entry.path().unwrap_or("")`; (2) removed the redundant `.file-tree-status { margin-left: auto }` (the `.file-tree-name { flex: 1 }` already pushes the glyph right — same no-op as the already-removed `.file-tree-dir-status` rule); (3) [Theme H] closed the `GitFileStatus` TS↔Rust drift channel with a paired exhaustiveness guard — a Rust `changed_status_serde_forms_match_the_frontend_union` test pinning the serde forms + a TS `Record<GitFileStatus, …>` exhaustive-glyph test (compiler-enforced). A new variant now fails a test on whichever side lags.
- **Summary:** Three cosmetic/clarity nits: (1) `entry.path().unwrap_or("")`+skip silently drops non-UTF-8 paths (libgit2 returns `None`) — add a one-word comment; (2) the indicator right-pin uses BOTH `.file-tree-name {flex:1}` and `.file-tree-status {margin-left:auto}` (self-flagged "belt-and-suspenders" — one redundant); (3) `GitFileStatus` TS union is a prose-only mirror of the Rust serde forms (latent drift channel — a new `ChangedStatus` variant compiles clean both sides + renders no glyph; no exhaustiveness test).
- **Suggested action:** Quick `/feature-refactor` sweep; all three are low-stakes polish.

# m2-wp3b-command-palette — 2026-06-20

1 MAJOR + 2 MINOR findings from `feature-review-quality` on ship commit `3699a22` (0 CRITICAL). The feature is well-built (registry seam genuinely extensible, render-time override derivation idiomatic, well-aimed tests). Findings are comment-vs-code drift around a vestigial language Compartment (MAJOR), a duplicated language-pack switch (MINOR), and an optional-vs-required `active` prop asymmetry (MINOR). Auto-backlogged per drive_mode=autopilot.

## SURFACE-2026-06-20-QUALITY-WP3B-VESTIGIAL-LANGUAGE-COMPARTMENT
- **File:** `src/components/workspace/editor/theme.ts:176` (`languageCompartment`) + `editorExtensions.ts:60-65, 188-194`
- **Finding:** `languageCompartment` is `.of()`-seeded but never `.reconfigure()`d — the palette syntax swap happens purely via the `languageOverrideId` useMemo dep forcing an array-identity rebuild (which `@uiw/react-codemirror` applies as a full reconfigure). The WHY-comments claim two contradictory mechanisms ("reconfigure it without rebuilding the editor — same pattern as `fontSizeCompartment`" vs "the palette reconfigures the override by rebuilding the extensions"), and neither matches: the font-size compartment IS live-`reconfigure`d in `applyZoom`, the language one is not.
- **Why it matters:** the compartment wrapper adds no behavior the array rebuild doesn't already provide (vestigial), and a maintainer extending syntax-switching will hunt for a live `reconfigure` call that doesn't exist. Comment-vs-code drift is the actively-misleading kind.
- **Suggested action:** Either (a) drop the compartment and seed the language directly in the array (simplest — the rebuild already does the work), OR (b) actually live-`reconfigure` `languageCompartment` from the palette command and stop rebuilding the array on `languageOverrideId` change (mirrors `applyZoom`, avoids a full reconfigure per syntax pick). Reconcile the theme.ts + editorExtensions.ts comments to the chosen mechanism either way. Lean (a) for simplicity unless the per-switch full-reconfigure cost ever shows up.
- **Priority:** medium
- **Status:** RESOLVED 2026-06-20 (`/feature-refactor`) — took fix (a): `languageCompartment` removed from theme.ts, the resolved language placed directly in the `buildEditorExtensions` array (the openPath/languageOverrideId memo rebuild already swaps it via @uiw's full reconfigure), and the theme.ts + editorExtensions.ts + EditorPanel.tsx comments reconciled to that mechanism. `fontSizeCompartment` kept (it IS genuinely live-reconfigured). 118/118 tests, language-facet assertions still green.

## SURFACE-2026-06-20-QUALITY-WP3B-DUP-LANGUAGE-SWITCH
- **File:** `src/components/workspace/editor/language.ts:80-97` (`languageForId`) vs `:16-39` (`languageForExtension`)
- **Finding:** `languageForId`'s switch duplicates `languageForExtension`'s pack-mapping arms (`javascript({jsx:true})`, `javascript({typescript:true})`, `rust()`, `markdown()`). The header comment claims "the same packs back both paths, so there's no second source of truth," but there are two parallel switches that can drift — the extension path maps `js/cjs/mjs`, the id path only `javascript`.
- **Why it matters:** adding or retuning a language requires editing both switches; the "single source of truth" comment overstates the design.
- **Suggested action:** Route both through a shared id→Extension map keyed off a canonical mode id (extensionOf → id, then one id→Extension lookup). Low-cost; makes the comment true.
- **Priority:** low
- **Status:** RESOLVED 2026-06-20 (`/feature-refactor`) — `languageForId` is now the SINGLE id→Extension switch (the only place pack constructors live); `languageForExtension` maps extension→canonical id via a new private `idForExtension` then delegates to `languageForId`. No duplicated pack arms; header comment rewritten to a single-source-of-truth note. 39/39 language+extensions tests green.

## SURFACE-2026-06-20-QUALITY-WP3B-ACTIVE-PROP-ASYMMETRY
- **File:** `src/components/workspace/editor/EditorPanel.tsx:36` vs `src/components/workspace/SublimeToolbar.tsx:22`
- **Finding:** `EditorPanel.active` is optional with a `true` default while the mirrored `SublimeToolbar.active` is a required boolean. A future caller can forget to pass `active` to `EditorPanel` and silently get an always-listening palette in a backgrounded tab, whereas the same mistake on `SublimeToolbar` is a compile-time type error.
- **Why it matters:** trades a compile-time gating guard for standalone-mount convenience on a multi-workspace gating prop; not load-bearing at N=1 but a latent multi-workspace foot-gun.
- **Suggested action:** Consider making `active` required (drop the default) and pass it explicitly everywhere, or document why the default is safe. Pairs naturally with any Phase-2-milestone multi-workspace wiring.
- **Priority:** low
- **Status:** RESOLVED 2026-06-20 (`/feature-refactor`) — `EditorPanel.active` made required (dropped the `= true` default), now a compile-time obligation mirroring `SublimeToolbar.active`. The sole caller (`Workspace.tsx`) already passes `active={visible}`; tsc confirms no caller omits it.

# wp9-phase1-polish — 2026-06-19

3 MINOR findings from `feature-review-quality` on ship commit `91fae7f` (0 CRITICAL, 0 MAJOR). The feature is well-built; findings are a partial-failure window already triaged elsewhere, a plan/impl drift note, and a missing clarifying comment. Auto-backlogged per drive_mode=autopilot (MINOR).

## SURFACE-2026-06-19-QUALITY-WP9-PICKER-PARTIAL-FAILURE-WINDOW
- **File:** `src/components/picker/ProjectPicker.tsx` (mount effect: prune + list)
- **Finding:** `prune_missing_projects` + `list_projects` share one `try { } catch {}` with an empty body; a prune-succeeds-then-list-throws window would leave the toast set while recents stay empty (transient inconsistent state).
- **Why it matters:** both IPC calls realistically succeed/fail together and empty-recents is an acceptable fallback, so it's low-risk — but the partial-failure ordering isn't visible to a future reader. The inline comment already points at the broader picker IPC error-surfacing item.
- **Suggested action:** Fold into the existing picker IPC error-surfacing work (`SURFACE-2026-06-18-QUALITY-*`, the wp6 picker MAJORs) rather than a standalone fix — surface IPC failures to the user there. Trivial alone.
- **Priority:** low
- **Status:** RESOLVED — folded into the picker IPC error-surfacing fix at M4 WP2, confirmed at debt-paydown WP3 (2026-06-30). The prune+list mount loader's shared `try/catch` now ends in `setToast({kind:"error", …})` via `mapIpcError`, so the prune-succeeds-then-list-throws window surfaces an error toast instead of leaving recents silently empty.

## SURFACE-2026-06-19-QUALITY-WP9-PLAN-IMPL-DRIFT-CCNOTFOUND
- **File:** `workflow/archive/wp9-phase1-polish.md` P1.1 outcome line vs `src-tauri/src/cc_session/mod.rs`
- **Finding:** The Phase-1 observable-outcome text said the not-found case maps to "a friendly `CcError::Spawn` variant/message"; the shipped code introduces a dedicated `CcError::CcNotFound` variant instead (cleaner than overloading `Spawn`).
- **Why it matters:** Pure plan-text/impl drift note — the implementation choice is better than the planned one; recorded only so the divergence is on file. No code change wanted.
- **Suggested action:** None (informational). Resolve by acknowledging the better-than-planned choice.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-06-19-QUALITY-WP9-CLASSIFY-CASEFOLD-COMMENT
- **File:** `src-tauri/src/cc_session/mod.rs` (`classify_spawn_error`)
- **Finding:** The classifier lowercases the raw message then matches lowercase literal markers; a one-line comment noting the `to_lowercase()` is what makes the literals safe (vs the markers being pre-lowered by coincidence) would help a future editor. Existing comment explains liberality but not the case-folding contract.
- **Why it matters:** Readability only; logic is correct.
- **Suggested action:** Add the one-line comment in a future touch of this fn. Trivial.
- **Priority:** low
- **Status:** pending

# wp8-sublime-hotkey — 2026-06-19

3 MINOR findings from `feature-review-quality` on ship commit `74dfc2c` (0 CRITICAL, 0 MAJOR). The feature survived a mid-flight OS-global→in-app spec reversal with no live remnants; findings are all doc-accuracy/cosmetic. MINOR #1 (stale "global-shortcut handler" rationale) was FIXED IN-PLACE at finalize-prep time in both the WIP Discoveries and the backlog SURFACE entry — not pending. The 2 below are the remaining cosmetic nits. Auto-backlogged per drive_mode=autopilot (MINOR).

## SURFACE-2026-06-19-QUALITY-WP3-PROBE-SECTION-SHORTHAND
- **File:** `src-tauri/src/sublime/mod.rs:46-47` vs `:99`
- **Finding:** `ST_BUNDLE_BIN`'s doc cites "WP3 probe §Decision point 2" while the module header cites "WP3 T3" for the `--project` finding — inconsistent shorthand for the same archived probe source.
- **Why it matters:** trivial cross-reference polish; a reader can't tell if they're distinct citations. Both point at `workflow/archive/wp3-sublime-cli-probe.md`.
- **Suggested action:** normalize both to one citation style. Trivial.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-06-19-QUALITY-CHORD-TS-PHASE-TAG
- **File:** `src/sublime/chord.ts:1`
- **Finding:** Header tagged "WP8 Phase 2" reads oddly standalone now the tree collapsed to 2 phases (Rust core / frontend). Accurate, just stylistically loose.
- **Why it matters:** cosmetic; no functional impact.
- **Suggested action:** drop the "Phase 2" qualifier or leave as-is. Lowest priority.
- **Priority:** low
- **Status:** pending

# wp7-pty-cc-session — 2026-06-19

4 MINOR findings from `feature-review-quality` on ship commit `50ca322` (0 CRITICAL, 0 MAJOR). Backend module rated the strongest part of the diff; all findings are low-stakes comment/framing drift + one incidental effect-dep robustness gap. Auto-backlogged per drive_mode=autopilot (MINOR).

## SURFACE-2026-06-19-QUALITY-CC-KILL-SIGTERM-COMMENT-DRIFT
- **File:** `src-tauri/src/cc_session/commands.rs:64` (+ WIP AC#6)
- **Finding:** The `cc_kill` doc comment and the WIP acceptance criterion both say "SIGTERM → SIGKILL after a grace window," but `PtyCcSession::kill` actually goes `/exit\r` → poll `try_wait` ~3s → `child.kill()` (SIGKILL via portable-pty) — there is no SIGTERM step.
- **Why it matters:** comment-vs-code drift; a future maintainer will look for a SIGTERM path that doesn't exist. The behavior is correct (clean `/exit\r` first is better than SIGTERM); the fix is to the comment wording, not the code.
- **Suggested action:** reword the `cc_kill` doc comment to "`/exit\r` graceful, then SIGKILL after a grace window." Trivial.
- **Priority:** low
- **Status:** RESOLVED (already corrected in place; confirmed at debt-paydown WP5, 2026-06-30) — STALE PREMISE: the `cc_kill` doc already reads "(`/exit\r`, then SIGKILL fallback)" and a repo-wide grep finds ZERO "SIGTERM" strings. No code change.

## SURFACE-2026-06-19-QUALITY-KILL-ALL-N-SCALING
- **File:** `src-tauri/src/lib.rs:30-36` + `cc_session/mod.rs` `kill_all`/`kill`
- **Finding:** `kill_all()` runs inside the `CloseRequested` handler while holding the registry `Mutex`, and each `kill()` polls `try_wait` for up to 3s. At Phase-1 N=1 this is invisible, but the loop is explicitly written "for N" — at N>1 it serializes 3s grace windows and can block window close for up to 3s×N.
- **Why it matters:** the N-ready framing invites a future reader to assume `kill_all` scales; it doesn't. Surfaces when the Phase-2 N-clamp lifts.
- **Suggested action:** at the N-clamp lift (Phase 2 multi-workspace), reap sessions concurrently or use a per-session timeout so window close isn't serialized. Tie to the WP13 multi-workspace work.
- **Priority:** low
- **Status:** RESOLVED (already fixed at M4 WP2; confirmed at debt-paydown WP4, 2026-06-30) — STALE FILE-REF (`lib.rs:30-36`; the `kill_all` call site moved to `lib.rs:371`). `SessionRegistry::kill_all` was parallelized at M4 WP2: it drains every session and spawns one thread per `kill()`, so the N×3s grace windows OVERLAP (~one window total). Covered by `kill_all_runs_grace_windows_in_parallel_not_serially`.

## SURFACE-2026-06-19-QUALITY-ONSESSIONID-INLINE-ARROW-DEP
- **File:** `src/components/workspace/Workspace.tsx:34` + `XtermPane.tsx` spawn-effect dep array
- **Finding:** `onSessionId` is passed to `XtermPane` as an inline arrow (`(sid) => onSessionId?.(workspace.id, sid)`), a fresh reference every render, yet it sits in the spawn effect's dependency array. The `if (bridge.phase !== "spawning") return` guard makes the re-run a cheap no-op today, so this is NOT a live bug — but the dep array reads as if `onSessionId` identity is meaningful when the "spawn exactly once" safety is incidental (the phase guard), not structural.
- **Why it matters:** a future edit weakening the phase guard could turn this into a double-spawn. Make the intent robust.
- **Suggested action:** wrap the inline arrow in `useCallback` (memoized on `workspace.id` + the stable `onSessionId`) or read `onSessionId` from a ref in the effect. Fold into a `/feature-refactor` pass or Phase-2 picker/workspace work.
- **Priority:** low
- **Status:** RESOLVED (already fixed; confirmed at debt-paydown WP4, 2026-06-30) — `XtermPane.tsx` holds `onSessionId` in `onSessionIdRef` (the documented duplicate-CC-session root-cause fix, latent-since-WP7); the spawn effect no longer depends on the arrow's identity, so callback-identity churn can't re-fire the spawn.

## SURFACE-2026-06-19-QUALITY-RAF-FOCUS-DUPLICATION
- **File:** `src/components/workspace/XtermPane.tsx:159-162 / 91-94`
- **Finding:** The rAF-deferred `fitAndResize` + `focus` pattern is duplicated at mount and post-spawn with near-identical inline comments explaining the 80-col layout-timing rationale.
- **Why it matters:** low-stakes, but the doubled prose comment restates the same WHY twice; drift risk if the rAF rationale ever changes.
- **Suggested action:** extract a tiny `rafFitFocus()` helper or have one comment cross-reference the other. Cleanup-only.
- **Priority:** low
- **Status:** RESOLVED 2026-06-30 (debt-paydown WP5) — took the comment-cross-reference path (no helper extraction): the mount-site rAF comment is now the CANONICAL 80-col-timing rationale; the post-spawn + on-active rAF sites trimmed to "rAF for the same layout-timing reason as the mount fit above." (Stale line-refs `159-162/91-94` → the three live sites are the mount fit, the post-spawn sync, and the on-active repaint.)

# wp6-project-config-store — 2026-06-18

2 MAJOR + 3 MINOR findings from `feature-review-quality` on ship commit `525b7e8` (0 CRITICAL). Backend rated exemplary; all findings are on the frontend picker's IPC boundary + two small backend nits. Auto-backlogged per drive_mode=autopilot (MAJOR + MINOR).

## SURFACE-2026-06-18-QUALITY-PICKER-IPC-NO-ERROR-HANDLING
- **File:** `src/components/picker/ProjectPicker.tsx:60-63` (mount loader) + `:69-85` (handlers)
- **Finding:** Every `await invoke(...)` in the picker assumes success. (1) The mount `useEffect` loader has no `.catch` — its comment claims "a failed load leaves the list empty," but a rejected `list_projects` (e.g. backend `ConfigError::Parse` on a malformed `projects.json`, mapped to a `String` error) throws inside the async IIFE and is silently swallowed, so corruption presents as an empty recents list rather than a surfaced error. (2) `handleOpenRecent` / `handleOpenFolder` / `handleRemove` `await invoke(...)` with no error handling, dispatched via `onClick={() => void handle...()}` — a rejected command becomes an unhandled promise rejection with no user feedback (a dead click). ESLint config does not enable type-checked rules, so `no-floating-promises` does not catch it.
- **Why it matters:** the backend's deliberate no-silent-wipe / typed-error posture is partially neutralized at the UI boundary where every failure path is dropped. Load-bearing for the Phase 2 multi-workspace shell where the picker stays mounted and errors must surface.
- **Suggested action:** add a shared error-surfacing path (toast / inline message) and `.catch` on the mount loader that realizes the documented graceful-empty fallback while distinguishing it from a real error. Fold into a `/feature-refactor` pass or the Phase 2 picker work.
- **Priority:** medium
- **Status:** RESOLVED — implemented at M4 WP2 (P4.1/P4.2), confirmed at debt-paydown WP3 (2026-06-30). `ProjectPicker.tsx` now has a `PickerToast {kind:"info"|"error"}` surface, a pure `mapIpcError` helper (`picker/ipcError.ts`, unit-tested), a `.catch` on the mount loader distinguishing graceful-empty (backend returns `[]` for an absent file, no toast) from a real error (malformed `projects.json` → error toast), and try/catch on all three mutation handlers (`record_open`/`add_project`/`remove_project`). WP3 verified the fix is fully in place — the WBS task was written on the stale premise it was still open.

## SURFACE-2026-06-18-QUALITY-PICKER-ADD-NO-REFRESH
- **File:** `src/components/picker/ProjectPicker.tsx:78-79`
- **Finding:** `handleOpenFolder` calls `add_project` then `onOpen(picked)` but never refreshes local `recents` state (unlike `handleRemove`, which does). A newly added folder doesn't appear in the list until the picker remounts. State-sync asymmetry between the two mutation paths.
- **Why it matters:** minor in Phase 1 (picker likely unmounts on open), but a reader will trip over the asymmetry when the picker stays mounted in the multi-workspace shell.
- **Priority:** low
- **Status:** RESOLVED 2026-06-30 (debt-paydown WP3) — `handleOpenFolder` now consumes `add_project`'s returned `Project` record and prepend-and-dedups it into local `recents` (newly-added/re-added path moves to front, matching the backend's most-recently-opened-first order), restoring symmetry with `handleRemove`.

## SURFACE-2026-06-18-QUALITY-CMD-ADD-RECORD-IDENTICAL
- **File:** `src-tauri/src/config_store/commands.rs:42-55`
- **Finding:** `add_project` and `record_open` have byte-identical bodies (both delegate to `add_or_touch(&dir, ..., now_ms())`). The distinction is purely nominal at the IPC surface.
- **Why it matters:** harmless and arguably intentional for frontend readability, but two identical implementations invite drift (a future maintainer "fixes" one, not the other). A one-line doc note that they are deliberately aliased — or collapsing to one command — would prevent it.
- **Priority:** low
- **Status:** RESOLVED 2026-06-30 (debt-paydown WP3) — kept the two distinct IPC commands (the call-site names document intent: `add_project` from "Open Folder…", `record_open` from clicking a recent) and added a doc note on `add_project` stating the alias is deliberate + that the single point of truth is `add_or_touch` (split there if a per-entry-point contract ever diverges, not by editing one wrapper). `record_open`'s doc cross-references it.

## SURFACE-2026-06-18-QUALITY-NOW-MS-EPOCH-SENTINEL
- **File:** `src-tauri/src/config_store/commands.rs:28-33`
- **Finding:** `now_ms()` swallows a pre-1970 `SystemTime` error with `.unwrap_or(0)`. A timestamp of `0` would silently sort that record last forever rather than surfacing the anomaly — `0` collides with the recency-ordering invariant if it ever fires.
- **Why it matters:** trivial in practice (clock-before-epoch is not real); flagged only because `0` is a sentinel colliding with an invariant.
- **Priority:** low
- **Status:** RESOLVED 2026-06-30 (debt-paydown WP3) — `now_ms` no longer falls back to `0`. On the (unreal) pre-epoch-clock error it logs the clock fault and stamps `i64::MAX`, so a just-opened project sorts FIRST (matching the user's intent) instead of silently sinking to the bottom of recents. The sentinel/invariant collision is gone and the anomaly is surfaced, not swallowed.

# wp5-frontend-ui-prototype — 2026-06-18

3 MINOR findings from `feature-review-quality` on ship commit `777c0b8` (0 CRITICAL, 0 MAJOR). All cosmetic stylesheet/intent-clarity nits, zero correctness impact. Auto-backlogged per drive_mode=autopilot.

## SURFACE-2026-06-18-QUALITY-WP5-FILMSTRIP-FLEX-SHRINK
- **File:** `src/App.css:88`
- **Finding:** `.filmstrip` declares `flex-shrink: 0`, but its parent `.app-shell` is `display: grid` (not flex) — the property is inert. The grid row sizing (`grid-template-rows: auto 1fr`) is what reserves the strip.
- **Why it matters:** dead/misleading style declaration in a substrate file Phase 2 (WP16 filmstrip) will build on; a reader may infer a flex layout that doesn't exist.
- **Priority:** low
- **Status:** RESOLVED 2026-06-30 (debt-paydown WP1) — inert `flex-shrink: 0` removed from `.filmstrip` (parent `.app-shell` is `display: grid`; the `auto 1fr` row sizing reserves the strip).

## SURFACE-2026-06-18-QUALITY-WP5-XTERMPANE-EFFECT-DEP
- **File:** `src/components/workspace/XtermPane.tsx:60`
- **Finding:** the xterm mount `useEffect` keys on `[workspaceId]`, but CenterStage uses `key={ws.id}` so a changed id already forces a fresh component instance. `[]` would express once-per-mount intent more honestly.
- **Why it matters:** slight intent-obscuring; a maintainer may think id-change-driven re-mount is a supported path when component identity already guarantees it.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-06-18-QUALITY-WP5-GLOBAL-H1-RULE
- **File:** `src/components/picker/ProjectPicker.tsx:91` (+ `src/App.css` global `h1`)
- **Finding:** the global `h1 { text-align: center }` rule now has a single consumer (the picker heading); reads as leftover scaffold generality.
- **Why it matters:** trivial; cosmetic clarity of the stylesheet's global section.
- **Priority:** low
- **Status:** pending

# wp1-tauri-scaffold — 2026-06-16

> **ALL RESOLVED 2026-06-17 (refactor pass).** All 9 findings fixed. See `workflow/backlog.md` → wp1 pointer for the per-fix summary.

## SURFACE-2026-06-16-QUALITY-WP1-HTML-TITLE
- **File:** `index.html:7`
- **Severity:** MAJOR
- **Finding:** `<title>Tauri + React + Typescript</title>` is the scaffold default; Tauri's window title overrides for the native window but the HTML title leaks into devtools / web inspector.
- **Fix shape:** one-line edit to `<title>Claudesk</title>`.
- **Priority:** medium
- **Status:** pending

## SURFACE-2026-06-16-QUALITY-WP1-README-SCAFFOLD-TEXT
- **File:** `README.md`
- **Severity:** MAJOR
- **Finding:** README contains pure scaffold-default text asserting the project is a "template."
- **Fix shape:** replace with a single-line `# Claudesk` pointer to `CLAUDE.md` and `docs/product/vision.md`. (Full README lands in Phase 4 WP34.)
- **Priority:** medium
- **Status:** pending

## SURFACE-2026-06-16-QUALITY-WP1-WINDOW-SIZE
- **File:** `src-tauri/tauri.conf.json:14-18`
- **Severity:** MAJOR
- **Finding:** Default window size 800x600 is too small for the product vision's Mission-Control-style center-stage + filmstrip layout, even at N=1.
- **Fix shape:** bump to ~1280x800 (or similar). Real default will be re-tuned in WP5/Phase 1 polish; this fixes the dev-loop UX in the interim.
- **Priority:** medium
- **Status:** pending

## SURFACE-2026-06-16-QUALITY-WP1-DEMO-GREET-COMMAND
- **File:** `src-tauri/src/lib.rs:2-5`
- **Severity:** MAJOR
- **Finding:** The scaffold's `greet` Tauri command + `invoke_handler!` registration is dead code reachable from any frontend code with `@tauri-apps/api/core` access. WP7 will define the real CC-session command surface; the demo command is a permanent reachable surface the team has no plan to support.
- **Fix shape:** remove the `greet` fn and update `invoke_handler!` to `[]` (or remove the call). ~3 lines.
- **Priority:** medium
- **Status:** pending

## SURFACE-2026-06-16-QUALITY-WP1-PRETTIER-CONFIG-EMPTY
- **File:** `.prettierrc.json:1`
- **Severity:** MINOR
- **Finding:** `{}` is a no-op; future contributors can't tell whether defaults were deliberate or just unconfigured.
- **Fix shape:** add at least one explicit property documenting intent (e.g. `"trailingComma": "all"`).
- **Priority:** low
- **Status:** pending

## SURFACE-2026-06-16-QUALITY-WP1-ESLINT-CONFIG-NO-COMMENTS
- **File:** `eslint.config.js:7-37`
- **Severity:** MINOR
- **Finding:** No comment explains the flat-config layering or the `react/react-in-jsx-scope: off` + `react/jsx-uses-react: off` new-JSX-transform shim.
- **Fix shape:** 2-line comment block at top.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-06-16-QUALITY-WP1-SMOKE-VALUE-MISMATCH
- **File:** `src/__tests__/smoke.test.ts:5` and `src-tauri/src/lib.rs:20`
- **Severity:** MINOR
- **Finding:** Vitest smoke uses `1+1`, Rust smoke uses `2+2`. Cosmetic inconsistency.
- **Fix shape:** pick one value pair for both.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-06-16-QUALITY-WP1-PNPM-WORKSPACE-COMMENT
- **File:** `pnpm-workspace.yaml:1-2`
- **Severity:** MINOR
- **Finding:** `allowBuilds: { esbuild: true }` ships without comment; the pnpm-v11 migration story (auto-generated stub with literal `set this to true or false` placeholder) is non-obvious.
- **Fix shape:** one-line comment at top citing pnpm v11 migration.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-06-16-QUALITY-WP1-VITE-CONFIG-PROCESS
- **File:** `vite.config.ts:4`
- **Severity:** MINOR
- **Finding:** `// @ts-expect-error process is a nodejs global` is scaffold-default; the proper fix is `import { env } from "node:process"`. The directive will silently bit-rot if `process` ever gets typed.
- **Fix shape:** replace the `@ts-expect-error` line with the proper import.
- **Priority:** low
- **Status:** pending

# wp2-cc-pty-probe — 2026-06-16

> **RESOLVED 2026-06-17 (refactor pass):** 3 fixed (shutdown-divergence comment, reader-thread EOF lifecycle comment, stale `**State:**` line). 1 DISMISSED: `ReaderSink` enum — explicit inline readers are clearer for reference/`examples/` code; the EOF invariant is now single-sourced by the lifecycle comment.

## SURFACE-2026-06-16-QUALITY-WP2-SHUTDOWN-DUPLICATION
- **File:** `src-tauri/examples/cc_pty_probe.rs:169` and `:309`
- **Severity:** MINOR
- **Finding:** The 6-line "CC requires Ctrl+D twice" cleanup block is duplicated verbatim between `run_inject` and `run_resize`.
- **Fix shape:** extract a `shutdown_cc(writer, child)` helper so the "send-twice with 300ms gap then drop writer" pattern is grep-able as one canonical reference for WP7.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-06-16-QUALITY-WP2-READER-THREAD-LIFECYCLE-COMMENT
- **File:** `src-tauri/examples/cc_pty_probe.rs:79, 133, 189, 257`
- **Severity:** MINOR
- **Finding:** Reader threads spawn but are inconsistently joined (`_reader_thread` dropped in 3 modes; `drain.join()` used in `run_exit_via`). Lifecycle invariant ("reader thread terminates on PTY EOF when child exits and drops the slave") is load-bearing but not documented in the code.
- **Fix shape:** add a one-line comment at the first reader spawn explaining the EOF-termination invariant.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-06-16-QUALITY-WP2-WIP-STATE-MARKER-DRIFT
- **File:** `workflow/wip/wp2-cc-pty-probe.md:3` vs `:10-11`
- **Severity:** MINOR
- **Finding:** Frontmatter `state: ship (complete)` but body `**State:** plan (complete)` — staleness between the two markers. Frontmatter is canonical per project convention; body line is stale.
- **Fix shape:** drop the redundant body `**State:** ...` line; rely on frontmatter as the single source. (Will be archived by feature-finalize regardless.)
- **Priority:** low
- **Status:** pending

## SURFACE-2026-06-16-QUALITY-WP2-READER-SINK-ENUM
- **File:** `src-tauri/examples/cc_pty_probe.rs:78, 131, 188, 255`
- **Severity:** MINOR
- **Finding:** Four near-identical reader-thread bodies (Stdout / Channel / CountBytes sinks) — consolidating into a `ReaderSink` enum would single-source the "reader thread pattern" question for WP7 readers.
- **Fix shape:** add `enum ReaderSink { Stdout, Channel(mpsc::Sender<Vec<u8>>), CountBytes }` + one `spawn_reader(reader, sink)` helper.
- **Priority:** low
- **Status:** pending

# wp3-sublime-cli-probe — 2026-06-16

> **ALL RESOLVED 2026-06-17 (refactor pass).** All 6 findings fixed (2 MAJOR + 4 MINOR). See `workflow/backlog.md` → wp3 pointer for the per-fix summary.

## SURFACE-2026-06-16-QUALITY-WP3-STUCK-SURFACED-LEAF
- **File:** `workflow/wip/wp3-sublime-cli-probe.md` (Work Tree, leaf below P1.4)
- **Severity:** MAJOR
- **Finding:** Work Tree contains an unchecked leaf `- [ ] SURFACED — ST 'osascript activate' …` under Phase 1, but Phase 1's parent is `[x]`. Violates the global "parent's checkbox may only be `[x]` when ALL children are `[x]`" invariant. The discovery is correctly logged in §Discoveries and the feedback memory exists; the leaf should either be marked `[x]` (closed via the memory artifact) or removed from the tree (SURFACED belongs in §Discoveries, not as a perpetually-open child).
- **Fix shape:** delete the leaf line from the Work Tree (the §Discoveries entry already captures the lesson; no work-item action remains).
- **Priority:** medium
- **Status:** pending

## SURFACE-2026-06-16-QUALITY-WP3-OBSERVATION-VS-INFERENCE-FLATTENING
- **File:** `workflow/wip/wp3-sublime-cli-probe.md` (Invocation matrix tables, T8/T9/T11 rows)
- **Severity:** MAJOR
- **Finding:** T8/T9/T11 rows present inference-grade data (footnoted inconclusive, race-affected, or derived from `--help`) in the same shape as observation-grade rows (T7, T10). A future contributor cannot tell at-a-glance which rows are runtime-reproducible vs. documentation-derived; this asymmetry is load-bearing because the §Decision relies on the matrix.
- **Fix shape:** add a column "Source" with values `observed | inferred` (or a leading row-prefix marker like ⚠️/†), and a one-line legend above the table.
- **Priority:** medium
- **Status:** pending

## SURFACE-2026-06-16-QUALITY-WP3-STATE-PROSE-DRIFT
- **File:** `workflow/wip/wp3-sublime-cli-probe.md:15`
- **Severity:** MINOR
- **Finding:** Frontmatter says `state: ship (complete)` but the H2-equivalent prose line on line 15 says `**State:** plan (complete)`. Dual-source state representations drift; the prose line should mirror frontmatter or be removed.
- **Fix shape:** remove the duplicated `**State:**` prose line (frontmatter is canonical), or align it.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-06-16-QUALITY-WP3-FOOTNOTE-MARKERS
- **File:** `workflow/wip/wp3-sublime-cli-probe.md` (Invocation matrix footnotes)
- **Severity:** MINOR
- **Finding:** Superscript ¹/² footnote markers force readers to scroll; table headers don't carry the numbers. Grep-unfriendly.
- **Fix shape:** use `[note 1]` style or inline parenthetical at the row, or move the inconclusive notes into the "Notes" column directly.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-06-16-QUALITY-WP3-UNVISITED-STALE
- **File:** `workflow/wip/wp3-sublime-cli-probe.md:50` (Current Node block)
- **Severity:** MINOR
- **Finding:** `Unvisited:` lists `ship → review-quality → finalize` but ship is already complete (per frontmatter + `ship_commit: cc72c4d`). The sequence-of-execution field wasn't refreshed when the state advanced. Per SURFACE-2026-05-06-FINALIZE-BEFORE-SHIP-ORDER-FLIP rationale, stale `Unvisited:` is a small confabulation channel for downstream skills.
- **Fix shape:** finalize will overwrite this anyway; the discipline of updating `Unvisited:` on every state exit is the load-bearing rule worth noting.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-06-16-QUALITY-WP3-RUNTIMES-TIMEOUT-FORMULA
- **File:** `runtimes.md` (multiple entries)
- **Severity:** MINOR
- **Finding:** All four sub-3s entries (`pnpm install`, `pnpm test`, `pnpm lint`, `cargo test`) record `**Use timeout:** 120000` instead of the formula's `ceil(observed * 1.5 + 60) * 1000` (which would yield ~62000–65000 ms). The 120000 matches the Bash tool's default; the registry is recording a constant rather than computing from data.
- **Fix shape:** either apply the formula consistently to all entries, or document the override policy (e.g., "clamp small values to a 120s safety floor") in `~/.claude/CLAUDE.md`'s registry rules.
- **Priority:** low
- **Status:** pending

# wp4-thumbnail-rendering-probe — 2026-06-17

> **ALL RESOLVED 2026-06-17 (refactor pass).** Both MINOR findings fixed. See `workflow/backlog.md` → wp4 pointer for the per-fix summary.

## SURFACE-2026-06-17-QUALITY-WP4-CENTER-SERIALIZER-COMMENT
- **Severity:** MINOR (low)
- **Location:** src/probe/Harness.tsx (center terminal build, ~L84-101)
- **Finding:** The center (active) terminal is built without a `SerializeAddon` while every background terminal loads one. This is correct (the center is rendered normally, never serialized into a tile) but silent — a one-line comment ("center renders normally; no serializer needed") would save the next reader a double-take.
- **Suggested action:** Add the clarifying comment. Throwaway-code polish; trivial.

## SURFACE-2026-06-17-QUALITY-WP4-REPLAY-VOID-DURATION
- **Severity:** MINOR (low)
- **Location:** src/probe/replay.ts (~L99-103)
- **Finding:** The `if (events.length === 0) return {stop}` early-out followed by `void duration;` with a "touch duration" comment reads as leftover scaffolding rather than load-bearing logic — minor dead-code smell in otherwise clean durable code.
- **Suggested action:** Drop the `void duration;` no-op (and its comment), or fold the empty-events guard more cleanly. `replay.ts` is the durable piece Phase 2 may lift, so worth a quick tidy then.

(Note: a third MINOR — Phase 3 Work Tree header stale at NOT-STARTED — was RESOLVED in-place at review time, not backlogged.)

# m2-wp2-editor-shell — 2026-06-19

2 MAJOR + 3 MINOR findings from `feature-review-quality` on ship commit `a84f3e9` (0 CRITICAL). Feature rated "advances the codebase rather than accruing debt." Auto-backlogged per drive_mode=autopilot (MAJOR → Case B, MINOR → low). The two MAJORs are the load-bearing ones (backend root-trust seam + a doc/behavior security-invariant mismatch), both flagged as Phase-2-hardening candidates, neither refactor-blocking.

## SURFACE-2026-06-19-QUALITY-WP2-RESOLVE-WITHIN-LEAF-SYMLINK
- **File:** `src-tauri/src/editor_fs/mod.rs:45-90` (`resolve_within`)
- **Finding:** Canonicalizes only the target's *parent* and re-attaches the leaf un-canonicalized; a symlink whose *leaf* points outside the workspace root is NOT rejected (read/write follow it), yet the module doc (lines 17-22, 50-52) claims "a symlink inside root pointing outside is also rejected." Doc overclaims an invariant the code doesn't fully enforce.
- **Why it matters:** A future reader trusts "invariant not convention" and won't re-audit. Low exploitability (single-user local tool, user picks in-project files) but the doc/behavior mismatch is the debt.
- **Suggested action:** Canonicalize the resolved target when it exists and re-check `starts_with(root_canon)`; OR downgrade the doc claim to match. Pairs with the Phase-2 backend-hardening item below.
- **Priority:** medium
- **Status:** PARTIAL (D2, debt-paydown WP5, operator decision 2026-06-30) — DOC downgraded now, HARDENING deferred. The `editor_fs` module header + `resolve_within` doc were narrowed to state the actual guarantee: a non-leaf (directory-component) symlink escaping root IS rejected (parent canonicalize), but a LEAF symlink is NOT followed-and-validated; the over-claim is gone. The actual fix (canonicalize the full target when it exists) stays **Deferred** to a future hardening pass (anchored here), NOT done this sweep.

## SURFACE-2026-06-19-QUALITY-WP2-BACKEND-TRUSTS-FRONTEND-ROOT
- **File:** `src-tauri/src/editor_fs/commands.rs:18-26` (`read_file`/`write_file`)
- **Finding:** Both commands take `root: String` straight from the frontend with no app-side derivation, unlike `config_store`'s commands which resolve `app_data_dir()` server-side. The "confined to the open project" guarantee rests entirely on the renderer passing a correct `projectPath` — the trust boundary for the root guard lives in the webview, not the backend.
- **Why it matters:** Phase 2 (multi-workspace) multiplies the IPC callers and surface; this is the seam to tighten before more callers depend on it. Acceptable for the single-user PoC today.
- **Suggested action:** Consider having the backend validate `root` against the known project list (config_store) before honoring it, so a malformed/hostile root can't widen the guard. Pairs with the leaf-symlink item above (same module, same Phase-2 hardening pass).
- **Priority:** medium
- **Status:** PARTIAL (D2, debt-paydown WP5, operator decision 2026-06-30) — DOC stated now, HARDENING deferred. The `editor_fs/commands.rs` module doc now explicitly says `root` is frontend-supplied/-trusted (not re-validated against config_store) — acceptable for the single-user local editor where the frontend shares the trust boundary; the guard's job is to confine the *file path* to `root`, not authenticate `root`. The actual validate-`root`-against-config_store hardening stays **Deferred** to a future pass (anchored here, pairs with the leaf-symlink item above).

## SURFACE-2026-06-19-QUALITY-WP2-SAVEKEYMAP-CHURN
- **File:** `src/components/workspace/editor/EditorPanel.tsx:73-87`
- **Finding:** `doSave` depends on `save.kind` (to enable retry-after-error) → rebuilds `saveKeymap` → reconfigures the CM6 view on every save-status transition. Functionally correct (WP1 confirmed reconfigure-on-identity-change works) but the status-driven keymap churn is a non-obvious cost.
- **Suggested action:** Add a short comment, or decouple the retry path so `doSave`'s identity doesn't depend on save status. Low effort.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-06-19-QUALITY-WP2-EDITORLOAD-UNDERSCORE-PARAM
- **File:** `src/components/workspace/editor/editorLoad.ts:24`
- **Finding:** Reducer parameter named `_state` (underscore signals "unused") but it IS used in the `default` branch (`return _state`); `editorSave.ts:26` correctly names the same param `state`. Inconsistent within the same feature.
- **Suggested action:** Rename `_state` → `state` in `editorLoad.ts`.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-06-19-QUALITY-WP2-LANGUAGE-TEST-SPECULATIVE-COMMENT
- **File:** `src/components/workspace/editor/__tests__/language.test.ts:73`
- **Finding:** Test comment "json ... not wired yet (WP3 may add)" — speculative forward-guess that ages into noise.
- **Suggested action:** Drop the parenthetical; the assertion (json → plaintext) stands on its own.
- **Priority:** low
- **Status:** pending

# m2-wp3a-editor-core-editing — 2026-06-20

3 MINOR findings from `feature-review-quality` on ship commit `59cc324` (0 CRITICAL, 0 MAJOR). The feature is well-built and low-debt; findings are cosmetic comment-triplication and a benign self-flagged double-bind. Auto-backlogged per drive_mode=autopilot (MINOR).

## SURFACE-2026-06-20-QUALITY-WP3A-MOD-D-DOUBLE-BIND
- **File:** `src/components/workspace/editor/editorExtensions.ts:92,125`
- **Finding:** `Mod-d` (`selectNextOccurrence`) is bound explicitly at `Prec.highest` AND is also present in the spread `...searchKeymap`, so the binding appears twice in the same keymap.
- **Why it matters:** CM6 resolves first-match-wins so behavior is correct; the author flagged it in-line as intentional belt-and-suspenders. Mild dead weight only.
- **Suggested action:** Optionally drop the explicit `Mod-d` line (rely on searchKeymap) OR keep with the existing comment. Trivial.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-06-20-QUALITY-WP3A-MOD-R-COMMENT-OVERSELL
- **File:** `src/components/workspace/editor/editorExtensions.ts:97`
- **Finding:** `Mod-r` runs `openSearchPanel`, which opens the same panel as Cmd+F (the replace row is visible by default). The comment frames it as "the replace chord," slightly overselling a functional distinction from find.
- **Why it matters:** Behavior satisfies the operator's intent (replace fields present), but the comment could mislead a future reader into thinking Cmd+R does something Cmd+F doesn't. Trivial.
- **Suggested action:** Soften the comment, or add `replace`-focus behavior if a real distinction is wanted later.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-06-20-QUALITY-WP3A-COMMENT-TRIPLICATION
- **File:** `src/components/workspace/editor/editorExtensions.ts:1-19` + `EditorPanel.tsx:97-104`
- **Finding:** The `Prec.highest` / `@uiw reconfigures on array-identity` rationale is restated across three prose blocks (builder header, `coreKeymap` doc, EditorPanel `useMemo`).
- **Why it matters:** Accurate and WHY-focused, but a future edit to the precedence story must touch three places — a mild maintenance smell.
- **Suggested action:** Consolidate to one canonical note and reference it from the others.
- **Priority:** low
- **Status:** RESOLVED 2026-06-30 (debt-paydown WP5) — the `languageOverrideId` doc in `editorExtensions.ts` (which already carries the fullest array-identity-reconfigure rationale + the `cm6-dont-copy-compartment-by-analogy` memory link) is the canonical anchor; the `EditorPanel.tsx` `useMemo` comment trimmed to a back-reference to it. The builder header keeps its `Prec.highest`-specific note (a different axis). 784 tests green.

# m2-wp3c-editor-split-panes — 2026-06-20

3 MINOR findings from `feature-review-quality` on ship commit `b72ed30` (0 CRITICAL, 0 MAJOR). Reviewer rated the feature well-built, low-debt, fitting the codebase grain (pure minimal pane reducer, panel-level shared-document boundary respected end-to-end, proportionate tests asserting reference identity for no-ops). All three are cosmetic comment/duplication nits. Auto-backlogged per drive_mode=autopilot.

## SURFACE-2026-06-20-QUALITY-WP3C-MIDDLE-CLOSE-INDEX-COMMENT
- **File:** `src/components/workspace/editor/editorPanes.ts:69-72` (the `close` focus-reassign)
- **Finding:** The middle-close focus-reassign `panes[Math.min(idx, panes.length - 1)]` is correct and tested, but relies on `idx` being the PRE-filter index while `panes` is the POST-filter array — so after filtering, `idx` points at the element that slid up into the closed slot. The current comment ("prefer the pane that took its slot") states the intent but not the index-shift mechanism.
- **Why it matters:** the off-by-one surface here is exactly where a future edit could silently break focus reassignment; the test guards the behavior but not the reasoning. A one-line comment naming the index-shift assumption lowers future-reader cost.
- **Suggested action:** Add a one-line comment: "idx is the pre-filter index; after filtering it points at the element that slid up into the closed slot." No code change.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-06-20-QUALITY-WP3C-IS-SPLIT-PREDICATE-DUP
- **File:** `src/components/workspace/editor/EditorPanel.tsx` (`splitable = panes.panes.length > 1`) vs `src/App.css` (`.editor-panes:has(.editor-pane + .editor-pane)`)
- **Finding:** The "is-split" condition is encoded in two languages — the JS `splitable` const (gates the close ✕) and the CSS `:has(.editor-pane + .editor-pane)` selector (gates the active-pane accent). They agree today but are a drift pair if the split-threshold ever changes.
- **Why it matters:** low cost now; a single source (e.g. a `data-split` attribute on the `.editor-panes` container that the CSS keys off) would collapse the duplication.
- **Suggested action:** Optionally set `data-split={splitable}` on `.editor-panes` and change the CSS to `.editor-panes[data-split="true"] .editor-pane[data-active-pane="true"]::before`. Low priority / discipline only.
- **Priority:** low
- **Status:** RESOLVED 2026-06-30 (debt-paydown WP6, Theme H) — single-sourced the `splitable` predicate: `data-split={splitable}` set on `.editor-split-panes` (the class was renamed from `.editor-panes` since this finding), CSS now keys off `[data-split="true"] .editor-split-pane.is-active::before` instead of a re-derived `:has(.editor-split-pane + .editor-split-pane)` selector. The >1-pane threshold lives in one place (EditorSplit). (Note: the finding's `.editor-pane`/`data-active-pane` names had drifted — `data-active-pane` was deleted in WP1; the live classes are `.editor-split-pane`/`.is-active`.)

## SURFACE-2026-06-20-QUALITY-WP3C-REDUNDANT-JSX-COMMENT
- **File:** `src/components/workspace/editor/EditorPanel.tsx:295` (the `.editor-panes` inline comment)
- **Finding:** The inline JSX comment restates the shared-doc rationale ("vertical stack of panes… each pane is a viewport onto the shared doc") that is already stated authoritatively in the file header and in `editorPanes.ts` — WHAT-not-WHY redundancy.
- **Why it matters:** minor comment redundancy; the canonical explanation lives in two better places.
- **Suggested action:** Trim the inline comment to a brief pointer or drop it. No code change.
- **Priority:** low
- **Status:** pending

# m2-wp4-git-diff-viewer — 2026-06-20

4 MINOR findings from `feature-review-quality` on ship commit `4e2d742` (0 CRITICAL, 0 MAJOR). Reviewer verdict: well-built, advances the codebase, no refactor warranted. Findings are doc-comment drift left by the PB.7 removal sweep (2) + dead diff-option config (1) + a frontend clarity nit (1). All low priority. Auto-backlogged per drive_mode=autopilot.

## SURFACE-2026-06-20-QUALITY-WP4-STALE-FILE-BASE-DOCLINK
- **File:** `src-tauri/src/git_diff/mod.rs:49` (`ChangedFile.path` rustdoc)
- **Finding:** rustdoc links to `[file_base_core]`, which was deleted in PB.7. Dangling intra-doc link (rustdoc::broken-intra-doc-links isn't in the clippy gate, so it slipped the green baseline).
- **Why it matters:** future reader follows a link to a function that no longer exists; the WP's own removal-sweep discipline missed its own doc reference.
- **Suggested action:** drop the `[file_base_core]` reference from the doc-comment (the path is the key passed to `git_file_hunks` + `read_file` now).
- **Priority:** low
- **Status:** RESOLVED (already corrected in place; confirmed at debt-paydown WP5, 2026-06-30) — STALE PREMISE: `git_diff/mod.rs`'s `ChangedFile.path` rustdoc already links `[file_hunks_core]` (no `file_base_core` anywhere in the tree); `rustdoc -D broken_intra_doc_links` clean. No edit.

## SURFACE-2026-06-20-QUALITY-WP4-WRONG-DIFF-API-COMMENT
- **File:** `src-tauri/src/git_diff/mod.rs:327` (`file_hunks_core` doc-comment)
- **Finding:** doc describes the unstaged path as `diff_tree_to_workdir_with_index`, but the code (line ~352) calls `diff_index_to_workdir` (working-tree-vs-index). Different diff semantics; the comment names the wrong API on the subtle staged/unstaged split.
- **Why it matters:** a maintainer reasoning about staged/unstaged correctness from the comment would be misled — and that split is the trickiest part of the module.
- **Suggested action:** correct the comment to `diff_index_to_workdir` (or, if vs-HEAD-merged was actually intended, change the code — but the tests pin the current `diff_index_to_workdir` behavior, so fix the comment).
- **Priority:** low
- **Status:** RESOLVED (already corrected in place; confirmed at debt-paydown WP5, 2026-06-30) — STALE PREMISE: `file_hunks_core`'s doc already names `diff_index_to_workdir` for the unstaged path (no `diff_tree_to_workdir_with_index` anywhere); matches the code. No edit.

## SURFACE-2026-06-20-QUALITY-WP4-DEAD-UNTRACKED-OPTS-STAGED
- **File:** `src-tauri/src/git_diff/mod.rs:338-344` (`file_hunks_core` DiffOptions)
- **Finding:** `include_untracked`/`recurse_untracked_dirs`/`show_untracked_content` are set on the shared `opts` used by both branches, but they're only meaningful on the unstaged `diff_index_to_workdir` path — the staged `diff_tree_to_index` branch can never see an untracked file. Harmless dead config on the staged path.
- **Why it matters:** minor confusion cost; the shared-`opts` construction obscures that the two branches want different options.
- **Suggested action:** build the untracked options only on the unstaged branch (or note inline that they're no-ops on the staged path).
- **Priority:** low
- **Status:** pending

## SURFACE-2026-06-20-QUALITY-WP4-COMMIT-DIFF-GATE-TERNARIES
- **File:** `src/components/workspace/diff/DiffPanel.tsx:368-379` (commit-diff render gate)
- **Finding:** the "is this commit diff for the currently-selected commit?" gate is 3 sibling JSX ternaries (`commitDiff?.sha === selectedSha` / `!== selectedSha` + error branch) over the same two values.
- **Why it matters:** low-effort clarity win in the one part of the component with non-obvious async-staleness handling.
- **Suggested action:** derive a single `commitReady`/`commitStale` flag above the return; collapse the three branches to loading-vs-loaded-vs-error.
- **Priority:** low
- **Status:** pending

# m2-wp4-diff-viewer-polish — 2026-06-20

Reviewer (code-quality-reviewer on ship commit 5051bd4): 0 CRITICAL, 0 MAJOR, 3 MINOR. Verdict: well-built, appropriately-scoped polish; no refactor warranted. All three are micro-readability / posture notes.

## SURFACE-2026-06-20-QUALITY-WP4POLISH-DOUBLE-PREDICATE
- **Source:** feature:review-quality (m2-wp4-diff-viewer-polish)
- **Type:** tech-debt
- **Summary:** In `DiffPanel.tsx` `toggleAllCollapsed`, `allCollapsed(prev, visibleKeys)` is recomputed inside the setter while `everyCollapsed` already holds an independent evaluation of the same predicate one line above. Both correct (the setter must read fresh `prev`), but the two call sites could drift if someone edits one predicate.
- **Suggested action:** Optional — leave as-is (the in-setter fresh-`prev` read is intentional), or add a one-line comment noting the deliberate duplication.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-06-20-QUALITY-WP4POLISH-USEMEMO-DEP
- **Source:** feature:review-quality (m2-wp4-diff-viewer-polish)
- **Type:** tech-debt
- **Summary:** `visibleKeys` useMemo deps on the whole `list` reducer state object rather than `list.kind`/`list.files`. Correct (listReducer returns a new object per dispatch) but re-derives on list-state transitions (idle→loading) that don't change the key set.
- **Suggested action:** Optional micro-opt — narrow the dep to `list.kind` + `list.files`. Negligible perf impact.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-06-20-QUALITY-WP4POLISH-STICKY-ZINDEX-COUPLING
- **Source:** feature:review-quality (m2-wp4-diff-viewer-polish)
- **Type:** tech-debt
- **Summary:** The whole-commits-sticky layout relies on z-index ordering (2 vs 2 vs 1) across `.diff-commits` / `.diff-commit-banner` / `.diff-file-header`, all pinning at `top:0` in `.diff-scroll`. No mechanical guard (no CSS/visual-regression harness per repo posture) — a future top/z-index edit could silently restack. Comments document the coupling.
- **Context:** Inherent to UI polish in a repo whose posture is pure-fn vitest + live operator verify-human; not a defect, a fragility note.
- **Suggested action:** None required. If a visual-regression harness is ever added (Phase 4 polish?), pin this invariant.
- **Priority:** low
- **Status:** pending

# m2-wp5-right-panel-host — 2026-06-20

1 MAJOR + 2 MINOR findings from `feature-review-quality` on ship commit `4546ffb` (0 CRITICAL). Reviewer: well-built refactor-plus-feature — faithful Workspace→RightPanelHost extraction, root-cause item-7 resolver fix with targeted regression guards, standout cross-predicate chord-exclusivity test, above-average chord-ownership doc discipline. Auto-backlogged per drive_mode=autopilot.

## SURFACE-2026-06-20-QUALITY-WP5-TERMINAL-SEAM-UNTESTED
- **File:** `src/components/workspace/panelHost.ts:34-40` (`selectPanel` terminal guard) + `src/components/workspace/RightPanelHost.tsx` (JSX renders only editor + diff slots)
- **Finding:** The `"terminal"` panel is reachable from `panelForChord` (⌘⇧T → `"terminal"`) but swallowed by `selectPanel`'s static `!AVAILABLE_PANELS.includes("terminal")` guard (always-true today). When WP9 adds `"terminal"` to `AVAILABLE_PANELS`, the guard flips and `RightPanelHost` will set `panel="terminal"` — but the JSX renders only editor + diff slots, so the right half goes **blank**. No test pins the "what renders when terminal is selected" side, so the regression lands silently at WP9.
- **Why it matters:** a reserved-but-unreachable path that flips reachable on a one-line future edit, with no test guarding the slot-rendering side, is the latent gap that bites the downstream WP. *(Not a WP5 defect — ⌘⇧T correctly no-ops today; this is a WP9-handoff guard.)*
- **Suggested action:** WP9, when enabling terminal: add the terminal slot to RightPanelHost's JSX in the SAME change that adds `"terminal"` to `AVAILABLE_PANELS`, and add a test that selecting `"terminal"` renders the terminal slot (not a blank). Optionally, until then, add a render-time guard/fallback in RightPanelHost (if `panel` has no slot, fall back to editor) + a test. Cheapest pickup: a one-line note in `panelHost.ts` AVAILABLE_PANELS pointing WP9 at the JSX-slot coupling.
- **Priority:** medium
- **Status:** pending

## SURFACE-2026-06-20-QUALITY-WP5-SPLIT-LISTENER-CROSSPOINTER
- **File:** `src/components/workspace/RightPanelHost.tsx:30-36` (document+capture, ⌘⇧E/D/T) vs `src/components/workspace/SublimeToolbar.tsx:35-45` (window+bubble, ⌘⇧O)
- **Finding:** Two separate keydown listeners now exist per visible workspace with split chord-ownership (host owns the panel chords on document+capture; toolbar owns the Sublime-Text pop on window+bubble). Functionally disjoint by chord letter (no conflict — confirmed), but the partition is only discoverable by reading both files.
- **Why it matters:** low-cost clarity for a deliberately partitioned listener set; a maintainer touching one may not realize the other exists.
- **Suggested action:** a one-line comment in RightPanelHost noting "SublimeToolbar owns ⌘⇧O separately (window+bubble)". Trivial `/feature-refactor` nit.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-06-20-QUALITY-WP5-WP2-OPENBAR-STOPGAP-RELOCATED
- **File:** `src/components/workspace/RightPanelHost.tsx:38-44` (`pathInput`/`openPath` open-bar)
- **Finding:** The WP2 temporary open-file path-box was lifted verbatim into RightPanelHost and still carries its "temporary until WP6 finder" comment, now one layer from where WP6 will replace it. Correctly out of scope to remove in WP5.
- **Why it matters:** trivial; flagged only to confirm the stopgap wasn't accidentally promoted to permanent during the lift. No new debt — just relocated.
- **Suggested action:** WP6 removes it when the Cmd+P finder lands. No action now.
- **Priority:** low
- **Status:** RESOLVED 2026-06-20 — WP6 (commit fc77ad4) removed the `editor-open-bar` form + `pathInput` state from RightPanelHost (and its orphaned CSS); the Cmd+P FileFinder replaces it. The `openPath`/`setOpenPath` seam stays (now driven by the finder + diff "Open").

# m2-wp6-file-finder — 2026-06-20

3 MINOR findings from `feature-review-quality` on ship commit `fc77ad4` (0 CRITICAL, 0 MAJOR). The feature is well-built and low-debt — reviewer validated correctness (deterministic tiebreak sort, greedy subsequence matcher, async cancellation, chord exclusivity) and consistency with repo seams. All three are minor overlay/doc nits. Auto-backlogged per drive_mode=autopilot.

## SURFACE-2026-06-20-QUALITY-WP6-PANEL-CHORD-UNDER-OVERLAY
- **File:** `src/components/workspace/RightPanelHost.tsx:60-75` (the capture-phase keydown listener)
- **Finding:** While the Cmd+P finder overlay is open, a panel chord (⌘⇧E/⌘⇧D) still fires and switches the right-half panel *underneath* the still-visible overlay — the listener doesn't early-return on `finderOpen`.
- **Why it matters:** UX seam, not a correctness bug; a future reader will wonder whether interleaving panel-switch with an open overlay was intended.
- **Suggested action:** Guard panel chords on `!finderOpen` (or add a one-line note that the interleave is acceptable). Trivial.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-06-20-QUALITY-WP6-DOT-BOUNDARY-RATIONALE
- **File:** `src/components/workspace/finder/fuzzyMatch.ts:32-34` (`isBoundary`)
- **Finding:** `isBoundary` includes `.`, so the char after an extension dot earns the +8 segment-boundary bonus (e.g. `m` in `file.md`). Harmless given the "deliberately simple" ranker and current tests, but why `.` is a boundary is undocumented.
- **Why it matters:** the dot-boundary is the least obvious of the four boundary chars; a half-line of rationale would prevent a future reader second-guessing it.
- **Suggested action:** Add a one-line comment explaining the `.` inclusion (matches extension chars after a dot), or drop `.` if it ever distorts ordering. No correctness impact now.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-06-20-QUALITY-WP6-HOVER-COUPLES-KEYBOARD-CURSOR
- **File:** `src/components/workspace/finder/FileFinder.tsx:177` (`onMouseEnter`)
- **Finding:** `onMouseEnter={() => setActiveIndex(i)}` couples mouse-hover to the keyboard cursor — a mouse resting over the list can yank the active row out from under an arrow-key user.
- **Why it matters:** minor interaction nit; negligible at the 100-row cap. Mirrors the same pattern in CommandPalette (consistency), so arguably WAI.
- **Suggested action:** Optionally gate the hover-set on actual pointer movement, or leave (matches CommandPalette). Low value.
- **Priority:** low
- **Status:** pending

# m2-wp12-editor-tab-strip — 2026-06-21

_From `feature-review-quality` on ship commit `f2c86d7`. 0 CRITICAL, 0 MAJOR, 3 MINOR (all priority: low). Reviewer rated the feature well-built, low-debt, advancing the codebase; no refactor pass warranted. WP12 = editor multi-file tab strip (per-pane split-editor groups + shared document store + disk-change detection + synthetic read-only buffer hook)._

## SURFACE-2026-06-21-QUALITY-WP12-DEAD-TAB-DIRTY-FIELD
- **Severity:** MINOR (priority: low)
- **Location:** `src/components/workspace/editor/openFiles.ts:39-40, 66-68, 150-161` (+ its tests in `__tests__/openFiles.test.ts:196-227`)
- **Finding:** `OpenFile.dirty` field + the `set-dirty` event are DEAD in production. After the Phase-2S back-loop moved dirty to the shared document store, `PaneTabs.tabIsDirty` reads `isDirty(docs.byPath[path])`; nothing dispatches `set-dirty` outside its own unit test.
- **Why it matters:** a future reader will assume the tab-level `dirty` flag is load-bearing and try to keep it in sync, reintroducing the per-view dirty-tracking the shared-doc model deliberately removed.
- **Pickup:** remove the `dirty` field from `OpenFile`, the `set-dirty` event from the reducer, and the 3 `set-dirty` tests. Quick `/feature-refactor`.
- **Status:** RESOLVED 2026-06-21 (`/feature-refactor`) — deleted the `OpenFile.dirty` field, the `set-dirty` event from the reducer + its `case`, the two `dirty: false` literals (file/synthetic tab builders), and the 4-test `set-dirty` describe block + the `dirty: false` assertion lines in `openFiles.test.ts`. Header comment rewritten to point at the `editorDocs` store as the dirty source of truth. vitest 297 (was 301; −4), tsc/eslint/prettier clean.

## SURFACE-2026-06-21-QUALITY-WP12-CLOSE-GUARD-OVERWARNS-MULTIVIEW
- **Severity:** MINOR (priority: low)
- **Location:** `src/components/workspace/editor/PaneTabs.tsx:186-206` (the dirty-close guard) — needs the store's refCount, which lives in `editorDocs.DocEntry.refCount`.
- **Finding:** the dirty-close guard prompts save/discard/cancel whenever `tabIsDirty`, but when the same dirty file is open in another pane (refCount > 1) closing THIS tab loses nothing — the buffer survives in the other view. The operator is warned about changes that aren't at risk.
- **Why it matters:** a spurious "unsaved changes" modal on every multi-view tab close trains the operator to click through it reflexively, eroding the guard for the case that matters. Not a correctness bug (no data loss either way) → MINOR.
- **Pickup:** only raise the close guard when it's the LAST view of a dirty doc (dirty AND `docs.byPath[path].refCount <= 1`); a non-last view closes immediately. Needs threading refCount into `PaneTabs` (it already receives `docs`). Quick `/feature-refactor`.
- **Status:** RESOLVED 2026-06-21 (`/feature-refactor`) — `PaneTabs.requestClose` now reads `docs.byPath[path].refCount` and only raises the unsaved-changes confirm when the tab is dirty AND `refCount <= 1` (the last view); a non-last view of a dirty doc closes immediately since the buffer survives in the other pane. WHY-comment added explaining the multi-view case. All gates green (vitest 297, tsc/eslint/prettier).

## SURFACE-2026-06-21-QUALITY-WP12-INTRA-FEATURE-PHASE-TAGS
- **Severity:** MINOR (priority: low)
- **Location:** file headers of `EditorSplit.tsx` / `PaneTabs.tsx` (Phase 4/2S) / `confirmDialog.ts` (Phase 3) / `diskConflict.ts` (Phase 3) / `editorDocs.ts` (Phase 2S).
- **Finding:** intra-feature build-phase tags ("Phase 2S/3/4") are internal to this one feature's build and reference no shared roadmap; they'll read as dangling references to a future maintainer.
- **Why it matters:** trivial, but the inconsistent intra-feature phase labels age poorly; a single "WP12" prefix would be self-explanatory.
- **Pickup:** s/Phase 2S|3|4/WP12/ in the affected file-header comments. Trivial `/feature-refactor` or leave.
- **Status:** RESOLVED 2026-06-21 (`/feature-refactor`) — stripped all intra-feature `Phase 2S/3/4` build-phase tags from the comments in `EditorSplit.tsx`, `PaneTabs.tsx`, `confirmDialog.ts`, `diskConflict.ts`, and `editorDocs.ts` (the `WP12` feature prefix on the file-header lines is kept; the dangling sub-phase qualifiers are gone). No code change; tsc/eslint/prettier clean.

# m2-wp7-project-search — 2026-06-21

_From `feature-review-quality` (code-quality-reviewer) on ship commit `8a788bf`. 0 CRITICAL, 2 MAJOR, 2 MINOR. Reviewer rated the feature well-built, advancing the codebase more than it accrues debt; no refactor pass warranted. The 2 MAJORs are latent design seams for a single-user app (auto-backlogged per drive_mode=autopilot, Case B); the 2 MINORs are polish (auto-backlogged). WP7 = project-wide find/replace: Phase 2 (search → Find Results synthetic tab) + Phase 3 (project-wide Replace All)._

## SURFACE-2026-06-21-QUALITY-WP7-REPLACE-THEN-RESEARCH-TWO-WALKS
- **Severity:** MAJOR (priority: medium)
- **Location:** `src-tauri/src/project_search/mod.rs` `replace_core` + `src/components/workspace/RightPanelHost.tsx` `onReplaceConfirm`
- **Finding:** Replace All runs `project_replace` then issues a SEPARATE `project_search` to refresh the Find Results tab — two independent, unsynchronized full-tree walks with no locking between them. A file changing on disk between the two walks (CC writing in the workspace, the open editor saving) can make the refreshed tab + the `lastCounts` gate disagree with what was actually written. The `ReplaceSummary` the backend already computes + returns is discarded in favor of the second walk.
- **Why it matters:** the authoritative replace count is thrown away and reconstructed via a racy second pass. Low-probability for a single-user app, but the read-after-write-across-two-walks assumption is unrecorded.
- **Suggested action:** use the returned `ReplaceSummary` for the post-replace count surface; if a refreshed result LIST is still wanted, accept it's a best-effort re-walk (document that) OR have `project_replace` return the post-replace matches in one pass. Pairs with any future replace-scope work (the deferred per-result/per-file item).
- **Priority:** medium
- **Status:** RESOLVED 2026-06-21 (`/feature-refactor`) — documented the two walks as deliberate: the re-search IS the tab-refresh mechanism (the tab shows the post-replace result SET, not just a count), explicitly best-effort for this single-user app (the disk-change-between-walks case is the deferred-watcher's domain), and surfacing the `ReplaceSummary` count as a toast is intentionally out-of-scope-for-v1 NEW UX. Comment added in `RightPanelHost.onReplaceConfirm`. No behavior change (a summary toast would be a feature, not cleanup).

## SURFACE-2026-06-21-QUALITY-WP7-PERLINE-COUNT-VS-MULTILINE-REPLACE
- **Severity:** MAJOR (priority: medium)
- **Location:** `src-tauri/src/project_search/mod.rs:246-262` (`replace_core` match-count loop)
- **Finding:** `matches_replaced` is computed by a per-line `re.find_iter(l).count()` sum, but the actual mutation is whole-file `re.replace_all(&contents, …)`. In regex mode an operator can supply a cross-line pattern (`(?s)…`, explicit `\n`) where `replace_all` mutates spans the per-line counter never counted — so the confirm's "Replace N matches" count under-reports vs the on-disk effect. Search shares the per-line limitation (so the Find Results tab stays self-consistent with the count), but the summary count and the on-disk mutation can silently diverge once multiline regex is in play. No test/guard covers the cross-line case.
- **Why it matters:** the count the operator approves in the confirm is not guaranteed to equal what replace mutates under a multiline regex; the blast-radius number could mislead.
- **Suggested action:** either count from the `replace_all` result so count == effect, OR explicitly reject/guard multiline patterns in replace with a clear error. Tie to whichever lands first.
- **Priority:** medium
- **Status:** RESOLVED 2026-06-21 (`/feature-refactor`) — took the count-from-whole-file fix: `replace_core` now counts `re.find_iter(&contents).count()` over the SAME whole-file string `replace_all` mutates (was a per-line sum). For a line-oriented pattern this equals the per-line count (so it still agrees with search for today's queries); under a multiline `(?s)` pattern count == effect, no divergence. Pinned by a new test `replace_count_matches_whole_file_effect_under_multiline_regex` (cargo 121, +1). No behavior change for current inputs.

## SURFACE-2026-06-21-QUALITY-WP7-SYNTHETIC-FONT-NOT-LIVE
- **Severity:** MINOR (priority: low)
- **Location:** `src/components/workspace/editor/SyntheticView.tsx:60-78`
- **Finding:** `loadFontSize()` is captured once inside a `useMemo` keyed on `[onLineClick, highlights]`, so the Find Results tab only picks up the persisted zoom when those deps change (e.g. a re-search) — unlike `EditorPanel`, which reconfigures font size LIVE via the `fontSizeCompartment`. Zooming the file editor while the Find Results tab is the active view (no re-search) won't update the tab until the next search.
- **Why it matters:** small UX inconsistency vs the editor's live zoom; the WP7 verify-human fix targeted open-time parity, so it's likely acceptable, but the divergence is undocumented at the call site. (NB: the global memory `cm6-dont-copy-compartment-by-analogy` warns against reflexively adding a live compartment — so a one-shot read may be the deliberate choice; this is a doc/clarity nit, NOT a directive to add the compartment.)
- **Suggested action:** add a one-line comment noting the synthetic view reads zoom at render-time (not live, by design), or wire a live re-read if a future cycle wants the tab to track zoom. Lowest priority.
- **Priority:** low
- **Status:** RESOLVED 2026-06-21 (`/feature-refactor`) — added a comment at the `fontSizeTheme(loadFontSize())` call in `SyntheticView` explaining it's read ONCE by design (not live like EditorPanel's compartment), why (read-only result buffer; a live compartment here would be the [[cm6-dont-copy-compartment-by-analogy]] trap), and that a re-render (e.g. re-search) is when it updates. Comment-only.

## SURFACE-2026-06-21-QUALITY-WP7-PLURAL-DUP
- **Severity:** MINOR (priority: low)
- **Location:** `src/components/workspace/search/findResultsBuffer.ts:96` & `src/components/workspace/search/replaceConfirm.ts:14`
- **Finding:** The two-noun `plural()` helper (identical body, identical `"file" | "match"` union) is duplicated verbatim across both new modules.
- **Why it matters:** low-cost dedup; two copies drift independently if a third noun is ever added.
- **Suggested action:** hoist one shared `plural()` into `searchModel.ts` (where `totalMatchCount` already lives) and import it in both. Trivial `/feature-refactor`.
- **Priority:** low
- **Status:** RESOLVED 2026-06-21 (`/feature-refactor`) — hoisted to `searchModel.ts` as exported `pluralCount(n, "file"|"match")`; `findResultsBuffer.ts` + `replaceConfirm.ts` both import it; the two local copies deleted. vitest 308 still green (the existing formatter/confirm tests cover the output).

# m3-wp4-status-broadcaster — 2026-06-22

3 MINOR findings from `feature-review-quality` on ship commit `8bc2d68` (0 CRITICAL, 0 MAJOR). Reviewer rated it well-built — textbook "pure core, thin runtime shell"; every piece of logic unit-tested, the one IO-bound line (`app.emit`) isolated and acknowledged, the end-to-end test exercising real WP3 socket plumbing through the transform without a Tauri app. Honors the load-bearing conventions; documents the item-scoped-allow deviation. No refactor warranted; all cosmetic docstring drift. Auto-backlogged per drive_mode=autopilot.

## SURFACE-2026-06-22-QUALITY-WP4-MINORS
- **Files:** `src-tauri/src/status_broadcaster/commands.rs:41-47,48-53`
- **Priority:** low (all)
- **Status:** PARTIAL — #1 RESOLVED 2026-06-30 (debt-paydown WP5); #2 (`.expect` convention judgment) DISMISSED (WP3's `spawn_listener` `.expect` precedent is the accepted house style for infallible thread spawns); #3 (detached-handle WHY) folded into #1's rewrite (the new doc states there's no error channel + the guard lives at the lib.rs call site — the "may hold or detach" framing is gone).
- **Findings:**
  1. **`start_broadcaster` docstring describes a `Result`-style error contract the signature lacks** (`commands.rs:43-47`) — the doc says "errors returned as a human-readable string for the caller to surface… the only failure here is the receiver already having been taken," but the function returns `thread::JoinHandle<()>` with no error channel, and the double-start (receiver-already-taken) guard actually lives in `lib.rs`. The prose has drifted from the signature + call site. *(Fix: trim the docstring to match — the spawn either succeeds or panics via `.expect`; the receiver-take guard is documented at the lib.rs call site.)* — **RESOLVED 2026-06-30 (WP5):** trimmed the docstring to "no error channel: the spawn either succeeds or panics via `.expect`; the double-start guard (the `Receiver` can only be taken once) lives at the `lib.rs` call site."
  2. **`.expect()` on the thread spawn is a non-test panic path** (`commands.rs:48-53`) — `Builder::spawn(...).expect(...)` violates the "no unwrap outside tests" convention, though it mirrors WP3's `spawn_listener` precedent (`hook_socket/mod.rs`) and thread-spawn failure is near-impossible in practice. Borderline; flagged for convention-consistency only. *(If WP3's pattern is accepted as the house style for infallible thread spawns, dismiss.)*
  3. **Detached-handle asymmetry is undocumented** (`commands.rs:41-42`) — the docstring says the caller "may hold or detach" the `JoinHandle`, and `lib.rs` discards it (detached) while WP3's listener retains `_handle` in `HookSocketState`. The asymmetry is correct (the drain thread self-terminates on channel close, so no cleanup handle is needed) but the WHY is unstated. *(Fix: one-line note "detached — exits on channel close, no cleanup needed.")*
- **Pickup shape:** all three are trivial `/feature-refactor` doc-fix nits in one file; none changes correctness, the emit behavior, or any hand-off contract. Items 1 + 3 are pure docstring corrections; item 2 is a convention judgment call (dismiss if WP3's `.expect` precedent stands). Dismiss any via the WIP's `## Code-Quality Review` section.

# m4-wp1-n-workspace-cost-probe — 2026-06-22

2 MINOR findings from `feature-review-quality` on ship commit `9f3e0fe` (0 CRITICAL, 0 MAJOR). Reviewer rated it well-built — measures the real production tree, isolates the new unknown from the incidental backend-RAM surprise, effectively zero durable debt (the only lasting change is a one-branch dispatcher; the rest is throwaway probe code archived at finalize). Both findings are robustness/precision nits in the throwaway `measure.sh`. Auto-backlogged per drive_mode=autopilot.

## SURFACE-2026-06-22-QUALITY-WP1-MEASURE-PGREP-GUARD-DEGRADED
- **Files:** `src/probe/nworkspaces/measure.sh:33-34`
- **Priority:** low
- **Status:** pending
- **Type:** tech-debt (throwaway-code robustness)
- **Summary:** The `pgrep -fc 'claude --dangerously-skip-permissions'` N-alive sanity guard printed `?` during the actual measurement run (a shell-snapshot eval-mangling artifact of the literal pattern), so the script's one built-in "did N actually spawn?" guard silently degraded; the operator fell back to a manual `pgrep -fl` to confirm 8 live sessions.
- **Context:** The guard exists precisely so an N-workspace probe doesn't silently measure 1 live session instead of N. It didn't fail the measurement (the operator caught it), but the guard as written wasn't robust to the run environment. Throwaway probe code — slated for deletion-or-archival at finalize.
- **Suggested action:** If the probe is ever re-run (rather than archived), make the count robust — e.g. capture PIDs into a var first (`pids=$(pgrep -f dangerously-skip-permissions); echo "$pids" | grep -c .`) rather than `pgrep -fc` with a pattern that the eval wrapper can mangle. Likely moot once the probe is archived.
- **Pickup shape:** trivial; only relevant if the probe is resurrected. Dismiss via the WIP's `## Code-Quality Review` section.

## SURFACE-2026-06-22-QUALITY-WP1-MEASURE-PERCENTILE-OFFBYONE
- **Files:** `src/probe/nworkspaces/measure.sh:75` (also the same in `src/probe/cm6/measure.sh`)
- **Priority:** low
- **Status:** pending
- **Type:** tech-debt (precision nit, inherited from baseline)
- **Summary:** Percentile indexing `a[int(n*0.5)]` / `a[int(n*0.95)]` is the lower-median truncation, not interpolated — a classic off-by-one vs a 1-based interpolated percentile. Copied verbatim from `cm6/measure.sh`.
- **Context:** With 110+ samples the error is sub-sample and immaterial to a threshold (<20%) decision, and matching the established `cm6/measure.sh` baseline is the right call for cross-probe comparability. Flagged for completeness only.
- **Suggested action:** None recommended (matching the baseline is intentional). If a future probe wants exact percentiles, fix both `measure.sh` copies together. Throwaway code.
- **Pickup shape:** no action; informational. Dismiss via the WIP's `## Code-Quality Review` section.

# m4-wp2-n1-lift — 2026-06-23

3 MINOR findings from `feature-review-quality` on ship commit `b48ccce` (0 CRITICAL, 0 MAJOR). Reviewer rated it well-built + scope-disciplined; the `kill_all` parallelization was the standout (sound ownership reasoning + deterministic timing test). All 3 are low-effort polish in the new picker-overlay code. Auto-backlogged per drive_mode=autopilot.

## SURFACE-2026-06-23-QUALITY-WP2-OVERLAY-ESC-PREVENTDEFAULT
- **File:** `src/components/picker/PickerOverlay.tsx:28-37`
- **Finding:** the document-level Esc handler calls `preventDefault()` unconditionally → suppresses the picker search input's native Esc-to-clear, and is a latent conflict if another document Esc consumer (command palette / finder share the `command-palette-backdrop` shell) is ever co-mounted.
- **Suggested action:** scope the Esc handling (only preventDefault when the overlay is the topmost consumer, or only when Esc isn't being used to clear the focused input).
- **Priority:** low
- **Status:** pending

## SURFACE-2026-06-23-QUALITY-WP2-TOAST-SINGLE-SLOT-MULTIPLEX
- **File:** `src/components/picker/ProjectPicker.tsx:131-149`
- **Finding:** the single `toast` slot multiplexes two independent signals (benign `info` prune-note vs surfaced `error` IPC failure) — a transient prune note can be clobbered the instant a mutation fails (or vice versa).
- **Suggested action:** if it bites, split into separate info/error slots (or a small queue). Acceptable for WP2 scope.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-06-23-QUALITY-WP2-OVERLAY-DEAD-BACKDROPREF
- **File:** `src/components/picker/PickerOverlay.tsx:24,41`
- **Finding:** `backdropRef` is created + attached to the backdrop div but never read (backdrop-close uses `e.target === e.currentTarget`). Dead code implying an abandoned approach.
- **Suggested action:** remove the unused ref.
- **Priority:** low
- **Status:** RESOLVED 2026-06-30 (debt-paydown WP1) — `backdropRef` (decl + `ref=` attr) removed; the now-unused `useRef` import dropped. ESLint + 780 tests green.

# m4-wp3-filmstrip — 2026-06-23

3 MINOR findings (0 CRITICAL, 0 MAJOR) from `feature-review-quality` on ship `920678a`.

## SURFACE-2026-06-23-QUALITY-WP3-OFFVIEWPORT-A11Y
- **Finding:** `Workspace.tsx:56-78` — the P1.2 `display:none` → `position:absolute; left:-99999px` switch leaves background workspaces (full editor + live PTY) in the tab order + accessibility tree (display:none had removed them). No `inert`/`aria-hidden` on the non-`visible` branch → keyboard focus can land in an off-screen workspace; screen readers announce N hidden terminals.
- **Suggested fix:** add `inert` to the hidden branch (doesn't affect FitAddon/serialize, doesn't change layout).
- **Priority:** low (genuine minor a11y/focus regression; low-effort)
- **Status:** pending

## SURFACE-2026-06-23-QUALITY-WP3-CHORD-EFFECT-THRASH
- **Finding:** `App.tsx:62-79` — the ⌘⇧+digit `useEffect` depends on `tiles`, whose identity churns on every reorder-move + status update, so the document keydown listener re-subscribes frequently. Correct but thrashy.
- **Suggested fix:** hold latest `tiles` in a `useRef`, read it inside a stable handler registered once.
- **Priority:** low
- **Status:** RESOLVED (debt-paydown WP4, 2026-06-30) — `tiles` + `focusWorkspace` lifted into `switchTilesRef`/`focusWorkspaceRef` (the `focusedPathRef` idiom); the ⌘⇧+digit capture-phase listener now registers ONCE per `[view]` transition instead of re-subscribing on every `tiles` churn.

## SURFACE-2026-06-23-QUALITY-WP3-TICKER-EFFECT-DUAL-RESPONSIBILITY
- **Finding:** `Filmstrip.tsx:113-126` — the active-tile stale-mirror clear shares the ticker `useEffect` (two responsibilities; a future ticker-dep edit could shift clear timing). Works + commented.
- **Suggested fix:** split the clear into its own effect keyed on `activeId`.
- **Priority:** low
- **Status:** pending

# m4-wp4-filmstrip-collapse — 2026-06-23

2 actionable MINOR findings (0 CRITICAL, 0 MAJOR) from `feature-review-quality` on ship `d06ac50`. Reviewer rated it well-built — idiomatic pure-helper extraction, correct effect lifecycle, dark-only CSS honored, no debt accrued. (A 3rd "finding" was a non-actionable test-count-consistency confirmation, not logged.)

## SURFACE-2026-06-23-QUALITY-WP4-ACTIVE-PILL-NOOP-PROMOTE
- **Finding:** `Filmstrip.tsx` collapsed branch — the pill row maps over ALL tiles including the active one and gives the active pill `onClick={() => onPromote(tile.id)}`, a silent no-op (focusWorkspace on the already-focused workspace), while still advertising `aria-label="Switch to <name>"` + a pointer cursor. The expanded tiles avoid a click handler on the active tile (promote flows through the strip pointer-up path).
- **Suggested fix:** no-op guard on the active pill (skip onPromote when `tile.active`) or an `aria-current`-aware disabled affordance, to align the two render branches.
- **Priority:** low (minor UX/a11y inconsistency between branches; harmless functionally)
- **Status:** pending

## SURFACE-2026-06-23-QUALITY-WP4-BGIDS-JOIN-SPLIT-ROUNDTRIP
- **Finding:** `Filmstrip.tsx` ticker effect — `bgSignature ? bgSignature.split(",") : []` re-derives `backgroundIds` by splitting a comma-joined string that was just built from `tiles.filter(...).map(...)` a few lines above. The same id array could be memoized once and reused for both the signature and the iteration.
- **Suggested fix:** compute the background-id array once; derive `bgSignature` from it (join) for the dep, and reuse the array for iteration.
- **Priority:** low (trivial readability; join-then-split is a tiny confabulation surface only if an id ever held a comma — not the case today, ids are uuids)
- **Status:** pending
- **Note:** the still-pending `SURFACE-2026-06-23-QUALITY-WP3-TICKER-EFFECT-DUAL-RESPONSIBILITY` is in this same ticker effect — WP4 added the `shouldRunMirror` gate but did not split the active-tile clear. The two are natural pickup-together candidates for one `/feature-refactor` pass on the ticker effect.

# dev-prod-isolation — 2026-06-24

3 MINOR findings from `feature-review-quality` on ship commit `5f9a86a` (0 CRITICAL, 0 MAJOR). Reviewer rated the feature well-built and advancing the codebase: single-root-cause design (identifier is the one source of truth), exemplary pure/impure split mirroring the config_store/hook_install precedent, the substring trap closed with exact-match + a both-directions regression test, and WHY-encoding doc comments. All three findings are low-risk coupling/drift seams, none affecting correctness. Auto-backlogged per drive_mode=autopilot.

## SURFACE-2026-06-24-QUALITY-DEVPROD-PROJECTS-FILE-DUP
- **File:** `src-tauri/src/config_store/commands.rs:18`
- **Finding (MINOR):** `PROJECTS_FILE` const is duplicated here (with a "kept in sync" comment) from the module-private `super::PROJECTS_FILE`. Two literals that must agree = a latent drift seam: a rename of the project-list filename would silently diverge the seed path from the read/write path.
- **Fix shape:** make `super::PROJECTS_FILE` `pub(crate)` and import it; delete the local copy. Trivial.

## SURFACE-2026-06-24-QUALITY-DEVPROD-BASENAME-SPACE-ASSUMPTION
- **File:** `src-tauri/src/hook_install/mod.rs:84-90`
- **Finding (MINOR):** `script_basename_of_command` matches the last whitespace token ending in `.pl` (after quote-stripping). Correct for all command shapes Claudesk emits and for the real macOS `/Application Support/…` path (the `.pl` tail token survives the split), but it assumes no `.pl`-suffixed path *segment* contains a space. Inputs are app-controlled → defensive-only.
- **Fix shape:** add a one-line comment documenting the no-spaces-in-`.pl`-segments assumption for any future reuser. Optional.

## SURFACE-2026-06-24-QUALITY-DEVPROD-OVERLAY-WINDOW-SIZE-COUPLING
- **File:** `src-tauri/tauri.dev.json:6-12`
- **Finding (MINOR):** the dev overlay re-declares `width`/`height` in `app.windows[0]` only because Tauri's array-merge replaces the whole window object (the sole intended override is `title`). Documented in the WIP (P1.1) but not at the file site → a future editor changing the prod window size would see dev silently keep 1280×800.
- **Fix shape:** add an inline comment in tauri.dev.json noting the array-replace coupling, or track window size in a shared place. Optional.

# qol-wp6-new-workspace-hotkey — 2026-06-25

2 MINOR findings from `feature-review-quality` on ship commit `47fdeb9` (0 CRITICAL, 0 MAJOR). Reviewer rated the feature clean and convention-adherent — pure-predicate + app-level-listener split is the right factoring, disjointness vs the neighbouring ⌘N chord is bidirectionally documented, the listener is a near-verbatim clone of the proven ⌘⇧+digit effect. Accrues no debt. Both findings are low-effort honesty/hygiene nits, neither a behavior bug. Auto-backlogged per drive_mode=autopilot.

## SURFACE-2026-06-25-QUALITY-WP6-TEST-CTRLALT-NAME-OVERPROMISE
- **File:** `src/components/workspace/__tests__/newWorkspaceChord.test.ts:46-49`
- **Finding (MINOR):** the final case is titled "is permissive on Ctrl/Alt" but the literal sets neither `ctrlKey` nor `altKey` (the `NewWorkspaceChordEvent` interface omits both fields), so it is identical in effect to the earlier uppercase-N positive. The assertion passes but does not exercise the permissiveness its name promises — a reader trusting the title would believe Ctrl/Alt coverage exists when it doesn't.
- **Fix shape:** either widen the interface to include optional `ctrlKey`/`altKey` and add `ctrlKey: true, altKey: true` to the literal, or simply retitle the case to match what it tests. Trivial.
- **Priority:** low (test-naming/coverage-honesty nit; predicate behavior is correct).
- **Status:** RESOLVED 2026-06-30 (debt-paydown WP6, Theme F/H) — widened: `NewWorkspaceChordEvent` now aliases the canonical `ChordEvent` (optional `ctrlKey/altKey`), and the case sets both `true`, so it actually exercises the permissiveness its name claims.

## SURFACE-2026-06-25-QUALITY-WP6-CHORD-MAP-XREF-HYGIENE
- **File:** `src/components/workspace/newWorkspaceChord.ts:6`
- **Finding (MINOR):** header cites "the chord-ownership map in editor/paletteCommands.ts" (same citation as sibling `workspaceSwitchChord.ts`) — a cross-reference that drifts silently if the map ever moves/renames. Confirmed present + correct this session, so no action needed today; flagged only as cross-reference hygiene for a future map-relocation.
- **Fix shape:** if the chord-ownership map is ever relocated, grep for "paletteCommands.ts" and update all chord-file headers together. No standalone fix.
- **Priority:** low (cross-reference hygiene; not a confirmed break).
- **Status:** pending

# m5-wp2-probe-agent-ui-driver — 2026-06-26

3 MINOR findings (0 CRITICAL / 0 MAJOR) from `feature-review-quality` on ship commit `f18f1e0`. Knowledge-producing probe (VERDICT: ADOPT); minimal executable footprint (dev-only bridge wiring), correctly release-gated three ways. Reviewer verdict: well-built, every non-obvious trap documented at its site, no refactor warranted. Priority: low (all). Auto-backlogged per drive_mode=autopilot.

## SURFACE-2026-06-26-QUALITY-WP2-UNPINNED-MCP-SERVER
- **Finding:** Tracked `.mcp.json` registers `npx -y @hypothesi/tauri-mcp-server` (unpinned — runs latest each invocation) for every checkout, so any MCP-aware client in the repo can auto-fetch + launch a third-party npm package that drives the live WKWebView. Intentional per the ADOPT verdict and read-only/dev-facing, but the unpinned auto-`npx -y` is a small standing supply-chain/reproducibility surface.
- **Where:** `.mcp.json:1-9`.
- **Fix shape:** pin the version (`@hypothesi/tauri-mcp-server@0.11.2`, matching the Rust plugin 0.11.2) in the `args` array, OR add a one-line note in the wbs.md verdict's wiring-disposition acknowledging the unpinned surface. Lowest-risk = pin the version.
- **Priority:** low
- **Status:** RESOLVED 2026-06-30 (debt-paydown WP7) — pinned `.mcp.json` `args` to `@hypothesi/tauri-mcp-server@0.11.2` (verified the latest published version + matches the Rust `tauri-plugin-mcp-bridge` `0.11` line).

## SURFACE-2026-06-26-QUALITY-WP2-LINGERING-ALLOW-UNUSED-MUT
- **Finding:** The dev-only bridge block mutates `builder` after the initial `.plugin(...)` chain, requiring `#[allow(unused_mut)] let mut builder`. Correct idiom for conditional plugin registration, but the `#[allow(unused_mut)]` masks the release-build case where `builder` is never reassigned — a small latent lint-suppression.
- **Where:** `src-tauri/src/lib.rs:65-72` (approx; the `let mut builder` restructure).
- **Fix shape:** no action needed while the bridge stays dev-only-conditional; if WP2 wiring is ever torn down or made unconditional, drop the `#[allow]` rather than let it linger. Track-only.
- **Priority:** low

## SURFACE-2026-06-26-QUALITY-WP2-RECIPE-WRONG-WAIT-TOKEN
- **Finding:** The verify-self invocation recipe (wbs.md WP2 verdict, step 1) says wait for `":9223 LISTEN"`, but the actual dev-server stdout tokens are `"MCP Bridge plugin initialized … 127.0.0.1:9223"` / `"WebSocket server listening on: 127.0.0.1:9223"`. `LISTEN` is an `lsof`/`netstat` artifact, not a stdout string — a future session grepping stdout for `LISTEN` will miss it and waste a cycle.
- **Where:** `docs/product/wbs.md`, WP2 verdict, recipe step 1.
- **Fix shape:** reword the recipe's wait-token to the real stdout line (`"WebSocket server listening on"`), or note that `LISTEN` requires `lsof -iTCP:9223 -sTCP:LISTEN` rather than a stdout grep. One-line doc edit.
- **Priority:** low
- **Status:** RESOLVED 2026-06-26 (M5 WP3 P1.5) — wbs.md recipe step 1 now waits for `"WebSocket server listening on: 127.0.0.1:9223"` with a note that `LISTEN` is an lsof/netstat artifact, not a stdout token.

# m5-wp3-pip-nspanel-status-core — 2026-06-26

2 MAJOR + 3 MINOR findings (0 CRITICAL) from `feature-review-quality` on ship commit `95292d6`. Reviewer verdict: well-built, advances the codebase more than it accrues debt; the 2 MAJOR are NOT bugs at the shipped baseline (both benign on WP3's only lifecycle path) but are latent desyncs the **M5 WP5 lifecycle work will trip over** — carry into WP5 scope, not a standalone refactor. Auto-backlogged per drive_mode=autopilot.

## SURFACE-2026-06-26-QUALITY-WP3-UNSYNCED-FILMSTRIP-INTERVAL
- **Finding:** The filmstrip retains its OWN `setInterval(1000)` DOM-write loop (Filmstrip.tsx ~199-212), unsynchronized with the App-level `useMirrorTicker` serialize loop (also 1000ms). The two intervals start at different times and drift in phase, so the filmstrip can read a `mirrorFrame` snapshot up to ~1s stale relative to the serialize. "Exactly ONE serialize ticker" holds for *serialize*, but the codebase now has two unsynced 1fps intervals doing mirror work.
- **Where:** `src/components/workspace/Filmstrip.tsx` mirror useEffect (~199-212) vs `src/components/workspace/useMirrorTicker.ts` interval.
- **Fix shape:** have `useMirrorTicker` push directly into the filmstrip's mirror refs (as it already conceptually does for the PiP via emit), eliminating the filmstrip's second interval — OR phase-lock them. Defer to WP5 (lifecycle/cost work) so the render-cost story is consolidated there.
- **Priority:** medium
- **Status:** RESOLVED 2026-06-27 (M5 WP5 P2.5, commit f6e3929) — added `subscribeMirrorFrame` to `mirrorFrame.ts`; the Filmstrip's 2nd `setInterval` is gone, replaced by a subscription fired in-lockstep from `useMirrorTicker.setMirrorFrame` (one mirror loop, no phase drift).

## SURFACE-2026-06-26-QUALITY-WP3-TEARDOWN-SKIPS-VISIBILITY-BROADCAST
- **Finding:** `pip::commands::teardown()` (called from lib.rs CloseRequested) closes the panel but does NOT emit `pip-visibility false`, so `useMirrorTicker.pipShown` stays `true` after a programmatic teardown — the ticker keeps serializing the full N set (incl. center stage) + attempting `pip-mirror` emits to a dead label. Harmless on app-close (the only current teardown path), but a latent cost-gate desync the moment a non-toggle close path is added.
- **Where:** `src-tauri/src/pip/commands.rs` `teardown()`; `src-tauri/src/lib.rs` CloseRequested handler.
- **Fix shape:** emit `pip-visibility false` in `teardown()` (or wherever WP5 adds a programmatic hide/close), so the cost gate stays honest. Natural WP5 scope (WP5 builds the toggle + lifecycle).
- **Priority:** medium
- **Status:** RESOLVED 2026-06-27 (M5 WP5 P1.3, commit f6e3929) — `teardown()` now emits `pip-visibility false` after `to_window().close()`.

## SURFACE-2026-06-26-QUALITY-WP3-DUP-MIRROR-INTERVAL-CONST
- **Finding:** `MIRROR_INTERVAL_MS = 1000` is duplicated as a module literal in both `Filmstrip.tsx` and `useMirrorTicker.ts`. The rate is meant to be shared ("the WP4-probe-validated background mirror rate"); two independent literals can drift on a future tuning change.
- **Where:** `src/components/workspace/Filmstrip.tsx:34`, `src/components/workspace/useMirrorTicker.ts:~39`.
- **Fix shape:** export one shared const (e.g. from mirrorFrame.ts or mirrorTicker.ts) and import in both. Likely subsumed by the unsynced-interval fix above.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-06-26-QUALITY-WP3-UNDIFFED-MIRROR-EMIT
- **Finding:** The `pip-mirror` emit sends `mirrorFrameSnapshot()` — the full serialized HTML for every needed workspace — every tick while shown, no per-tile diffing. Correct at dogfood N; worth a comment noting it's intentionally un-diffed.
- **Where:** `src/components/workspace/useMirrorTicker.ts` (~130, the emit).
- **Fix shape:** add `// full-frame each tick — no diff; revisit if N grows` (WP4/WP5 scaling territory). Optionally diff if N grows.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-06-26-QUALITY-WP3-LISTEN-BOILERPLATE-DUP
- **Finding:** The `listen(...).then(...)` + `cancelled`/`unlisten` async-unlisten boilerplate is copy-pasted 5× across Pip.tsx (×3), usePipFanout, and useMirrorTicker. Correct and consistently applied, but wide enough to name.
- **Where:** `src/pip/Pip.tsx` (3 effects), `src/pip/usePipFanout.ts`, `src/components/workspace/useMirrorTicker.ts`.
- **Fix shape:** extract a `useTauriListen(event, handler)` helper that encapsulates the async-register + cancelled-guard + unlisten. Repo-wide (useWorkspaceStatus has the same shape) — a small cross-cutting refactor.
- **Priority:** low
- **Status:** pending

# m5-wp4-pip-layout-modes-switcher-resize — 2026-06-26

4 MINOR findings (0 CRITICAL / 0 MAJOR) from `feature-review-quality` on ship commit `d38a191`. Reviewer verdict: well-built, high-discipline, negligible debt — all four are comment/vestige drift, none affecting correctness. Priority: low (all). Auto-backlogged per drive_mode=autopilot.

## SURFACE-2026-06-26-QUALITY-WP4-PIPMOVE-COMMENT-INACCURATE
- **Finding:** `pip_move`'s doc comment (src-tauri/src/pip/commands.rs) claims it uses "the same raw-msg_send path `set_content_size` uses safely" — but `set_content_size` (used by `pip_resize`) is a tauri-nspanel WRAPPER method, while `pip_move` uses a raw `msg_send!` on `panel.as_panel()`. Both are safe AppKit frame-mutations, but the stated equivalence is inaccurate.
- **Why it matters:** the comment is load-bearing safety justification for an `unsafe` block; an inaccurate basis weakens it for a future auditor.
- **Suggested action:** reword to "a safe AppKit frame-mutation like `set_content_size` (which wraps `setContentSize:`); here we send `setFrameOrigin:` directly" — distinguish wrapper vs raw.
- **Priority:** low
- **Status:** RESOLVED 2026-06-30 (debt-paydown WP5) — `pip_move`'s doc reworded to distinguish wrapper-vs-raw: "a safe AppKit frame-mutation like `set_content_size` (tauri-nspanel's wrapper over `setContentSize:`); here we send `setFrameOrigin:` as a raw `msg_send!` directly. Both are frame changes, NOT a style-mask transition." cargo + clippy clean.

## SURFACE-2026-06-26-QUALITY-WP4-STALE-AWAITING-SCALE-COMMENT
- **Finding:** pipFanoutWiring.test.ts (~line 211) comment says ".pip-tile-awaiting is the EMPHASIS hook (CSS scales + glows the dot)" — but the dot-size scale was DROPPED per operator feedback (P4.2 refinement); the shipped CSS adds only a glow halo, no transform.
- **Why it matters:** contradicts shipped behavior + the corrected Pip.tsx/CSS comments; mild confabulation risk for the next reader.
- **Suggested action:** update the test comment to "glows the dot (no size scale — operator dropped the scale, blink + glow only)".
- **Priority:** low
- **Status:** RESOLVED 2026-06-30 (debt-paydown WP5) — `pipFanoutWiring.test.ts` comment corrected to "glows the dot — no size scale; operator dropped the scale in P4.2, blink + glow only," matching the shipped `.pip-tile-awaiting` CSS (glow halo, no transform). 784 tests green.

## SURFACE-2026-06-26-QUALITY-WP4-VESTIGIAL-DRAG-REGION
- **Finding:** `pip-root` + `.pip-switch-row` still carry `data-tauri-drag-region`, which the commit itself establishes is INERT on this swizzled borderless NonactivatingPanel (the real drag is the JS `startPanelDrag` → `pip_move`). The attributes are harmless but misleading.
- **Why it matters:** a future maintainer could "fix" a drag bug by trusting the dead attribute — the exact confusion the Phase-5 work resolved.
- **Suggested action:** remove the `data-tauri-drag-region` attributes (or leave one with a comment "// inert on NSPanel — see pip_move; kept only as documentation"). Decide remove-vs-annotate.
- **Priority:** low
- **Status:** RESOLVED 2026-06-30 (debt-paydown WP1) — DECIDED remove: dropped the 3 vestigial `data-tauri-drag-region` attrs (`pip-root`, `.pip-switch-row`, the `={false}` on the switcher button) + repointed the 3 stale comments that referenced them to the real `startPanelDrag`→`pip_move` path (kept as documentation that the attr is inert). pip wiring tests (38) green.

## SURFACE-2026-06-26-QUALITY-WP4-DRAG-CLICK-BOUNDARY-IMPLICIT
- **Finding:** `startPanelDrag` registers window mousemove/up listeners + calls preventDefault even on a zero-distance click (one that never moves); benign because mouseup always fires + cleans up, but the click-vs-drag arbitration on the switch row is implicit.
- **Why it matters:** minor clarity; a reader can't tell at a glance why a click on the row's empty space is safe.
- **Suggested action:** add a one-line comment at the listener registration noting "zero-distance click = no pip_move sent (dx==dy==0 guard); mouseup always cleans up".
- **Priority:** low
- **Status:** pending

# wp3-split-ratio-control — 2026-06-27

*(feature-review-quality on ship commit 0b68f5a; Mode 3 autopilot auto-backlog. 0 CRITICAL / 0 MAJOR / 4 MINOR. Reviewer: well-built, low-debt; no refactor warranted — all 4 are prose/comment-accuracy nits.)*

## SURFACE-2026-06-27-QUALITY-WP3-APP-GLOBAL-STATE-PROSE
- **Severity:** MINOR
- **Finding:** `splitState` is app-global-PERSISTED (one localStorage key) but held in per-Workspace `useState`, so each mounted workspace keeps its own live copy — cross-workspace sync is by remount, not shared live state. The commit + docstrings call it "app-global (shared by all workspaces)," slightly overstating live sharing. (Matches the file-tree rail's model; functionally fine for the single-window switch-on-display pattern.)
- **Suggested action:** one-line comment in Workspace.tsx clarifying "each workspace mirrors the shared key; live sync is by remount, not cross-instance."
- **Priority:** low
- **Status:** pending

## SURFACE-2026-06-27-QUALITY-WP3-EFFECTIVERAIL-DOCSTRING-GUARANTEES
- **Severity:** MINOR
- **Finding:** `effectiveRailWidth` docstring claims both "never below RAIL_MIN" and "never above the stored width"; these can conflict in principle if stored < RAIL_MIN (unreachable today because clampRailWidth guarantees stored ≥ RAIL_MIN). The min-wins resolution is undocumented. Not a bug.
- **Suggested action:** note in the docstring that the function relies on the caller's clampRailWidth invariant (stored ≥ RAIL_MIN), and that `Math.min` resolves the edge safely.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-06-27-QUALITY-WP3-REFIT-NUDGE-LEFT-ONLY-ASYMMETRY
- **Severity:** MINOR
- **Finding:** the un-collapse refit nudge fires only on the left (CC) edge (`[leftCollapsed]`); the right half relies on RightPanelHost's own ResizeObserver. Reasonable (only the xterm pane has the WKWebView display-flip fit fragility) but the asymmetry isn't called out.
- **Suggested action:** half-sentence comment: "right half needs no nudge — only xterm's FitAddon has the display-flip race."
- **Priority:** low
- **Status:** pending

## SURFACE-2026-06-27-QUALITY-WP3-INTRA-FEATURE-PHASE-COMMENTS
- **Severity:** MINOR
- **Finding:** several comments (App.css split-control block, Workspace.tsx, splitWidth.ts) reference "Phase 1 / Phase 2" of the build sequence; in the merged single commit these describe history, not pending work, and could read as latent/unshipped to a future reader.
- **Suggested action:** reword the intra-feature phase references to describe the shipped behavior rather than the build order (or drop the phase labels).
- **Priority:** low
- **Status:** pending

# wp2-stuck-running-dot-fix — 2026-06-27

## SURFACE-2026-06-27-QUALITY-WP2-LONGEST-PREFIX-STRLEN-PROXY
- **Severity:** MINOR
- **Finding:** `resolve_cwd`'s longest-wins (`mod.rs:242-245`) uses `max_by_key(registered.len())` — string-length as a proxy for path-component depth. Correct in practice (candidates are pre-filtered to true ancestors of one cwd, so they're prefixes of each other), but a future reader may second-guess the string-length proxy sitting two lines below the component-safe `is_path_ancestor`.
- **Suggested action:** consider `Path::components().count()` for semantic consistency with `is_path_ancestor`, removing the proxy-reasoning footnote.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-06-27-QUALITY-WP2-RESOLVE-CWD-LINEAR-SCAN
- **Severity:** MINOR
- **Finding:** `resolve_cwd` (`mod.rs:239-246`) now scans all registered entries (`O(n)`) instead of the previous `O(1)` HashMap lookup. Negligible at the documented scale (≤100 workspaces, one CC hook event at a time) — flagged only so the linear scan is a recorded, conscious tradeoff rather than silent drift.
- **Suggested action:** none now; revisit only if a high-frequency event source is ever added that would inherit the scan.
- **Priority:** low
- **Status:** pending

# wp9-suppress-empty-pip — 2026-06-28

*(feature-review-quality on ship commit 7b36853; Mode 3 autopilot auto-backlog. 0 CRITICAL / 0 MAJOR / 2 MINOR. Reviewer: "well-built, low-risk polish that does exactly what its plan said... the two nits are backlog-or-dismiss at most; no refactor warranted.")*

## SURFACE-2026-06-28-QUALITY-WP9-REDUNDANT-MODE-REREAD
- **Severity:** MINOR
- **Finding:** `pip_set_mode(On)` (`pip/commands.rs`) persists `mode` to disk, then routes to `reconcile_on_mode_visibility`, which re-reads the mode back from disk (`resolve_data_dir` → `read_pip_mode`) rather than using the `mode` already in scope — a redundant disk read on a user-click path. Harmless (the read returns the just-persisted value) and arguably consistent with the file's "read fresh from the persisted source of truth" discipline used by the focus handler.
- **Fix shape:** either pass the in-hand `mode` into a count-only reconcile variant, or add a one-line comment noting the re-read is the deliberate "fresh from persisted truth" pattern. Lean: a comment, unless the hot-path read ever shows up.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-06-28-QUALITY-WP9-LEN-WITHOUT-IS-EMPTY
- **Severity:** MINOR
- **Finding:** `WorkspaceRegistry::len()` (`status_broadcaster/mod.rs`) was un-gated from `#[cfg(test)]` to gain a runtime caller without a companion `is_empty()`. Clippy-clean here (`len_without_is_empty` does not fire) and deliberate (an `is_empty()` was added then removed as dead code) — flagged only so a future reader who expects the idiomatic `len`/`is_empty` pair knows the omission was intentional.
- **Suggested action:** none now; add `is_empty()` only if/when a caller needs it (clippy will then require the pair).
- **Priority:** low
- **Status:** pending

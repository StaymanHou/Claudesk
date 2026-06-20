# Backlog

> **Scaffold-debt refactor pass — DONE 2026-06-17.** The 4 code-quality finding blocks below (6 MAJOR + 15 MINOR across wp1/wp2/wp3/wp4) were cleared via `/feature-refactor` before WP5. 20 findings fixed, 1 dismissed with rationale (WP2 `ReaderSink` enum — see that WIP's Code-Quality Review). Detail file: [`workflow/backlog-quality-findings.md`](backlog-quality-findings.md).

> **Phase 1 cycle-close backlog sweep — 2026-06-19 (`/product-finalize`).** Phase 1 (Bare Shell + Tab Substrate PoC) closed; all 9 WPs shipped. Sweep disposition of the items still pending at close: **all DEFERRED → carry to the Phase 2 cycle** (none escalated, none newly resolved by the close itself). Carried forward: wp5/wp6/wp7/wp8/wp9 code-quality findings (the **wp6 picker IPC error-surfacing MAJORs are the most load-bearing** — they pair with Phase 2's multi-workspace picker work, WP13/WP16) + `SURFACE-2026-06-18-MEMORY-MD-PRETTIER-NITS` (housekeeping). These remain in this file (not archived) so the next cycle inherits them.

## Code-quality findings — m2-wp3c-editor-split-panes (2026-06-20)
- **Pointer:** 3 MINOR findings from `feature-review-quality` on ship commit `b72ed30` (0 CRITICAL, 0 MAJOR). All cosmetic: (1) the middle-close focus-reassign in `editorPanes.ts` relies on a pre-filter-index shift that's correct + tested but under-commented; (2) the "is-split" predicate is encoded twice (JS `splitable` const vs CSS `:has(.editor-pane + .editor-pane)`) — a drift pair; (3) a redundant inline JSX comment restating the shared-doc rationale already stated in the file header. Reviewer rated the feature well-built, low-debt, fitting the codebase grain. See [`workflow/backlog-quality-findings.md`](backlog-quality-findings.md) → `# m2-wp3c-editor-split-panes — 2026-06-20`.
- **Priority:** low (all)
- **Pickup shape:** all three are quick `/feature-refactor` comment/duplication nits (add an index-shift comment; optionally a `data-split` attribute to single-source the split predicate; trim the redundant comment). Dismiss any via the WIP's `## Code-Quality Review` section.
- **Status:** pending

## Code-quality findings — m2-wp3b-command-palette (2026-06-20)
- **Pointer:** 1 MAJOR + 2 MINOR findings from `feature-review-quality` on ship commit `3699a22` (0 CRITICAL). MAJOR: the `languageCompartment` is vestigial (`.of()`-seeded, never `.reconfigure()`d — the palette syntax swap is actually an array-identity rebuild; the comments describe two contradictory mechanisms, neither matching the code). MINORs: `languageForId` duplicates `languageForExtension`'s pack switch (the "single source of truth" comment overstates it); `EditorPanel.active` is optional-with-default while the mirrored `SublimeToolbar.active` is required (latent multi-workspace gating foot-gun). Reviewer rated the feature well-built, ship-quality. See [`workflow/backlog-quality-findings.md`](backlog-quality-findings.md) → `# m2-wp3b-command-palette — 2026-06-20`.
- **Priority:** medium (the MAJOR comment/mechanism reconciliation) + low (MINORs)
- **Pickup shape:** the MAJOR is the highest-value — drop the vestigial compartment + seed the language directly (or wire a real live-`reconfigure`) and reconcile the comments; the dup-switch consolidation + the `active`-prop tightening are quick `/feature-refactor` items (the latter pairs with Phase-2 multi-workspace wiring). Dismiss any via the WIP's `## Code-Quality Review` section.
- **Status:** RESOLVED 2026-06-20 (`/feature-refactor`) — all 3 fixed: (MAJOR) vestigial `languageCompartment` dropped, language seeded directly in the extensions array + comments reconciled; (MINOR) `languageForId` consolidated to the single id→Extension switch, `languageForExtension` delegates via `idForExtension`; (MINOR) `EditorPanel.active` made required. 118/118 tests, tsc/lint/prettier clean. See `backlog-quality-findings.md` → `# m2-wp3b-command-palette` for per-finding detail.

## Code-quality findings — m2-wp3a-editor-core-editing (2026-06-20)
- **Pointer:** 3 MINOR findings from `feature-review-quality` on ship commit `59cc324` (0 CRITICAL, 0 MAJOR). All cosmetic: (1) `Mod-d` double-bound (explicit + in spread `searchKeymap`) — behavior correct, author-flagged belt-and-suspenders; (2) `Mod-r` comment slightly oversells the replace-vs-find distinction (same panel, replace row visible by default); (3) the `Prec.highest`/`@uiw array-identity` rationale is triplicated across editorExtensions.ts + EditorPanel.tsx. Reviewer rated the feature well-built, low-debt. See [`workflow/backlog-quality-findings.md`](backlog-quality-findings.md) → `# m2-wp3a-editor-core-editing — 2026-06-20` section.
- **Priority:** low (all)
- **Status:** pending
- **Pickup shape:** all three are trivial tidy-ups (drop a line / soften a comment / consolidate prose). Fold into a `/feature-refactor` pass or leave. Dismiss any via the WIP's `## Code-Quality Review` section.

## Code-quality findings — wp9-phase1-polish (2026-06-19)
- **Pointer:** 3 MINOR findings from `feature-review-quality` on ship commit `91fae7f` (0 CRITICAL, 0 MAJOR). All low-stakes: (1) picker mount effect's empty `catch {}` over prune+list has a partial-failure window (fold into the existing picker IPC error-surfacing item, `SURFACE-2026-06-18-QUALITY-*`); (2) plan-text/impl drift — plan said `CcError::Spawn`, code shipped the cleaner dedicated `CcError::CcNotFound` (informational, no change); (3) `classify_spawn_error` would benefit from a one-line `to_lowercase()` case-folding comment. Reviewer rated the feature well-built, no debt accrued. See [`workflow/backlog-quality-findings.md`](backlog-quality-findings.md) → `# wp9-phase1-polish — 2026-06-19` section.
- **Priority:** low (all)
- **Status:** pending
- **Pickup shape:** #1 belongs with the broader picker IPC error-surfacing work (wp6 MAJORs); #2 is informational (dismiss/ack); #3 is a 1-line comment. Fold into a `/feature-refactor` pass or leave. Dismiss any via the WIP's `## Code-Quality Review` section.

## Code-quality findings — wp8-sublime-hotkey (2026-06-19)
- **Pointer:** 3 MINOR findings from `feature-review-quality` on ship commit `74dfc2c` (0 CRITICAL, 0 MAJOR). MINOR #1 (stale "global-shortcut handler" rationale in the WIP Discoveries + the SURFACE-...-ARCH-SUBLIME-LAUNCH-MECHANISM entry) was FIXED IN-PLACE — the launch is frontend-initiated via `sublime_open`, not from a global-shortcut handler. The 2 remaining are cosmetic doc nits (inconsistent WP3 probe-section citation shorthand in `sublime/mod.rs`; `chord.ts` "Phase 2" header tag reads oddly standalone). The feature survived a mid-flight OS-global→in-app spec reversal with no live remnants. See [`workflow/backlog-quality-findings.md`](backlog-quality-findings.md) → `# wp8-sublime-hotkey — 2026-06-19` section.
- **Priority:** low (all)
- **Status:** pending
- **Pickup shape:** both remaining MINORs are 1-line comment edits — fold into the WP8 arch-resync at finalize, a `/feature-refactor` pass, or leave. Dismiss any via the WIP's `## Code-Quality Review` section.

## Code-quality findings — wp7-pty-cc-session (2026-06-19)
- **Pointer:** 4 MINOR findings from `feature-review-quality` on ship commit `50ca322` (0 CRITICAL, 0 MAJOR). Low-stakes: (1) `cc_kill` comment says SIGTERM but code does `/exit\r`→SIGKILL (comment drift); (2) `kill_all` serializes 3s grace windows under the registry lock — blocks window close at N>1 (Phase-2 N-clamp concern); (3) `onSessionId` inline-arrow in the spawn-effect dep array (safety is incidental via the phase guard, not structural); (4) rAF fit+focus pattern duplicated mount/post-spawn. Backend module rated the strongest part of the diff. See [`workflow/backlog-quality-findings.md`](backlog-quality-findings.md) → `# wp7-pty-cc-session — 2026-06-19` section.
- **Priority:** low (all)
- **Status:** pending
- **Pickup shape:** all four are cleanup/comment fixes — fold into a `/feature-refactor` pass or the Phase-2 multi-workspace work (the `kill_all`-scaling + `onSessionId`-dep ones naturally pair with the WP13 N-clamp lift). Dismiss any via the WIP's `## Code-Quality Review` section if not worth it.

## Code-quality findings — wp6-project-config-store (2026-06-18)
- **Pointer:** 2 MAJOR + 3 MINOR findings from `feature-review-quality` on ship commit `525b7e8` (0 CRITICAL). MAJORs: the picker's IPC boundary has no error handling (mount loader silently swallows a rejected `list_projects`, masking a malformed `projects.json` as empty; mutation handlers drop rejections as unhandled promise rejections). MINORs: `add_project` doesn't refresh recents (asymmetry vs `handleRemove`), `add_project`/`record_open` byte-identical bodies, `now_ms()` `unwrap_or(0)` sentinel collides with recency ordering. Backend rated exemplary. See [`workflow/backlog-quality-findings.md`](backlog-quality-findings.md) → `# wp6-project-config-store — 2026-06-18` section.
- **Priority:** medium (MAJORs — picker error-surfacing, load-bearing for Phase 2 multi-workspace shell) + low (MINORs)
- **Status:** pending
- **Pickup shape:** address the IPC error-handling MAJOR in a `/feature-refactor` pass or fold into the Phase 2 picker work; the MINORs are low-effort polish. Dismiss any via the WIP's `## Code-Quality Review` section if not worth it.

## SURFACE-2026-06-19-ARCH-SUBLIME-LAUNCH-MECHANISM
- **Source:** feature:build (WP8 Phase 1)
- **Target level:** product:arch
- **Type:** tech-debt
- **Summary:** WP8 launches Sublime via `std::process::Command`, not `tauri-plugin-shell` as arch.md:27,113 state.
- **Context:** WP8's `sublime_open` command (called from the frontend button + in-app ⌘⇧E handler) spawns `subl`/`open` directly; a std spawn is the natural fit (consistent with cc_session spawning `claude`) and avoids an unneeded plugin + capability surface. [Corrected 2026-06-19 per review-quality: original said "backend-initiated from the global-shortcut handler" — that handler was torn out; the launch is frontend-initiated.] Same class of as-built delta as WP7's portable-pty-vs-tauri-plugin-pty.
- **Suggested action:** Resync arch.md:27,113 at WP8 finalize to reflect the std-process launch. Note arch.md's OS-global global-shortcut + Accessibility flow (arch.md:26,88,96,97,114,162-168,193) is ALSO superseded by WP8's in-app-keybinding spec — resync those lines too.
- **Priority:** low
- **Status:** RESOLVED 2026-06-19 (WP8 finalize) — arch.md resynced (tech-stack, diagram, component table, happy-path, Key Decision, PATH prereq) + CLAUDE.md resynced (tech stack, project tree, prereqs, Key Decisions, WP8 headline, status line). Launch now documented as `std::process::Command` via `sublime_open`; OS-global + Accessibility flow removed.

## SURFACE-2026-06-19-ARCH-SUBL-PROJECT-FLAG-SUPERSEDED
- **Source:** feature:build (WP8 Phase 1)
- **Target level:** product:arch
- **Type:** tech-debt
- **Summary:** arch.md:113,167 still say hotkey-pop uses `subl --project <file>` when a `.sublime-project` exists; the WP3 probe superseded this.
- **Context:** WP3 found `subl --project` does NOT activate Sublime Text on cold start, which contradicts the hotkey-pop intent. The correct invocation is `subl <dir>` (ST auto-loads any project file in the folder). WP8 follows the WP3 contract; arch.md was never updated.
- **Suggested action:** Resync arch.md:113,167 at WP8 finalize to drop the `--project` mention.
- **Priority:** low
- **Status:** RESOLVED 2026-06-19 (WP8 finalize) — arch.md component table + happy-path now say `subl <dir>` / "never `--project`/`--new-window`"; the `subl --project` mention is gone.

## SURFACE-2026-06-18-MEMORY-MD-PRETTIER-NITS
- **Source:** feature:build (WP6 Phase 2 — gate run)
- **Target level:** product:wbs (housekeeping; no WP)
- **Type:** tech-debt
- **Summary:** `pnpm format:check` flags two tracked files as not Prettier-clean: `.claude/memory/macos-tcc-permissions-granted.md` and `.claude/memory/tauri-command-removal-needs-invoke-sweep.md`. Pre-existing (last touched in commit `90ae5ef`, before WP5); unrelated to WP6 source.
- **Context:** `.prettierignore` lists `docs/`, `workflow/`, `CLAUDE.md`, `runtimes.md` as hand-authored prose exempt from Prettier, but NOT `.claude/memory/`. These memory files are likewise hand-authored prose and arguably belong in the ignore list — or should be one-shot `prettier --write`-formatted. Either way, not WP6's job.
- **Suggested action:** Either add `.claude/memory/` to `.prettierignore` (consistent with the other hand-authored-prose exemptions) OR run `pnpm format` once to normalize them. Decide in a housekeeping pass.
- **Priority:** low
- **Status:** deferred — carry to next cycle (Phase 2); housekeeping, not Phase 1 scope (Phase 1 cycle-close sweep 2026-06-19)

## SURFACE-2026-06-18-PICKER-SCALES-TO-MANY-PROJECTS
- **Source:** feature:build (WP5 Phase 2 verify-human — operator request)
- **Target level:** product:wbs (WP6 — Project config store + picker wiring)
- **Type:** new-work (picker UX at real scale)
- **Summary:** The project picker must scale to 20+ rotating projects (the operator's actual workflow) and KEEP every project indefinitely — entries leave only on explicit manual delete, never auto-eviction. WP5 added the UI-only pieces against mock data: a scrollable recents list (`max-height:60vh; overflow-y:auto`) + a per-row delete (×) button that filters the mock array. The real-data pieces remain for WP6: persistence-backed delete via `remove_project` (not just in-memory filter), recency ordering via `record_open`/`last_opened_at`, and — once N is large — a filter/search box over the list (NOT built in WP5).
- **Context:** The keep-everything/manual-delete semantics are already the design intent (CLAUDE.md: flat `projects.json`, ≤100 entries, read-on-open). WP5's mock proves the layout; WP6 has the real store to wire delete + ordering + (new) search against.
- **Suggested action:** In WP6: wire `remove_project` to the × button; order the list by `last_opened_at` desc; add a filter/search input above the recents list (incremental substring match on display_name + path) gated on the list being long enough to warrant it.
- **Priority:** medium (load-bearing for WP6 picker usability at the operator's real project count)
- **Status:** RESOLVED 2026-06-18 — WP6 (commit 525b7e8) wired `remove_project` to the × (real persistence), ordered recents by `last_opened_at` desc, and added an always-present filter/search input (case-insensitive substring on `display_name` + `project_path`; pure `matchesFilter`, 6 vitest cases). Operator-approved in native shell.

## SURFACE-2026-06-16-ARCH-THUMBNAIL-MECHANISM-NONVIABLE
- **Source:** feature:research (WP4 thumbnail-rendering probe)
- **Target level:** docs/product/arch.md §"Phase 1 thumbnail-rendering probe" (+ Phase 2 §B.1 filmstrip)
- **Type:** doc-correction (load-bearing for Phase 2 filmstrip/PiP design)
- **Summary:** arch.md describes the thumbnail mechanism as "mount each background xterm full-size off-screen (`left:-99999px`) and render the filmstrip tile as a `scale(0.15)` live mirror of that off-screen DOM." This is **non-viable**: (1) a DOM node has one parent, so one xterm subtree can't appear in both an off-screen container and a filmstrip tile; (2) xterm.js `RenderService` registers an `IntersectionObserver({threshold:0})` that auto-pauses the renderer for off-viewport terminals — so the off-screen DOM you'd mirror is stale anyway (PR xtermjs/xterm.js#1144).
- **Suggested action:** WP4's decision report (P3.4/P3.5) corrects the arch.md text. Real mirror mechanisms are: relocate the single element (focused tile only), `cloneNode` per frame, or — recommended — `@xterm/addon-serialize` `serializeAsHTML()` from the buffer (works while renderer paused). Also note the architectural gift: off-viewport/collapsed workspaces get renderer-pause for free in Phase 2.
- **Priority:** medium (resolved by WP4 report; not blocking any Phase 1 build)
- **Status:** RESOLVED 2026-06-17 — WP4 (commit 3ae90eb) corrected arch.md §"Phase 1 thumbnail-rendering probe" (CORRECTION + OUTCOME blocks) and §B.1 filmstrip text, and proved `serializeAsHTML()` viable + beating cloneNode. See `docs/product/wp4-thumbnail-probe-outcome.md`.

## SURFACE-2026-06-16-CC-SLASH-COMMANDS-NEED-CR-NOT-LF
- **Source:** feature:build (WP2 probe — original surface SURFACE-2026-06-16-CC-EXIT-REQUIRES-TWO-KEYSTROKES, superseded after a 2026-06-16 follow-up observable probe)
- **Target level:** product:wbs (WP7 — PtyCcSession)
- **Type:** new-work (WP7 design constraint — load-bearing)
- **Summary:** Claude Code's TUI runs in raw mode. `\n` (LF) is treated as a literal character, NOT as Enter. **`\r` (CR, byte `0x0d`) is the Enter key.** Every slash-command byte-injection MUST end in `\r` to actually execute. Writing `/cmd\n` silently produces typed-but-not-executed bytes — autocomplete may appear but the command never runs.
- **Context:** WP2's original (b) finding claimed `/help\n` worked because the autocomplete dropdown appeared in the output. The follow-up probe showed the dropdown is a typeahead UI side-effect, NOT command execution. Comparing `/help\n` vs `/help\r` proves it: LF gives the dropdown; CR gives `/help`'s actual body (keyboard-shortcut list + doc link). Same rule for `/exit`: `/exit\n` types-but-doesn't-execute; `/exit\r` cleanly exits with code 0 in <5s.
- **Suggested action:** WP7's `CcSession::send_slash_command(cmd)` writes `format!("{cmd}\r").as_bytes()` to the PTY. Shutdown path can use either `Ctrl+D x2` (still works, the original finding) OR the cleaner `/exit\r` (one deterministic byte sequence, no race window). Reference code shapes: `src-tauri/examples/cc_pty_probe.rs::run_exit_via` with `&[b"/exit\r"]` (cleanest), or with `&[&[0x04], &[0x04]]` (control-char fallback). The harness now has both paths and the `inject` vs `inject-cr` modes demonstrate the LF/CR distinction directly.
- **Priority:** high (load-bearing for all of WP7's byte-injection paths, not just shutdown)
- **Status:** RESOLVED 2026-06-19 (WP7, commit `50ca322`) — `cc_session::slash_command_bytes(cmd)` strips any trailing CR/LF and appends exactly one `\r`; it is the single chokepoint for all Claudesk-originated slash commands (currently `kill()`'s `/exit\r`, plus Phase-2 injection). Codified by `slash_command_appends_cr_not_lf` + `slash_command_does_not_double_terminate` + `slash_command_preserves_arguments` cargo tests. verify-human confirmed a typed slash command executes on Enter against the real `claude` binary.

## SURFACE-2026-06-16-CC-EXIT-REQUIRES-TWO-KEYSTROKES (SUPERSEDED by SURFACE-2026-06-16-CC-SLASH-COMMANDS-NEED-CR-NOT-LF)
- **Status:** superseded
- **Note:** The original finding (Ctrl+D x2 required, `/exit\n` doesn't exit) was correct as far as it went, but the follow-up probe revealed the root cause (raw-mode LF vs CR) and a cleaner shutdown path (`/exit\r`). Kept here as a pointer; live finding is the entry above.

## Code-quality findings — wp1-tauri-scaffold (2026-06-16)
- **Pointer:** 4 MAJOR + 5 MINOR findings from `feature-review-quality` on commit `c50a785`. See [`workflow/backlog-quality-findings.md`](backlog-quality-findings.md) → `# wp1-tauri-scaffold — 2026-06-16` section.
- **Priority:** medium (MAJORs) + low (MINORs)
- **Status:** RESOLVED 2026-06-17 (refactor pass) — all 9 fixed: HTML title → Claudesk, README scaffold text replaced, window 800x600→1280x800, demo `greet` command + handler removed, `.prettierrc.json` given explicit `trailingComma: "all"`, eslint flat-config comment added, smoke values aligned (1+1 both sides), pnpm-workspace migration comment added, `vite.config.ts` `@ts-expect-error` → `import process from "node:process"`.

## Code-quality findings — wp2-cc-pty-probe (2026-06-16)
- **Pointer:** 4 MINOR findings from `feature-review-quality` on commit `875e161`. Polish for the kept-in-tree probe harness (shutdown duplication, reader-thread lifecycle comment, WIP state marker drift, ReaderSink enum). See [`workflow/backlog-quality-findings.md`](backlog-quality-findings.md) → `# wp2-cc-pty-probe — 2026-06-16` section.
- **Priority:** low (all)
- **Status:** RESOLVED 2026-06-17 (refactor pass) — 3 fixed (shutdown-paths-diverged clarifying comment, reader-thread EOF lifecycle comment, stale `**State:**` body line dropped); 1 DISMISSED (`ReaderSink` enum — explicit inline readers are clearer for reference/`examples/` code; the EOF invariant is now single-sourced by the lifecycle comment). Rationale in the WIP's Code-Quality Review section.

## Code-quality findings — wp3-sublime-cli-probe (2026-06-16)
- **Pointer:** 2 MAJOR + 4 MINOR findings from `feature-review-quality` on commit `cc72c4d`. MAJORs: stuck SURFACED leaf under a `[x]` Phase 1 parent (Work Tree invariant violation), and observation-vs-inference flattening in the invocation matrix (T8/T9/T11 inference-grade rows look identical to T7/T10 observation-grade rows). MINORs: stale state-prose drift, superscript footnote markers, stale `Unvisited:` sequence, runtimes.md timeout-formula deviation. See [`workflow/backlog-quality-findings.md`](backlog-quality-findings.md) → `# wp3-sublime-cli-probe — 2026-06-16` section.
- **Priority:** medium (MAJORs) + low (MINORs)
- **Status:** RESOLVED 2026-06-17 (refactor pass) — all 6 fixed: stuck SURFACED leaf deleted from Work Tree, both invocation matrices gained a `Source: observed|inferred` column + legend (all ST rows correctly marked `inferred` per the consent rule), footnotes folded inline (superscripts removed), stale `**State:**` body line dropped, `Unvisited:`/Current Node updated to complete, runtimes.md 120s-safety-floor policy documented as an intentional clamp.

## Code-quality findings — wp4-thumbnail-rendering-probe (2026-06-17)
- **Pointer:** 2 MINOR findings from `feature-review-quality` on commit `3ae90eb` (0 CRITICAL, 0 MAJOR; a 3rd MINOR — stale Phase-3 tree header — was fixed in-place). Polish on the durable probe pieces: a missing clarifying comment on the center terminal's no-serializer choice, and a `void duration;` scaffolding no-op in `replay.ts`. See [`workflow/backlog-quality-findings.md`](backlog-quality-findings.md) → `# wp4-thumbnail-rendering-probe — 2026-06-17` section.
- **Priority:** low (all)
- **Status:** RESOLVED 2026-06-17 (refactor pass) — both fixed: center-terminal no-serializer clarifying comment added in `Harness.tsx`; `void duration;` no-op removed from `replay.ts` (dropped the unused local destructure; `CastData.duration` field retained).

## Code-quality findings — wp5-frontend-ui-prototype (2026-06-18)
- **Pointer:** 3 MINOR findings from `feature-review-quality` on ship commit `777c0b8` (0 CRITICAL, 0 MAJOR). All cosmetic stylesheet/intent-clarity nits, zero correctness impact: inert `flex-shrink` on `.filmstrip` (grid parent), `XtermPane` effect dep could be `[]`, single-consumer global `h1` rule. See [`workflow/backlog-quality-findings.md`](backlog-quality-findings.md) → `# wp5-frontend-ui-prototype — 2026-06-18` section.
- **Priority:** low (all)
- **Status:** pending
- **Pickup shape:** address in a `/feature-refactor` pass (or fold into WP16 filmstrip work for the `.filmstrip` nit); dismiss via the WIP's `## Code-Quality Review` section if not worth it.

## SURFACE-2026-06-19-CM6-BUNDLE-SIZE-LAZY-LOAD
- **Source:** feature:build (WP2 Phase 1)
- **Target level:** product:wbs
- **Type:** tech-debt
- **Summary:** Production vite build emits the 500 KB chunk-size warning — the main bundle is ~348 KB gzipped once CM6 + language packs are statically imported by `Workspace`.
- **Context:** Benign for a local-disk Tauri app (no network fetch on load), but it grows app startup parse time. Background workspaces don't need the editor until focused.
- **Suggested action:** If a future milestone targets startup trimming, lazy-load the EditorPanel (`React.lazy`) so CM6 loads on first editor focus rather than at app boot. Reassess after WP9 dogfooding shows whether startup feels slow.
- **Priority:** low
- **Status:** pending

## Code-quality findings — m2-wp2-editor-shell (2026-06-19)
- **Pointer:** 2 MAJOR + 3 MINOR findings from `feature-review-quality` on ship commit `a84f3e9` (0 CRITICAL). MAJORs (medium): `editor_fs::resolve_within` leaf-symlink gap vs. its doc's security-invariant claim, and the backend trusting a frontend-supplied workspace `root` (trust boundary in the renderer — Phase-2 hardening seam; pair the two, same module). MINORs (low): save-status-driven CM6 keymap churn, `_state` param misnamed in editorLoad.ts, a speculative test comment. See [`workflow/backlog-quality-findings.md`](backlog-quality-findings.md) → `# m2-wp2-editor-shell — 2026-06-19`.
- **Priority:** medium (the two MAJOR backend-hardening items) + low (MINORs)
- **Status:** pending
- **Pickup shape:** the two MAJORs pair into one `editor_fs` hardening pass (validate `root` server-side + close the leaf-symlink gap) — natural to fold into Phase-2 multi-workspace IPC work; the MINORs are a quick `/feature-refactor` sweep. Dismiss any via the WIP's `## Code-Quality Review` section.

## SURFACE-2026-06-20-WP3C-SHARED-DOC-CURSOR-RESET
- **Source:** feature:build (WP3c Phase 1)
- **Target level:** product:wbs
- **Type:** tech-debt
- **Summary:** Split-pane editor uses shared-document with N independent `<CodeMirror>` (`@uiw`) instances bound to one `value`/`onChange`. Typing in one pane fires `setDoc` → all panes re-render with the new `value`, which can reset the OTHER pane's cursor/selection on each keystroke.
- **Context:** Acceptable for v1 — panes are viewports (the high-value gesture is *viewing* two regions of a long file; edits typically happen in one pane). A true fix is a single shared CM6 `EditorState` across views (dropping the `@uiw/react-codemirror` wrapper for raw `EditorView`s), which is a larger refactor that would also touch WP2/3a/3b wiring.
- **Suggested action:** Observe at WP3c verify-self/verify-human and during WP9 dogfooding. If the cursor-reset is annoying in practice, schedule a raw-`EditorView` shared-state refactor (post-M2, or fold into a later editor-polish WP). Otherwise dismiss.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-06-20-WP3C-INDEPENDENT-FILE-SPLIT
- **Source:** feature:verify-human (WP3c Phase 1)
- **Target level:** product:wbs
- **Type:** new-work
- **Summary:** WP3c ships the SHARED-DOCUMENT split model (both panes are viewports onto the same file). Operator wants the option to open a DIFFERENT file in each pane (Sublime/VS Code "split with two files") as a follow-up.
- **Context:** At WP3c verify-human the operator asked how to open different files per pane and, on learning it was scoped out at P1.1, chose "ship shared now, schedule independent later." Independent-file panes need per-pane load/save/dirty/path/language state and likely a move from N controlled `<CodeMirror>` instances to raw shared/independent `EditorView`s — a meaningfully larger rebuild than the shared-doc viewport model. Pairs naturally with SURFACE-2026-06-20-WP3C-SHARED-DOC-CURSOR-RESET (the raw-EditorView refactor would address both).
- **Suggested action:** Decompose as a follow-up WP after M2 (or a later editor-polish milestone): per-pane file state + independent-vs-shared toggle. Reuse WP6's fs_index / Cmd+P to pick the second pane's file.
- **Priority:** medium
- **Status:** pending

## SURFACE-2026-06-20-WP4-VERIFY-SELF-DIALOG-STUB-WEDGE
- **Source:** feature:build (WP4 Phase 2 verify-self)
- **Target level:** product:wbs
- **Type:** tech-debt
- **Summary:** Stubbed-browser verify-self for workspace-level UI (editor/diff panels) is blocked when the only entry to a workspace is the picker's "Open Folder", which routes through the Tauri dialog plugin (`plugin:dialog|open`) rather than the `invoke` stub. Faking the dialog return hangs a promise and wedges the tab (reproduced 3×, incl. across a system reboot).
- **Context:** Distinct from the known reload-clobber gotcha. Editor WPs (WP2/3*) reached the editor via the open-bar (a plain `invoke` path) so verify-self worked; WP4's DiffPanel lives in a workspace only reachable via the folder dialog. The workaround used for WP4 was operator-driven verify-human in the real `pnpm tauri dev` app (a stronger check — real git_diff vs a real repo).
- **Suggested action:** Add a test-only seam to reach a workspace without the dialog — e.g. a `?ws=<path>` query param or a `window.__seedWorkspace(path)` dev hook gated to dev builds — so future editor/diff/panel WPs have a stub-friendly verify-self entry. Alternatively, stub the dialog plugin's invoke channel correctly (investigate the exact `plugin:dialog|open` request/response shape so the promise resolves).
- **Priority:** low
- **Status:** pending

## SURFACE-2026-06-20-WP4-COMMIT-LOG-SCOPE-EXPANSION
- **Source:** feature:spec (WP4 diff-viewer redesign)
- **Target level:** product:wbs
- **Type:** new-work
- **Summary:** WP4's diff viewer is expanding from "working-tree diff (file list + base blobs)" to a Sublime-Merge-style viewer that ALSO includes a recent-commits list + per-commit diff (commit vs first-parent). This adds NEW backend (git2 revwalk + diff_tree_to_tree) beyond the original WP4 headline.
- **Context:** Surfaced at the verify-human rejection of WP4's first frontend attempt; operator's actual need is the full Sublime Merge experience. View-only is preserved (no staging) so no arch back-loop. WP4 size grows M→L.
- **Suggested action:** Annotate the wbs.md WP4 entry to reflect the commit-history addition + the M→L size; the spec (workflow/wip/m2-wp4-git-diff-viewer.md) captures the full scope. No new WP needed — it stays within WP4's "diff viewer" boundary, just larger.
- **Priority:** medium (load-bearing for WP4 acceptance; already in active build)
- **Status:** pending

## SURFACE-2026-06-20-WP4-DIFF-VIEWER-POLISH-FOLLOWUPS
- **Source:** feature:verify-human (WP4 Phase B, operator-approved with deferred polish)
- **Target level:** product:wbs
- **Type:** new-work
- **Summary:** Four operator-requested enhancements to the WP4 diff viewer, deferred to a follow-up WP (operator: "these can be in another WP"). The core Sublime-Merge viewer shipped + approved; these are additive polish.
- **Items:**
  1. **Collapse/expand-all button** — a control to collapse (or expand) ALL file-diff sections at once. The collapse model (`toggleCollapsed`/`isCollapsed` keyed by fileKey in diffModel.ts) already supports it; needs a "collapse all" that adds every current file key to the set + an "expand all" that clears it.
  2. **Sticky Working Directory + Commits headers** — the `.diff-statusbar` ("Working Directory") and the `.diff-commits-header` should stay pinned at the top of `.diff-scroll` while the files area scrolls. (Currently only `.diff-file-header` is `position:sticky`; the panel-level header + commits header scroll away.)
  3. **"Open file in editor" badge per file row** — a per-file affordance that opens the file into the EditorPanel (the easy version = open the CURRENT working-tree file). NOTE (operator's sharp catch): when viewing a COMMIT's diff, this should ideally open the file's content AT THAT COMMIT, which needs a NEW backend path (read a blob at a rev — `git2` tree-at-commit → blob), not just `read_file`. Decide scope at plan: current-file-only (cheap) vs. blob-at-rev (new backend).
  4. **Changed-line highlighting too faint / washed out** — HIGHEST PRIORITY of the four. In the shipped CSS the add/remove line backgrounds (`rgba(46,160,67,.16)` / `rgba(248,81,73,.16)`) read as a faint full-width wash that makes the actual change hard to see (operator screenshot 2026-06-20). Investigate: bump the add/remove bg opacity/saturation, OR highlight only the changed text span rather than the full line, OR add a left accent bar per changed line. Verify it's not a stray selection/`::selection` artifact.
- **Context:** WP4 grew M→L via the Sublime-Merge redesign; these were explicitly deferred to keep WP4 shippable. Item 4 is a readability issue worth doing soon; items 1–3 are enhancements.
- **Suggested action:** A small follow-up WP after M2's critical path (or fold into WP5 RightPanelHost work, since the panel chrome is adjacent). Item 4 could even be a quick standalone task.
- **Priority:** medium (item 4 = readability; items 1-3 = enhancement)
- **Status:** pending

## Code-quality findings — m2-wp4-git-diff-viewer (2026-06-20)
- **Pointer:** 4 MINOR findings from `feature-review-quality` on ship commit `4e2d742` (0 CRITICAL, 0 MAJOR). Reviewer: well-built, no refactor warranted. Doc-comment drift from the PB.7 removal sweep (stale `[file_base_core]` doc-link + wrong `diff_*` API name) + dead untracked-opts on the staged path + a 3-ternary commit-diff gate. See [`workflow/backlog-quality-findings.md`](backlog-quality-findings.md) → `# m2-wp4-git-diff-viewer — 2026-06-20`.
- **Priority:** low (all)
- **Status:** PARTIALLY RESOLVED 2026-06-20 — the **2 git_diff/mod.rs doc-drift MINORs** (stale `[file_base_core]` link → `[file_hunks_core]`; wrong `diff_*` API name → `diff_index_to_workdir`/`diff_tree_to_index`) were **fixed by m2-wp4-diff-viewer-polish P1.5** (commit 5051bd4). REMAINING pending: the dead untracked-opts on the staged path + the 3-ternary commit-diff gate in DiffPanel.tsx (both trivial polish).
- **Pickup shape:** the 2 highest-value doc fixes are DONE; the dead-opts + ternary nits remain as trivial `/feature-refactor` polish.

## SURFACE-2026-06-20-WP4-OPEN-IN-EDITOR-BLOB-AT-REV
- **Source:** feature:build (WP4 diff-viewer polish, item 3)
- **Target level:** product:wbs
- **Type:** new-work
- **Summary:** The diff-viewer's per-file "Open in editor" (Edit) affordance always opens the CURRENT working-tree content via the editor's `read_file` path — even when the row belongs to a COMMIT's diff. Opening a commit-row file's content AT THAT COMMIT (blob-at-rev fidelity) was deferred per operator's plan-time scope decision.
- **Context:** Doing it right needs a new backend path (git2 `commit.tree()` → tree-entry(path) → blob → utf8 — the plumbing already exists in `commit_diff_core`) plus a read-only / at-rev load mode in EditorPanel (today's editor is working-tree read/write only). The editor↔diff plumbing is being reworked in WP5 (RightPanelHost), which is the natural home.
- **Suggested action:** Fold into WP5: add `git_file_at_commit(root, sha, path)` + a read-only editor buffer; route commit-row "Open in editor" through it. Code note left at `DiffPanel.tsx` DiffPanelProps.onOpenInEditor.
- **Priority:** low (current behavior is useful; this is a fidelity enhancement)
- **Status:** pending

## Code-quality findings — m2-wp4-diff-viewer-polish (2026-06-20)
- **Pointer:** 3 MINOR findings from `feature-review-quality` on ship commit `5051bd4` (0 CRITICAL, 0 MAJOR). Reviewer: well-built, appropriately-scoped, no refactor warranted. All micro-readability/posture: a deliberate double-predicate eval in `toggleAllCollapsed`, a broad `visibleKeys` useMemo dep, and the sticky-layout z-index coupling (no visual-regression harness to guard it). See [`workflow/backlog-quality-findings.md`](backlog-quality-findings.md) → `# m2-wp4-diff-viewer-polish — 2026-06-20`.
- **Priority:** low (all)
- **Status:** pending
- **Pickup shape:** all three are optional — none affect correctness; the useMemo dep narrowing is the only one with any (negligible) runtime effect. Dismiss via the WIP's `## Code-Quality Review` section if not worth a `/feature-refactor`.

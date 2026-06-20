# Backlog — Code-Quality Findings

This file collects findings surfaced by `feature-review-quality` between ship and finalize. Each entry is grouped under a `# <feature-name> — <YYYY-MM-DD>` header. A single pointer per feature is added to `workflow/backlog.md`.

To pick up: read the entries below, then run `/feature-refactor` to address them. To dismiss: edit the originating WIP file's `## Code-Quality Review` section and mark the line `[DISMISSED]`.

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
- **Status:** pending

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
- **Status:** pending

## SURFACE-2026-06-19-QUALITY-KILL-ALL-N-SCALING
- **File:** `src-tauri/src/lib.rs:30-36` + `cc_session/mod.rs` `kill_all`/`kill`
- **Finding:** `kill_all()` runs inside the `CloseRequested` handler while holding the registry `Mutex`, and each `kill()` polls `try_wait` for up to 3s. At Phase-1 N=1 this is invisible, but the loop is explicitly written "for N" — at N>1 it serializes 3s grace windows and can block window close for up to 3s×N.
- **Why it matters:** the N-ready framing invites a future reader to assume `kill_all` scales; it doesn't. Surfaces when the Phase-2 N-clamp lifts.
- **Suggested action:** at the N-clamp lift (Phase 2 multi-workspace), reap sessions concurrently or use a per-session timeout so window close isn't serialized. Tie to the WP13 multi-workspace work.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-06-19-QUALITY-ONSESSIONID-INLINE-ARROW-DEP
- **File:** `src/components/workspace/Workspace.tsx:34` + `XtermPane.tsx` spawn-effect dep array
- **Finding:** `onSessionId` is passed to `XtermPane` as an inline arrow (`(sid) => onSessionId?.(workspace.id, sid)`), a fresh reference every render, yet it sits in the spawn effect's dependency array. The `if (bridge.phase !== "spawning") return` guard makes the re-run a cheap no-op today, so this is NOT a live bug — but the dep array reads as if `onSessionId` identity is meaningful when the "spawn exactly once" safety is incidental (the phase guard), not structural.
- **Why it matters:** a future edit weakening the phase guard could turn this into a double-spawn. Make the intent robust.
- **Suggested action:** wrap the inline arrow in `useCallback` (memoized on `workspace.id` + the stable `onSessionId`) or read `onSessionId` from a ref in the effect. Fold into a `/feature-refactor` pass or Phase-2 picker/workspace work.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-06-19-QUALITY-RAF-FOCUS-DUPLICATION
- **File:** `src/components/workspace/XtermPane.tsx:159-162 / 91-94`
- **Finding:** The rAF-deferred `fitAndResize` + `focus` pattern is duplicated at mount and post-spawn with near-identical inline comments explaining the 80-col layout-timing rationale.
- **Why it matters:** low-stakes, but the doubled prose comment restates the same WHY twice; drift risk if the rAF rationale ever changes.
- **Suggested action:** extract a tiny `rafFitFocus()` helper or have one comment cross-reference the other. Cleanup-only.
- **Priority:** low
- **Status:** pending

# wp6-project-config-store — 2026-06-18

2 MAJOR + 3 MINOR findings from `feature-review-quality` on ship commit `525b7e8` (0 CRITICAL). Backend rated exemplary; all findings are on the frontend picker's IPC boundary + two small backend nits. Auto-backlogged per drive_mode=autopilot (MAJOR + MINOR).

## SURFACE-2026-06-18-QUALITY-PICKER-IPC-NO-ERROR-HANDLING
- **File:** `src/components/picker/ProjectPicker.tsx:60-63` (mount loader) + `:69-85` (handlers)
- **Finding:** Every `await invoke(...)` in the picker assumes success. (1) The mount `useEffect` loader has no `.catch` — its comment claims "a failed load leaves the list empty," but a rejected `list_projects` (e.g. backend `ConfigError::Parse` on a malformed `projects.json`, mapped to a `String` error) throws inside the async IIFE and is silently swallowed, so corruption presents as an empty recents list rather than a surfaced error. (2) `handleOpenRecent` / `handleOpenFolder` / `handleRemove` `await invoke(...)` with no error handling, dispatched via `onClick={() => void handle...()}` — a rejected command becomes an unhandled promise rejection with no user feedback (a dead click). ESLint config does not enable type-checked rules, so `no-floating-promises` does not catch it.
- **Why it matters:** the backend's deliberate no-silent-wipe / typed-error posture is partially neutralized at the UI boundary where every failure path is dropped. Load-bearing for the Phase 2 multi-workspace shell where the picker stays mounted and errors must surface.
- **Suggested action:** add a shared error-surfacing path (toast / inline message) and `.catch` on the mount loader that realizes the documented graceful-empty fallback while distinguishing it from a real error. Fold into a `/feature-refactor` pass or the Phase 2 picker work.
- **Priority:** medium
- **Status:** pending

## SURFACE-2026-06-18-QUALITY-PICKER-ADD-NO-REFRESH
- **File:** `src/components/picker/ProjectPicker.tsx:78-79`
- **Finding:** `handleOpenFolder` calls `add_project` then `onOpen(picked)` but never refreshes local `recents` state (unlike `handleRemove`, which does). A newly added folder doesn't appear in the list until the picker remounts. State-sync asymmetry between the two mutation paths.
- **Why it matters:** minor in Phase 1 (picker likely unmounts on open), but a reader will trip over the asymmetry when the picker stays mounted in the multi-workspace shell.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-06-18-QUALITY-CMD-ADD-RECORD-IDENTICAL
- **File:** `src-tauri/src/config_store/commands.rs:42-55`
- **Finding:** `add_project` and `record_open` have byte-identical bodies (both delegate to `add_or_touch(&dir, ..., now_ms())`). The distinction is purely nominal at the IPC surface.
- **Why it matters:** harmless and arguably intentional for frontend readability, but two identical implementations invite drift (a future maintainer "fixes" one, not the other). A one-line doc note that they are deliberately aliased — or collapsing to one command — would prevent it.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-06-18-QUALITY-NOW-MS-EPOCH-SENTINEL
- **File:** `src-tauri/src/config_store/commands.rs:28-33`
- **Finding:** `now_ms()` swallows a pre-1970 `SystemTime` error with `.unwrap_or(0)`. A timestamp of `0` would silently sort that record last forever rather than surfacing the anomaly — `0` collides with the recency-ordering invariant if it ever fires.
- **Why it matters:** trivial in practice (clock-before-epoch is not real); flagged only because `0` is a sentinel colliding with an invariant.
- **Priority:** low
- **Status:** pending

# wp5-frontend-ui-prototype — 2026-06-18

3 MINOR findings from `feature-review-quality` on ship commit `777c0b8` (0 CRITICAL, 0 MAJOR). All cosmetic stylesheet/intent-clarity nits, zero correctness impact. Auto-backlogged per drive_mode=autopilot.

## SURFACE-2026-06-18-QUALITY-WP5-FILMSTRIP-FLEX-SHRINK
- **File:** `src/App.css:88`
- **Finding:** `.filmstrip` declares `flex-shrink: 0`, but its parent `.app-shell` is `display: grid` (not flex) — the property is inert. The grid row sizing (`grid-template-rows: auto 1fr`) is what reserves the strip.
- **Why it matters:** dead/misleading style declaration in a substrate file Phase 2 (WP16 filmstrip) will build on; a reader may infer a flex layout that doesn't exist.
- **Priority:** low
- **Status:** pending

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
- **Status:** pending

## SURFACE-2026-06-19-QUALITY-WP2-BACKEND-TRUSTS-FRONTEND-ROOT
- **File:** `src-tauri/src/editor_fs/commands.rs:18-26` (`read_file`/`write_file`)
- **Finding:** Both commands take `root: String` straight from the frontend with no app-side derivation, unlike `config_store`'s commands which resolve `app_data_dir()` server-side. The "confined to the open project" guarantee rests entirely on the renderer passing a correct `projectPath` — the trust boundary for the root guard lives in the webview, not the backend.
- **Why it matters:** Phase 2 (multi-workspace) multiplies the IPC callers and surface; this is the seam to tighten before more callers depend on it. Acceptable for the single-user PoC today.
- **Suggested action:** Consider having the backend validate `root` against the known project list (config_store) before honoring it, so a malformed/hostile root can't widen the guard. Pairs with the leaf-symlink item above (same module, same Phase-2 hardening pass).
- **Priority:** medium
- **Status:** pending

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
- **Status:** pending

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
- **Status:** pending

## SURFACE-2026-06-20-QUALITY-WP3C-REDUNDANT-JSX-COMMENT
- **File:** `src/components/workspace/editor/EditorPanel.tsx:295` (the `.editor-panes` inline comment)
- **Finding:** The inline JSX comment restates the shared-doc rationale ("vertical stack of panes… each pane is a viewport onto the shared doc") that is already stated authoritatively in the file header and in `editorPanes.ts` — WHAT-not-WHY redundancy.
- **Why it matters:** minor comment redundancy; the canonical explanation lives in two better places.
- **Suggested action:** Trim the inline comment to a brief pointer or drop it. No code change.
- **Priority:** low
- **Status:** pending

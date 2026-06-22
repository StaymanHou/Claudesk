# Backlog — Code-Quality Findings

This file collects findings surfaced by `feature-review-quality` between ship and finalize. Each entry is grouped under a `# <feature-name> — <YYYY-MM-DD>` header. A single pointer per feature is added to `workflow/backlog.md`.

To pick up: read the entries below, then run `/feature-refactor` to address them. To dismiss: edit the originating WIP file's `## Code-Quality Review` section and mark the line `[DISMISSED]`.

# m3-wp6-frontend-status-indicator — 2026-06-22

1 MAJOR + 2 MINOR findings from `feature-review-quality` on ship commit `b377a97` (0 CRITICAL). Reviewer rated it well-built — clean pure/runtime/render layering, faithful wire-contract mirror, exemplary dead-code-allow retirement. The one real blemish is a dead snippet/tooltip path. Auto-backlogged per drive_mode=autopilot.

## SURFACE-2026-06-22-QUALITY-WP6-SNIPPET-TOOLTIP-DEAD-PATH
- **Files:** `src/state/workspaceStatus.ts:38-39,93-98` (`applyStatusUpdate` reducer); `src/state/useWorkspaceStatus.ts:53-55` (no snippet accessor); `src/components/workspace/CenterStage.tsx` (never passes `statusSnippet`); `src/components/workspace/Workspace.tsx:33` + `WorkspaceStatusIndicator.tsx:18` (prop + `title={snippet ?? label}`)
- **Priority:** medium
- **Status:** pending
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
- **Status:** pending
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
- **Status:** pending
- **Findings:**
  1. **`closeActiveTabRef` comment duplication** — the ~10-line WHY comment on the render-fresh-ref restates the rationale already documented at PaneTabs.tsx L257-263 (`onActivePathChangeRef`/`onEmptyChangeRef`). A one-liner + back-reference ("same render-fresh-ref pattern as the reporters below, see L257") would cut the dup while keeping the load-bearing vh.3 explanation.
  2. **`CloseTabChordEvent` is a verbatim copy of `TabSwitchChordEvent`** — identical 3-field shape + "mirrors ChordEvent" comment. A shared `ChordEvent` type imported by both pure predicates would remove the dup; per-file self-containment for these seams is arguably a feature, so low-value.
  3. **Missing Ctrl/Alt-permissive test case** — `closeTabChord.ts:27-29` docstring promises Ctrl/Alt aren't part of the chord, but no test pins it. A `{metaKey:true,shiftKey:false,ctrlKey:true,key:"w"}` assertion would lock the documented invariant (safe today — the predicate doesn't read those fields).
- **Pickup shape:** all three are trivial `/feature-refactor` nits (consolidate a comment; optionally hoist a shared `ChordEvent` type; add one test case). Dismiss any via the WIP's `## Code-Quality Review` section.

# m2-wp11-tree-density-git-indicators — 2026-06-21

1 MAJOR + 3 MINOR findings from `feature-review-quality` on ship commit `6bcbe1f` (0 CRITICAL). Reviewer rated it ship-quality; backend (git_status `pub(crate)` reuse of git_diff's git2 plumbing, non-git-dir-is-not-an-error semantics, per-path staged-wins fold) the standout; Phase-5 layout churn well-annotated. Auto-backlogged per drive_mode=autopilot.

## SURFACE-2026-06-21-QUALITY-WP11-GIT-STATUS-PATH-KEYING
- **File:** `src/components/workspace/filetree/FileTree.tsx:203` (`gitStatus[node.path]`) × `src-tauri/src/git_status/mod.rs` (`status_map_core`)
- **Priority:** medium
- **Status:** pending
- **Summary:** The tree keys the git-status map by `node.path`, which is **workspace-root-relative** (`fs_tree` strips `projectPath`), but `git_file_statuses` returns **git-repo-root-relative** paths (libgit2 `repo.statuses()` + `open_repo`'s `Repository::discover` support a workspace nested below the repo root). When `projectPath` is a subdirectory of the enclosing repo, the two key spaces diverge → every git indicator silently fails to render (no error, blank). The verify-human passes ran against a workspace that WAS the repo root, so the green baseline never exercised the nested case.
- **Suggested action:** Re-base the command's returned paths to `root` (compute repo-root → strip the `root`-relative prefix so keys match `fs_tree`), OR assert + document a root==repo-root precondition and surface a clear state when violated. Graceful failure today (no crash, just no indicators) → MAJOR not CRITICAL. Natural to fold into WP13 or a quick task.

## SURFACE-2026-06-21-QUALITY-WP11-MINORS
- **Files:** `git_status/mod.rs:68`; `App.css` + `FileTree.tsx:219`; `gitStatus.ts:16`
- **Priority:** low
- **Status:** pending
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

# m2-wp4-git-diff-viewer — 2026-06-20

4 MINOR findings from `feature-review-quality` on ship commit `4e2d742` (0 CRITICAL, 0 MAJOR). Reviewer verdict: well-built, advances the codebase, no refactor warranted. Findings are doc-comment drift left by the PB.7 removal sweep (2) + dead diff-option config (1) + a frontend clarity nit (1). All low priority. Auto-backlogged per drive_mode=autopilot.

## SURFACE-2026-06-20-QUALITY-WP4-STALE-FILE-BASE-DOCLINK
- **File:** `src-tauri/src/git_diff/mod.rs:49` (`ChangedFile.path` rustdoc)
- **Finding:** rustdoc links to `[file_base_core]`, which was deleted in PB.7. Dangling intra-doc link (rustdoc::broken-intra-doc-links isn't in the clippy gate, so it slipped the green baseline).
- **Why it matters:** future reader follows a link to a function that no longer exists; the WP's own removal-sweep discipline missed its own doc reference.
- **Suggested action:** drop the `[file_base_core]` reference from the doc-comment (the path is the key passed to `git_file_hunks` + `read_file` now).
- **Priority:** low
- **Status:** pending

## SURFACE-2026-06-20-QUALITY-WP4-WRONG-DIFF-API-COMMENT
- **File:** `src-tauri/src/git_diff/mod.rs:327` (`file_hunks_core` doc-comment)
- **Finding:** doc describes the unstaged path as `diff_tree_to_workdir_with_index`, but the code (line ~352) calls `diff_index_to_workdir` (working-tree-vs-index). Different diff semantics; the comment names the wrong API on the subtle staged/unstaged split.
- **Why it matters:** a maintainer reasoning about staged/unstaged correctness from the comment would be misled — and that split is the trickiest part of the module.
- **Suggested action:** correct the comment to `diff_index_to_workdir` (or, if vs-HEAD-merged was actually intended, change the code — but the tests pin the current `diff_index_to_workdir` behavior, so fix the comment).
- **Priority:** low
- **Status:** pending

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
- **Status:** pending
- **Findings:**
  1. **`start_broadcaster` docstring describes a `Result`-style error contract the signature lacks** (`commands.rs:43-47`) — the doc says "errors returned as a human-readable string for the caller to surface… the only failure here is the receiver already having been taken," but the function returns `thread::JoinHandle<()>` with no error channel, and the double-start (receiver-already-taken) guard actually lives in `lib.rs`. The prose has drifted from the signature + call site. *(Fix: trim the docstring to match — the spawn either succeeds or panics via `.expect`; the receiver-take guard is documented at the lib.rs call site.)*
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

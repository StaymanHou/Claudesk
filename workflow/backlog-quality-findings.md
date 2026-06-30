# Backlog — Code-Quality Findings

This file collects findings surfaced by `feature-review-quality` between ship and finalize. Each entry is grouped under a `# <feature-name> — <YYYY-MM-DD>` header. A single pointer per feature is added to `workflow/backlog.md`.

To pick up: read the entries below, then run `/feature-refactor` to address them. To dismiss: edit the originating WIP file's `## Code-Quality Review` section and mark the line `[DISMISSED]`.

# m6-wp11-multiple-right-panel-terminals — 2026-06-28

*(feature-review-quality on ship commit f9e3292; Mode 3 autopilot auto-backlog. 0 CRITICAL / 0 MAJOR / 3 MINOR. Reviewer: "well-built... the only debt is minor — a small logic duplication between the button handlers and the keydown branches that a shared callback would erase. Nothing here warrants a refactor pass.")*

## SURFACE-2026-06-28-QUALITY-WP11-ENTRY-ID-SESSIONID-ALWAYS-EQUAL
- **Severity:** MINOR
- **Location:** `src/components/workspace/terminalList.ts` — `TerminalEntry { id; sessionId }`.
- **Finding:** `id` and `sessionId` are kept as distinct fields "so a future rename/label can diverge," but in v1 they are always set equal (`{ id: sid, sessionId: sid }` at every construction site). A speculative-generality seam carried into the data model before the feature that needs it; cheap + documented, so borderline — noted only because always-equal fields invite a reader to wonder whether they can drift today (they can't).
- **Suggested action:** Either collapse to one field until a rename/label feature lands, or add a one-line note that they're intentionally always-equal in v1. Or leave as-is (the seam is cheap).
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

# wp4-terminal-font-zoom — 2026-06-27

*(feature-review-quality on ship commit 67c3f54; Mode 3 autopilot auto-backlog. 0 CRITICAL / 0 MAJOR / 2 MINOR. Both reviewer-flagged as "not a defect / not a finding to act on" — forward-looking readability/factoring notes only.)*

## SURFACE-2026-06-27-QUALITY-WP4-UNUSED-STATE-VALUE-BINDING
- **Severity:** MINOR
- **Finding:** `Workspace.tsx` `const [, setTerminalFontSize] = useState<number>(loadTerminalFontSize)` keeps a state cell whose VALUE binding is intentionally unused — only the setter is read, inside `applyTerminalZoom`'s functional updater (the batch-safe prior-size source). The empty destructure + the "value never drives a render" shape can puzzle a future maintainer.
- **Fix shape:** either leave as-is (the functional-updater read is genuinely the cleanest batch-safe pattern; the in-code comment already justifies it) OR swap to a `useRef` updated inside the same updater body for the same prior-value semantics without an unused state slot. Reviewer called it a defensible tradeoff, not a defect.
- **Priority:** low
- **Status:** pending

# m5-wp5-pip-toggle-lifecycle-autosummon — 2026-06-27

*(feature-review-quality on ship commit f6e3929; Mode 3 autopilot auto-backlog. 0 CRITICAL / 2 MAJOR / 2 MINOR.)*

## SURFACE-2026-06-27-QUALITY-WP5-PIPMODE-STATE-DUP-PER-WORKSPACE
- **Severity:** MINOR
- **Finding:** `RightPanelHost.tsx:136-159` — the `pipMode` state + `pip_get_mode` fetch + `pip-mode` listener are duplicated per RightPanelHost instance (one per mounted workspace), so at N workspaces there are N redundant IPC fetches + N subscriptions for one app-global value. The inline comment acknowledges it's "fine per-RightPanelHost," but it's avoidable at the N>1 the milestone targets.
- **Fix shape:** lift `pipMode` to App-level state (fetched + subscribed once), passed down as a prop — mirroring how `tiles` is derived once in App. Low effort.
- **Priority:** low.
- **Status:** pending — DEFERRED at debt-paydown WP4 (operator, 2026-06-30), anchored to **M9**. The per-`RightPanelHost` `pip-mode` subscription is the project's INTENDED "all surfaces subscribe to the same backend broadcast" pattern (PiP mode is already an app-global View-menu radio, backend = single source of truth via `pip_set_mode`/`pip_get_mode` + the `pip-mode` event), not a missing-app-state bug — the only real cost is N-1 redundant `pip_get_mode` mount fetches. M9's time-tracking toggle follows the same backend-command + `*-mode`-broadcast + per-consumer-subscribe shape, so there is no shared app-settings store to build once-vs-twice. Fold the dedup into M9's settings work IF an app-settings hook materializes there; else it stays the documented pattern.

# qol-wp5b-editor-folder-depth — 2026-06-25

3 MINOR findings (0 CRITICAL / 0 MAJOR) from `feature-review-quality` on ship commit `374f7cb`. Reviewer verdict: well-built, security-conscious, ship-quality; no finding warrants a refactor pass. Priority: low (all). Auto-backlogged per drive_mode=autopilot.

## SURFACE-2026-06-25-QUALITY-WP5B-TRASH-FAILURE-NOT-SURFACED
- **Finding:** a failed `trash_path` in `onDeleteFolderConfirm` is swallowed to `console.error` only — the tree isn't refreshed and no user-visible surface reports it, so the folder silently appears to still exist. Consistent with the single-file delete's existing behavior (and the WIP flags a future toast), but the folder-delete blast radius makes the silent-failure window more consequential.
- **Where:** `src/components/workspace/RightPanelHost.tsx` `onDeleteFolderConfirm` (~410).
- **Fix shape:** surface the trash failure inline/toast (reuse the new-file inline-error pattern). Pairs with the WP5 `SURFACE-2026-06-25-QUALITY-WP5-DELETE-FAILURE-NOT-SURFACED` toast item — one fix covers both delete paths.
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

# qol-wp1-close-workspace — 2026-06-25

3 MINOR findings (0 CRITICAL, 0 MAJOR) from `feature-review-quality` on ship commit `c01a3f9`. Reviewer rated the feature well-built and idiomatic — the standout being the per-pane `cc_kill`-on-unmount that reaps both PTY panes generically and closes a latent WP7 lifecycle gap. All findings are low-risk: two over-narrated comments + one accepted test-boundary gap. Auto-backlogged per drive_mode=autopilot.

## SURFACE-2026-06-25-QUALITY-WP1-APP-WIRING-UNTESTED
- **Files:** `src/components/workspace/Filmstrip.tsx`, `src/App.tsx` (requestClose / resolveClose / dirty-probe registry)
- **Priority:** low
- **Status:** pending
- **Type:** test-coverage gap
- **Finding:** Only the pure layer (reducer, `dirtyDocCount`, `closeWorkspaceSpec`) is unit-covered. No component test for the × (stopPropagation routing, keyboard Enter/Space) and no App-level test for the probe-registry / focus-repick wiring. Accepted boundary per the project's manual-host-UI convention + the live 9/9 operator verification — but the App wiring (`requestClose` reading the `workspaces` closure, `resolveClose` clearing `pendingClose`) is the part most likely to regress silently.
- **Pickup shape:** if/when the project adopts a component-test harness (RTL) or E2E (deferred per Phase-1 convention), add a Filmstrip-×-routing test + an App close-handler test. Low value until then; dismiss if the manual-verification posture holds.

# app-menu-bar — 2026-06-24

1 MAJOR + 2 MINOR from `feature-review-quality` on ship commit `f815154` (0 CRITICAL). Reviewer rated the feature well-built, appropriately-scoped, adds zero new behavior, integrates through existing chord predicates. The MAJOR is the one real durability concern: an unguarded cross-language id contract. Auto-backlogged per drive_mode=autopilot.

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

# m3-wp6-frontend-status-indicator — 2026-06-22

1 MAJOR + 2 MINOR findings from `feature-review-quality` on ship commit `b377a97` (0 CRITICAL). Reviewer rated it well-built — clean pure/runtime/render layering, faithful wire-contract mirror, exemplary dead-code-allow retirement. The one real blemish is a dead snippet/tooltip path. Auto-backlogged per drive_mode=autopilot.

## SURFACE-2026-06-22-QUALITY-WP6-MINORS
- **Files:** `src/state/useWorkspaceStatus.ts:53-55`
- **Priority:** low
- **Status:** pending
- **Findings:**
  1. **`stateFor` re-created every render** (`useWorkspaceStatus.ts:53-55`) — a fresh closure each render, consumed per-workspace in CenterStage. Harmless at N≤1; a `useCallback` keyed on `statusMap` would avoid re-running the lookup chain as the list grows in Phase 2 (multi-workspace).
- **Pickup shape:** trivial `/feature-refactor` nit. Dismiss via the WIP's `## Code-Quality Review` section.
- *(Sub-finding #2 — the unfed `last_output_snippet`/`snippet`-prop tooltip path — RESOLVED 2026-06-30 by debt-paydown WP2, which threaded the snippet end-to-end via `snippetFor`. Removed here in sweep #2.)*

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

# wp8-sublime-hotkey — 2026-06-19

3 MINOR findings from `feature-review-quality` on ship commit `74dfc2c` (0 CRITICAL, 0 MAJOR). The feature survived a mid-flight OS-global→in-app spec reversal with no live remnants; findings are all doc-accuracy/cosmetic. MINOR #1 (stale "global-shortcut handler" rationale) was FIXED IN-PLACE at finalize-prep time in both the WIP Discoveries and the backlog SURFACE entry — not pending. The 2 below are the remaining cosmetic nits. Auto-backlogged per drive_mode=autopilot (MINOR).

## SURFACE-2026-06-19-QUALITY-CHORD-TS-PHASE-TAG
- **File:** `src/sublime/chord.ts:1`
- **Finding:** Header tagged "WP8 Phase 2" reads oddly standalone now the tree collapsed to 2 phases (Rust core / frontend). Accurate, just stylistically loose.
- **Why it matters:** cosmetic; no functional impact.
- **Suggested action:** drop the "Phase 2" qualifier or leave as-is. Lowest priority.
- **Priority:** low
- **Status:** pending

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

## SURFACE-2026-06-19-QUALITY-WP2-EDITORLOAD-UNDERSCORE-PARAM
- **File:** `src/components/workspace/editor/editorLoad.ts:24`
- **Finding:** Reducer parameter named `_state` (underscore signals "unused") but it IS used in the `default` branch (`return _state`); `editorSave.ts:26` correctly names the same param `state`. Inconsistent within the same feature.
- **Suggested action:** Rename `_state` → `state` in `editorLoad.ts`.
- **Priority:** low
- **Status:** pending

# m2-wp6-file-finder — 2026-06-20

3 MINOR findings from `feature-review-quality` on ship commit `fc77ad4` (0 CRITICAL, 0 MAJOR). The feature is well-built and low-debt — reviewer validated correctness (deterministic tiebreak sort, greedy subsequence matcher, async cancellation, chord exclusivity) and consistency with repo seams. All three are minor overlay/doc nits. Auto-backlogged per drive_mode=autopilot.

## SURFACE-2026-06-20-QUALITY-WP6-PANEL-CHORD-UNDER-OVERLAY
- **File:** `src/components/workspace/RightPanelHost.tsx:60-75` (the capture-phase keydown listener)
- **Finding:** While the Cmd+P finder overlay is open, a panel chord (⌘⇧E/⌘⇧D) still fires and switches the right-half panel *underneath* the still-visible overlay — the listener doesn't early-return on `finderOpen`.
- **Why it matters:** UX seam, not a correctness bug; a future reader will wonder whether interleaving panel-switch with an open overlay was intended.
- **Suggested action:** Guard panel chords on `!finderOpen` (or add a one-line note that the interleave is acceptable). Trivial.
- **Priority:** low
- **Status:** pending

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

# qol-wp6-new-workspace-hotkey — 2026-06-25

2 MINOR findings from `feature-review-quality` on ship commit `47fdeb9` (0 CRITICAL, 0 MAJOR). Reviewer rated the feature clean and convention-adherent — pure-predicate + app-level-listener split is the right factoring, disjointness vs the neighbouring ⌘N chord is bidirectionally documented, the listener is a near-verbatim clone of the proven ⌘⇧+digit effect. Accrues no debt. Both findings are low-effort honesty/hygiene nits, neither a behavior bug. Auto-backlogged per drive_mode=autopilot.

## SURFACE-2026-06-25-QUALITY-WP6-CHORD-MAP-XREF-HYGIENE
- **File:** `src/components/workspace/newWorkspaceChord.ts:6`
- **Finding (MINOR):** header cites "the chord-ownership map in editor/paletteCommands.ts" (same citation as sibling `workspaceSwitchChord.ts`) — a cross-reference that drifts silently if the map ever moves/renames. Confirmed present + correct this session, so no action needed today; flagged only as cross-reference hygiene for a future map-relocation.
- **Fix shape:** if the chord-ownership map is ever relocated, grep for "paletteCommands.ts" and update all chord-file headers together. No standalone fix.
- **Priority:** low (cross-reference hygiene; not a confirmed break).
- **Status:** pending

# m5-wp2-probe-agent-ui-driver — 2026-06-26

3 MINOR findings (0 CRITICAL / 0 MAJOR) from `feature-review-quality` on ship commit `f18f1e0`. Knowledge-producing probe (VERDICT: ADOPT); minimal executable footprint (dev-only bridge wiring), correctly release-gated three ways. Reviewer verdict: well-built, every non-obvious trap documented at its site, no refactor warranted. Priority: low (all). Auto-backlogged per drive_mode=autopilot.

## SURFACE-2026-06-26-QUALITY-WP2-LINGERING-ALLOW-UNUSED-MUT
- **Finding:** The dev-only bridge block mutates `builder` after the initial `.plugin(...)` chain, requiring `#[allow(unused_mut)] let mut builder`. Correct idiom for conditional plugin registration, but the `#[allow(unused_mut)]` masks the release-build case where `builder` is never reassigned — a small latent lint-suppression.
- **Where:** `src-tauri/src/lib.rs:65-72` (approx; the `let mut builder` restructure).
- **Fix shape:** no action needed while the bridge stays dev-only-conditional; if WP2 wiring is ever torn down or made unconditional, drop the `#[allow]` rather than let it linger. Track-only.
- **Priority:** low

# m5-wp4-pip-layout-modes-switcher-resize — 2026-06-26

4 MINOR findings (0 CRITICAL / 0 MAJOR) from `feature-review-quality` on ship commit `d38a191`. Reviewer verdict: well-built, high-discipline, negligible debt — all four are comment/vestige drift, none affecting correctness. Priority: low (all). Auto-backlogged per drive_mode=autopilot.

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

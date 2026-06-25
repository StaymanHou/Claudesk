# Backlog

## SURFACE-2026-06-25-EDITOR-FOLDER-FILE-OPS
- **Source:** feature:verify-human (QoL-WP5 Phase 3 — operator questions, 2026-06-25)
- **Target level:** feature (small) — editor file-management depth
- **Type:** new-work (two scoped extensions of QoL-WP5's create/delete)
- **Summary:** QoL-WP5 shipped create-file (root-only) + delete-file (single-file-only). Two natural extensions the operator asked for at verify-human, both DELIBERATELY out of WP5 v1 scope: **(A) create a file INSIDE a folder** — today the new-file input creates at the workspace root and rejects any `/` in the name; **(B) delete a FOLDER** (recursive) — today `delete_file_core` rejects a directory target (`IsDirectory`) and the ✕ renders on file rows only.
- **Context:**
  - **(A) create-in-folder** is the cheaper of the two and low-risk. The backend already supports it: `editor_fs::write_file`/`resolve_within` confine to root but allow any existing-parent subpath (`write_in_nested_existing_dir_round_trips` test proves `src/lib.rs` works). The only blockers are frontend: `proposeNewFilePath(dir, name)` already takes a `dir` arg (passed `null` today), and it rejects `/`-containing names. Two viable UX shapes: (i) a per-DIR-row "+ new file here" affordance that passes that dir as `dir`; (ii) allow a relative path in the input (`sub/x.txt`) but only when the parent dir already exists (no `mkdir -p`, matching the backend constraint) — or add `create_dir_all` of the parent to the create path if nested-dir create is wanted. Reserve "new folder" as a separate sub-item if pursued.
  - **(B) delete-folder (recursive)** is riskier — one click wipes a subtree. Needs: a new `delete_dir(root, path)` backend command (root-confined `fs::remove_dir_all`, mirroring `delete_file`'s `resolve_within`), a delete ✕ on dir rows, a STRONGER confirm (name + "and everything inside it" + ideally a descendant count), and `closeTabsForPath` for every open tab UNDER the deleted dir (the current `close-path` is exact-match; a folder delete needs a prefix-match teardown). Consider macOS Trash (`NSFileManager` / a `trash` crate) instead of a hard `remove_dir_all` for recoverability given the blast radius.
- **Suggested action:** (A) first (cheap, low-risk) — likely a quick task. (B) as a deliberate small feature with the stronger-confirm + prefix-close-tabs + (recommended) Trash-not-hard-delete decisions made at plan time.
- **Priority:** low (A) / low (B) — both are depth on an already-working feature; the operator can use Sublime Text (one click) for folder ops meanwhile.
- **Status:** open

<!-- M4 cycle-close sweep 2026-06-24 (/product-finalize): no pending item was newly
RESOLVED by M4's work (M4's own WP outcomes were recorded at each feature-finalize).
Disposition of the operationally-relevant pending items: SURFACE-2026-06-23-VERIFY-SELF-
DRIVER-FOR-WORKSPACE-UI (high) → DEFERRED, anchored to M5 planning; SURFACE-2026-06-22-
WP5-DROPPED-WATCH-WORKFLOW-DOC-HIERARCHY (medium) → DEFERRED, anchored to M6; the
dev-prod-isolation 3 MINORs + the long code-quality-findings tail → DEFERRED (low, carry
forward — none M5-blocking). No escalations. -->

## Code-quality findings — qol-wp4-terminal-respawn-on-switch (2026-06-25)
- **Pointer:** 3 MINOR findings (0 CRITICAL, 0 MAJOR) from `feature-review-quality` on ship commit `10c604f`: (1) the deferred-spawn trigger effect's "bumps spawnNonce exactly once" comment slightly overstates the guarantee — once-ness is co-enforced downstream by the spawn effect's `cancelled` closure (XtermPane.tsx ~418-425); (2) `respawnOnReactivate.repro.test.ts` duplicates the `shouldSpawnOnActive` truth table already exhaustive in `respawnGuard.test.ts`; (3) the "clears the latch on relaunch" assertion in `spawnOnceOnReactivate.test.ts` (~line 47) is an unanchored substring match. Reviewer: well-built, appropriately-scoped, "advances rather than accrues debt"; no finding warrants a refactor pass. See [`workflow/backlog-quality-findings.md`](backlog-quality-findings.md) → `# qol-wp4-terminal-respawn-on-switch — 2026-06-25`.
- **Priority:** low (all)
- **Status:** pending
- **Pickup shape:** three quick `/feature-refactor` polish nits — (1) add a one-line comment at the trigger effect pointing at the `cancelled` backstop; (2) trim the duplicated truth-table cases from the repro test; (3) anchor the latch assertion near `handleRelaunch`. Dismiss any via the WIP's `## Code-Quality Review` section.

## Code-quality findings — qol-wp3-switch-workspace-autofocus-cc (2026-06-25)
- **Pointer:** 2 MINOR findings (0 CRITICAL, 0 MAJOR) from `feature-review-quality` on ship commit `78c76d6`: (1) the no-PTY-byte test guard (`not.toMatch(/\r\n|\r|\n/)` in `autofocusCcOnPromote.test.ts`) is over-broad — pins absence of any newline anywhere in Workspace.tsx, so a future unrelated `\n` literal would fail with a misleading WP4-regression message; (2) the WP3 `visible`-edge effect comment block (Workspace.tsx ~69-79) triplicates the commit + WIP rationale. Reviewer: well-built, tightly-scoped, minimal correct seam, no debt — neither finding warrants a refactor pass. See [`workflow/backlog-quality-findings.md`](backlog-quality-findings.md) → `# qol-wp3-switch-workspace-autofocus-cc — 2026-06-25`.
- **Priority:** low (all)
- **Status:** pending
- **Pickup shape:** two quick `/feature-refactor` polish nits — (1) scope the newline assertion to the focus effect / `invoke(`; (2) trim the effect comment to the WKWebview-rAF rationale. Dismiss either via the WIP's `## Code-Quality Review` section.

## Code-quality findings — qol-wp2-status-busy-vs-awaiting (2026-06-25)
- **Pointer:** 1 MINOR finding (0 CRITICAL, 0 MAJOR) from `feature-review-quality` on ship commit `7cfc464` — the unknown-`notification_type`-fallback rationale is restated in 3 places (const doc + fn doc + match-arm comments) in `status_broadcaster/mod.rs` (~25 lines of doc for ~15 of logic). A second MINOR (a duplicate dangling `verify-codify` checkbox in the WIP tree) was resolved in-place before archive. Reviewer: well-built, tightly-scoped; root cause diagnosed empirically (live hook-stream capture), fix in one place, docs resynced same-commit. See [`workflow/backlog-quality-findings.md`](backlog-quality-findings.md) → `# qol-wp2-status-busy-vs-awaiting — 2026-06-25`.
- **Priority:** low
- **Status:** pending
- **Pickup shape:** one comment-consolidation edit (`/feature-refactor`) — anchor the rationale once, back-reference from the other two. Dismiss via the WIP's `## Code-Quality Review` section.

## Code-quality findings — qol-wp1-close-workspace (2026-06-25)
- **Pointer:** 3 MINOR findings (0 CRITICAL, 0 MAJOR) from `feature-review-quality` on ship commit `c01a3f9` — all low-risk: (1) the filmstrip × comment over-narrates a rejected nested-`<button>` alternative (Filmstrip.tsx); (2) a forward-referencing `docsRef` comment in EditorSplit.tsx; (3) the App-level close wiring (`requestClose`/`resolveClose`/dirty-probe registry) + the × routing are untested by automation (accepted per the manual-host-UI convention + live 9/9 verification). Reviewer: well-built, idiomatic, closes a latent WP7 lifecycle gap. See [`workflow/backlog-quality-findings.md`](backlog-quality-findings.md) → `# qol-wp1-close-workspace — 2026-06-25`.
- **Priority:** low (all)
- **Status:** pending
- **Pickup shape:** two are one-line comment trims (`/feature-refactor`); the third is a test-harness gap that only matters once the project adopts RTL/E2E (deferred per Phase-1 convention). Dismiss any via the WIP's `## Code-Quality Review` section.

## Code-quality findings — qol-wp0-fs-watcher (2026-06-24)
- **Pointer:** 3 MINOR findings (0 CRITICAL, 0 MAJOR) from `feature-review-quality` on ship commit `d893254` — all forward-looking, none a defect at current scope: (1) `fs-change` re-walk amplification under bulk external ops (RightPanelHost.tsx); (2) steady-state emit-failure invisibility in the debouncer callback (fs_watch/commands.rs); (3) `is_ignored` `is_dir=false` documented-sound edge (fs_watch/mod.rs). Reviewer: well-built, textbook instance of repo conventions. See [`workflow/backlog-quality-findings.md`](backlog-quality-findings.md) → `# qol-wp0-fs-watcher — 2026-06-24`.
- **Priority:** low (all)
- **Status:** pending
- **Pickup shape:** all three are optional `/feature-refactor` items (a trailing-edge re-walk coalesce; a watcher-degraded signal; or dismiss the `is_dir` note). None changes correctness or a hand-off contract. Dismiss any via the WIP's `## Code-Quality Review` section.

## SURFACE-2026-06-24-SWITCH-WORKSPACE-AUTOFOCUS-CC-PANEL
- **Source:** operator request (2026-06-24, during the app-menu feature)
- **Target level:** feature (small) — workspace-switch UX
- **Type:** new-work (UX refinement)
- **Summary:** When the user switches the center-stage workspace (filmstrip click, ⌘⇧+digit, or — soon — the Workspace menu), Claudesk should **auto-focus the left CC terminal panel** of the newly-promoted workspace, so typing goes straight to that project's Claude Code session without a manual click. Today focus is not moved on promote, so the user must click into the left half first.
- **Context:** The center-stage left half is the xterm.js CC terminal (`TerminalPane` / the CC session). The promote path is `focusWorkspace(id)` in `useWorkspaceList` (called from `App.tsx` filmstrip click + the ⌘⇧+digit handler at `App.tsx:73`, and `Filmstrip.tsx`). Auto-focusing means, after the display:block flip, calling `.focus()` on the promoted workspace's xterm instance (or its textarea). Mind the "all workspaces stay mounted, switch is display toggling" rule — focus must move to the now-visible terminal, and only when the left CC panel is the intended target (per the WP4b left/right focus-indicator work, focus has a notion of which half is active).
- **Open question:** should it ALWAYS focus the CC (left) panel, or restore the last-focused half of that workspace? Operator said "left CC panel" → default to always-CC-left for v1; revisit if it fights the focus-indicator memory.
- **Priority:** medium
- **Status:** RESOLVED 2026-06-25 (QoL-WP3, commit 78c76d6) — imperative `focus()`-only handle on XtermPane fired from a Workspace `visible`-edge effect; all four promote triggers route through the single seam; always-CC-left for v1; focus-only (no PTY byte). Operator-verified live.

## SURFACE-2026-06-24-EDITOR-ADD-NEW-FILE
- **Source:** operator request (2026-06-24, during the app-menu feature)
- **Target level:** feature (small/medium) — editor capability
- **Type:** new-work (editor feature)
- **Summary:** The lite editor needs an **"Add New File"** affordance — create a new file in the workspace (likely from the file-tree rail and/or a New File menu/command), name it, and open it in an editor tab. Today the editor can only open existing files (via finder ⌘P, the file tree, diff "Open", or search results); there is no create-file path.
- **Context:** File IO is `editor_fs` (`read_file` / `write_file` / `stat_file`, all root-confined). A new file = a `write_file` of an empty (or templated) buffer at a chosen path under the workspace root, then `openFile(path)` into the focused pane (the `RightPanelHost.openFile` seam). UI surface candidates: a "+"/context-menu action in the `FileTree` rail (`src/components/workspace/filetree/`), and/or a command-palette entry, and/or a File-menu item once the native menu lands (this current feature). Needs: a name/path input (inline rename-style or a small prompt), collision handling (don't clobber an existing file), and respecting the gitignore-honoring tree walk for refresh. Pairs naturally with the deferred editor file-watcher SURFACE.
- **Note:** this is a genuine NEW editor feature (not a menu mirror) — explicitly OUT of scope for the current app-menu feature, which mirrors existing features only. When the menu ships, a "New File" File-menu item can be added in a follow-up once this backend+UI exists.
- **Priority:** medium
- **Status:** open

## SURFACE-2026-06-24-STATUS-INDICATOR-BUSY-VS-AWAITING-INPUT
- **Source:** operator observation (2026-06-24, screenshot) — during the app-menu feature
- **Target level:** feature (small) or incident-adjacent — status-channel semantics
- **Type:** bug-shape / refinement (wrong status state)
- **Summary:** When CC is running a **background job or a subagent**, the workspace status indicator shows **"awaiting input"** (blue), which is misleading — CC is actually BUSY working, not waiting on the user. It should map to **busy/running**, or a distinct new state, rather than awaiting-input.
- **Context:** The status comes purely from CC's official hook channel (M3): the Perl hook → `AF_UNIX` socket → `status_broadcaster` → `workspace-status` emit. The current mapping (`status_broadcaster`): `UserPromptSubmit`→running, `Stop`→idle, `Notification`→awaiting-input. The likely root cause: CC emits a `Notification` hook event when a subagent/background task posts a notification (or needs attention) MID-RUN, and the broadcaster unconditionally maps every `Notification`→AwaitingInput. So a notification fired while CC is still working flips the indicator to blue "awaiting input" even though no user input is actually pending. **Investigate:** the real `Notification` payload during a subagent/background run (the `message` field may distinguish "permission needed / waiting" from an informational/progress notification) — then refine the `Notification`→state mapping (e.g. only map to AwaitingInput for genuine input-needed notifications; treat subagent/background notifications as busy/running, or add a distinct "busy" state). Files: `src-tauri/src/status_broadcaster/mod.rs` (the HookEvent→state transform), the status DTO, and the frontend indicator state set (`useWorkspaceStatus` + the dot rendering). Relates to SURFACE-2026-06-22-WP1-NOTIFICATION-PAYLOAD-NOT-LIVE-CAPTURED (the Notification payload was never fully live-captured — this is the live signal that exposes the gap).
- **REVISED HYPOTHESIS (operator, 2026-06-24):** the trigger may NOT be subagents/background jobs per se — it may be the **`AskUserQuestion` tool**. Hypothesis: when CC calls `AskUserQuestion`, CC fires a `Notification` hook → indicator → AwaitingInput (CORRECT at that moment — CC genuinely awaits the answer). BUT after the user answers in the tool-call UI, the state stays **STUCK at AwaitingInput** — CC resumes working yet no event flips it back to running. So the bug is likely a **missing/!misordered "resumed-working" signal after an AskUserQuestion answer**, not a mis-mapped Notification. The earlier subagent/background framing may just be the cases where an AskUserQuestion (or similar mid-turn prompt) happened to fire.
- **What this changes for investigation:** the live-capture should specifically (1) trigger an `AskUserQuestion`, observe the indicator go AwaitingInput, (2) ANSWER it, and watch whether ANY hook event fires afterward (a `UserPromptSubmit`? a new `Stop`? nothing?). The likely root cause is that answering a tool-call prompt does NOT emit `UserPromptSubmit` (that's only for top-level prompts), so the broadcaster never sees a running signal and the dot stays blue until the next real `Stop`/`UserPromptSubmit`. Fix candidates: map the post-answer resumption (whatever event CC does emit — possibly a `PreToolUse`/`PostToolUse` or the next `Stop`) back to running/busy; or treat AwaitingInput as auto-clearing on the next ANY-activity event. Confirm against the real hook stream before choosing.
- **Recommended workflow:** `/feature-reproduce` (bug-shape: indicator stuck in wrong state) — drive a real CC session that calls `AskUserQuestion`, capture the FULL hook event sequence across ask→answer→resume, then plan the mapping/clear-condition fix. The transition OUT of AwaitingInput is the crux, more than the transition in.
- **Priority:** medium-high (it actively misleads the core dogfood signal — the awaiting-input dot is THE "this project needs me" cue; a STUCK false-positive is worse than a transient one because the project looks like it needs you when it doesn't)
- **Status:** RESOLVED 2026-06-25 (QoL-WP2, commit 7cfc464). Empirically confirmed via live hook-stream capture: the revised hypothesis was half-right — answering does NOT emit `UserPromptSubmit`, BUT CC DOES fire `PostToolUse(AskUserQuestion)` on resume; Claudesk just wasn't registered for it. Fix: register `PostToolUse → Running` (clears the stuck blue on answer) + gate `Notification → AwaitingInput` on `notification_type` (idle nudges no longer flip a busy dot blue). Operator-verified live in the installed `.app`. (Phase 1.5 also added the operator-requested breathe/blink dot animation + filmstrip caption transparency.)

## SURFACE-2026-06-24-NEW-WORKSPACE-HOTKEY
- **Source:** operator question during app-menu verify-human (2026-06-24)
- **Target level:** feature (tiny) — keyboard chord
- **Type:** new-work (new keyboard binding)
- **Summary:** The native menu's "New Workspace" item shows the accelerator **⌘⇧N** as DISPLAY-ONLY text — pressing ⌘⇧N on the keyboard does **nothing** (the menu carries no real accelerators by design; New Workspace is reachable only by clicking the menu item or the filmstrip "+"). Wire ⌘⇧N as an actual hotkey that opens the picker, to match the displayed label.
- **Context:** Out of scope for the app-menu feature (which mirrors EXISTING features — New Workspace had no hotkey before). Implementation is the established pattern: a pure `newWorkspaceChord` predicate (`e.metaKey && e.shiftKey && e.key.toLowerCase()==="n"`) + an App.tsx capture-phase document keydown listener calling `setShowPicker(true)` (same shape as `workspaceSwitchChord` in App.tsx). ⌘⇧N is disjoint from all existing chords. Pairs with reserving ⌘N for the editor's add-new-file (SURFACE-2026-06-24-EDITOR-ADD-NEW-FILE) — do them together so ⌘N and ⌘⇧N land coherently.
- **Priority:** low (the click path works; this is the keyboard-parity nicety the label promises)
- **Status:** open

## SURFACE-2026-06-24-NO-WAY-TO-CLOSE-A-WORKSPACE
- **Source:** operator request (2026-06-24, during the app-menu feature)
- **Target level:** feature (small/medium) — workspace lifecycle
- **Type:** new-work (missing capability — genuine gap)
- **Summary:** There is currently **no way to close an open workspace.** A workspace can be OPENED (picker / filmstrip "+" → `openWorkspace` appends) and switched, but never removed from the roster. The user needs a close affordance — e.g. an × on each filmstrip tile (and/or a "Close Workspace" menu item once the native menu lands, with ⌘⇧W as the natural accelerator), that deregisters the workspace, kills its CC session, and removes its tile.
- **Context:** `useWorkspaceList` / `state/workspace.ts` has `openWorkspace`, `focusWorkspace`, `setSessionId` but **no `closeWorkspace` reducer**. Closing must: (1) add a `closeWorkspace(state, id)` reducer (remove from `workspaces`, pick a new `focusedId` — e.g. the previous tile, or null → back to the full-screen picker when the last one closes); (2) kill that workspace's CC PTY session (`cc_kill` on its `cc_session_id`) and the second-terminal shell; (3) `workspace_deregister` it from the status broadcaster registry (the open path calls `workspace_register`); (4) drop its persisted filmstrip-order entry. UI: an × button on each `Filmstrip` tile (appears on hover) is the primary affordance; a "Close Workspace" item could join the native Workspace menu (this feature) afterward. Mind the "all workspaces stay mounted" rule — closing is a real unmount + teardown, distinct from the display:none background-keep.
- **Edge cases:** closing the focused workspace (must promote another to center stage); closing the LAST workspace (return to the full-screen picker, `view → "picker"`); a dirty editor tab in the closing workspace (confirm-before-close? — or defer that to the editor's own dirty guard).
- **Note:** explicitly OUT of scope for the current app-menu feature (which mirrors EXISTING features only — and "close workspace" does not exist yet). Once this ships, a "Close Workspace ⌘⇧W" item is a natural addition to the native Workspace menu in a follow-up.
- **Priority:** high (it's a basic lifecycle gap — workspaces accumulate with no way to remove them; directly impedes the multi-workspace daily-driver use case the M3+M4 dogfood depends on)
- **Status:** RESOLVED 2026-06-25 (QoL-WP1, commit c01a3f9) — filmstrip × on expanded tiles + collapsed pills; per-pane `cc_kill`-on-unmount reaps CC + second-terminal; deregister/watch-stop ride the status diff loop; dirty-tab discard/cancel guard; focus re-pick (left-neighbour / last→picker). The "Close Workspace ⌘⇧W" native-menu item remains the noted follow-up (not in this WP).

## SURFACE-2026-06-24-TERMINAL-SPURIOUS-NEWLINE-ON-PANEL-SWITCH
- **Source:** operator observation (2026-06-24, screenshot — the WP9 second-terminal panel) during the app-menu feature
- **Target level:** feature (small) / bug-shape — terminal panel focus/resize behavior
- **Type:** bug-shape (spurious input)
- **Summary:** Switching between workspaces, or between the right-panel tabs Terminal↔Editor / Terminal↔Diff, makes the **terminal emit a new (empty) prompt line** each time — the screenshot shows a stack of empty `stayman@… claudesk %` prompts accumulating. The terminal should NOT receive any input on a panel/workspace switch; an empty line (a bare CR/Enter, or a stray byte) is being delivered to the PTY on show/focus.
- **Context:** This is the WP9 second-terminal panel (`TerminalPane` — a login shell, reusing `cc_input`/`cc_resize`). The panel stays MOUNTED and is shown/hidden via `display:none` (per "all workspaces stay mounted"); on becoming visible it likely runs a `FitAddon.fit()` + `.focus()` (the rAF fit+focus pattern noted in the wp7-pty-cc-session code-quality findings). **Likely root cause:** the show/focus path sends a stray byte to the PTY — candidates: (1) a `cc_resize` that the shell echoes as a prompt redraw (a resize alone shouldn't emit a newline, but a fit-triggered SIGWINCH + prompt-reprint can LOOK like a new line); (2) an actual stray `\r`/`\n` written to `cc_input` on focus; (3) xterm re-rendering buffered scrollback such that the prompt repaints. Distinguish "real new prompt (input was sent)" from "cosmetic reprint (no input, just a redraw)" first — the fix differs. Note this is the SECOND-terminal (shell) panel; check whether the LEFT CC terminal has the same issue (the SURFACE-2026-06-24-SWITCH-WORKSPACE-AUTOFOCUS-CC-PANEL auto-focus work will exercise the same focus path, so these two pair up).
- **Files:** `src/components/workspace/TerminalPane.tsx` (the show/visible effect — fit/focus/resize on becoming active), `XtermPane.tsx` (the xterm instance + cc_input/cc_resize wiring), `src-tauri/src/cc_session` (resize handling). The rAF fit+focus duplication is already a noted MINOR (wp7-pty-cc-session finding #4).
- **Recommended workflow:** `/feature-reproduce` — switch panels with a terminal open, confirm whether a byte actually reaches the PTY (instrument `cc_input`) vs. a pure cosmetic reprint, then fix the show/focus path to not send input.
- **Priority:** medium (cosmetic-to-mildly-annoying; doesn't corrupt the shell, but accumulates noise and could mis-fire if a partial command was typed)
- **Status:** RESOLVED 2026-06-25 (QoL-WP4, commit 10c604f). The reproduce reframed it: not a stray byte but full session teardown+respawn — `active` was an unconditional spawn-effect dependency, so every panel/center-stage switch-back re-ran the effect → a fresh `term_spawn` → a new shell PTY → lost history + stacked prompts. Fixed frontend-only by spawning ONCE: a pure `shouldSpawnOnActive` predicate + a `[active, bridge.phase]` trigger effect bumping `spawnNonce` once, `active` removed from the spawn deps, `spawnNonce===0` sentinel + `hasSpawnedRef` latch making re-activation inert. Operator-verified all 5 live outcomes (history survives switches, no stacked prompts, LEFT CC pane unaffected, deferred-spawn intact). 3 MINOR code-quality findings auto-backlogged (see the qol-wp4 pointer above).

## SURFACE-2026-06-24-FILETREE-GIT-INDICATOR-BUBBLE-UP-TO-PARENTS
- **Source:** operator request (2026-06-24, during the app-menu feature)
- **Target level:** feature (small) — file-tree git-status UX
- **Type:** new-work (UX refinement on the M2 WP11 git-status indicators)
- **Summary:** The file-tree rail's git-status indicators (the Sublime-sidebar-style per-file modified/added/etc. markers next to file rows) should **bubble up to the parent folders** — a folder containing a changed file should itself show a roll-up status marker, so the user can spot which collapsed directories contain changes without expanding them. Today only the leaf file rows carry indicators (M2 WP11); a collapsed folder hiding a modified file shows nothing.
- **Context:** M2 WP11 shipped `git_file_statuses` (backend per-path working-tree status map, re-based to the workspace root — see the WP11 path-keying task `m2-wp11-git-status-path-keying`) consumed by the `FileTree` rows (`src/components/workspace/filetree/`). The bubble-up is a **frontend derivation**: for each directory node, aggregate the statuses of its descendants into a roll-up marker (e.g. show "modified" if any descendant is modified; pick a precedence among modified/added/untracked/deleted when a folder contains a mix). The backend map already has every changed path, so no new backend command is needed — it's an aggregation + a folder-row indicator render. Decide the precedence/merge rule (Sublime/VS Code show a single dominant color; VS Code uses a count badge too) and whether to show on collapsed folders only or always.
- **Suggested action:** in the FileTree, build a directory→rolled-up-status map from the existing `git_file_statuses` (walk descendants or fold bottom-up over the tree), then render a folder-row indicator using the same marker styling as file rows. Pairs with the existing `gitStatusRefreshKey` refresh seam (recompute the roll-up on the same save/load triggers).
- **Priority:** medium
- **Status:** open

## SURFACE-2026-06-24-HOMEBREW-DISTRIBUTION-VIA-UNSIGNED-PERSONAL-TAP
- **Source:** operator request (developer friends asked for `brew install`, 2026-06-24)
- **Target level:** product (next cycle) — distribution; subset of the roadmap's M9 "Polish & Open-Source Release", pulled forward by live external demand.
- **Type:** new-work (distribution channel)
- **Summary:** Distribute Claudesk via a **Homebrew personal tap** (`brew tap stayman/claudesk && brew install --cask claudesk`) so a handful of same-workflow developer friends can install it. **Decision made 2026-06-24: ship UNSIGNED first — NO Apple Developer account / no notarization for v1.**
- **Why unsigned is viable (the key finding):** Gatekeeper challenges at *launch*, not install — so `brew install --cask` of an unsigned `.dmg` succeeds fine; the only friction is a one-time-per-install quarantine clear. Friends either run `brew install --cask --no-quarantine claudesk` (no further step) OR `xattr -dr com.apple.quarantine /Applications/Claudesk.app` once per install (re-run after each update — quarantine re-attaches to the new bundle). Developer friends will shrug at one documented line. This collapses the cost from "$99/yr Apple acct + notarization pipeline" to just "GitHub release + a ~15-line cask in a tap repo" — free + easy.
- **Hard constraints:** (1) The OFFICIAL `homebrew-cask` tap REJECTS unsigned/un-notarized apps — so this MUST be the operator's **own tap** (`stayman/claudesk` → repo `homebrew-claudesk`), not a `homebrew-cask` PR. Own-tap is better here anyway (full control, no review). (2) Needs a GitHub remote first — the repo is currently local-only (no remote). To publish: `gh repo create claudesk --private --source=. --remote=origin --push` (or public).
- **Plan shape (the concrete sequence):** (1) push claudesk to GitHub + cut a tagged release with the `pnpm tauri build` `.dmg` (`Claudesk_<ver>_aarch64.dmg`) as an asset; (2) create the `homebrew-claudesk` tap repo with a `Casks/claudesk.rb` cask (version + url → the release asset + sha256); (3) README/tap-README instructions documenting the `--no-quarantine` install (or the one-time `xattr`); (4) optional nicety: a release CI workflow (GitHub Actions on tag-push) that builds the `.dmg` + updates the cask sha256, so cutting a release is one `git tag` push.
- **Deferred to true M9 (signing-as-upgrade):** Developer-ID signing + notarization (removes the quarantine step entirely → zero-friction for any audience) + `tauri-plugin-updater` (in-app auto-update, so friends don't re-`brew`). These are a clean later upgrade ON TOP of the unsigned tap — not a v1 blocker.
- **NEW SKILL required (operator directive 2026-06-24):** build a **dedicated, MANUAL-ONLY release skill** (project-local, e.g. `.claude/skills/release/`) that drives this release task (build → tag → GitHub release → cask update). **CRITICAL: it must NOT be auto-invokable by `feature-ship` or `product-finalize`** — those close skills must never mistakenly trigger a release. The skill is invoked only by the operator by hand (`/release` or similar). Design it as a standalone skill with no transition wiring into the feature/product state machines.
- **Priority:** high (live external demand; the operator's chosen next work)
- **Status:** RESOLVED (distribution) + RESOLVED (skill) 2026-06-24. **Distribution:** the claudesk repo is pushed to `github.com/StaymanHou/Claudesk` (public), tag `v0.1.0` cut, and a GitHub release published with `Claudesk_0.1.0_aarch64.dmg`. The `homebrew-claudesk` tap repo (public; nested at `homebrew-claudesk/` inside this project but its own git repo, gitignored here) carries `Casks/claudesk.rb` (v0.1.0, sha256-matched to the live asset, `brew audit`+`brew style` clean). Verified end-to-end on a reset tap/install state: `brew tap StaymanHou/claudesk && brew trust --cask … && brew install --cask claudesk && xattr -dr com.apple.quarantine …` installs + launches; release asset is publicly downloadable and the v0.1.0 build carries the GUI-PATH fix (`7cd34ad`). README gained a top-level **Install** (Homebrew) section + a **Develop / contribute** section; the build-it-yourself flow is now **Build from source**. **Key finding:** Homebrew 6.x removed `--no-quarantine`, so docs use plain `install` + a one-time `xattr` instead. **Skill:** `/release` skill authored at `.claude/skills/release/SKILL.md` — manual-only, explicitly un-wired from `feature-ship`/`product-finalize`. **DEFERRED to M9 (signing-as-upgrade):** Developer-ID signing + notarization + `tauri-plugin-updater` (removes the `xattr` step + enables in-app auto-update); also Apple-Silicon-only today (no x86_64/universal asset). Optional release-CI (GH Actions on tag-push) NOT built.

## Code-quality findings — app-menu-bar (2026-06-24)
- **Pointer:** 1 MAJOR + 2 MINOR from `feature-review-quality` on ship commit `f815154` (0 CRITICAL). MAJOR: the 11 functional menu-item id strings are duplicated across Rust `app_menu::ids` and TS `MENU_IDS` with NO mechanical guard — a one-char drift silently dead-clicks one menu item with green tests. MINORs: label-only-id test needs a one-line comment; the App.tsx `menu` listener isn't extracted to a pure testable seam. See [`workflow/backlog-quality-findings.md`](backlog-quality-findings.md) → `# app-menu-bar — 2026-06-24`.
- **Priority:** medium (the MAJOR) + low (the 2 MINORs)
- **Status:** pending
- **Pickup shape:** the MAJOR is the highest value — add a mechanical id-contract pin (cheapest: a Rust test that reads menuBridge.ts and asserts each `ids::*` literal appears as a `MENU_IDS` value). The 2 MINORs are a one-line comment + an optional listener extraction. One `/feature-refactor` pass. Dismiss any via the WIP's `## Code-Quality Review` section.

## Code-quality findings — dev-prod-isolation (2026-06-24)
- **Pointer:** 3 MINOR findings (0 CRITICAL, 0 MAJOR) from `feature-review-quality` on ship commit `5f9a86a` — all low-risk coupling/drift seams: a duplicated `PROJECTS_FILE` const, an undocumented no-spaces-in-`.pl`-segments assumption in the basename matcher, and an implicit prod↔overlay window-size coupling in `tauri.dev.json`. See [`workflow/backlog-quality-findings.md`](backlog-quality-findings.md) → `# dev-prod-isolation — 2026-06-24`.
- **Priority:** low (all)
- **Status:** pending
- **Pickup shape:** all three are trivial doc/refactor nits in one `/feature-refactor` pass (or opportunistically); none changes correctness or any hand-off contract. The `pub(crate)` const dedup is the only code change; the other two are one-line comments. Dismiss any via the WIP's `## Code-Quality Review` section.

## SURFACE-2026-06-23-VERIFY-SELF-DRIVER-FOR-WORKSPACE-UI
- **What:** Adopt (or deliberately reject) a real-app UI driver for `feature-verify-self` so workspace-UI features can be agent-verified instead of always punting to native `verify-human`. **Decide at next-milestone (M5 PiP) planning.**
- **The gap:** The current verify-self path drives **Playwright (MCP) against the Vite dev URL as a plain browser** — which has **no Tauri IPC** (`window.__TAURI_INTERNALS__` undefined), so `list_projects`/`cc_spawn`/`listen("workspace-status")` all throw, no `.workspace` ever mounts, and **every live-DOM Observable Outcome comes back UNVERIFIED**. This has now bitten **three consecutive workspace-UI features (M4 WP3 filmstrip, WP4 collapse, WP4b focus indicator)** — each re-discovered the dead-end mid-verify-self and forwarded the visual checks to the operator. Pure logic (`deriveFocusHalf`, reorder reducers, tile derivation) IS unit-covered; it's the *wiring + render + interaction* layer that has no agent-side net.
- **Why M5, not WP5:** M5 (Picture-in-picture) is **more workspace-status rendering** (live ~1 fps mirrors in an NSPanel webview) — the exact surface this gap blocks. The next milestone's planning is the right moment to decide the testing posture *before* building another un-agent-verifiable surface. (M4 WP5 is just the milestone-exit verify and will run as native verify-human regardless.)
- **Lead candidate (found 2026-06-23, corrects an earlier "no off-the-shelf server exists" claim):** **[`hypothesi/mcp-server-tauri`](https://github.com/hypothesi/mcp-server-tauri)** — an MCP server + `tauri-plugin-mcp-bridge` Rust plugin (WebSocket :9223, **NOT** WebDriver/CDP). It drives the **real WKWebView with live IPC**, so workspaces actually mount — directly dissolving the gap. 21 tools incl. `webview_interact` (click/type), `webview_dom_snapshot`, `webview_execute_js`, `read_logs` (console), **plus `ipc_monitor` / execute-Tauri-command / backend-state** — the latter being the *only* tooling that could catch the frontend↔backend contract-drift class of bug (cf. `SURFACE`-worthy WP4b root cause: a silently-orphaned CSS rule after the WP11-Phase-5 DOM rename). Maturity: v0.11.2, 28 releases, last release ~May 2026, 244★ — beyond experimental, but self-disclosed "developed with agentic tools, may contain bugs."
- **Hard requirement if adopted:** the bridge plugin **binds `0.0.0.0:9223` by default** — MUST be gated `#[cfg(debug_assertions)]` around `tauri_plugin_mcp_bridge::init()` so it compiles OUT of `tauri build` release binaries (verify post-build: `nm -a ./target/release/claudesk | grep -i mcp` → empty). Fits Claudesk's lean-bundle / no-extra-permission posture ONLY as a dev-only dep.
- **Caveats to verify before committing:** (1) **macOS/WKWebView fidelity** — README lists macOS but webview-automation tools are often weaker on WebKit than Chromium; needs a real smoke test on Claudesk. (2) **verify-self wiring** — its tool names (`webview_interact`, `webview_dom_snapshot`, …) differ from the Playwright-MCP names `feature-verify-self-runner` assumes; either update the agent def/skill or run both MCPs. (3) self-disclosed maturity (acceptable for a compiled-out dev/test dep; weight differently than a runtime dep).
- **Alternatives if rejected/insufficient (the full solution space, from cheapest):** (a) **status quo** — codify the posture, keep pure-seam unit tests + native verify-human, accept no agent-side interaction net; (b) **`@tauri-apps/api/mocks` (`mockIPC`)** behind a dev flag so the *existing* Playwright MCP can mount a fake-backend page — cheap + repeatable but tests frontend against a fake backend (contract-drift risk, the very class above); (c) **`tauri-driver` + WebDriver** (official) behind a hand-rolled MCP shim — real backend, but heaviest setup + a separate runner from vitest. `mcp-server-tauri` is attractive precisely because it's higher-fidelity than (b) AND lighter-to-operate than (c).
- **General principle (for the roadmap, and any future native target):** an MCP UI-driver is worth its weight only when the target lacks a *fast, faithful, headless* way to exercise the surface AND that surface's correctness can't be pushed down into pure/snapshot tests. Web gets all three free (the browser driver is also the cheap tier); native (desktop Tauri / mobile) does not — push correctness into unit + snapshot/preview tests first, reserve a full-UI driver for the sparse end-to-end gate. So this is NOT "always add an MCP replacement" — it's "evaluate the driver tier deliberately per target."
- **Priority:** high
- **Status:** pending — revisit at M5 (PiP) planning; the [`deep-research`] / online check on `mcp-server-tauri` is done (this entry), what remains is the macOS smoke test + the adopt/reject decision.

## SURFACE-2026-06-22-WP5-DROPPED-WATCH-WORKFLOW-DOC-HIERARCHY
- **What:** M3 WP5 (specced as a `workflow/.session.md` file-watcher → broadcaster) is **DROPPED**. The WBS framed `.session.md` as a real-time second workflow-state signal — but it isn't: `.session.md` is a *manual handoff bookmark* created **only** by `/session-pause` and deleted by `/session-resume` (verified against `~/.claude/skills/session-pause` + `session-resume` SKILL.md). It is absent during all active work, present only in the parked gap between sessions, binary, and known to the user before any watcher could report it. Watching it yields a near-constant, trivially-derivable signal — no live workflow state to detect.
- **Consequence for M3:** M3's goal (CC idle/running/awaiting from the official hook channel, never PTY scraping) is **fully met by WP1–WP4 + WP6**. With WP5 dropped, **Milestone 3 is COMPLETE** → `/product-finalize`.
- **New WP idea (operator-defined 2026-06-22, deferred to a later milestone — NOT M3):** instead of `.session.md`, watch the **workflow document hierarchy** to surface where a project actually is in the workflow: `roadmap.md → wbs.md → workflow/wip/*.md` (possibly multiple WIP files — tasks can fork mid-feature) → `backlog.md`. This is the genuine live workflow state (the WIP Work Tree / Current Node mutates continuously as skills run; roadmap/wbs give the milestone context). Reuses the `notify` watcher seam that `SURFACE-2026-06-21-EDITOR-FILE-WATCHER` also wants.
- **Hard part (acknowledged, NOT a blocker):** visually representing the whole tree (roadmap→wbs→wip(s)→backlog) in the UI is the design challenge. **Good-to-have, not must-have.**
- **Anchored to Milestone 6 (menu-bar status item)** (operator decision 2026-06-22): the M6 popover is a one-row-per-workspace LIST (project name + status), which fits a workflow-position line (e.g. `acme-api · WBS M2/WP3 · building`) far better than a thumbnail tile — and by M6 the operator will have dogfooded M4+M5 and will know what workflow-position info is worth surfacing (resolves the "unsolved visualization" risk by deferring the design until there's real usage signal). NOT folded into M4/M5 (those are pure CC-state status-surface rendering; adding a workflow axis + tree viz mid-build is the wrong place). If it outgrows a popover line into a real tree view, promote to a standalone feature after M6. The `notify` watcher seam (shared with `SURFACE-2026-06-21-EDITOR-FILE-WATCHER`) gets built whenever the first consumer needs it — likely M6.
- **Priority:** medium (the new WP idea); the drop itself is a clean WBS correction, no work owed.
- **Status:** WP5 dropped (recorded in M3 wbs.md, archived); new WP idea deferred → anchored to M6 JIT decomposition.

## Code-quality findings — m3-wp6-frontend-status-indicator (2026-06-22)
- **Pointer:** 1 MAJOR + 2 MINOR findings from `feature-review-quality` on ship commit `b377a97` (0 CRITICAL). MAJOR: the `statusSnippet`/tooltip path is wired end-to-end (DTO `last_output_snippet` → prop → indicator `title`) but fed by nothing — `applyStatusUpdate` discards the snippet, no accessor, CenterStage never passes it, so the tooltip always falls to the label (contradicts the WIP's verify-human note). MINORs: `stateFor` closure re-created each render (Phase-2 perf nit); comment accuracy on the unfed snippet field. See [`workflow/backlog-quality-findings.md`](backlog-quality-findings.md) → `# m3-wp6-frontend-status-indicator — 2026-06-22`.
- **Priority:** medium (the MAJOR), low (the 2 MINORs)
- **Status:** pending
- **Pickup shape:** the MAJOR is a one-commit `/feature-refactor` fix-or-remove (thread the snippet ~15 lines across reducer+hook+CenterStage — the higher-value path, surfaces the Notification payload on hover — OR drop the unused frontend snippet surface). The 2 MINORs are trivial; minor #2 resolves automatically if the MAJOR's thread-it path is chosen. Dismiss any via the WIP's `## Code-Quality Review` section.

## Code-quality findings — m3-wp4-status-broadcaster (2026-06-22)
- **Pointer:** 3 MINOR findings from `feature-review-quality` on ship commit `8bc2d68` (0 CRITICAL, 0 MAJOR). All cosmetic docstring drift in `status_broadcaster/commands.rs`: (1) `start_broadcaster` docstring describes a `Result`-style error contract the `JoinHandle`-returning signature lacks; (2) `.expect()` on the thread spawn is a non-test panic path (mirrors WP3's `spawn_listener` precedent — convention judgment call); (3) the detached-handle asymmetry vs WP3's retained `_handle` is correct but undocumented. See [`workflow/backlog-quality-findings.md`](backlog-quality-findings.md) → `# m3-wp4-status-broadcaster — 2026-06-22`.
- **Priority:** low (all)
- **Status:** pending
- **Pickup shape:** trivial `/feature-refactor` doc-fix nits in one file; none changes correctness, emit behavior, or any hand-off contract. Items 1+3 are pure docstring corrections; item 2 is dismissable if WP3's `.expect` precedent stands. Dismiss any via the WIP's `## Code-Quality Review` section.

## Code-quality findings — m3-wp3-socket-listener (2026-06-22)
- **Pointer:** 3 MINOR findings from `feature-review-quality` on ship commit `4355e00` (0 CRITICAL, 0 MAJOR). All polish-tier: (1) `hook_socket_path` carries a hidden `create_dir_all` side effect (path-resolver name understates it); (2) accept-loop `BufReader::lines()` has no per-line length cap (trusted local writer, low risk); (3) `HOOK_SOCKET_NAME` `pub const` is over-exported (module-private suffices). See [`workflow/backlog-quality-findings.md`](backlog-quality-findings.md) → `# m3-wp3-socket-listener — 2026-06-22`.
- **Priority:** low (all)
- **Status:** pending
- **Pickup shape:** trivial `/feature-refactor` nits / opportunistic fixes; none changes correctness or the WP4 hand-off contract. Dismiss any via the WIP's `## Code-Quality Review` section.

## SURFACE-2026-06-22-APP-DATA-DIR-IS-BUNDLE-IDENTIFIER-NOT-PRODUCTNAME
- **Source:** feature:build (M3 WP2 Phase 2 verify-human live test)
- **Target level:** product:arch (+ CLAUDE.md doc fix)
- **Type:** doc-inaccuracy
- **Summary:** Multiple docs state the app-data dir is `~/Library/Application Support/Claudesk/`, but the live app resolves `app_data_dir()` to the bundle **identifier** path `~/Library/Application Support/com.claudesk.app/` (confirmed at WP2 launch: both `claudesk-hook.pl`/`hook.sock` and the existing `projects.json` live there). Affected lines: `CLAUDE.md:43,135`; `arch.md:37,114,228`; `roadmap.md:23`; `wbs.md:61,82` (the WP3 socket-path task).
- **Context:** Pre-existing since Phase 1 (config_store has used `app_data_dir()` all along) — not WP2-introduced; surfaced now because WP2 is the first doc that quotes the `hook.sock` path operationally. Harmless to the running code (the code uses `app_data_dir()`, never the hardcoded string), but a future session reading the docs will `ls` the wrong dir (as happened in this verify-human). WP3 binds the socket at this path — its task text quotes the wrong dir.
- **Suggested action:** Sweep `Claudesk/` → `com.claudesk.app/` in the 4 docs at finalize (or fix opportunistically in WP3 when the socket path is coded). One-line arch.md note: "app_data_dir() resolves to the bundle identifier (`com.claudesk.app`), not the productName."
- **Priority:** low
- **Status:** RESOLVED 2026-06-22 (M3 cycle-close `/product-finalize`) — `arch.md` now states the `com.claudesk.app/hook.sock` path with the bundle-identifier note (§A hook registration); `CLAUDE.md` Project Overview Sublime/app-data mentions and the WP2 status line already carry the `com.claudesk.app/` path. The hardcoded-`Claudesk/` string was always cosmetic (code uses `app_data_dir()`); the live-operational doc lines are corrected.

## Code-quality findings — m3-wp2-hook-install (2026-06-22)
- **Pointer:** 4 MINOR findings from `feature-review-quality` on ship commit `77d6a6e` (0 CRITICAL, 0 MAJOR). All cosmetic/opportunistic: (1) chmod/`/usr/bin/perl` exec-bit mismatch + inaccurate comment; (2) Perl hook write-side blocking heads-up (best addressed in WP3 when the listener lands); (3) `NotAnObject` error-variant coarseness; (4) pre-existing stale `sublime_open` comment at lib.rs:62. Reviewer: well-built, defensively-minded, standout test suite, no refactor warranted. See [`workflow/backlog-quality-findings.md`](backlog-quality-findings.md) → `# m3-wp2-hook-install — 2026-06-22`.
- **Priority:** low (all)
- **Status:** pending
- **Pickup shape:** trivial `/feature-refactor` nits — #2 defers to WP3 (the listener WP); #1/#3/#4 are quick opportunistic fixes. Dismiss any via the WIP's `## Code-Quality Review` section.

## SURFACE-2026-06-22-WP1-NOTIFICATION-PAYLOAD-NOT-LIVE-CAPTURED
- **Source:** feature:research (M3 WP1 probe)
- **Target level:** product:wbs (WP2 / WP6 interactive testing)
- **Type:** verification-gap (low-risk)
- **Summary:** WP1 first-hand OBSERVED `UserPromptSubmit` + `Stop` from a real `claude` (headless `--print`), but the `Notification` event's live payload was NOT first-hand captured — its shape (carries a `message` field) is inference-grade: documented by the working `claude-time/hook.pl` (lines 88–94) and proven parseable by our hook+parser in an offline test, but `Notification` doesn't fire in `--print` and an `expect`-driven interactive TUI only reliably produced `UserPromptSubmit` in the timing windows tried (same CC-raw-mode-TUI fragility the WP2 probe documented).
- **Context:** Not blocking — WP4's `Notification`→AwaitingInput mapping rests on a documented, parse-verified contract; the residual is purely "see it live." Cheap to confirm once Claudesk drives a real interactive CC session.
- **Suggested action:** During WP2 (hook script live test) or WP6 (frontend end-to-end verify-human against `pnpm tauri dev` + real `claude`), trigger a real `Notification` (idle-wait or a permission prompt) and capture its verbatim payload; confirm `message` + `cwd` + `session_id` match the inferred shape in `docs/product/wp1-hook-socket-probe-outcome.md`. Update that doc's `Notification` block from inference-grade to observed.
- **Priority:** low
- **Status:** RESOLVED 2026-06-22 (M3 WP6 Phase-3 verify-human, commit b377a97) — the live close-the-loop drove a real `pnpm tauri dev` + real `claude` session; a real `Notification` fired and turned the indicator AwaitingInput (blue), confirming the `Notification`→AwaitingInput chain end-to-end against an actual payload. The inference-grade contract is now observed-grade. (The same session also live-confirmed the WP3 socket bind + WP4 emit residuals.)

> **Scaffold-debt refactor pass — DONE 2026-06-17.** The 4 code-quality finding blocks below (6 MAJOR + 15 MINOR across wp1/wp2/wp3/wp4) were cleared via `/feature-refactor` before WP5. 20 findings fixed, 1 dismissed with rationale (WP2 `ReaderSink` enum — see that WIP's Code-Quality Review). Detail file: [`workflow/backlog-quality-findings.md`](backlog-quality-findings.md).

> **Phase 1 cycle-close backlog sweep — 2026-06-19 (`/product-finalize`).** Phase 1 (Bare Shell + Tab Substrate PoC) closed; all 9 WPs shipped. Sweep disposition of the items still pending at close: **all DEFERRED → carry to the Phase 2 cycle** (none escalated, none newly resolved by the close itself). Carried forward: wp5/wp6/wp7/wp8/wp9 code-quality findings (the **wp6 picker IPC error-surfacing MAJORs are the most load-bearing** — they pair with Phase 2's multi-workspace picker work, WP13/WP16) + `SURFACE-2026-06-18-MEMORY-MD-PRETTIER-NITS` (housekeeping). These remain in this file (not archived) so the next cycle inherits them.

> **Milestone 2 cycle-close backlog sweep — 2026-06-22 (`/product-finalize`).** M2 (Lite Editor + Diff Viewer) closed; all WPs shipped + the terminal blank-cursor P1 incident resolved. Sweep disposition: the WP11 git-status **MAJOR** was RESOLVED during the cycle (task `m2-wp11-git-status-path-keying`); **all remaining pending items DEFERRED → carry to the next cycle** (operator decision — none escalated, none else newly resolved by the close). The deferred set is ~20 items, almost entirely cosmetic code-quality MINORs (wp5/6/7/8/9 + m2-wp2/3a/3c/4/4-polish/5/6/9/11/13 findings) plus forward-look SURFACEs that pair with future milestones: `SURFACE-2026-06-21-WP9-N-EDITORS-COST-AT-MULTIWORKSPACE` (→ multi-workspace milestone), `SURFACE-2026-06-21-EDITOR-FILE-WATCHER`, `SURFACE-2026-06-21-IPC-DTO-FIELD-CASE-TESTS-MISS-SERDE-SHAPE`, `SURFACE-2026-06-19-CM6-BUNDLE-SIZE-LAZY-LOAD`, `SURFACE-2026-06-21-WP7-PER-RESULT-PER-FILE-REPLACE`, `SURFACE-2026-06-20-WP10-ARROW-KEY-TREE-NAV`, `SURFACE-2026-06-20-WP3C-SHARED-DOC-CURSOR-RESET`, `SURFACE-2026-06-20-WP4-COMMIT-LOG-SCOPE-EXPANSION` (an arch-resync follow-up — largely reconciled in arch.md at this close), `SURFACE-2026-06-20-WP4-DIFF-VIEWER-POLISH-FOLLOWUPS`, `SURFACE-2026-06-22-PANETABS-COMPONENT-TEST-GAP`. Each item keeps its own `Status:` detail; this note records the en-masse deferral. **NOTE — roadmap rearrange pending:** the operator is reshaping the post-M2 roadmap right after this close, so the next `/product-wbs` should re-triage these against the revised milestone order (esp. the forward-look SURFACEs, whose target milestones may move).

## Code-quality findings — m2-wp13-close-tab-chord (2026-06-22)
- **Pointer:** 3 MINOR findings from `feature-review-quality` on ship commit `f8d6761` (0 CRITICAL, 0 MAJOR). Reviewer: well-built, tightly-scoped, no debt. All cosmetic: (1) `closeActiveTabRef` WHY-comment duplicates the render-fresh-ref rationale already at PaneTabs L257-263; (2) `CloseTabChordEvent` is a verbatim copy of `TabSwitchChordEvent` (a shared `ChordEvent` type would dedupe); (3) no test pins the documented Ctrl/Alt-permissive contract of the predicate. See [`workflow/backlog-quality-findings.md`](backlog-quality-findings.md) → `# m2-wp13-close-tab-chord — 2026-06-22`.
- **Priority:** low (all)
- **Status:** pending
- **Pickup shape:** all three are trivial `/feature-refactor` nits (consolidate a comment; optionally hoist a shared `ChordEvent` type; add one test case). Dismiss any via the WIP's `## Code-Quality Review` section.

## SURFACE-2026-06-22-PANETABS-COMPONENT-TEST-GAP
- **Source:** feature:verify-codify (WP13 — ⌘W close-active-tab)
- **Target level:** product:wbs (test-infra decision)
- **Type:** tech-debt
- **Summary:** WP13's vh.3 regression (the ⌘W `closeActiveTab` stale-closure bug — the memoized handle read pre-dirty `docs`, so a dirty tab closed silently instead of raising the confirm dialog) had NO automated test that would catch a recurrence. The fix was confirmed only at verify-human.
- **Context:** The dirty-guard routing lives in the `PaneTabs` React component (reads the parent `docs` store + calls `setClosing`); `openFiles.ts` is dirty-unaware, so there's no pure-logic seam. The repo has no DOM/component test environment — vitest runs node-default, there are zero rendered-component tests, and `pure logic → vitest` is the standing posture. Closure-freshness defects in component event handlers (state X updates without dep Y changing) are a recurring foot-gun (same shape as the `overlayOpenRef`/`closeActiveTabRef` latest-ref patterns WP13 itself used) and are exactly what a component test would guard.
- **Suggested action:** When a future WP warrants it (or as a deliberate test-infra investment), add jsdom + `@testing-library/react` + a vitest `environment: "jsdom"` config, then write a `PaneTabs` test: render with an open dirty file tab, fire `closeActiveTab()` via the imperative handle, assert the confirm dialog opens (not an immediate close). Pairs with any future component-level coverage (RightPanelHost chord wiring, EditorSplit focus). NOT worth standing up the whole toolchain for this single assertion in isolation.
- **Priority:** low
- **Status:** pending
- **Added 2026-06-24 (app-menu-bar Phase 2):** another instance of the same class — App.tsx's `menu` Tauri-event listener had a StrictMode async-`listen` DOUBLE-REGISTRATION bug (the effect's cleanup ran before the `listen()` promise resolved, so the first subscription's unlisten was never captured → two live listeners → menu clicks double-dispatched → finder/search/palette toggles cancelled out). Caught only at verify-human; fixed with the `cancelled`-flag guard (mirrors `useWorkspaceStatus`). A `renderHook`/component test (render App with a fake `listen`, double-mount, assert exactly one live subscription) would guard this — exactly the kind of effect-lifecycle assertion this gap's toolchain would enable. Same verdict: not worth standing up jsdom for one assertion in isolation; fold into the same future test-infra investment.

## Code-quality findings — m2-wp11-tree-density-git-indicators (2026-06-21)
- **Pointer:** 1 MAJOR + 3 MINOR from `feature-review-quality` on ship commit `6bcbe1f` (0 CRITICAL). MAJOR: git-status path-keying mismatch — `fs_tree` keys are workspace-relative but `git_file_statuses` keys are git-repo-root-relative, so a workspace nested below its repo root renders NO indicators (silent, graceful). MINORs: non-UTF-8 path drop comment; redundant flex:1/margin-left:auto right-pin; prose-only GitFileStatus TS↔Rust contract. See [`workflow/backlog-quality-findings.md`](backlog-quality-findings.md) → `# m2-wp11-tree-density-git-indicators — 2026-06-21`.
- **Priority:** medium (MAJOR) + low (MINORs)
- **Status:** MAJOR RESOLVED 2026-06-22 (task `m2-wp11-git-status-path-keying`) — `status_map_core` now re-bases each git path to the workspace root (`within_repo_prefix` + `rebase_to_workspace`: strip the workspace's within-repo prefix, drop out-of-subtree entries, empty-prefix short-circuit preserves the ws==repo-root case). Also added `recurse_untracked_dirs(true)` so untracked subdirs report per-file (latent even at the baseline). +2 regression tests (nested-workspace key + sibling-omit) → 138 cargo pass. **3 MINORs STILL pending** (non-UTF-8 path drop comment; redundant flex:1/margin-left:auto right-pin; prose-only GitFileStatus TS↔Rust contract).
- **Pickup shape:** MAJOR done. The 3 MINORs remain — a quick `/feature-refactor` sweep. Dismiss any via the WIP's `## Code-Quality Review` section.

## SURFACE-2026-06-21-WP7-PER-RESULT-PER-FILE-REPLACE
- **Source:** feature:build (WP7 Phase 3 relevance gate — operator decision 2026-06-21)
- **Target level:** product:wbs (a WP7 follow-on, or a small standalone feature)
- **Type:** new-work
- **Summary:** WP7 Phase 3 shipped project-wide **Replace All** ONLY (an overlay Replace field + a confirmed replace-all-across-project). Per-result single-match replace and per-file replace — the other two scopes in the WP7 spec's "full depth" replace — were DEFERRED because the Phase-2 UX redirect moved results into a **read-only** "Find Results" synthetic tab that can't cleanly host per-row / per-file replace affordances.
- **Context:** the WP7 spec chose full replace depth (per-result + per-file + replace-all). The read-only-tab result surface (operator's chosen Sublime model) removed the writable result rows those two scopes attached to. Replace All covers the headline "rename a string across the project" use case; the finer scopes are a refinement.
- **Suggested action:** add per-result + per-file replace when there's a writable result surface — e.g. clickable per-file "replace in this file" markers rendered into the Find Results tab (via the synthetic click-line callback, the same seam clicks already use), or a richer results panel. Backend `project_replace` already does per-file rewrite; a scope param + a file-filter would extend it.
- **Priority:** medium
- **Status:** pending

## Code-quality findings — m2-wp7-project-search (2026-06-21)
- **Pointer:** 2 MAJOR + 2 MINOR findings from `feature-review-quality` on ship commit `8a788bf` (0 CRITICAL). Reviewer: well-built, advances the codebase more than it accrues debt; no refactor pass warranted. MAJORs are latent single-user-app design seams: (1) Replace All does replace-then-a-SEPARATE-research (two unsynchronized tree walks; the returned `ReplaceSummary` is discarded for a racy second walk); (2) `matches_replaced` is a per-line count but the mutation is whole-file `replace_all`, so a multiline regex can diverge count-vs-effect. MINORs: synthetic-tab font size isn't live (read once at render, unlike the editor's compartment); the `plural()` helper is duplicated across findResultsBuffer.ts + replaceConfirm.ts. See [`workflow/backlog-quality-findings.md`](backlog-quality-findings.md) → `# m2-wp7-project-search — 2026-06-21`.
- **Priority:** medium (2 MAJOR) + low (2 MINOR)
- **Status:** RESOLVED 2026-06-21 (`/feature-refactor`) — all 4 fixed (cleanup-only): MAJOR (1) documented the two walks as deliberate best-effort (re-search = the tab refresh; summary-toast = out-of-scope new UX); MAJOR (2) `replace_core` now counts over the whole-file string (count==effect under multiline regex; +1 test); MINOR — `SyntheticView` font-read-once documented; `plural()` hoisted to `searchModel.pluralCount` + both call sites import it. Full suite green: vitest 308, cargo 121, clippy/fmt/tsc/eslint/prettier clean. Per-finding RESOLVED notes in `backlog-quality-findings.md`.
- **Pickup shape:** MAJOR (1) — use the returned `ReplaceSummary` for the count, treat the result-list refresh as best-effort (or return post-replace matches in one pass); MAJOR (2) — count from the `replace_all` result, or guard/reject multiline patterns in replace. MINORs are quick `/feature-refactor` nits (a one-line "reads zoom at render-time, by design" comment; hoist `plural()` into `searchModel.ts`). Dismiss any via the WIP's `## Code-Quality Review` section.

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
- **Status:** **#1 (picker empty `catch {}` partial-failure window) RESOLVED 2026-06-23 by M4 WP2 P4.1 (`b48ccce`)** — the mount loader catch now surfaces an error toast. #2 (informational drift) + #3 (1-line comment) remain pending.
- **Pickup shape:** #2 is informational (dismiss/ack); #3 is a 1-line comment. Fold into a `/feature-refactor` pass or leave. Dismiss any via the WIP's `## Code-Quality Review` section.

## Code-quality findings — wp8-sublime-hotkey (2026-06-19)
- **Pointer:** 3 MINOR findings from `feature-review-quality` on ship commit `74dfc2c` (0 CRITICAL, 0 MAJOR). MINOR #1 (stale "global-shortcut handler" rationale) was FIXED IN-PLACE at the time. Of the 2 that remained: the `chord.ts` "Phase 2" header-tag nit is **MOOTED** — `chord.ts` was DELETED by the redefined WP8 (2026-06-20, commit `62869de`). The `sublime/mod.rs` WP3 probe-citation-shorthand nit is the **only one still pending** (backend untouched by the redefined WP8). See [`workflow/backlog-quality-findings.md`](backlog-quality-findings.md) → `# wp8-sublime-hotkey — 2026-06-19` section.
- **Priority:** low
- **Status:** pending (1 of 3 remaining — the `sublime/mod.rs` citation nit; the other 2 are resolved/mooted)
- **Pickup shape:** the lone remaining MINOR is a 1-line backend comment edit in `sublime/mod.rs` — fold into a `/feature-refactor` pass or leave. Dismiss via a WIP `## Code-Quality Review` section if not worth it.

## Code-quality findings — wp7-pty-cc-session (2026-06-19)
- **Pointer:** 4 MINOR findings from `feature-review-quality` on ship commit `50ca322` (0 CRITICAL, 0 MAJOR). Low-stakes: (1) `cc_kill` comment says SIGTERM but code does `/exit\r`→SIGKILL (comment drift); (2) `kill_all` serializes 3s grace windows under the registry lock — blocks window close at N>1 (Phase-2 N-clamp concern); (3) `onSessionId` inline-arrow in the spawn-effect dep array (safety is incidental via the phase guard, not structural); (4) rAF fit+focus pattern duplicated mount/post-spawn. Backend module rated the strongest part of the diff. See [`workflow/backlog-quality-findings.md`](backlog-quality-findings.md) → `# wp7-pty-cc-session — 2026-06-19` section.
- **Priority:** low (all)
- **Status:** **#2 (`kill_all` serializes 3s grace windows under the lock, blocks window-close at N>1) RESOLVED 2026-06-23 by M4 WP2 P3 (`b48ccce`)** — parallelized (one thread per session + join, lock not held across waits; deterministic timing test). #1 (comment drift), #3 (onSessionId dep), #4 (rAF dup) remain pending.
- **Pickup shape:** the remaining three are cleanup/comment fixes — fold into a `/feature-refactor` pass. Dismiss any via the WIP's `## Code-Quality Review` section if not worth it.

## Code-quality findings — wp6-project-config-store (2026-06-18)
- **Pointer:** 2 MAJOR + 3 MINOR findings from `feature-review-quality` on ship commit `525b7e8` (0 CRITICAL). MAJORs: the picker's IPC boundary has no error handling (mount loader silently swallows a rejected `list_projects`, masking a malformed `projects.json` as empty; mutation handlers drop rejections as unhandled promise rejections). MINORs: `add_project` doesn't refresh recents (asymmetry vs `handleRemove`), `add_project`/`record_open` byte-identical bodies, `now_ms()` `unwrap_or(0)` sentinel collides with recency ordering. Backend rated exemplary. See [`workflow/backlog-quality-findings.md`](backlog-quality-findings.md) → `# wp6-project-config-store — 2026-06-18` section.
- **Priority:** medium (MAJORs — picker error-surfacing, load-bearing for Phase 2 multi-workspace shell) + low (MINORs)
- **Status:** **2 MAJORs RESOLVED 2026-06-23 by M4 WP2 P4.1/P4.2 (`b48ccce`)** — the mount loader now surfaces a rejected prune/list via an error toast (no longer swallowed into an empty list), and the mutation handlers (`record_open`/`add_project`/`remove_project`) surface rejections via `mapIpcError` instead of dropping them. The 3 MINORs (add_project no-refresh, add_project/record_open dup bodies, now_ms sentinel) remain pending.
- **Pickup shape:** MAJORs done; the MINORs are low-effort polish — fold into a `/feature-refactor` pass or leave. Dismiss any via the WIP's `## Code-Quality Review` section if not worth it.

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
- **Status:** pending (DEFERRED, reconciled by M4 WP1 2026-06-22). M4 WP1 confirmed lazy-mount is NOT needed for the multi-workspace *runtime* cost envelope (eager-mount holds). This SURFACE is about a different axis — *startup parse time* — and stays deferred as a future startup-trimming lever (likely M9 polish), NOT an M4 mount-architecture requirement.

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
- **Status:** RESOLVED 2026-06-21 (WP12 Phase 2, per-pane tab strips) — the F23 re-plan to the VS Code split-editor-group model makes each pane own its own tab strip + open-file set, so a DIFFERENT file (or the SAME file with an independent buffer) can be open per pane. Supersedes the shared-doc viewport model. Confirm at WP12 verify-human; close at WP12 finalize.

## SURFACE-2026-06-20-WP4-VERIFY-SELF-DIALOG-STUB-WEDGE
- **Source:** feature:build (WP4 Phase 2 verify-self)
- **Target level:** product:wbs
- **Type:** tech-debt
- **Summary:** Stubbed-browser verify-self for workspace-level UI (editor/diff panels) is blocked when the only entry to a workspace is the picker's "Open Folder", which routes through the Tauri dialog plugin (`plugin:dialog|open`) rather than the `invoke` stub. Faking the dialog return hangs a promise and wedges the tab (reproduced 3×, incl. across a system reboot).
- **Context:** Distinct from the known reload-clobber gotcha. Editor WPs (WP2/3*) reached the editor via the open-bar (a plain `invoke` path) so verify-self worked; WP4's DiffPanel lives in a workspace only reachable via the folder dialog. The workaround used for WP4 was operator-driven verify-human in the real `pnpm tauri dev` app (a stronger check — real git_diff vs a real repo).
- **Suggested action:** Add a test-only seam to reach a workspace without the dialog — e.g. a `?ws=<path>` query param or a `window.__seedWorkspace(path)` dev hook gated to dev builds — so future editor/diff/panel WPs have a stub-friendly verify-self entry. Alternatively, stub the dialog plugin's invoke channel correctly (investigate the exact `plugin:dialog|open` request/response shape so the promise resolves).
- **Priority:** low
- **Status:** RESOLVED 2026-06-20 — WP6 Phase 2 (commit fc77ad4) built exactly the suggested seam: a DEV-gated `?ws=<path>` URL param + `window.__seedWorkspace(path)` (both → the existing `openWorkspace` reducer, dead-code-eliminated in prod). Confirmed effective: WP6 Phase 3 verify-self drove the finder→editor flow in a stub browser via `?ws=` (5/5 Playwright) — the wedge is unwedged. Makes WP7/WP10/WP9 (all editor/panel WPs) verify-self-able.

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
  - _(Former item 4 — "changed-line highlighting too faint" — DROPPED 2026-06-24 by operator decision during QoL-WBS triage; not a problem in practice.)_
- **Context:** WP4 grew M→L via the Sublime-Merge redesign; these were explicitly deferred to keep WP4 shippable. Items 1–3 are enhancements.
- **Suggested action:** A small follow-up WP after M2's critical path (or fold into WP5 RightPanelHost work, since the panel chrome is adjacent).
- **Priority:** medium (enhancements)
- **Status:** pending — items 1–3 folded into the 2026-06-24 QoL temporary WBS (`docs/product/qol-wbs.md`)

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
- **Status:** DISMISSED 2026-06-20 (WP5 spec) — **working-as-intended, not a bug.** Operator confirmed "open" always opens the live working-tree file regardless of which view (working-dir or commit) it was clicked from. Inspecting a file's content at a past commit is what Sublime Merge is for — and Sublime Merge is now a permanent surface (see SURFACE-2026-06-20-WP5-SUBLIME-MERGE-PERMANENT). The only code change is correcting the stale "deferred to WP5" comment at `DiffPanel.tsx:47-55` during WP5.

## SURFACE-2026-06-20-WP5-SUBLIME-MERGE-PERMANENT
- **Source:** feature:spec (WP5 RightPanelHost)
- **Target level:** product:finalize (durable-doc resync)
- **Type:** decision-reversal
- **Summary:** **Sublime Merge is kept as a permanent companion surface; only Sublime *Text* is replaced/removed.** Supersedes the prior blanket framing that "the in-app editor + diff viewer replace Sublime and WP8 removes the Sublime pop." Corrected split: Sublime *Text* → replaced by the in-app CM6 editor, `sublime_open` + `⌘⇧E`/`⌘⇧O` pop removed by WP8 (unchanged); Sublime *Merge* → permanent, with its own `smerge_open` toolbar button (folded into WP5), for staging/blame/history/blob-at-rev work the inline DiffPanel doesn't do.
- **Context:** Surfaced at WP5 spec when the operator confirmed the blob-at-rev dismissal and added: "we are not letting go of Sublime Merge; we'll still need an open-in-Sublime-Merge button like the Sublime Text one." The in-app diff viewer is for inline *viewing*; richer git work stays in Sublime Merge.
- **Suggested action:** At next `/product-finalize`, resync `CLAUDE.md` (Key Decisions + Project Overview), `docs/product/vision.md` Core Principle 3, and `docs/product/arch.md` M2 section to the Text-vs-Merge split. WP5 fixes the WBS WP8 task wording + the DiffPanel comment in-place.
- **Priority:** medium (a load-bearing scope/vision correction; affects WP8's deletion list and the product narrative)
- **Status:** RESOLVED 2026-06-20 (resynced eagerly during WP5 spec, operator-requested) — `vision.md` (top revision note + Core Principle 3 + right-half feature bullet), `arch.md` (top revision note + RightPanelHost row + data-flow mermaid + "Sublime pop removed" constraint), and `CLAUDE.md` (Project Overview Sublime-pop bullet, "One window" convention, Sublime Key Decision) all now carry the Text-replaced / Merge-permanent split. WBS WP8 task wording + DiffPanel comment still fixed in-place during WP5 build.

## SURFACE-2026-06-20-WP5-PANEL-HOTKEY-DIRECT-SELECT
- **Source:** feature:spec (WP5 RightPanelHost)
- **Target level:** product:finalize (durable-doc resync)
- **Type:** doc-drift
- **Summary:** The panel-switch hotkey is **per-panel direct-select** (⌘⇧E Editor / ⌘⇧D Diff / ⌘⇧T Terminal), NOT cycling. `arch.md` (~L295 "cycles them", ~L320 mermaid ".cycles.") and the WBS WP5 task wording describe cycling.
- **Suggested action:** WP5 fixes the WBS WP5 task wording in-place; arch.md prose resync at next `/product-finalize`.
- **Priority:** low (doc-drift; the as-built is the source of truth)
- **Status:** RESOLVED 2026-06-20 (WP5 finalize) — WBS WP5 wording fixed to "direct-select" in-place during WP5 build (P3.2); arch.md (RightPanelHost row + mermaid + revision note) also resynced eagerly this session. The as-built (per-panel ⌘⇧+mnemonic direct-select) is now documented everywhere.

## Code-quality findings — m2-wp4-diff-viewer-polish (2026-06-20)
- **Pointer:** 3 MINOR findings from `feature-review-quality` on ship commit `5051bd4` (0 CRITICAL, 0 MAJOR). Reviewer: well-built, appropriately-scoped, no refactor warranted. All micro-readability/posture: a deliberate double-predicate eval in `toggleAllCollapsed`, a broad `visibleKeys` useMemo dep, and the sticky-layout z-index coupling (no visual-regression harness to guard it). See [`workflow/backlog-quality-findings.md`](backlog-quality-findings.md) → `# m2-wp4-diff-viewer-polish — 2026-06-20`.
- **Priority:** low (all)
- **Status:** pending
- **Pickup shape:** all three are optional — none affect correctness; the useMemo dep narrowing is the only one with any (negligible) runtime effect. Dismiss via the WIP's `## Code-Quality Review` section if not worth a `/feature-refactor`.

## Code-quality findings — m2-wp5-right-panel-host (2026-06-20)
- **Pointer:** 1 MAJOR + 2 MINOR findings from `feature-review-quality` on ship commit `4546ffb` (0 CRITICAL). Reviewer: well-built refactor-plus-feature (faithful Workspace→RightPanelHost extraction, root-cause item-7 resolver fix + targeted regression guards, standout cross-predicate chord-exclusivity test). MAJOR: the `"terminal"` panel seam is reachable from `panelForChord` (⌘⇧T) but swallowed by `selectPanel`'s static guard — when WP9 adds `"terminal"` to `AVAILABLE_PANELS` the right half goes blank (no slot in JSX), untested. MINORs: split-listener cross-pointer comment; WP2 open-bar stopgap relocated (WP6 removes). See [`workflow/backlog-quality-findings.md`](backlog-quality-findings.md) → `# m2-wp5-right-panel-host — 2026-06-20`.
- **Priority:** medium (the WP9-handoff terminal-seam guard) + low (MINORs)
- **Status:** pending
- **Pickup shape:** the MAJOR is a **WP9 pickup** — when WP9 enables the terminal panel, add the JSX slot + a render test in the same change that adds `"terminal"` to `AVAILABLE_PANELS` (or add a render-time fallback-to-editor guard now). The MINORs are trivial `/feature-refactor` nits. Dismiss any via the WIP's `## Code-Quality Review` section.

## Code-quality findings — m2-wp6-file-finder (2026-06-20)
- **Pointer:** 3 MINOR findings from `feature-review-quality` on ship commit `fc77ad4` (0 CRITICAL, 0 MAJOR). Reviewer: well-built, low-debt, consistent with repo seams; correctness validated (deterministic tiebreak sort, greedy subsequence matcher, async cancellation, chord exclusivity). All cosmetic overlay/doc nits: (1) a panel chord (⌘⇧E) fires under the open finder overlay (no `!finderOpen` guard); (2) the `.` segment-boundary in `isBoundary` is undocumented rationale; (3) `onMouseEnter→setActiveIndex` couples hover to the keyboard cursor (mirrors CommandPalette). See [`workflow/backlog-quality-findings.md`](backlog-quality-findings.md) → `# m2-wp6-file-finder — 2026-06-20`.
- **Priority:** low (all)
- **Status:** pending
- **Pickup shape:** all three are trivial `/feature-refactor` nits (or leave — #3 matches the existing CommandPalette pattern, arguably WAI). Dismiss any via the WIP's `## Code-Quality Review` section.

## SURFACE-2026-06-20-WP10-ARROW-KEY-TREE-NAV
- **Status:** DROPPED 2026-06-24 (operator decision during QoL-WBS triage) — arrow-key FileTree nav is not wanted; click-to-open + click-to-toggle suffices.

## SURFACE-2026-06-21-IPC-DTO-FIELD-CASE-TESTS-MISS-SERDE-SHAPE
- **Source:** feature:build (WP7 Phase 2 verify-human BLOCKING)
- **Target level:** product:arch (cross-cutting test-shape lesson for all IPC DTOs)
- **Type:** tech-debt
- **Summary:** WP7 Phase 2 white-screened in the native app on first search: the Rust `LineMatch` serializes snake_case `line_text` (codebase convention — git_diff/fs_index serialize snake_case, frontend reads the snake_case keys directly; Tauri does NOT camelCase-convert command RETURN values), but the frontend TS type read camelCase `lineText` → undefined → uncaught TypeError in render. The 19 frontend unit tests missed it entirely because they construct `LineMatch`/`FileMatches` objects in TS by hand (camelCase), never exercising the real serde JSON that crosses IPC.
- **Context:** This is a general hazard for every Tauri command that returns a multi-word-field struct. Pure-TS unit tests over hand-built DTOs validate logic but cannot catch a frontend↔backend field-name/shape drift. The convention IS snake_case end-to-end (git_diff `old_lineno`/`short_sha`/`is_head`, fs_index `is_dir`) — WP7 deviated by typing camelCase on the frontend, which the tests couldn't see.
- **Suggested action:** (a) WP7 fix: rename the frontend field to `line_text` (done in the F12 build re-entry). (b) Cross-cutting: when adding a Tauri command that returns a struct, add ONE test that pins the exact JSON key shape — e.g. a Rust `#[test]` asserting `serde_json::to_value(&dto)` has the expected keys, OR a frontend test that feeds a realistic snake_case JSON literal (as it arrives over IPC) through the consuming code path. Consider a shared convention note in arch.md: "IPC DTOs are snake_case end-to-end; frontend types mirror the serde field names verbatim."
- **Priority:** medium
- **Status:** RESOLVED 2026-06-22 — M3 WP4 (commit `8bc2d68`). The `WorkspaceStatusUpdate` DTO carries a `serde_json::to_value` key-shape contract test (`status_broadcaster::tests::dto_serde_shape_is_snake_case`) that pins the exact snake_case keys + snake_case enum rendering — the cross-cutting pattern this SURFACE asked for. The arch.md convention note ("IPC DTO casing convention — snake_case end-to-end") was landed at finalize (`arch.md` §"Phase 2 forward-look §A"). New IPC DTOs follow the convention + add a parallel key-shape test.

## SURFACE-2026-06-21-EDITOR-MULTI-FILE-TAB-STRIP
- **Source:** feature:build (WP7 Phase 2 verify-human — operator UX direction)
- **Target level:** product:wbs (NEW work package, M2)
- **Type:** new-work
- **Summary:** The editor has NO multi-file tab strip — it opens ONE file at a time (`openPath: string`; opening a new file replaces the current). WP3c split panes are viewports onto the SAME file (shared-document; independent-file split was deferred → SURFACE-2026-06-20-WP3C-INDEPENDENT-FILE-SPLIT). The operator wants the Sublime model: a row of open-file tabs across the top of the editor (e.g. `wbs.md | roadmap.md | Find Results`), each a switchable/closable tab, INCLUDING a "Find Results" buffer tab. This requires a new editor multi-file tab-strip subsystem that is NOT in the M2 WBS or roadmap. (NOTE: the existing `right-panel-toggle` "tab row" is the PANEL selector — Editor/Diff/Sublime — NOT open-file tabs; distinct concept.)
- **Context:** This is the dependency WP7's Sublime "Find Results" UX sits on top of. WP7 backend (project_search, shipped) + the search overlay + the open-at-match highlight seam (searchModel byte→char, EditorPanel scroll+select) all REUSE forward into the tab-strip world — none is wasted. But "Find Results as a tab among editor file-tabs" can't be built until the tab strip exists. Operator chose (2026-06-21): PAUSE WP7 mid-Phase-2, build the tab strip first (its own spec→build cycle), THEN redefine WP7 Phase 2 to render Find Results into a tab.
- **Suggested action:** Decompose a new M2 WP — "Editor multi-file tab strip": multiple open files (state model beyond single `openPath`), a clickable/closable tab row above the editor, switch-active-file, close-tab/last-tab edge cases, per-file editor state (cursor/scroll), and a hook for synthetic read-only buffers (the Find Results tab is one). Folds in the deferred SURFACE-2026-06-20-WP3C-INDEPENDENT-FILE-SPLIT (independent-file panes). Then redefine WP7 Phase 2 (overlay → Find Results tab) + keep Phase 3 (replace) layered after. Sequence/priority vs WP9/WP11: operator to set at WBS decomposition.
- **Priority:** high
- **Status:** RESOLVED 2026-06-21 — WP12 (editor multi-file tab strip) SHIPPED (commit f2c86d7): per-pane tab strips + shared-doc store + disk-change + synthetic-buffer hook, operator-approved. WP7 is now UNBLOCKED — its Find-Results tab has the WP12 synthetic-buffer seam to resume onto. (Was: PROMOTED to WP12 2026-06-21.)

## SURFACE-2026-06-21-EDITOR-FILE-WATCHER
- **Source:** feature:build (WP12 Phase 3 verify-human — operator directive)
- **Target level:** product:roadmap (later-milestone work; the watcher is already named in the Phase-2 status-surface roadmap, this extends it to the editor)
- **Type:** new-work
- **Summary:** WP12 Phase 3 ships SYNCHRONOUS disk-change detection only — a `stat_file` (mtime+size) check on tab-activate + pre-save (silent reload when clean, conflict popup when dirty). There is NO live filesystem watcher: a file changed on disk while its tab is backgrounded + untouched is caught only when you next activate it, not in real time. Operator confirmed (2026-06-21, WP12 Phase 3 verify-human "all pass") that a live watcher is wanted **later down the line**.
- **Context:** The synchronous check is the right v1 for a single-user local tool and was explicitly scoped that way in the WP12 spec (Out of Scope: "A live filesystem watcher — disk-change detection is the synchronous on-activate/on-save check only"). A watcher would give real-time reload/conflict surfacing without a tab switch, and is the same `notify`/`tauri-plugin-fs-watch` capability the Phase-2 status-surface milestone already plans for `workflow/.session.md`. The editor's `editorDocs` store + `diskConflict` decision fn are watcher-ready: a watcher event would feed the same `checkDisk`/`reloadFromDisk`/conflict path keyed by `DocEntry.marker`.
- **Suggested action:** When a later milestone adds the `notify`/`tauri-plugin-fs-watch` watcher (or the Phase-2 status-surface milestone lands it), extend it to watch open editor documents: on a watched-file change event, run the existing `diskDecision` against the store entry (reload-when-clean / conflict-when-dirty) WITHOUT requiring a tab activation. Reuse `editorDocs` (`set-marker`/`load-ok`) + the Phase-3 conflict popup — no new decision logic needed, just the event source. Debounce rapid writes (editors/formatters write-then-rename).
- **SCOPE BROADENED 2026-06-24:** the operator hit the sibling gap LIVE while dogfooding Claudesk — the **FileTree rail does NOT refresh** when files are added/removed/renamed on disk externally (a file created by an out-of-app process after the tree rendered is invisible until the folder is manually collapsed/re-expanded; ⌘P file-finder DOES see it because the finder re-walks on open). The `notify` watcher is the single seam that serves BOTH consumers: (1) the FileTree (re-walk / patch the tree on fs change — the gap just hit), and (2) open editor documents (the original editor-reload scope above). Build the watcher once, fan out to both.
- **Priority:** ~~low~~ → **HIGH** (PULLED FORWARD 2026-06-24 by operator — the stale-tree friction bites during normal dogfooding; the operator hit it in this very session)
- **Status:** RESOLVED 2026-06-24 — QoL temporary-WBS **WP0** (commit `d893254`). Built a per-workspace `notify-debouncer-full` watcher (`src-tauri/src/fs_watch/`) emitting debounced, gitignore-filtered `fs-change` events; both consumers shipped + verify-human-confirmed live: the **FileTree rail auto-refreshes** (re-walk on `fsTreeRefreshKey`, expand/scroll preserved — the live gap that prompted the pull-forward) and **open editor docs live-reload** (re-stat + the existing `diskConflict.diskDecision` → reload-when-clean / conflict-when-dirty, no tab activation; self-write suppressed by the save-marker). Exclusion reuses `fs_index`'s `ignore` matcher (`.git/` hard-excluded + gitignore honored). arch.md resynced (the line-55 watcher note now reflects BUILT-for-fs-watch, distinct from the dropped-.session.md use). Was: PROMOTED into the QoL WBS as WP0. (3 MINOR review-quality findings auto-backlogged — see `Code-quality findings — qol-wp0-fs-watcher`.)

## Code-quality findings — m2-wp12-editor-tab-strip (2026-06-21)
- **Pointer:** 3 MINOR findings from `feature-review-quality` on ship commit `f2c86d7` (0 CRITICAL, 0 MAJOR). All low-stakes: (1) dead tab-level `dirty` field + `set-dirty` event in `openFiles.ts` — residue from the Phase-2S shared-doc move (dirty now lives in the store); (2) the dirty-close guard over-warns when refCount>1 (closing one view of a dirty file open in another pane loses nothing — gate on last-view); (3) intra-feature "Phase 2S/3/4" comment tags that won't age (use "WP12"). Reviewer rated the feature well-built, low-debt, advancing the codebase; no refactor pass warranted. See [`workflow/backlog-quality-findings.md`](backlog-quality-findings.md) → `# m2-wp12-editor-tab-strip — 2026-06-21`.
- **Priority:** low (all)
- **Status:** RESOLVED 2026-06-21 (`/feature-refactor`) — all three fixed: (1) deleted the dead `OpenFile.dirty` field + `set-dirty` event + reducer case + 4 tests (dirty derives from the `editorDocs` store); (2) `PaneTabs.requestClose` now gates the unsaved-changes confirm on `refCount <= 1` (last view only); (3) stripped the intra-feature `Phase 2S/3/4` comment tags across the 5 editor files. Gates green: vitest 297 (−4), tsc/eslint/prettier/cargo (111)/clippy/fmt all clean. Per-finding RESOLVED notes in `backlog-quality-findings.md`.
- **Pickup shape:** all three are quick `/feature-refactor` items (delete the dead dirty machinery; gate the close guard on `refCount<=1`; s/Phase N/WP12/ in headers). Dismiss any via the WIP's `## Code-Quality Review` section.

## SURFACE-2026-06-21-WP9-N-EDITORS-COST-AT-MULTIWORKSPACE
- **Source:** feature:build (WP9 Phase 2, P2.2)
- **Target level:** product:wbs
- **Type:** gap
- **Summary:** The "N mounted editors cost-at-N" sanity check (arch.md:332) could NOT be measured during WP9 because the app opens one workspace at a time — the multi-workspace open flow is Milestone 6+. Carry the real N≈8 mounted EditorSplit+Diff+terminal RAM/CPU measurement to the multi-workspace WP.
- **Context:** WP4 probe established the envelope for N=8 *terminals* (Apple M4: idle CPU 4.5%, RAM 240MB, <300MB budget) but explicitly did not cover CM6 editors. CM6 is lighter than Monaco; the concern is real but only testable once N>1 workspaces can be open. Single-workspace (editor+diff+terminal all mounted) showed no perceptible issue this session.
- **Suggested action:** In the multi-workspace milestone (M6+), after the N-workspace open flow lands, open N≈8 workspaces each with editor+diff+terminal mounted, read RAM/CPU (Activity Monitor / `top`), confirm within the <300MB / <20% envelope or schedule a mitigation (e.g. React.lazy the EditorPanel — see SURFACE about CM6 boot-parse cost).
- **Priority:** medium (load-bearing for multi-workspace usability; not blocking until N>1 ships)
- **Status:** RESOLVED 2026-06-22 by M4 WP1 (N-workspace mount-cost probe). Measured N=8 real CC + full M2 stack: idle CPU 0.0%, active CPU 7.8%/11.7% (median/p95), webview RAM 311/428 MB. **Verdict GO for eager-mount** — editors+diffs add only ~0% idle CPU + ~120–190 MB; envelope effectively holds. Full writeup: `docs/product/wp1-n-workspace-cost-probe-outcome.md`.

## Code-quality findings — m2-wp9-second-terminal (2026-06-21)
- **Pointer:** 2 MAJOR + 2 MINOR from `feature-review-quality` on ship commit `70a7576` (0 CRITICAL). Both MAJORs RESOLVED in the post-ship `/feature-refactor` (commit `a8db974`): stale spawn-effect comment rewritten; active-churn double-spawn fixed via the closure-`cancelled` primitive (a ref-latch attempt regressed StrictMode → reverted; live-verified 1 shell + 1 CC, prompt paints). Remaining = the 2 MINORs below.
- **MINOR #1 — `mark_ready` drain→emit not atomic across the seam** (`cc_session/mod.rs`): `drain_backlog` releases the backlog lock (Some→None) then emits the drained chunks unlocked, so a reader-thread chunk produced in that gap can emit ahead of a buffered one. No loss/dup (unit-tested), only an ordering window on a one-shot prompt (microseconds, effectively unobservable). The inline "no lost/duplicated chunk at the seam" comment slightly overstates the guarantee (it's no-loss, not ordering-safe). Fix if it ever matters: hold the lock across the flush, or emit-under-lock.
- **MINOR #2 — `cc_ready` holds the registry mutex across `mark_ready`'s emits** (`cc_session/commands.rs`): briefly serializes other session commands behind the (tiny) backlog flush. Tighter: `drain` returns chunks, emit after the lock drops.
- **Priority:** low (both)
- **Status:** pending (MINORs); MAJORs resolved in a8db974
- **Pickup shape:** two small `/feature-refactor` items in the cc_session backend; neither is behavioral at the shipped baseline. Dismiss via the WIP `## Code-Quality Review` section if not worth it.

## SURFACE-2026-06-22-N8-CC-BACKEND-RAM
- **Source:** feature:build (M4 WP1 Phase 2)
- **Target level:** product:wbs
- **Type:** new-work (watch-item)
- **Summary:** At N=8 *real* CC sessions, the 8 `claude --dangerously-skip-permissions` backend processes cost ~2.8 GB aggregate RSS (~350 MB each) — ~6× the entire Claudesk webview. Surfaced by M4 WP1's probe (WP4's replay-fixture method could not see this).
- **Context:** This is INHERENT to running 8 concurrent CC sessions — not introduced by Claudesk. The same 8 `claude` processes consume the same RAM whether launched via Claudesk or 8 separate Terminal tabs; Claudesk's marginal cost is only the ~300–430 MB webview. Held fine on 16 GB (83% free at idle). NOT a blocker for M4 — but it sets a practical concurrent-workspace ceiling (~8–10 on 16 GB before backend RAM pressure) worth confirming with real sessions and surfacing to the operator.
- **Suggested action:** M4 WP5 (verify-at-N) — re-confirm RAM headroom with N real in-flight sessions; note the practical ceiling as operator guidance. Longer-term (post-M4 dogfooding), consider whether an idle-session-suspend mechanism is ever worth it (likely overkill for a single-user 16 GB+ tool). Do NOT pursue as M4 scope.
- **Priority:** low (inherent-to-workload; informational + a WP5 watch-item)
- **Status:** RESOLVED 2026-06-24 by M4 WP5 (verify-at-N, commit 1fe939a) — RAM headroom re-confirmed at N≥4 real in-flight sessions in vh.7; Claudesk's marginal webview cost matches the WP1 envelope; the ~8–10-workspace practical ceiling on 16 GB (backend `claude` RSS, inherent-to-workload) is recorded as operator guidance. No action owed; idle-session-suspend remains a deliberate non-goal for a single-user tool.

## Code-quality findings — m4-wp1-n-workspace-cost-probe (2026-06-22)
- **Pointer:** 2 MINOR findings from `feature-review-quality` on ship commit `9f3e0fe` (0 CRITICAL, 0 MAJOR). Both robustness/precision nits in the throwaway `measure.sh`: (1) the `pgrep -fc` N-alive guard degraded to `?` during the run (operator confirmed 8 sessions manually); (2) percentile indexing is the lower-median truncation (sub-sample at 110+ samples, matches the `cm6/measure.sh` baseline). Reviewer rated the probe well-built, effectively zero durable debt. See [`workflow/backlog-quality-findings.md`](backlog-quality-findings.md) → `# m4-wp1-n-workspace-cost-probe — 2026-06-22`.
- **Priority:** low (all)
- **Status:** pending
- **Pickup shape:** both relevant only if the throwaway probe is resurrected (it is archived-or-deleted at finalize); neither is worth a `/feature-refactor` pass. Dismiss via the WIP's `## Code-Quality Review` section.

## SURFACE-2026-06-23-WP3-BACKGROUND-WORKSPACE-SWITCH-AFFORDANCE
- **Source:** feature:build (M4 WP2 Phase 2 verify-human)
- **Target level:** product:wbs
- **Type:** gap
- **Summary:** WP2 ships N>1 (workspaces coexist + stay mounted) but provides NO visible way to switch BACK to a backgrounded workspace — the only switch-back path is reopening the project via the "+" overlay (dedup focuses the existing workspace). Operator hit this during P2 verify-human ("how do I verify A is still alive? it's not shown in UI").
- **Context:** Expected by design — tile-click promote + ⌘⇧+digit are WP3, not WP2. But it's the load-bearing UX of multi-workspace; until WP3 lands, N>1 is technically working but practically one-directional. Confirms WP3's value.
- **Suggested action:** WP3 must treat "click a filmstrip tile (or ⌘⇧+digit) to promote a background workspace to center stage" as its PRIMARY path and verify it explicitly at WP3 verify-human. Already in the WP3 task list (`docs/product/wbs.md` §WP3 click-to-promote + ⌘⇧+digit) — this is a pointer, not new scope.
- **Priority:** medium
- **Status:** RESOLVED 2026-06-23 by M4 WP3 (commit 920678a) — tile-click promote AND ⌘⇧+digit both land + were explicitly verified at WP3 P2 verify-human (operator confirmed background-workspace switch-back in the native app).

## Code-quality findings — m4-wp2-n1-lift (2026-06-23)
- **Pointer:** 3 MINOR findings (0 CRITICAL, 0 MAJOR) from `feature-review-quality` on ship `b48ccce` — all low-effort polish in the new PickerOverlay/ProjectPicker code (unconditional Esc preventDefault, single-slot toast multiplexing, dead `backdropRef`). Full detail in [`workflow/backlog-quality-findings.md`](backlog-quality-findings.md) → `# m4-wp2-n1-lift — 2026-06-23`.
- **Priority:** low (all)
- **Status:** pending
- **Pickup shape:** all 3 are quick `/feature-refactor` items localized to PickerOverlay.tsx + ProjectPicker.tsx; the Esc-scope + single-slot-toast ones pair naturally with WP3/WP4 when more overlays land on the same surfaces. Dismiss any via the WIP's `## Code-Quality Review` section.

## Code-quality findings — m4-wp3-filmstrip (2026-06-23)
- **Pointer:** 3 MINOR findings (0 CRITICAL, 0 MAJOR) from `feature-review-quality` on ship `920678a` — all low-effort polish: off-viewport bg workspaces lack `inert` (a11y/focus leak — the highest-value one), ⌘⇧+digit `useEffect` re-subscribe thrash on `tiles` identity churn, ticker `useEffect` dual-responsibility. Full detail in [`workflow/backlog-quality-findings.md`](backlog-quality-findings.md) → `# m4-wp3-filmstrip — 2026-06-23`.
- **Priority:** low (all)
- **Status:** pending
- **Pickup shape:** quick `/feature-refactor` items; the `inert` a11y fix is the highest-value (genuine focus-leak from the P1.2 mount-strategy change). Dismiss any via the WIP's `## Code-Quality Review` section.

## Code-quality findings — m4-wp4-filmstrip-collapse (2026-06-23)
- **Pointer:** 2 actionable MINOR findings (0 CRITICAL, 0 MAJOR) from `feature-review-quality` on ship `d06ac50` — both low-effort polish: active pill in the collapsed row has a no-op promote `onClick` while advertising a Switch-to aria-label/cursor (branch inconsistency vs expanded tiles); the ticker effect re-derives `backgroundIds` by splitting a string it just joined (memoize once). Full detail in [`workflow/backlog-quality-findings.md`](backlog-quality-findings.md) → `# m4-wp4-filmstrip-collapse — 2026-06-23`.
- **Priority:** low (all)
- **Status:** pending
- **Pickup shape:** quick `/feature-refactor` items; the join/split round-trip + the still-pending WP3 ticker-effect-dual-responsibility finding both live in the SAME ticker effect — natural to fix together in one pass. Dismiss any via the WIP's `## Code-Quality Review` section.

## Code-quality findings — m4-wp4b-focus-indicator (2026-06-23)
- **Pointer:** 3 MINOR findings (0 CRITICAL, 0 MAJOR) from `feature-review-quality` on ship `647148f` — all cosmetic dust from the bundled F12 fix: (1) `data-active-pane` attribute on `.editor-split-pane` (EditorSplit.tsx:426) is now unconsumed (live selector moved to `.is-active::before`); (2) the WP4b CSS comment cross-refs the dead `.editor-pane[data-active-pane]` rule the same commit deletes; (3) the coexistence rationale is near-duplicated across the two CSS blocks. Reviewer rated the feature well-built, negligible debt, no refactor warranted. Full detail in [`workflow/backlog-quality-findings.md`](backlog-quality-findings.md) → `# m4-wp4b-focus-indicator — 2026-06-23`.
- **Priority:** low (all)
- **Status:** pending
- **Pickup shape:** findings #1 + #2 pair (drop the dead attribute + fix its comment cross-ref) in one trivial `/feature-refactor` pass; #3 (comment dedup) is optional lowest-value polish. Dismiss any via the WIP's `## Code-Quality Review` section.

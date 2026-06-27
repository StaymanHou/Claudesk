---
stage: wbs
state: in-progress
updated: 2026-06-27
milestone: "Milestone 6 — Friend-requested QoL polish (open collection)"
shipped: [WP1, WP1b, WP3]
---

# WBS — Milestone 6: Friend-requested QoL polish

Decomposes **only** Milestone 6 (the immediate next milestone). Future milestones (M7 menu-bar, M8 docs-viewer, M9 time-analytics, M10 auto-resume, M11 skill-orch, M12 polish) remain tracked in `roadmap.md` and are decomposed just-in-time when reached.

**Milestone goal (from `roadmap.md`):** a batch of small, friend-sourced quality-of-life refinements to the workspace UI, landing after the dogfood-replace point (M3+M4) and the out-of-focus status surface (M5). **Deliberately an OPEN collection** — more friend requests may arrive before the milestone closes and should be folded in as additional WPs (or new SURFACEs anchored here). Every item but the lead fix mirrors an already-shipped pattern, so the milestone is low-risk polish; the lead item (stuck-`Running` dot) is a *trust-eroding correctness bug* on the core status signal and is sequenced first.

**No `/product-research` and no external-API probe** — M6 is pure in-app UX over confirmed seams (`SURFACE-2026-06-26-FRIEND-QOL-BATCH-1` did the code scan; the stuck-dot, gitignore, and no-yolo seams are confirmed below). The one knowledge-unknown — *which* of cwd-match-miss / socket-not-draining / frontend-not-rendering causes the stuck dot — is resolved by an internal logging probe (WP1), not external research.

**Design-priors consulted** (`docs/product/design-priors.md`):
- `[PRIOR: operator-helpful-friend-misfiring-as-offswitchable-setting]` — **agrees** with the common-sense default for WP4 (wrap toggle) and WP6 (no-yolo): both ship as off-switchable settings defaulting to the operator's current benefit (wrap OFF; yolo ON). Rule 2 (prior agrees → take it, higher confidence). No tie to break, no contradiction.
- `[PRIOR: explicit-selectable-mode-over-inferred-mode]` — does not fire here (over-infer guard: M6's toggles are already explicit user controls, not inferred modes).

---

## Dependency map / critical path

```
WP1 (backend logging probe) ──► WP1b (hook-edge trace) ──► WP2 (fix stuck dot)   ← LEAD; correctness
WP3 (split-width)  ─┐
WP4 (terminal font)─┤   all independent of WP1/WP1b/WP2 and of each other
WP5 (editor wrap)  ─┤   (parallel track — pure additive UI, distinct files)
WP6 (gitignore)    ─┤
WP7 (no-yolo)      ─┤
WP9 (PiP-empty fix)─┤
WP10 (RP-term zoom)─┤   WP10 soft-depends on WP4 (reuses terminalFontZoom.ts)
WP11 (multi RP-term)┘   WP10↔WP11 soft-couple (zoom should cover all N terminals)
WP8 (milestone-exit verify)  ◄── depends on all of WP2–WP7, WP9, WP10, WP11
```

- **Critical path:** WP1 → WP1b → WP2 → WP8. The stuck-dot telemetry is the only chain with an internal learning dependency (must instrument before diagnosing).
- **WP1 + WP1b are the shipped probe** (both delivered 2026-06-27): WP1 = the backend file logger + drain/registry instrumentation; WP1b = the Perl hook-edge write-failure trace. Split into two WPs after build (originally one WP with two phases) because they are independently shippable telemetry slices at different layers (Rust backend vs deployed hook script). **Both shipped + released in the v0.2.1 patch** so the probe runs in prod and self-captures the bug.
- **WP2 repro caveat (operator, 2026-06-27):** the stuck-`Running` dot is **intermittent (~once/day)** — it CANNOT be reproduced on demand. So WP2's `/feature-reproduce` is **passive**: the WP1+WP1b telemetry now ships in prod; when the bug next occurs, the on-disk `status-channel.log` captures the offending turn, and WP2 diagnoses + fixes from that real evidence. WP2 is **blocked on a natural occurrence**, not on agent/operator effort.
- **Parallel track:** WP3, WP4, WP5, WP6, WP7, WP9, WP10, WP11 are mutually independent (each touches a distinct file/seam) and independent of WP1/WP1b/WP2 — EXCEPT WP10 soft-depends on WP4 (reuses `terminalFontZoom.ts` + the `XtermPane.setFontSize` handle) and WP10↔WP11 soft-couple (the zoom should route to whichever of N terminals is focused). They can otherwise be built in any order or concurrently; sequenced below by ascending risk/effort. **WP10+WP11 were folded in 2026-06-27** (operator at WP4 verify-human — `SURFACE-2026-06-27-RIGHT-PANEL-TERMINAL-ZOOM-AND-MULTIPLE`); the open collection grew, as designed.
- **WP4 ↔ WP3 soft coupling:** WP4's focus-scoped zoom keybinding routes through the WP4b `data-focus-half` tracking (already shipped in M4) — no dependency on WP3, but both touch the workspace layout; build WP3 first so the divider exists before WP4 verification exercises the terminal half at varying widths (convenience, not a hard dep).

---

## WP1: Probe — backend file-based status-channel logging (stuck-`Running` dot) ✅ SHIPPED 2026-06-27
**Type:** probe
**Milestone:** M6 (must precede WP2)
**Dependencies:** none
**Size:** S
**Status:** COMPLETE — shipped + released (v0.2.1 patch). Backend slice of the original probe; the hook-edge slice split out to **WP1b**.
**Learning objective:** When a CC turn cleanly ends in the **installed/prod `.app`** but the status dot stays `Running`, *which* link in the chain fails — (a) cwd→workspace match miss (the `Stop` event's cwd doesn't resolve to a registered workspace), (b) the hook event never reaches/drains the socket (`drain_loop` not receiving the `Stop`), or (c) the event drains + emits but the frontend doesn't render the Idle transition?
**Success criterion:** A real on-disk log file (readable from a launchd-launched prod `.app`, where `eprintln!`/stderr is invisible) capturing, per status event: event name + raw cwd + mapped state + resolved-workspace-id-or-`None` + emitted/dropped outcome; plus `workspace_register`/`deregister` canonical-key paths. ✅ met.
**Why a probe, not the fix:** the prior investigation hit a no-logs wall — the prod `.app` is launchd-launched with no visible stderr, and today the broadcaster only logged on the error path. The bug reproduces **only in the installed build** and is **intermittent (~once/day)** (operator, 2026-06-27) — so it can't be forced; the probe must ship to prod and self-capture the next occurrence.
**Tasks (all complete):**
- [x] File logger (`src-tauri/src/status_log/mod.rs`): append-mode under `app_data_dir()` (per-identity-isolated), best-effort swallow-IO, pure `format_event_line`/`format_registry_line` + 6 unit tests.
- [x] Instrument `drain_loop` (`status_broadcaster/commands.rs`): per drained `HookEvent` log event name + raw cwd + `event_to_state` (mapped) + `resolve_cwd` (resolved-or-`None`) + `outcome=emitted|dropped`, computed separately so cwd-miss is distinguishable from never-mapped. Startup `broadcaster-start log=<path>` breadcrumb.
- [x] Instrument `workspace_register`/`workspace_deregister` (canonical key logged — the cwd-match-miss smoking gun).
- [x] Verified live via the `tauri` MCP bridge (dev build) + operator-confirmed on their own `pnpm tauri:dev`; installed-`.app` confirmation ships with the v0.2.1 release.
**Artifacts:** `status_log/mod.rs`, `status_broadcaster/{commands.rs,mod.rs}`, `lib.rs`. 273 lib tests pass, clippy/fmt clean.

---

## WP1b: Probe — hook-delivery-edge write-failure trace ✅ SHIPPED 2026-06-27
**Type:** probe
**Milestone:** M6 (between WP1 and WP2)
**Dependencies:** WP1 (writes to the same `status-channel.log`)
**Size:** XS
**Status:** COMPLETE — shipped + released (v0.2.1 patch).
**Why split from WP1:** independently-shippable telemetry at a different layer — the deployed **Perl hook script** (`resources/claudesk-hook.pl`), not the Rust backend. It closes the one diagnostic gap WP1's backend logging can't: distinguishing a **never-arrived** `Stop` (hook couldn't open the socket → no STATUS line at all) from an **arrived-but-unresolved** one (a STATUS line with `resolved=none`).
**Success criterion:** on a failed socket open, the hook appends a best-effort `- HOOK write-failed event=<name> cwd=<cwd> sock=<path>` line to `status-channel.log` in the same per-identity dir (derived from `dirname($CLAUDESK_HOOK_SOCK)` = `app_data_dir` — no new env var), while keeping `exit 0` unconditional (never block CC). ✅ met.
**Tasks (all complete):**
- [x] Hook else-branch appends the write-failure trace (wrapped in `eval`, exit 0 preserved); header doc synced; deploy via `hook_install` overwrite-on-launch (dev + installed pick it up).
- [x] Verified: `perl -c` OK; exit 0 with no listener; failure-path trace lands; normal-path (live listener) delivers to socket with NO false-positive trace; absent-env no-op.
**Installed-`.app` + live-repro (P2.2/P2.3 of the WP1 WIP):** these are the probe's *passive* prod check — they ship in v0.2.1 and resolve when the intermittent bug next occurs and the log captures it. NOT a blocker to closing WP1/WP1b.
**Artifacts:** `resources/claudesk-hook.pl`.

---

## WP2: Fix the stuck-`Running` status dot
**Description:** Using WP1 + WP1b's telemetry, pin the failing link (cwd-match-miss / socket-not-draining / frontend-not-rendering) and fix it so the dot flips `Running → Idle` when a CC turn cleanly ends in the installed build. Trust-eroding false-positive on the core "needs me / is busy" signal — this is the milestone's LEAD correctness item.
**Milestone:** M6
**Dependencies:** WP1, WP1b
**Size:** M (unknown until the telemetry names the layer — could be a one-line cwd-normalization fix or a frontend render gap; sized M to be safe)
**Status:** BLOCKED — waiting on a natural occurrence. The bug is **intermittent (~once/day)** and CANNOT be reproduced on demand (operator, 2026-06-27). The WP1+WP1b telemetry now ships in prod (v0.2.1); WP2 starts when the bug next fires and the operator hands back the `status-channel.log` lines covering that turn. So WP2's `/feature-reproduce` is **passive evidence collection**, not an active repro effort.
**Tasks:**
- [ ] WAIT for the bug to occur in the prod `.app`; collect the `status-channel.log` lines for the offending turn (look for: a `Stop` line with `resolved=none outcome=dropped` = cwd-miss; OR no `Stop` line + a `HOOK write-failed` line = never-arrived; OR `outcome=emitted` = frontend render gap).
- [ ] `/feature-reproduce` against that real log evidence — write a failing test/assertion that captures the offending transition at whichever layer the telemetry implicates (red)
- [ ] Implement the fix at the named layer (green): e.g. cwd normalization in `StatusRegistry::resolve`, a missing/duplicate `Stop`-event registration, or a frontend `workspace-status` subscription gap
- [ ] Regression-guard: a unit/integration test that fails on the old behavior and passes on the fix (per CLAUDE.md, backend-lifecycle live outcomes carry to verify-human; the agent proves the code path statically + reproduces the transition where observable)
- [ ] Verify in the **installed `.app`** (operator, per the installed-build smoke-test convention): a real CC turn ends → dot goes Idle within the expected window, twice (the bug reproduced twice, so confirm twice)
- [ ] Decide whether to keep WP1's logging (likely demote to a `#[cfg(debug_assertions)]` or env-gated level once the bug is closed, so prod isn't writing a status log forever) — record the decision in the WIP

---

## WP3: Workspace split-ratio control (collapse + ratio presets) ✅ SHIPPED 2026-06-27 (commit 0b68f5a)
**Description:** A **discrete** split-ratio control in the workspace header — two collapse toggles (◀ CC / ED ▶) + a cycle button stepping 3:1 / 2:2 / 1:3 — replacing the originally-planned free-drag divider. **Design reframed at spec time** (operator, 2026-06-27): the friend's real need is attention-switching between a few intents (CC focus / editor focus / balanced), so discrete selectable states beat a continuous drag — more predictable, lower UI-bug surface, less code, and no nested-drag-handle confusion. Captured as the broadened `explicit-selectable-mode-over-inferred-mode` prior (continuous→discrete + risk-surface-vs-value decision rule).
**Milestone:** M6
**Dependencies:** none
**Size:** S
**As-built:** new pure module `src/components/workspace/splitWidth.ts` (state `{collapsed, ratio}` + `gridColumnsFor`/`cycleRatio`/`toggleCollapse` + never-throw localStorage, app-global key `claudesk.workspace.splitState`); control in `.workspace-header`; collapse via `display:none` on the hidden half → the existing `XtermPane` `offsetParent` fit-guard prevents a 0-width FitAddon crash (PTY stays alive), and the collapsed state derives a **single `1fr` track** (a `display:none` grid item leaves flow, so a `0/1fr` two-track mis-places the lone visible half to ~0px). Rail panel-fraction cap (`effectiveRailWidth` in `railWidth.ts`) keeps the editor usable at 3:1. `XtermPane.refit()` handle + a Workspace un-collapse-edge nudge. Tests: splitWidth 19 + railWidth effectiveRailWidth 5; `workspaceOffViewport.test.ts` retargeted. Verified live via the tauri MCP bridge (presets reflow, collapse no-crash, rail-cap at 3:1, persistence across a real app restart) + operator-approved.
**Tasks:**
- [x] Add `src/components/workspace/splitWidth.ts` — pure state model + derivation + never-throw localStorage (app-global key `claudesk.workspace.splitState`)
- [x] Mount the split-ratio control (two collapse toggles + cycle button) in `.workspace-header`, driving `grid-template-columns` (preset-only, NO free-drag — supersedes the original drag-divider plan)
- [x] Confirm the terminal re-fits cleanly on every ratio/collapse change (ResizeObserver + refit nudge) and the right panel reflows without clipping (incl. the 3:1 rail-cap + the collapsed single-track fixes)
- [x] Persist + restore across launches; verify default (1fr/1fr) preserved on first run

---

## WP4: Adjustable CC terminal font size (focus-scoped zoom)
**Description:** The CC terminal gains font-zoom like the editor. **Keybinding is FOCUS-SCOPED (operator decision, LOCKED):** ⌘+/⌘−/⌘0 zoom whichever half holds keyboard focus — terminal when the CC pane is focused, editor when the editor is — routed via the M4 WP4b `data-focus-half` active-half tracking. No new chords.
**Milestone:** M6
**Dependencies:** none (soft: build after WP3 so the terminal half exists at variable widths for verification — convenience only)
**Size:** S
**Seams (confirmed):** xterm `fontSize` hardcoded `11` in the `Terminal` constructor (`XtermPane.tsx` ~185); live-configurable via `term.options.fontSize = N` then `fit.fit()`. Editor pattern to mirror: `src/components/workspace/editor/fontZoom.ts` (`DEFAULT_FONT_PX`, MIN/MAX, localStorage, pure `clamp`/`next`/`load`/`save`); ⌘+/⌘−/⌘0 in `editorExtensions.ts` ~111–134. Active-half routing: `data-focus-half` on `.workspace` (App.css ~568).
**Tasks:**
- [ ] Add `src/components/workspace/terminalFontZoom.ts` — sibling of `fontZoom.ts` (own localStorage key e.g. `claudesk.terminal.fontSize`, suitable bounds, pure `clamp`/`next`/`load`/`save`)
- [ ] Seed the `XtermPane` constructor `fontSize` from `loadTerminalFontSize()`; apply-and-refit (`term.options.fontSize = N; fit.fit()`) on change
- [ ] Route ⌘+/⌘−/⌘0 to the **focused half**: when `data-focus-half` is the terminal → terminal zoom; when the editor → existing editor zoom. Reuse the existing chord handlers; dispatch on active half, do not register new chords
- [ ] Persist + restore per launch; verify focus-routing both directions (focus terminal → ⌘+ grows terminal not editor, and vice versa)

---

## WP5: Editor auto-wrap toggle
**Description:** A per-editor line-wrap toggle (`EditorView.lineWrapping`), default OFF (preserves the deliberate 2026-06-20 no-wrap behavior — long lines scroll horizontally), persisted. A toggle affordance flips soft-wrap on.
**Milestone:** M6
**Dependencies:** none
**Size:** S
**Seams (confirmed):** line-wrapping deliberately OFF, commented at `editorExtensions.ts` ~218–221 (no `EditorView.lineWrapping` added). Persistence pattern: the `fontZoom.ts` localStorage template; React state in `EditorPanel.tsx` alongside `fontSize` (~76–89); live reconfigure via a CM compartment (~83–89).
**[PRIOR: operator-helpful-friend-misfiring-as-offswitchable-setting]** agrees → default OFF (operator's current benefit), off-switchable on. No tie/contradiction.
**Tasks:**
- [ ] Add `src/components/workspace/editor/editorWrapToggle.ts` — localStorage helper (key e.g. `claudesk.editor.lineWrap`, default OFF, pure `load`/`save`/`toggle`)
- [ ] React state in `EditorPanel.tsx` alongside `fontSize`; conditional `...(wrapEnabled ? [EditorView.lineWrapping] : [])` in the extensions array, driven through a CM compartment for live reconfigure (no editor remount)
- [ ] Toggle affordance — **`⌘\` chord is a suggestion to CONFIRM at build time** (Sublime convention; verify it's disjoint from existing chords in the `paletteCommands.ts` ownership map before binding) and/or a clickable control; per-editor-view, persisted
- [ ] Verify default preserves horizontal-scroll behavior; toggle flips soft-wrap live; persists per launch

---

## WP6: FileTree reaches gitignored-but-editable files
**Description:** The FileTree rail (and possibly Cmd+P / search) currently hides every gitignored file via the shared `fs_index::project_walker`, so routine config like `.env`/`.envrc` is unreachable in-app and pushes the operator back to Sublime — undercutting "in-app editor is primary." Make gitignored-but-editable files reachable. **Policy is a build-time decision** (see task 1).
**Milestone:** M6
**Dependencies:** none
**Size:** M (the policy choice has ripple: walker-wide vs FileTree-only changes whether Cmd+P/search also surface ignored files)
**Seams (confirmed):** `fs_index::project_walker` (`src-tauri/src/fs_index/mod.rs:91`) is the single shared `ignore::WalkBuilder` honoring `.gitignore`/`.ignore`/global gitignore; it backs the FileTree, Cmd+P, AND search (single source so they never disagree — `mod.rs:64,89`). The shared-walker design means any change is felt by all three unless scoped FileTree-only.
**Tasks:**
- [ ] **Decide the policy** (at build/spec time): (a) allowlist common editable-but-ignored basenames (`.env`, `.envrc`, …); (b) a "show gitignored" toggle; (c) basename-pattern un-hide; or (d) VSCode-style dimmed-but-present. AND decide **scope**: walker-wide (Cmd+P/search also see them) vs FileTree-only. Record the decision + rationale in the WIP. *(Operator-confirm at plan time — this is the one M6 item with a genuine open design choice; `[PRIOR: operator-helpful-friend-misfiring-as-offswitchable-setting]` mildly favors a toggle defaulting to current behavior IF the chosen policy would otherwise surprise, but an allowlist of well-known editable dotfiles needs no toggle — decide at plan time.)*
- [ ] Implement the chosen policy at the right layer (`project_walker` config if walker-wide; a FileTree-specific filter/merge if scoped) — keep `.git/` always excluded regardless
- [ ] Confirm a gitignored `.env` is now visible + openable + editable + savable in the in-app editor (round-trip through `editor_fs::write_file`)
- [ ] If walker-wide: confirm Cmd+P + search behave per the chosen policy and don't flood with build artifacts (the reason gitignore was honored in the first place); if FileTree-only: confirm Cmd+P/search are unchanged
- [ ] Guard test: the chosen policy surfaces the allowlisted/toggled file but still excludes `.git/` and (for an allowlist) does NOT surface arbitrary build dirs

---

## WP7: Settings — open CC without yolo by default
**Description:** An opt-out toggle for `--dangerously-skip-permissions`. **Yolo stays the default** (vision-explicit) — this is the CLAUDE.md-anticipated "Phase 4 setting will let users opt out," landing early. Gate the skip-permissions flag in the CC spawn argv on a new setting.
**Milestone:** M6
**Dependencies:** none
**Size:** S
**Seams (confirmed):** `CC_ARG_YOLO = "--dangerously-skip-permissions"` at `src-tauri/src/cc_session/mod.rs:43`, pushed unconditionally into the spawn argv (`mod.rs:222`). Natural settings home: `config_store/settings.rs` `AppSettings` (already holds `pip_layout` + `pip_mode`, app-global, bundle-identity-isolated, read-modify-write atomic-write discipline) — add an optional `cc_yolo: Option<bool>` field, default-when-unset = `true` (yolo on).
**[PRIOR: operator-helpful-friend-misfiring-as-offswitchable-setting]** agrees → ship as off-switchable, default to operator benefit (yolo ON). Rule 2.
**Tasks:**
- [ ] Add `cc_yolo: Option<bool>` to `AppSettings` (`settings.rs`) with a reader `read_cc_yolo(data_dir) -> bool` defaulting `true` when unset (mirror `read_pip_mode`'s default-when-unset pattern) + a writer `write_cc_yolo` (read-modify-write)
- [ ] Gate the `CC_ARG_YOLO` push in `cc_session` spawn on the setting (read at spawn time so a change takes effect on the next spawn; document that it's next-spawn, not live-toggle, since the flag is an argv chosen once per CC process)
- [ ] **Decide app-global vs per-project** at build time — `AppSettings` is app-global (matches "an opt-out toggle"); per-project would live in `projects.json`. Default to app-global (simplest, matches the setting's framing); record the decision. *(If per-project is wanted, that's a `Project` field, not `AppSettings` — flag at plan time.)*
- [ ] Expose a toggle affordance (a control; until the M12 Settings UI exists, the affordance is minimal — a menu item or a small control, decided at build time consistent with the no-global-settings-panel-yet reality noted in `SURFACE-2026-06-26-FRIEND-QOL-BATCH-1`)
- [ ] **Installed-build smoke test (mandatory — this touches external-process spawning):** toggle OFF → next CC spawn in the installed `.app` shows the permission prompts (no `--dangerously-skip-permissions`); toggle ON → yolo as before. Per the CLAUDE.md installed-build convention for PATH/spawn-touching features

---

## WP9: Suppress empty PiP when no workspace is open
**Description:** When Claudesk has launched but the user has NOT yet opened any workspace (the picker is still showing), blurring the app auto-summons an **empty PiP panel**. Desired: at **zero open workspaces** the PiP must not appear at all — there is nothing to mirror. (Operator-observed during WP1 verify-human, 2026-06-27 — promoted from `SURFACE-2026-06-27-PIP-SUMMONS-EMPTY-WITH-NO-WORKSPACE-OPEN` into the WBS proper.)
**Milestone:** M6 (open-collection fold-in)
**Dependencies:** none (independent of WP1/WP2; touches the PiP focus-handler path, not the status logger)
**Size:** S
**Type:** bug (cosmetic-but-annoying; not data-affecting)
**Seams (to confirm at plan time):** the PiP auto-summon fires from the `on_window_event` focus handler / auto-summon debounce in `lib.rs` (~the M5 WP5 region, around the focus-probe + `pip_set_visible` path); `PipMode::Auto` summons on sustained blur unconditionally. The guard = "summon only if open-workspace-count > 0." Open-workspace count is reachable backend-side via the `SharedRegistry` (`status_broadcaster` `by_path` map — each open workspace is registered there; its `len()` IS the open set the broadcaster uses), OR via frontend state informing the backend. **Decide at plan time** which signal to read; also decide whether the `PipMode::On` launch-time show needs the same guard. **NB the main-thread-marshal rule** for any PiP/NSPanel window op (CLAUDE.md) — the auto-summon path already hops threads.
**Tasks:**
- [ ] Decide the open-count signal (registry `len()` vs frontend-informed) + whether `On` mode also guards. Record the decision.
- [ ] Gate the auto-summon (and `On`-launch show if decided) on open-workspace-count > 0; marshal any window op to the main thread.
- [ ] Verify: launch app, open no workspace, blur → PiP stays hidden. Open a workspace, blur → PiP summons as before. Close all workspaces, blur → PiP hides again. (Installed-`.app` + out-of-focus behavior → operator verify-human / release gate, per the PiP-surface convention.)

---

## WP10: Right-panel terminal font zoom (focus-scoped, extends WP4)
**Description:** The WP9 second terminal (the right-half login-shell `TerminalPane`) gains the SAME focus-scoped font-zoom WP4 shipped for the CC terminal. When the right-panel terminal is focused, ⌘+/⌘−/⌘0 zoom *that terminal* — not the editor. (Operator-requested at WP4 verify-human, 2026-06-27 — `SURFACE-2026-06-27-RIGHT-PANEL-TERMINAL-ZOOM-AND-MULTIPLE` part 1.)
**Milestone:** M6 (open-collection fold-in)
**Dependencies:** WP4 (reuses the `terminalFontZoom.ts` module + the `XtermPane.setFontSize` handle; soft-coupled to WP11 if multi-terminal lands first — but independent)
**Size:** S
**Type:** new-work (routing extension)
**Seams (to confirm at plan time):** the right-panel terminal is an `XtermPane` (via `TerminalPane`, `spawnCommand="term_spawn"`) — the SAME component WP4 made zoomable, so it already accepts `setFontSize(px)` via the imperative handle. The gap is ROUTING ONLY: WP4's capture-phase keydown listener in `Workspace.tsx` intercepts the zoom chord only when `deriveFocusHalf(document.activeElement) === "left"` (the CC terminal); a right-half focus falls through to the editor's CM6 keymap. WP10 must additionally route to the right-panel terminal when it is the focused right-half surface (terminal panel front + focus inside `[data-testid="term-pane"]`), vs the editor. The `panel === "terminal"` front-state lives in `RightPanelHost` (~line 337), so the listener needs that signal (lift state up, or read a DOM marker on the focused element's ancestry). 
**Open decision (plan time):** ONE shared terminal zoom for both terminals (reuse WP4's `claudesk.terminal.fontSize` key — simplest, both terminals are "a terminal") vs a separate key per terminal kind. Lean: share the key unless there's a reason the CC terminal and the shell want different sizes.
**Tasks:**
- [ ] Decide shared-vs-separate zoom key + the routing signal (lifted state vs DOM-ancestry read). Record the decision.
- [ ] Extend the `Workspace.tsx` zoom routing: when the focused right-half surface is the terminal panel (not the editor), apply terminal zoom via the right-panel terminal's `setFontSize` handle (thread a ref from `RightPanelHost`→`TerminalPane`→`XtermPane`, mirroring the CC `ccPaneRef`)
- [ ] Verify (bridge + real keyboard): focus right-panel terminal → ⌘+/⌘−/⌘0 zooms IT; focus editor → ⌘+ zooms the editor (terminal unchanged); focus CC terminal → ⌘+ zooms CC (unchanged from WP4). Persist + restore.

---

## WP11: Multiple terminals in the right panel
**Description:** The right-panel terminal supports MORE THAN ONE terminal — today it's a single `TerminalPane` per workspace (one hardcoded `term_spawn` session keyed `${workspaceId}-term`). Add the ability to open/switch/close N terminals within the terminal panel. (Operator-requested at WP4 verify-human, 2026-06-27 — `SURFACE-2026-06-27-RIGHT-PANEL-TERMINAL-ZOOM-AND-MULTIPLE` part 2.)
**Milestone:** M6 (open-collection fold-in)
**Dependencies:** none hard (independent of WP4/WP10; if WP10 lands first, the zoom routing should cover all N terminals — note the coupling). Backend `term_spawn` is already session-id-keyed + command-agnostic, so this is a frontend-shape change.
**Size:** M (real UX-shape design choice — likely warrants `/feature-spec` rather than a bare `/feature-plan`)
**Type:** new-work
**Seams (confirmed):** `RightPanelHost` mounts exactly one `TerminalPane` in the `panel === "terminal"` slot (~line 876); `TerminalPane` hardcodes the session id `${workspaceId}-term` and forwards everything else to `XtermPane` unchanged. The PTY backend (`term_spawn` + the session-id-keyed input/resize/kill commands + `cc-output-<sid>`/`cc-exit-<sid>` streams) is already N-session-ready — only the frontend needs a terminal-list model. The QoL-WP1 per-pane kill-on-unmount (`XtermPane` unmount cleanup) already reaps each `XtermPane`'s session generically, so closing a terminal tab that unmounts its pane reaps its shell for free — confirm this covers the N case.
**Open design choices (SPEC time — this is the one M6 item with a genuine UX-shape decision):**
- Tabs vs splits vs both (lean: tabs first — simplest, matches the panel-tab idiom already in `RightPanelHost`; splits are a bigger layout change)
- Max terminal count (cap or unbounded)
- New-terminal / close-terminal affordance (a `+` button in a terminal sub-tab row / a chord / both) — check chord-ownership (`paletteCommands.ts`) before binding any new chord
- Persistence across app restart (lean: no — terminals are ephemeral like the CC session; re-spawn fresh)
- Keep-mounted discipline: each terminal stays mounted (scrollback survives switching between terminals) mirroring the single-terminal posture
**Tasks:**
- [ ] `/feature-spec` the terminal-list UX shape (tabs vs splits, count, affordances, persistence) — record the decisions
- [ ] Terminal-list model: N `{ id, sessionId }` entries per workspace; a sub-tab/switcher row in the terminal panel; add/close/switch
- [ ] Mount N `TerminalPane`s keep-mounted (display:none for the non-front ones), each with a distinct session id (drop the hardcoded `${workspaceId}-term` → `${workspaceId}-term-<n>`); the front one is `active`
- [ ] Confirm each terminal's shell reaps on close (per-pane unmount kill covers it) and on workspace close (kill_all / per-pane reap covers all N)
- [ ] If WP10 shipped: confirm focus-scoped zoom routes to whichever terminal is focused
- [ ] Verify (bridge + real): open 2+ terminals, switch between them (scrollback intact), close one (shell reaped), persistence per the spec decision

---

## WP8: Milestone-exit verification (verify M6 at the real app)
**Description:** Milestone-exit verification against the real installed `.app` + dev build, confirming every M6 exit criterion. Verification-only WP (no new feature code).
**Milestone:** M6
**Dependencies:** WP2, WP3, WP4, WP5, WP6, WP7, WP9, WP10, WP11 (all M6 build WPs; WP1+WP1b already shipped in v0.2.1)
**Size:** S
**Exit criteria to confirm (from `roadmap.md`):**
- [ ] Status-channel telemetry (WP1+WP1b) confirmed writing in the installed `.app` (shipped v0.2.1) — the passive probe is live
- [ ] Stuck-`Running` dot fixed (WP2) — a real CC turn cleanly ends → dot flips Idle, in the **installed `.app`** (verified whenever the intermittent bug next surfaces + the fix lands)
- [ ] Empty PiP suppressed (WP9) — no workspace open + blur → PiP stays hidden
- [ ] Left/right split is drag-resizable; the terminal re-fits cleanly (no clipped/garbled PTY)
- [ ] CC terminal font size is adjustable via **focus-scoped** ⌘+/⌘−/⌘0 (terminal when CC focused, editor when editor focused)
- [ ] Editor offers a persisted auto-wrap toggle (default OFF preserved)
- [ ] Gitignored-but-editable files (e.g. `.env`) are reachable + editable in the in-app editor per the WP6 policy
- [ ] A setting can open the CC terminal without yolo (default stays yolo-on); verified at next-spawn in the installed build
- [ ] Right-panel terminal is also focus-scoped-zoomable (WP10) — focus it → ⌘+/⌘−/⌘0 zooms that terminal, not the editor
- [ ] Multiple terminals can be opened/switched/closed in the right panel (WP11) per the spec'd UX shape; each shell reaps on close
- [ ] Any further friend-requested QoL items folded in before this verification are covered
**Tasks:**
- [ ] Drive the agent-observable slice via the `tauri` MCP bridge where possible (split-drag, font-zoom focus routing, wrap toggle, FileTree `.env` visibility — all main-webview-observable per the M5 WP2 bridge proof)
- [ ] Carry installed-`.app` + backend-lifecycle outcomes (stuck-dot flip, no-yolo next-spawn behavior) to operator verify-human per the installed-build smoke-test convention — use the `tmp/scratch/scratch-{a,b,c}` throwaway repos for any check that spawns/answers a CC session
- [ ] Confirm all exit criteria PASS; surface any miss as a back-loop to the owning WP

---

## SURFACE-IN ledger (open-collection tracking)

M6 is an **OPEN collection** (`roadmap.md` Revision 2026-06-26b). New friend-QoL requests arriving before this WBS's WPs all close should be added here as new WPs (or anchored SURFACEs), not forced into existing WPs. Current first batch (this WBS): WP3–WP7 from `SURFACE-2026-06-26-FRIEND-QOL-BATCH-1` + the two roadmap-listed additions (WP6 gitignore = `SURFACE-2026-06-26-FILETREE-EXCLUDES-GITIGNORED-EDITABLE-FILES`, WP7 no-yolo = `SURFACE-2026-06-26-M6-SETTING-NO-YOLO-DEFAULT`); WP1+WP2 = `SURFACE-2026-06-25-STATUS-STUCK-RUNNING-AFTER-CLEAN-TURN-END` (operator-designated LEAD).
**Fold-ins after the first batch:** WP9 = `SURFACE-2026-06-27-PIP-SUMMONS-EMPTY-WITH-NO-WORKSPACE-OPEN` (operator, WP1 verify-human); **WP10 + WP11 = `SURFACE-2026-06-27-RIGHT-PANEL-TERMINAL-ZOOM-AND-MULTIPLE`** (operator at WP4 verify-human, 2026-06-27 — right-panel terminal zoom + multiple right-panel terminals). The collection grew exactly as the open-collection design intends.

**Note:** `SURFACE-2026-06-22-WP5-DROPPED-WATCH-WORKFLOW-DOC-HIERARCHY` (the workflow-doc-hierarchy watcher) was *anchored to M6* in some earlier notes but was **re-anchored to M7 (menu-bar)** in `roadmap.md` (the popover row is its natural form factor) — it is **NOT** an M6 WP. Left out deliberately.

---

## Next step

WBS complete; architecture holds (every WP builds on a confirmed, already-shipped seam — `config_store/settings.rs`, `fs_index::project_walker`, `status_broadcaster`, the `railWidth.ts`/`fontZoom.ts` localStorage-helper template, the `data-focus-half` routing). No architectural gaps surfaced — **no back-loop to `/product-arch`**.

→ Run **`/product-context`** (P9) to refresh `CLAUDE.md`, then begin building. Recommended build order: **WP1 → WP2** (lead correctness fix first), then the parallel polish track **WP3 → WP4 → WP5 → WP6 → WP7** in any order, then **WP8** milestone-exit verify.

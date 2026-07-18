---
stage: wbs
state: complete
milestone: 10.5
updated: 2026-07-18  # M10.5 WP2 (active-close confirmation) SHIPPED (uncommitted, HEAD 75ef6f8) — 3 phases: per-workspace active-close gate (extends the QoL-WP1 dirty gate via isActiveState + reasons-object closeWorkspaceSpec) + app-quit-while-active confirm (FRONTEND-DECIDES: CloseRequested prevent_close + quit-requested round-trip → enumerated confirm → quit_now → shared perform_quit_teardown + exit) + terminal-active-scope-note (CC-status-only for v1, no job-control detection). review-quality 0C/0M/3 MINOR (cosmetic, auto-backlogged). FE 1173 + BE 543 tests green. Installed-.app smoke CARRIED to /release. 2 WPs remain: WP3 kill-clean-exit (reproduce-first) ∥ WP4 encoding-fix (reproduce-first). — [prior] M10.5 WP1 (PiP top-right default) SHIPPED (uncommitted, HEAD 75ef6f8) — as-built: 150px inset from top+right (not flush, operator-requested mid-verify), anchor lives in pip_resize gated on an in-session `positioned` flag (NOT pip_set_visible's build branch, because the real content-driven size arrives async). 3/3 outcomes verified live via the MCP bridge + operator verify-human. review-quality 0C/0M/3 MINOR (comment/doc polish, auto-backlogged). 3 WPs remain: WP2 active-close (M, known-shape) ∥ WP3 kill-clean-exit (M, reproduce-first) ∥ WP4 encoding fix (M, reproduce-first). — [prior] M10.5 DECOMPOSED via /product-wbs — 4 WPs, one per dogfooding papercut. WP1∥WP2 (independent UX), WP3∥WP4 (independent bug-shapes); no cross-WP dependency, no 3rd-party probe. OPEN bucket. Source: SURFACE-2026-07-16-M10.5-QOL-BUCKET.
---

# WBS — Milestone 10.5: QoL polish bucket

**Scope of this WBS pass:** Milestone 10.5 only (the immediate next execution milestone). Future milestones (M11 docs-viewer, M12 auto-resume, M13 skill-orch, M14 polish) stay headline-only in `roadmap.md` and are decomposed just-in-time when reached.

**Milestone goal (from roadmap.md):** Fix four dogfooding papercuts the operator hit while daily-driving M9 — two UX/lifecycle extensions of existing infra, two reproduce-first bug-shapes — to clear **before the next release cut** so the release the auto-updater (M10) ships *from* is clean. This is a between-milestones polish insert (numbered "10.5", same spirit as the completed M6 friend-QoL), and — like M6 — an **OPEN collection bucket**: more QoL items may be appended as WPs before the milestone is built. See `roadmap.md` → "Milestone 10.5".

**Primary inputs:** `roadmap.md` → Milestone 10.5 (the four deliverables + exit criteria) + `SURFACE-2026-07-16-M10.5-QOL-BUCKET` (the code-seam analysis) + a live code-seam re-verification done at this WBS pass (see "Code-seam verification" below).

## Design-prior consult (Step 0)

One recorded prior bears on a WP-boundary decision:

- **`explicit-selectable-mode-over-inferred-mode`** (its **risk-surface-vs-value** decision rule) → governs **WP2's** "what counts as an *active* terminal" scope choice. The rich version (real foreground-process detection on a raw PTY terminal) carries a broad, fragile bug surface (job-control edge cases, backgrounded processes, shells with no running child) for a low-certainty payoff; the lean is the **lower-surface** definition — key "active" off the already-known M3 CC status (`Running`/`AwaitingInput`) for v1, treat a raw terminal conservatively (e.g. "has an unfinished command" only if cheaply/reliably detectable, else scope to CC-status). `[PRIOR: explicit-selectable-mode-over-inferred-mode] leaning CC-status-based active-detection over foreground-process-detection for v1 — flag if wrong` (rule 3, genuine tie-break; the operator's spec-time call decides the terminal definition — see WP2 tasks).

The other priors do not fire: `new-surface-must-earn-its-place-against-existing-ones` (no new surface — all four WPs extend existing infra), `operator-helpful-friend-misfiring-as-offswitchable-setting` (none of the four is a friend-divergent setting; the confirm in WP2 is a universal safety gate, not an operator-benefit default), `primary-surface-is-zero-ceremony-not-a-mode` (no primary-surface mode introduced). No new design prior surfaced to capture (the WP boundaries are papercut-scoped and dependency/bug-shape-driven, not a product-design lean).

---

## Code-seam verification (done at this WBS pass — grounds the WP tasks in real code, not the SURFACE's memory)

Re-checked the four target areas against current source before decomposing:

1. **PiP origin (WP1):** `pip/commands.rs` already ships `pip_move` doing a **main-thread `setFrameOrigin:`** (`msg_send![ns_panel, setFrameOrigin:]`, y-up bottom-left frame math documented) — the exact AppKit path WP1 needs to reuse. `pip_resize` (`set_content_size`) sets size only; `pip_set_visible` builds the panel on first show — that's the anchor seam. **Low risk, seam proven.**
2. **Active-close (WP2):** the close-confirm gate exists — `App.tsx` `dirtyProbes` (a `Map<workspaceId, () => number>`) + `requestClose` (fires `ConfirmModal` when `dirty > 0`) + `resolveClose`. Per-workspace CC status is already available via `useWorkspaceStatus` → `stateFor(workspaceId)` (`"idle"|"running"|"awaiting-input"|"unknown"`). App-level quit routes through `lib.rs` `on_window_event` → `WindowEvent::CloseRequested` → `SessionRegistry::kill_all`. **All seams present — WP2 adds a busy/active probe alongside the dirty probe on the same gate + an app-quit-aggregate consult.**
3. **CC/terminal kill (WP3):** kill path exists — `PtyCcSession::kill()` = `send_input(exit_command)` (`/exit\r` for CC, `exit\r` for the WP9 shell) → 3s poll (`try_wait` every 100ms) → `child.kill()` (SIGKILL) fallback; `kill_all` parallelizes the per-session grace windows. **Reproduce-first — the symptom (which kind hangs / `/exit` ignored mid-turn / SIGKILL orphans a subagent / PTY not reaped) is unknown; capture it before touching this path.**
4. **CC I/O encoding (WP4) — ⚠️ the SURFACE's prime-suspect fix is ALREADY in place.** The SURFACE hypothesized "FE decodes base64→string→`term.write(string)` corrupts a split multi-byte char." But current code already does the safe thing: `decodeBase64` (`src/cc/bridge.ts`) returns a **`Uint8Array`**, and `XtermPane.tsx` (~L403) calls `term.write(decodeBase64(event.payload))` — a **bytes** write, which xterm's decoder handles across chunk boundaries. So that path is **not** the bug. The real suspects shift and MUST be found by reproduction: **(a)** the **input** side — `encodeBase64` (`src/cc/bridge.ts`) does `String.fromCharCode(data.charCodeAt(i) & 0xff)`, which **truncates any code unit > 0xFF** → multi-byte input (emoji/accented paste) corrupts on the way IN to CC; **(b)** xterm buffering across *separate* `write()` calls (each 4096-byte `READ_CHUNK` is emitted as its own `cc-output` event → its own `write()` — xterm should coalesce its internal UTF-8 decoder state across writes, but confirm it does for a boundary-split char); **(c)** a `TERM`/`LANG`/locale/charset mismatch in the spawned env. **Reproduce-first is doubly load-bearing here — the obvious fix is already shipped, so a fix applied without a reproduction would be aimed at the wrong layer.**

---

## Work Packages

### WP1: PiP default position = top-right corner ✅ SHIPPED 2026-07-18 (uncommitted, HEAD `75ef6f8` — commit-only-when-asked)
**Description:** On first summon, the PiP NSPanel opens anchored **near** the screen's **top-right** corner (computed from the active screen's `visibleFrame`), instead of NSPanel's current ~center default. A later operator drag position is **preserved** — the top-right anchor is applied **only when the panel has no prior position** (first show / no stored origin), never re-anchoring on every summon (that would fight the operator's drag). Reuses the proven main-thread `setFrameOrigin:` path from `pip_move`.
**Milestone:** 10.5
**Dependencies:** none
**Size:** S
**Design note:** No prior fires on the anchor choice (top-right is the operator's stated preference — a bare preference, not a design-prior). The "preserve drag, anchor only when unpositioned" rule is the one real design decision — it keeps the panel predictable without a mode.
**AS-BUILT deltas from this plan (2 — both operator-/reality-driven, verified live):**
1. **150px inset, not flush.** The operator asked mid-verify for a **150px gap from the top + right edges** (confirmed "Top + right" via AskUserQuestion), so the anchor is `right edge = visibleFrame.maxX − 150 − panelW`, `top edge = visibleFrame.maxY − 150 − panelH` (via a `PIP_ANCHOR_MARGIN = 150.0` const + a `margin` param on `top_right_origin`). Not the flush corner the plan implied.
2. **Anchor lives in `pip_resize`, NOT `pip_set_visible`'s build branch.** `pip_set_visible` builds the panel at a 220×130 **placeholder**; the real content-driven size lands asynchronously via the webview's mount-time `pip_resize`. Anchoring at build time would use the placeholder size → wrong spot. So `anchor_top_right` runs inside `pip_resize` (gated on `positioned == false`), re-anchoring against the current post-resize frame. The `positioned` flag is an **in-session bool** on `PipAutoState` (drag-position is not persisted → fresh top-right per launch, the operator's preference); `pip_move` sets it `true`.
**Tasks:**
- [x] Compute the top-right origin from the active screen's `visibleFrame` (NSWindow frame origin is **bottom-left, y-up**, so top-right = `visible.maxX − margin − panelWidth`, `visible.maxY − margin − panelHeight`); account for the current panel size (post-`set_content_size`). *(Pure `top_right_origin` helper in `pip/mod.rs` + 4 unit tests; `margin` = the 150px inset per AS-BUILT delta 1.)*
- [x] Apply it via `setFrameOrigin:` **main-thread** (reuse the `pip_move` AppKit path / the PiP main-thread rule) at the **`pip_resize` seam** (AS-BUILT delta 2 — NOT `pip_set_visible`'s build branch, because the real size arrives async). *(`anchor_top_right(&NSPanel)` in `pip/commands.rs`; command body → main thread, no marshaling needed.)*
- [x] Gate on "no prior position" — a one-time `positioned` flag so a re-summon after the operator dragged the panel does NOT re-anchor. **In-session flag** (drag-position isn't persisted → re-anchor top-right per launch, confirmed the operator's preference). *(`positioned: bool` on `PipAutoState`; `pip_move` sets it `true` under `PipAutoStateLock`.)*
- [x] Verify live via the MCP bridge: first summon lands at the 150px top-right inset; drag away, hide, re-summon → stays where dragged (not re-anchored). Multi-size check across the PiP layouts (the anchor recomputes against the *current* panel width/height). *(All 3 outcomes PASS live: x=1642,y=180 = exact 150px inset on 1920×1080; drag preserved across hide/re-summon; layout change 128→38px re-anchored keeping right-gap=150. Operator verify-human "all good".)*

### WP2: Active-close confirmation (busy CC / running command / app-quit) ✅ SHIPPED 2026-07-18 (uncommitted, HEAD `75ef6f8` — commit-only-when-asked)
**Description:** A confirm dialog before destroying in-flight work: closing a workspace whose CC is **active** (`Running`/`AwaitingInput`), closing a right-panel terminal with a running command, or quitting the whole app while any workspace is active — each prompts the operator first. **Extends the existing QoL-WP1 close-confirm gate** (`App.tsx` `dirtyProbes`/`requestClose`/`resolveClose` + `ConfirmModal`) rather than building a new one: adds a **busy/active probe** alongside the existing dirty-editor probe on the same gate, and makes the app-level `CloseRequested` handler consult the same aggregate before `kill_all`.
**AS-BUILT (3 phases, 2 notable deltas from this plan):**
1. **App-quit = FRONTEND-DECIDES, not "backend consults the aggregate before kill_all."** The plan implied the backend `CloseRequested` reads the busy set + decides. As-built: `CloseRequested` unconditionally `api.prevent_close()`s + emits a bare `quit-requested`; the FRONTEND computes the busy set (it already owns `isActiveState(stateFor)` + display names) and either quits immediately (`invoke("quit_now")`) or shows the enumerated confirm → `quit_now`. Cleaner: zero backend duplication of "what is active", ONE source of truth (`isActiveState`). The old inline teardown was extracted to a shared `perform_quit_teardown` that `quit_now` calls (kill_all + M9 close markers + socket + PiP) — no double-teardown.
2. **Terminal-active = CC-status-only for v1 (Phase 3 spec resolution).** The spec's open question (b) — raw-terminal running-command detection — resolved to the design-prior lean: NO job-control detection (a raw PTY has no cheap foreground-process signal); a raw-terminal-holding workspace's CC status governs its prompt. Documented at the `spawn_shell` seam so no maintainer adds it by reflex. **App-quit form = ENUMERATED** (names the busy workspaces, per the operator's "which ones?").
**Milestone:** 10.5
**Dependencies:** none (independent of WP1; both are UX extensions of existing infra)
**Size:** M
**Design note:** `[PRIOR: explicit-selectable-mode-over-inferred-mode] leaning CC-status-based active-detection over fragile foreground-process detection for v1 — flag if wrong.` The per-workspace CC status (`stateFor` from `useWorkspaceStatus`) is already known and reliable; scope v1 "active" to it. A raw right-panel terminal's "running command" detection is the risk-surface question the spec resolves (see tasks) — lean toward the cheapest reliable signal, not job-control introspection.
**Tasks:**
- [x] **Spec decision (operator, at plan/spec):** define "active" for each close target — (a) workspace CC = `Running`/`AwaitingInput` (the reliable M3 signal, the default) ✅; (b) raw right-panel terminal → **scoped to CC-status-only for v1** (no job-control detection — the design-prior lean; documented at the `spawn_shell` seam, Phase 3) ✅; (c) app-quit → **ENUMERATED** (names the busy workspaces) ✅. Recorded in the WIP.
- [x] Added an "active/busy" gate — `isActiveState(stateFor(id))` in `requestClose`; fires `ConfirmModal` when **dirty OR active**, composing both reasons in one message via the `closeWorkspaceSpec(name, {dirtyCount, active})` reasons-object (Phase 1).
- [x] Wired the app-level quit path: `lib.rs` `CloseRequested` → `prevent_close` + emit `quit-requested`; the FE computes the busy set + shows the enumerated confirm → `quit_now` → shared `perform_quit_teardown` + `app.exit(0)` (Phase 2, FRONTEND-DECIDES per AS-BUILT delta 1).
- [x] Frontend tests for the pure gate logic (active-only / dirty-only / combined / no-reason + `isActiveState` both branches + 5 `quitWhileActiveSpec` enumeration cases); live-verified the CC-busy close prompt AND the app-quit confirm (+ real `quit_now`→clean exit-0) via the MCP bridge.
- [x] Installed-`.app` smoke (app-quit lifecycle) — **CARRIED to the next `/release` gate** per the operator's standing installed-build-verify-deferred-to-release convention (operator ran `pnpm tauri:dev` verify-human "all good" on Phases 1+2 incl. the real ⌘Q + Quit-Anyway; the installed-`.app` parity check rides the release smoke like M5/M6/M7 before it).

### WP3: Proper CC / terminal kill with a clean exit (reproduce-first)
**Type:** *(build, but reproduce-first — opens with `/feature-reproduce`)*
**Description:** CC and right-panel-terminal sessions must **reliably exit on kill** — no hang, no orphaned child/subagent, PTY reaped. The kill path already exists (`cc_session/mod.rs` `kill()`: `exit_command`→3s poll→SIGKILL; `kill_all` parallelized), so this is **not a known code gap** — the operator observed sessions not exiting cleanly and the symptom must be **captured before the fix is designed**. A fix applied on assumption risks addressing the wrong failure mode.
**Milestone:** 10.5
**Dependencies:** none (independent bug-shape; parallelizable with WP4)
**Size:** M *(could shrink to S once reproduced, or grow if it's an orphaned-subagent process-group issue)*
**Reproduce-first learning objective:** *which* session kind hangs (CC vs shell), and *why* — candidate modes: (1) the 3s grace is too short for a busy CC turn to process `/exit`; (2) CC ignores slash input while mid-turn (working), so `/exit` never registers and it always falls to SIGKILL; (3) SIGKILL kills the direct child but a spawned subagent / child process **orphans** (needs a process-group kill, not a single-PID kill); (4) the PTY master isn't dropped so EOF/reap never propagates. Capture a concrete repro (steps + which kind + observed hang duration / orphaned PID via `pgrep`) before designing the fix.
**Tasks:**
- [ ] `/feature-reproduce` — reproduce the unclean exit on the installed/dev `.app`: identify the session kind, whether `/exit` takes, whether SIGKILL leaves an orphan (`pgrep -f claude` / `pgrep` for the child after close), and the hang duration. A failing observation (an orphan survives, or close hangs > 3s) is the red state.
- [ ] Design the fix from the captured mode — e.g. kill the **process group** (negative PID / `killpg`) if a subagent orphans; extend/short-circuit the grace if `/exit` is ignored mid-turn (send SIGTERM sooner, or skip `/exit` when CC is known `Running`); ensure the PTY master handle is dropped so EOF propagates. Keep the per-session-kind `exit_command` distinction.
- [ ] Codify: a regression test at the reproducible seam (a session-registry/kill unit test asserting no orphan / bounded exit where the harness allows; the live process-reaping half carried to verify-human per the backend-lifecycle verify-self convention).
- [ ] Installed-`.app` smoke (per convention — backend process lifecycle): kill a real CC + a real shell terminal → both exit, no orphaned `claude`/shell/subagent PIDs, no hang.

### WP4: CC input/output encoding fix — mojibake (reproduce-first)
**Type:** *(build, but reproduce-first — opens with `/feature-reproduce`)*
**Description:** Eliminate garbled characters (`�`, e.g. the observed `-�.`) in CC input and/or output. **⚠️ The SURFACE's prime-suspect fix is already shipped** — the FE output path already writes **bytes** (`term.write(Uint8Array)`), not a pre-decoded string, so the "split multi-byte char decoded to a string" hypothesis is already mitigated on output. The real cause is therefore **elsewhere and must be found by reproduction** before any fix: the two strongest new suspects are the **input** side (`encodeBase64`'s `charCodeAt(i) & 0xff` truncates any code unit > 0xFF → multi-byte *input* like emoji/accented paste corrupts) and xterm's cross-`write()` decoder buffering (each 4096-byte PTY chunk is a separate `write()`); a locale/`TERM`/charset mismatch is a third.
**Milestone:** 10.5
**Dependencies:** none (independent bug-shape; parallelizable with WP3)
**Size:** M *(unknown depth until reproduced; could be a one-line input-encoding fix (S) or a chunk-boundary buffering change)*
**Reproduce-first learning objective:** find an input and/or output that **reliably** mojibakes and localize the corruption to a layer. Is it **input** (type/paste a multi-byte glyph — emoji, accented char, box-drawing — into CC and observe it arrive garbled) or **output** (a CC glyph — spinner, box-drawing, emoji in CC's output — renders as `�`)? For output, does it correlate with a ~4096-byte chunk boundary (a char split across two `cc-output` events)? Capture the exact glyph + direction + reproduction steps.
**Tasks:**
- [ ] `/feature-reproduce` — drive a scratch CC session; test **both directions**: (in) paste/type an emoji + an accented char + a box-drawing char into the CC prompt, observe how CC receives it; (out) trigger CC output containing multi-byte glyphs (or a long redraw likely to split a char across a 4096-byte chunk). Pin the failing case (which direction, which glyph) as the red state.
- [ ] From the localized layer, apply the **right** fix: **if input** → replace `encodeBase64`'s `& 0xff` char-truncation with a UTF-8-correct byte encoding (`TextEncoder` → base64, so multi-byte input round-trips); **if output chunk-boundary** → verify/repair xterm's cross-`write()` decoder buffering (or carry a partial-UTF-8-tail buffer across reads on the Rust side of `spawn_reader_thread` before base64-encoding, so a char never splits an emitted chunk); **if locale** → set the correct `LANG`/`LC_*`/`TERM` in the spawn env. Do NOT re-"fix" the already-correct output `term.write(bytes)` path.
- [ ] Codify: a round-trip test at the localized seam (e.g. `encodeBase64`/`decodeBase64` round-trip a multi-byte string losslessly; or a Rust reader chunk-split test that a boundary-split UTF-8 sequence emits intact) — a red-green test that would have caught the reproduced case.
- [ ] Installed-`.app` smoke (per convention — external-process I/O): the reproduced glyph now renders/arrives correctly on the real `.app`.

---

## Learning-Sequence Ordering

1. **WP1 (PiP top-right) + WP2 (active-close)** — the two **known-shape UX extensions** of existing infra, lowest risk, each unblocks a cleaner daily-driver immediately. Ordered first because their scope is fully known (proven seams) and they carry no reproduce-first uncertainty. Independent of each other → **WP1 ∥ WP2**.
2. **WP3 (kill clean-exit) + WP4 (encoding)** — the two **reproduce-first bug-shapes**, ordered after the UX WPs because their depth is unknown until reproduced (a reproduce could reshape the fix size). Each opens with `/feature-reproduce` (red-green discipline). Independent of each other → **WP3 ∥ WP4**.

**WP1/WP2 → WP3/WP4 rationale:** front-load the *known* work (the UX extensions are pure additions over verified seams) so the release-blocking papercuts with predictable cost land first; defer the *uncertain* work (the bug-shapes, whose fix size is unknown until a reproduction localizes the failure) so a surprising reproduction doesn't stall the known wins. This is the reproduce-first analog of "resolve unknowns cheaply, but don't let an unknown block the certain" — the bug WPs are self-contained, so ordering them last costs nothing and de-risks the milestone's predictable half.

**No 3rd-party probe WP (§4):** M10.5 introduces no external API / SDK / service — all four WPs operate on existing internal seams (AppKit PiP ops, the React close-gate, the PTY kill path, the base64 I/O bridge). No integration to probe.

**No orchestration layer (§5):** all four are synchronous UI/lifecycle fixes; no queue/worker/async wrapper is introduced.

## Dependency Map

```
WP1 (PiP top-right) ──┐
                      ├─ (independent; ∥) ─→ [release cut]
WP2 (active-close) ───┤
                      │
WP3 (kill clean-exit) ┤   (reproduce-first; ∥)
WP4 (encoding fix) ───┘
```

**Critical path:** none — all four WPs are independent (no cross-WP dependency). The milestone completes when all four ship; the practical ordering is WP1/WP2 (known-shape) before WP3/WP4 (reproduce-first) per the learning sequence, but nothing forces it. **Exit gate:** the installed-`.app` smoke (per the installed-build convention — M10.5 touches lifecycle + external-process I/O + a native window op).

**No net-new arch element** — every WP extends an existing subsystem (`pip/`, the `App.tsx` close-gate, `cc_session/`, the `cc/bridge.ts` base64 seam). No new module, dependency, webview, data store, or config surface. This WBS does **not** trigger a P8 arch back-loop.

## OPEN-bucket note

Like the completed M6 friend-QoL, M10.5 is an **open collection**: if the operator surfaces more pre-release papercuts before this milestone is built, append them as **WP5+** (or new SURFACEs anchored here) rather than forcing them into the initial four. The milestone's `/product-context` + build should re-check `SURFACE-2026-07-16-M10.5-QOL-BUCKET` (and any newer QoL SURFACEs) for additions.

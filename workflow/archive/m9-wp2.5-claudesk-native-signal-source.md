# Feature: M9 WP2.5 — Claudesk-native signal source (focus/blur + PTY keystrokes + registry attribution)

**Status:** ✅ COMPLETED 2026-07-07
**Workflow:** feature
**State:** finalize (complete)
**Created:** 2026-07-07
**Entry:** spec (complex feature)
**Milestone:** M9 (Time-analytics panel — absorb `claude-time`, MEASURE don't infer)
**WBS ref:** `docs/product/wbs.md` → "### WP2.5"
**SURFACE:** `SURFACE-2026-07-06-M9-NATIVE-SIGNALS-BEAT-GAP-INFERENCE`
**drive_mode:** autopilot

## Problem Statement

`claude-time` (the tool M9 absorbs) could only ever *infer* the human states — `reading` / `thinking` / `away` — from **CC-hook-stream gaps** plus a guessed typing rate and magic thresholds. It had no other signal, because it lived outside the terminal and the window.

**Claudesk is the terminal and the window.** It can *observe* the exact gap `claude-time` guessed about:
- **Window focus/blur** — is the operator looking at Claudesk at all?
- **Real PTY keystrokes** — is the operator actually typing (and into what), with real timing — not a `chars_per_sec` estimate?
- **Workspace-registry attribution** — which exact project/workspace an event belongs to (Claudesk owns the cwd→workspace map), not a git-root guess.

This WP captures those native signals as a **second event source** into the same write-gated `time_store` WP2 built (`source = "claudesk-native"` alongside `source = "cc-hook"`), so WP3's reclassifier redesign can *measure* where `claude-time` could only estimate. **This is the milestone's core "measure, don't guess" lever** — the thing M9 gained by moving in-app.

**This WP CAPTURES signals; it does NOT interpret them.** Interpretation (the measure-vs-infer fusion rules) is WP3's spec. WP2.5's job is to capture *enough context* that WP3 can disambiguate the known-hard scenarios — because a naive mapping (`blur → away`) is actively wrong.

## User Stories

- As the operator (retrospective analytics user), I want Claudesk to record when its window is focused vs blurred, with timing and workspace attribution, so that WP3 can distinguish "away from the machine" from "reading a CC-opened screenshot in another app."
- As the operator, I want Claudesk to record *that* I was typing and *where* (which workspace's CC PTY / which surface), with counts and timing but never the content, so that WP3 can measure active-typing spans instead of estimating them from a guessed rate.
- As the operator, I want each captured signal attributed to the exact focused workspace/project via the registry Claudesk already owns, so that per-project attribution is measured, not guessed from a git-root.
- As the operator, I want Claudesk-initiated external launches (Sublime Text / Sublime Merge / Finder) marked, so that WP3 can resolve the "blurred but still working" case where I popped an external tool.
- As a privacy-conscious user, I want the guarantee that native-signal rows carry only activity/timing/counts — never keystroke content and never file paths beyond the cwd attribution already stored — extending WP2's length-only invariant.
- As any user, I want all native-signal capture gated by the same tracking toggle as the CC-hook writes (WP5), defaulting OFF, so there is zero cost when tracking is off.

## Acceptance Criteria

The feature is done when:

### A. Schema (same store, second source)
- [ ] The `time_store` schema holds native-signal events in the **same `events` table**, discriminated by `source = "claudesk-native"` (vs WP2's `"cc-hook"`). Reuses the existing columns where they fit (`ts`, `session_id`, `cwd`, `event`, `meta`); focus/keystroke-specific extras live in the `meta` JSON blob. A sibling table is only introduced if a signal genuinely doesn't fit the `events` shape (default lean: **stay in one table** per the WBS "Native-signal schema shape" resolution — one stream for WP3/WP4).
- [ ] A new `source` constant (`SOURCE_CLAUDESK_NATIVE = "claudesk-native"`) mirrors WP2's `SOURCE_CC_HOOK`.
- [ ] Native-signal rows are written through the **same `TimeStore` connection + `write_gated`-style gate** as WP2 (shared `Mutex<Connection>`; the WP2 comments already anticipate "WP2.5's native-signal writer to share the same connection").

### B. Window focus/blur capture
- [ ] The main window's focus transitions (`WindowEvent::Focused(bool)` — the seam PiP auto-summon already uses at `lib.rs:400`) are captured as native-signal rows: a `focus` / `blur` event with `ts` and the currently-focused workspace attribution.
- [ ] Capture is additive to the existing focus handler — it must NOT perturb the PiP auto-summon path (that call stays; the time-store write is a second, independent action, gated).
- [ ] Blur rows carry enough context for WP3 to reason about the hard scenarios: at minimum the timestamp (so blur *duration* is derivable from the paired focus row) and whether the blur was *preceded by* a Claudesk-initiated external launch (see D).

### C. PTY keystroke activity capture
- [ ] Real keystroke bytes flowing into a workspace's CC PTY are captured as activity: at the `cc_input` command choke-point (`cc_session/commands.rs:84`), record **byte count + timestamp** per input (or a coalesced span — see Open Questions), attributed to the session/workspace. **NEVER the byte content.**
- [ ] The captured signal distinguishes the *surface* the keystrokes went to — CC prompt vs right-panel terminal — via session kind in the registry.
- [ ] **Active right-panel surface (editor / diff / terminal) is captured** as a native-signal (OQ4-resolved). This is a surface-*identity* signal from the frontend, NOT editor keystrokes. It lets WP3 measure the operator's dominant idle state: "editor/diff surface active + no PTY keystrokes ⇒ reading code" vs "terminal active + no PTY keystrokes ⇒ following CC." Emitted on surface switch (likely folds with OQ1's active-workspace signal — one `set_active_*` command).
- [ ] Attribution maps `session_id` → its project/cwd. **Constraint discovered:** the `SessionRegistry` currently stores `session_id → Box<dyn CcSession>` and does not expose the per-session `project_path`/cwd outward. WP2.5 must add a way to resolve a session's cwd for attribution (either a registry accessor, or the frontend supplies the cwd, or the `CcSession` trait exposes it).

### D. Claudesk-initiated external-launch marks
- [ ] Claudesk's own external launches — `sublime_open`, `smerge_open`, `finder_open` (`sublime/commands.rs`, `finder/commands.rs`) — emit a native-signal row marking the launch (which tool, which workspace, `ts`), so a subsequent blur can be correlated to "operator popped an external Claudesk tool."
- [ ] **Documented boundary:** the OTHER half of "external launch preceding a blur" — CC running `open <screenshot>` / a browser itself — arrives through the **CC hook stream** as `PostToolUse` with `tool_name="Bash"` and is *already captured by WP2* as `source="cc-hook"` rows. WP2.5 only newly captures *Claudesk-initiated* launches. The WP3 spec-input doc must state both sources so WP3 knows the full external-launch picture.

### E. Privacy invariant (extends WP2)
- [ ] A privacy assertion test proves native-signal rows carry timing / counts / attribution only — **never keystroke content**, never file paths beyond the cwd attribution WP2 already stores. Same class of test as WP2's `row_never_carries_prompt_text` (avoid the coincidental-substring weakness noted in WP2 MINOR #1 — assert on structured fields, not just `!contains`).

### F. Gate (same as WP2)
- [ ] Every native-signal write is gated by `tracking_enabled(app)` (the WP2 hook-point that WP5 wires to the persisted toggle). Gate OFF → **zero-IO no-op** for all native-signal paths (no lock, no INSERT), same as WP2. Defaults OFF (dormant until WP5), same posture WP2 shipped.

### G. WP3 spec-input documentation
- [ ] A short doc (extends/accompanies `docs/product/wp1-time-analytics-probe-outcome.md` or a new WP2.5 note) documents the captured native-signal schema + the 5 hard scenarios and, for each, *what captured data resolves it* (or an honest "this stays inferred / ambiguous"). This is the explicit hand-off input to WP3's measure-vs-infer spec.

### H. Verification
- [ ] `cargo test` green (new native-signal unit tests + privacy test + gate-off zero-IO tests, mirroring WP2's test shape).
- [ ] `cargo clippy --all-targets -- -D warnings` clean; `cargo fmt`.
- [ ] Frontend gate: `tsc --noEmit`, `eslint`, `pnpm vite build` green (if any FE wiring lands — see Open Questions).
- [ ] Live verify-self via the MCP bridge (gate temporarily forced ON in a dev build, or a test seam): focus/blur a scratch workspace and a `cc_input` into a scratch CC session produce `source="claudesk-native"` rows in the dev DB; gate OFF produces zero. Use `tmp/scratch/scratch-{a,b,c}`.
- [ ] Backend-lifecycle + installed-`.app` outcomes (PTY keystroke capture on the real app, GUI-PATH parity) carried to verify-human / the release gate per the project's verify-self posture for backend-lifecycle features.

## Out of Scope

- **Interpretation of the signals** — the measure-vs-infer fusion rules, per-human-state measured-vs-inferred decisions, and resolution of each hard scenario into a *classification rule*. That is **WP3's** spec. WP2.5 only captures enough context.
- **The tracking toggle UI + persisted flag** — that is **WP5**. WP2.5 reuses the existing `tracking_enabled` gate hook-point (hardcoded `false` until WP5).
- **The reclassifier, query layer, dashboard** — WP3 / WP4 / WP6.
- **The AI-vs-human color-family split** (`SURFACE-2026-07-06-M9-COLOR-FAMILIES-AI-VS-HUMAN`) — locked in WP3, not here.
- **Deciding whether a given blur "means" away** — WP2.5 captures the blur + its context; it does not label it.
- **Changing WP2's CC-hook capture** — the `source="cc-hook"` rows are unchanged.

## Technical Constraints

- **No 3rd-party dependency** — pure local capture over existing seams (Tauri window events, the PTY input command, the registry, the external-launch commands). No probe WP needed.
- **Reuse existing seams, don't add parallel ones:**
  - Focus: `lib.rs:400` `WindowEvent::Focused(bool)` handler (already scoped to `"main"`; PiP auto-summon reads it — add the time-store write alongside, gated).
  - Keystrokes: `cc_input` command (`cc_session/commands.rs:84`) is the single choke-point for bytes into a CC PTY. `term_spawn` shell sessions share `cc_input`, so terminal keystrokes flow through the same point. Read `bytes.len()` + `ts`; never the bytes.
  - External launches: `sublime_open` / `smerge_open` (`sublime/commands.rs:24,36`), `finder_open` (`finder/commands.rs:14`).
  - Store: the WP2 `TimeStore` (`time_store/commands.rs`) — shared `Mutex<Connection>`, `write_gated` gate pattern, `time_store_path` per-identity DB.
- **`SessionRegistry` does not expose per-session cwd/project outward** (`cc_session/mod.rs:526` — `HashMap<String, Box<dyn CcSession>>`). Attribution needs a resolution path; adding one is part of this WP (see Open Question 3).
- **Threading:** the focus handler + Tauri `#[command]` fns run on the main thread — writes from them are safe. Any background-thread native-signal write (unlikely here) would follow the same discipline as the WP2 drain thread. No PiP/NSPanel window ops are involved, so the `run_on_main_thread` marshaling constraint does not apply to this WP.
- **Privacy is a hard invariant, not a preference** — same length-only / count-only discipline as WP2's `prompt_length_chars`. Pinned by test.
- **Gate reuse** — `tracking_enabled(app)` is the single gate function; do not add a second gate source (WP5 owns the flip).
- **Arch note:** this WP is entirely additive to the M9 feature-local SQLite DB (the scoped exception to "flat JSON, no DB" that governs the project list). No new arch element beyond what WP2 introduced; reconciled into `arch.md` at WP7.

## Open Questions

- [ ] **OQ1 — Focus attribution granularity.** A `WindowEvent::Focused` is a *window*-level signal; the backend focus handler doesn't inherently know which *workspace* is center-staged (that's frontend state). Options: (a) frontend reports the active workspace to the backend on switch (a lightweight `set_active_workspace` command / already-existing signal?), so the focus handler can attribute; (b) capture focus/blur with no workspace attribution and let WP3 correlate by timestamp against the most-recent keystroke's workspace; (c) frontend emits the focus+workspace pairing itself. **Lean:** check whether the frontend already tells the backend which workspace is active (drive-mode / PiP paths may already carry it); prefer reusing that over a new command. → **resolve in research or at plan time.**

- [ ] **OQ2 — Keystroke coalescing vs per-input rows.** `cc_input` fires per keystroke-batch from xterm. Writing one row per input could be high-volume (though gated OFF by default, and typing bursts are bounded). Options: (a) one row per `cc_input` call (simplest, matches the choke-point; volume acceptable since gated + local SQLite); (b) coalesce into activity *spans* in memory and flush a span row on a gap (lower volume, but adds stateful buffering + a flush trigger). **Lean:** (a) per-input rows for WP2.5 simplicity (capture is cheap; WP3 coalesces into spans when it reads) — but confirm volume is acceptable. → **resolve at plan time; may inform whether WP3 or WP2.5 owns coalescing.**

- [ ] **OQ3 — Where session→cwd attribution lives.** The registry doesn't expose cwd. Options: (a) add a `session_cwd(id) -> Option<String>` accessor to `SessionRegistry` (store `project_path` per session at spawn — small change); (b) have the frontend pass the cwd/workspace with the keystroke signal (but `cc_input` shouldn't grow a param just for this — and it's hot); (c) a side map `session_id → cwd` maintained at spawn/kill. **Lean:** (a) — store `project_path` alongside the session at spawn (the registry already receives it in `spawn`/`spawn_shell`), expose a read accessor. Cleanest, keeps `cc_input` unchanged. → **resolve at plan time.**

- [x] **OQ4 — Is in-app editor typing in WP2.5's capture scope? — RESOLVED (operator, 2026-07-07).** Editor typing is NOT captured (a *frontend* CodeMirror surface, not a PTY; and per the operator, "I don't type much in the editor — when I interact within the editor I'm most of the time *reading*"). **BUT** — precisely because editor-interaction ≈ reading for this operator, WP2.5 DOES capture **which right-panel surface is active/focused (editor / diff / terminal)** as part of attribution — a lightweight frontend→backend surface-identity signal (the surface *identity*, NOT keystrokes). Rationale: the operator's most common "focused-but-idle" state is *reading code in the editor*, which is a genuinely different human-state from *reading a CC transcript in the terminal*. Capturing the active surface turns that dominant idle state from a WP3 *inference* into a *measurement* ("editor-active + no PTY keystrokes ⇒ reading code" vs "terminal-active + no PTY keystrokes ⇒ following CC") — directly serving M9's measure-don't-guess thesis and satisfying the WBS "keystrokes-to-editor-vs-CC" scenario with measured data. **Net capture for WP2.5:** PTY keystrokes (CC + terminal) + window focus/blur + **active right-panel surface** + external-launch marks + registry attribution. Editor *keystrokes* stay out (low signal, would be pure FE-typing wiring). **This is the one place WP2.5 takes on a small frontend→backend signal — confirm the wiring shape at plan time** (likely a `set_active_surface`/`set_active_workspace`-style command emitted on surface switch; may fold together with OQ1's active-workspace signal).

- [ ] **OQ5 — Fold in WP2 MINOR #2?** The `time_store` `ts` silent epoch-0 fallback (`event_to_row` uses `.unwrap_or(0)`) — native-signal rows are stamped by Claudesk itself (main thread), so they always have a real `ts`. Worth deciding a consistent `ts` source for native rows and possibly closing MINOR #2 here (the pause note flagged this as a WP2.5 fold-in candidate). Note: workflow scripts can't call `Date::now`, but this is production Rust (not a workflow script) — `SystemTime::now()` is available in the app. → **resolve at plan time.**

---

## Decision on next step

No 3rd-party unknowns. The open questions are **internal architecture choices** (attribution path, coalescing, editor-scope) — resolvable at plan time or with a light research spike, not external investigation. OQ4 is the only one that could pull in frontend wiring; OQ1 depends on whether an active-workspace signal already exists.

**Recommendation: F3 → research** IF a quick spike is wanted to answer OQ1 (does the frontend already report active-workspace to the backend?) and OQ4 (editor-activity capture scope) before planning. Otherwise **F4 → plan** and resolve the OQs inline (they're all "check the existing code + pick the lean I've noted"). The leans are all documented above, so **F4 → plan** is viable — plan can confirm each lean against the code as its first step.

TRANSITION: F4

---

## Plan — OQ resolutions confirmed against the code (2026-07-07)

Plan step 1 verified every OQ lean against the actual seams. Findings:

- **`RightPanel = "editor" | "diff" | "terminal"`** (`src/components/workspace/panelHost.ts:24`) — exactly the surface identities OQ4 needs.
- **`focusedId`** (`src/state/useWorkspaceList.ts`, consumed in `App.tsx`) is the center-staged workspace id — but it's **frontend-only**; no backend command currently reports it.
- **`WorkspaceRegistry`** (`src-tauri/src/status_broadcaster/commands.rs:144`+) already maps `project_path ↔ workspace_id` with `resolve_cwd`, maintained by the frontend via `workspace_register`/`workspace_deregister` on workspace open/close. This is the app's existing cwd→workspace attribution authority — reuse it, don't build a parallel one.
- **`cc_input`** (`cc_session/commands.rs:84`) is the single PTY-input choke-point; `term_spawn` shell sessions share it → CC + terminal keystrokes both flow through it. It has `session_id` but the `SessionRegistry` (`cc_session/mod.rs:526`) does NOT expose per-session cwd.
- **External launches:** `sublime_open`/`smerge_open` (`sublime/commands.rs:24,36`), `finder_open` (`finder/commands.rs:14`) — all thin `#[tauri::command]` wrappers.
- **Focus handler:** `lib.rs:400` `WindowEvent::Focused(bool)`, scoped to `"main"`, calls `pip_on_main_focus_changed` — runs on the main thread.

**Resolutions:**

- **OQ1 + OQ4 → FOLDED into ONE new signal.** Add a backend command `time_set_active_context { workspace_id, surface }` the frontend calls on **center-stage switch** AND on **right-panel surface switch**. The backend stores it in a small managed `ActiveContext { workspace_id: Option<String>, surface: Option<String> }` (`Mutex`). This is the single new FE→BE signal WP2.5 takes on (spec §OQ4). It does two jobs: (a) attributes focus/blur rows to the focused workspace (OQ1); (b) records active surface (editor/diff/terminal) so WP3 can measure editor-reading (OQ4). *No editor keystrokes captured.*
- **OQ2 → per-`cc_input` rows.** One native-signal row per input call (byte count + ts + session_id + active-context attribution). Cheap, gated OFF by default; WP3 coalesces into spans when reading.
- **OQ3 → reuse active-context attribution, NOT a `SessionRegistry` accessor.** Keystrokes go to the focused workspace; the keystroke row carries `session_id` (from `cc_input`) + the current `ActiveContext.workspace_id`/`surface`. No `SessionRegistry` change needed — the active-context signal already carries the workspace, and `WorkspaceRegistry.resolve_cwd` remains the cwd authority for hook-side rows. Keystroke rows store `session_id`; WP3 joins.
- **OQ5 → native rows stamp real time via a `now_ms()` helper (`SystemTime::now()` epoch-ms).** Native signals are generated by Claudesk itself (no hook `timestamp`), so they always carry a real `ts` — no epoch-0 fallback. Add a shared `time_store::now_ms()` used by all native-row builders. (Does NOT retroactively change WP2's `event_to_row` hook-`ts` path — MINOR #2 there is about hook rows; native rows simply never hit that fallback. Note this in the finding disposition.)

**New/changed surfaces (net):**
- Backend: extend `time_store` with native-row builders + `insert_native_row` + `SOURCE_CLAUDESK_NATIVE` + `now_ms()`; a managed `ActiveContext`; a `time_set_active_context` command; write hooks in the focus handler (`lib.rs`), `cc_input` (`cc_session/commands.rs`), and the three launch commands. All writes gated via `tracking_enabled`.
- Frontend: call `invoke("time_set_active_context", …)` on center-stage switch (App.tsx) and surface switch (RightPanelHost). Thin — no new component.

## Work Tree

- [x] Phase 1: Store extension — native-signal rows in the shared `time_store`  <!-- status: done — all impl + 4 verify nodes complete; 11 tests, 361 pass -->
  **Observable outcomes:**
  - CLI: `cargo test time_store` exits 0 — new tests prove (a) a native-signal row round-trips with `source="claudesk-native"` into the SAME `events` table; (b) a focus row, a keystroke row, and a launch row each carry only counts/timing/attribution in `meta` (privacy: NO content, asserted on structured fields not just `!contains`); (c) `now_ms()` returns a plausible epoch-ms (> the 2020 epoch constant); (d) `insert_native_row` gated OFF writes zero rows (zero-IO), gated ON writes exactly one.
  - CLI: `cargo clippy --all-targets -- -D warnings` clean; `cargo fmt --check` clean.
  - CLI: existing WP2 tests still green (`cargo test` full — 350+ tests, no regression to the cc-hook path).
  - [x] P1.1 Add `SOURCE_CLAUDESK_NATIVE` const + `now_ms()` helper to `time_store/mod.rs`  <!-- status: done -->
  - [x] P1.2 Add typed native-row builders → `native_row(NativeSignal, NativeContext) -> TimeRow` with `source=claudesk-native`, extras in `meta` (counts/timing/attribution only). Event names: `WindowFocus`/`WindowBlur`/`KeystrokeActivity`/`ActiveSurface`/`ExternalLaunch`. `NativeSignal` enum + `NativeLaunchTool` closed enum (no free path string) + `NativeContext` attribution struct  <!-- status: done -->
  - [x] P1.3 Gated write entry `write_native_gated` on `TimeStore` — reuses the SAME connection/mutex + `insert_row`; zero-IO no-op when gate OFF (mirrors `write_gated`). No separate `insert_native_row` needed — native rows are `TimeRow`s, reuse `insert_row`  <!-- status: done -->
  - [x] P1.4 Unit tests: round-trip into same table, privacy (structured-field assertion — avoids WP2 MINOR #1 substring weakness), gate-off zero-IO, `now_ms` sanity, empty-context non-null columns, shared-store cc-hook+native coexistence (11 new tests; 361 total pass)  <!-- status: done -->
  - [x] verify-auto  <!-- status: done — cargo test time_store 30 pass; clippy --all-targets -D warnings clean -->
  - [x] verify-self  <!-- status: done — all 3 CLI outcomes PASS live (native round-trip/privacy/now_ms/gate-off; clippy clean; WP2 no-regression). No integration boundary (isolated new artifacts, callers land P2-4); no live surface to drive for a pure-Rust store — subagent skip documented in Discoveries. -->
  - [x] verify-human  <!-- status: done — AUTO-SKIPPED (drive_mode=autopilot, all 4 gates clean: no integration boundary, verify-self all-PASS, isolated new artifacts). Live native-signal behavior verified at Phases 2-4 when callers land. -->
  - [x] verify-codify  <!-- status: done — 11 native-signal tests pin all P1 behaviors (round-trip, privacy structured-field, now_ms, gate on/off, coexistence, empty-context). Test-first during build; no gaps (real-file INSERT already covered by shared open_at_path_is_reopenable). Full suite 361 Rust + 801 FE pass, no regression. No integration boundary. -->
  <!-- Discovery (not a work unit): pre-existing `cargo fmt` drift in WP2's hook_install/hook_socket — logged in ## Discoveries + backlog (SURFACE-2026-07-07-WP2-FMT-DRIFT). Does not block Phase 1 completion. -->

  **Note on `#[allow(dead_code)]`:** Phase 1 builds the native-signal store API; its callers land in Phases 2–4. The API carries scoped `#[allow(dead_code)]` markers (one block comment in `mod.rs` lists which phase removes each). By Phase 4 the whole `#[allow]` set is gone. Tests exercise every item, so behavior is proven now.

- [x] Phase 2: Active-context signal + focus/blur capture  <!-- status: done — all impl + 4 verify nodes complete; 4 tests, 365 Rust pass; operator-approved -->
  **Observable outcomes:**
  - CLI: `cargo test` exits 0 — a test proves the managed `ActiveContext` round-trips a `{workspace_id, surface}` set via the command core, and that a focus/blur row built while a context is set carries that workspace_id + surface in `meta`.
  - CLI: `cargo clippy --all-targets -- -D warnings` clean.
  - CLI: `tsc --noEmit` + `pnpm eslint` + `pnpm vite build` all exit 0 (frontend `invoke("time_set_active_context")` wiring compiles & bundles — the tauri-command-removal-needs-invoke-sweep discipline: FE/BE binding is stringly-typed).
  - Browser (MCP bridge, gate forced ON in dev): switching center stage between two scratch workspaces and switching the right-panel surface (editor↔terminal) each fire `time_set_active_context`; blurring/refocusing the Claudesk window (⌘Tab away/back) produces `WindowBlur`/`WindowFocus` rows in the dev DB attributed to the focused workspace + current surface. Gate OFF → zero native rows despite the same interactions.
  - [x] P2.1 Backend: managed `SharedActiveContext` (`Mutex<NativeContext>`) via `init_active_context()` + `time_set_active_context{workspace_id,surface,cwd}` command (pure core `set_active_context` for testability) — registered in `lib.rs` invoke_handler + managed in `.manage()`  <!-- status: done -->
  - [x] P2.2 Backend: `record_focus_change(app, focused)` in `time_store::commands` — gated native `WindowFocus`/`WindowBlur` write reading `active_context_snapshot` for attribution; called in the `lib.rs` `Focused(bool)` handler ALONGSIDE `pip_on_main_focus_changed` (independent, best-effort, zero-IO when gate OFF, does not perturb PiP). `preceded_by_launch: false` in P2 (Phase 4 wires the launch correlation)  <!-- status: done -->
  - [x] P2.3 Frontend: single-emitter effect in `RightPanelHost` (owns both `workspaceId`+`projectPath` AND the active `panel` surface) — `invoke("time_set_active_context", {workspaceId, surface, cwd})` when `visible` and on `panel` change. A center-stage switch makes the new host `visible` (covers OQ1 workspace-switch); a surface switch fires with the new panel (OQ4). Cleaner than two racing emitters (App.tsx + RightPanelHost)  <!-- status: done -->
  - [x] P2.4 Tests: `set_active_context` round-trip + clear-to-empty; focus-row-from-active-context attribution (cwd + workspace_id + surface in meta); empty-context blur still inserts (4 new tests; 34 time_store pass)  <!-- status: done -->
  - [x] verify-auto  <!-- status: done — cargo test time_store 34 pass; clippy --all-targets -D warnings clean; tsc && vite build green; eslint RightPanelHost.tsx clean -->
  - [x] verify-self  <!-- status: done — LIVE via MCP bridge (gate temp-forced ON, reverted after): WindowFocus+WindowBlur rows write with source=claudesk-native (startup cycle); time_set_active_context resolves live (__acResult=ok) with a real scratch-a/ws-1 workspace open; gate ON→rows land; cc-hook+claudesk-native coexist in one DB live; app healthy. CARRIED to verify-human: a focus row physically carrying workspace attribution (couldn't force a new OS Focused transition headlessly; halves each proven + unit-pinned). No BLOCKING. -->
  - [x] verify-human  <!-- status: done — operator approved 2026-07-07 -->
    - [x] P2.verify-human.1 live focus row carries workspace attribution  <!-- status: done — operator approved (accepted the two proven halves + unit-pin; gate-ON manual run optional) -->
  - [x] verify-codify  <!-- status: done — 4 Phase-2 tests pin the codifiable behavior (context round-trip/clear, focus-row attribution, empty-context blur). Integration-boundary covered at the meaningful seam (row-build-from-context) + confirmed live via bridge; FE effect-wiring gap is the pre-existing accepted SURFACE-2026-06-22-PANETABS convention. Full suite 365 Rust + 801 FE pass, no regression. -->

- [x] Phase 3: PTY keystroke-activity capture  <!-- status: done — all impl + 4 verify nodes complete; 3 tests, 368 Rust pass; live-proven + operator-approved -->
  **Observable outcomes:**
  - CLI: `cargo test` exits 0 — a test proves a keystroke-activity row carries `byte_count` + `ts` + `session_id` + active-context attribution in `meta`, and NEVER the input bytes (privacy: feed known bytes like `SECRETKEYS`, assert no field contains them).
  - CLI: `cargo clippy --all-targets -- -D warnings` clean.
  - Browser (MCP bridge, gate ON in dev): injecting input into a scratch CC session's PTY (via `__TAURI_INTERNALS__.invoke('cc_input', …)` per CLAUDE.md caveat (e)) produces one `KeystrokeActivity` row per input carrying the byte count, attributed to the active workspace/surface; the row does NOT contain the injected characters. Gate OFF → zero rows.
  - [x] P3.1 Backend: `record_keystroke_activity(app, session_id, byte_count)` in `time_store::commands` (mirrors `record_focus_change`: gated, reads active-context, overrides `session_id` to the keystroke's PTY session, best-effort). Called from `cc_input` (`cc_session/commands.rs`) AFTER `reg.input` succeeds — `byte_count=bytes.len()`, NEVER the bytes; registry lock dropped before the telemetry write. `cc_input` gained `app: AppHandle` (Tauri auto-injects; no FE change — sole caller `XtermPane.tsx:299` passes `{sessionId,data}`)  <!-- status: done -->
  - [x] P3.2 Tests: keystroke_row byte-count + privacy (SECRETKEYS on structured fields, no content in ANY row field); gate-off zero-IO; gate-on count+attribution (3 new tests; 37 time_store pass). Phase-3 `#[allow(dead_code)]` on `KeystrokeActivity` removed  <!-- status: done -->
  - [x] verify-auto  <!-- status: done — cargo test keystroke 4 pass + time_store 37 pass; clippy --all-targets -D warnings clean; FE build clean (cc_input app auto-injected) -->
  - [x] verify-self  <!-- status: done — FULLY LIVE via MCP bridge (gate temp-ON, reverted; NO OS-focus). Opened scratch-a → CC session cc-1 spawned; injected cc_input(cc-1, "ZZZ"=3 bytes) via __TAURI_INTERNALS__.invoke → a KeystrokeActivity row landed: byte_count:3, session_id:cc-1, cwd:scratch-a, meta{surface:editor, workspace_id:ws-1}. PRIVACY PROVEN LIVE: "ZZZ" appears in 0 DB rows AND 0× in the raw DB file bytes (strings grep) — only the count survived. BONUS: also live-proved the Phase-2 attribution chain (time_set_active_context → native row carries workspace_id+surface+cwd). All outcomes PASS, no BLOCKING, nothing carried. -->
  - [x] verify-human  <!-- status: done — operator approved 2026-07-07 (accepted the agent's full-live verification; checklist was empty per pre-filter, all verify-self leaves PASS). -->
  - [x] verify-codify  <!-- status: done — 3 Phase-3 tests pin the codifiable behavior (privacy SECRETKEYS/structured-field, gate on/off, count+attribution). cc_input consuming surface exercised end-to-end LIVE via bridge (the AppHandle glue is untestable in unit; live proof covers it). Full suite 368 Rust + 801 FE pass, no regression. -->

- [x] Phase 4: External-launch marks + WP3 spec-input doc  <!-- status: done — all impl + 4 verify nodes complete; 4 tests, 372 Rust pass; all 3 launch tools live-proven; WP3 doc written -->
  **Observable outcomes:**
  - CLI: `cargo test` exits 0 — a test proves a launch row carries the tool identity (`sublime`/`smerge`/`finder`) + `ts` + active-context attribution, gated.
  - CLI: `cargo clippy --all-targets -- -D warnings` clean; full `cargo test` green (whole suite, no regression).
  - Browser (MCP bridge, gate ON in dev): clicking the Sublime / Merge / Finder launch buttons on a scratch workspace each produce an `ExternalLaunch` row marking the tool + workspace + ts. Gate OFF → zero.
  - CLI: `docs/product/wp2.5-native-signal-schema.md` exists and documents the captured schema + the 5 hard scenarios with, per scenario, what captured data resolves it (or an honest "stays inferred") — the explicit WP3 spec-input.
  - [x] P4.1 Backend: `record_external_launch(app, tool)` helper in `time_store::commands` (mirrors record_keystroke_activity, gated). Called from `sublime_open`/`smerge_open`/`finder_open` (each gained `app: AppHandle`, Tauri auto-injects; FE callers unchanged) AFTER a successful spawn → `ExternalLaunch{tool}` row. ALSO: `time_set_active_context` now emits an `ActiveSurface` switch-marker row on surface change (uses the ActiveSurface variant — gives WP3 the switch timeline). All Phase-4 `#[allow(dead_code)]` removed (native API fully wired)  <!-- status: done -->
  - [x] P4.2 Doc: `docs/product/wp2.5-native-signal-schema.md` written — full schema table + 5-scenario resolution (what data resolves each / honest "stays inferred" for reading-vs-thinking + on-another-Space), the split external-launch picture (Claudesk pops=ExternalLaunch native; CC's `open`=PostToolUse/Bash cc-hook), + §4 open items for WP3 (incl. `preceded_by_launch` currently always false — capture-only, WP3 correlates by ts)  <!-- status: done -->
  - [x] P4.3 Tests: launch row tool identity (all 3 tools) + gate-off zero-IO + ActiveSurface switch-marker attribution + surface-change detection (4 new tests; 41 time_store / 372 total pass)  <!-- status: done -->
  - [x] verify-auto  <!-- status: done — cargo test time_store 41 pass; clippy --all-targets -D warnings clean (all allows removed); FE build clean (launch cmds app auto-injected); WP3 doc exists -->
  - [x] verify-self  <!-- status: done — LIVE via MCP bridge (gate temp-ON, reverted; NO OS-focus). Opened scratch-a; switched surface editor→terminal → TWO ActiveSurface rows ({editor} then {terminal}); finder_open → ExternalLaunch{tool:finder}. THEN (operator cleared window-pops) clicked the real Sublime Text + Sublime Merge buttons → both apps spawned (pids confirmed) + ExternalLaunch{tool:sublime} + {tool:smerge} rows. ALL 3 launch tools live-verified via real button clicks; ALL 5 native-signal kinds present live in one DB; no path leak. No BLOCKING. -->
  - [x] verify-human  <!-- status: done — agent self-verified at operator's explicit request ("can you verify this yourself? ok to pop windows"). All 3 launch tools proven via real button clicks (sublime+smerge popped their apps + wrote correctly-tagged rows; finder earlier). Sublime apps quit + cleaned up after. Nothing left for the operator. -->
  - [x] verify-codify  <!-- status: done — 4 Phase-4 tests pin the codifiable behavior (tool-tag all 3 tools, gate-off, ActiveSurface attribution, surface-change detection). All 3 launch commands + surface-switch exercised end-to-end LIVE via real button clicks. Full suite 372 Rust + 801 FE pass, no regression. -->

## Current Node
- **Path:** Feature > ship + review-quality DONE → next is `/feature-finalize`
- **Active scope:** All 4 phases complete + verified; ship done (uncommitted per commit-only-when-asked); review-quality done (0 CRITICAL / 0 MAJOR / 3 MINOR — 1 fixed inline [stale Sublime doc-comment], 2 auto-backlogged). **NEXT STEP: `/feature-finalize`** (reflect explicitly SKIPPED per operator). All 5 native-signal kinds live-proven; 372 Rust + 801 FE tests pass; clippy clean; gate OFF (WP2 default).
- **Blocked:** none
- **State:** review-quality (complete) → awaiting finalize
- **Unvisited:** `/feature-finalize` (then optionally `/product-finalize` only when the WHOLE M9 cycle's WPs all ship — NOT now; WP2.5 is one WP of M9, remaining WP3/WP4/WP5/WP6/WP7)
- **Open discoveries:** 2 (WP2 fmt drift + WP2 MINOR #2 ts-fallback disposition — both non-blocking, see Discoveries)

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow/backlog.md -->
- [SURFACED-2026-07-07] WP2 MINOR #2 (backlog-quality-findings) — native rows use a real `now_ms()` and never hit `event_to_row`'s epoch-0 fallback; consider whether MINOR #2 (hook-`ts` epoch-0) can be CLOSED or restated now that a real-`ts` path exists. Revisit at Phase 4 finalize.
- [SURFACED-2026-07-07] Phase 1 — pre-existing `cargo fmt` drift in `src-tauri/src/hook_install/mod.rs:356` and `hook_socket/mod.rs:372` (committed by M9 WP2, NOT touched by this WP). `cargo fmt --check` exits 1 on them. Left unformatted to avoid sweeping WP2's files into a WP2.5 commit; a `/feature-refactor` or the next WP2-adjacent touch should `cargo fmt` them. Low priority — cosmetic, no behavior impact. Logged to backlog (SURFACE-2026-07-07-WP2-FMT-DRIFT).
- [SURFACED-2026-07-07] Phase 2 verify-self — driving a NEW OS `WindowEvent::Focused` transition headlessly is unreliable (hide/show + activate via osascript did NOT fire the Tauri focus event — dev app likely on another Space). Worse: `osascript ... first process whose name is "claudesk"` matched the OPERATOR'S PROD app (same process name; dev/prod isolation is by bundle-id, not process name) and hid it — operator caught it, restored (was only hidden, no data loss). LESSON saved as memory [[verify-self-dev-vs-prod-process-name-collision]]. Consequence for this WP: the live-attributed-focus-row check carries to verify-human; do NOT script OS-focus for the dev app again (use the bridge, or carry to human).
- [SURFACED-2026-07-07] Phase 1 verify-self — subagent (`feature-verify-self-runner`) NOT spawned: Phase 1 is a pure-Rust store layer with no dev URL / no running-app surface + no integration boundary (isolated new artifacts, callers land P2–4). Driving a Playwright runner against a non-existent surface is the project's named verify-self anti-pattern ("verify-self on backend-lifecycle features" posture). The 3 CLI observable outcomes were re-run directly from the orchestrator (cargo test time_store 30 pass, clippy --all-targets -D warnings clean, WP2 no-regression) — all PASS. Live native-signal behavior (focus/blur/keystroke rows in the real dev DB via the MCP bridge) is exercised in Phases 2–4 once the callers land.

## Code-Quality Review — m9-wp2.5-claudesk-native-signal-source

*(feature-review-quality, 2026-07-07, autopilot. Baseline: uncommitted working-tree diff. Verdict: **0 CRITICAL / 0 MAJOR / 3 MINOR**.)*

### Strengths
- Privacy invariant enforced *by type shape* (closed `NativeSignal`/`NativeLaunchTool` enums carrying only counts/bools/enum-tags) — structurally no channel for content to reach a row; WP3/WP5 can't widen it without changing a type.
- `record_*` helper mirroring (gate → `try_state` → snapshot → `write_native_gated`): every native-write path fails identically + safely (zero-IO gated-off, log-and-drop on error, never panics the main thread).
- Doc-comment discipline strong throughout; `now_ms()` ties itself to the WP2 MINOR #2 disposition.
- WP3 hand-off doc is honest about limits (split external-launch picture, "stays inferred" scenarios, documented `preceded_by_launch:false` gap).
- Test coverage pins load-bearing behaviors (structured-field privacy assertion, gate on/off per signal kind, cross-source coexistence, real-file WAL/reopen path).

### Issues
**CRITICAL** — (none)
**MAJOR** — (none)
**MINOR**
- [time_store/commands.rs:~197-204] `time_set_active_context` triple-locks the mutex (read-for-compare → set re-lock → clone-for-emit re-lock). No TOCTOU/correctness risk (sole writer, main-thread), but reads awkwardly; a single lock scope returning `(changed, snapshot)` would be clearer. → **AUTO-BACKLOGGED** (readability polish, WP3/WP5 will re-touch this path).
- [time_store/commands.rs:~197] Surface-change check swallows a poisoned lock as `unwrap_or(false)` while the following `set_active_context` surfaces the same poison as `Err` — two dispositions for one lock; a one-line comment would remove the apparent discrepancy. → **AUTO-BACKLOGGED** (folds with the triple-lock cleanup).
- [sublime/commands.rs:21-23] `sublime_open` doc-comment carries the stale "**Transitional (WP5→WP8):** Sublime Text pop is removed once the editor proves parity" framing — CLAUDE.md marks this superseded (WP8 kept both launchers permanently). In-scope (this WP added a paragraph right below it). → **FIXED INLINE** (a doc-comment contradicting a documented decision is a lie a reader would trust; trivial + safe to correct now).

### Assessment
Well-built, disciplined feature; advances the codebase without accruing debt. Privacy-by-closed-enum is the standout. Additive integration is clean — focus handler / `cc_input` / 3 launch commands each gained exactly one gated, best-effort, log-and-drop call that provably can't perturb their primary paths. Error handling consistent (never-panic, zero-IO-when-gated). Only the triple-lock might give a maintainer pause, and it's correct given main-thread single-writer.

### If you disagree
Dismiss any finding by editing this section + marking the line `[DISMISSED]` before finalize archives the WIP.

## Retrospect
- **What changed in our understanding:** The three OQ leans (attribution path, coalescing, editor-scope) all held once checked against the code, but the *shape* of the frontend→backend signal consolidated more than planned — OQ1 (focus attribution) and OQ4 (active surface) folded into ONE `time_set_active_context` command instead of two, and the single emitter landed in `RightPanelHost` (which already owns both `workspaceId`+`projectPath` and the active `panel`) rather than racing emitters in App.tsx + RightPanelHost. The privacy invariant hardened from "assert `!contains`" to "enforce by closed-enum type shape" — the `NativeSignal`/`NativeLaunchTool` enums structurally have no channel for content, so WP3/WP5 can't widen it without changing a type. That's a stronger guarantee than the spec asked for.
- **Assumptions that held:** Every reused seam was where the spec said (`cc_input` choke-point, `lib.rs:400` focus handler, the three launch commands, `WorkspaceRegistry.resolve_cwd` as the cwd authority). Per-`cc_input`-row keystroke capture (OQ2 lean a) was cheap enough. `now_ms()` via `SystemTime::now()` gave native rows a real `ts` with no epoch-0 fallback (OQ5). Gate-OFF zero-IO held across all five signal kinds.
- **Assumptions that were wrong:** Driving a *new* OS `WindowEvent::Focused` transition headlessly for verify-self was assumed scriptable — it is not (hide/show + osascript activate did not fire the Tauri focus event; the dev app was likely on another Space). Worse, `osascript ... first process whose name is "claudesk"` matched the operator's PROD app (dev/prod isolation is by bundle-id, not process name) and hid it. Lesson captured as memory `verify-self-dev-vs-prod-process-name-collision`.
- **Approach delta:** Implementation matched the plan's resolutions closely (OQ1+OQ4 fold, per-input rows, reuse active-context attribution over a SessionRegistry accessor, real-`ts` helper). The only additions beyond the plan: the `ActiveSurface` switch-marker row (gives WP3 the surface-switch timeline, landed in P4) and the inline fix of a stale Sublime doc-comment (review MINOR #3). All 5 native-signal kinds were live-proven on the real dev binary via the MCP bridge — verify-self reached further than the "carry to verify-human" fallback the spec anticipated for backend-lifecycle features.

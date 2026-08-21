# Feature: Window size + position persistence (M13.5 WP1)

**Workflow:** feature
**State:** COMPLETED 2026-08-21
**Created:** 2026-08-21
**Milestone:** 13.5 WP1
**Resolves:** `SURFACE-2026-08-05-WINDOW-SIZE-AND-POSITION-NOT-PERSISTED`
**Drive mode:** autopilot

## Problem Statement

The main window is hardcoded to 1280×800 on every launch (`src-tauri/tauri.conf.json` →
`app.windows[0]`, mirrored in the `tauri.dev.json` overlay) and nothing about its geometry is
persisted — no window-state plugin is registered and there is no hand-rolled equivalent. On the
operator's 1920×1080 display that default occupies about a third of the screen, so the window is
resized on essentially every launch. Restore the last **size + position + maximized** state.

⚠️ **"Fullscreen" here means MAXIMIZED (the green-button/zoomed state), NOT macOS native
fullscreen** — clarified by operator screenshot 2026-08-05 (traffic lights visible, system menu bar
visible, window filling the display but not in its own Space). Persist `SIZE | POSITION | MAXIMIZED`
and **omit `FULLSCREEN`**: the two states restore through different APIs, and relaunching into a
separate Space is a more disorienting behavior than the one asked for.

**No 3rd-party service dependency** — `tauri-plugin-window-state` is a first-party
(`tauri-apps/plugins-workspace`) local plugin, no external API, no probe WP owed.

## Plan-time source reading (what the WBS/backlog did NOT know)

⚠️ **Four findings from reading `tauri-plugin-window-state` 2.4.1's actual source
(`src/lib.rs`, 549 lines) that contradict or sharpen the WBS/backlog text. Do not re-derive these
from the summary lines — the summaries are wrong or incomplete on each point.**

1. ⚠️ **The plugin reads/writes `app_config_dir()`, NOT `app_data_dir()`.**
   `load_saved_window_states` joins `app.path().app_config_dir()`; the backlog's trap 3 says
   "state must live in the per-identity `app_data_dir()`". **On macOS both resolve to
   `~/Library/Application Support/<identifier>/`**, so per-identity isolation holds *anyway* — but
   the claim is right for the wrong reason. **Verify by observing the file, not by re-reading the
   backlog.**
2. ⚠️ **Off-screen safety is NOT clamping — it is skip-if-no-monitor-intersects.** `restore_state`
   loops `available_monitors()` and calls `set_position` **only** inside
   `if m.intersects(position, size)`; a fully off-screen rect means position is simply never
   applied and the OS places the window. Two sharp edges: the loop has **no `break`** (position is
   set once per intersecting monitor), and **`set_size` is applied unconditionally**, outside the
   intersects guard. So trap 2's "verify clamping actually fires" is answered *in the affirmative
   with a different mechanism* — a saved off-screen window comes back on-screen at its saved
   **size**, at an OS-chosen **position**. That is acceptable behavior; it is not what "clamping"
   implies.
3. ⚠️ **THE LOAD-BEARING RISK — persistence on OUR quit path.** The plugin's own
   `CloseRequested` handler updates only the **in-memory cache**; the disk write happens solely in
   `.on_event(RunEvent::Exit)`. Claudesk's quit path is *not* an ordinary close:
   `on_window_event` → `CloseRequested` → **`api.prevent_close()`** → `quit-requested` emit →
   frontend round-trip → `quit_now` → `perform_quit_teardown` → **`app.exit(0)`**
   (`src-tauri/src/lib.rs`). `app.exit(0)` is expected to emit `RunEvent::Exit`, so this *should*
   work — **but the entire feature is worthless if it does not, and it is invisible to
   `cargo test`.** Phase 1 proves it live before anything else is built on it.
4. ⚠️ **`on_window_ready` fires for the PiP NSPanel too, and the restore path calls
   `show()` + `set_focus()`.** PiP is created at runtime via `PanelBuilder` with label `"pip"`
   (`src-tauri/src/pip/commands.rs:96`) — it is not a config window, so it is not excluded by
   default. An un-denylisted PiP would get `set_position` (fighting M10.5 WP1's top-right anchor +
   the in-session `positioned` flag in `pip_resize`) and, if `VISIBLE` were ever added,
   `show()`/`set_focus()` on the deliberately **non-activating** panel. `with_denylist(&["pip"])`
   is **mandatory, not cosmetic**. (`VISIBLE` is omitted from our flags anyway — belt and braces.)
   Relatedly, `perform_quit_teardown` **closes** the PiP panel during quit, so an
   all-windows-scoped plugin would read panel geometry mid-teardown — the M5 WP5 main-thread /
   use-after-free hazard zone (`docs/lessons/pip-nspanel-main-thread.md`).

Two further facts worth not re-discovering:

- ⚠️ **`is_maximized` is forced to `false` on macOS when the window is undecorated or
  non-resizable** (the plugin's inline workaround for upstream `tauri#5812`). Our main window is
  both decorated and resizable, so the real path is taken — but *maximized* is precisely the case
  the operator asked for, so it gets its own live check rather than an inference.
- ⚠️ **`tauri.dev.json`'s `app.windows` REPLACES the base array** (Tauri merges by object key; it
  does not deep-merge arrays). Any window property this WP adds to `tauri.conf.json` must be
  mirrored in the dev overlay or the dev build silently diverges. Both files currently declare
  `width: 1280, height: 800` with **no explicit `label`** — Tauri defaults the label to `"main"`,
  which is what `MAIN_WINDOW_LABEL` (`src-tauri/src/tray/commands.rs:42`) and the
  `window.label() == "main"` focus guard already rely on.

## Work Tree

- [x] Phase 1: Plugin wired, scoped to `main`, and persistence proven across the real quit path  <!-- status: done -->
  **Observable outcomes:**
  - CLI: `grep -c 'tauri-plugin-window-state' src-tauri/Cargo.toml` → `1`, and
    `cargo tree -p claudesk --depth 1 2>/dev/null | grep -c window-state` → `1` (dependency
    actually resolves, not just a manifest line).
  - CLI: `pnpm verify:auto` exits 0 (full gate: lint → format:check → tsc → vitest → cargo fmt
    → clippy `--all-targets -D warnings` → cargo test).
  - CLI: with a launched app, resize the main window, quit it via the **real** quit path, then
    `test -f ~/Library/Application\ Support/com.claudesk.app.dev/.window-state.json` exits 0 and
    `python3 -c` on that file shows a `main` key whose `width`/`height` are the resized values —
    **this is finding 3's proof: the `RunEvent::Exit` write survives
    `prevent_close` + `quit_now` + `app.exit(0)`.**
  - CLI: that same JSON file has **no `pip` key** — `python3 -c "import json;d=json.load(open(p));
    assert 'pip' not in d"` exits 0, after a run in which the PiP panel was summoned (proving the
    denylist bites on a panel that actually existed, not merely on one that never appeared).
  - CLI: the persisted JSON's `fullscreen` field is `false` for `main` even after the window was
    maximized (proving `FULLSCREEN` is not tracked while `MAXIMIZED` is).
  - Browser: relaunching the app after the above, the main window's `manage_window{info}` frame
    matches the persisted `width`/`height` within OS chrome tolerance (±2px) — not 1280×800.
  - Console: no JS errors on load; no new stderr line matching `window-state` or `panic` in the
    app's output.
  - [x] P1.1 Add `tauri-plugin-window-state = "2.4.1"` to `src-tauri/Cargo.toml` with a
        `[dependencies]` comment in the house style (why first-party, why this flag set, why the
        denylist) — matching the existing per-dep comment convention in that file.  <!-- status: done -->
  - [x] P1.2 Register the plugin in `run()`'s builder chain (`src-tauri/src/lib.rs`, alongside the
        other unconditional `.plugin(...)` calls) as
        `tauri_plugin_window_state::Builder::new().with_state_flags(SIZE | POSITION | MAXIMIZED)
        .with_denylist(&["pip"]).build()`. ⚠️ **Omit `FULLSCREEN` and `VISIBLE`** — `FULLSCREEN`
        per the operator's clarified ask; `VISIBLE` because `restore_state` would then call
        `show()`/`set_focus()`, which must never be aimed at the non-activating PiP panel (finding
        4). Reuse/extend a shared `"main"`/`"pip"` label constant rather than adding a fourth
        stringly-typed literal (`tray/commands.rs:42` and `pip/commands.rs:96` already own them).  <!-- status: done -->
  - [x] P1.3 ⚠️ **Prove finding 3 live** — launch, resize to a distinctive non-default size, quit
        through the real path (⌘Q / red button, i.e. `CloseRequested` → `prevent_close` →
        `quit_now` → `app.exit(0)`), and confirm `.window-state.json` on disk carries the new
        size. **If `RunEvent::Exit` does NOT fire on this path**, add an explicit
        `app.save_window_state(flags)` call inside `perform_quit_teardown` **before**
        `pip::commands::teardown(app)` (so the panel is still alive and untouched when the main
        window's geometry is read) — and pin that ordering with a test, per
        `docs/lessons/source-text-guards.md` entry 11 (an ordering assertion is blind to any step
        that emits no observable — so assert on an observable the save itself produces, not on the
        `sleep`-shaped absence of one).  <!-- status: done -->
  - [x] P1.4 ⚠️ **Confirm dev/prod geometry isolation empirically** — the file must appear under
        `com.claudesk.app.dev/` for a `pnpm tauri:dev` run and under `com.claudesk.app/` for the
        installed build, never shared. Do **not** settle this by re-reading the backlog (which
        names the wrong dir accessor — finding 1); settle it by listing both directories.  <!-- status: done -->
  - [x] P1.5 ⚠️ **Verify the maximized case specifically** — maximize (green button, *not* macOS
        fullscreen) → quit → relaunch → still maximized. Then assert the persisted JSON's
        `maximized: true` **and** `fullscreen: false`, which together prove finding 5's
        decorated/resizable path was taken rather than the `tauri#5812` force-`false` branch.  <!-- status: done -->
  - [x] P1.6 ⚠️ **Verify the off-screen restore path does not strand the window** — hand-edit
        `.window-state.json` to coordinates on no attached display (e.g. `x: -9000, y: -9000`),
        relaunch, and confirm the window is visible on the current display via
        `manage_window{info}` geometry math (`[[mcp-bridge-manage-window-reads-native-geometry]]`;
        convert to AppKit y-up). ⚠️ Expect **size preserved, position OS-chosen** — per finding 2
        that is the plugin's real behavior, not clamping. If the window lands invisible, clamp to
        the current visible frame ourselves.  <!-- status: done -->
  - [x] P1.7 Mirror any new window property into `src-tauri/tauri.dev.json`'s `app.windows` entry
        if P1.1–P1.2 required one (finding 6: the overlay array **replaces**, it does not merge).
        If no config change was needed, state that explicitly rather than leaving the task
        ambiguous.  <!-- status: done -->
  - [x] verify-auto  <!-- status: done — 5 scoped checks, all green (2026-08-21) -->
  - [x] verify-self  <!-- status: done — 6/7 outcomes PASS, 1 PASS-weak (live-PiP), 0 BLOCKING (2026-08-21) -->
  - [x] verify-human  <!-- status: done — operator approved all 3 leaves (2026-08-21) -->
    - [x] P1.verify-human.1 Resize the window, quit, relaunch → window returns at the chosen size/position  <!-- status: done -->
    - [x] P1.verify-human.2 Maximize (green button), quit, relaunch → window returns maximized, NOT in its own Space  <!-- status: done -->
    - [x] P1.verify-human.3 Summon PiP, move it, quit, relaunch → PiP still lands top-right per M10.5 WP1; and `.window-state.json` still has no `pip` key (closes the verify-self residual)  <!-- status: done -->
  - [x] verify-codify  <!-- status: done — +1 vacuity guard, 4 assertions mutation-proven individually + meta-probe (2026-08-21) -->

## Current Node
- **Path:** Feature > finalize
- **Active scope:** none — shipped as `25a68bc`; review-quality complete (0 CRITICAL, 2 MAJOR + 4 MINOR auto-backlogged per autopilot)
- **Blocked:** none
- **Unvisited:** none — single-phase feature, all phases complete
- **Open discoveries:** none — the live-PiP denylist residual was CLOSED at verify-human (P1.verify-human.3)

## Notes on scope + testability

**Why one phase, not several.** The dependency-plus-registration is nearly free; the WBS is
explicit that **the three traps ARE the work**, and all three are properties of the *same*
registration. Splitting them into phases would put a `verify-human` gate between halves of one
config decision with nothing independently shippable in between. P1.3–P1.6 are the trap
verifications, sequenced so the load-bearing one (finding 3, does the save even happen on our quit
path) is settled first — a failure there changes the implementation, and discovering it after the
maximized/off-screen checks would waste them.

⚠️ **What `verify-codify` can and cannot pin here.** Almost all behavior lives in third-party code
driven by real AppKit windowing, so a unit test cannot observe it — and a `?raw`/source-text guard
over `lib.rs` asserting the literal `with_denylist` string is the *exact* shape
`docs/lessons/source-text-guards.md` warns about (it passes on the module's own comments, and it
proves the text exists, not that the plugin is registered). The honest codify targets are:
1. a test that the registration's flag set **excludes** `FULLSCREEN` and `VISIBLE` and the denylist
   **includes** `"pip"` — via an extracted pure fn returning `(StateFlags, &[&str])` that `run()`
   itself calls, so the test drives the real value rather than re-implementing it
   (`[[extract-for-import-when-a-raw-guard-cant-express-the-property]]`);
2. if P1.3 forces an explicit `save_window_state` in `perform_quit_teardown`, an ordering assertion
   that it precedes `pip::commands::teardown` — with an **observable** emitted by the save step
   itself, per entry 11.
   ⚠️ **Mutation-prove each individually** and confirm the mutant landed in executable code
   (`[[verify-the-mutation-landed.md]]`, `[[invalid-probe-and-real-hole-look-identical]]`).

⚠️ **Verify on the INSTALLED `.app` where geometry semantics differ** — but per
`[[installed-build-verify-deferred-to-release]]` the operator defers installed-build manual
verification to the `/release` gate. Phase 1's agent-side checks therefore run against
`pnpm tauri:dev` (the `com.claudesk.app.dev` identity), and P1.4's prod-side half is a
`/release`-gate item rather than a blocker here.

## Build results (2026-08-21)

**Implementation is 3 files:** `src-tauri/Cargo.toml` (+1 dep), `src-tauri/src/lib.rs`
(module decl + one `.plugin()` line), `src-tauri/src/window_state/mod.rs` (new — the
registration policy as pure fns + 4 tests). **No `tauri.conf.json` / `tauri.dev.json`
change was needed** (P1.7): the plugin keys off the default `main` label, so no window
property was added and the overlay-replaces-array hazard never came into play.

**`pnpm verify:auto` exits 0.** Rust 858 (= 854 baseline + 4 new; the `841` printed for
the lib target is not the total — the baseline is the all-targets sum 841+16+1), frontend
2136 unchanged, clippy `--all-targets -D warnings` clean. ⚠️ `cargo fmt --check` **caught a
real violation in the new test file** on the first run — the gate earning its place again
(`docs/lessons/verify-auto-gate.md`); fixed, re-run green. Runtime 55s, recorded in
`runtimes.md`.

### What the live run PROVED (all against the dev identity, `pnpm tauri:dev`)

1. ⚠️ **Finding 3 RESOLVED IN FAVOUR OF THE SIMPLE IMPLEMENTATION — no
   `save_window_state` call in `perform_quit_teardown` is needed.** `RunEvent::Exit` **does**
   fire through `CloseRequested` → `prevent_close()` → frontend round-trip → `quit_now` →
   `perform_quit_teardown` → `app.exit(0)`: resized to 1111×733, quit via that path, and
   `.window-state.json` carried the new size. **Verified three separate times** across the
   session (each quit persisted correctly). The plan's fallback branch is therefore NOT
   taken — and the ordering test it would have required is not owed.
2. **Restore works end to end.** Relaunch came back at **1111×733 @ (320,93)** instead of
   the hardcoded 1280×800. This is the WP's headline outcome.
3. **P1.5 — maximized restores as MAXIMIZED, not fullscreen.** Seeded `maximized: true`,
   relaunched → **1920×1050 @ (0,30)**. The y=30 origin and 1050 height are the
   green-button/zoom geometry *below the menu bar*; native fullscreen would be 1920×1080 @
   (0,0) in its own Space. Also clears the `tauri#5812` question — `is_maximized` was **not**
   force-`false`, so the decorated+resizable path was taken.
   ⚠️ Note the plugin saves `maximized: true` while leaving `width/height` at the
   *pre-maximize* 1111×733 — deliberate, so unmaximizing returns to the old geometry. Do not
   "fix" that as a stale-size bug.
4. **P1.6 — the off-screen trap does NOT bite, and finding 2's mechanism is confirmed.**
   Seeded `x/y = -9000`, relaunched → window at **(320,93), size preserved**, visually
   confirmed by screenshot (fully on-screen, picker rendered). Position was *never applied*
   (no monitor intersected) and the OS placed it; `set_size` applied regardless. **So no
   hand-rolled clamping is needed** — the plan's fallback is not taken. The next launch
   self-healed the file, demoting `-9000` to `prev_x/prev_y`.
5. **P1.4 — dev/prod isolation holds, and finding 1 is confirmed empirically.**
   `.window-state.json` exists **only** under `com.claudesk.app.dev/`, beside `projects.json`
   (a known `app_data_dir()` artifact) — so on macOS `app_config_dir()` and `app_data_dir()`
   do resolve to the same per-identity base. The backlog's trap-3 claim is true for a
   different reason than it states. ⚠️ It is a **dotfile**: plain `ls` hides it, which briefly
   read as "absent" mid-verification. Use `ls -a` or an explicit path.
6. **Four unit tests, each mutation-proven INDIVIDUALLY** (per
   `[[verify-the-mutation-landed]]` + `[[invalid-probe-and-real-hole-look-identical]]`): add
   `FULLSCREEN` → only test 1 fails; add `VISIBLE` → only test 2; empty denylist → only test
   3; denylist grown to swallow `"main"` → only test 4. Every mutant was confirmed to land on
   **executable** code (`sed -n '<line>p'` on the changed line, not a comment), and each
   failed exactly one test with the other three still green. Source restored and re-verified
   after the last mutant.
   ⚠️ Test 4 (`does_not_denylist_the_main_window`) exists because a denylist that grew to
   cover `main` would make the whole feature a silent no-op while every other assertion
   still passed.

### ⚠️ What was NOT proven — the honest residual

**The denylist's live-PiP half.** The Observable Outcome asked for the no-`pip`-key check
"after a run in which the PiP panel was summoned." The persisted file has **only a `main`
key** (asserted, passes) — but **the dev app's PiP panel was never successfully summoned**,
so this is the weaker "no key for a panel that never appeared," which the outcome explicitly
called out as insufficient. Three summon routes failed: the MCP bridge allowlists
`pip_set_mode` out of `ipc_execute_command`; `webview_execute_js` times out on any script
that calls `invoke` (though the invoke does not fire — `manage_window{list}` confirmed no
panel was created); and an emitted `menu` / `view.pip.mode.on` event did not take, most
likely the documented payload double-encoding.

**Why this is a low-risk residual rather than a gap to chase:** the wiring is airtight *by
construction* — the panel is built with `PANEL_LABEL` (`pip/commands.rs:393`) and the
denylist passes **that same constant**, so the label the plugin tests and the label the panel
is created with cannot diverge; mutant C proved the assertion bites. What remains unobserved
is only the runtime composition, not the value. **Route for verify-human:** summon PiP from
the real View menu (or the icon button), quit, and confirm the file still has no `pip` key —
one click, and it is already a verify-human check item.

⚠️ **A dev-build caveat worth carrying:** the `cargo run` dev binary is **not a bundled
`.app`**, so `System Events` reports `bundle identifier = missing value` and (early in a
launch) **no windows at all** for it. Two consequences hit during this session — see the
Discoveries entry below. Address the dev app **through the MCP bridge**, which binds
`127.0.0.1:9223` under `#[cfg(debug_assertions)]` and therefore cannot reach a prod install.

## verify-self results (2026-08-21)

**Integration boundary: YES.** `lib.rs`'s builder chain is an existing consumed surface — adding a
plugin changes startup for the existing `main` window, and the quit path (`CloseRequested` →
`quit_now` → `app.exit(0)`) now carries a side effect it did not have. The phase's outcomes cite the
consuming surfaces by name (the `main` window's `manage_window{info}` frame; the real quit path;
`pnpm verify:auto`), so the rule is satisfied — no back-loop owed.

**Split verification, and why.** ⚠️ `mcp__tauri__*` bridge tools reach the orchestrator but **NOT**
spawned subagents (`[[mcp-bridge-tools-not-exposed-to-subagents]]`) — a subagent pointed at
`http://localhost:1420/` gets bare Vite with no Tauri IPC and no native window, so any geometry
verdict it drew would be meaningless. The subagent was therefore scoped to the CLI/filesystem
outcomes (+ a static consistency cross-check), and the orchestrator drove the native-window outcomes
over the bridge. The spawn itself is unconditional per `arch.md` (parent-context cleanliness).

| Outcome | Verdict | Evidence |
|---|---|---|
| CLI: dep resolves | **PASS** | `grep -c` → 1 (`Cargo.toml:127`); `cargo tree --depth 1` → 1 (`v2.4.1` under `claudesk v0.3.4`) |
| CLI: `pnpm verify:auto` exits 0 | **PASS** | exit 0; Rust 858, frontend 2136 (orchestrator-observed at build). Subagent independently confirmed the script SHAPE: all 7 steps, `--all-targets` present (not `--lib`), `cargo fmt --check` present, `tsc` via `./node_modules/.bin/tsc` not `pnpm exec` |
| CLI: state persists resized size across the REAL quit path | **PASS** | 1111×733 written; **verified 3× independently** |
| CLI: no `pip` key | **PASS (weak — see residual)** | `keys: ['main']`, exit 0 |
| CLI: `fullscreen` false while maximized tracked | **PASS** | seeded/observed `maximized:true` + `fullscreen:false`; restored 1920×1050 @ (0,30) = zoom, not native FS |
| Browser: restored frame matches persisted, not 1280×800 | **PASS** | `manage_window{info}` → 1111×733 @ (320,93); **0px deviation** (±2px allowed). `devicePixelRatio:1`, so logical == physical |
| Console: no JS errors on load; no plugin stderr | **PASS** | root mounted (1 child, 808 chars, picker content present), no `vite-error-overlay`, no error text; 0 panics across 5 dev launches; no `window-state` stderr |

**Bonus static cross-check (subagent CLI-5) — the unit tests are NOT vacuous.** `lib.rs:214` is
`.plugin(window_state::register())` (unconditional, no `#[cfg]`), and `register()`'s body is
`Builder::new().with_state_flags(state_flags()).with_denylist(&denylist()).build()` — **zero inline
literals**, so the 4 tests assert over the exact values handed to the plugin. Chain confirmed:
`denylist()` → `PANEL_LABEL` → `"pip"` (`pip/commands.rs:96`), the same label the `PanelBuilder`
uses, and exactly the key the no-`pip` check asserts absent.

⚠️ **A file-reading caveat worth keeping (subagent CLI-3).** `.window-state.json` **always** carries
`visible` / `decorated` / `fullscreen` fields — that is the plugin's serialization struct, written
regardless of the flag set. Their presence is **NOT** evidence those flags are enabled; the flags
govern what is *restored*. Do not read that file as a flag manifest.

### ⚠️ Two instrument failures caught by positive control — neither detectable from its own output

1. **`read_logs{source:"console"}` captures NOTHING for this app.** It returned empty, which reads as
   "no JS errors" — a false PASS from a dead instrument. Proven dead by **deliberately emitting**
   `console.error`/`warn`/`log` and re-reading: still empty. The Console outcome was re-verified
   through a self-tested tap (`selftestWorked: true`) plus DOM-mount evidence instead. ⚠️ **Never
   conclude "no errors" from an empty `read_logs`** — this is a new instance of the caveat-(l) class
   (`[[xterm-dom-reads-fake-a-blank-pane]]`: instrument silence ≠ absence).
2. **`Object.keys(__TAURI_INTERNALS__)` returns only `["plugins"]` — but `invoke` IS present**
   (non-enumerable, `typeof` → `"function"`). A key-listing tap reports absence where the property
   exists, so "there is no invoke" was wrong. Matches documented caveat (l).

### ⚠️ The one residual — the live-PiP half of the denylist check

The no-`pip`-key assertion passes, but the outcome asked for it **after a run in which the panel was
summoned**; the dev app's panel was never summoned, so this is the weaker "no key for a panel that
never appeared" — which the outcome itself flagged as insufficient. Three summon routes failed: the
bridge allowlists `pip_set_mode` out of `ipc_execute_command`; `webview_execute_js` times out on any
script calling `invoke` (and `manage_window{list}` confirmed **no panel was created**, so the invoke
genuinely did not fire); an emitted `menu` / `view.pip.mode.on` event did not take (likely the
documented payload double-encoding).

**Classified NON-BLOCKING**, on the CLI-5 chain above: the label the plugin would key on and the
label the denylist passes are *the same constant*, so they cannot diverge, and mutant C proved the
assertion bites. What is unobserved is the runtime composition, not the value. **It is already a
verify-human check item** (summon PiP from the View menu / icon button → quit → confirm no `pip` key)
— one click, on a surface the operator has open anyway.

## verify-human results (2026-08-21) — APPROVED

Operator approved all three leaves ("all good"). **Integration boundary applied, so the F11
auto-skip path was correctly forbidden** — the checklist was mandatory, not elective.

| Leaf | Verdict |
|---|---|
| P1.verify-human.1 — drag-resize + move → quit → relaunch | **PASS** |
| P1.verify-human.2 — green-button maximize → quit → relaunch | **PASS** |
| P1.verify-human.3 — PiP summon/move → quit → relaunch; no `pip` key | **PASS** |

⚠️ **These were NOT re-runs of agent PASSes, and the distinction is the point.** verify-self proved
size- and maximize-restore using a **synthetic IPC resize** and a **hand-seeded `maximized: true`**.
Neither exercised the plugin's real input path — it saves from `Moved`/`Resized` window events, which
a trackpad drag and a green-button click generate and an IPC `set_size` may not. The operator's pass
covers the real gesture path. **The evidence is in the persisted file**: it came back as
`1907×1045 @ (0,30), maximized: true` — 1907×1045 is a *real zoom* geometry (odd numbers, and
`prev_x: 1`), not any value the agent ever wrote.

### ⚠️ THE verify-self RESIDUAL IS CLOSED — and now in its STRONG form

P1.verify-human.3 summoned the PiP panel for real, which is precisely what the agent could not do
(three routes failed: bridge allowlist on `pip_set_mode`, `webview_execute_js` timing out on any
`invoke`, and the `menu` event's payload double-encoding). After a run in which **the panel actually
existed and was moved**, the persisted file still reads `keys: ['main']`, `pip key present: False`.

So the denylist claim upgraded from *"no key for a panel that never appeared"* (the weak form
verify-self was honest about) to **"a panel existed, was moved, and was still excluded"** — the form
the Observable Outcome originally demanded. PiP also still landed top-right per M10.5 WP1, so the
geometry plugin is not fighting the anchor.

**No design prior proposed** — the approval was a clean confirmation with no correction, so the
capture discriminant (a product-design tradeoff + a transferable why) does not fire.

## verify-codify results (2026-08-21)

**Integration boundary: YES**, and the boundary test is **deliberately not written** — with the
reason stated rather than skipped silently. `tauri::Builder` cannot be instantiated headlessly, the
plugin exposes no command we drive, and this repo has **no `tauri/test` feature and no mock runtime
anywhere** — the seven other plugin registrations in `lib.rs` have *zero* test coverage, which is the
established precedent. Enabling a mock-runtime surface to assert "a plugin got registered" would add
a test-only dependency to prove what the value tests already pin, while the consuming surface itself
was verified **live** (5 launch/quit cycles, 3 independent save/restore proofs) and **operator-
approved on real gestures**. Recorded as a judgment, not an oversight.

**No new coverage duplicated.** The 4 existing tests already assert the policy values; nothing else
in the repo touches `window_state`.

### One test added — and it closes a hole the other four could not see

`register_consumes_the_policy_fns_rather_than_inlining_literals`.

⚠️ **The hole is vacuity, and mutant E demonstrated it rather than argued it.** All four value tests
assert on `state_flags()` / `denylist()`. If `register()` stops *calling* them and inlines its own
literals, the plugin is configured by text no test observes — and **mutant E confirmed all four stay
GREEN** in exactly that state. `TauriPlugin<R>` is opaque (no getter for flags or denylist), so there
is no runtime seam; a source-level tripwire is the only available instrument.

⚠️ **Built in the form the lesson prescribes, NOT the form the plan warned against.** The plan
correctly rejected a `?raw` guard over `lib.rs` asserting `with_denylist` — satisfied by comments,
proves text exists. This guard instead: scopes to `register()`'s body **only** (split on the
signature, bounded at `\n}\n` so neither the test module nor any later item can satisfy it),
**strips comment lines**, and asserts the **call shape** `fn(`. Modelled on the existing precedent in
`announce/mod.rs`.

**Four assertions, each mutation-proven INDIVIDUALLY** (`[[verify-the-mutation-landed]]`), every
mutant confirmed to land in **executable** code and to fail **only** this guard:

| Mutant | Change | Result |
|---|---|---|
| **E** | `register()` inlines both literals | guard FAILS; **all 4 value tests stay green** — the vacuity hole, demonstrated |
| **F** | bypass `denylist()` while keeping the *correct value* (`PANEL_LABEL`) | guard FAILS — single-home invariant broken though the value is right |
| **G** | second `.with_state_flags(StateFlags::SIZE)` that WINS, `state_flags()` still called | guard FAILS — the `contains` asserts pass; only the **negative** assert catches it |
| **H** | `.skip_initial_state("main")` string literal added | guard FAILS — stray window label outside `denylist()` |

⚠️ **Plus a META-probe on the guard's own premise** (`[[invalid-probe-and-real-hole-look-identical]]`):
renamed the production fn to `register_renamed` (and fixed `lib.rs` so it *compiled* — the first
attempt failed to build, so the test never ran and proved nothing). Result: the guard **panics loudly**
(`"register() must exist with this signature"`) rather than silently passing on an empty haystack. So
it cannot decay into a no-op guard — the failure mode entry 11 of `source-text-guards.md` warns about.

**What is NOT owed, per the resolved findings:** no `save_window_state` ordering test (finding 3
resolved — `RunEvent::Exit` fires on our quit path, so the fallback branch was never taken) and no
clamping test (finding 2 resolved — the plugin's skip-if-no-monitor-intersects suffices, verified
live at P1.6).

**Full suite: `pnpm verify:auto` exits 0.** Rust **859** (854 baseline + 5), frontend **2136**
unchanged, clippy `--all-targets -D warnings` clean, `cargo fmt --check` clean. **No test triage
owed** — zero failures. ⚠️ A `grep -ciE 'FAILED'` over the log returned 11, which looked alarming
against exit 0; all 11 are test *names* containing "failed" (`a_failed_spawn…`, `a_failed_clone…`)
plus `0 failed` summary lines. Checked rather than assumed.

## Test Triage — hook_socket::tests::loop_exits_cleanly_when_receiver_is_dropped

Classification: **Flaky test — failure unrelated to the new code; inconsistent across runs**
Confidence: high
Evidence: Panicked at `src-tauri/src/hook_socket/mod.rs:568:51` —
`client.shutdown(...).unwrap()` returned `Os { code: 57, kind: NotConnected }`. That is a **race
intrinsic to what the test exercises**: it deliberately drops the receiver so `accept_loop` returns
and closes the connection; when the server wins that race, the client's subsequent `shutdown` finds
nothing connected. Nothing in this feature touches `hook_socket`, sockets, or threading — the WP1
diff is `Cargo.toml` (+1 dep), `lib.rs` (+2 lines, a module decl and a `.plugin()` call), and the new
`window_state/` module.
Action: **Re-ran per §3b rather than modifying anything** — 3/3 passes in isolation, and the next
full `pnpm verify:auto` went green (exit 0, Rust 859, frontend 2136, zero FAILED lines). Classified
flaky, so **no code or test was changed** (§3b: never modify to eliminate a flake). Logged to
`backlog.md` as a standing flake so the next occurrence is not re-diagnosed from scratch.

## ship (2026-08-21)

**Committed `ab885ad` on `main`** — 8 files, +792/-10. Direct to `main` per the project's
branch policy (never auto-branch); **not pushed** — pushing is operator-requested only.

**Cleanup:** no scratch files, no TODO/FIXME/`dbg!`, no `unwrap()` outside tests (the backend rule).
⚠️ **`Cargo.lock` gained exactly ONE package** — the plugin pulled no new transitive deps, which also
confirms the plan-time crate-source read (done by downloading the `.crate` into the session
scratchpad) left no lockfile footprint. That is the `pnpm add`-in-`tmp/` trap `CLAUDE.md` documents,
in its cargo form.

**`wbs.md` WP1 marked done + its two disproven claims corrected in place** — trap 1.3's "verify
clamping fires" and trap 1.4's `app_data_dir()`. Leaving a refuted claim standing as live spec is the
`[[doc-correction-scope-list-is-a-floor]]` failure; both now carry a `→ RESOLVED:` line stating the
actual mechanism.

⚠️ **The backlog item is NOT deleted here** — `SURFACE-2026-08-05-WINDOW-SIZE-AND-POSITION-NOT-
PERSISTED` still carries both disproven claims at lines 240–241. Deletion is coupled to the
`**Backlog resolved:**` CHANGELOG append in the SAME commit (the delete-on-resolve invariant), which
is `feature-finalize`'s job. Ship deliberately did not pre-empt it.

**Final verification: `pnpm verify:auto` exit 0** — Rust 859, frontend 2136, zero FAILED lines.
⚠️ **The first ship-time run came back exit 101**, which read as a compile error until I read the log:
it was one flaky socket test, and my own `grep -cE '^error'` had matched cargo's *"test failed"* line.
Triaged as flaky per §3b (3/3 in isolation, next full run green), **nothing modified to quiet it**, and
filed as `SURFACE-2026-08-21-HOOK-SOCKET-SHUTDOWN-RACE-IS-FLAKY`. See `## Test Triage` above.

## Code-Quality Review — window-geometry-persistence (M13.5 WP1)

Reviewed against ship commit `25a68bc`. **0 CRITICAL · 2 MAJOR · 4 MINOR.** Both MAJORs are about
**prose, not code**; the reviewer independently re-verified all four plugin-source claims against
`tauri-plugin-window-state` 2.4.1 and they hold.

### Strengths
- The pure-policy seam (`state_flags()`/`denylist()` as fns `register()` actually calls) is the right
  answer to an untestable third-party surface — tests drive the real values instead of
  re-implementing them (`[[extract-for-import-when-a-raw-guard-cant-express-the-property]]`).
- All four plugin-source claims verify against the crate (`app_config_dir` at :122/:515,
  `RunEvent::Exit` save at :503-504, `set_position` inside `if m.intersects` with `set_size` outside,
  `on_window_ready` at :407) — measurements, not inferences, and correct enough to refute the WBS and
  backlog on four points.
- `denylist()` sources the label from `crate::pip::commands::PANEL_LABEL` rather than re-spelling
  `"pip"`, so a rename cannot silently drop the panel back into scope.
- The vacuity guard follows the `announce/mod.rs` precedent (anchor-split, tail-bounded at
  `\n}\n`, comment-stripped, single-token assertions that survive `cargo fmt` reflow), and its two
  negative assertions catch the alongside-a-literal mutant the positive ones cannot.
- Both disproven WBS trap claims corrected in place with `→ RESOLVED:` lines rather than left as live
  spec; ship correctly deferred the backlog delete to finalize's coupled CHANGELOG-then-delete commit.

### Issues

**CRITICAL**
- (none)

**MAJOR**
- [`src-tauri/src/window_state/mod.rs`:1-117] **117 lines of comment for 14 lines of executable
  code** (58 `//!` + 45 `///`). A large share fails the comment-budget test in
  `docs/lessons/source-text-guards.md` — *would a reader make a worse decision without this
  sentence?* The `1280×800`/`tauri.conf.json` history, "resized on essentially every launch", "their
  display is 1920×1080", "verified live at P1.3 rather than assumed", and "the backlog entry says X"
  are **provenance**, which that lesson routes to the WIP/archive/CHANGELOG. The four plugin
  properties and the two flag-omission rationales genuinely belong at the code. ⚠️ **The commit
  message already carries all of it verbatim — that is the correct home.** *Why it matters: the
  lesson records comment density flagged in four consecutive reviews of one file, and warns that at
  high density 95%-accurate prose reads as authoritative while the wrong 5% is what gets acted on.*
- [`mod.rs`:84-102, `lib.rs`:101-104 + 208-213, `Cargo.toml`:118-126] **The PiP-denylist rationale is
  stated at FOUR sites.** `M10.5 WP1's top-right anchor` appears at mod.rs:90, mod.rs:218 and
  lib.rs:212; "load-bearing not cosmetic" at mod.rs:84 and lib.rs:104; the four-properties list is
  summarized again in `Cargo.toml`. The lesson: state it **once** at the canonical home, make every
  other site a pointer. `denylist()`'s doc comment is the obvious home. *Why it matters: four copies
  are four things to update; the one someone edits becomes right while the others keep asserting the
  old thing with equal confidence — the drift shape this repo has already been bitten by.*

**MINOR**
- [`mod.rs`:235] `does_not_denylist_the_main_window` asserts `!deny.contains(&"main")` with a **bare
  literal**, while `denylist()` twelve lines above deliberately avoids re-spelling a label and the
  guard at :171 forbids string literals in `register()` for that reason.
  `tray/commands.rs:42` already holds a (private) `MAIN_WINDOW_LABEL`. Defensible — the plugin keys
  off the framework default — but the module argues the opposite principle in three other places.
- [`mod.rs`:171-175] The `!code.contains('"')` assertion is **broader than the property it names**.
  It also rejects `.with_filename("…")`, a legitimate builder option (plugin source :346) a future
  dev/prod-isolation change might want. *An over-broad guard that fires on a legitimate change is how
  guards get deleted rather than narrowed.*
- [`mod.rs`:102] `denylist() -> [&'static str; 1]` bakes the count into the signature, so a second
  excluded label is a type change rippling to both call sites. `&'static [&'static str]` would cost
  nothing. Not a correctness issue — `with_denylist` takes `&[&str]` either way.
- [`mod.rs`:132-141] The vacuity guard's doc comment restates the mutant-E narrative from the commit
  message. The ⚠️ what-to-do-when-this-fails paragraph earns its place; the history does not.

### Assessment
Well-built for what it is: a three-line integration whose entire risk lives in third-party code the
test suite cannot see, answered by reading that code, expressing the two decisions that are ours as
pure functions, and pinning them with an honestly-scoped source tripwire built to the repo's own
precedent rather than the anti-pattern its lesson warns about. Correctness judgment sound throughout
— omitting `FULLSCREEN`/`VISIBLE` both right, the denylist genuinely load-bearing, and declining to
hand-roll clamping or a `save_window_state` call are the correct resolutions of traps the WBS guessed
wrong. **The debt is entirely in prose, not code.** `register<R: Runtime>()` is the right seam —
parameterizing the flags would move policy back to the call site the module exists to keep it out of.
Nothing needs a refactor pass to be safe; the comment consolidation pairs naturally with the already-
open `SURFACE-2026-08-19-COMMENT-CONVENTION-PASS-T1-T2-DEFERRED`.

### If you disagree
Dismiss any finding by editing this section and marking the line `[DISMISSED]` before
`feature-finalize` archives this WIP.

## Retrospect

- **What changed in our understanding:** ⚠️ **Reading the dependency's source was the whole
  feature.** The WBS and backlog both framed this as "a dependency plus a `.plugin()` registration"
  with three named traps; reading `tauri-plugin-window-state` 2.4.1's 549 lines contradicted or
  sharpened **all four** of its load-bearing claims — and the single most important property (the
  disk write happens **only** on `RunEvent::Exit`, which our `prevent_close` quit path might have
  bypassed) **was not in either document at all**. The general lesson: for a third-party integration
  whose behavior the test suite cannot observe, the dependency's source is a primary document, not a
  fallback when the README is unclear.
- **Assumptions that held:** the plugin was the right tool (first-party, same Tauri v2 line, no new
  transitive deps — the lockfile grew by exactly one package); the PiP denylist was genuinely
  load-bearing rather than tidiness; `SIZE | POSITION | MAXIMIZED` with `FULLSCREEN` omitted matched
  what the operator actually asked for; and the pure-policy seam made the untestable surface testable.
- **Assumptions that were wrong:**
  1. ⚠️ **"Verify the off-screen clamping fires" — there is no clamping.** The mechanism is
     skip-if-no-monitor-intersects, and `set_size` applies *outside* that guard. Two traps therefore
     resolved toward *no code*: no hand-rolled clamp, and no `save_window_state` call in
     `perform_quit_teardown`. **Both plan fallbacks were written and neither was taken.**
  2. ⚠️ **`app_data_dir()` was the wrong accessor** in the backlog's trap 3 — the plugin uses
     `app_config_dir()`. The conclusion (dev/prod isolation holds) was right for the wrong reason,
     which is exactly the case that survives a careless read.
  3. **`read_logs{source:"console"}` captures nothing for this app.** It returned empty, which reads
     as "no JS errors." Only a deliberate positive control (emitting `console.error` and re-reading)
     exposed it as a dead instrument.
  4. ⚠️ **`osascript`/System Events cannot safely address the un-bundled dev binary** — and it fails
     *silently and misdirected*, resolving to the prod app instead. This one had a real cost: it quit
     the operator's live Claudesk. The existing memory's advice ("target by title or bundle id, not
     process name") does **not** cover this case, because the dev binary has neither.
- **Approach delta:** implementation matched the plan almost exactly — 7 tasks, one phase, no
  back-loop, no F22/F23/F26. Two deltas, both *subtractive*: the two fallback branches the plan
  pre-authorized were not needed. One addition at verify-codify: a **fifth test** (the vacuity guard),
  written because mutant E demonstrated that the four value tests all stay green if `register()`
  inlines its literals. The plan had anticipated the *need* for that guard but not that it would take
  four separately-proven assertions to close.
- **What the operator's pass caught that the agent's could not:** the agent proved size- and
  maximize-restore with a **synthetic IPC resize** and a **hand-seeded** `maximized: true`; neither
  exercises the `Moved`/`Resized` events the plugin actually saves from. The operator's real drag and
  real green-button click covered the input path, and their PiP summon upgraded the denylist claim
  from *"no key for a panel that never appeared"* to the strong form. **A live verification can be
  green and still not touch the mechanism under test.**

## Closure notice

> **Feature complete:** M13.5 WP1 — window size + position persistence has shipped. Claudesk's main
> window now remembers its size, position, and maximized state across launches, so a window closed
> maximized reopens maximized instead of reverting to the hardcoded 1280×800. To see it: resize or
> maximize the window, quit (⌘Q), and relaunch — the geometry comes back. State lives per-identity,
> so the dev build and an installed build never share geometry.

Requester = operator — closure notice for self-record.

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->

[SURFACED-2026-08-21] Phase 1 / verify-self method — **`osascript`/System Events cannot safely
address the dev build, and its failures are SILENT AND MISDIRECTED.** Two distinct misfires in one
session, both because the `cargo run` dev binary is not a bundled `.app`:
(a) `set frontmost of <proc whose unix id is DEV> to true` followed by `keystroke "q"` — the
activation did not take (no bundle id), and `keystroke` goes to whatever is *actually* frontmost, so
**the ⌘Q landed on the operator's live prod app and quit it**; (b) `first process whose unix id is
DEV` then enumerating `every window of` it **returned the PROD app's two windows** (titled
`Claudesk` / `Tauri App`, 1280×800) while claiming to be the dev PID — caught only because the MCP
bridge simultaneously reported 1111×733, i.e. **the instrument disagreement was the tell**; had I
trusted the enumeration I would have sent a zoom gesture to the operator's window.
⚠️ **The existing memory `[[verify-self-dev-vs-prod-process-name-collision]]` says "target by window
title/bundle id, not process name" — that advice is INSUFFICIENT here**, because the dev binary has
*no* bundle id and (early in launch) *no* windows visible to System Events, so title/bundle-id
targeting silently resolves to the prod app instead of failing. **The correct rule: drive the dev app
through the MCP bridge only** (`127.0.0.1:9223`, `#[cfg(debug_assertions)]`-gated, so it structurally
cannot reach a prod install); never use a global `keystroke` or a System Events window enumeration
when a same-named prod app is running. Logged to `backlog.md`.

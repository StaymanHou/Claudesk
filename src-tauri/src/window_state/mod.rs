//! Main-window geometry persistence (M13.5 WP1).
//!
//! The main window was hardcoded to 1280×800 on every launch (`tauri.conf.json` →
//! `app.windows[0]`, mirrored in the `tauri.dev.json` overlay) with nothing about its
//! geometry persisted, so the operator resized it on essentially every launch (their
//! display is 1920×1080, so the default occupies about a third of the screen). This
//! module owns the `tauri-plugin-window-state` registration policy: WHICH state we
//! persist and WHICH windows are in scope.
//!
//! ⚠️ **"Fullscreen" in the operator's ask means MAXIMIZED (the green-button/zoomed
//! state), NOT macOS native fullscreen** — clarified by screenshot 2026-08-05 (traffic
//! lights visible, system menu bar visible, window filling the display but not in its
//! own Space). So we persist `SIZE | POSITION | MAXIMIZED` and deliberately omit
//! `FULLSCREEN`: the two states restore through different APIs, and relaunching into a
//! separate Space is a more disorienting behavior than the one asked for.
//!
//! ## Why this is a module and not two inline builder lines
//!
//! Nearly all of the behavior lives in third-party code driven by real AppKit
//! windowing, so a unit test cannot observe it — and a `?raw` source-text guard over
//! `lib.rs` asserting the literal `with_denylist` string is the exact anti-pattern
//! `docs/lessons/source-text-guards.md` warns about (it is satisfied by the module's
//! own comments, and it proves the text exists rather than that the plugin is
//! registered with it). Instead [`state_flags`] and [`denylist`] are the values
//! `register()` itself passes to the plugin, so a test drives the real thing rather
//! than re-implementing it.
//!
//! ## Layout (pure-core / startup-shell split, mirrors `env_path` and the others)
//! - **[`state_flags`]** / **[`denylist`]** — pure policy: what to persist, what to
//!   exclude. Unit-testable with no app handle.
//! - **[`register`]** — the thin startup shell: build the configured plugin for
//!   `lib.rs`'s builder chain.
//!
//! ## ⚠️ Four properties of the plugin, read out of its source (2.4.1), that its
//! ## README and our own backlog entry got wrong or omitted
//!
//! 1. **It reads/writes `app_config_dir()`, NOT `app_data_dir()`.** The backlog entry
//!    (`SURFACE-2026-08-05-WINDOW-SIZE-AND-POSITION-NOT-PERSISTED`) says the state must
//!    live in the per-identity `app_data_dir()`. On macOS both resolve to
//!    `~/Library/Application Support/<identifier>/`, so the required dev/prod isolation
//!    (`com.claudesk.app` vs `com.claudesk.app.dev`, which run concurrently by design)
//!    holds anyway — but it holds for a different reason than the backlog states.
//! 2. **Off-screen safety is skip-if-no-monitor-intersects, NOT clamping.**
//!    `restore_state` calls `set_position` only inside
//!    `if m.intersects(position, size)`, looping `available_monitors()` with no `break`;
//!    `set_size` is applied unconditionally, OUTSIDE that guard. Net effect for a window
//!    saved on a since-disconnected monitor: it returns at its saved **size** at an
//!    **OS-chosen position** — visible, which is the property we need, but not what
//!    "clamping" implies.
//! 3. **The disk write happens ONLY on `RunEvent::Exit`.** The plugin's own
//!    `CloseRequested` handler updates just its in-memory cache. Claudesk's quit path is
//!    not an ordinary close — `on_window_event` holds it (`api.prevent_close()`), the
//!    frontend confirms, then `quit_now` → `perform_quit_teardown` → `app.exit(0)`.
//!    `app.exit(0)` does emit `RunEvent::Exit`, so the save lands; this was verified
//!    live at P1.3 rather than assumed, because the feature is worthless if it does not
//!    and `cargo test` cannot see it.
//! 4. **`on_window_ready` fires for the PiP NSPanel too**, so the denylist below is
//!    mandatory rather than cosmetic — see [`denylist`].

use tauri::{plugin::TauriPlugin, Runtime};
use tauri_plugin_window_state::{Builder, StateFlags};

/// The window state Claudesk persists for the main window.
///
/// `SIZE | POSITION | MAXIMIZED` — and deliberately NOT:
///
/// - **`FULLSCREEN`** — the operator's "launch fullscreen" ask means *maximized*, not
///   macOS native fullscreen (screenshot-clarified 2026-08-05). Persisting it would
///   relaunch the app into its own Space, which is a different and more disorienting
///   behavior than the one requested.
/// - **`VISIBLE`** — `restore_state` calls `show()` + `set_focus()` when this flag is
///   set. Those must never be aimed at the PiP NSPanel, which is deliberately
///   non-activating (`no_activate`, `PanelLevel::Floating`); the [`denylist`] already
///   excludes it, but omitting the flag means the show/focus path does not exist for
///   any window rather than merely being pointed away from that one.
/// - **`DECORATIONS`** — Claudesk never changes its window decorations at runtime, so
///   there is nothing to restore.
pub fn state_flags() -> StateFlags {
    StateFlags::SIZE | StateFlags::POSITION | StateFlags::MAXIMIZED
}

/// Window labels excluded from geometry persistence.
///
/// ⚠️ **The PiP NSPanel must be excluded, and this is load-bearing, not tidiness.**
/// The plugin's `on_window_ready` hook fires for EVERY window — including one created
/// at runtime, which PiP is (`PanelBuilder` with label
/// [`crate::pip::commands::PANEL_LABEL`], not a `tauri.conf.json` window). Left in
/// scope it would:
///
/// - fight PiP's own placement — M10.5 WP1's top-right anchor plus the in-session
///   `positioned` flag in `pip_resize` decide where the panel goes, and a generic
///   save/restore would overwrite that with stale coordinates;
/// - read the panel's geometry during `perform_quit_teardown`, which **closes** the
///   panel — an AppKit read racing a close is the use-after-free / main-thread hazard
///   class documented in `docs/lessons/pip-nspanel-main-thread.md` (off-main-thread
///   AppKit ops abort the process with a native exception and NO Rust panic, invisible
///   to `cargo test`).
///
/// The label is taken from the PiP module's own constant rather than re-spelled here,
/// so a rename cannot silently drop the panel back into scope.
pub fn denylist() -> [&'static str; 1] {
    [crate::pip::commands::PANEL_LABEL]
}

/// Build the configured `tauri-plugin-window-state` plugin for `lib.rs`'s builder chain.
///
/// Registered unconditionally (this is a shipping capability, unlike the dev-only MCP
/// bridge). The main window needs no allowlist entry: the plugin tracks every window
/// except those in [`denylist`], and `main` is the only other one.
pub fn register<R: Runtime>() -> TauriPlugin<R> {
    Builder::new()
        .with_state_flags(state_flags())
        .with_denylist(&denylist())
        .build()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// ⚠️ **The vacuity guard — the one regression the four value tests below CANNOT catch.**
    ///
    /// Every other test here asserts on [`state_flags`] / [`denylist`]. All four go green if
    /// `register()` stops *calling* them and inlines its own literals instead — the plugin would
    /// then be configured by text no test observes, and the suite would report full coverage of a
    /// policy that is no longer in effect. `TauriPlugin<R>` is an opaque handle with no getter for
    /// its flags or denylist, so there is no runtime seam to assert this through; a source-level
    /// tripwire is the only instrument available.
    ///
    /// Scoped to `register()`'s body ONLY, with comments stripped, per
    /// `docs/lessons/source-text-guards.md` — an unscoped `include_str!` search for
    /// `state_flags` would be satisfied by this module's own prose (the
    /// comment-satisfies-the-guard hole), and would pass exactly when the code was deleted.
    /// Asserts the CALL shape `fn(` rather than a bare identifier, for the same reason.
    /// Modelled on the existing precedent in `announce/mod.rs`.
    #[test]
    fn register_consumes_the_policy_fns_rather_than_inlining_literals() {
        let src = include_str!("mod.rs");
        let body = src
            .split("pub fn register<R: Runtime>() -> TauriPlugin<R> {")
            .nth(1)
            .expect("register() must exist with this signature");
        // Bound the slice at the function's close so neither the test module below nor any
        // later item can satisfy the assertions on production code's behalf.
        let body = &body[..body.find("\n}\n").expect("register() must terminate")];
        let code: String = body
            .lines()
            .filter(|l| !l.trim_start().starts_with("//"))
            .collect::<Vec<_>>()
            .join("\n");

        assert!(
            code.contains("state_flags()"),
            "register() must CALL state_flags() — if it inlines a StateFlags literal, all four \
             flag/denylist tests here become vacuous while still passing. Body was:\n{code}"
        );
        assert!(
            code.contains("denylist()"),
            "register() must CALL denylist() — see above; an inlined literal makes \
             denylists_the_pip_panel_by_its_own_constant vacuous. Body was:\n{code}"
        );
        // The inverse half: catch a literal being introduced ALONGSIDE the calls (e.g. a
        // second `.with_state_flags(StateFlags::…)` that wins), which the two asserts above
        // would not notice.
        assert!(
            !code.contains("StateFlags::"),
            "register() must not name StateFlags directly — the flag set belongs to \
             state_flags() alone, so there is exactly one home for it. Body was:\n{code}"
        );
        assert!(
            !code.contains('"'),
            "register() must not contain a string literal — window labels belong to denylist() \
             (which sources them from pip::commands::PANEL_LABEL). Body was:\n{code}"
        );
    }

    /// The operator's ask was MAXIMIZED, not macOS native fullscreen. If `FULLSCREEN`
    /// is ever added, the app relaunches into its own Space — a behavior change the
    /// screenshot clarification (2026-08-05) explicitly ruled out.
    #[test]
    fn persists_size_position_maximized_and_not_fullscreen() {
        let flags = state_flags();
        assert!(flags.contains(StateFlags::SIZE), "size must persist");
        assert!(
            flags.contains(StateFlags::POSITION),
            "position must persist"
        );
        assert!(
            flags.contains(StateFlags::MAXIMIZED),
            "maximized must persist — this IS the operator's 'launch fullscreen' ask"
        );
        assert!(
            !flags.contains(StateFlags::FULLSCREEN),
            "FULLSCREEN must NOT persist: the ask means maximized (green button), and \
             restoring true fullscreen relaunches into a separate Space"
        );
    }

    /// `restore_state` calls `show()` + `set_focus()` under `VISIBLE`. Keeping the flag
    /// off means that path does not exist for any window — belt to the denylist's
    /// braces, since the PiP panel is deliberately non-activating.
    #[test]
    fn does_not_persist_visible_or_decorations() {
        let flags = state_flags();
        assert!(
            !flags.contains(StateFlags::VISIBLE),
            "VISIBLE would make restore_state call show()/set_focus() — never aim that \
             at the non-activating PiP NSPanel"
        );
        assert!(
            !flags.contains(StateFlags::DECORATIONS),
            "Claudesk never changes decorations at runtime; nothing to restore"
        );
    }

    /// The plugin's `on_window_ready` fires for runtime-created windows too, so the PiP
    /// panel is in scope unless denylisted. A regression here would let generic
    /// save/restore fight M10.5 WP1's top-right anchor and read panel geometry during
    /// the teardown that closes it.
    #[test]
    fn denylists_the_pip_panel_by_its_own_constant() {
        let deny = denylist();
        assert!(
            deny.contains(&crate::pip::commands::PANEL_LABEL),
            "the PiP NSPanel must be excluded from geometry persistence"
        );
    }

    /// The main window must stay IN scope — a denylist that grew to cover it would make
    /// the whole feature a no-op while every other assertion above still passed.
    #[test]
    fn does_not_denylist_the_main_window() {
        let deny = denylist();
        assert!(
            !deny.contains(&"main"),
            "the main window is the whole point of this feature — it must be tracked"
        );
    }
}
